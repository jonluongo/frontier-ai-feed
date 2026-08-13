import type { FeedConfig, Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";
import { parseSyndication, hostOf } from "../syndication.js";

/** Generic syndication Fetcher: one FeedConfig per blog/feed (see catalog.ts). */
export const rssFetcher = (config: FeedConfig, maxItems = 25) =>
  async (client: FetchClient): Promise<Item[]> =>
    parseSyndication(await client(config.url)).slice(0, maxItems).map(e => ({
      id: itemID(e.link),
      title: e.title,
      snippet: e.summary,
      url: e.link,
      // Attribution domain: the feed's own host (favicon source for the card).
      sources: [{ ...config.source, domain: config.source.domain ?? hostOf(config.url) ?? undefined }],
      category: config.category,
      publishedAt: e.published ?? "1970-01-01T00:00:00Z",
      imageURL: e.imageURL,
      engagement: null,
    }));
