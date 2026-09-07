# Current

Every AI story that matters — from the labs and the industry press — summarised in plain language and updated hourly.

**Live:** [current-3wkv.onrender.com](https://current-3wkv.onrender.com) · **API:** [ai-pulse-api-zcyv.onrender.com](https://ai-pulse-api-zcyv.onrender.com)

Current pulls from 43 RSS sources, throws away the duplicates and the noise, has Gemini write a short plain-language summary of what's left, and presents the result as a feed you can read in a few minutes. Sign in and you can save posts; tap "Read more" and it writes a longer breakdown on demand.

---

## Architecture at a glance

```
                    ┌──────────────────────────────────────────┐
   43 RSS feeds ───►│  Ingestion (hourly, external cron)       │
                    │  fetch → filter → dedupe → summarise      │
                    └────────────────────┬─────────────────────┘
                                         │ writes
   Angular SPA                     ┌─────▼──────┐        ┌──────────────┐
   (static site)  ◄──── REST ─────►│  NestJS    │◄──────►│ Neon Postgres│
                                   │  API       │        └──────────────┘
                                   └──┬───┬───┬─┘
                                      │   │   └──────────► Gemini 3.5 Flash Lite
                                      │   └──────────────► Upstash Redis (dedupe, quota)
                                      └──────────────────► Brevo (transactional mail)
```

Two deployed services. The Angular app is a static bundle — no server, no SSR — that talks to the API over plain REST. The API owns everything else: the database, the AI calls, ingestion, auth and mail.

## The stack, and why

| Layer | Choice | Why this one |
|---|---|---|
| Frontend | **Angular 21**, standalone components + signals | Signals give fine-grained reactivity without a state-management library. No component library — the UI is hand-built in `shared/ui`. |
| Backend | **NestJS 12** on Node | Module boundaries and DI out of the box, which is what keeps ingestion, auth and feed from bleeding into each other. |
| Database | **Postgres** (Neon), via **Prisma 6** | Neon's free tier is a real Postgres with branching. Prisma gives typed queries and tracked migrations. |
| Cache / counters | **Upstash Redis** | Two jobs only: URL dedupe keys and the daily Gemini counter. HTTP-based, so no connection pooling to manage on a free instance. |
| AI | **Gemini 3.5 Flash Lite** | Summarisation and classification are cheap, high-volume tasks. Flash Lite is the cheapest model that writes acceptable prose, and the free tier's daily cap is the real constraint (see below). |
| Ingestion | **LangGraph** state graph, one per source | Each source runs the same `fetch → process` graph with its own config. Structure over a `for` loop: one source failing can't take down the run. |
| Mail | **Brevo** transactional HTTP API | Not SMTP — Render blocks outbound ports 25/465/587 on free web services. HTTPS on 443 sidesteps that entirely. |
| Auth | **Google Sign-In** + email/password, own JWT session | One session format for both paths. The token is returned in the response body as well as a cookie, because the API and web app sit on different `onrender.com` subdomains and the cookie is third-party there. |
| Hosting | **Render** — web service + static site | Free tier throughout. |

## Repo layout

```
apps/
  api/                     NestJS API
    src/
      auth/                sign-in, sessions, mail, rate limiting
      feed/                read endpoints + on-demand explainer
      ingestion/           sources, RSS, dedupe, summarise, agent graph
      gemini/              shared client + daily quota accounting
      saved/               bookmarks
      prisma/              Prisma service
      config-check.ts      required env vars, in one place
    prisma/                schema + migrations
  web/                     Angular app
    src/app/
      feed/                feed, filters, masonry, detail modal
      auth/                login, signup, account, reset flows
      shared/ui/           badge, button, card, nav-item, page-loader
docs/research/             design notes written before the code
render.yaml                Render blueprint for the API
```

## Running locally

Requires Node 22+ and npm.

```bash
npm install                              # workspaces: installs both apps
cp apps/api/.env.example apps/api/.env    # then fill it in (see below)
npm run start:dev --workspace=api         # API on :3000
npm run start --workspace=web             # app on :4200
```

The web app's dev build points at `localhost:3000` automatically ([environment.ts](apps/web/src/environments/environment.ts)); production builds swap in [environment.prod.ts](apps/web/src/environments/environment.prod.ts) via `fileReplacements`.

To pull articles in locally:

```bash
curl "http://localhost:3000/ingest?key=$INGEST_SECRET"
```

## Environment variables

All on the API. `GET /health/config` reports which are present (booleans only, never values).

| Variable | What breaks without it |
|---|---|
| `DATABASE_URL` | Everything — pooled Neon connection |
| `DIRECT_URL` | Migrations (unpooled connection) |
| `JWT_SECRET` | Every login and Google sign-in returns 500 |
| `GOOGLE_CLIENT_ID` | Google sign-in — tokens are rejected |
| `GEMINI_API_KEY` | Summaries and "Read more" |
| `UPSTASH_REDIS_URL` / `_TOKEN` | Dedupe and daily quota (fails open) |
| `BREVO_API_KEY` | Verification and password-reset email |
| `GMAIL_USER` | The from address on outgoing mail — must be a verified Brevo sender |
| `WEB_APP_URL` | Email links and the post-verify redirect |
| `CORS_ORIGIN` | Every browser request from the deployed app |
| `INGEST_SECRET` | The ingestion trigger is unprotected |

## Deployment

**API** — Render web service, from [render.yaml](render.yaml). Build `npm install && npm run build --workspace=api`, start `npm run start:prod --workspace=api`.

**Web** — Render static site. Build `npm install && npm run build --workspace=web`, publish `apps/web/dist/web/browser`. No rewrite rule needed: the build copies `index.html` to `404.html` ([spa-fallback.mjs](apps/web/scripts/spa-fallback.mjs)) so deep links work.

**Ingestion** — an external scheduler (cron-job.org or similar) hits `GET /ingest?key=<INGEST_SECRET>` hourly. There is also an in-process `@Cron`, but a free instance that sleeps can't run its own schedule, so the external trigger is the one that matters.

## Operations

| Endpoint | Answers |
|---|---|
| `GET /health/config` | Which env vars are set, which commit is running, today's Gemini spend |
| `GET /health/mail` | Whether the Brevo key actually works — asks Brevo, doesn't just check presence |
| `GET /health/ip` | What the server resolves the caller to (rate limiting depends on this) |

Those exist because "configured" and "working" are different things, and telling them apart used to require reading logs.

## Design decisions worth knowing

**The Gemini budget is a first-class concern.** The free tier caps daily requests, so [gemini-quota.service.ts](apps/api/src/gemini/gemini-quota.service.ts) counts every call in Redis against 800/day, with ingestion cut off at 600 — the remaining 200 are reserved for user-triggered "Read more". A background job must never be why a person tapping a button gets an error. It increments then compares, so two concurrent callers can't both claim the last slot, and it fails open if Redis is unreachable.

**Sources are prioritised, and the run budget is shared.** Official lab announcements (`priority: 1`) are processed before aggregators, so a chatty feed can't starve OpenAI's blog when the budget is tight.

**Dedupe is two-layer.** Exact URLs are remembered in Redis for 30 days; near-duplicate headlines are caught by word-overlap similarity at a 0.65 threshold over the last 3 days, which is what stops the same story appearing five times with five publishers' names on it.

**Auth flows resist account enumeration.** `forgot-password` and `resend-verification` return the same response whether or not the account exists, so the endpoints can't be used to discover who's registered. Failures are logged, never surfaced.

**Rate limit buckets key on `cf-connecting-ip`.** Render fronts services with Cloudflare, so `req.ip` resolves to an internal router address that varies per request — keying on it meant nearly every request got a fresh bucket and the limiter did nothing at all. Cloudflare overwrites `cf-connecting-ip`, so a client can't forge it.

**Feed pagination is a keyset cursor on `(publishedAt, id)`.** Timestamps are not unique — publishers post in batches, and some feeds only give a date. Paging on the timestamp alone silently dropped every tied row that straddled a page boundary.

## Known limits

- Search is `ILIKE '%q%'` — fine at this size, wants Postgres full-text later.
- Rate limiting, the in-process cron and the overlap guard all assume a single instance. True today; would need Redis if the API is ever scaled out.
- Cold starts: a free Render service sleeps after ~15 minutes idle, and the next request waits ~50s.
- Test coverage is thin. CI builds both workspaces on every push, which catches type and template errors but not behaviour.
