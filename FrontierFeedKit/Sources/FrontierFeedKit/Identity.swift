import Foundation
import CryptoKit

/// Item identity (ADR-0001): an Item is identified by its *normalized* URL, so the same
/// story surfaced by several Fetchers collapses into one Item.
///
/// `canonicalKey` produces the normalization; `itemID` hashes it into a stable id.

/// Query-parameter names that are tracking noise, not story identity.
private let trackingParamNames: Set<String> = [
    "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src", "cmpid", "spm",
]

private func isTrackingParam(_ name: String) -> Bool {
    let lower = name.lowercased()
    return lower.hasPrefix("utm_") || trackingParamNames.contains(lower)
}

/// The canonical, comparable form of a URL: lowercased scheme+host, no fragment, no
/// trailing slash, tracking params removed, remaining params order-normalized.
func canonicalKey(for url: URL) -> String {
    guard var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
        return url.absoluteString.lowercased()
    }
    comps.scheme = comps.scheme?.lowercased()
    comps.host = comps.host?.lowercased()
    comps.fragment = nil

    if comps.path.count > 1 && comps.path.hasSuffix("/") {
        comps.path = String(comps.path.dropLast())
    }

    if let items = comps.queryItems {
        let kept = items
            .filter { !isTrackingParam($0.name) }
            .sorted { $0.name < $1.name }
        comps.queryItems = kept.isEmpty ? nil : kept
    }

    return comps.string ?? url.absoluteString.lowercased()
}

/// A stable, launch-independent id derived from the canonical key (SHA-256 hex).
func itemID(for url: URL) -> String {
    let digest = SHA256.hash(data: Data(canonicalKey(for: url).utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
}
