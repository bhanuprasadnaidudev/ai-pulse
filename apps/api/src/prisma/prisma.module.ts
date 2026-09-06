import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// @Global() so every feature module gets the same PrismaService instance
// (one PrismaClient connection pool) without each one re-declaring it as
// its own provider -- FeedModule and IngestionModule used to do exactly
// that, meaning two independent connection pools already existed before
// AuthModule was about to make it three.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
