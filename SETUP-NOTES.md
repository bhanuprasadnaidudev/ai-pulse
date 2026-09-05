# Setup Notes

Context for whoever (human or AI) picks this repo up next, especially on a
new machine. Companion to the original "AI Pulse Dev Setup Guide" PDF —
this captures where reality diverged from that guide.

## Gotchas

- **Pin Prisma to `6.19.3`**, not latest. `npm install prisma` currently
  resolves to Prisma 8 (RC), which removed the `datasource.directUrl`
  field entirely. This project needs the classic two-URL pattern (pooled
  `url` for runtime, unpooled `directUrl` for migrations) because Neon's
  pooled connection can't run `prisma migrate`. If a future `npm install`
  bumps past 6.x and `prisma generate` starts erroring about `url`/
  `directUrl` "no longer supported in schema files," re-pin to the latest
  6.x release.
- **Angular build output**: `apps/web` builds to `dist/web/browser` (not
  `dist/web`). Check `apps/web/angular.json` → `outputPath` before
  configuring Vercel's output directory, in case this changes with an
  Angular CLI upgrade.
- **Corporate TLS inspection (work laptop only)**: on the original dev
  machine, Zscaler + Prompt Security intercept HTTPS, which breaks Node
  tools (`npm`, `prisma`, `gh`) with "unable to get local issuer
  certificate" unless `NODE_EXTRA_CA_CERTS` points at a bundle containing
  the system trust store. This is machine-specific config (was added to
  that machine's `~/.zshrc`), not something this repo needs — a personal
  laptop without corporate MDM shouldn't hit this at all.

## Remaining checklist (from the original guide)

Accounts already created: GitHub, Vercel, Render, Neon.

Still needed:
- [ ] **Upstash** — create a Redis database, copy the REST URL and REST
      token (not the `redis://` string — the `@upstash/redis` client
      talks HTTP) into `apps/api/.env`
- [ ] **Google AI Studio** — generate a Gemini API key at
      aistudio.google.com; keep the Google Cloud project on the free tier,
      don't enable billing
- [ ] **Neon** — create a project, copy the **pooled** connection string
      into `DATABASE_URL` and the **direct/unpooled** string into
      `DIRECT_URL` in `apps/api/.env`
- [ ] **cron-job.org** — hold off until the `/ingest` endpoint (from the
      Live Feed Build Guide) exists and is deployed
- [ ] **Vercel** — import the repo, root directory `apps/web`, build
      command `ng build`, output directory `dist/web/browser`
- [ ] **Render** — new Web Service, root directory `apps/api`, build
      command `npm install && npx prisma generate && npm run build`,
      start command `npm run start:prod`, add all 5 env vars from `.env`
- [ ] Run `npx prisma migrate dev` against Neon (via `DIRECT_URL`) once
      Neon credentials are in place
- [ ] Verify `.env` is gitignored on every machine before first commit
      there too (it already is in this repo, but a fresh clone still
      needs you to recreate `apps/api/.env` locally since it's never
      pushed)
