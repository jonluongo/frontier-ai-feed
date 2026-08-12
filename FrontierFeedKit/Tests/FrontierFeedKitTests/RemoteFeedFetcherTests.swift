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
        #expect(items.map(\.title) == [
            "Research update",
            "A new LLM benchmark from DeepMind",
            "OpenAI releases GPT-5",
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

        // signal/alert are absent from the pipeline's v1 wire format today; RemoteFeedFetcher
        // must still decode successfully and default them to nil.
        #expect(items.allSatisfy { $0.signal == nil && $0.alert == nil })
    }
}
