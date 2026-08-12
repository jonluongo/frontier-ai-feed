import type { Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";

export const DEFAULT_GH_QUERY = "topic:llm OR topic:large-language-models OR topic:ai-agents";

const BASE = "https://api.github.com/search/repositories";

export const githubFetcher = (query = DEFAULT_GH_QUERY) =>
  async (client: FetchClient): Promise<Item[]> => {
    const url = `${BASE}?q=${query}&sort=stars&order=desc&per_page=30`;
    const data = JSON.parse(await client(url));
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
          sources: [{ name: "GitHub" }],
          category: "tools",
          publishedAt: repo.created_at.replace(/\.\d+Z$/, "Z"),
          imageURL: null,
          engagement: typeof repo.stargazers_count === "number" ? repo.stargazers_count : null,
        });
      } catch { /* one bad repo never kills the fetch */ }
    }
    return items;
  };
