import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 10 — filterFeed: the category-chip filter over the one Feed (a nil category is the
// "Frontier" all-view).

@Suite("Filter feed")
struct FilterFeedTests {

    private func item(_ title: String, _ category: Category) -> FeedItem {
        FeedItem(title: title, snippet: nil, url: URL(string: "https://a.com/\(title)")!,
                 sources: [Source(name: "T")], category: category,
                 publishedAt: .distantPast, imageURL: nil)
    }

    @Test("nil category returns the whole Feed unchanged")
    func nilReturnsAll() {
        let items = [item("a", .models), item("b", .research)]
        #expect(filterFeed(items, category: nil) == items)
    }

    @Test("a category returns only its Items")
    func filtersByCategory() {
        let items = [item("a", .models), item("b", .research), item("c", .models)]
        #expect(filterFeed(items, category: .models).map(\.title) == ["a", "c"])
    }
}
