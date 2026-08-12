import Foundation

/// Filter the Feed to a single Category. A `nil` category is the "Frontier" all-view — the
/// Category chips filter the one Feed, they don't produce separate feeds (see CONTEXT.md).
public func filterFeed(_ items: [FeedItem], category: FeedCategory?) -> [FeedItem] {
    guard let category else { return items }
    return items.filter { $0.category == category }
}
