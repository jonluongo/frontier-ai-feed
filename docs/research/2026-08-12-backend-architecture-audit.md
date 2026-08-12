# Backend architecture audit — Node/Postgres/pgvector pipeline proposal

> **Date:** 2026-08-12 · **Scope:** adversarial audit of the proposed backend for Frontier AI Feed
> (Node/TS cron worker every ~10 min → embed → cluster → score → summarize → publish `feed.json`,
> on Postgres+pgvector, OpenAI embeddings, Claude summaries).
> **Context:** single personal user, $10–30/mo budget, solo dev + AI agents, working on-device
> Swift engine already exists (`FrontierFeedKit`, ~239 items/refresh across 8 sources, normalized-URL
> dedup per [ADR-0001](../adr/0001-item-identity-is-normalized-url.md)).
> Every price/limit claim below links to the primary page it was read from on 2026-08-12.

---

## Executive verdict

**Directionally right, over-engineered in three specific places, under-specified in one.**

What the proposal gets right:

1. **Publish = one cacheable `feed.json`, thin iOS client.** Correct and worth keeping no matter
   what else changes. It decouples the app from every backend decision and matches the existing
   `FeedItem` JSON model.
2. **LLM summaries are affordable.** ~30 grounded summaries/day on Claude Haiku 4.5 is **~$2–4/mo**
   (half that via the Batch API). Not a budget risk.
3. **TypeScript worker.** Fine; no objection.

What is wrong or over-built:

1. **Postgres + pgvector is overkill.** The corpus is a few hundred new items/day with a
   ~48–72 h clustering window — i.e., **1–3 K live vectors**. pgvector's own README says exact
   scan (no index) is the default and gives perfect recall; at this scale a plain in-process loop
   over the vectors is milliseconds. A managed Postgres adds an external dependency, connection
   management, migrations, and free-tier caveats (Neon autosuspend, Supabase 1-week pause) for
   zero capability you can't get from a SQLite file — or even a JSON snapshot — in the worker.
2. **Online centroid-joining with a single cosine threshold is the weakest specific design
   choice.** It is effectively incremental single-link/centroid clustering, whose failure modes
   (chaining, centroid drift, threshold brittleness) are textbook. Practitioners who do this for a
   living (NewsCatcher) build a **pairwise similarity graph over a window and run community
   detection (Leiden)**, thresholds 0.6–0.8. At 200–600 items/day you can afford to **re-cluster
   the whole window from scratch every tick** — simpler, deterministic, and immune to drift.
   And embeddings shouldn't even be step one: the app already dedups by normalized URL; URL +
   title-similarity heuristics get most of the cross-outlet value first.
3. **An always-on service with a 10-minute cron is the wrong compute shape.** The product is a
   morning-read feed. Nothing in the current requirements needs 10-minute freshness; the only
   thing that would (push "ALERT" notifications) isn't built yet. A **scheduled GitHub Actions
   workflow (free on a public repo)** or a **$1/mo Render cron** covers the actual need. Even if
   you keep the 10-min tick, a private-repo GH Actions setup blows the 2,000 free min/mo, so the
   repo choice matters (details in Q4).

Under-specified: **what triggers an "ALERT" and whether it must push.** That single product
decision is what determines whether you ever need an always-on component. Deferred as an open
question.

**Recommended change:** keep the pipeline stages and the `feed.json` contract; replace the
service+Postgres substrate with a scheduled batch job + SQLite/JSON state; start clustering with
URL+title heuristics and add embeddings as a measured upgrade, using window re-clustering (graph +
connected components/Leiden), not online centroid joining. Full architecture in the final section.

---

## Q1 — Prior art: how real systems actually cluster news

