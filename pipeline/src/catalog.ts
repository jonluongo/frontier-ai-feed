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
  {
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    source: { name: "TechCrunch" },
    category: "models",
  },
  {
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    source: { name: "The Verge" },
    category: "models",
  },
  {
    url: "https://arstechnica.com/ai/feed/",
    source: { name: "Ars Technica" },
    category: "models",
  },
  {
    url: "https://www.microsoft.com/en-us/research/feed/",
    source: { name: "Microsoft Research" },
    category: "research",
  },
  {
    url: "https://blogs.nvidia.com/feed/",
    source: { name: "NVIDIA" },
    category: "models",
  },
  {
    url: "https://machinelearning.apple.com/rss.xml",
    source: { name: "Apple ML" },
    category: "research",
  },
  {
    url: "https://aws.amazon.com/blogs/machine-learning/feed/",
    source: { name: "AWS ML" },
    category: "techniques",
  },
  {
    url: "https://blog.eleuther.ai/index.xml",
    source: { name: "EleutherAI" },
    category: "research",
  },
  {
    url: "https://simonwillison.net/atom/everything/",
    source: { name: "Simon Willison" },
    category: "techniques",
  },
  {
    url: "https://jack-clark.net/feed/",
    source: { name: "Import AI" },
    category: "research",
  },
  {
    url: "https://www.interconnects.ai/feed",
    source: { name: "Interconnects" },
    category: "research",
  },
  {
    url: "https://www.latent.space/feed",
    source: { name: "Latent Space" },
    category: "techniques",
  },
  {
    url: "https://magazine.sebastianraschka.com/feed",
    source: { name: "Ahead of AI" },
    category: "techniques",
  },
  {
    url: "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day",
    source: { name: "r/LocalLLaMA" },
    category: "tools",
  },
  {
    url: "https://www.reddit.com/r/MachineLearning/top/.rss?t=day",
    source: { name: "r/MachineLearning" },
    category: "research",
  },

  {
    url: "https://www.reddit.com/r/ClaudeAI/top/.rss?t=day",
    source: { name: "r/ClaudeAI" },
    category: "techniques",
  },
  {
    url: "https://www.reddit.com/r/OpenAI/top/.rss?t=day",
    source: { name: "r/OpenAI" },
    category: "tools",
  },
  {
    url: "https://www.reddit.com/r/singularity/top/.rss?t=day",
    source: { name: "r/singularity" },
    category: "models",
  },
  // YouTube channel feeds (Atom) — channel ids verified against feed titles 2026-08-13.
  {
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw",
    source: { name: "AI Explained", domain: "youtube.com" },
    category: "techniques",
  },
  {
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA",
    source: { name: "Fireship", domain: "youtube.com" },
    category: "techniques",
  },
  {
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ",
    source: { name: "Andrej Karpathy", domain: "youtube.com" },
    category: "techniques",
  },
];
