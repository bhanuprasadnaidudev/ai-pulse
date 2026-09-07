import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { buildSourceAgentGraph, createRunBudget } from './agents/source-agent.graph.js';
import { RssService } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { SummarizeService } from './summarize.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { sourcesByPriority } from './sources.js';

const logger = new Logger('IngestionScheduler');

/** Runs hourly rather than every 30 minutes: at ~20 summaries per run
 * that halves the worst-case daily Gemini spend (960 -> 480) and leaves
 * real headroom under the free tier's daily cap for the on-demand "Read
 * more" breakdowns, which are user-triggered and can't be scheduled
 * around. Hourly is still well inside "a new official post shows up
 * same-day".
 *
 * Runs the same per-source agents POST /ingest triggers, automatically,
 * so the feed refreshes itself instead of only ever updating when someone
 * manually calls the endpoint. Per-minute pacing is handled separately by
 * the run budget and the delay between summaries; GeminiQuotaService caps
 * the daily side.
 *
 * This only runs while the API process itself is alive -- it's not a
 * substitute for an external scheduler (e.g. cron-job.org hitting a
 * deployed instance) once this is actually deployed, since a dev server
 * or a free-tier host that spins down on idle won't be "alive" on its own
 * schedule. It's the right fix for right now (local dev, and any host that
 * stays warm) and composes fine with an external trigger later -- both
 * just end up calling the same underlying agents. */
@Injectable()
export class IngestionSchedulerService {
  constructor(
    private readonly rss: RssService,
    private readonly dedupe: DedupeService,
    private readonly summarize: SummarizeService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 * * * *')
  async runScheduledIngest() {
    logger.log('Scheduled ingestion run starting...');
    const results: Record<string, number> = {};
    // One budget for the whole run, spent in priority order -- with ~40
    // sources the per-source caps alone would multiply well past the free
    // Gemini tier, and official announcements should get first call on it.
    const budget = createRunBudget();

    for (const source of sourcesByPriority()) {
      try {
        const graph = buildSourceAgentGraph(source, this.rss, this.dedupe, this.summarize, this.prisma, { budget });
        const result = await graph.invoke({ items: [], processed: 0 });
        results[source.name] = result.processed;
      } catch (err) {
        // One source failing (network blip, a feed temporarily down) shouldn't
        // block the rest -- log and move on, next scheduled run retries it.
        logger.warn(`[${source.name}] scheduled run failed: ${(err as Error).message}`);
        results[source.name] = -1;
      }
    }

    const total = Object.values(results)
      .filter((n) => n > 0)
      .reduce((a, b) => a + b, 0);
    logger.log(`Scheduled ingestion run complete: ${total} new post(s) -- ${JSON.stringify(results)}`);
  }
}
