import type { Item } from "../types.js";
import type { FetchClient } from "../client.js";
import { itemID } from "../identity.js";

const URL = "https://huggingface.co/api/daily_papers";

/** Strip fractional seconds: HF returns ...000Z, Items require whole-second UTC. */
const stripFractionalSeconds = (iso: string) => iso.replace(/\.\d+Z$/, "Z");

export const huggingFaceFetcher = () =>
  async (client: FetchClient): Promise<Item[]> => {
    const data = JSON.parse(await client(URL));
    const items: Item[] = [];
    for (const entry of data ?? []) {
      try {
        const paper = entry?.paper;
        if (!paper?.id || !paper.title) continue;
        items.push({
          id: itemID(`https://huggingface.co/papers/${paper.id}`),
          title: paper.title,
          snippet: paper.summary ?? null,
          url: `https://huggingface.co/papers/${paper.id}`,
          sources: [{ name: "Hugging Face", domain: "huggingface.co" }],
          category: "research",
          publishedAt: stripFractionalSeconds(paper.publishedAt),
          imageURL: null,
          engagement: typeof paper.upvotes === "number" ? paper.upvotes : null,
        });
      } catch { /* one bad paper never kills the fetch */ }
    }
    return items;
  };
