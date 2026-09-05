import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { ExplainerService } from './explainer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  controllers: [FeedController],
  providers: [FeedService, ExplainerService, PrismaService],
})
export class FeedModule {}
