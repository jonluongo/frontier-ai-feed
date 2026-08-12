import { expect, test } from "vitest";
import { toFeedDocument } from "../src/publish.js";
import { itemID } from "../src/identity.js";

test("builds a versioned document without internal fields", () => {
  const doc = toFeedDocument([{
    id: itemID("https://a.com/1"), title: "T", snippet: null, url: "https://a.com/1",
    sources: [{ name: "A" }], category: "models", publishedAt: "2026-01-01T00:00:00Z",
    imageURL: null, engagement: 42,
  }], "2026-08-12T14:00:00Z");
  expect(doc.version).toBe(1);
  expect(doc.generatedAt).toBe("2026-08-12T14:00:00Z");
  expect(doc.stories).toHaveLength(1);
  expect("engagement" in doc.stories[0]!).toBe(false);
});

test("maps every public field through", () => {
  const doc = toFeedDocument([{
    id: itemID("https://a.com/2"), title: "Title", snippet: "Snippet", url: "https://a.com/2",
    sources: [{ name: "A" }, { name: "B" }], category: "research", publishedAt: "2026-02-01T00:00:00Z",
    imageURL: "https://a.com/img.png", engagement: null,
  }], "2026-08-12T14:00:00Z");
  expect(doc.stories[0]).toEqual({
    id: itemID("https://a.com/2"),
    title: "Title",
    snippet: "Snippet",
    url: "https://a.com/2",
    sources: [{ name: "A" }, { name: "B" }],
    category: "research",
    publishedAt: "2026-02-01T00:00:00Z",
    imageURL: "https://a.com/img.png",
  });
});
