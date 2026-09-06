import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SavedController } from './saved.controller.js';
import { SavedService } from './saved.service.js';

@Module({
  imports: [AuthModule], // for AuthGuard
  controllers: [SavedController],
  providers: [SavedService],
})
export class SavedModule {}
