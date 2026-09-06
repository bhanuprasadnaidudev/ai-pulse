import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Verifies a Google Identity Services ID token against Google's public
   * keys and our own client ID (the "audience" check -- without it, a
   * valid ID token issued to a *different* app would also pass). Throws on
   * anything wrong: expired, tampered, wrong audience, malformed. */
  async verifyGoogleToken(idToken: string): Promise<TokenPayload> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google token missing required claims');
    }
    return payload;
  }

  async findOrCreateUser(payload: TokenPayload): Promise<User> {
    return this.prisma.user.upsert({
      where: { googleId: payload.sub },
      update: {
        // Name/picture can change on Google's side between sign-ins --
        // keep our copy current rather than freezing it at first sign-up.
        email: payload.email!,
        name: payload.name ?? payload.email!,
        picture: payload.picture ?? null,
      },
      create: {
        googleId: payload.sub,
        email: payload.email!,
        name: payload.name ?? payload.email!,
        picture: payload.picture ?? null,
      },
    });
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
