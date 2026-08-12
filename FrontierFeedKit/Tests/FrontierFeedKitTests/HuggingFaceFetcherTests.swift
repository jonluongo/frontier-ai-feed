import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 9 — HuggingFaceFetcher: map HF daily papers into Research FeedItems. Fixture
// captured from the real huggingface.co API (note the fractional-second timestamps).

@Suite("Hugging Face fetcher")
struct HuggingFaceFetcherTests {

    @Test("maps daily papers into Research FeedItems")
    func mapsPapers() async throws {
        let fixture = try #require(Bundle.module.url(forResource: "hf_papers", withExtension: "json", subdirectory: "Fixtures"))
        let fetcher = HuggingFaceFetcher(
            client: StubNetworkClient(responses: [HuggingFaceFetcher.requestURL: try Data(contentsOf: fixture)])
        )

        let items = try await fetcher.fetch()

        #expect(items.count == 2)
        #expect(items[0].title == "InSight-doc: Agentic Visual Perception for Long-Document Understanding")
        #expect(items[0].url == URL(string: "https://huggingface.co/papers/2608.10628"))
        #expect(items.allSatisfy { $0.sources == [Source(name: "Hugging Face")] })
        #expect(items.allSatisfy { $0.category == .research })
        #expect(items[0].snippet != nil)
        #expect(items[0].publishedAt == Date(timeIntervalSince1970: 1_786_406_400)) // 2026-08-11T00:00:00.000Z
    }
}
