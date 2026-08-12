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
