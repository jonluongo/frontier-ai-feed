import Testing
import Foundation
@testable import FrontierFeedKit

// A real-network smoke test — validates the catalog URLs and parsers against live feeds.
// Skipped by default; run with `LIVE=1 swift test`.

@Suite(.enabled(if: ProcessInfo.processInfo.environment["LIVE"] != nil))
struct LiveSmokeTests {

    @Test("live refresh returns a non-trivial, sorted, deduped Feed")
    func liveRefresh() async throws {
        let feed = await FeedRepository.live().refresh()

        #expect(feed.count > 10)

        // Sorted newest-first.
        #expect(feed == feed.sorted { $0.publishedAt > $1.publishedAt })

        // Deduped by identity.
        #expect(Set(feed.map(\.id)).count == feed.count)

        // Report coverage so the run is informative.
        let bySource = Dictionary(grouping: feed) { $0.sources.first?.name ?? "?" }
            .mapValues(\.count).sorted { $0.value > $1.value }
        print("LIVE feed: \(feed.count) items across \(bySource.count) sources: \(bySource)")
    }
}
