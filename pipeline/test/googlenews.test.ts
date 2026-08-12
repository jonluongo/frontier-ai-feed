import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  GOOGLE_NEWS_QUERIES,
  googleNewsFetcher,
  decodeGoogleNewsURL,
} from "../src/fetchers/googlenews.js";

const fixture = readFileSync(new URL("./fixtures/googlenews_openai.xml", import.meta.url), "utf8");

const queryURL = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:1d")}&hl=en-US&gl=US&ceid=US:en`;

const OPENAI_LINK =
  "https://news.google.com/rss/articles/CBMifkFVX3lxTE5JVDRxQk9ZdGgzNWhMYzFDY1FWMWtqekVCUVBobzBGcmlNNVdWVTJrelJwamhMdE1IMDU5SG41dktadFFJZTdrRWVrdDl4VTd1c19ESzV0NzFuMldpMmVOcFFBcmdzQ19vWWtXOXRXQTRfcUdWRFJEOVl6b0syZw?oc=5";

test("maps a single query into Items with outlet Source names, stripped titles, models category", async () => {
  const client = async (url: string) => {
    if (url !== queryURL('"OpenAI"')) throw new Error(`unmapped ${url}`);
    return fixture;
  };

  const items = await googleNewsFetcher(['"OpenAI"'])(client);

  expect(items).toHaveLength(6);
  expect(items.map(i => i.title)).toEqual([
    "OpenAI's AI smart speaker will reportedly be shaped 'like a doughnut'",
    "From assistance to execution: How enterprises put AI to work",
    "If the markets reject OpenAI and Anthropic, the US should nationalize them | Bruce Schneier and Nathan E Sanders",
    "Putting OpenAI Cyber Models to Work for Defenders",
    "Anthropic, OpenAI Hold Majority Of Startup AI Revenue 05/19/2026",
    "OpenAI-backed Thrive Holdings raises $2B to bring AI to the enterprise",
  ]);
  expect(items.map(i => i.sources[0]!.name)).toEqual([
    "Mashable",
    "OpenAI",
    "The Guardian",
    "Palo Alto Networks",
    "MediaPost",
    "TechCrunch",
  ]);
  expect(items.every(i => i.category === "models")).toBe(true);
  expect(items.every(i => i.engagement === null)).toBe(true);
  // Google News <description> is an anchor+outlet HTML block, never prose -- never surfaced as a snippet.
  expect(items.every(i => i.snippet === null)).toBe(true);
  // These captured links carry an opaque (non-decodable) CBMi token — see decode tests below —
  // so the fallback keeps the original Google redirect link as the item url.
  expect(items[0]!.url).toBe(OPENAI_LINK);
});

test("falls back to 'Google News' as source name when <source> is missing", async () => {
  const noSourceFixture = fixture.replace(
    '<source url="https://mashable.com">Mashable</source>',
    ""
  );
  const client = async () => noSourceFixture;
  const items = await googleNewsFetcher(['"OpenAI"'])(client);
  expect(items[0]!.sources[0]!.name).toBe("Google News");
  // no sourceName to strip, so title is left as captured (still has " - Mashable" suffix)
  expect(items[0]!.title).toBe("OpenAI's AI smart speaker will reportedly be shaped 'like a doughnut' - Mashable");
});

test("dedupes across queries by item id", async () => {
  const client = async (url: string) => {
    if (url === queryURL('"OpenAI"') || url === queryURL('"Anthropic"')) return fixture;
    throw new Error(`unmapped ${url}`);
  };

  const items = await googleNewsFetcher(['"OpenAI"', '"Anthropic"'])(client);

  expect(items).toHaveLength(6);
  const ids = items.map(i => i.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("isolates a failing query: other queries still produce items", async () => {
  const client = async (url: string) => {
    if (url === queryURL('"OpenAI"')) throw new Error("network error");
    if (url === queryURL('"Anthropic"')) return fixture;
    throw new Error(`unmapped ${url}`);
  };

  const items = await googleNewsFetcher(['"OpenAI"', '"Anthropic"'])(client);
  expect(items).toHaveLength(6);
});

test("perQuery caps the number of items taken from a single query", async () => {
  const client = async () => fixture;
  const items = await googleNewsFetcher(['"OpenAI"'], 3)(client);
  expect(items).toHaveLength(3);
});

test("GOOGLE_NEWS_QUERIES has the 5 configured queries", () => {
  expect(GOOGLE_NEWS_QUERIES).toEqual([
    '"OpenAI"',
    '"Anthropic"',
    '"Google DeepMind" OR "Gemini"',
    '"Meta AI" OR "Mistral" OR "xAI"',
    '"artificial intelligence"',
  ]);
});

test("decodeGoogleNewsURL: real captured Google News link is an opaque token today — returns null (documented fallback path)", () => {
  expect(decodeGoogleNewsURL(OPENAI_LINK)).toBeNull();
});

test("decodeGoogleNewsURL: garbage input returns null", () => {
  expect(decodeGoogleNewsURL("not a url at all")).toBeNull();
  expect(decodeGoogleNewsURL("https://news.google.com/rss/articles/!!!not-base64!!!")).toBeNull();
});

test("decodeGoogleNewsURL: extracts a URL from a base64url payload (synthetic payload — validates the algorithm, not real Google encoding)", () => {
  const raw = Buffer.concat([
    Buffer.from([0x08, 0x13, 0x22]),
    Buffer.from("https://example.com/real-article", "latin1"),
    Buffer.from([0x00]),
    Buffer.from("ignored-after-control-byte", "latin1"),
  ]);
  const seg = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  expect(decodeGoogleNewsURL(`https://news.google.com/rss/articles/${seg}?oc=5`)).toBe(
    "https://example.com/real-article"
  );
});

test("decodeGoogleNewsURL: skips a google.com URL in the payload and returns the next non-google URL", () => {
  const raw = Buffer.concat([
    Buffer.from("https://www.google.com/url?q=", "latin1"),
    Buffer.from([0x00]),
    Buffer.from("https://example.com/other-article", "latin1"),
  ]);
  const seg = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  expect(decodeGoogleNewsURL(`https://news.google.com/rss/articles/${seg}`)).toBe(
    "https://example.com/other-article"
  );
});
