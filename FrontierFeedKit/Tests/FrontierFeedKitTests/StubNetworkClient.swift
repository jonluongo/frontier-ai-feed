import Foundation
@testable import FrontierFeedKit

/// A test double for the HTTP transport seam: returns pre-recorded bytes for known URLs,
/// throws for anything unmapped. No live network. This is the only place tests touch the
/// system boundary.
struct StubNetworkClient: NetworkClient {
    enum StubError: Error { case unmapped(URL) }

    let responses: [URL: Data]

    func get(_ url: URL) async throws -> Data {
        guard let data = responses[url] else { throw StubError.unmapped(url) }
        return data
    }
}
