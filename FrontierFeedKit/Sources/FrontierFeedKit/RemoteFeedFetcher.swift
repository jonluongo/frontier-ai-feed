import Foundation

/// Consumes the backend pipeline's published feed.json (v1) as one more Fetcher.
public struct RemoteFeedFetcher: Fetcher {
    private let client: NetworkClient
    private let feedURL: URL

    public init(client: NetworkClient, feedURL: URL) {
        self.client = client
        self.feedURL = feedURL
    }

    public func fetch() async throws -> [FeedItem] {
        let data = try await client.get(feedURL)
        let doc = try JSONDecoder().decode(Envelope.self, from: data)
        let df = ISO8601DateFormatter()
        return doc.stories.compactMap { s in
            guard let url = URL(string: s.url) else { return nil }
            return FeedItem(
                title: s.title,
                snippet: s.snippet,
                url: url,
                sources: s.sources.map { Source(name: $0.name) },
                category: FeedCategory(rawValue: s.category) ?? .tools,
                publishedAt: df.date(from: s.publishedAt) ?? .distantPast,
                imageURL: s.imageURL.flatMap(URL.init(string:)),
                signal: s.signal,
                alert: s.alert
            )
        }
    }

    private struct Envelope: Decodable {
        let version: Int
        let stories: [Story]
    }
    private struct Story: Decodable {
        struct Ref: Decodable { let name: String }
        let title: String; let snippet: String?; let url: String
        let sources: [Ref]; let category: String; let publishedAt: String
        let imageURL: String?; let signal: Int?; let alert: Bool?
    }
}
