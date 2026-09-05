# Research note: "Story / Topic of the Week"

Status: **research only, not implemented.** Written up so this can be picked
up quickly later, per request during the filters/search work (2026-09-05).

## The idea

Right now the feed surfaces "important" news post-by-post via `isMajor` (a
per-post keyword+tier heuristic set at ingestion time). What's being asked
for is a level up from that: a single, dedicated "this is THE story right
now" surface -- e.g. a hero banner or pinned card saying "This week's
biggest story: GPT-6 Astra" -- so the standout news doesn't just blend into
the feed as one more MAJOR-tagged card among many.

## Three approaches, cheapest to most capable

### 1. Rule-based, reusing what already exists (near-zero cost)

Pick the single most-recent (or highest-tier) `isMajor` post in the last N
days and call it "the story of the week."

- **Cost:** none -- no new LLM calls, no schema change, `getTrending()`
  (already built for the search panel's trending chips) is 90% of this
  already.
- **Weakness:** it's a single post, not a *topic*. If OpenAI announces
  GPT-6 Astra and then five follow-up posts about it appear across
  different sources over the week (as actually happened with the real
  Astra launch in this dataset), this approach just picks one of those six
  posts semi-arbitrarily -- it doesn't know they're all the same story.

### 2. Keyword/entity clustering across posts (medium cost, no LLM)

Extract repeated proper-noun-ish terms across the week's titles (e.g.
"GPT-6 Astra", "WeatherNext 3") with a simple regex/frequency pass -- no ML
needed, just counting capitalized multi-word sequences or a small curated
list of watched product/model names -- then rank by how many *distinct
posts* (ideally distinct *sources*) mention the same term. The term with the
widest spread becomes the topic of the week, and every matching post
becomes "related coverage" under it.

- **Cost:** low -- pure string processing, runs against data already in
  Postgres, no new API calls.
- **Weakness:** brittle to phrasing variance ("GPT-6 Astra" vs "Astra" vs
  "the new OpenAI model") without a bit of normalization work; still no
  human-readable "why this matters" framing, just a cluster of links.

### 3. LLM-generated weekly digest (best output, still cheap at this frequency)

Once a day or once a week, run a small job that feeds Gemini the week's
headlines + one-line summaries and asks it to name the dominant theme and
write a short "why this is the story" blurb, plus list which existing post
IDs relate to it. This is the same shape as the ingestion pipeline's
existing `SummarizeService`/`ExplainerService` -- another LangGraph node,
same free-tier model.

- **Cost:** trivial against the free tier -- 1-7 calls/week, nowhere near
  the 15rpm ceiling that ingestion already has to pace around.
- **New schema:** a small cache table, e.g.
  `WeeklyTopic { id, title, blurb, relatedPostIds, computedAt }`, so the
  digest is computed once on a schedule and just read on page load, not
  recomputed per request.
- **New job:** a scheduled endpoint (`POST /trending/refresh`, same
  shared-secret-protected pattern as `/ingest`), triggered by the same
  cron-job.org mechanism once that's wired up.
- **Weakness:** the only approach with an ongoing (if tiny) LLM cost, and
  it needs enough post volume in the window to produce a meaningful digest
  -- thin on a quiet week.

## Recommendation for whenever this gets picked up

Start with **#1** as a quick display-only win (it's already 90% built via
`getTrending()`) -- surface the single most recent MAJOR post as a "This
week's biggest story" hero treatment. Move to **#3** once there's enough
sustained post volume for a real digest to be worth the extra
schema+job -- it directly reuses the ingestion pipeline's existing
LangGraph + Gemini + cron-job.org pattern, so there's no new architecture
to introduce, just another scheduled graph. **#2** is a reasonable middle
ground if #1 feels too thin but #3 feels premature -- but it's arguably
more engineering for a worse result than just doing #3 once volume
justifies it.

## UI note

Whatever approach: this should be visually distinct from the existing
`⚡ MAJOR` badge treatment, not a second version of it -- e.g. a pinned
hero card at the top of the feed, more prominent tilt/accent than a regular
card gets. Per the design spec's own rule, tilt/accent treatments should
stay rare -- so if this ships, the existing "single most recent MAJOR post
gets a badge + tilt" treatment on regular cards should probably step back
(no tilt) when a dedicated hero card is already doing that job, so the page
doesn't end up with two competing "look at this" elements at once.
