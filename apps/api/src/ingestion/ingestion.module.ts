import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { IngestionSchedulerService } from './ingestion-scheduler.service.js';
import { RssService } from './rss.service.js';
import { DedupeService } from './dedupe.service.js';
import { SummarizeService } from './summarize.service.js';

@Module({
  controllers: [IngestionController],
  providers: [RssService, DedupeService, SummarizeService, IngestionSchedulerService],
})
export class IngestionModule {}
