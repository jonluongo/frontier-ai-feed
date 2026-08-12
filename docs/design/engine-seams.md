# Engine seams (phase 1)

Design of the fetch → normalize → merge → cache → display engine, as deep modules.
Terms follow `codebase-design`: Module / Interface / Seam / Adapter / Depth.

## The five modules

| Module | Interface (what callers must know) | Why it's deep |
|---|---|---|
| **`Fetcher`** (protocol) | `func fetch() async throws -> [FeedItem]` | One method hides an entire endpoint: HTTP calls, pagination/N+1, keyword filtering, and mapping to normalized `FeedItem`s stamped with Source + Category. |
| **`FeedRepository`** | `cachedFeed() -> [FeedItem]` · `refresh() async -> [FeedItem]` | Hides concurrent fan-out across all Fetchers, **per-Fetcher failure isolation**, dedup/merge by normalized URL, sort, and cache read/write. The deepest module in the app. |
| **`NetworkClient`** (protocol) | `func get(_ url: URL) async throws -> Data` | Hides `URLSession`, the polite `User-Agent`, and HTTP-status validation (throws on non-2xx). Callers just get bytes or an error. |
| **`FeedCache`** (protocol) | `load() -> [FeedItem]?` · `save(_:)` | Hides Codable + file IO. Caller never touches disk. |
| **`mergeFeed`** (pure fn) | `mergeFeed(_ groups: [[FeedItem]]) -> [FeedItem]` | Dedups by Item identity, unions the Sources of collapsed duplicates, sorts newest-first. Pure — no IO, no clock. |

Plus one pure helper behind Item identity (ADR-0001):
`canonicalKey(for: URL) -> String` (normalize) and `itemID(for: URL) -> String` (hash of the key).

## Seams — which are real

> *One adapter = a hypothetical seam. Two adapters = a real one.*

- **`Fetcher`** — REAL. `HackerNewsFetcher`, `ArxivFetcher`, `RSSFetcher` all vary here. This is the source-abstraction seam the whole app is built around.
- **`NetworkClient`** — REAL. `URLSessionClient` (live) + `StubNetworkClient` (maps URL → fixture bytes) so parser tests run with **zero live network**.
- **`FeedCache`** — REAL. `JSONFileCache` (live) + `InMemoryCache` (test).
- **`FeedRepository`** — one concrete class, not a protocol. It has no rival adapter; it's a deep implementation, tested directly through its interface using stub Fetchers.

## Testability (accept deps, return results)

`FeedRepository.init(fetchers: [Fetcher], cache: FeedCache)` — every dependency is injected,
nothing is `new`'d inside. Each Fetcher's `init` takes a `NetworkClient`. So a full engine
test wires stub network + in-memory cache + real Fetchers and asserts on the returned
`[FeedItem]` — no mocks of concrete types, no network, no disk.

`mergeFeed` and `canonicalKey` are pure functions → tested in isolation with plain inputs.

## Deletion test

Delete `FeedRepository` and the fan-out/isolation/dedup/sort/cache logic reappears smeared
across every UI call site → it earns its keep. Delete `NetworkClient` and every Fetcher
grows its own `URLSession` + `User-Agent` + status handling, and becomes untestable → earns
its keep.

## Deferred (not needed for the HN slice)

- **Source registry / Settings toggles.** Settings toggles individual Sources; the generic
  `RSSFetcher` owns many Sources. How the enabled-Source set is configured and filtered is
  designed when we build Settings (block 3–4), not now.
- **Surfacing per-Fetcher failures to the UI.** `refresh()` isolates failures silently for
  the slice (a dead Fetcher just yields fewer Items). A richer return type that reports
  failures is an additive change in the polish block.
