import Foundation

/// Combine per-Fetcher Item groups into the Feed: flatten, collapse duplicates by Item
/// identity (ADR-0001) unioning their Sources, and sort newest-first.
///
/// Pure — no IO, no clock. The deduped representative keeps the earliest-published
/// occurrence's fields (the original publication), with Sources unioned across all
/// occurrences in first-seen order.
func mergeFeed(_ groups: [[FeedItem]]) -> [FeedItem] {
    var representativeByID: [String: FeedItem] = [:]
    var sourcesByID: [String: [Source]] = [:]
    var orderByID: [String: Int] = [:]
    var nextOrder = 0

    for item in groups.flatMap({ $0 }) {
        if orderByID[item.id] == nil {
            orderByID[item.id] = nextOrder
            nextOrder += 1
        }

        // Representative = earliest publishedAt (original publication).
        if let existing = representativeByID[item.id] {
            if item.publishedAt < existing.publishedAt {
                representativeByID[item.id] = item
            }
        } else {
            representativeByID[item.id] = item
        }

        // Union Sources in first-seen order, de-duplicating by name.
        var seen = sourcesByID[item.id] ?? []
        for source in item.sources where !seen.contains(source) {
            seen.append(source)
        }
        sourcesByID[item.id] = seen
    }

    let deduped: [FeedItem] = representativeByID.values.map { rep in
        FeedItem(
            title: rep.title,
            snippet: rep.snippet,
            url: rep.url,
            sources: sourcesByID[rep.id] ?? rep.sources,
            category: rep.category,
            publishedAt: rep.publishedAt,
            imageURL: rep.imageURL
        )
    }

    return deduped.sorted { $0.publishedAt > $1.publishedAt }
}
