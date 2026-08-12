import Testing
import Foundation
@testable import FrontierFeedKit

// Slice 1 — Item identity (ADR-0001): identity is the *normalized* URL.
// Two links that are the same story after normalization must share one itemID.

@Suite("Item identity")
struct ItemIdentityTests {

    @Test("a trailing slash does not change identity")
    func trailingSlash() throws {
        let a = try #require(URL(string: "https://openai.com/blog/gpt-5/"))
        let b = try #require(URL(string: "https://openai.com/blog/gpt-5"))
        #expect(itemID(for: a) == itemID(for: b))
    }

    @Test("scheme and host casing does not change identity")
    func casing() throws {
        let a = try #require(URL(string: "HTTPS://OpenAI.com/blog/gpt-5"))
        let b = try #require(URL(string: "https://openai.com/blog/gpt-5"))
        #expect(itemID(for: a) == itemID(for: b))
    }

    @Test("a URL fragment does not change identity")
    func fragment() throws {
        let a = try #require(URL(string: "https://openai.com/blog/gpt-5#section-2"))
        let b = try #require(URL(string: "https://openai.com/blog/gpt-5"))
        #expect(itemID(for: a) == itemID(for: b))
    }

    @Test("tracking query params do not change identity")
    func trackingParams() throws {
        let a = try #require(URL(string: "https://openai.com/blog/gpt-5?utm_source=hn&utm_campaign=launch"))
        let b = try #require(URL(string: "https://openai.com/blog/gpt-5"))
        #expect(itemID(for: a) == itemID(for: b))
    }

    // Guards: distinct stories must NOT collapse.

    @Test("different paths are different Items")
    func differentPaths() throws {
        let a = try #require(URL(string: "https://openai.com/blog/gpt-5"))
        let b = try #require(URL(string: "https://openai.com/blog/gpt-4"))
        #expect(itemID(for: a) != itemID(for: b))
    }

    @Test("a meaningful query param keeps Items distinct")
    func meaningfulQuery() throws {
        let a = try #require(URL(string: "https://arxiv.org/abs/2401.00001?v=1"))
        let b = try #require(URL(string: "https://arxiv.org/abs/2401.00001?v=2"))
        #expect(itemID(for: a) != itemID(for: b))
    }

    @Test("different hosts are different Items")
    func differentHosts() throws {
        let a = try #require(URL(string: "https://openai.com/blog/gpt-5"))
        let b = try #require(URL(string: "https://anthropic.com/blog/gpt-5"))
        #expect(itemID(for: a) != itemID(for: b))
    }
}
