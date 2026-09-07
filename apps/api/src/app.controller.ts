import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { configStatus } from './config-check.js';
import { GeminiQuotaService } from './gemini/gemini-quota.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly quota: GeminiQuotaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Which required environment variables are present -- booleans only,
   * never values, so it's safe to leave open.
   *
   * Worth the endpoint because the alternative is inferring configuration
   * from the shape of a downstream failure: a missing JWT_SECRET surfaced
   * only as "Internal server error" on login and `secretOrPrivateKey must
   * have a value` in the logs, with nothing connecting that to a specific
   * unset variable. One request answers it now. */
  @Get('health/config')
  async getConfigHealth() {
    const config = configStatus();
    const missing = Object.entries(config)
      .filter(([, present]) => !present)
      .map(([name]) => name);
    return {
      ok: missing.length === 0,
      missing,
      config,
      // Which commit is actually serving. Render injects RENDER_GIT_COMMIT
      // at build time; without it, "did my fix deploy yet?" can only be
      // answered from the dashboard, and a fix that has not shipped looks
      // exactly like a fix that did not work.
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
      // Today's Gemini spend, so "is the feed about to stop updating?" is
      // answerable without digging through logs.
      geminiToday: { used: await this.quota.used(), ...this.quota.limits },
    };
  }
}
