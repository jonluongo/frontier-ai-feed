import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parseSyndication } from "../src/syndication.js";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("parses Atom entries", () => {
  const e = parseSyndication(fixture("atom_feed.xml"));
  expect(e).toHaveLength(2);
  expect(e[0]!.title).toBe("Attention Is All You Need Again");
  expect(e[0]!.link).toBe("https://arxiv.org/abs/2401.00001");
  expect(e[0]!.summary).toBe("We revisit attention mechanisms.");
  expect(e[0]!.published).toBe("2024-01-01T00:00:00Z");
});

test("parses RSS 2.0 — text link, CDATA description, RFC-822 date, enclosure image", () => {
  const e = parseSyndication(fixture("rss_feed.xml"));
  expect(e).toHaveLength(2);
  expect(e[0]!.title).toBe("Introducing GPT-5");
  expect(e[0]!.link).toBe("https://openai.com/blog/gpt-5");
  expect(e[0]!.summary).toBe("The next model.");
  expect(e[0]!.published).toBe("2024-01-01T00:00:00Z");
  expect(e[0]!.imageURL).toBe("https://openai.com/img/gpt5.png");
  expect(e[1]!.imageURL).toBeNull();
});

test("malformed input yields empty", () => {
  expect(parseSyndication("not xml at all")).toEqual([]);
});

test("decodes numeric and named HTML entities in RSS title/description, without double-decoding", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed</title>
    <item>
      <title>OpenAI&#8217;s new model &#039; test &#x2019; &rsquo; &amp; more</title>
      <link>https://openai.com/blog/entities</link>
      <description>Literal stays: &amp;#8217; but real ones decode: &#8217; &#039; &#x2019; &rsquo; &amp;</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;
  const e = parseSyndication(xml);
  expect(e).toHaveLength(1);
  expect(e[0]!.title).toBe("OpenAI’s new model ' test ’ ’ & more");
  expect(e[0]!.summary).toBe("Literal stays: &#8217; but real ones decode: ’ ' ’ ’ &");
});

test("decodes numeric and named HTML entities in Atom title/summary, without double-decoding", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>arXiv</title>
  <entry>
    <title>Scaling Laws&#8217; new results &#039; &#x2019; &rsquo; &amp;</title>
    <id>https://arxiv.org/abs/9999.00001</id>
    <link href="https://arxiv.org/abs/9999.00001" rel="alternate" type="text/html"/>
    <summary>Literal stays: &amp;#8217; but real ones decode: &#8217; &#039; &#x2019; &rsquo; &amp;</summary>
    <published>2024-01-01T00:00:00Z</published>
  </entry>
</feed>`;
  const e = parseSyndication(xml);
  expect(e).toHaveLength(1);
  expect(e[0]!.title).toBe("Scaling Laws’ new results ' ’ ’ &");
  expect(e[0]!.summary).toBe("Literal stays: &#8217; but real ones decode: ’ ' ’ ’ &");
});
