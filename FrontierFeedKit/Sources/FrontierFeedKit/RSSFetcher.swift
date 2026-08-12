import Foundation

/// One configured RSS/Atom feed: where to fetch, the Source to attribute Items to, and the
/// default Category for that feed. Adding or removing a blog is one `FeedConfig`.
public struct FeedConfig: Sendable {
    public let url: URL
    public let source: Source
    public let category: Category

    public init(url: URL, source: Source, category: Category) {
        self.url = url
        self.source = source
        self.category = category
    }
}

/// The generic syndication Fetcher: fetches one feed URL, parses it, and stamps every entry
/// with the feed's Source and Category. arXiv and every company blog are just a `FeedConfig`.
public struct RSSFetcher: Fetcher {
    private let client: NetworkClient
    private let feed: FeedConfig

    public init(client: NetworkClient, feed: FeedConfig) {
        self.client = client
        self.feed = feed
    }

    public func fetch() async throws -> [FeedItem] {
        let data = try await client.get(feed.url)
        return parseSyndication(data).map { entry in
            FeedItem(
                title: entry.title,
                snippet: entry.summary,
                url: entry.link,
                sources: [feed.source],
                category: feed.category,
                publishedAt: entry.published ?? .distantPast, // undated entries sink in the merge sort
                imageURL: entry.imageURL
            )
        }
    }
}
