import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { rssFetcher } from "../src/fetchers/rss.js";
import { CATALOG } from "../src/catalog.js";
import type { FeedCategory } from "../src/types.js";

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

test("CATALOG has 27 entries with unique URLs and source names, all categories valid", () => {
  expect(CATALOG).toHaveLength(27);

  const urls = CATALOG.map(c => c.url);
  const uniqueUrls = new Set(urls);
  expect(uniqueUrls.size).toBe(27);
  expect(urls.length).toBe(uniqueUrls.size);

  const names = CATALOG.map(c => c.source.name);
  const uniqueNames = new Set(names);
  expect(uniqueNames.size).toBe(27);
  expect(names.length).toBe(uniqueNames.size);

  const validCategories: FeedCategory[] = ["models", "tools", "techniques", "research"];
  CATALOG.forEach(entry => {
    expect(validCategories).toContain(entry.category);
  });
});
