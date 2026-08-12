import Foundation

/// The curated set of RSS/Atom feeds, each a one-line `FeedConfig`. Adding or removing a
/// blog is an edit here. URLs verified live 2026-08-12; dead feeds are simply isolated by
/// the repository, so a stale entry degrades gracefully. Categories are provisional source
/// defaults until real cross-source categorization lands.
public enum FeedCatalog {
    public static let syndication: [FeedConfig] = [
        FeedConfig(
            url: URL(string: "http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40")!,
            source: Source(name: "arXiv"), category: .research
        ),
        FeedConfig(url: URL(string: "https://openai.com/news/rss.xml")!,
                   source: Source(name: "OpenAI"), category: .models),
        FeedConfig(url: URL(string: "https://deepmind.google/blog/rss.xml")!,
                   source: Source(name: "Google DeepMind"), category: .research),
        FeedConfig(url: URL(string: "https://blog.google/technology/ai/rss/")!,
                   source: Source(name: "Google AI"), category: .models),
        FeedConfig(url: URL(string: "https://blog.research.google/feeds/posts/default")!,
                   source: Source(name: "Google Research"), category: .research),
        FeedConfig(url: URL(string: "https://huggingface.co/blog/feed.xml")!,
                   source: Source(name: "Hugging Face"), category: .techniques),
        FeedConfig(url: URL(string: "https://bair.berkeley.edu/blog/feed.xml")!,
                   source: Source(name: "BAIR"), category: .research),
    ]
}

extension FeedRepository {
    /// The app's composition root: every Fetcher wired to the live network + on-disk cache.
    /// Remote-first: the backend pipeline's published feed leads; on-device fetchers remain
    /// the offline fallback (the merge dedups overlaps by Item identity).
    public static func live() -> FeedRepository {
        let client = LiveNetworkClient()
        var fetchers: [Fetcher] = [
            RemoteFeedFetcher(
                client: client,
                feedURL: URL(string: "https://jonluongo.github.io/frontier-ai-feed/feed.json")!
            ),
            HackerNewsFetcher(client: client),
            GitHubFetcher(client: client),
            HuggingFaceFetcher(client: client),
        ]
        fetchers += FeedCatalog.syndication.map { RSSFetcher(client: client, feed: $0) }
        return FeedRepository(fetchers: fetchers, cache: JSONFileCache())
    }
}
