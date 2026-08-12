import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { runPipeline } from "../src/main.js";
import { itemID } from "../src/identity.js";

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

test("runs all fetchers, dedupes cross-source dupes, ranks by Signal; unmapped fetchers (GitHub/HF/Google News/other RSS) fail closed to []", async () => {
  const client = async (url: string) => {
    const hit = hnAndRssMap[url];
    if (!hit) throw new Error(`unmapped ${url}`);
    return hit;
  };

  const { feed } = await runPipeline(client, NOW, null);

  // Only the HN + OpenAI-RSS stories should surface; the GPT-5 story lives in both
  // fixtures (same URL) so it collapses into a single deduped story.
  expect(feed.stories.map(s => s.title).sort()).toEqual([
    "A new LLM benchmark from DeepMind",
    "OpenAI releases GPT-5",
    "Research update",
  ]);

  const gpt5 = feed.stories.find(s => s.title === "OpenAI releases GPT-5")!;
  expect(gpt5.sources.map(s => s.name).sort()).toEqual(["Hacker News", "OpenAI"]);

  // Stories are ranked by Signal, descending.
  const signals = feed.stories.map(s => s.signal);
  expect(signals).toEqual([...signals].sort((a, b) => b - a));

  // "engagement" is internal and must never leak into the published document.
  for (const story of feed.stories) {
    expect("engagement" in story).toBe(false);
    expect(typeof story.signal).toBe("number");
    expect(typeof story.alert).toBe("boolean");
  }
});

test("failure isolation: an always-throwing client for every fetcher but one still yields that one's stories", async () => {
  const client = async (url: string) => {
    if (url === RSS_OPENAI_URL) return fx("rss_feed.xml");
    throw new Error(`unmapped ${url}`);
  };

  const { feed } = await runPipeline(client, NOW, null);

  expect(feed.stories.map(s => s.title).sort()).toEqual(["Introducing GPT-5", "Research update"]);
});

test("a velocity-boosted item (rising engagement since prevState) outranks its static twin", async () => {
  // These particular URL suffixes are load-bearing: they were chosen so that itemID("...one-1")
  // > itemID("...two-1") in plain string comparison. score.ts's tie-break sorts by id ASCENDING,
  // so on a dead tie (no velocity) "two-1" — the smaller id — sorts first, not "one-1". That
  // means a naive choice of URLs risks the tie-break alone reproducing the "expected" order,
  // making the test pass even if the velocity term were deleted entirely (this happened — see
  // task-4-report.md fix note). With these URLs, the tie-break and the velocity-driven outcome
  // actively DISAGREE, so the assertions below only hold if velocity is genuinely applied.
  const ID_ONE_URL = "https://x.example.com/one-1";
  const ID_TWO_URL = "https://x.example.com/two-1";
  const idOne = itemID(ID_ONE_URL);
  const idTwo = itemID(ID_TWO_URL);
  expect(idOne > idTwo).toBe(true); // sanity: confirms the tie-break would favor "two-1"

  const hnTopstories = JSON.stringify([10, 20]);
  const hnItem10 = JSON.stringify({
    id: 10, type: "story", by: "a", time: 1_700_000_000,
    title: "New AI velocity twin one", url: ID_ONE_URL, score: 500, descendants: 1,
  });
  const hnItem20 = JSON.stringify({
    id: 20, type: "story", by: "b", time: 1_700_000_000,
    title: "New AI velocity twin two", url: ID_TWO_URL, score: 500, descendants: 1,
  });

  const map: Record<string, string> = {
    [`${HN_BASE}/topstories.json`]: hnTopstories,
    [`${HN_BASE}/item/10.json`]: hnItem10,
    [`${HN_BASE}/item/20.json`]: hnItem20,
  };
  const client = async (url: string) => {
    const hit = map[url];
    if (!hit) throw new Error(`unmapped ${url}`);
    return hit;
  };

  // Baseline: no prevState -> velocity forced to 0 for both -> a dead tie on raw score,
  // broken purely by id ascending -> "two-1" (smaller id) sorts first.
  const { feed: baseline } = await runPipeline(client, NOW, null);
  expect(baseline.stories.map(s => s.title)).toEqual([
    "New AI velocity twin two",
    "New AI velocity twin one",
  ]);
  const oneSignalBaseline = baseline.stories.find(s => s.title === "New AI velocity twin one")!.signal;

  // Both items have identical current engagement (500) and identical age/pickup, so absent
  // velocity they'd be the dead-tie case above. prevState gives "one-1" a much lower prior
  // reading (100), while "two-1" has no prior record at all -> "one-1" alone gets a velocity
  // boost, which must be large enough to flip the id tie-break and outrank "two-1".
  const prevState = {
    generatedAt: new Date(NOW.getTime() - 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    engagement: { [idOne]: 100 },
  };

  const { feed } = await runPipeline(client, NOW, prevState);

  expect(feed.stories.map(s => s.title)).toEqual([
    "New AI velocity twin one",
    "New AI velocity twin two",
  ]);
  // n=2, rank0 -> signal=99, clearing the rank threshold (90), but ALERT is substance-gated:
  // both items carry a single source (pickup=1) and pct=0.5 (engagement 500 tied against
  // itself in the HN population, well under the 0.9 pct gate) -- so no alert either way.
  expect(feed.stories[0]!.alert).toBe(false);

  // The boosted item's own signal must have genuinely risen between the two runs -- not just
  // its relative position -- confirming the velocity term (not some other side effect) moved it.
  const oneSignalBoosted = feed.stories.find(s => s.title === "New AI velocity twin one")!.signal;
  expect(oneSignalBoosted).toBeGreaterThan(oneSignalBaseline);
});

test("state.json: version, generatedAt, and non-null engagement keyed by item id", async () => {
  const client = async (url: string) => {
    const hit = hnAndRssMap[url];
    if (!hit) throw new Error(`unmapped ${url}`);
    return hit;
  };

  const { state } = await runPipeline(client, NOW, null);

  expect(state.version).toBe(1);
  expect(state.generatedAt).toBe("2026-08-12T14:00:00Z");

  const gpt5Id = itemID("https://openai.com/blog/gpt-5");
  const benchmarkId = itemID("https://deepmind.google/benchmark");
  const researchId = itemID("https://openai.com/blog/research");

  // GPT-5 (HN score 900) and the DeepMind benchmark (HN score 210) carry engagement;
  // "Research update" (RSS-only, no engagement signal) is absent from state.
  expect(state.engagement).toEqual({
    [gpt5Id]: 900,
    [benchmarkId]: 210,
  });
  expect(Object.hasOwn(state.engagement, researchId)).toBe(false);
});
