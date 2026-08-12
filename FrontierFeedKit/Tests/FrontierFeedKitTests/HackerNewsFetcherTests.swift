import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 3 — HackerNewsFetcher.fetch() maps the HN Firebase API into FeedItems through the
// NetworkClient seam, keeping only AI-relevant stories. Driven entirely by saved fixtures.

@Suite("Hacker News fetcher")
struct HackerNewsFetcherTests {

    private let base = URL(string: "https://hacker-news.firebaseio.com/v0/")!

    private func fixture(_ name: String) throws -> Data {
        let url = try #require(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"),
            "missing fixture \(name).json"
        )
        return try Data(contentsOf: url)
    }

    private func stub() throws -> StubNetworkClient {
        StubNetworkClient(responses: [
            base.appending(path: "topstories.json"): try fixture("hn_topstories"),
            base.appending(path: "item/1.json"): try fixture("hn_item_1"),
            base.appending(path: "item/2.json"): try fixture("hn_item_2"),
            base.appending(path: "item/3.json"): try fixture("hn_item_3"),
        ])
    }

    @Test("keeps only AI-relevant stories, dropping the rest")
    func filtersToAIStories() async throws {
        let fetcher = HackerNewsFetcher(client: try stub(), base: base)
        let items = try await fetcher.fetch()

        // The coffee-shop story (id 2) is filtered out; the two AI stories remain, in
        // topstories order.
        #expect(items.map(\.title) == ["OpenAI releases GPT-5", "A new LLM benchmark from DeepMind"])
    }

    @Test("maps HN fields into a FeedItem faithfully")
    func mapsFields() async throws {
        let fetcher = HackerNewsFetcher(client: try stub(), base: base)
        let items = try await fetcher.fetch()
        let gpt5 = try #require(items.first)

        #expect(gpt5.url == URL(string: "https://openai.com/blog/gpt-5"))
        #expect(gpt5.sources == [Source(name: "Hacker News")])
        #expect(gpt5.publishedAt == Date(timeIntervalSince1970: 1_700_000_000))
    }
}
