import { expect, test } from "vitest";
import { percentile, scoreFeed } from "../src/score.js";
import type { Item } from "../src/types.js";

const make = (over: Partial<Item> & { id: string; url: string }): Item => ({
  title: "t", snippet: null, sources: [{ name: "Src" }],
  category: "models", publishedAt: "2026-01-02T00:00:00Z", imageURL: null,
  engagement: null, ...over,
});

const NOW = "2026-01-02T00:00:00Z";

// ---------------------------------------------------------------------------
// percentile(): fraction strictly below + half ties, over an explicit population.
// ---------------------------------------------------------------------------

test("percentile: fraction strictly below plus half of ties", () => {
  const pop = [10, 20, 20, 30];
  // value=10: below={}=0, equal={10}=1  -> (0 + 0.5*1)/4 = 0.125
  expect(percentile(10, pop)).toBeCloseTo(0.125);
  // value=20: below={10}=1, equal={20,20}=2 -> (1 + 0.5*2)/4 = 0.5
  expect(percentile(20, pop)).toBeCloseTo(0.5);
  // value=30: below={10,20,20}=3, equal={30}=1 -> (3 + 0.5*1)/4 = 0.875
  expect(percentile(30, pop)).toBeCloseTo(0.875);
  // value not present, between members: 15 -> below={10}=1, equal=0 -> (1+0)/4=0.25
  expect(percentile(15, pop)).toBeCloseTo(0.25);
  // single-member population: value is always its own only member -> (0 + 0.5*1)/1 = 0.5
  expect(percentile(5, [5])).toBeCloseTo(0.5);
});

// ---------------------------------------------------------------------------
// (a) per-source percentile: HN 600 beats HN 20; a GitHub 100k-star item does
//     NOT outrank HN 600 merely via scale (same age, single source, no velocity).
// ---------------------------------------------------------------------------

test("(a) percentile is computed per-source, so raw engagement scale does not cross sources", () => {
  const hn600 = make({ id: "hn600", url: "https://hn/1", sources: [{ name: "Hacker News" }], engagement: 600, publishedAt: NOW });
  const hn20 = make({ id: "hn20", url: "https://hn/2", sources: [{ name: "Hacker News" }], engagement: 20, publishedAt: NOW });
  const gh100k = make({ id: "gh100k", url: "https://gh/1", sources: [{ name: "GitHub" }], engagement: 100_000, publishedAt: NOW });

  // HN population = [600, 20].
  //   pct(600) = below{20}=1, equal{600}=1 -> (1+0.5)/2 = 0.75
  //   pct(20)  = below{}=0,  equal{20}=1  -> (0+0.5)/2 = 0.25
  // GitHub population = [100000] alone.
  //   pct(100000) = below=0, equal=1 -> (0+0.5)/1 = 0.5
  // All same age (age_h=0) and pickup=1, velocity=0 -> raw ordering == pct ordering:
  //   hn600 (0.75) > gh100k (0.5) > hn20 (0.25)
  const scored = scoreFeed([hn600, hn20, gh100k], NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["hn600", "gh100k", "hn20"]);
  // n=3 rank map: rank0 -> round(99*2/2)=99, rank1 -> round(99*1/2)=round(49.5)=50, rank2 -> round(99*0/2)=0
  expect(scored.map(s => s.signal)).toEqual([99, 50, 0]);
});

// ---------------------------------------------------------------------------
// (b) no-engagement item gets the prior (0.4) -- not zero -- so it beats a
//     genuinely low-percentile engagement item but does not beat everything.
// ---------------------------------------------------------------------------

