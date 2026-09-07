import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
// Per client *per endpoint*. 5 was shared across signup + login + resend
// together, so signing up and then logging in -- the completely normal
// path -- spent nearly the whole budget before the user had done anything
// wrong. This is still tight enough to make password guessing useless.
const MAX_REQUESTS_PER_WINDOW = 10;

const RATE_LIMIT_MAX = 'rate-limit-max';

/** Raises the ceiling for one endpoint. The default suits credential
 * endpoints, where ten attempts in fifteen minutes is already generous;
 * a read endpoint that merely happens to be expensive needs to survive
 * ordinary browsing, so it opts into a higher number rather than every
 * endpoint sharing the strictest one. */
export const RateLimit = (max: number) => SetMetadata(RATE_LIMIT_MAX, max);

/** The address to charge a request to.
 *
 * req.ip was wrong here, and silently so: Render fronts services with
 * Cloudflare, so requests arrive having crossed more than the single hop
 * `trust proxy: 1` accounts for. Express then resolved req.ip to an edge
 * address that varies request to request, giving nearly every request its
 * own fresh bucket -- 14 consecutive password-reset attempts went through
 * unblocked against production. The limiter looked present in code review
 * and did nothing at runtime, which is the worst way for a control like
 * this to fail.
 *
 * cf-connecting-ip first, because Cloudflare overwrites it on the way in:
 * a client cannot forge it. The leftmost X-Forwarded-For entry is the next
 * best thing but IS client-supplied and therefore spoofable, so it is only
 * a fallback for running somewhere without Cloudflare in front. */
function clientKey(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();

  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  if (first) return first;

  return req.ip ?? 'unknown';
}
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
  constructor(private readonly reflector: Reflector) {}

  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    this.sweepExpired(now);

    // Keyed per endpoint as well as per client, so a burst of signups
    // can't lock the same person out of logging in.
    const key = `${clientKey(req)}:${context.getHandler().name}`;

    const max = this.reflector.get<number>(RATE_LIMIT_MAX, context.getHandler()) ?? MAX_REQUESTS_PER_WINDOW;

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (bucket.count >= max) {
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
