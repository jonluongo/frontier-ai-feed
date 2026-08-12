import type { Item } from "./types.js";
import type { ScoredItem } from "./score.js";

export interface FeedStory {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  sources: { name: string }[];
  category: string;
  publishedAt: string;
  imageURL: string | null;
  signal: number;
  alert: boolean;
}

export interface FeedDocument {
  version: 1;
  generatedAt: string;
  stories: FeedStory[];
}

export interface StateDocument {
  version: 1;
  generatedAt: string;
  engagement: Record<string, number>;
}

/**
 * ScoredItem -> FeedStory, explicit field list only (never object spread) so internal
 * fields — engagement, in particular — can never leak into the published document.
 */
const toFeedStory = ({ item, signal, alert }: ScoredItem): FeedStory => ({
  id: item.id,
  title: item.title,
  snippet: item.snippet,
  url: item.url,
  sources: item.sources,
  category: item.category,
  publishedAt: item.publishedAt,
  imageURL: item.imageURL,
  signal,
  alert,
});

/** ScoredItem[] (already sorted) -> the published feed document; order is preserved as given. */
export function toFeedDocument(scored: ScoredItem[], generatedAt: string): FeedDocument {
  return {
    version: 1,
    generatedAt,
    stories: scored.map(toFeedStory),
  };
}

/**
 * Item[] -> the tick's engagement snapshot, keyed by item id, for the next tick's
 * velocity computation. Only items with a real (non-null) engagement reading are kept.
 */
export function toStateJSON(items: Item[], generatedAt: string): StateDocument {
  const engagement: Record<string, number> = {};
  for (const item of items) {
    if (item.engagement !== null) engagement[item.id] = item.engagement;
  }
  return { version: 1, generatedAt, engagement };
}
