import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';

/** Reads the user AuthGuard already attached to the request -- every route
 * using this must also carry @UseGuards(AuthGuard) (or it'll be undefined,
 * since nothing else populates req.user). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest<Request & { user: User }>();
  return req.user;
});
