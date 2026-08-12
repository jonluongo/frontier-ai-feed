import Testing
import Foundation
@testable import FrontierFeedKit

@Suite("Remote feed fetcher")
struct RemoteFeedFetcherTests {
    @Test("decodes pipeline feed.json v1 into FeedItems")
    func decodesContract() async throws {
        let fixture = try #require(Bundle.module.url(forResource: "feed_v1", withExtension: "json", subdirectory: "Fixtures"))
        let feedURL = URL(string: "https://example.github.io/feed.json")!
        let fetcher = RemoteFeedFetcher(
            client: StubNetworkClient(responses: [feedURL: try Data(contentsOf: fixture)]),
            feedURL: feedURL
        )
        let items = try await fetcher.fetch()

        // Fixture is genuine `runPipeline` output (see pipeline/scripts/make-contract-fixture.ts),
        // wired against the same HN + OpenAI-RSS stubs as pipeline/test/pipeline.test.ts.
        // Order is Signal-ranked (descending), not chronological.
        #expect(items.map(\.title) == [
            "OpenAI releases GPT-5",
            "Research update",
            "A new LLM benchmark from DeepMind",
        ])
        #expect(items.allSatisfy { !$0.title.isEmpty })
        #expect(items.allSatisfy { !$0.sources.isEmpty })

        let researchUpdate = try #require(items.first { $0.title == "Research update" })
        #expect(researchUpdate.snippet == "Some notes.")
        #expect(researchUpdate.url == URL(string: "https://openai.com/blog/research"))
        #expect(researchUpdate.sources == [Source(name: "OpenAI")])
        #expect(researchUpdate.category == .models)

        let benchmark = try #require(items.first { $0.title == "A new LLM benchmark from DeepMind" })
        #expect(benchmark.snippet == nil)
        #expect(benchmark.url == URL(string: "https://deepmind.google/benchmark"))
        #expect(benchmark.sources == [Source(name: "Hacker News")])
        #expect(benchmark.category == .tools)

        let gpt5 = try #require(items.first { $0.title == "OpenAI releases GPT-5" })
        #expect(gpt5.snippet == nil)
        #expect(gpt5.url == URL(string: "https://openai.com/blog/gpt-5"))
        #expect(Set(gpt5.sources) == Set([Source(name: "Hacker News"), Source(name: "OpenAI")]))
        #expect(gpt5.category == .tools)

        // signal/alert are now part of the pipeline's v1 wire format (Signal ranking + alerts).
        #expect(researchUpdate.signal == 50)
        #expect(researchUpdate.alert == false)
        #expect(gpt5.signal == 99)
        #expect(gpt5.alert == true)
        #expect(benchmark.signal == 0)
        #expect(benchmark.alert == false)
    }

    @Test("falls back to .tools for an unknown category and drops stories with unparseable URLs")
    func toleratesUnknownCategoryAndBadURL() async throws {
        let feedURL = URL(string: "https://example.github.io/feed.json")!
        let json = """
        {
          "version": 1,
          "generatedAt": "2026-08-12T14:00:00Z",
          "stories": [
            {
              "title": "A story with a category we've never seen",
              "snippet": null,
              "url": "https://example.com/weird",
              "sources": [{ "name": "Example" }],
              "category": "weird-new-thing",
              "publishedAt": "2026-08-12T14:00:00Z",
              "imageURL": null
            },
            {
              "title": "A story with a garbage URL",
              "snippet": null,
              "url": "http://[invalid",
              "sources": [{ "name": "Example" }],
              "category": "tools",
              "publishedAt": "2026-08-12T14:00:00Z",
              "imageURL": null
            },
            {
              "title": "A perfectly normal story",
              "snippet": null,
              "url": "https://example.com/normal",
              "sources": [{ "name": "Example" }],
              "category": "models",
              "publishedAt": "2026-08-12T14:00:00Z",
              "imageURL": null
            }
          ]
        }
        """
        let fetcher = RemoteFeedFetcher(
            client: StubNetworkClient(responses: [feedURL: Data(json.utf8)]),
            feedURL: feedURL
        )
        let items = try await fetcher.fetch()

        // The garbage-URL story is dropped entirely; only the two decodable-URL stories survive.
        #expect(items.map(\.title) == [
            "A story with a category we've never seen",
            "A perfectly normal story",
        ])

        let unknownCategory = try #require(items.first { $0.title == "A story with a category we've never seen" })
        #expect(unknownCategory.category == .tools)
    }
}
