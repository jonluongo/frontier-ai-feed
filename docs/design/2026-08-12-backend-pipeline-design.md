# Backend pipeline design — ranked, clustered, summarized feed

> Status: **approved design, pre-implementation** · 2026-08-12
> Basis: [architecture audit](../research/2026-08-12-backend-architecture-audit.md) (primary-source
> verified); supersedes the earlier TS-service + Postgres/pgvector sketch, per [ADR-0002](../adr/0002-batch-pipeline-not-always-on-service.md).

## Goal

Make the Feed rank by **cross-source attention** instead of raw recency — in the spirit of
aiweekly.co: one entry per *story* (not per URL), a visible **Signal** score, top stories
flagged as **Alerts** — while honoring the hard rule: **never invent content**; summaries
are grounded in fetched text and cited.

## Shape (from the audit)

One TypeScript script, run on a **GitHub Actions schedule** in a **public repo**, stateless
over a **72-hour window** each tick (every 30–60 min). No servers, no databases to operate.
State = a SQLite file (or JSON) cached between runs. Publish = one `feed.json` on GitHub
Pages (CDN-cached). Cost ≈ $2–4/mo, all LLM. Escape hatch if push/tight timing ever becomes
real: the same script moves to a $1/mo Render cron — a relocation, not a redesign.

```
GHA cron (30–60 min, public repo)
  1 ingest     HN API · arXiv · HF papers · GitHub search · RSS catalog
               (port of FrontierFeedKit's proven fetchers/configs)
  2 dedup      normalized URL (ADR-0001 rules, ported)
  3 cluster    72h window → similarity graph → connected components
               v1 edges: title similarity (token/shingle overlap)
               v2 edges (measured upgrade): + embedding cosine, threshold
               calibrated on ~1 week of our own logged pairs
  4 score      Signal per story (formula below)
  5 summarize  top ~30 stories/day → Claude Haiku 4.5 Batch API,
               grounded in fetched text only, source URLs cited
  6 publish    feed.json → GitHub Pages
       ▼
iOS app: RemoteFeedFetcher (one more Fetcher behind the existing seam);
on-device fetchers remain the offline fallback
```

## Stages as deep modules

Every stage is a pure function over data in, data out; the script is a straight-line
composition. Interfaces (TS):

| Stage | Interface | Hides |
|---|---|---|
| ingest | `fetchAll(sources: SourceConfig[]): Promise<RawItem[]>` | per-API shapes, N+1s, failure isolation (a dead source yields `[]`) |
| dedup | `dedupeByURL(items: RawItem[]): Item[]` | ADR-0001 normalization, source union |
| cluster | `clusterWindow(items: Item[], edges: EdgeFn): Story[]` | graph build + connected components; `EdgeFn` is the seam where embedding edges slot in later |
| score | `scoreStories(stories: Story[], now: Date): ScoredStory[]` | the Signal formula |
| summarize | `summarizeTop(stories: ScoredStory[], n): Promise<SummarizedStory[]>` | batching, grounding contract, citation checks |
| publish | `toFeedJSON(stories): FeedDocument` | the versioned wire contract |

## Stage-2 amendments (2026-08-13, after prototype + aggregator research)

Validated on real data (`pipeline/scripts/prototype-signal-*.ts`, run 2026-08-12) and the
aggregator research (`docs/research/2026-08-13-how-aggregators-decide-importance.md`):

1. **Percentile is per-source, not pooled.** Pooling engagement across sources lets
   GitHub's lifetime star counts compress HN's scale (observed: a 21-point story
   outranking a 642-point one). Each item's engagement percentile is computed against its
   own source's engagement population in the window.
2. **Source expansion to the practical maximum** (all live-verified 2026-08-13): +8 news
   outlets (TechCrunch AI, Verge AI, Ars Technica AI, VentureBeat AI, Wired AI, MIT Tech
   Review AI, IEEE Spectrum AI, The Register AI), +5 labs (Microsoft Research, NVIDIA,
   Apple ML, AWS ML, EleutherAI), +5 practitioner blogs (Simon Willison, Import AI,
   Interconnects, Latent Space, Ahead of AI), +2 Reddit subs via their working `.rss`
   endpoints (r/LocalLLaMA, r/MachineLearning), **+Google News RSS query feeds** (per-lab
   and topic queries, `when:1d`) — the free ride on Google's whole-web crawl. Google News
   items are attributed to their real outlet via the RSS `<source>` element, and their
   redirect URLs are decoded to the real article URL (fallback: keep the redirect URL —
   the item survives, only cross-source dedup misses it).
3. **Velocity term.** The pipeline reads its own previously-published `state.json`
   (engagement per item id at the prior tick) from Pages, and boosts items whose
   engagement is climbing: `velocity = max(0, Δengagement-percentile per hour)`. NewsWhip
   at personal scale; two samples, no forecasting.
4. **Signal v2:** per story,
   `signal_raw = (engagement_pctile_per_source + k·(pickup − 1) + v·velocity) · decay`
   with `pickup` = distinct Sources (now meaningful: curated-source ∩ Google-News hits),
   `k = 0.5`, `v = 0.5`, `decay = 1/(age_h+2)^1.6`. Published `signal` = rank-mapped 0–99.
   **Alert is substance-gated** (revised 2026-08-13 post-launch, user-approved): `alert =
   signal ≥ 90 AND (pickup ≥ 2 OR engagement-percentile ≥ 0.9)` — an ALERT claims
   importance, not merely recency-rank. Stories in `feed.json` are ordered by signal.
