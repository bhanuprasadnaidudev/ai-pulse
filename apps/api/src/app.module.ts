import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { GeminiModule } from './gemini/gemini.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { FeedModule } from './feed/feed.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SavedModule } from './saved/saved.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, GeminiModule, IngestionModule, FeedModule, AuthModule, SavedModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
