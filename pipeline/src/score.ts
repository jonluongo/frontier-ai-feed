import type { Item } from "./types.js";

export interface ScoreConfig { prior: number; k: number; v: number; decayExp: number; alertThreshold: number }
export const DEFAULT_SCORE_CONFIG: ScoreConfig = { prior: 0.4, k: 0.5, v: 0.5, decayExp: 1.6, alertThreshold: 90 };
export interface ScoredItem { item: Item; signal: number; alert: boolean }

const MS_PER_HOUR = 3_600_000;

/** Fraction of `population` strictly below `value`, plus half the ties. */
export function percentile(value: number, population: number[]): number {
  if (population.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const p of population) {
    if (p < value) below++;
    else if (p === value) equal++;
  }
  return (below + 0.5 * equal) / population.length;
}

/** Pure, deterministic Signal score: per-source engagement percentile + pickup + velocity, power-decayed by age. */
export function scoreFeed(
  items: Item[],
  nowISO: string,
  prevEngagement: Record<string, number>,
  prevGeneratedAt: string | null,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoredItem[] {
  const now = Date.parse(nowISO);

  // Engagement-bearing population per item's primary source (sources[0].name).
  const populations = new Map<string, number[]>();
  for (const item of items) {
    if (item.engagement === null) continue;
    const key = item.sources[0]?.name ?? "";
    const pop = populations.get(key);
    if (pop) pop.push(item.engagement);
    else populations.set(key, [item.engagement]);
  }

  const deltaHours = prevGeneratedAt !== null ? (now - Date.parse(prevGeneratedAt)) / MS_PER_HOUR : 0;

  const withRaw = items.map(item => {
    const sourceName = item.sources[0]?.name ?? "";
    const pop = populations.get(sourceName) ?? [];
    const pct = item.engagement !== null ? percentile(item.engagement, pop) : config.prior;
    const pickup = item.sources.length;

    let velocity = 0;
    if (
      prevGeneratedAt !== null &&
      deltaHours > 0 &&
      item.engagement !== null &&
      Object.hasOwn(prevEngagement, item.id)
    ) {
      const pctPrev = percentile(prevEngagement[item.id]!, pop);
      velocity = Math.max(0, pct - pctPrev) / deltaHours;
    }

    const ageH = Math.max(0, (now - Date.parse(item.publishedAt)) / MS_PER_HOUR);
    const decay = 1 / Math.pow(ageH + 2, config.decayExp);
    const raw = (pct + config.k * (pickup - 1) + config.v * velocity) * decay;

    return { item, raw };
  });

  withRaw.sort((a, b) => {
    if (a.raw !== b.raw) return b.raw - a.raw;
    if (a.item.publishedAt !== b.item.publishedAt) return a.item.publishedAt < b.item.publishedAt ? 1 : -1;
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
  });

  const n = withRaw.length;
  return withRaw.map(({ item }, rank) => {
    const signal = n <= 1 ? 99 : Math.round((99 * (n - 1 - rank)) / (n - 1));
    return { item, signal, alert: signal >= config.alertThreshold };
  });
}
