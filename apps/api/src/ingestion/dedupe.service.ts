import { Injectable } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class DedupeService {
  private readonly redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  });

  private key(url: string) {
    return `seen:${url}`;
  }

  /** Non-claiming check — safe to call before deciding whether to process an item. */
  async has(url: string): Promise<boolean> {
    return (await this.redis.get(this.key(url))) !== null;
  }

  /** Claim a URL as processed. Call only after it's actually been stored — a failed
   * summarize/store should leave the item unclaimed so the next run retries it. */
  async markSeen(url: string): Promise<void> {
    await this.redis.set(this.key(url), '1', { ex: 60 * 60 * 24 * 30 });
  }
}
