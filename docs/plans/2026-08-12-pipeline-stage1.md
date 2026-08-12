# Backend Pipeline Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript pipeline (in `pipeline/` of this repo) that ingests all sources, dedups by normalized URL, and publishes `feed.json` via GitHub Actions + Pages — consumed by the iOS app as one more `Fetcher`.

**Architecture:** One stateless TS script (ingest → dedup → publish), scheduled by GHA cron in this repo made public; per [ADR-0002](../adr/0002-batch-pipeline-not-always-on-service.md). The iOS app adds `RemoteFeedFetcher` behind the existing `Fetcher` seam; on-device fetchers remain the offline fallback. Ranking (Signal) is Stage 2 — this plan publishes an *unranked* but deduped, merged feed.

**Tech Stack:** Node 22, TypeScript (strict), vitest, `fast-xml-parser` (only runtime dep), native `fetch`; Swift 6 / iOS 17 on the app side.

## Global Constraints

- **Never invent content**: every published field comes verbatim from a fetched source.
- URL normalization must match ADR-0001 exactly: lowercase scheme+host, drop fragment, drop trailing slash (path length > 1), strip tracking params (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `ref`, `ref_src`, `cmpid`, `spm`), sort remaining query params by name; id = SHA-256 hex of the canonical key.
- Vocabulary per `CONTEXT.md`: Item, Source (on-card origin), Fetcher (adapter), Snippet, Story, Signal. TS identifiers use these.
- Dates on the wire: ISO-8601 UTC **without** fractional seconds (`2026-08-12T14:00:00Z`).
- `feed.json` envelope: `{"version": 1, "generatedAt": "...", "stories": [...]}`; story fields per the [design spec](../design/2026-08-12-backend-pipeline-design.md) with `signal`/`alert`/`summary`/`members` **omitted** in Stage 1 (all additive later).
- Pipeline tests never touch the live network (stub the fetch client; fixtures only). One gated live smoke (`LIVE=1`).
- Polite `User-Agent` on all pipeline HTTP: `FrontierAIFeed-Pipeline/1.0`.
- Swift: existing 23 tests must stay green; new Swift code follows existing package idioms.

## File Structure

```
pipeline/
├── package.json, tsconfig.json          (Task 1)
├── src/
│   ├── identity.ts                      (Task 2)  canonicalKey, itemID
│   ├── types.ts                         (Task 3)  Item, SourceRef, FeedCategory, FeedConfig
│   ├── dedupe.ts                        (Task 3)  dedupeByURL
│   ├── syndication.ts                   (Task 4)  parseSyndication
│   ├── client.ts                        (Task 5)  FetchClient type + liveClient
│   ├── fetchers/rss.ts                  (Task 5)
│   ├── catalog.ts                       (Task 5)
│   ├── fetchers/hackernews.ts           (Task 6)
│   ├── fetchers/github.ts               (Task 7)
│   ├── fetchers/huggingface.ts          (Task 7)
│   ├── publish.ts                       (Task 8)  toFeedDocument
│   └── main.ts                          (Task 8)
├── test/ (mirrors src/, + fixtures/)
.github/workflows/pipeline.yml           (Task 9)
FrontierFeedKit/Sources/FrontierFeedKit/
│   ├── Models.swift                     (Task 10) + signal/alert
│   ├── RemoteFeedFetcher.swift          (Task 10)
│   └── FeedCatalog.swift                (Task 11) composition root adds remote
```

---

### Task 1: Scaffold the pipeline workspace

**Files:**
- Create: `pipeline/package.json`, `pipeline/tsconfig.json`, `pipeline/test/smoke.test.ts`
- Modify: `.gitignore` (append `node_modules/`, `pipeline/dist/`)

**Interfaces:**
- Produces: a workspace where `npm test` runs vitest; `npm run pipeline` runs `src/main.ts` via tsx (main.ts arrives in Task 8).

- [ ] **Step 1: Write config files**

`pipeline/package.json`:
```json
{
  "name": "frontier-feed-pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "pipeline": "tsx src/main.ts"
  }
}
```

`pipeline/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Install dev deps**

Run in `pipeline/`: `npm install -D typescript tsx vitest @types/node && npm install fast-xml-parser`

- [ ] **Step 3: Write a smoke test** — `pipeline/test/smoke.test.ts`:
```ts
import { expect, test } from "vitest";
test("vitest runs", () => { expect(1 + 1).toBe(2); });
```

- [ ] **Step 4: Run it** — `cd pipeline && npm test` — Expected: 1 passed.

- [ ] **Step 5: Append to repo `.gitignore`**: `node_modules/` and `pipeline/dist/`; commit:
```bash
git add pipeline .gitignore && git commit -m "pipeline: scaffold TS workspace (vitest, tsx, strict)"
```

---

### Task 2: Item identity (port ADR-0001)

**Files:**
- Create: `pipeline/src/identity.ts`, `pipeline/test/identity.test.ts`

**Interfaces:**
- Produces: `canonicalKey(url: string): string`, `itemID(url: string): string` — later tasks import both from `../src/identity.js`. `itemID` = SHA-256 hex of `canonicalKey`.

- [ ] **Step 1: Write the failing tests** — `pipeline/test/identity.test.ts` (expected values are the same independent facts as the Swift suite):
```ts
import { expect, test } from "vitest";
import { itemID } from "../src/identity.js";

