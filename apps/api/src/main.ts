import dns from 'node:dns';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { logMissingConfig } from './config-check.js';

// Gmail's smtp.gmail.com resolves to both A and AAAA records, and since
// Node 17 the default lookup order is "verbatim" -- whatever DNS returned
// first, which is often the IPv6 one. Render's instances have no IPv6
// route out, so those sends died with `connect ENETUNREACH 2607:f8b0:...`
// before ever reaching Gmail. MailService catches and logs that (the send
// is fire-and-forget, deliberately), so the user saw "check your email"
// and no email ever arrived. Preferring A records restores the pre-17
// behaviour for every outbound connection this process makes, so it
// covers the feed fetches and API calls too, not just SMTP.
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  // Before anything else, so a misconfigured deploy says so at the top of
  // its own logs rather than only failing later, deep inside a request.
  logMissingConfig();

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
