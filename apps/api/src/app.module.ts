import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IngestionModule } from './ingestion/ingestion.module.js';

@Module({
  imports: [IngestionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
