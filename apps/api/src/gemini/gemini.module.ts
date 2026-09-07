import { Global, Module } from '@nestjs/common';
import { GeminiQuotaService } from './gemini-quota.service.js';

/** Global because the daily budget has to be shared: ingestion
 * (SummarizeService) and the on-demand breakdowns (ExplainerService) draw
 * from one Gemini allowance, and two separate counters would let them
 * overspend it between them. Same pattern as PrismaModule. */
@Global()
@Module({
  providers: [GeminiQuotaService],
  exports: [GeminiQuotaService],
})
export class GeminiModule {}
