import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 7 — RSSFetcher: fetch a configured feed URL, parse it, and stamp every entry with
// the feed's Source and default Category.

@Suite("RSS fetcher")
struct RSSFetcherTests {

    private let feedURL = URL(string: "https://openai.com/rss.xml")!

    private func stub() throws -> StubNetworkClient {
        let url = try #require(Bundle.module.url(forResource: "rss_feed", withExtension: "xml", subdirectory: "Fixtures"))
        return StubNetworkClient(responses: [feedURL: try Data(contentsOf: url)])
    }

    @Test("maps a configured feed into FeedItems stamped with its Source and Category")
    func mapsFeed() async throws {
        let fetcher = RSSFetcher(
            client: try stub(),
            feed: FeedConfig(url: feedURL, source: Source(name: "OpenAI"), category: .models)
        )

        let items = try await fetcher.fetch()

        #expect(items.map(\.title) == ["Introducing GPT-5", "Research update"])
        #expect(items.allSatisfy { $0.sources == [Source(name: "OpenAI")] })
        #expect(items.allSatisfy { $0.category == .models })
        #expect(items[0].snippet == "The next model.")            // Snippet = feed-provided, never invented
        #expect(items[0].url == URL(string: "https://openai.com/blog/gpt-5"))
        #expect(items[0].imageURL == URL(string: "https://openai.com/img/gpt5.png"))
    }

    @Test("caps to maxItems, keeping the newest entries")
    func capsToMaxItems() async throws {
        let fetcher = RSSFetcher(
            client: try stub(),
            feed: FeedConfig(url: feedURL, source: Source(name: "OpenAI"), category: .models),
            maxItems: 1
        )

        let items = try await fetcher.fetch()

        #expect(items.map(\.title) == ["Introducing GPT-5"])
    }
}
