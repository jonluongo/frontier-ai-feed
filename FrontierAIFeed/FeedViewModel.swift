import SwiftUI
import Observation
import FrontierFeedKit

/// Screen state for the Feed: holds the one Feed, the selected Category filter, and refresh
/// status. All engine work is delegated to `FeedRepository`; this only orchestrates UI.
@MainActor
@Observable
final class FeedViewModel {
    private let repository: FeedRepository

    private(set) var items: [FeedItem] = []
    private(set) var isRefreshing = false
    private(set) var hasLoadedOnce = false
    var selectedCategory: FeedCategory?

    init(repository: FeedRepository = .live()) {
        self.repository = repository
    }

    /// Items after applying the Category chip filter.
    var visibleItems: [FeedItem] {
        filterFeed(items, category: selectedCategory)
    }

    /// The Categories that actually appear in the current Feed (drives which chips show).
    var presentCategories: [FeedCategory] {
        FeedCategory.allCases.filter { category in items.contains { $0.category == category } }
    }

    /// Show the cached Feed instantly, then refresh from the network.
    func start() async {
        items = await repository.cachedFeed()
        hasLoadedOnce = !items.isEmpty
        await refresh()
    }

    func refresh() async {
        isRefreshing = true
        items = await repository.refresh()
        isRefreshing = false
        hasLoadedOnce = true
    }
}
