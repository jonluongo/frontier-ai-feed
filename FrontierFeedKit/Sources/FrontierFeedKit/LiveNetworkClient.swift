import Foundation

public enum NetworkError: Error, Sendable {
    case notHTTP
    case badStatus(Int)
}

/// The live HTTP transport: `URLSession` + a polite `User-Agent`, validating status.
/// Not unit-tested (it *is* the system boundary); exercised by real runs and by every
/// Fetcher through the `NetworkClient` seam using `StubNetworkClient` in tests.
public struct LiveNetworkClient: NetworkClient {
    private let session: URLSession
    private let userAgent: String

    public init(
        session: URLSession = .shared,
        userAgent: String = "FrontierAIFeed/1.0 (personal reader; +https://github.com/frontier-ai-feed)"
    ) {
        self.session = session
        self.userAgent = userAgent
    }

    public func get(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw NetworkError.notHTTP }
        guard (200..<300).contains(http.statusCode) else {
            throw NetworkError.badStatus(http.statusCode)
        }
        return data
    }
}
