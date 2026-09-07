import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { buildSourceAgentGraph, createRunBudget } from './agents/source-agent.graph.js';
import { RssService } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { SummarizeService } from './summarize.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FEED_SOURCES, sourcesByPriority } from './sources.js';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

@Controller('ingest')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);
  /** A full pass takes minutes, and the external scheduler fires on a
   * fixed clock regardless -- without this, a slow run could overlap the
   * next trigger and both would spend the same daily budget twice. */
  private running = false;

  constructor(
    private readonly rss: RssService,
    private readonly dedupe: DedupeService,
    private readonly summarize: SummarizeService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET trigger for external schedulers.
   *
   * The POST route below is the "correct" one, but it needs a custom method
   * *and* a custom header, and a scheduler configured with neither just
   * sends a plain GET -- which matched no route and returned 404 on every
   * single run, silently, for as long as it was set up that way. Accepting
   * a GET with the secret in the query string removes that whole class of
   * misconfiguration: the job is one URL, pasted, with nothing else to set.
   *
   * Trade-off, stated plainly: a secret in a URL is visible to proxies and
   * server logs in a way a header isn't. That's an acceptable exchange for
   * a rotatable trigger token that grants nothing but "fetch the news
   * early" -- and INGEST_SECRET can be rotated in one env var if it leaks.
   *
   * Returns immediately rather than awaiting the run: a full pass takes
   * minutes and most schedulers time out well before that, which would
   * report failures for runs that actually succeeded. */
  @Get()
  triggerViaGet(@Query('key') key?: string, @Query('days') days?: string) {
    if (!process.env.INGEST_SECRET || key !== process.env.INGEST_SECRET) {
      throw new UnauthorizedException();
    }
    if (this.running) {
      return { ok: true, started: false, reason: 'A run is already in progress.' };
    }

    void this.runAllInternal(this.parseDays(days))
      .then((results) => this.logger.log(`Triggered run complete: ${JSON.stringify(results)}`))
      .catch((err) => this.logger.error(`Triggered run failed: ${(err as Error).message}`));

    return { ok: true, started: true };
  }

  /** Runs every source's agent in sequence (shared Gemini quota -- no benefit to parallel). */
  @Post()
  async runAll(
    @Headers('authorization') auth: string | undefined,
    @Query('days') days?: string,
    @Query('budget') budgetParam?: string,
  ) {
    this.assertAuthorized(auth);
    const budgetOverride = budgetParam ? parseInt(budgetParam, 10) || undefined : undefined;
    const results = await this.runAllInternal(this.parseDays(days), budgetOverride);
    return { ok: true, results };
  }

  /** The actual pass, shared by the POST and GET triggers so they can't
   * drift apart. Guarded against overlapping runs. */
  private async runAllInternal(
    maxItemAgeDays?: number,
    budgetOverride?: number,
  ): Promise<Record<string, number>> {
    if (this.running) return {};
    this.running = true;
    try {
      // Shared across the whole run and spent in priority order -- see
      // createRunBudget. Overridable for a deliberate one-off backfill.
      const budget = createRunBudget(budgetOverride);
      const results: Record<string, number> = {};

      for (const source of sourcesByPriority()) {
        const graph = buildSourceAgentGraph(source, this.rss, this.dedupe, this.summarize, this.prisma, {
          maxItemAgeDays,
          budget,
        });
        const result = await graph.invoke({ items: [], processed: 0 });
        results[source.name] = result.processed;
      }

      return results;
    } finally {
      this.running = false;
    }
  }

  /** One-off backfill: re-judges MAJOR on already-ingested posts using the
   * current (content-aware) classifier, for posts ingested under the old
   * keyword-on-title heuristic. Re-checks every Tier 1 post rather than just
   * ones currently false, since the old heuristic could also mislabel a
   * true positive that only coincidentally matched a launch keyword.
   * Registered before ':source' below -- otherwise that wildcard route would
   * swallow this literal path and reject it as an unknown source name. */
  @Post('reclassify')
  async reclassify(@Headers('authorization') auth: string | undefined) {
    this.assertAuthorized(auth);

    const posts = await this.prisma.post.findMany({
      where: { sourceTier: 1 },
      select: { id: true, title: true, summary: true, sourceTier: true, isMajor: true },
    });

    let changed = 0;
    const flips: Array<{ id: string; title: string; from: boolean; to: boolean }> = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const isMajor = await this.summarize.classifyOnly(post.title, post.summary, post.sourceTier);
      if (isMajor !== post.isMajor) {
        await this.prisma.post.update({ where: { id: post.id }, data: { isMajor } });
        flips.push({ id: post.id, title: post.title, from: post.isMajor, to: isMajor });
        changed++;
      }
      if (i < posts.length - 1) await new Promise((r) => setTimeout(r, 4500));
    }

    return { ok: true, checked: posts.length, changed, flips };
  }

  /** Runs a single named source's agent -- lets you schedule/trigger sources independently. */
  @Post(':source')
  async runOne(
    @Headers('authorization') auth: string | undefined,
    @Param('source') sourceParam: string,
    @Query('days') days?: string,
  ) {
    this.assertAuthorized(auth);
    const source = FEED_SOURCES.find((s) => toSlug(s.name) === sourceParam.toLowerCase());
    if (!source) {
      throw new BadRequestException(
        `Unknown source "${sourceParam}". Known sources: ${FEED_SOURCES.map((s) => toSlug(s.name)).join(', ')}`,
      );
    }

    const graph = buildSourceAgentGraph(source, this.rss, this.dedupe, this.summarize, this.prisma, {
      maxItemAgeDays: this.parseDays(days),
    });
    const result = await graph.invoke({ items: [], processed: 0 });

    return { ok: true, source: source.name, processed: result.processed };
  }

  private assertAuthorized(auth: string | undefined) {
    if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      throw new UnauthorizedException();
    }
  }

  private parseDays(days: string | undefined): number | undefined {
    if (!days) return undefined;
    const parsed = parseInt(days, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
