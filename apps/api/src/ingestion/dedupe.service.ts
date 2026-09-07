import { Injectable } from '@nestjs/common';
import { Redis } from '@upstash/redis';

/** Words that carry no signal when comparing two headlines about the same
 * event -- without stripping these, "OpenAI launches a new model" and
 * "Apple launches a new laptop" score as far more similar than they are. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'you', 'your',
  'we', 'our', 'they', 'their', 'how', 'why', 'what', 'when', 'new', 'now', 'says', 'said', 'will',
  'can', 'could', 'would', 'has', 'have', 'had', 'more', 'most', 'about', 'after', 'over', 'into',
]);

/** Above this share of shared significant words, two headlines are treated
 * as the same story. Tuned by hand: 0.5 merged genuinely distinct stories
 * that shared a company name and a verb; 0.8 let obvious rewrites of the
 * same headline through. */
const SIMILARITY_THRESHOLD = 0.65;

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

  /** The significant words of a headline, lowercased and de-punctuated.
   * Exported behaviour, not just an internal detail: this is what makes
   * "OpenAI unveils GPT-6" and "OpenAI Unveils GPT-6 | Reuters" collapse
   * to the same set. */
  significantWords(title: string): Set<string> {
    return new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    );
  }

  /** Jaccard overlap of significant words: shared / combined. */
  private similarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    return shared / (a.size + b.size - shared);
  }

  /** True when `title` tells the same story as something already in
   * `recentTitles`.
   *
   * URL dedupe alone isn't enough now that the feed pulls from news
   * aggregators as well as company blogs: one launch gets covered by a
   * dozen outlets, each at its own URL, and the timeline would show the
   * same story a dozen times over. This is also a real cost saving --
   * a skipped duplicate is a summarisation request not spent against the
   * free-tier quota. */
  isDuplicateStory(title: string, recentTitles: string[]): boolean {
    const words = this.significantWords(title);
    if (words.size < 3) return false; // too short to compare meaningfully

    return recentTitles.some((recent) => this.similarity(words, this.significantWords(recent)) >= SIMILARITY_THRESHOLD);
  }
}
