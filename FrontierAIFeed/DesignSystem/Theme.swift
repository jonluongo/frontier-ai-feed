import SwiftUI
import FrontierFeedKit

/// The visual system for Frontier AI Feed — a "situation report from the edge": category
/// color encodes structure, and a monospaced telemetry eyebrow gives every card the feel of
/// a dated dispatch.
enum Theme {
    // Neutrals
    static let ink = Color(hex: 0x0B0D10)          // deep blue-black (dark bg)
    static let inkRaised = Color(hex: 0x14171C)    // raised surface on dark
    static let hairline = Color.primary.opacity(0.10)

    // Type roles
    static func masthead(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .rounded) }
    static func title(_ size: CGFloat) -> Font { .system(size: size, weight: .semibold, design: .default) }
    static func eyebrow(_ size: CGFloat = 11) -> Font { .system(size: size, weight: .semibold, design: .monospaced) }
    static func body(_ size: CGFloat = 15) -> Font { .system(size: size, weight: .regular, design: .default) }
}

extension FeedCategory {
    /// The hue that encodes this Category across chips and card ticks.
    var tint: Color {
        switch self {
        case .models: return Color(hex: 0x7C5CFC)      // violet — the headline kind
        case .tools: return Color(hex: 0xE8A13A)       // amber
        case .techniques: return Color(hex: 0x2FB6A6)  // teal
        case .research: return Color(hex: 0xE5688C)    // rose
        }
    }

    /// Display label for chips and eyebrows.
    var label: String {
        switch self {
        case .models: return "Models"
        case .tools: return "Tools"
        case .techniques: return "Techniques"
        case .research: return "Research"
        }
    }
}

extension Color {
    init(hex: UInt) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
