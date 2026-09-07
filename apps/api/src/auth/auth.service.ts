import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { Prisma, type User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from './mail.service.js';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  RESET_TOKEN_EXPIRY_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from './auth.constants.js';

const BCRYPT_SALT_ROUNDS = 10;
// verifyIdToken fetches Google's public certs over the network the first
// time (or whenever its cache expires) -- google-auth-library doesn't
// expose a request timeout for that call, so a slow/unreachable network
// path to Google would otherwise hang this indefinitely, which is exactly
// what "I pick an account and the spinner just never stops" looks like.
// Racing it against a plain timeout guarantees this always settles.
const GOOGLE_VERIFY_TIMEOUT_MS = 10_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  /** Postgres's @unique on email is case-sensitive -- without normalizing
   * everywhere, "User@gmail.com" (password signup) and "user@gmail.com"
   * (a Google payload) would silently create two rows instead of the one
   * the account-linking logic below assumes. */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Verifies a Google Identity Services ID token against Google's public
   * keys and our own client ID (the "audience" check -- without it, a
   * valid ID token issued to a *different* app would also pass). Anything
   * wrong -- expired, tampered, wrong audience, malformed, or GOOGLE_CLIENT_ID
   * itself missing/misconfigured on this server -- is normalized to a clean
   * UnauthorizedException instead of letting google-auth-library's raw
   * error (e.g. "Wrong recipient, payload audience != requiredAudience")
   * bubble up as an uncaught 500. A 500 here used to fail *silently* on the
   * frontend (the loader just vanished with no message), which is exactly
   * what "I click the Google button and nothing happens" looks like. */
  async verifyGoogleToken(idToken: string): Promise<TokenPayload> {
    try {
      const ticket = await Promise.race([
        this.googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out contacting Google')), GOOGLE_VERIFY_TIMEOUT_MS),
        ),
      ]);
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Google token missing required claims');
      }
      return payload;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Logged (not swallowed silently) -- the client only ever sees the
      // generic message below, but this is what makes an actual
      // misconfiguration (wrong/missing GOOGLE_CLIENT_ID, network issue
      // reaching Google) visible in Render's logs instead of invisible.
      this.logger.error(`Google token verification failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Could not verify that Google sign-in. Please try again.');
    }
  }

  /** Looks up by googleId first, then by email -- the second lookup is
   * what lets someone who signed up with email/password first later use
   * "Sign in with Google" on the same address without colliding on the
   * email unique constraint: it links the existing row (setting googleId,
   * and emailVerified -- Google has already verified that address) rather
   * than trying to create a second one. Wrapped for the race where two
   * near-simultaneous requests (a double-click, or a signup-in-one-tab /
   * Google-in-another race) both miss every lookup and both attempt
   * create -- the loser hits Postgres's unique constraint (P2002) instead
   * of a clean create, so on that error we just re-fetch and return
   * whichever row won. */
  async findOrCreateUser(payload: TokenPayload): Promise<User> {
    const email = this.normalizeEmail(payload.email!);
    const existing =
      (await this.prisma.user.findUnique({ where: { googleId: payload.sub } })) ??
      (await this.prisma.user.findUnique({ where: { email } }));

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId: payload.sub,
          emailVerified: true,
          // Name/picture can change on Google's side between sign-ins --
          // keep our copy current rather than freezing it at first sign-up.
          name: payload.name ?? existing.name,
          picture: payload.picture ?? existing.picture,
        },
      });
    }

    try {
      return await this.prisma.user.create({
        data: {
          googleId: payload.sub,
          email,
          emailVerified: true,
          name: payload.name ?? email,
          picture: payload.picture ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.user.findFirst({
          where: { OR: [{ googleId: payload.sub }, { email }] },
        });
        if (winner) return winner;
      }
      throw err;
    }
  }

  async signup(name: string, rawEmail: string, password: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail);
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      throw new BadRequestException('An account with this email already exists -- log in instead.');
    }
    if (existing && !existing.passwordHash) {
      throw new BadRequestException('This email is linked to a Google account -- sign in with Google instead.');
    }

    const passwordHash = await this.hashPassword(password);
    const { token, expiresAt } = this.generateVerificationToken();

    try {
      await this.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          emailVerified: false,
          verificationToken: token,
          verificationTokenExpiresAt: expiresAt,
        },
      });
    } catch (err) {
      // Same TOCTOU gap as findOrCreateUser's create -- another request
      // for the same email won the race between the check above and here.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('An account with this email already exists -- log in instead.');
      }
      throw err;
    }

    // Deliberately not awaited: an SMTP round-trip can take several
    // seconds (or 15-20+ on a slow handshake/auth failure) and the client
    // doesn't need to wait for it -- "check your email" is true the moment
    // the send is *initiated*, not when it completes. sendVerificationEmailSafely
    // already catches and logs its own errors, so nothing here needs a
    // .catch() to avoid an unhandled rejection.
    const verifyUrl = `${process.env.WEB_APP_URL}/auth/verify?token=${token}`;
    void this.mail.sendVerificationEmailSafely(email, name, verifyUrl);
  }

  async login(rawEmail: string, password: string): Promise<User> {
    const email = this.normalizeEmail(rawEmail);
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same generic message whether the account doesn't exist or it's a
    // Google-only account with no password -- don't reveal which.
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const valid = await this.comparePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Safe to be specific here -- the password already proved it's them,
    // so this doesn't leak anything, and it tells a legitimate user
    // exactly what to do next.
    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in.');
    }

    return user;
  }

  /** Always resolves the same way regardless of outcome (account missing,
   * already verified, or the mail send itself failing) -- the entire
   * point is resistance to using this endpoint to enumerate registered
   * emails, and a differently-shaped response on any one of those paths
   * would defeat that. Issues a fresh token (not an extension of the old
   * one) so stale links floating around stop working. */
  async resendVerification(rawEmail: string): Promise<void> {
    try {
      const email = this.normalizeEmail(rawEmail);
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user || user.emailVerified) return;

      const { token, expiresAt } = this.generateVerificationToken();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { verificationToken: token, verificationTokenExpiresAt: expiresAt },
      });

      // Not awaited -- same reasoning as signup(): the response doesn't
      // need to wait out a slow SMTP round-trip.
      const verifyUrl = `${process.env.WEB_APP_URL}/auth/verify?token=${token}`;
      void this.mail.sendVerificationEmailSafely(email, user.name, verifyUrl);
    } catch {
      // Swallowed deliberately -- see the doc comment above.
    }
  }

  /** Always resolves the same way whether or not the address exists, for
   * the same anti-enumeration reason as resendVerification. A Google-only
   * account (no passwordHash) is also a no-op: there's no password to
   * reset, and saying so would confirm the address exists. */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    try {
      const email = this.normalizeEmail(rawEmail);
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return;

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiresAt: expiresAt },
      });

      // Not awaited -- same reasoning as signup(): the response shouldn't
      // wait out an SMTP round-trip.
      const resetUrl = `${process.env.WEB_APP_URL}/reset-password?token=${token}`;
      void this.mail.sendPasswordResetEmailSafely(email, user.name, resetUrl);
    } catch {
      // Swallowed deliberately -- see the doc comment above.
    }
  }

  /** Consumes the token: a successful reset clears it, so a reset link
   * can't be replayed. Also clears any pending verification token and
   * marks the address verified -- receiving the email proves control of
   * the inbox, which is the same thing verification checks. */
  async resetPassword(token: string, password: string): Promise<User> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (!token) {
      throw new BadRequestException('That reset link is invalid. Request a new one.');
    }

    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException('That reset link has expired or was already used. Request a new one.');
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.hashPassword(password),
        resetToken: null,
        resetTokenExpiresAt: null,
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });
  }

  /** Returns null on a missing/expired token rather than throwing -- the
   * controller redirects to an error state either way, this isn't an
   * exceptional condition worth a stack trace. */
  async verifyEmailToken(token: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user || !user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      return null;
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
    });
  }

  /** Called from the forced "complete your profile" step after a Google
   * sign-in that hasn't set a password yet (see toPublicUser's needsPassword
   * flag) -- gives that account a password so it can also log in the normal
   * way later, without touching Google. Also lets them adjust the name
   * Google supplied, in the same step. Deliberately doesn't require the old
   * password (there isn't one yet) -- the session cookie already proves
   * who they are, same trust level AuthGuard grants everywhere else. */
  async setPassword(userId: string, name: string, password: string): Promise<User> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const passwordHash = await this.hashPassword(password);
    const trimmedName = name?.trim();

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        ...(trimmedName ? { name: trimmedName } : {}),
      },
    });
  }

  private async hashPassword(password: string): Promise<string> {
    const capped = Buffer.from(password, 'utf8').subarray(0, MAX_PASSWORD_BYTES).toString('utf8');
    return bcrypt.hash(capped, BCRYPT_SALT_ROUNDS);
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    const capped = Buffer.from(password, 'utf8').subarray(0, MAX_PASSWORD_BYTES).toString('utf8');
    return bcrypt.compare(capped, hash);
  }

  private generateVerificationToken(): { token: string; expiresAt: Date } {
    return {
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
    };
  }

  issueSessionToken(user: User): string {
    return this.jwt.sign({ sub: user.id });
  }

  /** Throws (via JwtService) on an expired/tampered/missing-secret token --
   * callers (the guard, GET /auth/me) are expected to catch this and
   * respond 401 rather than letting it surface as a 500. */
  async verifySessionToken(token: string): Promise<{ sub: string }> {
    return this.jwt.verifyAsync(token);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
