import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { ExplainerService } from './explainer.service.js';
import { RateLimitGuard } from '../auth/rate-limit.guard.js';

@Module({
  controllers: [FeedController],
  // Its own RateLimitGuard instance: AuthModule provides one but does not
  // export it. Separate instances mean separate bucket maps, which costs
  // nothing here -- buckets are already keyed per handler, so these two
  // could never have shared an entry anyway.
  providers: [FeedService, ExplainerService, RateLimitGuard],
})
export class FeedModule {}
