import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RssService, type RawFeedItem } from '../rss.service.js';
import { DedupeService } from '../dedupe.service.js';
import { SummarizeService } from '../summarize.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FeedSource } from '../sources.js';

const logger = new Logger('SourceAgent');

// Gemini's free-tier gemini-3.5-flash-lite quota is 15 requests/minute,
// shared across every source agent in a run (it's one API key, not one
// quota per source) -- keep the per-source cap small enough that even all
// sources combined stay comfortably under that ceiling in one run.
const MAX_ITEMS_PER_SOURCE_PER_RUN = 3;
const DELAY_BETWEEN_SUMMARIES_MS = 4500;
const DEFAULT_MAX_ITEM_AGE_DAYS = 7;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SourceAgentState = Annotation.Root({
  items: Annotation<RawFeedItem[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  processed: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
});

export interface SourceAgentOptions {
  /** Widen the recency window for a one-time deeper backfill (default 7 days). */
  maxItemAgeDays?: number;
  /** Override the per-run item cap (default 3). */
  maxItemsPerRun?: number;
}

/** One independently invocable ingestion agent, scoped to a single source. */
export function buildSourceAgentGraph(
  source: FeedSource,
  rss: RssService,
  dedupe: DedupeService,
  summarize: SummarizeService,
  prisma: PrismaService,
  options: SourceAgentOptions = {},
) {
  const maxItemAgeDays = options.maxItemAgeDays ?? DEFAULT_MAX_ITEM_AGE_DAYS;
  const maxItemsPerRun = options.maxItemsPerRun ?? MAX_ITEMS_PER_SOURCE_PER_RUN;

  return new StateGraph(SourceAgentState)
    .addNode('fetch', async () => {
      const items = await rss.fetchOne(source);
      return { items };
    })
    .addNode('process', async (state) => {
      let processed = 0;

      const cutoff = Date.now() - maxItemAgeDays * 24 * 60 * 60 * 1000;
      const candidates = state.items
        .filter((item) => item.publishedAt.getTime() >= cutoff)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

      for (const item of candidates) {
        if (processed >= maxItemsPerRun) break;
        if (await dedupe.has(item.url)) continue;

        try {
          const { summary, isMajor } = await summarize.summarizeAndClassify(item.title, item.sourceTier);

          await prisma.post.create({
            data: {
              source: item.source,
              sourceTier: item.sourceTier,
              title: item.title,
              url: item.url,
              publishedAt: item.publishedAt,
              isMajor,
              summary,
            },
          });

          await dedupe.markSeen(item.url);
          processed++;

          if (processed < maxItemsPerRun) {
            await sleep(DELAY_BETWEEN_SUMMARIES_MS);
          }
        } catch (err) {
          // Already stored in a previous run but the Redis "seen" key expired
          // or was never set -- treat as already-processed rather than
          // retrying forever.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            await dedupe.markSeen(item.url);
            continue;
          }
          // Anything else (rate limit, network blip) -- leave it unclaimed
          // so the next scheduled run retries this exact item.
          logger.warn(`[${source.name}] Failed "${item.title}" (${item.url}): ${(err as Error).message}`);
        }
      }

      return { processed };
    })
    .addEdge('__start__', 'fetch')
    .addEdge('fetch', 'process')
    .addEdge('process', END)
    .compile();
}
