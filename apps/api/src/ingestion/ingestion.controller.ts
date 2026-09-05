import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { buildIngestionGraph } from './ingestion.graph.js';
import { RssService } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { SummarizeService } from './summarize.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('ingest')
export class IngestionController {
  constructor(
    private readonly rss: RssService,
    private readonly dedupe: DedupeService,
    private readonly summarize: SummarizeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async run(@Headers('authorization') auth: string | undefined) {
    if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      throw new UnauthorizedException();
    }

    const graph = buildIngestionGraph(this.rss, this.dedupe, this.summarize, this.prisma);
    const result = await graph.invoke({ items: [], processed: 0 });
    return { ok: true, processed: result.processed };
  }
}
