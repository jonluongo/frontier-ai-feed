import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 2 — mergeFeed: flatten per-Fetcher groups, collapse duplicates by Item identity
// (unioning their Sources), and sort newest-first.

@Suite("Merge feed")
struct MergeFeedTests {

    private func item(
        _ title: String,
        url: String,
        sources: [Source],
        at epoch: TimeInterval
    ) -> FeedItem {
        FeedItem(
            title: title,
            snippet: nil,
            url: URL(string: url)!,
            sources: sources,
            category: .models,
            publishedAt: Date(timeIntervalSince1970: epoch),
            imageURL: nil
        )
    }

    @Test("the same story from two Fetchers collapses into one Item, unioning Sources")
    func collapsesDuplicatesAndUnionsSources() {
        let fromHN = item("GPT-5", url: "https://openai.com/blog/gpt-5",
                          sources: [Source(name: "Hacker News")], at: 1_000)
        let fromBlog = item("GPT-5 is here", url: "https://openai.com/blog/gpt-5/?utm_source=x",
                            sources: [Source(name: "OpenAI")], at: 1_000)

        let merged = mergeFeed([[fromHN], [fromBlog]])

        #expect(merged.count == 1)
        #expect(Set(merged[0].sources) == [Source(name: "Hacker News"), Source(name: "OpenAI")])
    }

    @Test("distinct stories are all kept, sorted newest-first")
    func keepsDistinctSortedNewestFirst() {
        let older = item("Older", url: "https://a.com/1", sources: [Source(name: "A")], at: 1_000)
        let newer = item("Newer", url: "https://a.com/2", sources: [Source(name: "A")], at: 2_000)

        let merged = mergeFeed([[older], [newer]])

        #expect(merged.map(\.title) == ["Newer", "Older"])
    }
}
