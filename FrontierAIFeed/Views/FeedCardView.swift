import SwiftUI
import FrontierFeedKit

/// One dispatch. The monospaced eyebrow (SOURCE · AGE · CATEGORY) and the leading category
/// tick are the signature; the lead variant promotes the newest item with its image.
struct FeedCardView: View {
    let item: FeedItem
    var isLead: Bool = false
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            if isLead {
                leadBody
            } else {
                standardBody
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: lead

    private var leadBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let imageURL = item.imageURL {
                thumbnail(imageURL, height: 200)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            eyebrow
            Text(item.title)
                .font(Theme.title(24))
                .foregroundStyle(.primary)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
            if let snippet = item.snippet, !snippet.isEmpty {
                Text(snippet)
                    .font(Theme.body(15))
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .overlay(tick, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: standard

    private var standardBody: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                eyebrow
                Text(item.title)
                    .font(Theme.title(17))
                    .foregroundStyle(.primary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                if let snippet = item.snippet, !snippet.isEmpty {
                    Text(snippet)
                        .font(Theme.body(14))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if let imageURL = item.imageURL {
                thumbnail(imageURL, height: 62)
                    .frame(width: 62, height: 62)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .overlay(tick, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: parts

    private var eyebrow: some View {
        HStack(spacing: 6) {
            Circle().fill(item.category.tint).frame(width: 6, height: 6)
            Text(eyebrowText)
                .font(Theme.eyebrow())
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private var eyebrowText: String {
        let source = item.sources.first?.name ?? "—"
        let extra = item.sources.count > 1 ? " +\(item.sources.count - 1)" : ""
        return "\(source)\(extra) · \(compactAge(item.publishedAt)) · \(item.category.label.uppercased())"
    }

    private var tick: some View {
        Rectangle()
            .fill(item.category.tint)
            .frame(width: 3)
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(.background.secondary)
    }

    private func thumbnail(_ url: URL, height: CGFloat) -> some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: .fill)
            default:
                Rectangle().fill(item.category.tint.opacity(0.12))
            }
        }
        .frame(height: height)
        .clipped()
    }
}

/// A compact "how long ago" for the telemetry eyebrow — "2H", "3D", "NOW".
func compactAge(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    switch seconds {
    case ..<60: return "NOW"
    case ..<3600: return "\(Int(seconds / 60))M"
    case ..<86_400: return "\(Int(seconds / 3600))H"
    case ..<604_800: return "\(Int(seconds / 86_400))D"
    default: return "\(Int(seconds / 604_800))W"
    }
}
