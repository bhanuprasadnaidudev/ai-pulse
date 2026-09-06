import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { FeedModule } from './feed/feed.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, IngestionModule, FeedModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
