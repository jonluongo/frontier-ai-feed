import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { runPipeline } from "../src/main.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

const HN_BASE = "https://hacker-news.firebaseio.com/v0";
const RSS_OPENAI_URL = "https://openai.com/news/rss.xml"; // real URL from the OpenAI catalog entry

const hnAndRssMap: Record<string, string> = {
  [`${HN_BASE}/topstories.json`]: fx("hn_topstories.json"),
  [`${HN_BASE}/item/1.json`]: fx("hn_item_1.json"),
  [`${HN_BASE}/item/2.json`]: fx("hn_item_2.json"),
  [`${HN_BASE}/item/3.json`]: fx("hn_item_3.json"),
  [RSS_OPENAI_URL]: fx("rss_feed.xml"),
};

const NOW = new Date("2026-08-12T14:00:00.000Z");

test("runs all fetchers, dedupes cross-source dupes, sorts newest-first; unmapped fetchers (GitHub/HF/other RSS) fail closed to []", async () => {
  const client = async (url: string) => {
    const hit = hnAndRssMap[url];
    if (!hit) throw new Error(`unmapped ${url}`);
    return hit;
  };

  const doc = await runPipeline(client, NOW);

  // Only the HN + OpenAI-RSS stories should surface; the GPT-5 story lives in both
  // fixtures (same URL) so it collapses into a single deduped story.
  expect(doc.stories.map(s => s.title)).toEqual([
    "Research update",
    "A new LLM benchmark from DeepMind",
    "OpenAI releases GPT-5",
  ]);

  const gpt5 = doc.stories.find(s => s.title === "OpenAI releases GPT-5")!;
  expect(gpt5.sources.map(s => s.name).sort()).toEqual(["Hacker News", "OpenAI"]);

  // "engagement" is internal and must never leak into the published document.
  for (const story of doc.stories) expect("engagement" in story).toBe(false);
});

test("failure isolation: an always-throwing client for every fetcher but one still yields that one's stories", async () => {
  const client = async (url: string) => {
    if (url === RSS_OPENAI_URL) return fx("rss_feed.xml");
    throw new Error(`unmapped ${url}`);
  };

  const doc = await runPipeline(client, NOW);

  expect(doc.stories.map(s => s.title)).toEqual(["Research update", "Introducing GPT-5"]);
});
