import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

interface Bucket {
  count: number;
  resetAt: number;
}

// Hand-rolled rather than @nestjs/throttler -- matches this codebase's own
// existing auth.guard.ts convention (a plain CanActivate), and avoids an
// unverified-compatibility dependency for something this simple. Scoped to
// AuthController only (@UseGuards at the class level there), not global --
// /feed and the cron-triggered /ingest must stay unaffected. In-memory is
// fine here: Render's free plan is a single instance, and losing this
// state on a redeploy just means abuse protection resets, not a security
// hole -- nothing here needs to survive restarts.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException('Too many attempts -- please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count++;
    return true;
  }
}
