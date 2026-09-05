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

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);
  private readonly parser = new Parser();

  async fetchOne(source: FeedSource): Promise<RawFeedItem[]> {
    try {
      const feed = await this.parser.parseURL(source.url);
      return feed.items
        .filter((item) => !!item.link)
        .map((item) => ({
          source: source.name,
          sourceTier: source.tier,
          title: item.title ?? '',
          url: item.link!,
          publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
        }));
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
