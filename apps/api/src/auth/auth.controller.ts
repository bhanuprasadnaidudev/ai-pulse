import { BadRequestException, Body, Controller, Get, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { extractSessionToken } from './session-token.util.js';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from './auth.constants.js';

// Cross-domain by necessity: the API and the web app are two separate
// Render services on unrelated onrender.com subdomains (that domain is on
// the public suffix list, so this is genuinely cross-site, not same-site).
// SameSite: 'none' is required for the cookie to be sent at all;
// httpOnly keeps it out of reach of any injected script. The web app also
// proxies /auth/* through its own domain (see the Render static site's
// rewrite rules) so the cookie looks first-party to browsers -- Safari and
// every iOS browser otherwise block third-party cookies outright.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  maxAge: SESSION_MAX_AGE_MS,
};

function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    // True only for a Google-only account that has never set a password --
    // password-based accounts always have one by definition, so this is
    // effectively "signed in with Google and hasn't completed setup yet".
    // The frontend redirects to /complete-profile until this clears.
    needsPassword: !user.passwordHash,
  };
}

// Rate limiting is applied per-method below, not at the class level -- an
// earlier version of this put @UseGuards(RateLimitGuard) on the whole
// controller, which meant GET /auth/me (called automatically on every
// single page load, completely benign and read-only) counted against the
// same small budget as signup/login attempts. A real user just opening
// the app a handful of times would get themselves locked out. Only the
// three genuinely abuse-prone endpoints -- account creation, password
// guessing, and resend-triggered emails -- actually need it.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  async signInWithGoogle(@Body('credential') credential: string, @Res({ passthrough: true }) res: Response) {
    const payload = await this.auth.verifyGoogleToken(credential);
    const user = await this.auth.findOrCreateUser(payload);
    const token = this.auth.issueSessionToken(user);

    res.cookie(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
    // The token also comes back in the body so the web app can hold it and
    // send it as a Bearer header -- the cookie is genuinely third-party in
    // production and gets dropped by Safari/iOS outright. See
    // session-token.util.ts.
    return { user: toPublicUser(user), token };
  }

  @Post('signup')
  @UseGuards(RateLimitGuard)
  async signup(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('confirmPassword') confirmPassword: string,
  ) {
    // Request-shape validation lives here; AuthService.signup throws its
    // own BadRequestException for the domain checks (password length,
    // email already taken) -- both propagate naturally as proper 400s,
    // same convention as every other controller in this API
    // (feed.controller.ts, ingestion.controller.ts).
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }
    await this.auth.signup(name, email, password);
    return { message: 'Check your email to verify your account.' };
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.login(email, password);
    const token = this.auth.issueSessionToken(user);

    res.cookie(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
    return { user: toPublicUser(user), token };
  }

  /** A real browser navigation from a clicked email link, not an XHR --
   * responds with a redirect, not JSON. Plain @Res(), never
   * { passthrough: true }: mixing passthrough with a manual res.redirect()
   * throws ERR_HTTP_HEADERS_SENT when Nest also tries to serialize a
   * return value onto an already-finished response, so nothing here is
   * ever `return`ed. */
  @Get('verify')
  async verify(@Query('token') token: string, @Res() res: Response) {
    const user = await this.auth.verifyEmailToken(token);
    if (!user) {
      res.redirect(302, `${process.env.WEB_APP_URL}/login?error=expired`);
      return;
    }

    const sessionToken = this.auth.issueSessionToken(user);
    res.cookie(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS);
    res.redirect(302, `${process.env.WEB_APP_URL}/?verified=1`);
  }

  /** Always the same response whether or not the account exists -- see
   * AuthService.requestPasswordReset. Rate limited: it triggers an email. */
  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  async forgotPassword(@Body('email') email: string) {
    await this.auth.requestPasswordReset(email);
    return { message: 'If an account exists for that email, a reset link is on its way.' };
  }

  /** Signs the user in on success: they've just proven control of the
   * inbox and set the password, so making them immediately type it again
   * adds nothing. */
  @Post('reset-password')
  @UseGuards(RateLimitGuard)
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
    @Body('confirmPassword') confirmPassword: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }
    const user = await this.auth.resetPassword(token, password);
    const sessionToken = this.auth.issueSessionToken(user);

    res.cookie(SESSION_COOKIE_NAME, sessionToken, COOKIE_OPTIONS);
    return { user: toPublicUser(user), token: sessionToken };
  }

  @Post('resend-verification')
  @UseGuards(RateLimitGuard)
  async resendVerification(@Body('email') email: string) {
    await this.auth.resendVerification(email);
    // Always the same response regardless of whether the account exists,
    // is already verified, or the email failed to send -- see
    // AuthService.resendVerification's own doc comment.
    return { message: 'If that account exists, a new verification email is on its way.' };
  }

  /** The forced "complete your profile" step after a first Google sign-in
   * (see toPublicUser's needsPassword) -- confirms/edits the name Google
   * supplied and sets a password, so the account can also log in the
   * normal way afterward. Authenticated via the existing session cookie,
   * not rate-limited: it requires a valid session already, unlike
   * signup/login/resend which anyone can hit with guesses. */
  @Post('set-password')
  @UseGuards(AuthGuard)
  async setPassword(
    @CurrentUser() user: User,
    @Body('name') name: string,
    @Body('password') password: string,
    @Body('confirmPassword') confirmPassword: string,
  ) {
    if (password !== confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }
    const updated = await this.auth.setPassword(user.id, name, password);
    return { user: toPublicUser(updated) };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException();

    try {
      const { sub } = await this.auth.verifySessionToken(token);
      const user = await this.auth.getUserById(sub);
      if (!user) throw new UnauthorizedException();
      return { user: toPublicUser(user) };
    } catch {
      // Expired, tampered, or the secret rotated -- treat identically to
      // "not logged in" rather than a 500.
      throw new UnauthorizedException();
    }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
    return { ok: true };
  }
}
