import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { RssService } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { SummarizeService } from './summarize.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  controllers: [IngestionController],
  providers: [RssService, DedupeService, SummarizeService, PrismaService],
})
export class IngestionModule {}
