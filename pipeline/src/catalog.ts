import type { FeedConfig } from "./types.js";

/**
 * The curated set of RSS/Atom feeds, each a one-line FeedConfig. Adding or removing a
 * blog is an edit here. URLs verified live 2026-08-12; dead feeds are simply isolated by
 * the pipeline, so a stale entry degrades gracefully. Categories are provisional source
 * defaults until real cross-source categorization lands.
 *
 * Ported verbatim from FrontierFeedKit/Sources/FrontierFeedKit/FeedCatalog.swift.
 */
export const CATALOG: FeedConfig[] = [
  {
    url: "http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40",
    source: { name: "arXiv" },
    category: "research",
  },
  {
    url: "https://openai.com/news/rss.xml",
    source: { name: "OpenAI" },
    category: "models",
  },
  {
    url: "https://deepmind.google/blog/rss.xml",
    source: { name: "Google DeepMind" },
    category: "research",
  },
  {
    url: "https://blog.google/technology/ai/rss/",
    source: { name: "Google AI" },
    category: "models",
  },
  {
    url: "https://blog.research.google/feeds/posts/default",
    source: { name: "Google Research" },
    category: "research",
  },
  {
    url: "https://huggingface.co/blog/feed.xml",
    source: { name: "Hugging Face" },
    category: "techniques",
  },
  {
    url: "https://bair.berkeley.edu/blog/feed.xml",
    source: { name: "BAIR" },
    category: "research",
  },
];
