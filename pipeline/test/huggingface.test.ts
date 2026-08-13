import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { huggingFaceFetcher } from "../src/fetchers/huggingface.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8");
const url = "https://huggingface.co/api/daily_papers";
const client = async (u: string) => {
  if (u === url) return fx("hf_papers");
  throw new Error(`unmapped ${u}`);
};

test("maps HF daily papers to Items with upvotes as engagement, stripping fractional seconds", async () => {
  const items = await huggingFaceFetcher()(client);
  expect(items.map(i => i.title)).toEqual([
    "InSight-doc: Agentic Visual Perception for Long-Document Understanding",
    "Power law graph attention: exact generalization of scaled dot-product attention, empirical collapse at inference",
  ]);
  expect(items[0]!.category).toBe("research");
  expect(items[0]!.sources).toEqual([{ name: "Hugging Face", domain: "huggingface.co" }]);
  expect(items[0]!.url).toBe("https://huggingface.co/papers/2608.10628");
  expect(items[0]!.engagement).toBe(5);
  expect(items[0]!.publishedAt).toBe("2026-08-11T00:00:00Z");
  expect(items[1]!.url).toBe("https://huggingface.co/papers/2608.10288");
  expect(items[1]!.engagement).toBe(1);
  expect(items[1]!.publishedAt).toBe("2026-08-10T00:00:00Z");
});
