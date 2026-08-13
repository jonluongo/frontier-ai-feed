import { writeFileSync, mkdirSync } from "node:fs";
import { liveClient, type FetchClient } from "./client.js";
import { dedupeByURL, dedupeByTitle, clusterByStems } from "./dedupe.js";
import { toFeedDocument, toStateJSON, type FeedDocument, type StateDocument } from "./publish.js";
import { scoreFeed } from "./score.js";
import { rssFetcher } from "./fetchers/rss.js";
import { hackerNewsFetcher } from "./fetchers/hackernews.js";
import { githubFetcher } from "./fetchers/github.js";
import { huggingFaceFetcher } from "./fetchers/huggingface.js";
import { googleNewsFetcher } from "./fetchers/googlenews.js";
import { CATALOG } from "./catalog.js";

const MS_PER_HOUR = 3_600_000;

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
    hackerNewsFetcher(), githubFetcher(now), huggingFaceFetcher(), googleNewsFetcher(),
    ...CATALOG.map(c => rssFetcher(c)),
  ];
  const settled = await Promise.allSettled(fetchers.map(f => f(client)));
  const groups = settled.map(r => (r.status === "fulfilled" ? r.value : []));
  const deduped = clusterByStems(dedupeByTitle(dedupeByURL(groups)));

  // A future-dated item's age clamps to 0 in scoreFeed's decay term, pinning it at max decay
  // forever -- a bad feed timestamp would otherwise squat at the top of the ranking. Drop
  // anything published more than 1h ahead of "now" (a small allowance for clock skew).
  // Also drop predominantly non-ASCII titles: this is an English-language practitioner
  // feed, and Google News occasionally leaks non-English outlet coverage past hl=en-US.
  const nowMs = now.getTime();
  const nonAsciiRatio = (s: string) => {
    let n = 0;
    for (const ch of s) if (ch.codePointAt(0)! > 0x2fff) n++;
    return s.length === 0 ? 0 : n / s.length;
  };
  const items = deduped.filter(item =>
    Date.parse(item.publishedAt) <= nowMs + MS_PER_HOUR && nonAsciiRatio(item.title) < 0.3);

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
