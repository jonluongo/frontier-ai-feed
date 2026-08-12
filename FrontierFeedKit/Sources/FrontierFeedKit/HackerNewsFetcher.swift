import Foundation

/// Fetches AI-relevant top stories from the Hacker News Firebase API and maps them into
/// FeedItems. The N+1 shape (top-story ids, then one request per story) is hidden behind
/// `fetch()`.
public struct HackerNewsFetcher: Fetcher {
    private let client: NetworkClient
    private let maxStories: Int
    private let base: URL

    public init(
        client: NetworkClient,
        maxStories: Int = 200,
        base: URL = URL(string: "https://hacker-news.firebaseio.com/v0/")!
    ) {
        self.client = client
        self.maxStories = maxStories
        self.base = base
    }

    public func fetch() async throws -> [FeedItem] {
        let idsData = try await client.get(base.appending(path: "topstories.json"))
        let ids = try JSONDecoder().decode([Int].self, from: idsData)

        // Sequential + best-effort for now: a single malformed/failed story is skipped, not
        // fatal. Concurrency is an internal optimization the interface doesn't expose.
        var items: [FeedItem] = []
        for id in ids.prefix(maxStories) {
            if let item = try? await story(id: id) { items.append(item) }
        }
        return items
    }

    private struct HNStory: Decodable {
        let type: String?
        let title: String?
        let url: String?
        let time: TimeInterval?
    }

    private func story(id: Int) async throws -> FeedItem? {
        let data = try await client.get(base.appending(path: "item/\(id).json"))
        let story = try JSONDecoder().decode(HNStory.self, from: data)

        guard story.type == "story",
              let title = story.title,
              let urlString = story.url,
              let url = URL(string: urlString),
              isAIRelevant(title)
        else { return nil }

        return FeedItem(
            title: title,
            snippet: nil,
            url: url,
            sources: [Source(name: "Hacker News")],
            category: .tools, // HN's source-declared default; real categorization is a later slice.
            publishedAt: Date(timeIntervalSince1970: story.time ?? 0),
            imageURL: nil
        )
    }
}

/// Whether a title is about the AI frontier. Word-boundaried so "ai" never matches inside
/// "email"/"training". Deliberately excludes bare "model" (too many false positives).
func isAIRelevant(_ title: String) -> Bool {
    guard let regex = try? Regex(aiKeywordPattern).ignoresCase() else { return false }
    return title.contains(regex)
}

private let aiKeywordPattern: String = {
    let alternatives = [
        "ai", "llm", "llms", "gpt", "chatgpt", "openai", "anthropic", "claude", "gemini",
        "llama", "mistral", "transformer", "transformers", "neural", "agent", "agents",
        "rag", "diffusion", "embeddings?", "inference", "deepmind", "hugging ?face",
        "machine learning", "deep learning", "large language models?", "fine[- ]tuning",
        "foundation models?", "generative ai",
    ].joined(separator: "|")
    return "\\b(\(alternatives))\\b"
}()
