# Research note: keeping the feed reliably fresh in production

Status: **research + recommendation, not deployed yet.** Written up per
request (2026-09-06) after repeated "why is the latest post still Sep 3"
questions -- confirmed each time (via a live direct check of all 10 tracked
RSS feeds, bypassing the DB) that Sep 3 has genuinely been the real newest
official-source item every time it's been checked. That's not the actual
problem this note is about. The actual problem: **nothing runs on its own
yet.** Locally, the feed is only ever as fresh as the last time I personally
ran `/ingest`. This note covers what changes once this is a real deployed
service nobody is manually operating.

## Two different problems, easy to conflate

1. **Ingestion freshness** -- does new content get pulled in promptly once
   a source actually publishes something? Not user-facing, not latency
   sensitive. If this takes 45 seconds to wake up and run, nobody notices.
2. **Request latency** -- when someone opens the app and it calls `GET
   /feed`, does that come back fast? This *is* user-facing. A free host that
   spun down 20 minutes ago waking up to serve that request is a 500ms
   feed feeling like a broken app for 30-50 seconds.

Free tiers solve neither by default, but **one mechanism fixes both at
once**: an external service pinging a real endpoint on a schedule. That
ping both triggers ingestion *and* resets the host's idle timer before it
sleeps. This is the crux of the recommendation below.

## What's already in place (today, local dev)

Just added: `IngestionSchedulerService`, a `@Cron('0,30 * * * *')` job
inside the NestJS process that runs every source's agent every 30 minutes,
reusing the exact same `buildSourceAgentGraph` pipeline `POST /ingest` uses.

**This only helps while the process is alive.** It works right now because
the dev server happens to stay running. Once deployed to a host that spins
down on idle (every realistic free option, see below), the process --
timer included -- is suspended along with everything else. An in-process
cron cannot wake up a process that doesn't exist at that moment. It's not
wasted work (it's the right always-fresh mechanism the moment this runs
somewhere that stays warm, including a future paid tier), but it is not a
substitute for an external trigger on a sleeping free host.

## What free-tier hosting actually does to this stack

Every piece of this stack has its own free-tier idle behavior, independently:

| Service | Free-tier idle behavior |
|---|---|
| Render (API host, not yet deployed) | Spins the whole web service down after ~15 min with no incoming request; next request pays a cold start (typically 30-50s) |
| Neon (Postgres) | Auto-suspends the compute endpoint after ~5 min idle; next query pays a reconnect (usually well under a second -- much cheaper to wake than Render) |
| Upstash (Redis) | No sleep behavior -- it's a managed always-on endpoint even on the free plan; irrelevant to this problem |

Render is the one that actually matters here. Neon waking up is fast enough
to not matter *once Render itself is already awake and mid-request*.

## The fix: an external ping, not a bigger internal timer

[cron-job.org](https://cron-job.org) (free, already the tool named in the
original roadmap for this) hitting a real endpoint every 10-15 minutes:

- **Interval choice:** under Render free's ~15-minute sleep threshold, so
  the service never actually goes fully idle between pings -- effectively
  always warm for real users, as a side effect of the same call that
  triggers ingestion.
- **What it hits:** `POST /ingest` directly (already exists, already
  shared-secret-protected the same way this whole session's manual test
  calls have used it) -- not a separate throwaway health-check endpoint,
  since the ingestion run itself is a perfectly good "wake up and do
  something real" request.
- **Keep the in-process `@Cron` too:** harmless, and it's the thing that
  actually matters the moment this stack ever moves to an always-on tier
  (paid Render, a real VM) where sleep isn't a factor at all -- at that
  point the external ping becomes pure redundancy/backstop rather than the
  primary mechanism, which is a fine place to end up.

This is exactly the deployment step already identified as outstanding
(Render + cron-job.org) -- this note is the "why" and the specific config,
not a new plan.

## Free-tier ceilings -- what actually runs out first

- **Gemini (`gemini-3.5-flash-lite`), 15 req/min:** already paced correctly
  (4.5s between calls within a run) regardless of how often runs happen --
  a 10-15 min run cadence doesn't change this, each run is still its own
  small paced burst. Not a near-term constraint.
- **Neon storage, 0.5 GB free:** current total dataset (all sources,
  several days of history including full `detailBreakdown` text on opened
  posts) is on the order of low tens of MB. Even at a sustained worst case
  of 10 sources x 3 items/run every single run finding new content
  (unrealistic in practice -- most runs find nothing new, sources don't
  publish that often), that's a slow climb. Storage is not a near-term
  concern, but is the one line item worth revisiting if this runs
  untouched for a year+ -- a simple mitigation already available if needed:
  drop `detailBreakdown` (regenerable on demand) for posts older than N
  months, since it's the largest single text field on the row.
- **Upstash Redis, 10,000 commands/day free:** dedupe is one `GET` + one
  `SET` per newly-processed post, plus incidental reads. Nowhere close to
  the ceiling at this volume.

Nothing here needs a paid tier soon. The one ceiling worth remembering is
Neon storage, and only as a "revisit in a year" note, not an action item.

## If free-tier sleep ever becomes a real problem anyway

Cron-job.org pinging every 10-15 min should keep Render continuously warm
in practice, but if that ever proves flaky (missed ping, cron-job.org's own
free tier having a hiccup, etc.), the fallback ladder, cheapest first:

1. **Render's paid "Starter" tier (~$7/mo):** removes sleep entirely, no
   architecture change needed -- literally just a billing upgrade on the
   same service.
2. **A genuinely-free always-on VM (Oracle Cloud "Always Free" tier):** an
   Ampere ARM instance that never sleeps, at zero cost, indefinitely -- not
   a trial. Trade-off: this is a real VM, not a PaaS -- means owning the
   Node process's uptime yourself (a process manager like `pm2`, a reverse
   proxy, OS updates) instead of Render handling that. More setup, more
   ongoing ops, but removes the sleep problem at the source for free
   rather than working around it with pings.
3. **Anything else free-tier-PaaS-shaped (Railway, Fly.io, etc.):** worth
   naming as *not* recommended as a primary plan -- this space has had
   real churn (shrinking free allowances, policy changes, a few shutting
   down outright over the past couple of years). Render + the ping
   workaround, or Oracle's actually-permanent free VM, are the two options
   here that don't carry "the free tier might just change under you" risk.

## Recommendation

Deploy to Render as already planned; wire cron-job.org to hit `POST
/ingest` every 10-15 minutes rather than building anything more elaborate.
Leave the new in-process `@Cron` in place -- it costs nothing and is
already the right long-term mechanism for whenever this stack is on
something that stays warm on its own. Revisit Neon storage in about a
year, not before. Don't reach for Railway/Fly.io/etc. as the primary host;
if Render's free sleep ever becomes a real problem despite the ping, the
$7/mo Starter tier is the least-effort fix, with Oracle's Always Free VM as
the zero-cost-forever alternative if avoiding any hosting bill matters more
than avoiding the extra ops work.
