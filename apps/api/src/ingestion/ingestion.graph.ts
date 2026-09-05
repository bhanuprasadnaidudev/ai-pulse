import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RssService, type RawFeedItem } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { classifyMajor } from './classify.js';
import { SummarizeService } from './summarize.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const logger = new Logger('IngestionGraph');

// Gemini's free-tier gemini-3.5-flash-lite quota is 15 requests/minute.
// Cap how many new items get summarized per run and space the calls out so a
// backlog (e.g. the very first run) drains over a few cron ticks instead of
// blowing the whole request up with a 429. Anything left over stays
// unclaimed in Redis and is simply picked up on the next run.
const MAX_ITEMS_PER_RUN = 8;
const DELAY_BETWEEN_SUMMARIES_MS = 4500;

// Some feeds (e.g. OpenAI's) return their entire multi-year history, not
// just recent posts. Without a recency cutoff, a fixed-order, oldest-first
// backlog from one source would starve every other source for days. Only
// consider items from the last week, and always process the newest across
// *all* sources first — not source by source.
const MAX_ITEM_AGE_DAYS = 7;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IngestState = Annotation.Root({
  items: Annotation<RawFeedItem[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  processed: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
});

export function buildIngestionGraph(
  rss: RssService,
  dedupe: DedupeService,
  summarize: SummarizeService,
  prisma: PrismaService,
) {
  return new StateGraph(IngestState)
    .addNode('fetch', async () => {
      const items = await rss.fetchAll();
      return { items };
    })
    .addNode('process', async (state) => {
      let processed = 0;

      const cutoff = Date.now() - MAX_ITEM_AGE_DAYS * 24 * 60 * 60 * 1000;
      const candidates = state.items
        .filter((item) => item.publishedAt.getTime() >= cutoff)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

      for (const item of candidates) {
        if (processed >= MAX_ITEMS_PER_RUN) break;
        if (await dedupe.has(item.url)) continue;

        try {
          const isMajor = classifyMajor(item.title, item.sourceTier);
          const summary = await summarize.summarize(item.title);

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

          if (processed < MAX_ITEMS_PER_RUN) {
            await sleep(DELAY_BETWEEN_SUMMARIES_MS);
          }
        } catch (err) {
          // Already stored in a previous run but the Redis "seen" key expired
          // or was never set (e.g. a prior run crashed after the DB write) —
          // treat as already-processed rather than retrying forever.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            await dedupe.markSeen(item.url);
            continue;
          }
          // Anything else (rate limit, network blip) — leave it unclaimed so
          // the next scheduled run retries this exact item.
          logger.warn(`Failed to process "${item.title}" (${item.url}): ${(err as Error).message}`);
        }
      }

      return { processed };
    })
    .addEdge('__start__', 'fetch')
    .addEdge('fetch', 'process')
    .addEdge('process', END)
    .compile();
}
