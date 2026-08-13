import { expect, test } from "vitest";
import { dedupeByURL, dedupeByTitle } from "../src/dedupe.js";
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

// ---------------------------------------------------------------------------
// dedupeByTitle: interim exact-title dedupe across sources (revives pickup that
// URL-only dedupe misses, e.g. a Google News redirect vs. the outlet's own link).
// ---------------------------------------------------------------------------

test("a TechCrunch-style pair (same normalized title, one news.google.com URL, one real outlet URL) merges", () => {
  const googleCopy = make({
    url: "https://news.google.com/rss/articles/CBMixxxxTechCrunchOpenAIThrive",
    title: "OpenAI-backed Thrive Holdings raises $2B to bring AI to the enterprise",
    sources: [{ name: "Google News" }],
  });
  const realCopy = make({
    url: "https://techcrunch.com/2026/01/01/openai-backed-thrive-holdings-raises-2b/",
    title: "OpenAI-backed Thrive Holdings raises $2B to bring AI to the enterprise",
    sources: [{ name: "TechCrunch" }],
  });

  const out = dedupeByTitle([googleCopy, realCopy]);

  expect(out).toHaveLength(1);
  expect(out[0]!.sources.map(s => s.name).sort()).toEqual(["Google News", "TechCrunch"]);
  expect(out[0]!.url).toBe(
    "https://techcrunch.com/2026/01/01/openai-backed-thrive-holdings-raises-2b/"
  );
});

test("a short title (\"llama cpp\", under the 25-char floor) does NOT merge across sources", () => {
  const a = make({ url: "https://a.com/1", title: "llama cpp", sources: [{ name: "A" }] });
  const b = make({ url: "https://b.com/1", title: "llama cpp", sources: [{ name: "B" }] });

  const out = dedupeByTitle([a, b]);

  expect(out).toHaveLength(2);
});

test("four sources union across a 62h span (no time window)", () => {
  const title = "New AI safety benchmark released to the public today";
  const s1 = make({ url: "https://a.com/1", title, sources: [{ name: "S1" }], publishedAt: "2026-01-01T00:00:00Z" });
  const s2 = make({ url: "https://b.com/1", title, sources: [{ name: "S2" }], publishedAt: "2026-01-02T10:00:00Z" }); // +34h
  const s3 = make({ url: "https://c.com/1", title, sources: [{ name: "S3" }], publishedAt: "2026-01-03T14:00:00Z" }); // +62h
  const s4 = make({ url: "https://d.com/1", title, sources: [{ name: "S4" }], publishedAt: "2026-01-01T12:00:00Z" }); // +12h

  const out = dedupeByTitle([s1, s2, s3, s4]);

  expect(out).toHaveLength(1);
  expect(out[0]!.sources.map(s => s.name).sort()).toEqual(["S1", "S2", "S3", "S4"]);
});

test("titleKey ignores case, punctuation and diacritics", () => {
  const a = make({ url: "https://a.com/1", title: "Café Society Releases a New Model, Today!" });
  const b = make({ url: "https://b.com/1", title: "cafe society releases a new model today" });

  const out = dedupeByTitle([a, b]);

  expect(out).toHaveLength(1);
});

test("dedupeByTitle merges max engagement across occurrences", () => {
  const title = "New AI safety benchmark released to the public today";
  const low = make({ url: "https://a.com/1", title, sources: [{ name: "A" }], engagement: 10 });
  const high = make({ url: "https://b.com/1", title, sources: [{ name: "B" }], engagement: 900 });

  const out = dedupeByTitle([low, high]);

  expect(out).toHaveLength(1);
  expect(out[0]!.engagement).toBe(900);
});

// clusterByStems — fuzzy same-story merge (Stage-3 v0, 2026-08-13)
import { clusterByStems, distinctiveStems } from "../src/dedupe.js";

const story = (id: string, url: string, title: string, source: string): Item => ({
  id, title, snippet: null, url, sources: [{ name: source }],
  category: "models", publishedAt: "2026-08-13T00:00:00Z", imageURL: null, engagement: null,
});

test("clusterByStems: watermark headlines with >=3 shared distinctive stems merge", () => {
  const items = [
    story("a", "https://forbes.com/1", "Explaining Anthropic's New Watermarking Of Claude AI-Generated Text", "Forbes"),
    story("b", "https://dailystar.net/2", "Anthropic to watermark Claude-generated text", "The Daily Star"),
    story("c", "https://indianprinter.com/3", "Anthropic embeds invisible watermarks across Claude AI products", "Indian Printer"),
    story("d", "https://forbes.com/4", "Claude Will Now Leave A Watermark On Everything It Writes", "Forbes B"),
  ];
  const out = clusterByStems(items);
  // Conservative by design: three of the four share >=3 distinctive stems and merge; the
  // fourth ("Claude Will Now Leave A Watermark...") shares only {claude, watermark} = 2,
  // below the false-merge-safe threshold, and stays separate.
  expect(out).toHaveLength(2);
  expect(Math.max(...out.map(o => o.sources.length))).toBeGreaterThanOrEqual(3);
});

test("clusterByStems: generic AI phrasing does NOT false-merge different stories", () => {
  const items = [
    story("a", "https://a.com/1", "OpenAI releases new AI model", "A"),
    story("b", "https://b.com/2", "Anthropic releases new AI model", "B"),
  ];
  expect(clusterByStems(items)).toHaveLength(2);
});

test("distinctiveStems: strips generic vocabulary and suffixes", () => {
  const stems = distinctiveStems("Anthropic embeds invisible watermarks across Claude AI products");
  expect(stems.has("anthropic")).toBe(true);
  expect(stems.has("watermark")).toBe(true);
  expect(stems.has("claude")).toBe(true);
  expect(stems.has("ai")).toBe(false);      // generic
  expect(stems.has("across")).toBe(false);  // stopword
});
