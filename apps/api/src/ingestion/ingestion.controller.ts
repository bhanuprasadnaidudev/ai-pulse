import {
  BadRequestException,
  Controller,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { buildSourceAgentGraph } from './agents/source-agent.graph.js';
import { RssService } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { SummarizeService } from './summarize.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FEED_SOURCES } from './sources.js';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

@Controller('ingest')
export class IngestionController {
  constructor(
    private readonly rss: RssService,
    private readonly dedupe: DedupeService,
    private readonly summarize: SummarizeService,
    private readonly prisma: PrismaService,
  ) {}

  /** Runs every source's agent in sequence (shared Gemini quota -- no benefit to parallel). */
  @Post()
  async runAll(@Headers('authorization') auth: string | undefined, @Query('days') days?: string) {
    this.assertAuthorized(auth);
    const maxItemAgeDays = this.parseDays(days);

    const results: Record<string, number> = {};
    for (const source of FEED_SOURCES) {
      const graph = buildSourceAgentGraph(source, this.rss, this.dedupe, this.summarize, this.prisma, {
        maxItemAgeDays,
      });
      const result = await graph.invoke({ items: [], processed: 0 });
      results[source.name] = result.processed;
    }

    return { ok: true, results };
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
