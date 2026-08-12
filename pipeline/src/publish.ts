import type { Item } from "./types.js";

export interface FeedStory {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  sources: { name: string }[];
  category: string;
  publishedAt: string;
  imageURL: string | null;
}

export interface FeedDocument {
  version: 1;
  generatedAt: string;
  stories: FeedStory[];
}

/**
 * Item -> FeedStory, explicit field list only (never object spread) so internal
 * fields — engagement, in particular — can never leak into the published document.
 */
const toFeedStory = (item: Item): FeedStory => ({
  id: item.id,
  title: item.title,
  snippet: item.snippet,
  url: item.url,
  sources: item.sources,
  category: item.category,
  publishedAt: item.publishedAt,
  imageURL: item.imageURL,
});

export function toFeedDocument(items: Item[], generatedAt: string): FeedDocument {
  return {
    version: 1,
    generatedAt,
    stories: items.map(toFeedStory),
  };
}
