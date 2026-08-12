import SwiftUI
import SafariServices

/// In-app reader — opens an Item's real source in an `SFSafariViewController` sheet, so the
/// user never leaves the app to read.
struct SafariReader: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = true
        return SFSafariViewController(url: url, configuration: config)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// A URL made presentable via `.sheet(item:)`.
struct ReaderLink: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
