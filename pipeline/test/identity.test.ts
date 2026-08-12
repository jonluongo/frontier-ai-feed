import { expect, test } from "vitest";
import { itemID } from "../src/identity.js";

test("trailing slash does not change identity", () => {
  expect(itemID("https://openai.com/blog/gpt-5/")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("scheme and host casing does not change identity", () => {
  expect(itemID("HTTPS://OpenAI.com/blog/gpt-5")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("fragment does not change identity", () => {
  expect(itemID("https://openai.com/blog/gpt-5#s2")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("tracking params do not change identity", () => {
  expect(itemID("https://openai.com/blog/gpt-5?utm_source=hn&utm_campaign=x")).toBe(itemID("https://openai.com/blog/gpt-5"));
});
test("different paths differ", () => {
  expect(itemID("https://openai.com/blog/gpt-5")).not.toBe(itemID("https://openai.com/blog/gpt-4"));
});
test("meaningful query param differs", () => {
  expect(itemID("https://arxiv.org/abs/2401.00001?v=1")).not.toBe(itemID("https://arxiv.org/abs/2401.00001?v=2"));
});
test("different hosts differ", () => {
  expect(itemID("https://openai.com/blog/gpt-5")).not.toBe(itemID("https://anthropic.com/blog/gpt-5"));
});
