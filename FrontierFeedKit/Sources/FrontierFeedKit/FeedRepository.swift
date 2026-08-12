import Foundation

/// The engine's aggregator and the app's single entry point to the Feed. Hides concurrent
/// fan-out across Fetchers, per-Fetcher failure isolation, dedup/merge by Item identity,
/// sorting, and cache read/write.
///
/// An actor: refresh and cache access are serialized, so callers need no locking.
public actor FeedRepository {
    private let fetchers: [Fetcher]
    private let cache: FeedCache

    public init(fetchers: [Fetcher], cache: FeedCache) {
        self.fetchers = fetchers
        self.cache = cache
    }

    /// The last-known Feed, served instantly (empty if nothing cached yet).
    public func cachedFeed() -> [FeedItem] {
        cache.load() ?? []
    }

    /// Run every Fetcher concurrently, isolate failures (a dead Fetcher yields nothing
    /// rather than throwing), merge, cache, and return the fresh Feed.
    @discardableResult
    public func refresh() async -> [FeedItem] {
        let groups = await withTaskGroup(of: [FeedItem].self) { group in
            for fetcher in fetchers {
                group.addTask {
                    (try? await fetcher.fetch()) ?? []
                }
            }
            var collected: [[FeedItem]] = []
            for await result in group { collected.append(result) }
            return collected
        }

        let feed = mergeFeed(groups)
        cache.save(feed)
        return feed
    }
}
