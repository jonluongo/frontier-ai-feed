import Foundation

/// Local persistence seam for the last-known Feed. Hides Codable + storage; callers never
/// touch disk. Live adapter writes JSON to disk; tests use an in-memory double.
public protocol FeedCache: Sendable {
    func load() -> [FeedItem]?
    func save(_ items: [FeedItem])
}
