import { Controller, Get } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppService } from './app.service.js';
import { apiPublicUrl, configStatus } from './config-check.js';
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
      // The base the verification link is built from. It has to be the API's
      // own origin -- the web app has no /auth/verify route, so a link built
      // from WEB_APP_URL lands on the SPA, matches nothing, and silently drops
      // the token instead of consuming it.
      verifyLinkBase: apiPublicUrl(),
      // Today's Gemini spend, so "is the feed about to stop updating?" is
      // answerable without digging through logs.
      geminiToday: { used: await this.quota.used(), ...this.quota.limits },
    };
  }
  /** Whether the BREVO_API_KEY this instance is actually running with is
   * one Brevo accepts. /health/config only reports that *a* value is set,
   * which is why a stale key looked identical to a working one and cost us
   * several rounds of "save it and try signing up again".
   *
   * The fingerprint is a truncated SHA-256, so two deploys can be compared
   * against each other, or against a key held locally, without the value
   * itself ever appearing in a response. */
  @Get('health/mail')
  async getMailHealth() {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { ok: false, reason: 'BREVO_API_KEY is not set' };

    const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 8);
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': key, accept: 'application/json' },
      });
      if (!res.ok) {
        return { ok: false, fingerprint, status: res.status, reason: (await res.text()).slice(0, 200) };
      }
      const account = (await res.json()) as { email?: string };
      return { ok: true, fingerprint, sender: account.email };
    } catch (err) {
      return { ok: false, fingerprint, reason: (err as Error).message };
    }
  }
}
