import { expect, test } from "vitest";
import { toFeedDocument, toStateJSON } from "../src/publish.js";
import { itemID } from "../src/identity.js";
import type { ScoredItem } from "../src/score.js";
import type { Item } from "../src/types.js";

const scored = (item: Item, signal: number, alert: boolean): ScoredItem => ({ item, signal, alert });

test("builds a versioned document without internal fields", () => {
  const doc = toFeedDocument([
    scored({
      id: itemID("https://a.com/1"), title: "T", snippet: null, url: "https://a.com/1",
      sources: [{ name: "A" }], category: "models", publishedAt: "2026-01-01T00:00:00Z",
      imageURL: null, engagement: 42,
    }, 99, true),
  ], "2026-08-12T14:00:00Z");
  expect(doc.version).toBe(1);
  expect(doc.generatedAt).toBe("2026-08-12T14:00:00Z");
  expect(doc.stories).toHaveLength(1);
  expect("engagement" in doc.stories[0]!).toBe(false);
});

test("maps every public field through, including signal and alert", () => {
  const doc = toFeedDocument([
    scored({
      id: itemID("https://a.com/2"), title: "Title", snippet: "Snippet", url: "https://a.com/2",
      sources: [{ name: "A" }, { name: "B" }], category: "research", publishedAt: "2026-02-01T00:00:00Z",
      imageURL: "https://a.com/img.png", engagement: null,
    }, 42, false),
  ], "2026-08-12T14:00:00Z");
  expect(doc.stories[0]).toEqual({
    id: itemID("https://a.com/2"),
    title: "Title",
    snippet: "Snippet",
    url: "https://a.com/2",
    sources: [{ name: "A" }, { name: "B" }],
    category: "research",
    publishedAt: "2026-02-01T00:00:00Z",
    imageURL: "https://a.com/img.png",
    signal: 42,
    alert: false,
  });
});

test("preserves the given (already-sorted) order of scored items", () => {
  const mk = (id: string, url: string): Item => ({
    id, title: id, snippet: null, url, sources: [{ name: "A" }], category: "models",
    publishedAt: "2026-01-01T00:00:00Z", imageURL: null, engagement: null,
  });
  const doc = toFeedDocument([
    scored(mk("z", "https://a.com/z"), 10, false),
    scored(mk("a", "https://a.com/a"), 90, true),
  ], "2026-08-12T14:00:00Z");
  expect(doc.stories.map(s => s.id)).toEqual(["z", "a"]);
});

test("toStateJSON: keeps only non-null engagement, keyed by item id", () => {
  const items: Item[] = [
    {
      id: "id1", title: "T1", snippet: null, url: "https://a.com/1", sources: [{ name: "A" }],
      category: "models", publishedAt: "2026-01-01T00:00:00Z", imageURL: null, engagement: 42,
    },
    {
      id: "id2", title: "T2", snippet: null, url: "https://a.com/2", sources: [{ name: "A" }],
      category: "models", publishedAt: "2026-01-01T00:00:00Z", imageURL: null, engagement: null,
    },
    {
      id: "id3", title: "T3", snippet: null, url: "https://a.com/3", sources: [{ name: "A" }],
      category: "models", publishedAt: "2026-01-01T00:00:00Z", imageURL: null, engagement: 0,
    },
  ];
  const state = toStateJSON(items, "2026-08-12T14:00:00Z");
  expect(state).toEqual({
    version: 1,
    generatedAt: "2026-08-12T14:00:00Z",
    engagement: { id1: 42, id3: 0 },
  });
});
