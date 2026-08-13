import Foundation

/// The four kinds of Frontier content. Exhaustive and mutually exclusive (see CONTEXT.md).
public enum FeedCategory: String, Codable, CaseIterable, Sendable {
    case models
    case tools
    case techniques
    case research
}

/// A named origin shown as attribution on an Item's card, and the unit toggled in Settings
/// (e.g. "OpenAI", "arXiv", "Hacker News"). Not the fetch adapter — that is a Fetcher.
public struct Source: Codable, Hashable, Sendable {
    public let name: String
    /// Attribution host (e.g. "techcrunch.com") used for the card's favicon; optional.
    public let domain: String?

    public init(name: String, domain: String? = nil) {
        self.name = name
        self.domain = domain
    }
}

/// One real, published piece of Frontier content. Identity is its normalized URL
/// (ADR-0001), so the same story from several Fetchers is one Item carrying every
/// Source that surfaced it.
public struct FeedItem: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let snippet: String?
    public let url: URL
    public let sources: [Source]
    public let category: FeedCategory
    public let publishedAt: Date
    public let imageURL: URL?
    public let signal: Int?
    public let alert: Bool?

    public init(
        title: String,
        snippet: String?,
        url: URL,
        sources: [Source],
        category: FeedCategory,
        publishedAt: Date,
        imageURL: URL?,
        signal: Int? = nil,
        alert: Bool? = nil
    ) {
        self.id = itemID(for: url)
        self.title = title
        self.snippet = snippet
        self.url = url
        self.sources = sources
        self.category = category
        self.publishedAt = publishedAt
        self.imageURL = imageURL
        self.signal = signal
        self.alert = alert
    }
}