test("(b) null-engagement item scores the prior, ranking between low- and high-percentile items", () => {
  const blog = make({ id: "blog", url: "https://blog/1", sources: [{ name: "Blog" }], engagement: null, publishedAt: NOW });
  // Hacker News population = [1,2,3,4,5] (all same source, all same age).
  const hn = [1, 2, 3, 4, 5].map(n =>
    make({ id: `hn${n}`, url: `https://hn/${n}`, sources: [{ name: "Hacker News" }], engagement: n, publishedAt: NOW }));

  // pct(1) = below{}=0, equal{1}=1 -> 0.5/5 = 0.1
  // pct(2) = below{1}=1, equal{2}=1 -> 1.5/5 = 0.3
  // pct(3) = below{1,2}=2, equal{3}=1 -> 2.5/5 = 0.5
  // pct(4) = below{1,2,3}=3, equal{4}=1 -> 3.5/5 = 0.7
  // pct(5) = below{1,2,3,4}=4, equal{5}=1 -> 4.5/5 = 0.9
  // blog: prior = 0.4
  // raw ordering (same age/pickup/velocity, so raw order == pct order desc):
  //   hn5(0.9) > hn4(0.7) > hn3(0.5) > blog(0.4) > hn2(0.3) > hn1(0.1)
  const scored = scoreFeed([...hn, blog], NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["hn5", "hn4", "hn3", "blog", "hn2", "hn1"]);
  // blog is not last (not zero-treated) and not first (prior isn't automatically top).
  const blogIdx = scored.findIndex(s => s.item.id === "blog");
  expect(blogIdx).toBeGreaterThan(0);
  expect(blogIdx).toBeLessThan(scored.length - 1);
});

// ---------------------------------------------------------------------------
// (c) pickup: identical engagement/age/source, but 2 sources beats 1 source.
// ---------------------------------------------------------------------------

test("(c) more sources (pickup) outranks an otherwise-identical single-source item", () => {
  const single = make({ id: "single", url: "https://a/1", sources: [{ name: "HN" }], engagement: 50, publishedAt: NOW });
  const multi = make({ id: "multi", url: "https://a/2", sources: [{ name: "HN" }, { name: "GitHub" }], engagement: 50, publishedAt: NOW });

  // HN population = [50, 50] (both items' engagement, since both have sources[0].name === "HN").
  // pct(50) = below{}=0, equal{50,50}=2 -> (0+1.0)/2 = 0.5, for BOTH items (tie).
  // raw(single) = (0.5 + 0.5*(1-1)) * decay = 0.5 * decay
  // raw(multi)  = (0.5 + 0.5*(2-1)) * decay = 1.0 * decay
  // multi > single purely from pickup.
  const scored = scoreFeed([single, multi], NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["multi", "single"]);
  expect(scored.map(s => s.signal)).toEqual([99, 0]);
});

// ---------------------------------------------------------------------------
// (d) velocity: rising engagement (vs. the previous tick) beats static.
// ---------------------------------------------------------------------------

test("(d) rising engagement since the previous tick outranks a static twin", () => {
  const prevGeneratedAt = "2026-01-01T23:00:00Z"; // 1h before NOW -> deltaHours = 1
  const x = make({ id: "x", url: "https://s/x", sources: [{ name: "S" }], engagement: 500, publishedAt: NOW });
  const y = make({ id: "y", url: "https://s/y", sources: [{ name: "S" }], engagement: 500, publishedAt: NOW });
  const prevEngagement = { x: 100 }; // y has no previous-tick record -> velocity forced to 0

  // Current "S" population = [500, 500] (both items).
  // pctNow(x) = pctNow(y): below{}=0, equal{500,500}=2 -> (0+1.0)/2 = 0.5
  // pctPrev(x) = percentile(100, [500,500]): below{}=0 (100 is below both, not "below" means pop members < 100 -> none), equal=0 -> 0/2 = 0
  // velocity(x) = max(0, 0.5 - 0) / 1h = 0.5
  // velocity(y) = 0 (no prevEngagement entry)
  // raw(x) = (0.5 + 0 + 0.5*0.5) * decay = 0.75 * decay
  // raw(y) = (0.5 + 0 + 0) * decay        = 0.5  * decay
  const scored = scoreFeed([x, y], NOW, prevEngagement, prevGeneratedAt);
  expect(scored.map(s => s.item.id)).toEqual(["x", "y"]);
  expect(scored.map(s => s.signal)).toEqual([99, 0]);
});

// ---------------------------------------------------------------------------
// (e) decay: identical items differing only in age -> the newer one wins.
// ---------------------------------------------------------------------------

