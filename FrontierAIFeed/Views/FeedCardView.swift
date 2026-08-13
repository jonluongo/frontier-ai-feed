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
            sourceLogo
            Text(eyebrowText)
                .font(Theme.eyebrow())
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if let signal = item.signal {
                Spacer(minLength: 6)
                signalBadge(signal)
            }
        }
    }

    /// The source's favicon (via its attribution domain), falling back to the category dot
    /// when no domain is known or the icon fails to load.
    @ViewBuilder
    private var sourceLogo: some View {
        if let domain = item.sources.first?.domain,
           let iconURL = URL(string: "https://www.google.com/s2/favicons?domain=\(domain)&sz=64") {
            AsyncImage(url: iconURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable()
                        .frame(width: 14, height: 14)
                        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                default:
                    Circle().fill(item.category.tint).frame(width: 6, height: 6)
                }
            }
            .frame(width: 14, height: 14)
        } else {
            Circle().fill(item.category.tint).frame(width: 6, height: 6)
        }
    }

    private func signalBadge(_ signal: Int) -> some View {
        // ALERT comes from the wire (substance-gated: pickup>=2 or top-decile engagement — see
        // pipeline/src/score.ts). `?? (signal >= 90)` is only a fallback for feed documents that
        // predate the `alert` field. The 60-threshold "elevated" tier below is presentation-only
        // (a visual step, not a semantic gate) and is unaffected by this.
        let isAlert = item.alert ?? (signal >= 90)
        let isElevated = signal >= 60
        let fill: Color = isAlert
            ? item.category.tint
            : isElevated ? item.category.tint.opacity(0.25) : Color.primary.opacity(0.06)
        let textColor: Color = isAlert ? .white : isElevated ? .primary : .secondary

        return HStack(spacing: 3) {
            Text("\(signal)")
                .font(Theme.eyebrow().weight(.bold))
            if isAlert {
                Text("ALERT")
                    .font(Theme.eyebrow(9))
                    .tracking(1)
            }
        }
        .foregroundStyle(textColor)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(fill))
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
