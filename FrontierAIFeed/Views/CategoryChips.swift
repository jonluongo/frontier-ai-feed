import SwiftUI
import FrontierFeedKit

/// The Category legend and filter. "All" is the Frontier view (nil); each chip filters the
/// one Feed to its Category, colored by that Category's tint.
struct CategoryChips: View {
    let categories: [FeedCategory]
    @Binding var selection: FeedCategory?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "All", tint: .primary, isOn: selection == nil) { selection = nil }
                ForEach(categories, id: \.self) { category in
                    chip(title: category.label, tint: category.tint, isOn: selection == category) {
                        selection = category
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func chip(title: String, tint: Color, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if title != "All" {
                    Circle().fill(tint).frame(width: 7, height: 7)
                }
                Text(title.uppercased())
                    .font(Theme.eyebrow(12))
                    .tracking(0.5)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(isOn ? tint.opacity(0.18) : Color.primary.opacity(0.05))
            )
            .overlay(
                Capsule().strokeBorder(isOn ? tint.opacity(0.9) : .clear, lineWidth: 1)
            )
            .foregroundStyle(isOn ? .primary : .secondary)
        }
        .buttonStyle(.plain)
    }
}