test("(e) power-law age decay: a 2h-old item outranks an otherwise-identical 30h-old item", () => {
  const young = make({ id: "young", url: "https://a/1", sources: [{ name: "S" }], engagement: null, publishedAt: "2026-01-01T22:00:00Z" }); // 2h before NOW
  const old = make({ id: "old", url: "https://a/2", sources: [{ name: "S" }], engagement: null, publishedAt: "2025-12-31T18:00:00Z" }); // 30h before NOW

  // Both engagement=null -> pct = prior = 0.4 for both; pickup=1 both; velocity=0 both (no prevGeneratedAt).
  // raw = 0.4 * 1/(age_h+2)^1.6
  //   young: age_h=2  -> decay = 1/4^1.6  ≈ 1/9.1896 ≈ 0.10882 -> raw ≈ 0.04353
  //   old:   age_h=30 -> decay = 1/32^1.6 = 1/2^8 = 1/256 = 0.00390625 -> raw = 0.4*0.00390625 = 0.0015625
  // young's raw (≈0.04353) > old's raw (0.0015625) -> young wins purely from decay.
  const scored = scoreFeed([old, young], NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["young", "old"]);
  expect(scored.map(s => s.signal)).toEqual([99, 0]);
});

// ---------------------------------------------------------------------------
// (f) signal mapping: top item -> 99, bottom -> 0, alert only when signal >= 90.
// ---------------------------------------------------------------------------

test("(f) signal is rank-mapped 0..99 (top=99, bottom=0) and alert fires only >= threshold", () => {
  // Four items, all engagement=null (pct=prior for all, identical), single source each (pickup=1),
  // no velocity -> raw is purely decay(age), strictly decreasing as age grows, so order is unambiguous.
  const items = [0, 10, 20, 30].map(h =>
    make({
      id: `age${h}`, url: `https://a/${h}`, sources: [{ name: `S${h}` }], engagement: null,
      publishedAt: new Date(Date.parse(NOW) - h * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    }));

  // n=4 rank map: round(99*(3-rank)/3) -> rank0=99, rank1=66, rank2=33, rank3=0 (all exact, no rounding).
  const scored = scoreFeed(items, NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["age0", "age10", "age20", "age30"]);
  expect(scored.map(s => s.signal)).toEqual([99, 66, 33, 0]);
  // alertThreshold defaults to 90 -> only the signal=99 item alerts.
  expect(scored.map(s => s.alert)).toEqual([true, false, false, false]);
});

// ---------------------------------------------------------------------------
// (g) deterministic tie-break: raw desc, then newer publishedAt, then id asc.
// ---------------------------------------------------------------------------

test("(g1) raw tie broken by newer publishedAt", () => {
  // Both items: engagement=null (pct=prior), pickup=1, velocity=0, and publishedAt is in the
  // FUTURE relative to NOW for both -> age_h clamps to max(0, negative) = 0 for both, so raw
  // is exactly tied: (0.4 + 0) * 1/2^1.6 for both.
  const older = make({ id: "a", url: "https://x/a", sources: [{ name: "S1" }], engagement: null, publishedAt: "2026-01-02T05:00:00Z" }); // +5h
  const newer = make({ id: "b", url: "https://x/b", sources: [{ name: "S2" }], engagement: null, publishedAt: "2026-01-02T10:00:00Z" }); // +10h
  const scored = scoreFeed([older, newer], NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["b", "a"]);
});

test("(g2) raw and publishedAt both tied broken by id ascending", () => {
  const c2 = make({ id: "c2", url: "https://x/c2", sources: [{ name: "S3" }], engagement: null, publishedAt: NOW });
  const c1 = make({ id: "c1", url: "https://x/c1", sources: [{ name: "S4" }], engagement: null, publishedAt: NOW });
  const scored = scoreFeed([c2, c1], NOW, {}, null);
  expect(scored.map(s => s.item.id)).toEqual(["c1", "c2"]);
});

// ---------------------------------------------------------------------------
// Extra: single-item feed always gets signal 99 (documented edge of the rank map).
// ---------------------------------------------------------------------------

test("a single-item feed scores 99 regardless of raw value", () => {
  const only = make({ id: "solo", url: "https://a/1", sources: [{ name: "S" }], engagement: null, publishedAt: NOW });
  const scored = scoreFeed([only], NOW, {}, null);
  // signal=99 >= alertThreshold (90) -> alert is true.
  expect(scored).toEqual([{ item: only, signal: 99, alert: true }]);
});
