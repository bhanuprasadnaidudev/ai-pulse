import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { FeedModule } from './feed/feed.module.js';

@Module({
  imports: [IngestionModule, FeedModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
