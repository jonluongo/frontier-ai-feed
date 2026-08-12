import Foundation

/// Fetches new/trending AI repositories from the GitHub repository-search API and maps them
/// into Tool FeedItems. No auth (public search endpoint; rate-limited).
public struct GitHubFetcher: Fetcher {
    private let client: NetworkClient
    private let query: String

    /// The repo-search query for AI-frontier tooling.
    public static let defaultQuery = "topic:llm OR topic:large-language-models OR topic:ai-agents"

    public init(client: NetworkClient, query: String = GitHubFetcher.defaultQuery) {
        self.client = client
        self.query = query
    }

    /// The exact endpoint the Fetcher will request for a given query (sorted by stars).
    public static func requestURL(query: String) -> URL {
        var components = URLComponents(string: "https://api.github.com/search/repositories")!
        components.queryItems = [
            .init(name: "q", value: query),
            .init(name: "sort", value: "stars"),
            .init(name: "order", value: "desc"),
            .init(name: "per_page", value: "30"),
        ]
        return components.url!
    }

    public func fetch() async throws -> [FeedItem] {
        let data = try await client.get(Self.requestURL(query: query))
        let response = try Self.decoder.decode(Response.self, from: data)
        return response.items.map { repo in
            FeedItem(
                title: repo.fullName,
                snippet: repo.description,
                url: repo.htmlURL,
                sources: [Source(name: "GitHub")],
                category: .tools,
                publishedAt: repo.createdAt,
                imageURL: nil
            )
        }
    }

    private struct Response: Decodable {
        let items: [Repo]
    }

    private struct Repo: Decodable {
        let fullName: String
        let htmlURL: URL
        let description: String?
        let createdAt: Date

        enum CodingKeys: String, CodingKey {
            case fullName = "full_name"
            case htmlURL = "html_url"
            case description
            case createdAt = "created_at"
        }
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
