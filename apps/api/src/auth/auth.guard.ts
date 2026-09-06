import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE_NAME } from './auth.constants.js';

// Not applied to any route yet -- sign-in is additive in this first pass
// (the feed stays fully public). Built now so future personalized
// endpoints (e.g. "save this post") have somewhere to plug in immediately,
// via @UseGuards(AuthGuard).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[SESSION_COOKIE_NAME];
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
