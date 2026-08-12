// Generates FrontierFeedKit's Swift contract-test fixture from genuine `runPipeline` output.
// Wires the exact same stub client/fixture mapping as test/pipeline.test.ts's first case
// (HN + OpenAI RSS), so the fixture is real pipeline output, not hand-authored JSON.
//
// Run with: npx tsx scripts/make-contract-fixture.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runPipeline } from "../src/main.js";

const fx = (n: string) => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), "utf8");

const HN_BASE = "https://hacker-news.firebaseio.com/v0";
const RSS_OPENAI_URL = "https://openai.com/news/rss.xml"; // real URL from the OpenAI catalog entry

const hnAndRssMap: Record<string, string> = {
  [`${HN_BASE}/topstories.json`]: fx("hn_topstories.json"),
  [`${HN_BASE}/item/1.json`]: fx("hn_item_1.json"),
  [`${HN_BASE}/item/2.json`]: fx("hn_item_2.json"),
  [`${HN_BASE}/item/3.json`]: fx("hn_item_3.json"),
  [RSS_OPENAI_URL]: fx("rss_feed.xml"),
};

const client = async (url: string) => {
  const hit = hnAndRssMap[url];
  if (!hit) throw new Error(`unmapped ${url}`);
  return hit;
};

const NOW = new Date("2026-08-12T14:00:00Z");

const doc = await runPipeline(client, NOW);

const outDir = new URL(
  "../../FrontierFeedKit/Tests/FrontierFeedKitTests/Fixtures/",
  import.meta.url
);
mkdirSync(outDir, { recursive: true });
const outPath = new URL("feed_v1.json", outDir);
writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote ${doc.stories.length} stories to ${outPath.pathname}`);
