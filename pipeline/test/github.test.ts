import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { githubRequestURL, githubFetcher } from "../src/fetchers/github.js";

const NOW = new Date("2026-08-13T00:00:00Z");

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8");
const url = githubRequestURL(NOW);
const client = async (u: string) => {
  if (u === url) return fx("github_search");
  throw new Error(`unmapped ${u}`);
};

test("maps GitHub search results to Items with stargazers as engagement", async () => {
  const items = await githubFetcher(NOW)(client);
  expect(items.map(i => i.title)).toEqual(["NousResearch/hermes-agent", "Significant-Gravitas/AutoGPT"]);
  expect(items[0]!.engagement).toBe(229372);
  expect(items[0]!.category).toBe("tools");
  expect(items[0]!.sources).toEqual([{ name: "GitHub", domain: "github.com" }]);
  expect(items[0]!.url).toBe("https://github.com/NousResearch/hermes-agent");
  expect(items[0]!.snippet).toBe("The agent that grows with you");
  expect(items[0]!.publishedAt).toBe("2025-07-22T22:22:28Z");
});

test("skips repos missing created_at and strips fractional seconds from the rest", async () => {
  const fixture = JSON.parse(fx("github_search"));
  fixture.items.push(
    {
      full_name: "no-date/missing-created-at",
      html_url: "https://github.com/no-date/missing-created-at",
      description: "no created_at field",
      stargazers_count: 1,
      pushed_at: "2026-08-12T13:27:52Z",
    },
    {
      full_name: "frac/seconds",
      html_url: "https://github.com/frac/seconds",
      description: "fractional seconds in created_at",
      stargazers_count: 2,
      created_at: "2025-07-22T22:22:28.123Z",
      pushed_at: "2026-08-12T13:27:52Z",
    },
  );
  const withExtra = async (u: string) => {
    if (u === url) return JSON.stringify(fixture);
    throw new Error(`unmapped ${u}`);
  };

  const items = await githubFetcher(NOW)(withExtra);

  expect(items.map(i => i.title)).not.toContain("no-date/missing-created-at");
  const fracItem = items.find(i => i.title === "frac/seconds");
  expect(fracItem?.publishedAt).toBe("2025-07-22T22:22:28Z");
});
