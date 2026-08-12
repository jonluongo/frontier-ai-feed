import Foundation

/// The HTTP transport seam. Hides `URLSession`, the polite `User-Agent`, and status
/// validation — callers just get bytes or an error. Stubbed in tests (`StubNetworkClient`).
public protocol NetworkClient: Sendable {
    func get(_ url: URL) async throws -> Data
}

/// A Fetcher pulls Items from one endpoint and normalizes them. Not user-visible; not
/// 1-to-1 with Source (the generic RSS Fetcher yields many Sources).
public protocol Fetcher: Sendable {
    func fetch() async throws -> [FeedItem]
}
