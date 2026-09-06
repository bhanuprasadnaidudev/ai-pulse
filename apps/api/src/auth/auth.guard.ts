import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { extractSessionToken } from './session-token.util.js';

// Protects everything under /saved. Accepts the session as either the
// cookie or an Authorization: Bearer header -- see session-token.util.ts
// for why the cookie alone isn't sufficient in production.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException();

    try {
      const { sub } = await this.auth.verifySessionToken(token);
      const user = await this.auth.getUserById(sub);
      if (!user) throw new UnauthorizedException();
      (req as Request & { user: typeof user }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
