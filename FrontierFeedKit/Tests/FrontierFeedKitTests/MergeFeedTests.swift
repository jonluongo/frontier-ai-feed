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
        at epoch: TimeInterval,
        signal: Int? = nil,
        alert: Bool? = nil
    ) -> FeedItem {
        FeedItem(
            title: title,
            snippet: nil,
            url: URL(string: url)!,
            sources: sources,
            category: .models,
            publishedAt: Date(timeIntervalSince1970: epoch),
            imageURL: nil,
            signal: signal,
            alert: alert
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

    @Test("a signal-bearing item precedes a newer nil-signal item")
    func signalItemPrecedesNewerNilSignalItem() {
        let signalled = item("Signalled", url: "https://a.com/1", sources: [Source(name: "A")],
                              at: 1_000, signal: 80)
        let newerNoSignal = item("Newer, no signal", url: "https://a.com/2", sources: [Source(name: "A")],
                                  at: 2_000)

        let merged = mergeFeed([[signalled], [newerNoSignal]])

        #expect(merged.map(\.title) == ["Signalled", "Newer, no signal"])
    }

    @Test("two signal-bearing items order by signal descending")
    func twoSignalItemsOrderDescending() {
        let lower = item("Lower signal", url: "https://a.com/1", sources: [Source(name: "A")],
                          at: 1_000, signal: 40)
        let higher = item("Higher signal", url: "https://a.com/2", sources: [Source(name: "A")],
                           at: 1_000, signal: 90)

        let merged = mergeFeed([[lower], [higher]])

        #expect(merged.map(\.title) == ["Higher signal", "Lower signal"])
    }

    @Test("a merged duplicate keeps the max signal among its occurrences")
    func mergedDuplicateKeepsMaxSignal() {
        let onDevice = item("GPT-5", url: "https://openai.com/blog/gpt-5",
                             sources: [Source(name: "Hacker News")], at: 1_000,
                             signal: nil, alert: nil)
        let remote = item("GPT-5 is here", url: "https://openai.com/blog/gpt-5/?utm_source=x",
                           sources: [Source(name: "OpenAI")], at: 1_000,
                           signal: 80, alert: true)

        let merged = mergeFeed([[onDevice], [remote]])

        #expect(merged.count == 1)
        #expect(merged[0].signal == 80)
        #expect(merged[0].alert == true)
    }

    @Test("a nil signal never overrides a non-nil signal when merging duplicates")
    func nilSignalNeverOverridesExistingSignal() {
        let remoteFirst = item("GPT-5 is here", url: "https://openai.com/blog/gpt-5",
                                sources: [Source(name: "OpenAI")], at: 1_000,
                                signal: 80, alert: true)
        let onDeviceSecond = item("GPT-5", url: "https://openai.com/blog/gpt-5/?utm_source=x",
                                   sources: [Source(name: "Hacker News")], at: 1_000,
                                   signal: nil, alert: nil)

        let merged = mergeFeed([[remoteFirst], [onDeviceSecond]])

        #expect(merged.count == 1)
        #expect(merged[0].signal == 80)
        #expect(merged[0].alert == true)
    }
}
