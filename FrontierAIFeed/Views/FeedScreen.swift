import SwiftUI
import FrontierFeedKit

/// The one screen: masthead, Category chips, and the scrollable Feed of dispatches.
struct FeedScreen: View {
    @State private var model = FeedViewModel()
    @State private var reader: ReaderLink?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                Section {
                    content
                        .padding(.horizontal, 16)
                } header: {
                    CategoryChips(categories: model.presentCategories, selection: $model.selectedCategory)
                        .padding(.vertical, 10)
                        .background(.bar)
                }
            }
        }
        .background(backgroundColor.ignoresSafeArea())
        .refreshable { await model.refresh() }
        .task { await model.start() }
        .sheet(item: $reader) { SafariReader(url: $0.url).ignoresSafeArea() }
    }

    // MARK: sections

    @ViewBuilder
    private var content: some View {
        let items = model.visibleItems
        if items.isEmpty {
            emptyOrLoading
        } else {
            FeedCardView(item: items[0], isLead: true) { open(items[0]) }
                .padding(.bottom, 4)
            ForEach(items.dropFirst()) { item in
                FeedCardView(item: item) { open(item) }
            }
        }
    }

    @ViewBuilder
    private var emptyOrLoading: some View {
        VStack(spacing: 10) {
            if !model.hasLoadedOnce {
                ProgressView()
                Text("Scanning the frontier…")
                    .font(Theme.eyebrow())
                    .foregroundStyle(.secondary)
            } else {
                Text("No dispatches here yet.")
                    .font(Theme.title(17))
                Text("Pull to refresh.")
                    .font(Theme.body())
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private var backgroundColor: Color {
        Color(uiColor: .systemGroupedBackground)
    }

    private func open(_ item: FeedItem) {
        reader = ReaderLink(url: item.url)
    }
}
