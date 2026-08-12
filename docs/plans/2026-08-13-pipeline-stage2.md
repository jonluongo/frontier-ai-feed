# Pipeline Stage 2 Implementation Plan — every source + Signal ranking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the pipeline to every live-verified free source (incl. Google News query feeds and Reddit RSS) and publish a Signal-ranked feed the app renders with badges.

**Architecture:** Per the Stage-2 amendments in [the design spec](../design/2026-08-12-backend-pipeline-design.md): new catalog entries ride the existing `rssFetcher`; one new `googleNewsFetcher` (source-element attribution + redirect-URL decoding); a pure `score.ts` (per-source percentile + pickup + velocity + decay → 0–99 signal); velocity state read from the pipeline's own previously-published `state.json`; the app orders by signal and renders the badge.

**Tech Stack:** unchanged (TS/vitest pipeline; Swift 6 package; GHA + Pages).

## Global Constraints

- All Stage-1 global constraints hold (no live network in tests; ISO dates no fractional seconds; engagement never published on stories; ADR-0001 identity; polite User-Agent; explicit field lists in publish).
- New wire fields on stories: `signal` (int 0–99) and `alert` (bool) — never absent in Stage-2 output; `stories` array ordered by signal desc. A new sibling artifact `state.json` `{version:1, generatedAt, engagement: {"<itemID>": <number>}}` is published next to feed.json.
- Scoring constants live in ONE config object: `prior=0.4, k=0.5, v=0.5, decayExp=1.6, alertThreshold=90`.
- Google News queries (exactly these five, `when:1d`, hl=en-US&gl=US&ceid=US:en): `"OpenAI"`, `"Anthropic"`, `"Google DeepMind" OR "Gemini"`, `"Meta AI" OR "Mistral" OR "xAI"`, `"artificial intelligence"`. Cap 25 items/query.
- Existing tests must stay green on both sides.

## File Structure

```
pipeline/src/catalog.ts                 (Task 1: +20 verified FeedConfigs)
pipeline/src/fetchers/googlenews.ts     (Task 2)
pipeline/src/score.ts                   (Task 3: pure scoring module)
pipeline/src/publish.ts                 (Task 4: +signal/alert fields, +toStateJSON)
pipeline/src/main.ts                    (Task 4: read prev state, score, write both files)
FrontierFeedKit/.../MergeFeed.swift     (Task 5: signal-aware ordering)
FrontierFeedKit/.../FeedCardView.swift  (Task 6: Signal badge + ALERT)
```

---

### Task 1: Catalog expansion (all verified sources)

**Files:**
- Modify: `pipeline/src/catalog.ts`
- Modify: `pipeline/test/rss.test.ts` (add catalog-shape test)

**Interfaces:**
- Produces: `CATALOG` grows from 7 to 27 `FeedConfig` entries. All URLs below were live-verified 2026-08-13; copy them EXACTLY. Categories: news outlets → `"models"` is wrong — news outlets and Reddit → the closest source-default per row below. Source names are the display names shown on cards.

| url | source.name | category |
|---|---|---|
| https://techcrunch.com/category/artificial-intelligence/feed/ | TechCrunch | models |
| https://www.theverge.com/rss/ai-artificial-intelligence/index.xml | The Verge | models |
| https://arstechnica.com/ai/feed/ | Ars Technica | models |
| https://venturebeat.com/category/ai/feed/ | VentureBeat | models |
| https://www.wired.com/feed/tag/ai/latest/rss | Wired | models |
| https://www.technologyreview.com/topic/artificial-intelligence/feed | MIT Tech Review | research |
| https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss | IEEE Spectrum | research |
| https://www.theregister.com/software/ai_ml/headlines.atom | The Register | tools |
| https://www.microsoft.com/en-us/research/feed/ | Microsoft Research | research |
| https://blogs.nvidia.com/feed/ | NVIDIA | models |
| https://machinelearning.apple.com/rss.xml | Apple ML | research |
| https://aws.amazon.com/blogs/machine-learning/feed/ | AWS ML | techniques |
| https://blog.eleuther.ai/index.xml | EleutherAI | research |
| https://simonwillison.net/atom/everything/ | Simon Willison | techniques |
| https://jack-clark.net/feed/ | Import AI | research |
| https://www.interconnects.ai/feed | Interconnects | research |
| https://www.latent.space/feed | Latent Space | techniques |
| https://magazine.sebastianraschka.com/feed | Ahead of AI | techniques |
| https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day | r/LocalLLaMA | tools |
| https://www.reddit.com/r/MachineLearning/top/.rss?t=day | r/MachineLearning | research |

- [ ] **Step 1:** Add a failing test to `pipeline/test/rss.test.ts`: `CATALOG` has 27 entries, all URLs unique, all source names unique, every entry's category is a valid `FeedCategory`. (Independent expected value: `expect(CATALOG).toHaveLength(27)`.)
- [ ] **Step 2:** Run — FAIL (length 7).
- [ ] **Step 3:** Append the 20 rows above to `CATALOG` verbatim.
- [ ] **Step 4:** Run — PASS (full suite; `tsc` clean).
- [ ] **Step 5:** Commit `"pipeline: catalog to 27 sources (news, labs, practitioners, reddit rss)"`.

