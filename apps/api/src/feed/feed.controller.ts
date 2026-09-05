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

  @Get(':id/detail')
  getDetail(@Param('id') id: string) {
    return this.feed.getDetail(id);
  }

  @Get()
  getFeed(@Query('before') before?: string, @Query('date') date?: string, @Query('limit') limit?: string) {
    if (date) return this.feed.getByDate(date);
    return this.feed.getFeed(before, limit);
  }
}
