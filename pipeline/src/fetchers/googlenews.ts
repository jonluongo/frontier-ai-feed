import type { Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";
import { parseSyndication } from "../syndication.js";

export const GOOGLE_NEWS_QUERIES: string[] = [
  '"OpenAI"',
  '"Anthropic"',
  '"Google DeepMind" OR "Gemini"',
  '"Meta AI" OR "Mistral" OR "xAI"',
  '"artificial intelligence"',
];

const queryURL = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:1d")}&hl=en-US&gl=US&ceid=US:en`;

/**
 * Google News redirect links (`.../rss/articles/CBMi…`) wrap the true article URL in an
 * opaque base64url path segment. Historically that payload was a protobuf containing the
 * plain URL as a readable substring; as of this writing Google has changed the encoding and
 * the captured fixture segments no longer contain an extractable URL (see
 * pipeline/test/googlenews.test.ts — the decode test against the real captured link asserts
 * null). The decoder is still implemented against the documented/legacy shape in case Google
 * reverts or partially still uses it; when it can't find a URL it returns null and the caller
 * falls back to the original Google redirect link, which still resolves for readers.
 */
export function decodeGoogleNewsURL(link: string): string | null {
  try {
    const url = new URL(link);
    const seg = url.pathname.split("/").filter(Boolean).pop();
    if (!seg) return null;
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(b64, "base64");
    const latin1 = buf.toString("latin1");
    const matches = latin1.match(/https?:\/\/[^\x00-\x1f"\\]+/g);
    if (!matches) return null;
    return matches.find(candidate => !candidate.includes("google.com")) ?? null;
  } catch {
    return null;
  }
}

/** Strip a trailing " - <sourceName>" suffix Google News appends to titles. */
const stripSourceSuffix = (title: string, sourceName: string | null): string => {
  if (!sourceName) return title;
  const suffix = ` - ${sourceName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
};

/** Google News query fetcher: one request per query, deduped across queries by item id. */
export const googleNewsFetcher = (queries = GOOGLE_NEWS_QUERIES, perQuery = 25) =>
  async (client: FetchClient): Promise<Item[]> => {
    const items: Item[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      try {
        const xml = await client(queryURL(query));
        for (const entry of parseSyndication(xml).slice(0, perQuery)) {
          try {
            const url = decodeGoogleNewsURL(entry.link) ?? entry.link;
            const id = itemID(url);
            if (seen.has(id)) continue;
            seen.add(id);
            items.push({
              id,
              title: stripSourceSuffix(entry.title, entry.sourceName),
              snippet: null, // Google News <description> is an anchor+outlet HTML block, never prose
              url,
              sources: [{ name: entry.sourceName ?? "Google News" }],
              category: "models",
              publishedAt: entry.published ?? "1970-01-01T00:00:00Z",
              imageURL: entry.imageURL,
              engagement: null,
            });
          } catch { /* one bad entry never kills the query */ }
        }
      } catch { /* one bad query never kills the others */ }
    }

    return items;
  };
