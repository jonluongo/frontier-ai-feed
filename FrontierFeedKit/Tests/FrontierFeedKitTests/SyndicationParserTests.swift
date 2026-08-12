import Testing
import Foundation
@testable import FrontierFeedKit

// Slices 5–6 — parseSyndication turns raw RSS/Atom bytes into neutral entries, so one
// parser serves arXiv and every company blog.

@Suite("Syndication parser")
struct SyndicationParserTests {

    private func fixtureData(_ name: String) throws -> Data {
        let url = try #require(
            Bundle.module.url(forResource: name, withExtension: "xml", subdirectory: "Fixtures"),
            "missing fixture \(name).xml"
        )
        return try Data(contentsOf: url)
    }

    @Test("parses Atom entries — title, link, summary, published")
    func atom() throws {
        let entries = parseSyndication(try fixtureData("atom_feed"))

        #expect(entries.count == 2)
        #expect(entries[0].title == "Attention Is All You Need Again")
        #expect(entries[0].link == URL(string: "https://arxiv.org/abs/2401.00001"))
        #expect(entries[0].summary == "We revisit attention mechanisms.")
        #expect(entries[0].published == Date(timeIntervalSince1970: 1_704_067_200)) // 2024-01-01T00:00:00Z
        #expect(entries[1].title == "Scaling Laws Redux")
    }

    @Test("parses RSS 2.0 entries — text link, CDATA description, RFC-822 date, enclosure image")
    func rss() throws {
        let entries = parseSyndication(try fixtureData("rss_feed"))

        #expect(entries.count == 2)
        #expect(entries[0].title == "Introducing GPT-5")
        #expect(entries[0].link == URL(string: "https://openai.com/blog/gpt-5"))
        #expect(entries[0].summary == "The next model.")
        #expect(entries[0].published == Date(timeIntervalSince1970: 1_704_067_200)) // Mon, 01 Jan 2024
        #expect(entries[0].imageURL == URL(string: "https://openai.com/img/gpt5.png"))
        #expect(entries[1].imageURL == nil)
    }
}