**Google News** — the canonical at-scale system. Greg Linden's first-hand notes on founder Krishna
Bharat's RecSys 2007 keynote: Google News "crawls a broad list of sources, ranks and clusters
them… clustering attempts to group stories on the same event together" using **agglomerative
hierarchical clustering**, with clusters reshuffling over time as follow-ups appear
([glinden.blogspot.com](http://glinden.blogspot.com/2007/10/google-news-krishna-bharat-and-recsys.html)).
The mechanism is patented as "Methods and apparatus for clustering news content"
([US7568148B1](https://patents.google.com/patent/US7568148), continuation
[US8225190B1](https://patents.google.com/patent/US8225190)). Takeaway: even at Google scale the
method is batch/agglomerative over a corpus window — not online centroid-joining.

**Techmeme** — the closest product analog to "cross-outlet story clustering + leaderboard." Its own
About page describes an "editorial pyramid": state-of-the-art crawling at the bottom, "news
filtering and discovery tools… which automatically re-sort our front page" in the middle, and
**human editors making the final calls** at the top
([techmeme.com/about](https://www.techmeme.com/about)). Techmeme famously *abandoned* full
automation in 2008 and hired editors because the algorithm alone was too slow and error-prone on
edge cases ([TechCrunch, "TechMeme Gives Up On Fully Automated News"](https://techcrunch.com/2008/12/03/techmeme-gives-up-on-fully-automated-news-hires-an-editor/)).
Takeaway for a personal app: expect the clusterer to be *wrong sometimes* and design the UI so a
mis-cluster is a shrug (grouped cards), not a correctness failure.

**NewsCatcher** (commercial news API, clustering is a paid product feature) — the most concrete
practitioner spec found: compute article embeddings (multilingual-e5-large, now
Qwen3-Embedding-0.6B), connect pairs whose **cosine similarity exceeds a threshold as edges in a
graph**, run **Leiden community detection**, one cluster per community. Their documented threshold
guidance: **0.6 = larger/looser clusters, 0.7 = default/balanced, 0.8 = smaller/tighter**
([newscatcherapi.com clustering guide](https://www.newscatcherapi.com/docs/news-api/guides-and-concepts/clustering-news-articles)).

**Artifact** (Instagram founders' ML news app, 2023–24) — shut down after ~1 year; Systrom's stated
reason was market size, not tech ("the market opportunity isn't big enough to warrant continued
investment") ([TechCrunch](https://techcrunch.com/2024/01/12/instagram-co-founders-news-aggregation-startup-artifact-to-shut-down/)).
No engineering post-mortem of their clustering pipeline was published that I could find — noting
explicitly that this is absent rather than asserting anything about their internals. The relevant
lesson is economic: world-class ML ranking did not make the news-app category work, so for a
personal tool, backend sophistication is not where the value is.

**When does embedding clustering pay off vs. heuristics?** No primary source states a numeric
corpus threshold. What the primary sources do establish: (a) plain URL canonicalization is the
first-line dedup everywhere (this repo already does it — ADR-0001); (b) commercial systems that
cluster *paraphrased cross-outlet coverage* (Google News, Techmeme, NewsCatcher) all use
content/embedding similarity, because the same story under different headlines on different
domains is invisible to URL/title-exact matching. So: embeddings buy exactly one thing —
**grouping different URLs about the same event**. Whether that's worth it at 200–600 items/day is
a product question (how often do your 8 sources cover the same story under different URLs?), and
it's measurable from data you already have before writing any backend.

## Q2 — Clustering method

**Is online centroid-joining with a cosine threshold sound?** It works until it doesn't, and its
failure modes are well documented:

- **Chaining.** Joining on nearest-neighbor similarity is the single-link criterion; the Stanford
  IR book: "a chain of points can be extended for long distances without regard to the overall
  shape of the emerging cluster," producing straggly merged clusters
  ([Manning et al., *Introduction to Information Retrieval*, §17.2](https://nlp.stanford.edu/IR-book/html/htmledition/single-link-and-complete-link-clustering-1.html)).
  In news terms: "OpenAI releases GPT-x" → "OpenAI pricing" → "OpenAI lawsuit" fuse into one
  mega-story via pairwise-adjacent items.
- **Centroid drift.** Each admitted item moves the centroid; over a multi-day window the centroid
  no longer represents the seed story (this is the incremental version of the same local-criterion
  problem; same source).
- **Threshold brittleness.** NewsCatcher's own published knob spans 0.6–0.8 with materially
  different cluster shapes at each setting ([their guide](https://www.newscatcherapi.com/docs/news-api/guides-and-concepts/clustering-news-articles)) —
  i.e., the practitioners closest to this problem treat the threshold as a tunable with no
  universally correct value, and they *don't* pair it with incremental centroids; they re-run
  graph community detection over the queried set. Note their thresholds are calibrated to *their*
  embedding models (e5-large / Qwen3), not text-embedding-3-small — **no primary source publishes
  a validated threshold for text-embedding-3-small on news dedup**; you'd need to calibrate on
  your own ~week of data. Unverified claim, flagged as such.

**What practitioners do instead (and what fits here):** at 600 items/day with a 72 h window,
the window holds ≤ 1,800 items → ≤ 1.6 M pairwise similarities per full re-cluster — well under a
second in plain TypeScript. So drop "online incremental" entirely: **each tick, re-cluster the
whole window from scratch** — pairwise cosine over the window, edges above threshold, connected
components (or Leiden if components chain in practice). Deterministic, no drift, no special-case
code for "story already exists," and mis-clusters self-heal on the next tick instead of being
locked in.

**Would simpler signals get 80% of the value?** For *dedup*, yes — normalized URL already ships
in the app (ADR-0001), and exact/near-exact title match catches most same-story repeats (HN posts
link the same blog URL the RSS fetcher already fetched — URL identity catches those with zero ML).
For *cross-outlet clustering of paraphrases* ("Anthropic launches X" vs "X, Anthropic's new model"),
title-token/shingle overlap catches the easy half; embeddings catch the rest. A layered design —
URL identity → title-similarity → (later) embedding graph — lets each layer be shipped and
evaluated independently. One caution on MinHash/shingling: it approximates *lexical* overlap, so
it will never bridge fully-paraphrased headlines; treat it as a cheap middle layer, not a
substitute for embeddings if paraphrase grouping is the goal.

## Q3 — Storage

**pgvector at this scale:** the README states "By default, pgvector performs exact nearest
neighbor search, which provides perfect recall," with HNSW/IVFFlat indexes only as an opt-in
speed/recall trade for large tables ([github.com/pgvector/pgvector](https://github.com/pgvector/pgvector)).
At 1–3 K live vectors you would run pgvector in exact mode with no index — meaning Postgres is
contributing *nothing vector-specific*; it's an `ORDER BY cosine LIMIT k` over a few thousand rows.
The same scan in-process (TS loop over 1,800 × 1,536-dim float arrays) is a few milliseconds.

**Managed Postgres free tiers (current, from pricing pages):**

| Provider | Free tier | First paid | Caveats for this workload |
|---|---|---|---|
| Neon | 0.5 GB storage/project, 100 CU-hours, autosuspend after 5 min ([neon.com/pricing](https://neon.com/pricing)) | Launch: usage-based, $0.106/CU-hr + $0.35/GB-mo | Autosuspend = cold-start latency each cron tick; 100 CU-hrs is plenty for a 10-min tick, but it's a metered dependency |
| Supabase | 500 MB DB, **projects paused after 1 week of inactivity**, 2 active projects ([supabase.com/pricing](https://supabase.com/pricing)) | Pro $25/mo | The cron keeps it "active," but the pause rule is a footgun; Pro alone eats the whole budget |

**SQLite (+sqlite-vec) or in-process:** sqlite-vec is a pre-v1 but actively maintained SQLite
extension (Mozilla Builders project) that stores vectors in virtual tables and serves KNN queries;
it runs anywhere SQLite runs ([github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec),
[KNN docs](https://alexgarcia.xyz/sqlite-vec/features/knn.html)). At this corpus size you don't
even need it — vectors as a BLOB column (or a JSON file) plus an in-process cosine loop is
sufficient, and there is nothing to operate, migrate, or authenticate against.

**Verdict:** SQLite file (one file = whole state, trivially backed up as an artifact or committed)
or plain JSON state. Postgres+pgvector is justified only if a second writer or relational
reporting appears — neither is on the roadmap.

## Q4 — Compute shape

Verified pricing/limits for the candidates (all from vendor pages, 2026-08-12):

| Shape | Cost for this workload | Reliability notes |
|---|---|---|
| **GitHub Actions scheduled workflow** | **$0 on a public repo** (standard runners free for public repos); private repos: 2,000 free min/mo on the Free plan ([docs.github.com billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)) | Min interval 5 min; GitHub's own docs: schedule "can be delayed during periods of high loads… some queued jobs may be dropped"; public-repo schedules auto-disable after 60 days of repo inactivity ([events-that-trigger-workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)) |
| **Cloudflare Workers Cron** | Free plan: 100 K req/day but 10 ms CPU/invocation; Paid $5/mo: 30 M CPU-ms included, cron invocations allowed up to 15 min CPU ([workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)); crons run "on underutilized machines," min granularity 1 min ([cron triggers docs](https://developers.cloudflare.com/workers/configuration/cron-triggers/)) | D1 free: 500 MB DB ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)); Vectorize free tier exists, 20 M vectors/index max ([Vectorize limits](https://developers.cloudflare.com/vectorize/platform/limits/)). Whether cron triggers work on the *free* plan is not stated on the pages read — unverified |
| **Fly.io Machines** | shared-cpu-1x/256 MB ≈ **$2.02/mo always-on** (Amsterdam figure on their page); stopped machines bill rootfs only, $0.15/GB per 30 days; no free tier on current pay-as-you-go ([fly.io pricing](https://fly.io/docs/about/pricing/)) | Machines can stop between runs; you'd need an external scheduler or keep it always-on |
| **Render Cron Job** | **$1/mo minimum per cron service**, prorated per-second while running, 12 h max runtime ([render.com/docs/cronjobs](https://render.com/docs/cronjobs)) | Purpose-built for exactly this shape; the cheapest *reliable managed* cron found |
| **Railway** | Hobby $5/mo incl. $5 usage; free tier $1/mo credits; RAM $0.00000386/GB-s ([railway.com/pricing](https://railway.com/pricing)) | Fine but dominated by Render/GHA on price for a batch tick |

**Math that matters:** a 10-min tick = 144 runs/day. At ~2 min/run that's ~8,600 min/mo — 4.3× the
private-repo free allowance, but **$0 on a public repo**. At the cadence the product actually
needs (30–60 min for a morning-read feed), even a private repo fits free tier (~1,400–2,900
min/mo — borderline; public repo removes the question). Cheapest reliable shapes, in order:
**(1) GH Actions on a public repo ($0, accept minutes of cron jitter), (2) Render cron ($1/mo,
tighter timing), (3) Fly machine ($2/mo, always-on).** An always-on Node service is the most
expensive and highest-ops answer to a problem none of the requirements pose.

Publish target: commit `feed.json` to the repo and serve via GitHub Pages/raw (free), or push to
Cloudflare R2/Pages. Either satisfies "one cacheable JSON on a CDN."

## Q5 — Embeddings & LLM costs

Verified prices:

- **OpenAI** text-embedding-3-small **$0.02/1M tokens**; -3-large $0.13/1M; ada-002 $0.10/1M
  ([developers.openai.com pricing](https://developers.openai.com/api/docs/pricing)). Small = 1536
  dims (shortenable via the `dimensions` param), 8,192-token input cap, normalized vectors so
  cosine = dot product ([embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)).
- **Anthropic** ([platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing)):
  Haiku 4.5 **$1 in / $5 out per MTok**; Sonnet 5 $2/$10; Opus 5 $5/$25. **Batch API = 50% off**
  (Haiku batch $0.50/$2.50). Prompt caching: reads at 0.1× input.
- **Voyage AI**: voyage-4-lite $0.02/1M, voyage-4 $0.06/1M, voyage-4-large $0.12/1M, with the
  **first 200 M tokens free per account** on the voyage-4 family ([docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing)).

**Monthly estimate at 500 items/day embedded + 30 summaries/day:**

| Line | Math | Cost |
|---|---|---|
| Embeddings (title+snippet, ~400 tok/item) | 500 × 400 × 30 = 6 M tok × $0.02/M | **$0.12** |
| Summaries, Haiku 4.5 (~3 K in / 200 out each) | in: 2.7 M × $1; out: 180 K × $5 | **$3.60** |
| Same via Batch API | 50% off | **$1.80** |
| **Total LLM+embedding** | | **~$2–4/mo** |

At these numbers there is **no cost case for Voyage over OpenAI** (both are rounding errors;
Voyage's 200 M free tokens would cover ~3 years, which is a nice-to-have, not a decider). The
real question is Q2's: skip embeddings entirely at first — $0.12/mo isn't the reason; avoiding an
unnecessary pipeline stage and an un-calibrated threshold is.

## Q6 — Ranking: what the primary formulas teach

- **Hacker News** (from the published `news.arc` source, analyzed by Ken Shirriff against real
  front-page data): `score = (votes−1)^0.8 / (age_hours+2)^1.8 × penalties` — gravity 1.8 in the
  arc source (`(= gravity* 1.8 …)`); the age exponent exceeding the vote exponent guarantees decay
  to zero; sub-linear votes (`^0.8`) damp runaway winners; and ~20% of front-page items carry
  multiplicative *penalties* (domain penalties 0.25–0.8, a controversy penalty when comments >
  upvotes at 40+ comments) ([righto.com 2013](http://www.righto.com/2013/11/how-hacker-news-ranking-really-works.html),
  [righto.com 2009](http://www.righto.com/2009/06/how-does-newsyc-ranking-work.html),
  [HN discussion of the formula](https://news.ycombinator.com/item?id=1781013)).
- **Reddit hot** (from the open-sourced `_sorts.pyx`):
  `sign · log10(max(|ups−downs|,1)) + seconds_since_epoch/45000`
  ([reddit-archive/reddit `_sorts.pyx`](https://github.com/reddit-archive/reddit/blob/master/r2/r2/lib/db/_sorts.pyx)) —
  i.e., **log-scale the engagement, linear-in-time boost** so each ~12.5 h of recency is worth one
  order of magnitude of votes.
- **Techmeme**: ranks clusters by "recency, source authority, number of independent outlets
  covering the item" per its public descriptions — corroboration count is a first-class signal
  ([techmeme.com/about](https://www.techmeme.com/about); mechanism detail from secondary
  reporting, flagged as such).

**Lessons for the proposed `engagement-percentile + corroboration + exp decay + velocity` score:**
(1) both proven formulas **log/power-compress raw engagement** — percentile-ranking achieves the
same goal and additionally normalizes across sources with incomparable score scales (HN points vs
GitHub stars vs arXiv "no signal"), which is the right move for this product; (2) **time decay is
the dominant term** in both — get decay right before tuning anything else; (3) corroboration
(independent-outlet count) is Techmeme's core signal and falls straight out of the clusterer;
(4) **"velocity" for alerting has no strong primary write-up I could find** — HN's formula rewards
velocity implicitly (early votes beat gravity), but a builder-authored spec for news "velocity
alerts" was not located; treat velocity = Δscore/Δt between ticks as a from-first-principles
design, to be tuned empirically, not as established practice. (5) HN's penalty system is a
reminder that every real ranker grows a manual override layer — a per-source weight in config is
worth having from day one.

## Q7 — The contrarian case: strongest alternative architectures

Scored 1–5 (5 = best) for this product at this scale:

| | Cost | Ops burden | Correctness risk | Upgrade path (clusters/summaries/push) | Notes |
|---|---|---|---|---|---|
| (a) No backend yet — richer on-device ranking in `FrontierFeedKit` | 5 ($0) | 5 | 4 | 2 | Percentile+decay scoring and URL/title clustering are all pure functions over already-fetched items — implementable in the Swift package **today**. Can't do server-side LLM summaries (API key on device, phase B accepts this), can't push, re-does work per device (irrelevant: one user) |
| (b) Scheduled GitHub Action + SQLite/JSON state + `feed.json` to Pages/R2 | 5 ($0–4/mo incl. LLM) | 4 | 4 | 4 | Full pipeline parity with the proposal minus infra. Known caveats are documented and acceptable: cron jitter/drops under load, 60-day inactivity disable, 5-min floor ([GitHub docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)). No always-on process → pull-only, push needs a later addition |
| (c) Cloudflare-only (Cron + D1 + Vectorize + R2) | 4 ($0–5/mo) | 3 | 3 | 4 | Everything fits free/cheap tiers, but: 10 ms CPU/invocation on free is tight for parse+cluster ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)), three proprietary primitives (D1, Vectorize, cron) for a job a single script does, and Vectorize is sized for 20 M vectors — using it for 2 K is pure ceremony |
| (d) Proposed TS service + Postgres + pgvector | 2 ($5–25/mo) | 2 | 3 | 5 | Best upgrade path (always-on → push, websockets, multi-user) — but those are hypothetical; everything real it does, (b) does cheaper with less to operate |

**Recommendation: (b), with (a)'s scoring work done first — they're not exclusive.**
Reasoning: the ranking/clustering *logic* is pure functions either way; write it once, in the
place it can ship this week (the Swift package already has the items and the test harness), then
lift it into the batch job when summaries/persistent-corpus needs arrive. (b) beats (d) because at
one user the only unique capability of an always-on service is push latency — an unbuilt feature —
and it costs 5–10× more plus a database to babysit. (b) beats (c) because a plain script on a VM
runner has no CPU-time ceiling, no vendor-specific storage APIs, and state you can `sqlite3` open
locally. If cron jitter ever actually hurts (it won't for a morning read), the *same script* moves
to a Render cron for $1/mo ([render.com/docs/cronjobs](https://render.com/docs/cronjobs)) — that's
the escape hatch, not Kubernetes.

---

## Final recommended architecture

```
                     GitHub repo (public)
                    ┌──────────────────────────────────────────────┐
 every 30–60 min    │  pipeline.ts (GitHub Actions scheduled job)  │
 (GHA cron)         │                                              │
   ──────────────►  │  1 ingest    HN API · arXiv · HF · GitHub    │
                    │              · RSS  (port of FeedKit configs)│
                    │  2 dedup     normalized URL (ADR-0001 rules) │
                    │  3 cluster   72h window, title-sim graph →   │
                    │              connected components            │
                    │              [later: + embedding edges,      │
                    │               text-embedding-3-small,        │
                    │               threshold calibrated ~0.6–0.8] │
                    │  4 score     per-source engagement percentile│
                    │              + corroboration (cluster size)  │
                    │              + power-law time decay (HN-style)│
                    │  5 summarize top ~30 clusters/day →          │
                    │              Claude Haiku 4.5 (batch, cited  │
                    │              from fetched text only)         │
                    │  6 publish   feed.json → GitHub Pages / R2   │
                    │                                              │
                    │  state: sqlite file (or JSON) cached between │
                    │         runs via actions/cache or committed  │
                    └──────────────┬───────────────────────────────┘
                                   │  GET feed.json (CDN-cached)
                                   ▼
                        iOS app (FrontierFeedKit)
                        RemoteFeedFetcher = one more Fetcher
                        behind the existing seam; on-device
                        fetchers remain the offline fallback
```

One paragraph: a single TypeScript script, run on a schedule by GitHub Actions in a public repo,
re-runs the whole pipeline statelessly over a 72-hour window each tick — ingest the same public
endpoints the Swift package already proved out, dedup by normalized URL, cluster by re-computing a
similarity graph over the window (title heuristics first, embedding edges added only after a week
of logged data shows paraphrase-misses worth catching), score clusters with
percentile-engagement × corroboration × HN-style power decay, summarize the top ~30 clusters via
Claude Haiku 4.5 Batch, and publish one `feed.json` that the iOS app consumes as just another
`Fetcher` behind the existing seam. Total cost ≈ **$2–4/mo** (all LLM), zero servers, zero
databases to operate, and every stage is a pure function testable exactly the way the Swift engine
already is; if scheduling jitter or push notifications ever become real requirements, the same
script relocates to a $1/mo Render cron or a $2/mo Fly machine without redesign.

## Open questions

1. **ALERT semantics.** Is an "ALERT" badge-on-next-open (works with pure batch) or a push
   notification (needs APNs calls from the job + device token storage — still doable from a batch
   job, but a real design task)? This is the only decision that could re-justify shape (d).
2. **Embedding threshold calibration.** No primary source publishes a validated news-dedup cosine
   threshold for text-embedding-3-small; NewsCatcher's 0.6–0.8 band is for different models. Plan:
   log a week of item pairs, hand-label ~100, pick the threshold empirically before enabling the
   embedding layer.
3. **Public vs. private repo.** Public = free unlimited Actions minutes but the pipeline code and
   feed are world-readable (the data is public anyway); private = 2,000 free min/mo, forcing a
   ≥ ~45-min cadence or paid minutes.
4. **Summary grounding contract.** The repo's hard rule is "never invent content." The summarize
   stage must pass only fetched article text and enforce citation of source URLs — worth an ADR
   before phase B ships, including what to do when a page can't be fetched (skip summary, show
   snippet).
5. **Does cross-outlet clustering matter yet?** With 8 curated sources, measure the actual rate of
   same-story-different-URL pairs for a week before building stage 3 beyond URL dedup. If it's
   < a few per day, clustering can stay a UI nicety rather than a pipeline stage.
