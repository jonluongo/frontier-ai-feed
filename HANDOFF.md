# Frontier AI Feed — Project Handoff

> Purpose of this doc: preserve every decision made during brainstorming so a **fresh
> Claude Code session (using Matt Pocock's skills)** can pick up with zero context loss.
> Written 2026-08-11.

## What we're building

An **iOS app** — an "Apple News–style feed, but for tracking the AI frontier." A rich,
scrollable, card-based feed the user scrolls **every morning to stay ahead** of how fast
AI is changing (new models, tooling, techniques, research).

**Hard requirement:** it aggregates and links **real, free, public internet sources** —
it must **never invent/hallucinate** content. Cards link out to the real source.

## Locked decisions

| Decision | Choice |
|---|---|
| Platform | **Real native iOS app** (SwiftUI), not a web app |
| User's role | Build in thoughtful **blocks**; prioritize clean, well-organized code/structure over speed |
| Content types | **All four**: model releases/updates, tools/plugins/repos, techniques/how-tos, research/papers |
| Feed style | Apple News–style rich cards (real title, source, time, snippet, thumbnail if feed provides one) |
| Architecture | **Path A: on-device only**, source-abstracted, AI-ready. No backend in phase 1. |
| Future-proofing | Clean `FeedSource` protocol + unified `FeedItem` model so an AI-summary layer (B) or backend (C) can slot in later without touching downstream code |
| Skill philosophy driving the build | **Matt Pocock's skills** (`codebase-design`, `domain-modeling`, `to-spec`, `tdd`, `implement`) — installed as a Claude Code plugin |

### Architecture paths considered (for the record)
- **A (chosen):** app fetches free public feeds directly, normalizes, renders. No server, no cost, private, ships to phone today. No LLM summaries in phase 1.
- **B (later):** A + per-card LLM "why it matters" summary generated from the *real fetched text* only. Needs an API key in-app; ~cents per refresh.
- **C (later):** backend/scheduled aggregator dedupes + summarizes once, app displays a clean JSON feed. Most powerful, but real infra to maintain.

## Design so far — HALF 1 (engine) — APPROVED IN SPIRIT, not yet written to spec

**Stack:** SwiftUI, iOS 17+, Swift concurrency (`async/await`), Swift Package Manager.
No third-party deps in phase 1 (`URLSession` + built-in `XMLParser`).

**Module layout:**
```
FrontierAIFeed/
├── App/          → app entry, root view
├── Models/       → FeedItem, Category, SourceInfo
├── Sources/      → FeedSource protocol + one file per source
├── Services/     → FeedRepository (aggregator), NetworkClient, FeedCache
├── Features/     → Feed UI, card views, in-app reader, Settings
└── Shared/       → design system (color/type), extensions
```

**Core model:**
```swift
struct FeedItem: Identifiable, Codable, Hashable {
    let id: String          // stable hash of source + url
    let title: String
    let summary: String?    // snippet FROM the feed (never invented)
    let url: URL            // the real link out
    let source: SourceInfo  // e.g. "Hacker News", "arXiv"
    let category: Category  // .models / .tools / .techniques / .research
    let publishedAt: Date
    let imageURL: URL?      // feed-provided thumbnail if any
}

protocol FeedSource {
    var displayName: String { get }
    var category: Category { get }
    func fetch() async throws -> [FeedItem]
}
```

**Phase-1 sources (all free, official/public endpoints, proper User-Agent, polite caching):**
| Source | Feeds | Fills |
|---|---|---|
| Hacker News | official Firebase API, AI-keyword filtered | Tools, Techniques, Top |
| arXiv | Atom API — cs.AI, cs.CL, cs.LG | Research |
| Hugging Face | trending models + papers API | Models, Research |
| GitHub | search API — new/trending AI repos | Tools/repos |
| Reddit | public JSON — r/LocalLLaMA, r/MachineLearning | mixed |
| RSS (generic) | OpenAI, Anthropic, Google/DeepMind, Meta AI, HF blog | Models, Techniques |

- One generic `RSSSource` reads any RSS/Atom URL from a **config list** (adding/removing a blog = one-line change).
- Categorization: source-declared default + light keyword rules (e.g. "launches"/"release" → Models).

## Design — HALF 2 (UI + build order) — NOT YET PRESENTED

Was about to cover, still open for discussion in the next session:
- **UI/navigation:** single scrollable "Frontier" feed + horizontal category filter chips + pull-to-refresh; lead card + standard cards; tap → in-app reader (`SFSafariViewController`); a Sources/Settings screen.
- **Fetch/refresh/caching:** show cached feed instantly on launch, refresh in background; pull-to-refresh; **per-source failure isolation** (one dead source never blanks the feed); cache = Codable JSON to disk + in-memory (no CoreData in phase 1).
- **Testing:** TDD; per-source parser tests against **saved fixture responses** (no live network in tests); FeedRepository dedup/merge/sort tests; networking behind an injected protocol for stubbing.
- **Phased implementation blocks:**
  1. Scaffold + design system + models + `FeedSource` protocol + **one source (HN) end-to-end** (vertical slice)
  2. Add remaining sources one at a time (parser + fixture test each)
  3. Apple-News card UI + category filter + in-app reader
  4. Caching + refresh + error isolation polish
  5. (Later) AI-summary layer (B); saved/bookmarks; notifications

## Next steps when you resume

1. Confirm plugin installed: `claude plugins install mattpocock-skills` (done before restart).
2. Run **`/setup-matt-pocock-skills`** once in this repo (asks: issue tracker, triage labels, docs location).
3. Then drive with Matt's skills: **`/to-spec`** (or `codebase-design` / `domain-modeling`)
   to turn this handoff + Half 2 into a formal spec, then `/implement` + `/tdd` block by block.
4. First coding block = the **HN vertical slice** (item 1 above).

## Progress log

**2026-08-12 — session 2 (Opus, Matt Pocock skills).**
- `/setup-matt-pocock-skills`, `/to-spec`, `/implement` no longer exist; the installed
  skills are `domain-modeling`, `codebase-design`, `tdd`, `code-review`, etc. Drove with
  those instead. Tracking kept lightweight (this doc + `CONTEXT.md` + ADRs).
- **Domain model locked** → `CONTEXT.md`. Key sharpenings: `summary`→**Snippet** (reserve
  "Summary" for the future AI layer); split the overloaded "source" into **Source**
  (on-card origin, toggled in Settings) vs **Fetcher** (endpoint adapter). Settings toggles
  individual Sources.
- **ADR-0001**: Item identity = normalized URL (cross-source dedup), replacing the
  handoff's `source+url` hash.
- **Engine built + tested** as a Swift Package `FrontierFeedKit/` (so it's TDD'd headlessly
  via `swift test`, no simulator). Seam design in `docs/design/engine-seams.md`. Slices,
  all red→green: (1) Item identity, (2) models + `mergeFeed`, (3) `HackerNewsFetcher` via
  `NetworkClient` seam with saved fixtures, (4) `FeedRepository` actor (concurrent fan-out,
  failure isolation, cache). Live adapters `LiveNetworkClient` + `JSONFileCache` added.
  **14 tests green.**
- **All Fetchers built + tested** (slices 3, 5–9), each fixture-driven (real captured
  fixtures for the JSON APIs): `HackerNewsFetcher`, `SyndicationParser` (Atom + RSS 2.0),
  `RSSFetcher` (generic, config-driven, `maxItems`-capped), `GitHubFetcher`,
  `HuggingFaceFetcher` (daily papers). **arXiv + all blogs = `FeedConfig`s in
  `FeedCatalog`**, no bespoke code. Composition root: **`FeedRepository.live()`**.
- **Reddit dropped for now**: its public `.json` returns **403** (OAuth-gated). Needs auth
  to add later; not baked in as a dead source.
- **Live end-to-end verified** (`LIVE=1 swift test`, gated off by default): real refresh
  returns **~239 items across 8 sources** (arXiv, OpenAI, Google DeepMind, Google AI,
  Google Research, Hugging Face, BAIR, Hacker News, GitHub), sorted + deduped. **21 offline
  tests green** + 1 live smoke.
- **NEXT:** SwiftUI app shell — Xcode project **Frontier AI Feed** /
  `com.jonluongo.FrontierAIFeed` / iOS 17, depending on `FrontierFeedKit`, calling
  `FeedRepository.live()`. Apple-News card feed + category chips + pull-to-refresh + in-app
  reader (`SFSafariViewController`). Then: real cross-source categorization (HN defaults to
  `.tools`, blog categories are provisional source defaults); Settings to toggle Sources;
  Reddit via auth; the AI-summary layer (phase B).

## Open questions to resolve in spec
- Min iOS version (proposed **17**).
- Exact starter RSS URL list (some company blogs' RSS availability varies).
- Reddit subs beyond r/LocalLLaMA + r/MachineLearning?
- Bundle id / app name (working name: **Frontier AI Feed**).
