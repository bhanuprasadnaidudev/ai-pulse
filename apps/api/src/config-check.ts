import { Logger } from '@nestjs/common';

/** Env vars the app needs, and what breaks without each one. Kept as data
 * so both the boot-time check and GET /health/config report the same list. */
const REQUIRED_ENV = [
  ['DATABASE_URL', 'the database -- nothing works without it'],
  ['JWT_SECRET', 'issuing sessions -- every login and Google sign-in returns 500'],
  ['GOOGLE_CLIENT_ID', 'Google sign-in -- tokens are rejected without it'],
  ['WEB_APP_URL', 'links in verification emails, and the redirect back after verifying'],
  ['GMAIL_USER', 'sending verification emails'],
  ['GMAIL_APP_PASSWORD', 'sending verification emails'],
] as const;

export type ConfigStatus = Record<string, boolean>;

/** Booleans only, never values -- safe to expose. Lets a misconfiguration
 * be diagnosed in one request instead of inferred from the shape of a
 * failure several layers downstream. */
export function configStatus(): ConfigStatus {
  return Object.fromEntries(REQUIRED_ENV.map(([name]) => [name, Boolean(process.env[name])]));
}

/** Logged loudly at boot. Deliberately doesn't exit: a missing mail
 * password shouldn't take down the feed, and on a host that restarts on
 * crash a hard exit turns one bad env var into a boot loop. The point is
 * that the reason is stated plainly in the logs at startup, rather than
 * surfacing later as `secretOrPrivateKey must have a value` on every
 * login attempt with nothing naming the actual cause. */
export function logMissingConfig() {
  const logger = new Logger('ConfigCheck');
  const missing = REQUIRED_ENV.filter(([name]) => !process.env[name]);

  if (missing.length === 0) {
    logger.log('All required environment variables are set.');
    return;
  }

  logger.error('='.repeat(66));
  logger.error(`MISSING ENVIRONMENT VARIABLES (${missing.length}) -- these features are broken:`);
  for (const [name, breaks] of missing) {
    logger.error(`  ${name}  ->  breaks ${breaks}`);
  }
  logger.error('Set them on the host (Render: service -> Environment) and redeploy.');
  logger.error('='.repeat(66));
}
