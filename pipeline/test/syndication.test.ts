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
