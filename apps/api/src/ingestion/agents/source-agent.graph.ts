import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RssService, type RawFeedItem } from '../rss.service.js';
import { DedupeService } from '../dedupe.service.js';
import { SummarizeService } from '../summarize.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FeedSource } from '../sources.js';

const logger = new Logger('SourceAgent');

// Gemini's free-tier quota is the binding constraint on the whole pipeline:
// ~15 requests/minute, shared across every source agent in a run (one API
// key, not one quota per source), against a daily ceiling too. With runs
// every 30 minutes, a budget of 20 summaries per run works out to roughly
// 960/day -- comfortably inside the daily allowance while still letting a
// busy news day through.
const MAX_ITEMS_PER_SOURCE_PER_RUN = 3;
const DELAY_BETWEEN_SUMMARIES_MS = 4500;
const DEFAULT_MAX_ITEM_AGE_DAYS = 7;
/** How far back to look for near-duplicate headlines. Long enough to catch
 * the trailing coverage of a story that broke yesterday, short enough that
 * the query stays small. */
const DUPLICATE_LOOKBACK_DAYS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Shared across every source agent in a single run, so the per-source caps
 * can't multiply into a quota overrun once there are ~40 sources. Mutated
 * as agents consume it. */
export interface RunBudget {
  remaining: number;
}

export function createRunBudget(total = 20): RunBudget {
  return { remaining: total };
}

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
  /** Override the per-run item cap (default 3, or the source's own maxPerRun). */
  maxItemsPerRun?: number;
  /** Shared across a whole run -- see RunBudget. Omitted for a single
   * manually-triggered source, where there's nothing to share with. */
  budget?: RunBudget;
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
  const maxItemsPerRun = options.maxItemsPerRun ?? source.maxPerRun ?? MAX_ITEMS_PER_SOURCE_PER_RUN;
  const budget = options.budget;

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

      if (candidates.length === 0) return { processed };

      // Recent headlines, loaded once per source rather than per item, to
      // catch the same story arriving from a different outlet at a
      // different URL (which URL dedupe alone can't see).
      const since = new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const recent = await prisma.post.findMany({
        where: { publishedAt: { gte: since } },
        select: { title: true },
        orderBy: { publishedAt: 'desc' },
        take: 400,
      });
      const recentTitles = recent.map((p) => p.title);

      for (const item of candidates) {
        if (processed >= maxItemsPerRun) break;
        if (budget && budget.remaining <= 0) {
          logger.log(`[${source.name}] run budget exhausted -- remaining items wait for the next run`);
          break;
        }
        if (await dedupe.has(item.url)) continue;

        if (dedupe.isDuplicateStory(item.title, recentTitles)) {
          // Claimed so later runs don't re-evaluate the same item forever.
          await dedupe.markSeen(item.url);
          continue;
        }

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
          // Added so the rest of this run's items dedupe against it too,
          // not just against what was already in the database.
          recentTitles.push(item.title);
          processed++;
          if (budget) budget.remaining--;

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
