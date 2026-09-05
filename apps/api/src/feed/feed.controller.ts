import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
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

  @Get(':id/detail')
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
  ) {
    if (q) return this.feed.search(q, before, limit, source);
    if (date) return this.feed.getByDate(date, source);
    return this.feed.getFeed(before, limit, source);
  }
}
