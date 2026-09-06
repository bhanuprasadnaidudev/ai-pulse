import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  async signInWithGoogle(@Body('credential') credential: string, @Res({ passthrough: true }) res: Response) {
    const payload = await this.auth.verifyGoogleToken(credential);
    const user = await this.auth.findOrCreateUser(payload);
    const token = this.auth.issueSessionToken(user);

    res.cookie(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
    return { user: { id: user.id, name: user.name, email: user.email, picture: user.picture } };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) throw new UnauthorizedException();

    try {
      const { sub } = await this.auth.verifySessionToken(token);
      const user = await this.auth.getUserById(sub);
      if (!user) throw new UnauthorizedException();
      return { user: { id: user.id, name: user.name, email: user.email, picture: user.picture } };
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
