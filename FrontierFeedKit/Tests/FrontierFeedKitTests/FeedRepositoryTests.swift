import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 4 — FeedRepository: run every Fetcher, merge the results, cache them, and keep one
// dead Fetcher from blanking the Feed.

@Suite("Feed repository")
struct FeedRepositoryTests {

    private func item(_ title: String, url: String, at epoch: TimeInterval) -> FeedItem {
        FeedItem(
            title: title, snippet: nil, url: URL(string: url)!,
            sources: [Source(name: "Test")], category: .tools,
            publishedAt: Date(timeIntervalSince1970: epoch), imageURL: nil
        )
    }

    @Test("refresh merges every Fetcher's Items and caches the result")
    func refreshMergesAndCaches() async {
        let older = item("Older", url: "https://a.com/1", at: 1_000)
        let newer = item("Newer", url: "https://a.com/2", at: 2_000)
        let cache = InMemoryCache()
        let repo = FeedRepository(
            fetchers: [StubFetcher(.success([older])), StubFetcher(.success([newer]))],
            cache: cache
        )

        let feed = await repo.refresh()

        #expect(feed.map(\.title) == ["Newer", "Older"])          // merged + sorted newest-first
        #expect(cache.load()?.map(\.title) == ["Newer", "Older"]) // persisted
    }

    @Test("a failing Fetcher does not blank the Feed")
    func failureIsolation() async {
        struct Boom: Error {}
        let good = item("Survivor", url: "https://a.com/1", at: 1_000)
        let repo = FeedRepository(
            fetchers: [StubFetcher(.success([good])), StubFetcher(.failure(Boom()))],
            cache: InMemoryCache()
        )

        let feed = await repo.refresh()

        #expect(feed.map(\.title) == ["Survivor"])
    }

    @Test("cachedFeed returns the last saved Feed")
    func cachedFeedReturnsSaved() async {
        let cache = InMemoryCache()
        let repo = FeedRepository(fetchers: [StubFetcher(.success([item("X", url: "https://a.com/1", at: 1)]))], cache: cache)
        _ = await repo.refresh()

        let cached = await repo.cachedFeed()

        #expect(cached.map(\.title) == ["X"])
    }
}

/// Test doubles.

struct StubFetcher: Fetcher {
    let result: Result<[FeedItem], Error>
    init(_ result: Result<[FeedItem], Error>) { self.result = result }
    func fetch() async throws -> [FeedItem] { try result.get() }
}

final class InMemoryCache: FeedCache, @unchecked Sendable {
    private let lock = NSLock()
    private var items: [FeedItem]?

    func load() -> [FeedItem]? { lock.withLock { items } }
    func save(_ items: [FeedItem]) { lock.withLock { self.items = items } }
}
