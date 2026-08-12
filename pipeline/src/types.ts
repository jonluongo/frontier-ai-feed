export type FeedCategory = "models" | "tools" | "techniques" | "research";

export interface SourceRef {
  name: string;
}

export interface Item {
  id: string;                // itemID(url)
  title: string;
  snippet: string | null;    // feed-provided, never invented
  url: string;
  sources: SourceRef[];
  category: FeedCategory;
  publishedAt: string;       // ISO-8601 UTC, no fractional seconds
  imageURL: string | null;
  engagement: number | null; // HN points / GH stars / HF upvotes; null = no signal
}

export interface FeedConfig {
  url: string;
  source: SourceRef;
  category: FeedCategory;
}