test("trailing slash does not change identity", () => {
  expect(itemID("https://openai.com/blog/gpt-5/")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("scheme and host casing does not change identity", () => {
  expect(itemID("HTTPS://OpenAI.com/blog/gpt-5")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("fragment does not change identity", () => {
  expect(itemID("https://openai.com/blog/gpt-5#s2")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("tracking params do not change identity", () => {
  expect(itemID("https://openai.com/blog/gpt-5?utm_source=hn&utm_campaign=x")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("different paths differ", () => {
  expect(itemID("https://openai.com/blog/gpt-5")).not.toBe(itemID("https://openai.com/blog/gpt-4"));
});
test("meaningful query param differs", () => {
  expect(itemID("https://arxiv.org/abs/2401.00001?v=1")).not.toBe(itemID("https://arxiv.org/abs/2401.00001?v=2"));
});
test("different hosts differ", () => {
  expect(itemID("https://openai.com/blog/gpt-5")).not.toBe(itemID("https://anthropic.com/blog/gpt-5"));
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `pipeline/src/identity.ts`:
```ts
import { createHash } from "node:crypto";

const TRACKING = new Set(["fbclid","gclid","mc_cid","mc_eid","igshid","ref","ref_src","cmpid","spm"]);
const isTracking = (name: string) =>
  name.toLowerCase().startsWith("utm_") || TRACKING.has(name.toLowerCase());

/** Canonical, comparable form of a URL (ADR-0001). */
export function canonicalKey(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return raw.toLowerCase(); }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);
  return url.toString();
}

/** Stable Item id: SHA-256 hex of the canonical key. */
export function itemID(raw: string): string {
  return createHash("sha256").update(canonicalKey(raw)).digest("hex");
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` — Expected: all identity tests PASS.

- [ ] **Step 5: Commit**
```bash
git add pipeline/src/identity.ts pipeline/test/identity.test.ts
git commit -m "pipeline: item identity = normalized URL (ADR-0001 port)"
```

---

### Task 3: Core types + dedupeByURL

**Files:**
- Create: `pipeline/src/types.ts`, `pipeline/src/dedupe.ts`, `pipeline/test/dedupe.test.ts`

**Interfaces:**
- Produces (all later tasks import these exact shapes):
```ts
// types.ts
export type FeedCategory = "models" | "tools" | "techniques" | "research";
export interface SourceRef { name: string }
export interface Item {
  id: string;                // itemID(url)
  title: string;
  snippet: string | null;    // feed-provided, never invented
  url: string;
  sources: SourceRef[];
  category: FeedCategory;
  publishedAt: string;       // ISO-8601 UTC, no fractional seconds
  imageURL: string | null;
  engagement: number | null; // HN points / GH stars / HF upvotes; null = no signal
}
export interface FeedConfig { url: string; source: SourceRef; category: FeedCategory }
```
- Produces: `dedupeByURL(groups: Item[][]): Item[]` — flatten, collapse by `id`, union `sources` (first-seen order, by name), keep earliest-`publishedAt` representative, keep **max** engagement, sort newest-first.

- [ ] **Step 1: Write the failing tests** — `pipeline/test/dedupe.test.ts`:
```ts
import { expect, test } from "vitest";
import { dedupeByURL } from "../src/dedupe.js";
import { itemID } from "../src/identity.js";
import type { Item } from "../src/types.js";

const make = (over: Partial<Item> & { url: string }): Item => ({
  id: itemID(over.url), title: "t", snippet: null, sources: [{ name: "A" }],
  category: "models", publishedAt: "2026-01-01T00:00:00Z", imageURL: null,
  engagement: null, ...over,
});

test("same story from two fetchers collapses, unions sources, keeps max engagement", () => {
  const a = make({ url: "https://openai.com/blog/gpt-5", sources: [{ name: "Hacker News" }], engagement: 900 });
  const b = make({ url: "https://openai.com/blog/gpt-5/?utm_source=x", sources: [{ name: "OpenAI" }], engagement: null });
  const out = dedupeByURL([[a], [b]]);
  expect(out).toHaveLength(1);
  expect(out[0]!.sources.map(s => s.name).sort()).toEqual(["Hacker News", "OpenAI"]);
  expect(out[0]!.engagement).toBe(900);
});

test("distinct stories kept, sorted newest-first", () => {
  const older = make({ url: "https://a.com/1", title: "Older", publishedAt: "2026-01-01T00:00:00Z" });
  const newer = make({ url: "https://a.com/2", title: "Newer", publishedAt: "2026-01-02T00:00:00Z" });
  expect(dedupeByURL([[older], [newer]]).map(i => i.title)).toEqual(["Newer", "Older"]);
});

test("earliest publishedAt wins as representative", () => {
  const late = make({ url: "https://a.com/1", publishedAt: "2026-01-05T00:00:00Z" });
  const early = make({ url: "https://a.com/1/", publishedAt: "2026-01-01T00:00:00Z" });
  expect(dedupeByURL([[late], [early]])[0]!.publishedAt).toBe("2026-01-01T00:00:00Z");
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement** — `pipeline/src/types.ts` exactly as in Interfaces above, and `pipeline/src/dedupe.ts`:
```ts
import type { Item, SourceRef } from "./types.js";

/** Collapse duplicates by Item identity; union Sources; keep earliest rep + max engagement. */
export function dedupeByURL(groups: Item[][]): Item[] {
  const rep = new Map<string, Item>();
  const sources = new Map<string, SourceRef[]>();
  for (const item of groups.flat()) {
    const seen = sources.get(item.id) ?? [];
    for (const s of item.sources) if (!seen.some(x => x.name === s.name)) seen.push(s);
    sources.set(item.id, seen);
    const existing = rep.get(item.id);
    if (!existing) { rep.set(item.id, item); continue; }
    const merged: Item = {
      ...(item.publishedAt < existing.publishedAt ? item : existing),
      engagement: [existing.engagement, item.engagement]
        .filter((e): e is number => e !== null)
        .reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null),
    };
    rep.set(item.id, merged);
  }
  return [...rep.values()]
    .map(i => ({ ...i, sources: sources.get(i.id) ?? i.sources }))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`.

- [ ] **Step 5: Commit**
```bash
git add pipeline/src/types.ts pipeline/src/dedupe.ts pipeline/test/dedupe.test.ts
git commit -m "pipeline: core types + dedupeByURL (union sources, max engagement)"
```

---

### Task 4: Syndication parser (RSS 2.0 + Atom)

**Files:**
- Create: `pipeline/src/syndication.ts`, `pipeline/test/syndication.test.ts`
- Create: `pipeline/test/fixtures/atom_feed.xml`, `pipeline/test/fixtures/rss_feed.xml` — **copy verbatim** from `FrontierFeedKit/Tests/FrontierFeedKitTests/Fixtures/` (same names).

**Interfaces:**
- Produces: `parseSyndication(xml: string): SyndicationEntry[]` where
```ts
export interface SyndicationEntry {
  title: string; link: string; summary: string | null;
  published: string | null;   // ISO-8601 UTC no fractional seconds
  imageURL: string | null;
}
```
Malformed input → `[]`; entries without a link are dropped; RFC-822 dates (RSS `pubDate`) are converted to ISO.

- [ ] **Step 1: Copy the two XML fixtures** from the Swift test bundle into `pipeline/test/fixtures/` (`cp` — do not edit contents).

- [ ] **Step 2: Write the failing tests** — `pipeline/test/syndication.test.ts` (same independent expectations as the Swift suite):
```ts
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parseSyndication } from "../src/syndication.js";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("parses Atom entries", () => {
  const e = parseSyndication(fixture("atom_feed.xml"));
  expect(e).toHaveLength(2);
  expect(e[0]!.title).toBe("Attention Is All You Need Again");
  expect(e[0]!.link).toBe("https://arxiv.org/abs/2401.00001");
  expect(e[0]!.summary).toBe("We revisit attention mechanisms.");
  expect(e[0]!.published).toBe("2024-01-01T00:00:00Z");
});

test("parses RSS 2.0 — text link, CDATA description, RFC-822 date, enclosure image", () => {
  const e = parseSyndication(fixture("rss_feed.xml"));
  expect(e).toHaveLength(2);
  expect(e[0]!.title).toBe("Introducing GPT-5");
  expect(e[0]!.link).toBe("https://openai.com/blog/gpt-5");
  expect(e[0]!.summary).toBe("The next model.");
  expect(e[0]!.published).toBe("2024-01-01T00:00:00Z");
  expect(e[0]!.imageURL).toBe("https://openai.com/img/gpt5.png");
  expect(e[1]!.imageURL).toBeNull();
});

test("malformed input yields empty", () => {
  expect(parseSyndication("not xml at all")).toEqual([]);
});
```

- [ ] **Step 3: Run to verify failure**, then **Step 4: Implement** — `pipeline/src/syndication.ts`:
```ts
import { XMLParser } from "fast-xml-parser";

export interface SyndicationEntry {
  title: string; link: string; summary: string | null;
  published: string | null; imageURL: string | null;
}

const toISO = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const d = new Date(raw); // handles both ISO-8601 and RFC-822
  return isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

const text = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && v !== null && "#text" in v) return text((v as Record<string, unknown>)["#text"]);
  return null;
};

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Parse RSS 2.0 or Atom into neutral entries. Malformed → []. */
export function parseSyndication(xml: string): SyndicationEntry[] {
  let doc: Record<string, any>;
  try {
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(xml);
  } catch { return []; }

  const out: SyndicationEntry[] = [];

  for (const item of asArray<any>(doc?.rss?.channel?.item)) {           // RSS 2.0
    const link = text(item.link);
    if (!link) continue;
    const enclosure = asArray<any>(item.enclosure)
      .find(e => String(e?.["@_type"] ?? "").startsWith("image"));
    const media = asArray<any>(item["media:content"]).concat(asArray<any>(item["media:thumbnail"]))[0];
    out.push({
      title: text(item.title) ?? "",
      link,
      summary: text(item.description) ?? text(item.summary),
      published: toISO(text(item.pubDate) ?? undefined),
      imageURL: (enclosure?.["@_url"] ?? media?.["@_url"] ?? null) as string | null,
    });
  }

  for (const entry of asArray<any>(doc?.feed?.entry)) {                  // Atom
    const links = asArray<any>(entry.link);
    const alt = links.find(l => (l?.["@_rel"] ?? "alternate") === "alternate") ?? links[0];
    const link = (alt?.["@_href"] ?? null) as string | null;
    if (!link) continue;
    out.push({
      title: text(entry.title) ?? "",
      link,
      summary: text(entry.summary) ?? text(entry.content),
      published: toISO(text(entry.published) ?? text(entry.updated) ?? undefined),
      imageURL: null,
    });
  }

  return out;
}
```

- [ ] **Step 5: Run to verify pass**, then commit:
```bash
git add pipeline/src/syndication.ts pipeline/test/syndication.test.ts pipeline/test/fixtures/*.xml
git commit -m "pipeline: syndication parser (RSS 2.0 + Atom) with shared fixtures"
```

---

### Task 5: Fetch-client seam, RSS fetcher, catalog

**Files:**
- Create: `pipeline/src/client.ts`, `pipeline/src/fetchers/rss.ts`, `pipeline/src/catalog.ts`, `pipeline/test/rss.test.ts`

**Interfaces:**
- Produces: `type FetchClient = (url: string) => Promise<string>` (the seam every fetcher takes; tests stub it) and `liveClient: FetchClient` (native fetch, `User-Agent: FrontierAIFeed-Pipeline/1.0`, throws on non-2xx).
- Produces: `rssFetcher(config: FeedConfig, maxItems = 25): (client: FetchClient) => Promise<Item[]>`.
- Produces: `CATALOG: FeedConfig[]` — the 7 verified feeds ported verbatim from `FrontierFeedKit/Sources/FrontierFeedKit/FeedCatalog.swift` (same URLs, source names, categories).

- [ ] **Step 1: Write the failing test** — `pipeline/test/rss.test.ts`:
```ts
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { rssFetcher } from "../src/fetchers/rss.js";

const client = async (url: string) => {
  if (url !== "https://openai.com/rss.xml") throw new Error(`unmapped ${url}`);
  return readFileSync(new URL("./fixtures/rss_feed.xml", import.meta.url), "utf8");
};

test("maps a configured feed into Items stamped with Source and Category", async () => {
  const items = await rssFetcher(
    { url: "https://openai.com/rss.xml", source: { name: "OpenAI" }, category: "models" }
  )(client);
  expect(items.map(i => i.title)).toEqual(["Introducing GPT-5", "Research update"]);
  expect(items.every(i => i.sources[0]!.name === "OpenAI")).toBe(true);
  expect(items.every(i => i.category === "models")).toBe(true);
  expect(items[0]!.snippet).toBe("The next model.");
  expect(items[0]!.engagement).toBeNull();
});

test("caps to maxItems keeping newest entries", async () => {
  const items = await rssFetcher(
    { url: "https://openai.com/rss.xml", source: { name: "OpenAI" }, category: "models" }, 1
  )(client);
  expect(items.map(i => i.title)).toEqual(["Introducing GPT-5"]);
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement**:

`pipeline/src/client.ts`:
```ts
export type FetchClient = (url: string) => Promise<string>;

export const liveClient: FetchClient = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "FrontierAIFeed-Pipeline/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
};
```

`pipeline/src/fetchers/rss.ts`:
```ts
import type { FeedConfig, Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";
import { parseSyndication } from "../syndication.js";

/** Generic syndication Fetcher: one FeedConfig per blog/feed (see catalog.ts). */
export const rssFetcher = (config: FeedConfig, maxItems = 25) =>
  async (client: FetchClient): Promise<Item[]> =>
    parseSyndication(await client(config.url)).slice(0, maxItems).map(e => ({
      id: itemID(e.link),
      title: e.title,
      snippet: e.summary,
      url: e.link,
      sources: [config.source],
      category: config.category,
      publishedAt: e.published ?? "1970-01-01T00:00:00Z",
      imageURL: e.imageURL,
      engagement: null,
    }));
```

`pipeline/src/catalog.ts` — port the seven `FeedConfig` entries from `FeedCatalog.swift` verbatim (arXiv query URL, OpenAI news, Google DeepMind, Google AI, Google Research, Hugging Face blog, BAIR — same `source.name` and `category` values).

- [ ] **Step 4: Run to verify pass**, then commit:
```bash
git add pipeline/src/client.ts pipeline/src/fetchers/rss.ts pipeline/src/catalog.ts pipeline/test/rss.test.ts
git commit -m "pipeline: FetchClient seam + generic RSS fetcher + feed catalog"
```

---

### Task 6: Hacker News fetcher (with engagement)

**Files:**
- Create: `pipeline/src/fetchers/hackernews.ts`, `pipeline/test/hackernews.test.ts`
- Create fixtures: copy `hn_topstories.json`, `hn_item_1.json`, `hn_item_2.json`, `hn_item_3.json` verbatim from the Swift test fixtures into `pipeline/test/fixtures/`.

**Interfaces:**
- Consumes: `FetchClient`, `Item`, `itemID`.
- Produces: `hackerNewsFetcher(maxStories = 200): (client: FetchClient) => Promise<Item[]>` — walks `topstories.json` → `item/{id}.json`, keeps AI-relevant stories (regex below), maps `score` → `engagement`, Source `Hacker News`, category `tools`.
- Produces: `isAIRelevant(title: string): boolean` — exported for reuse; the word-boundaried regex ported from `HackerNewsFetcher.swift` verbatim (same alternatives list, case-insensitive).

- [ ] **Step 1: Write the failing tests** — `pipeline/test/hackernews.test.ts`:
```ts
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { hackerNewsFetcher, isAIRelevant } from "../src/fetchers/hackernews.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8");
const base = "https://hacker-news.firebaseio.com/v0";
const client = async (url: string) => {
  const map: Record<string, string> = {
    [`${base}/topstories.json`]: fx("hn_topstories"),
    [`${base}/item/1.json`]: fx("hn_item_1"),
    [`${base}/item/2.json`]: fx("hn_item_2"),
    [`${base}/item/3.json`]: fx("hn_item_3"),
  };
  const hit = map[url];
  if (!hit) throw new Error(`unmapped ${url}`);
  return hit;
};

test("keeps only AI-relevant stories with engagement = HN score", async () => {
  const items = await hackerNewsFetcher()(client);
  expect(items.map(i => i.title)).toEqual(["OpenAI releases GPT-5", "A new LLM benchmark from DeepMind"]);
  expect(items[0]!.engagement).toBe(900);
  expect(items[0]!.sources).toEqual([{ name: "Hacker News" }]);
  expect(items[0]!.publishedAt).toBe("2023-11-14T22:13:20Z"); // epoch 1700000000
});

test("word boundaries: 'email' and 'training' are not AI hits", () => {
  expect(isAIRelevant("Check your email today")).toBe(false);
  expect(isAIRelevant("Marathon training plan")).toBe(false);
  expect(isAIRelevant("OpenAI ships a new agent")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement** — `pipeline/src/fetchers/hackernews.ts`:
```ts
import type { Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";

const ALTS = [
  "ai","llm","llms","gpt","chatgpt","openai","anthropic","claude","gemini",
  "llama","mistral","transformer","transformers","neural","agent","agents",
  "rag","diffusion","embeddings?","inference","deepmind","hugging ?face",
  "machine learning","deep learning","large language models?","fine[- ]tuning",
  "foundation models?","generative ai",
].join("|");
const AI_REGEX = new RegExp(`\\b(${ALTS})\\b`, "i");

export const isAIRelevant = (title: string) => AI_REGEX.test(title);

const BASE = "https://hacker-news.firebaseio.com/v0";

export const hackerNewsFetcher = (maxStories = 200) =>
  async (client: FetchClient): Promise<Item[]> => {
    const ids: number[] = JSON.parse(await client(`${BASE}/topstories.json`));
    const items: Item[] = [];
    for (const id of ids.slice(0, maxStories)) {
      try {
        const s = JSON.parse(await client(`${BASE}/item/${id}.json`));
        if (s?.type !== "story" || !s.title || !s.url || !isAIRelevant(s.title)) continue;
        items.push({
          id: itemID(s.url), title: s.title, snippet: null, url: s.url,
          sources: [{ name: "Hacker News" }], category: "tools",
          publishedAt: new Date((s.time ?? 0) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          imageURL: null, engagement: typeof s.score === "number" ? s.score : null,
        });
      } catch { /* one bad story never kills the fetch */ }
    }
    return items;
  };
```

- [ ] **Step 4: Run to verify pass**, then commit:
```bash
git add pipeline/src/fetchers/hackernews.ts pipeline/test/hackernews.test.ts pipeline/test/fixtures/hn_*.json
git commit -m "pipeline: Hacker News fetcher with engagement (HN score)"
```

---

### Task 7: GitHub + Hugging Face fetchers (with engagement)

**Files:**
- Create: `pipeline/src/fetchers/github.ts`, `pipeline/src/fetchers/huggingface.ts`, `pipeline/test/github.test.ts`, `pipeline/test/huggingface.test.ts`
- Fixture: copy `github_search.json` verbatim from Swift fixtures.
- Fixture: **re-capture** `hf_papers.json` to include upvotes:
  `curl -s "https://huggingface.co/api/daily_papers?limit=2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps([{'paper':{k:e['paper'].get(k) for k in ['id','title','summary','publishedAt','upvotes']}} for e in d[:2]], indent=2))" > pipeline/test/fixtures/hf_papers.json`
  Then update the test's expected titles/ids/dates/upvotes to the actually-captured values (read the file; expected values must be the real captured literals). If `upvotes` is absent in the response, engagement is `null` and the test asserts that instead.

**Interfaces:**
- Produces: `githubFetcher(query = DEFAULT_GH_QUERY): (client: FetchClient) => Promise<Item[]>` with `DEFAULT_GH_QUERY = "topic:llm OR topic:large-language-models OR topic:ai-agents"`; request URL = `https://api.github.com/search/repositories?q=<query>&sort=stars&order=desc&per_page=30`; maps `full_name`→title, `description`→snippet, `html_url`→url, `created_at`→publishedAt, `stargazers_count`→engagement, Source `GitHub`, category `tools`.
- Produces: `huggingFaceFetcher(): (client: FetchClient) => Promise<Item[]>` — GET `https://huggingface.co/api/daily_papers`; url = `https://huggingface.co/papers/{paper.id}`; `paper.upvotes`→engagement (null when absent); Source `Hugging Face`, category `research`; strip fractional seconds from `publishedAt`.

- [ ] **Step 1: Write both failing tests** (mirror the Task 6 stub-client pattern; GitHub asserts titles `["NousResearch/hermes-agent", "Significant-Gravitas/AutoGPT"]`, engagement `229372`, category `"tools"`; HF asserts the re-captured literals and category `"research"`).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement both fetchers** (same shape as Task 6: parse JSON, map fields exactly as in Interfaces, wrap each item mapping so one malformed entry is skipped, never throws the whole fetch).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit**
```bash
git add pipeline/src/fetchers/github.ts pipeline/src/fetchers/huggingface.ts pipeline/test/github.test.ts pipeline/test/huggingface.test.ts pipeline/test/fixtures/github_search.json pipeline/test/fixtures/hf_papers.json
git commit -m "pipeline: GitHub + Hugging Face fetchers with engagement"
```

---

### Task 8: Publish stage + main pipeline

**Files:**
- Create: `pipeline/src/publish.ts`, `pipeline/src/main.ts`, `pipeline/test/publish.test.ts`, `pipeline/test/pipeline.test.ts`

**Interfaces:**
- Produces: `toFeedDocument(items: Item[], generatedAt: string): FeedDocument` where
```ts
export interface FeedStory {
  id: string; title: string; snippet: string | null; url: string;
  sources: { name: string }[]; category: string; publishedAt: string;
  imageURL: string | null;
}
export interface FeedDocument { version: 1; generatedAt: string; stories: FeedStory[] }
```
  Note: `engagement` is **internal** — deliberately not published (Signal replaces it in Stage 2).
- Produces: `runPipeline(client: FetchClient, now: Date): Promise<FeedDocument>` — runs all fetchers via `Promise.allSettled` (a rejected fetcher contributes `[]`, never fails the run), dedupes, builds the document. `main.ts` calls it with `liveClient` and writes `pipeline/dist/feed.json`.

- [ ] **Step 1: Write the failing tests** — `pipeline/test/publish.test.ts`:
```ts
import { expect, test } from "vitest";
import { toFeedDocument } from "../src/publish.js";
import { itemID } from "../src/identity.js";

test("builds a versioned document without internal fields", () => {
  const doc = toFeedDocument([{
    id: itemID("https://a.com/1"), title: "T", snippet: null, url: "https://a.com/1",
    sources: [{ name: "A" }], category: "models", publishedAt: "2026-01-01T00:00:00Z",
    imageURL: null, engagement: 42,
  }], "2026-08-12T14:00:00Z");
  expect(doc.version).toBe(1);
  expect(doc.generatedAt).toBe("2026-08-12T14:00:00Z");
  expect(doc.stories).toHaveLength(1);
  expect("engagement" in doc.stories[0]!).toBe(false);
});
```
and `pipeline/test/pipeline.test.ts` — an integration test: stub client wired with the RSS + HN fixtures from Tasks 4–6, assert `runPipeline` returns stories from **both** fetchers, deduped and newest-first, and that an always-throwing client for one fetcher still yields the other's stories (failure isolation).

- [ ] **Step 2: Run to verify failure**, then **Step 3: Implement**:

`pipeline/src/publish.ts` maps `Item` → `FeedStory` (explicit field list — never spread, so internal fields can't leak). `pipeline/src/main.ts`:
```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { liveClient, type FetchClient } from "./client.js";
import { dedupeByURL } from "./dedupe.js";
import { toFeedDocument, type FeedDocument } from "./publish.js";
import { rssFetcher } from "./fetchers/rss.js";
import { hackerNewsFetcher } from "./fetchers/hackernews.js";
import { githubFetcher } from "./fetchers/github.js";
import { huggingFaceFetcher } from "./fetchers/huggingface.js";
import { CATALOG } from "./catalog.js";

export async function runPipeline(client: FetchClient, now: Date): Promise<FeedDocument> {
  const fetchers = [
    hackerNewsFetcher(), githubFetcher(), huggingFaceFetcher(),
    ...CATALOG.map(c => rssFetcher(c)),
  ];
  const settled = await Promise.allSettled(fetchers.map(f => f(client)));
  const groups = settled.map(r => (r.status === "fulfilled" ? r.value : []));
  return toFeedDocument(dedupeByURL(groups), now.toISOString().replace(/\.\d{3}Z$/, "Z"));
}

if (process.argv[1]?.endsWith("main.ts")) {
  const doc = await runPipeline(liveClient, new Date());
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/feed.json", JSON.stringify(doc, null, 1));
  console.log(`published ${doc.stories.length} stories`);
}
```

- [ ] **Step 4: Run to verify pass** (`npm test`), then **Step 5: gated live smoke** — `cd pipeline && npm run pipeline` (real network): expect `published N stories` with N > 50; inspect `dist/feed.json` spot-check that titles/URLs are real.

- [ ] **Step 6: Commit**
```bash
git add pipeline/src/publish.ts pipeline/src/main.ts pipeline/test/publish.test.ts pipeline/test/pipeline.test.ts
git commit -m "pipeline: publish stage + main (allSettled isolation, feed.json)"
```

---

### Task 9: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/pipeline.yml`

**Interfaces:**
- Produces: a scheduled workflow publishing `pipeline/dist/feed.json` to the `gh-pages` branch → served at `https://<owner>.github.io/<repo>/feed.json`.

- [ ] **Step 1: Write the workflow**:
```yaml
name: pipeline
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch: {}
permissions:
  contents: write
concurrency:
  group: pipeline
  cancel-in-progress: false
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: pipeline/package-lock.json }
      - run: npm ci
        working-directory: pipeline
      - run: npm test
        working-directory: pipeline
      - run: npm run pipeline
        working-directory: pipeline
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: pipeline/dist
          keep_files: false
```

- [ ] **Step 2: Validate locally** — `npx --yes yaml-lint .github/workflows/pipeline.yml` (or `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pipeline.yml'))"`). Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/pipeline.yml
git commit -m "pipeline: GHA schedule (30 min) publishing feed.json to gh-pages"
```

---

### Task 10: Swift — signal fields + RemoteFeedFetcher (contract test)

**Files:**
- Modify: `FrontierFeedKit/Sources/FrontierFeedKit/Models.swift` (add optional fields)
- Create: `FrontierFeedKit/Sources/FrontierFeedKit/RemoteFeedFetcher.swift`
- Create: `FrontierFeedKit/Tests/FrontierFeedKitTests/RemoteFeedFetcherTests.swift`
- Create fixture: `FrontierFeedKit/Tests/FrontierFeedKitTests/Fixtures/feed_v1.json` — **generated by the TS pipeline** (run `runPipeline` against the stub fixtures in a small script or copy the integration test's output), so the contract test consumes genuine pipeline output. Minimum content: version 1, generatedAt, 2 stories with distinct categories, one with a snippet and one with `"snippet": null`.

**Interfaces:**
- Consumes: `feed.json` v1 wire format (Task 8's `FeedDocument`).
- Produces: `FeedItem.signal: Int?` and `FeedItem.alert: Bool?` (new stored properties, default `nil`, added as the **last** init params with `= nil` defaults so all existing call sites compile unchanged).
- Produces: `RemoteFeedFetcher: Fetcher` with `init(client: NetworkClient, feedURL: URL)`; decodes the envelope, maps stories → `[FeedItem]`; unknown categories map to `.tools`; a story with an un-parseable URL is skipped, never fatal.

- [ ] **Step 1: Write the failing contract test** — `RemoteFeedFetcherTests.swift`:
```swift
import Testing
import Foundation
@testable import FrontierFeedKit

@Suite("Remote feed fetcher")
struct RemoteFeedFetcherTests {
    @Test("decodes pipeline feed.json v1 into FeedItems")
    func decodesContract() async throws {
        let fixture = try #require(Bundle.module.url(forResource: "feed_v1", withExtension: "json", subdirectory: "Fixtures"))
        let feedURL = URL(string: "https://example.github.io/feed.json")!
        let fetcher = RemoteFeedFetcher(
            client: StubNetworkClient(responses: [feedURL: try Data(contentsOf: fixture)]),
            feedURL: feedURL
        )
        let items = try await fetcher.fetch()
        #expect(items.count == 2)
        #expect(items.allSatisfy { !$0.title.isEmpty })
        #expect(items.allSatisfy { !$0.sources.isEmpty })
    }
}
```
(After generating the fixture, strengthen the assertions to the fixture's actual literal titles/URLs.)

- [ ] **Step 2: Run** — `cd FrontierFeedKit && swift test` — Expected: FAIL (type not found).

- [ ] **Step 3: Implement** — add to `Models.swift`: `public let signal: Int?` and `public let alert: Bool?`, appended `= nil` init params. `RemoteFeedFetcher.swift`:
```swift
import Foundation

/// Consumes the backend pipeline's published feed.json (v1) as one more Fetcher.
public struct RemoteFeedFetcher: Fetcher {
    private let client: NetworkClient
    private let feedURL: URL

    public init(client: NetworkClient, feedURL: URL) {
        self.client = client
        self.feedURL = feedURL
    }

    public func fetch() async throws -> [FeedItem] {
        let data = try await client.get(feedURL)
        let doc = try JSONDecoder().decode(Envelope.self, from: data)
        return doc.stories.compactMap { s in
            guard let url = URL(string: s.url) else { return nil }
            let df = ISO8601DateFormatter()
            return FeedItem(
                title: s.title,
                snippet: s.snippet,
                url: url,
                sources: s.sources.map { Source(name: $0.name) },
                category: FeedCategory(rawValue: s.category) ?? .tools,
                publishedAt: df.date(from: s.publishedAt) ?? .distantPast,
                imageURL: s.imageURL.flatMap(URL.init(string:)),
                signal: s.signal,
                alert: s.alert
            )
        }
    }

    private struct Envelope: Decodable {
        let version: Int
        let stories: [Story]
    }
    private struct Story: Decodable {
        struct Ref: Decodable { let name: String }
        let title: String; let snippet: String?; let url: String
        let sources: [Ref]; let category: String; let publishedAt: String
        let imageURL: String?; let signal: Int?; let alert: Bool?
    }
}
```
(Note: `FeedItem.init` gains `signal: Int? = nil, alert: Bool? = nil` as trailing params.)

- [ ] **Step 4: Run** — `swift test` — Expected: all 24+ tests PASS (23 existing + new).

- [ ] **Step 5: Commit**
```bash
git add FrontierFeedKit pipeline
git commit -m "app: RemoteFeedFetcher + optional signal/alert (contract-tested vs pipeline output)"
```

---

### Task 11: Ship it — publish repo, enable Pages, wire the app (USER-GATED)

**Files:**
- Modify: `FrontierFeedKit/Sources/FrontierFeedKit/FeedCatalog.swift` (composition root)

**Interfaces:**
- Consumes: `RemoteFeedFetcher`, the live Pages URL.
- Produces: `FeedRepository.live()` including the remote fetcher ahead of on-device fetchers (dedup already merges overlaps; on-device remains the offline fallback).

- [ ] **Step 1 (USER APPROVAL REQUIRED — publishing):** create the public GitHub repo and push. Confirm with the user before running:
```bash
gh repo create frontier-ai-feed --public --source . --push
```
(If the user prefers a different name/visibility, follow their instruction; private repo = ~45-min minimum cadence per the audit's minutes math.)

- [ ] **Step 2:** trigger the workflow once (`gh workflow run pipeline`) and wait for green (`gh run watch`); verify `https://<owner>.github.io/frontier-ai-feed/feed.json` returns the document (Pages is auto-enabled for the `gh-pages` branch by the publish action; if 404 after 2 min, enable Pages: `gh api repos/{owner}/{repo}/pages -X POST -f 'source[branch]=gh-pages' -f 'source[path]=/'`).

- [ ] **Step 3:** wire the composition root — in `FeedCatalog.swift`'s `live()`, insert at the front of `fetchers`:
```swift
RemoteFeedFetcher(
    client: client,
    feedURL: URL(string: "https://<owner>.github.io/frontier-ai-feed/feed.json")!
),
```
(replace `<owner>` with the real GitHub username from Step 1).

- [ ] **Step 4:** run `swift test` (all green), build + launch in the simulator, screenshot, and confirm the feed renders with the remote source active (check item count roughly matches `feed.json`'s story count).

- [ ] **Step 5: Commit**
```bash
git add FrontierFeedKit/Sources/FrontierFeedKit/FeedCatalog.swift
git commit -m "app: composition root consumes published feed.json (remote-first)"
git push
```

---

## Self-review notes

- **Spec coverage:** Stage-1 scope only (by design): ingest ✓ (Tasks 5–7), dedup ✓ (3), publish ✓ (8–9), app integration ✓ (10–11). Signal/cluster/summarize are Stages 2–4, separate plans.
- **Type consistency:** `Item`/`FeedConfig`/`FetchClient` defined once (Tasks 3, 5) and imported everywhere; wire `FeedStory` (Task 8) matches the Swift `Story` decoder (Task 10) field-for-field.
- **arXiv note:** arXiv is served by `rssFetcher` via the catalog (its Atom API is a syndication feed) — no bespoke fetcher, matching the Swift design.