5. **The app displays ranked order** when signal is present (signal desc, nil-signal items
   after, then recency) and renders the **Signal badge** (tier-tinted number, ALERT flag)
   in the telemetry eyebrow.
6. **GitHub fetcher parked** — its lifetime-stars measure never survives decay (observed);
   rework to trending/recently-created in a later stage. It stays in the catalog but its
   engagement contribution is expected ~nil.

## The Signal formula

Per story (cluster), all-universal signals, **no per-source hand-weights** in the core:

```
engagement = percentile of the story's max engagement among engagement-bearing
             items in the window                     ∈ [0,1]; no signal → prior 0.4
corrob     = distinct sources in the cluster         (Techmeme's core signal)
decay      = 1 / (age_hours + 2)^1.6                 (HN-style power decay,
                                                      dominant term per audit)
signal_raw = (engagement + k·(corrob − 1)) · decay   k = 0.5 initially
Signal     = signal_raw mapped to 0–99 by rank within the published feed
Alert      = top tier (Signal ≥ 90) — v1 semantics: badge on next open, NO push
```

Percentile-compression of engagement (like HN's `^0.8`, Reddit's `log10`) is what makes
firehose volume self-defeating: posting more just fills low percentiles. Constants
`(prior, k, exponent)` live in one config block. Per the audit's HN-penalties lesson, a
manual per-source multiplier map exists in config from day one — default all `1.0`, used
only if reality demands it.

Fetchers are widened to carry `engagement` (HN points, GitHub stars, HF paper upvotes) —
data our Swift fetchers currently throw away. Blogs/arXiv have none → prior.

## Summarization grounding contract (phase-B rule, enforced here)

- Input to the model: **only** title + fetched text/snippets of the story's member items,
  each tagged with its source URL.
- Output: neutral headline + one "why it matters" sentence + the member URLs as citations.
- If member text can't be fetched → **no summary**; the feed falls back to the
  feed-provided Snippet. Summaries are additive, never a replacement for real links.
- The prompt + a fixture-based contract test live in the repo; violations (content not
  attributable to inputs) fail the test.

## The wire contract (`feed.json`)

Versioned envelope; items are the app's existing `FeedItem` shape **plus** ranking fields,
so the Swift decoder change is additive:

```jsonc
{
  "version": 1,
  "generatedAt": "2026-08-12T14:00:00Z",
  "stories": [{
    "id": "…",                     // canonical member's itemID
    "title": "…",                  // summarized headline if present, else lead item title
    "snippet": "…",                // feed-provided snippet (never invented)
    "summary": "…" ,               // optional, grounded+cited (null when not generated)
    "url": "…",                    // lead item's real URL
    "sources": [{"name": "…"}],    // union across the cluster
    "category": "models",
    "publishedAt": "…",
    "imageURL": null,
    "signal": 87,                  // 0–99
    "alert": false,
    "members": [{"title": "…", "url": "…", "source": "…"}]  // the cluster, for grouped UI
  }]
}
```

## iOS app changes (small, behind existing seams)

1. `RemoteFeedFetcher: Fetcher` — GETs `feed.json`, decodes, maps to `FeedItem`s
   (+ new optional `signal`/`alert`/`members` fields on `FeedItem`).
2. Composition root: remote-first; on-device fetchers remain as offline fallback
   (stale-cache → on-device refresh when the remote fetch fails).
3. UI: **Signal badge** on cards (number tinted by tier, top tier flagged ALERT — fits the
   telemetry eyebrow), and mis-clusters must read as a shrug: members render as a
   "also covered by …" row, never merged content.

## Testing

Same discipline as the engine: each stage TDD'd against fixtures (recorded API responses);
score + cluster are pure-function tests with independent expected values; a **contract
test** asserts `feed.json` decodes with the Swift decoder (shared fixture); one gated live
smoke for the full pipeline.

## Build order

1. Repo + pipeline skeleton: ingest (ported fetchers) → dedup → publish unranked
   `feed.json`; GHA schedule; app's `RemoteFeedFetcher` end-to-end.
2. Score (Signal) + badge UI. Feed is now *ranked* — the visible product jump.
3. Cluster v1 (title-similarity graph) + "also covered by" UI; start logging pair data.
4. Summaries (Haiku Batch, grounding contract + tests).
5. Measured upgrades: embedding edges if week-1 data shows paraphrase-misses ≥ a few/day;
   velocity term; push Alerts (would move script to Render cron + APNs — only if wanted).

## Decisions taken (flag in review if you disagree)

- **Public repo** for the pipeline (free unlimited Actions minutes; the data is public anyway).
- **Alert = badge on open**, no push in v1 (the only requirement that would re-justify a server).
- **Cadence 30 min** initially (fits even private-repo limits if we flip visibility).
- Embeddings deferred until measured need (open question 5 of the audit).

## Open questions

- Exact title-similarity edge rule for cluster v1 (shingle size, threshold) — calibrate on
  week-1 logged data; start conservative (high precision, merge less).
- Where summaries appear in UI (replace snippet vs. separate styled line) — decide at stage 4.
