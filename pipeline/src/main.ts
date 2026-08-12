import { writeFileSync, mkdirSync } from "node:fs";
import { liveClient, type FetchClient } from "./client.js";
import { dedupeByURL } from "./dedupe.js";
import { toFeedDocument, type FeedDocument } from "./publish.js";
import { rssFetcher } from "./fetchers/rss.js";
import { hackerNewsFetcher } from "./fetchers/hackernews.js";
import { githubFetcher } from "./fetchers/github.js";
import { huggingFaceFetcher } from "./fetchers/huggingface.js";
import { CATALOG } from "./catalog.js";

export async function runPipeline(client: FetchClient, now: Date): Promise<FeedDocument> {
  const fetchers = [
    hackerNewsFetcher(), githubFetcher(), huggingFaceFetcher(),
    ...CATALOG.map(c => rssFetcher(c)),
  ];
  const settled = await Promise.allSettled(fetchers.map(f => f(client)));
  const groups = settled.map(r => (r.status === "fulfilled" ? r.value : []));
  return toFeedDocument(dedupeByURL(groups), now.toISOString().replace(/\.\d{3}Z$/, "Z"));
}

if (process.argv[1]?.endsWith("main.ts")) {
  const doc = await runPipeline(liveClient, new Date());
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/feed.json", JSON.stringify(doc, null, 1));
  console.log(`published ${doc.stories.length} stories`);
}
