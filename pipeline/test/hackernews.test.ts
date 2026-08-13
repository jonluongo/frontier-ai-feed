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
  expect(items[0]!.sources).toEqual([{ name: "Hacker News", domain: "news.ycombinator.com" }]);
  expect(items[0]!.publishedAt).toBe("2023-11-14T22:13:20Z"); // epoch 1700000000
});

test("word boundaries: 'email' and 'training' are not AI hits", () => {
  expect(isAIRelevant("Check your email today")).toBe(false);
  expect(isAIRelevant("Marathon training plan")).toBe(false);
  expect(isAIRelevant("OpenAI ships a new agent")).toBe(true);
});
