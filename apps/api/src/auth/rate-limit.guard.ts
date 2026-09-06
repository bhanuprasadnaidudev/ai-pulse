import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
// Per client *per endpoint*. 5 was shared across signup + login + resend
// together, so signing up and then logging in -- the completely normal
// path -- spent nearly the whole budget before the user had done anything
// wrong. This is still tight enough to make password guessing useless.
const MAX_REQUESTS_PER_WINDOW = 10;

interface Bucket {
  count: number;
  resetAt: number;
}

// Hand-rolled rather than @nestjs/throttler -- matches this codebase's own
// existing auth.guard.ts convention (a plain CanActivate), and avoids an
// unverified-compatibility dependency for something this simple. Applied
// per-method on AuthController's three abuse-prone endpoints, not globally
// -- /feed and the cron-triggered /ingest must stay unaffected. In-memory
// is fine here: Render's free plan is a single instance, and losing this
// state on a redeploy just means abuse protection resets, not a security
// hole -- nothing here needs to survive restarts.
//
// Depends on `trust proxy` being set (see main.ts): without it req.ip is
// the proxy's address in production and every visitor lands in the same
// bucket.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    this.sweepExpired(now);

    // Keyed per endpoint as well as per client, so a burst of signups
    // can't lock the same person out of logging in.
    const key = `${req.ip ?? 'unknown'}:${context.getHandler().name}`;

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

  /** Now that keys are per real client IP rather than one shared proxy
   * address, this map would otherwise grow forever -- one dead entry per
   * visitor, never reclaimed. Swept at most once per window, so the cost
   * stays negligible. */
  private sweepExpired(now: number) {
    if (now - this.lastSweep < WINDOW_MS) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
