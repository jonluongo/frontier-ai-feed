import { writeFileSync, mkdirSync } from "node:fs";
import { liveClient, type FetchClient } from "./client.js";
import { dedupeByURL } from "./dedupe.js";
import { toFeedDocument, toStateJSON, type FeedDocument, type StateDocument } from "./publish.js";
import { scoreFeed } from "./score.js";
import { rssFetcher } from "./fetchers/rss.js";
import { hackerNewsFetcher } from "./fetchers/hackernews.js";
import { githubFetcher } from "./fetchers/github.js";
import { huggingFaceFetcher } from "./fetchers/huggingface.js";
import { googleNewsFetcher } from "./fetchers/googlenews.js";
import { CATALOG } from "./catalog.js";

export interface PrevState {
  generatedAt: string;
  engagement: Record<string, number>;
}

export async function runPipeline(
  client: FetchClient,
  now: Date,
  prevState: PrevState | null,
): Promise<{ feed: FeedDocument; state: StateDocument }> {
  const fetchers = [
    hackerNewsFetcher(), githubFetcher(), huggingFaceFetcher(), googleNewsFetcher(),
    ...CATALOG.map(c => rssFetcher(c)),
  ];
  const settled = await Promise.allSettled(fetchers.map(f => f(client)));
  const groups = settled.map(r => (r.status === "fulfilled" ? r.value : []));
  const items = dedupeByURL(groups);

  const nowISO = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const scored = scoreFeed(items, nowISO, prevState?.engagement ?? {}, prevState?.generatedAt ?? null);

  return {
    feed: toFeedDocument(scored, nowISO),
    state: toStateJSON(items, nowISO),
  };
}

if (process.argv[1]?.endsWith("main.ts")) {
  const STATE_URL = "https://jonluongo.github.io/frontier-ai-feed/state.json";

  let prevState: PrevState | null = null;
  try {
    const raw = await liveClient(STATE_URL);
    const parsed = JSON.parse(raw);
    prevState = { generatedAt: parsed.generatedAt, engagement: parsed.engagement };
  } catch {
    prevState = null; // first run (or any fetch/parse failure) publishes with no prior state
  }

  const { feed, state } = await runPipeline(liveClient, new Date(), prevState);
  if (feed.stories.length < 20) {
    console.error(`refusing to publish ${feed.stories.length} stories (floor 20)`);
    process.exit(1);
  }
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/feed.json", JSON.stringify(feed, null, 1));
  writeFileSync("dist/state.json", JSON.stringify(state, null, 1));
  console.log(`published ${feed.stories.length} stories`);
}
