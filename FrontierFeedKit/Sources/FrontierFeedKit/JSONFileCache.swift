import Foundation

/// The live Feed cache: Codable JSON on disk. Best-effort — read/write failures degrade to
/// "no cache" rather than throwing, so a corrupt file never blocks the app.
public struct JSONFileCache: FeedCache {
    private let fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    /// Default location: `<Caches>/frontier-feed.json`.
    public init(filename: String = "frontier-feed.json") {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.init(fileURL: caches.appendingPathComponent(filename))
    }

    public func load() -> [FeedItem]? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? Self.decoder.decode([FeedItem].self, from: data)
    }

    public func save(_ items: [FeedItem]) {
        guard let data = try? Self.encoder.encode(items) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
