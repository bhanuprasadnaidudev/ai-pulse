import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // In production every request arrives through Render's proxy, so without
  // this req.ip is the *proxy's* address -- identical for every visitor on
  // earth. RateLimitGuard keys its buckets on req.ip, which meant all users
  // shared a single 5-requests-per-15-minutes budget: five login attempts
  // by anyone locked out everyone. Trusting one hop makes req.ip read from
  // X-Forwarded-For instead, so the limit applies per actual client.
  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:4200'],
    credentials: true, // required for the session cookie to be sent/set cross-origin
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
