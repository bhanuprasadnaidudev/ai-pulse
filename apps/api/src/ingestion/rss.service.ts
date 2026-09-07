import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { FEED_SOURCES, type FeedSource } from './sources.js';

export interface RawFeedItem {
  source: string;
  sourceTier: 1 | 2;
  title: string;
  url: string;
  publishedAt: Date;
}

/** Several publishers reject requests without a plausible User-Agent
 * (rss-parser's default gets 403s from a few), and a contact URL is the
 * polite convention for a bot that fetches on a schedule. */
const USER_AGENT = 'Mozilla/5.0 (compatible; CurrentBot/1.0; +https://current-3wkv.onrender.com)';

const DEFAULT_MAX_PER_RUN = 10;
/** Below this, whatever came back isn't a usable headline -- aggregators
 * occasionally emit an item that is nothing but a publisher suffix, which
 * previously reached the database as a post titled " - Anthropic". */
const MIN_TITLE_WORDS = 3;

/** Common subdomains and TLD-ish parts to drop when a "publisher" arrives
 * as a bare hostname (Google News gives a display name for most outlets but
 * falls back to the domain for others -- "hr.economictimes.indiatimes.com"
 * is not something to show a reader). */
const HOST_NOISE = new Set([
  'www', 'm', 'news', 'hr', 'finance', 'tech', 'blog', 'amp', 'en', 'edition',
  'com', 'co', 'org', 'net', 'io', 'ai', 'in', 'uk', 'us', 'au', 'ca', 'kr', 'jp', 'cn', 'de', 'fr',
]);

/** Press-release wires. Google News indexes them, and their output is
 * promotional copy dressed as news -- a company announcing its own
 * "proprietary AI technology" is not coverage. Matched on the publisher,
 * since the headlines themselves are written to look legitimate. */
const PRESS_RELEASE_WIRES = [
  'pr newswire', 'prnewswire', 'globenewswire', 'businesswire', 'business wire',
  'ein presswire', 'einpresswire', 'openpr', 'accesswire', 'newsfile', 'digital journal',
  'prweb', 'issuewire', 'abnewswire',
];

function isPressRelease(publisher: string): boolean {
  const p = publisher.toLowerCase();
  return PRESS_RELEASE_WIRES.some((wire) => p.includes(wire));
}

/** Turns a hostname into something presentable, and leaves real display
 * names untouched. "chosun.com" -> "Chosun", "finance.biggo.com" -> "Biggo". */
function prettifyPublisher(publisher: string): string {
  const looksLikeHost = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(publisher) && !publisher.includes(' ');
  if (!looksLikeHost) return publisher;

  const parts = publisher.toLowerCase().split('.').filter((p) => p && !HOST_NOISE.has(p));
  const name = parts.sort((a, b) => b.length - a.length)[0] ?? publisher;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Headlines that are mostly non-Latin script. The aggregate queries are
 * scoped to English editions, but regional Google News editions still
 * surface Korean/Chinese/Japanese outlets, and an untranslated headline is
 * noise in an English feed rather than coverage. */
function isMostlyNonLatin(title: string): boolean {
  const letters = title.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return false;
  const latin = (letters.match(/\p{Script=Latin}/gu) || []).length;
  return latin / letters.length < 0.5;
}

/** Google News titles arrive as "Headline - Publisher". Splits on the last
 * " - " so headlines containing their own dashes survive intact. Returns
 * the original title and no publisher when the pattern doesn't hold. */
function splitGoogleNewsTitle(raw: string): { title: string; publisher?: string } {
  const idx = raw.lastIndexOf(' - ');
  if (idx === -1) return { title: raw };

  const title = raw.slice(0, idx).trim();
  const publisher = raw.slice(idx + 3).trim();

  // A "publisher" that's long or sentence-like is almost certainly just
  // part of the headline, not a source credit.
  if (!title || !publisher || publisher.length > 40 || publisher.split(/\s+/).length > 5) {
    return { title: raw };
  }
  return { title, publisher };
}

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);
  private readonly parser = new Parser({
    timeout: 20000,
    headers: { 'User-Agent': USER_AGENT },
  });

  async fetchOne(source: FeedSource): Promise<RawFeedItem[]> {
    try {
      const feed = await this.parser.parseURL(source.url);

      const items = feed.items
        .filter((item) => !!item.link)
        .filter((item) => !source.topicFilter || source.topicFilter.test(item.title ?? ''))
        .map((item) => {
          const raw = item.title ?? '';
          const shouldSplit = source.deriveSourceFromTitle || source.stripPublisherSuffix;
          const { title, publisher } = shouldSplit ? splitGoogleNewsTitle(raw) : { title: raw, publisher: undefined };

          // A publisher name in another script belongs to an outlet writing
          // for another audience; keep the story (its headline is English)
          // but label it with the feed's own name rather than showing a
          // masthead most readers here can't place.
          const credited =
            publisher && !isMostlyNonLatin(publisher) ? prettifyPublisher(publisher) : source.name;

          return {
            // Credit the actual publisher for aggregator items, so the feed
            // shows "Reuters" rather than a wall of identical source labels.
            // Single-org queries keep their configured name instead.
            source: source.deriveSourceFromTitle ? credited : source.name,
            publisher,
            sourceTier: source.tier,
            title,
            url: item.link!,
            publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
          };
        })
        .filter((item) => item.title.trim().split(/\s+/).length >= MIN_TITLE_WORDS)
        .filter((item) => !isMostlyNonLatin(item.title))
        .filter((item) => !item.publisher || !isPressRelease(item.publisher))
        .map(({ publisher: _publisher, ...item }) => item)
        // Newest first, then capped -- the aggregate feeds return 100 items
        // and we only ever want the freshest handful from each.
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, source.maxPerRun ?? DEFAULT_MAX_PER_RUN);

      return items;
    } catch (err) {
      // One dead feed should never break the whole run.
      this.logger.warn(`Feed failed: ${source.name} — ${(err as Error).message}`);
      return [];
    }
  }

  async fetchAll(): Promise<RawFeedItem[]> {
    const results: RawFeedItem[] = [];
    for (const source of FEED_SOURCES) {
      results.push(...(await this.fetchOne(source)));
    }
    return results;
  }
}