---

### Task 2: Google News fetcher

**Files:**
- Create: `pipeline/src/fetchers/googlenews.ts`, `pipeline/test/googlenews.test.ts`
- Create fixture: `pipeline/test/fixtures/googlenews_openai.xml` — CAPTURE REAL: `curl -s -H "User-Agent: FrontierAIFeed-Pipeline/1.0" "https://news.google.com/rss/search?q=%22OpenAI%22%20when%3A1d&hl=en-US&gl=US&ceid=US:en" | head -c 40000` then truncate to a well-formed doc with the first ~6 `<item>`s (close all tags). Use the captured literals in test expectations.

**Interfaces:**
- Produces: `GOOGLE_NEWS_QUERIES: string[]` (the 5 query strings from Global Constraints) and `googleNewsFetcher(queries = GOOGLE_NEWS_QUERIES, perQuery = 25): (client: FetchClient) => Promise<Item[]>`.
- Behavior: for each query build `https://news.google.com/rss/search?q=<encodeURIComponent(query + " when:1d")>&hl=en-US&gl=US&ceid=US:en`; parse with the existing `parseSyndication`; per item:
  - **Source attribution:** Google News RSS items carry `<source url="…">Outlet Name</source>`. `parseSyndication` does not expose it — extract source names in this fetcher by regex over the raw XML per item block, OR (preferred) extend `SyndicationEntry` with `sourceName: string | null` populated from the `source` element (RSS only; null elsewhere) — extending the parser is the cleaner seam; do that, keeping all existing parser tests green.
  - `sources: [{ name: entry.sourceName ?? "Google News" }]`
  - **URL decode:** item links look like `https://news.google.com/rss/articles/CBMi…`. Implement `decodeGoogleNewsURL(link: string): string | null` — take the last path segment, base64url-decode (padding-tolerant, latin1), regex-extract the first `https?://[^\x00-\x1f"\\]+` that is NOT a google.com URL; return null if none. Item url = decoded ?? original link (fallback keeps the item; dedup just won't cross-match).
  - Title cleanup: Google appends ` - Outlet` to titles; strip a trailing ` - <sourceName>` when it matches.
  - `category: "models"` default, `engagement: null`, dedupe within the fetcher by `itemID` across queries (same story matches multiple queries).
- Failure isolation: one query failing (throw) must not kill the others (per-query try/catch, like per-item elsewhere).

- [ ] **Step 1:** Capture fixture; write failing tests: (a) parses items with real-outlet Source names (captured literals), (b) `decodeGoogleNewsURL` returns a non-google https URL for a captured CBMi link (assert the actual decoded literal) and null for garbage, (c) cross-query dedupe (same fixture mapped to two query URLs → no duplicate ids), (d) title suffix stripped.
- [ ] **Step 2:** RED. **Step 3:** implement (incl. `SyndicationEntry.sourceName`). **Step 4:** GREEN (whole suite). **Step 5:** Commit `"pipeline: Google News query fetcher (outlet attribution, URL decode)"`.

---

### Task 3: Scoring module

**Files:**
- Create: `pipeline/src/score.ts`, `pipeline/test/score.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ScoreConfig { prior: number; k: number; v: number; decayExp: number; alertThreshold: number }
export const DEFAULT_SCORE_CONFIG: ScoreConfig = { prior: 0.4, k: 0.5, v: 0.5, decayExp: 1.6, alertThreshold: 90 };
export interface ScoredItem { item: Item; signal: number; alert: boolean }
export function scoreFeed(
  items: Item[],
  nowISO: string,
  prevEngagement: Record<string, number>,  // itemID -> engagement at previous tick
  prevGeneratedAt: string | null,          // ISO of previous tick (for Δt hours)
  config?: ScoreConfig
): ScoredItem[]
```
- Pure; deterministic. Per item: `pct` = percentile of engagement within its `sources[0].name` population (items with engagement only), else `prior`; `pickup = item.sources.length`; `velocity` = if prev engagement exists for this id and Δt > 0: `max(0, pctNow − pctPrevProxy)/Δt_hours` where `pctPrevProxy` = percentile of the PREVIOUS engagement value within the CURRENT source population (both computed same way — avoids storing populations); else 0. `raw = (pct + k·(pickup−1) + v·velocity) · 1/(age_h+2)^decayExp`. Sort raw desc, tie-break newer `publishedAt` first, then id asc (total order — fixes the Stage-1 parked comparator finding for this path). `signal` = `round(99 · (n−1−rank)/(n−1))` (rank 0 = 99, last = 0; n=1 → 99). `alert = signal ≥ alertThreshold`.
- Percentile function: fraction strictly below + half ties (same as prototype).

- [ ] **Step 1:** Failing tests with hand-computed literals: (a) per-source percentile — HN item with 600pts beats HN 20pts; a GitHub 100k-star item does NOT outrank HN 600 merely via scale (same-age items); (b) no-engagement item gets prior (blog beats nothing but isn't zero); (c) pickup: 2-source item beats identical 1-source item; (d) velocity: rising engagement beats static (same item id in prevEngagement with lower value); (e) decay: identical items, 2h vs 30h → newer wins; (f) signal mapping: top item 99, bottom 0, alert only ≥ 90; (g) deterministic tie-break.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN. **Step 5:** Commit `"pipeline: Signal scoring (per-source percentile, pickup, velocity, decay)"`.

---

### Task 4: Wire scoring + state into publish/main

**Files:**
- Modify: `pipeline/src/publish.ts`, `pipeline/src/main.ts`
- Modify: `pipeline/test/publish.test.ts`, `pipeline/test/pipeline.test.ts`

**Interfaces:**
- `FeedStory` gains `signal: number; alert: boolean`. `toFeedDocument(scored: ScoredItem[], generatedAt: string): FeedDocument` now takes scored items (already sorted) — explicit field list still excludes engagement.
- New: `toStateJSON(items: Item[], generatedAt: string): {version: 1, generatedAt: string, engagement: Record<string, number>}` (only items with non-null engagement).
- `runPipeline(client, now)` becomes `runPipeline(client, now, prevState: {generatedAt: string, engagement: Record<string,number>} | null)` → `{feed: FeedDocument, state: StateDocument}`; adds `googleNewsFetcher()` to the fetcher list.
- `main.ts` CLI: fetch previous state from `https://jonluongo.github.io/frontier-ai-feed/state.json` via `liveClient` (try/catch → null on any failure — first run has none); write BOTH `dist/feed.json` and `dist/state.json`; keep the ≥20-stories floor.

- [ ] **Step 1:** Failing tests: publish test asserts stories carry signal/alert, are signal-desc ordered, and still never carry engagement; pipeline integration test threads a fake prevState and asserts a velocity-boosted item outranks its static twin; state.json output shape asserted with literals.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + regenerate the Swift contract fixture via `pipeline/scripts/make-contract-fixture.ts` (update it for the new runPipeline signature; fixture now includes signal/alert) and confirm `swift test` still passes (Swift decoder already tolerates the new fields). **Step 5:** Commit `"pipeline: publish ranked feed + state.json (velocity across ticks)"`.

---

### Task 5: Swift — signal-aware ordering

**Files:**
- Modify: `FrontierFeedKit/Sources/FrontierFeedKit/MergeFeed.swift`
- Modify: `FrontierFeedKit/Tests/FrontierFeedKitTests/MergeFeedTests.swift`, `RemoteFeedFetcherTests.swift`

**Interfaces:**
- `mergeFeed` final sort becomes: signal desc (nil-signal items after all signal-bearing ones), then `publishedAt` desc, then `id` asc. When duplicates merge, the representative keeps the **max** signal of its occurrences (remote signal survives a merge with an on-device copy).
- Contract test gains assertions on the regenerated fixture's signal/alert literals and ordering.

- [ ] **Step 1:** Failing tests: (a) item with signal 80 precedes newer item with no signal; (b) two signal items order desc; (c) merged duplicate keeps signal. **Step 2:** RED (`swift test`). **Step 3:** implement. **Step 4:** GREEN (all suites). **Step 5:** Commit `"app: feed orders by Signal (nil-signal after, then recency)"`.

---

### Task 6: Signal badge UI

**Files:**
- Modify: `FrontierAIFeed/Views/FeedCardView.swift`

**Interfaces:**
- Consumes `FeedItem.signal: Int?`, `FeedItem.alert: Bool?`.
- Eyebrow gains a trailing badge when `signal != nil`: monospaced number in a small rounded rect, tinted by tier — signal ≥ 90: category tint at full strength + the text `ALERT` beside the number; ≥ 60: category tint at 60%; else secondary gray. Keep the telemetry aesthetic (Theme.eyebrow font). No badge when signal is nil (on-device-only items).

- [ ] **Step 1:** implement badge in `FeedCardView` (app target has no test bundle — UI verified visually in Task 7). **Step 2:** `xcodebuild` for simulator — BUILD SUCCEEDED. **Step 3:** Commit `"app: Signal badge + ALERT flag in card eyebrow"`.

---

### Task 7: Ship + live verify (controller-run)

- [ ] **Step 1:** Push branch → merge to master → push; `gh workflow run pipeline.yml`; watch green.
- [ ] **Step 2:** curl the live feed.json: assert stories have signal, ordered desc, count from the wider catalog (expect ≥ 300); state.json exists. Second manual `gh workflow run` after ≥10 min proves velocity path (state read OK, no crash).
- [ ] **Step 3:** Build + install + launch in simulator; screenshot; confirm badges render and ordering is by signal; send screenshot to user.
- [ ] **Step 4:** Update HANDOFF progress log; commit.

## Self-review notes
- Spec coverage: amendments 1–5 → Tasks 3/1+2/4/4/5+6; amendment 6 (GitHub parked) = no task, by design.
- Type consistency: `ScoredItem` flows Task 3 → 4; `FeedStory.signal/alert` Task 4 ⇄ Swift decoder (already optional-decodes) ⇄ Task 5 assertions.
- Google News fixture is captured real data; decode expectations use actual literals, per the never-invent rule.
