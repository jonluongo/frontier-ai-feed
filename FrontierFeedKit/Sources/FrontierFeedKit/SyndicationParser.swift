import Foundation

/// A format-neutral feed entry parsed from RSS 2.0 or Atom.
struct SyndicationEntry: Equatable {
    let title: String
    let link: URL
    let summary: String?
    let published: Date?
    let imageURL: URL?
}

/// Parse raw RSS 2.0 or Atom bytes into neutral entries. Malformed feeds yield `[]`;
/// entries without a usable link are dropped. One parser serves arXiv and every blog.
func parseSyndication(_ data: Data) -> [SyndicationEntry] {
    let delegate = SyndicationDelegate()
    let parser = XMLParser(data: data)
    parser.delegate = delegate
    parser.parse()
    return delegate.entries
}

private final class SyndicationDelegate: NSObject, XMLParserDelegate {
    var entries: [SyndicationEntry] = []

    private struct Partial {
        var title = ""
        var summary = ""
        var link: String?
        var dateString: String?
        var imageURL: String?
    }

    private var current: Partial?
    private var buffer = ""

    private let iso8601 = ISO8601DateFormatter()
    private let rfc822: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss Z"
        return f
    }()

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName: String?,
        attributes attributeDict: [String: String]
    ) {
        switch elementName {
        case "entry", "item":
            current = Partial()
        case "link":
            // Atom carries the link as an href attribute (RSS puts it in text — see didEnd).
            if current != nil, let href = attributeDict["href"] {
                let rel = attributeDict["rel"] ?? "alternate"
                if rel == "alternate" || current?.link == nil {
                    current?.link = href
                }
            }
        case "enclosure", "media:content", "media:thumbnail":
            if current?.imageURL == nil, let url = attributeDict["url"] {
                let type = attributeDict["type"] ?? ""
                if type.hasPrefix("image") || elementName != "enclosure" {
                    current?.imageURL = url
                }
            }
        default:
            break
        }
        buffer = ""
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        buffer += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if let s = String(data: CDATABlock, encoding: .utf8) { buffer += s }
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName: String?
    ) {
        guard current != nil else { buffer = ""; return }
        let text = buffer.trimmingCharacters(in: .whitespacesAndNewlines)

        switch elementName {
        case "title":
            current?.title = text
        case "summary", "description", "content":
            if current?.summary.isEmpty == true { current?.summary = text }
        case "published", "pubDate":
            current?.dateString = text
        case "updated":
            if current?.dateString == nil { current?.dateString = text }
        case "link":
            if current?.link == nil, !text.isEmpty { current?.link = text } // RSS text link
        case "entry", "item":
            finalizeCurrent()
        default:
            break
        }
        buffer = ""
    }

    private func finalizeCurrent() {
        defer { current = nil }
        guard let p = current, let link = p.link, let url = URL(string: link) else { return }
        entries.append(SyndicationEntry(
            title: p.title,
            link: url,
            summary: p.summary.isEmpty ? nil : p.summary,
            published: parseDate(p.dateString),
            imageURL: p.imageURL.flatMap { URL(string: $0) }
        ))
    }

    private func parseDate(_ string: String?) -> Date? {
        guard let string else { return nil }
        return iso8601.date(from: string) ?? rfc822.date(from: string)
    }
}
