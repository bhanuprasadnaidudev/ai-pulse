import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../auth/rate-limit.guard.js';
import { FeedService } from './feed.service.js';

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('has-updates')
  hasUpdates(@Query('since') since?: string) {
    if (!since) throw new BadRequestException('since query param is required');
    return this.feed.hasUpdates(since);
  }

  @Get('sources')
  getSources() {
    return this.feed.getSources();
  }

  @Get('trending')
  getTrending() {
    return this.feed.getTrending();
  }

  /** The only endpoint here that can spend money. A post without a cached
   * breakdown triggers a Gemini call, and this is public and unauthenticated
   * -- so without a limit anyone could walk the post ids and burn the entire
   * daily quota in a couple of minutes, which stops ingestion and breaks
   * "Read more" for every real user until the UTC day rolls over.
   *
   * 30 rather than the default 10: cached reads go through this same handler
   * and cost nothing, and someone genuinely reading the feed opens more than
   * ten stories in a quarter of an hour. It is still far too low to drain a
   * 600-call ingestion reserve from one address. */
  @Get(':id/detail')
  @UseGuards(RateLimitGuard)
  @RateLimit(30)
  getDetail(@Param('id') id: string) {
    return this.feed.getDetail(id);
  }

  @Get()
  getFeed(
    @Query('before') before?: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    if (q) return this.feed.search(q, before, limit, source, beforeId);
    if (date) return this.feed.getByDate(date, source);
    return this.feed.getFeed(before, limit, source, beforeId);
  }
}
