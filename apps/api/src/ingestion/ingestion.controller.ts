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
