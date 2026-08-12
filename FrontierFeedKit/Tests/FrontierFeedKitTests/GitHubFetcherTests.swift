import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 8 — GitHubFetcher: map the GitHub repository-search API into FeedItems (Tools).
// Fixture captured from the real api.github.com response.

@Suite("GitHub fetcher")
struct GitHubFetcherTests {

    @Test("maps repository search results into Tool FeedItems")
    func mapsRepos() async throws {
        let fixture = try #require(Bundle.module.url(forResource: "github_search", withExtension: "json", subdirectory: "Fixtures"))
        let url = GitHubFetcher.requestURL(query: GitHubFetcher.defaultQuery)
        let fetcher = GitHubFetcher(client: StubNetworkClient(responses: [url: try Data(contentsOf: fixture)]))

        let items = try await fetcher.fetch()

        #expect(items.map(\.title) == ["NousResearch/hermes-agent", "Significant-Gravitas/AutoGPT"])
        #expect(items.allSatisfy { $0.sources == [Source(name: "GitHub")] })
        #expect(items.allSatisfy { $0.category == .tools })
        #expect(items[0].url == URL(string: "https://github.com/NousResearch/hermes-agent"))
        #expect(items[0].snippet == "The agent that grows with you")
        #expect(items[0].publishedAt == Date(timeIntervalSince1970: 1_753_222_948)) // 2025-07-22T22:22:28Z
    }
}
