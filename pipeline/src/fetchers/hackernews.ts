import type { Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";

const ALTS = [
  "ai","llm","llms","gpt","chatgpt","openai","anthropic","claude","gemini",
  "llama","mistral","transformer","transformers","neural","agent","agents",
  "rag","diffusion","embeddings?","inference","deepmind","hugging ?face",
  "machine learning","deep learning","large language models?","fine[- ]tuning",
  "foundation models?","generative ai",
].join("|");
const AI_REGEX = new RegExp(`\\b(${ALTS})\\b`, "i");

export const isAIRelevant = (title: string) => AI_REGEX.test(title);

const BASE = "https://hacker-news.firebaseio.com/v0";

export const hackerNewsFetcher = (maxStories = 200) =>
  async (client: FetchClient): Promise<Item[]> => {
    const ids: number[] = JSON.parse(await client(`${BASE}/topstories.json`));
    const items: Item[] = [];
    for (const id of ids.slice(0, maxStories)) {
      try {
        const s = JSON.parse(await client(`${BASE}/item/${id}.json`));
        if (s?.type !== "story" || !s.title || !s.url || !isAIRelevant(s.title)) continue;
        items.push({
          id: itemID(s.url), title: s.title, snippet: null, url: s.url,
          sources: [{ name: "Hacker News" }], category: "tools",
          publishedAt: new Date((s.time ?? 0) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          imageURL: null, engagement: typeof s.score === "number" ? s.score : null,
        });
      } catch { /* one bad story never kills the fetch */ }
    }
    return items;
  };
