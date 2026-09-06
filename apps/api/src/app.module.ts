import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { FeedModule } from './feed/feed.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), IngestionModule, FeedModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
