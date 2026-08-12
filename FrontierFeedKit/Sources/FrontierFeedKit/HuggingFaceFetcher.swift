import Foundation

/// Fetches Hugging Face's community-curated daily papers and maps them into Research
/// FeedItems, linking to the HF paper page (which carries the discussion).
public struct HuggingFaceFetcher: Fetcher {
    private let client: NetworkClient

    public static let requestURL = URL(string: "https://huggingface.co/api/daily_papers")!

    public init(client: NetworkClient) {
        self.client = client
    }

    public func fetch() async throws -> [FeedItem] {
        let data = try await client.get(Self.requestURL)
        let entries = try Self.decoder.decode([Entry].self, from: data)
        return entries.compactMap { entry -> FeedItem? in
            guard let url = URL(string: "https://huggingface.co/papers/\(entry.paper.id)") else { return nil }
            return FeedItem(
                title: entry.paper.title,
                snippet: entry.paper.summary,
                url: url,
                sources: [Source(name: "Hugging Face")],
                category: .research,
                publishedAt: entry.paper.publishedAt,
                imageURL: nil
            )
        }
    }

    private struct Entry: Decodable {
        let paper: Paper
    }

    private struct Paper: Decodable {
        let id: String
        let title: String
        let summary: String?
        let publishedAt: Date
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        // HF timestamps carry fractional seconds ("…T00:00:00.000Z"), which the plain
        // .iso8601 strategy rejects — accept both forms.
        d.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            let withFractional = ISO8601DateFormatter()
            withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let plain = ISO8601DateFormatter()
            if let date = withFractional.date(from: string) ?? plain.date(from: string) {
                return date
            }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Unparseable date: \(string)")
            )
        }
        return d
    }()
}
