import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { MailService } from './mail.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { SESSION_MAX_AGE_DAYS } from './auth.constants.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: `${SESSION_MAX_AGE_DAYS}d` },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, MailService, RateLimitGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
