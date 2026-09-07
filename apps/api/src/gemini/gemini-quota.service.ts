import { Injectable, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

/** Gemini's free tier caps requests per day as well as per minute. Nothing
 * was tracking the daily side: ingestion alone could spend up to 20 calls
 * every 30 minutes (~960/day) before a single "Read more" was clicked, and
 * once the allowance ran out every call would simply start failing.
 *
 * These are deliberately below the real free-tier ceiling, so the app stops
 * itself with headroom rather than discovering the limit by hitting it. */
const DAILY_LIMIT = 800;
/** Ingestion stops here, leaving the difference reserved for "Read more".
 * A background job filling the feed must never be the reason a person
 * tapping a button gets an error -- user-facing features degrade last. */
const INGESTION_LIMIT = 600;

export type QuotaKind = 'ingestion' | 'user';

@Injectable()
export class GeminiQuotaService {
  private readonly logger = new Logger(GeminiQuotaService.name);
  private readonly redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  });

  /** UTC day, matching how Google resets the quota. */
  private key(): string {
    return `gemini:calls:${new Date().toISOString().slice(0, 10)}`;
  }

  /** Reserves one call, returning false when this kind has hit its ceiling.
   * Counts first and compares after, so two concurrent callers can't both
   * be told yes for the same last slot. */
  async tryConsume(kind: QuotaKind): Promise<boolean> {
    const limit = kind === 'ingestion' ? INGESTION_LIMIT : DAILY_LIMIT;
    try {
      const key = this.key();
      const used = await this.redis.incr(key);
      // Set on first use of the day; 48h so it cleans itself up.
      if (used === 1) await this.redis.expire(key, 60 * 60 * 48);

      if (used > limit) {
        this.logger.warn(`Gemini daily budget reached for "${kind}" (${used - 1}/${limit}) -- skipping`);
        return false;
      }
      return true;
    } catch (err) {
      // Redis being unreachable shouldn't take the app down with it. Fail
      // open: the per-minute pacing and per-run caps still apply, so the
      // worst case is a day that runs closer to the real ceiling.
      this.logger.warn(`Quota check failed, allowing call: ${(err as Error).message}`);
      return true;
    }
  }

  /** How much of today's allowance is gone -- surfaced by /health/config
   * so it can be checked without reading logs. */
  async used(): Promise<number> {
    try {
      return Number((await this.redis.get<number>(this.key())) ?? 0);
    } catch {
      return -1;
    }
  }

  get limits() {
    return { daily: DAILY_LIMIT, ingestion: INGESTION_LIMIT };
  }
}
