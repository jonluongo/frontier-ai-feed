import type { Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";

/**
 * Topic filter for the new-repos search. Reworked 2026-08-13: lifetime-star search
 * surfaced years-old giants whose age put them beyond decay's reach (audit finding);
 * restricting to repos CREATED in the last `windowDays` makes stars mean "new repo
 * people are adopting right now" — the "new skills repos" the feed is for.
 */
export const DEFAULT_GH_TOPICS = "topic:llm OR topic:mcp OR topic:claude OR topic:ai-agents";
export const DEFAULT_GH_WINDOW_DAYS = 14;

const BASE = "https://api.github.com/search/repositories";

/** The exact search URL for a given reference time (exported for tests). */
export function githubRequestURL(now: Date, topics = DEFAULT_GH_TOPICS, windowDays = DEFAULT_GH_WINDOW_DAYS): string {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  return `${BASE}?q=${encodeURIComponent(`${topics} created:>${since}`)}&sort=stars&order=desc&per_page=30`;
}

export const githubFetcher = (now: Date, topics = DEFAULT_GH_TOPICS, windowDays = DEFAULT_GH_WINDOW_DAYS) =>
  async (client: FetchClient): Promise<Item[]> => {
    const data = JSON.parse(await client(githubRequestURL(now, topics, windowDays)));
    const items: Item[] = [];
    for (const repo of data.items ?? []) {
      try {
        if (!repo.full_name || !repo.html_url) continue;
        if (typeof repo.created_at !== "string") continue;
        items.push({
          id: itemID(repo.html_url),
          title: repo.full_name,
          snippet: repo.description ?? null,
          url: repo.html_url,
          sources: [{ name: "GitHub", domain: "github.com" }],
          category: "tools",
          publishedAt: repo.created_at.replace(/\.\d+Z$/, "Z"),
          imageURL: null,
          engagement: typeof repo.stargazers_count === "number" ? repo.stargazers_count : null,
        });
      } catch { /* one bad repo never kills the fetch */ }
    }
    return items;
  };
