import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { ExplainerService } from './explainer.service.js';

@Module({
  controllers: [FeedController],
  providers: [FeedService, ExplainerService],
})
export class FeedModule {}
