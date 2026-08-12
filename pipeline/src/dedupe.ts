import type { Item, SourceRef } from "./types.js";

/** Collapse duplicates by Item identity; union Sources; keep earliest rep + max engagement. */
export function dedupeByURL(groups: Item[][]): Item[] {
  const rep = new Map<string, Item>();
  const sources = new Map<string, SourceRef[]>();
  for (const item of groups.flat()) {
    const seen = sources.get(item.id) ?? [];
    for (const s of item.sources) if (!seen.some(x => x.name === s.name)) seen.push(s);
    sources.set(item.id, seen);
    const existing = rep.get(item.id);
    if (!existing) { rep.set(item.id, item); continue; }
    const merged: Item = {
      ...(item.publishedAt < existing.publishedAt ? item : existing),
      engagement: [existing.engagement, item.engagement]
        .filter((e): e is number => e !== null)
        .reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null),
    };
    rep.set(item.id, merged);
  }
  return [...rep.values()]
    .map(i => ({ ...i, sources: sources.get(i.id) ?? i.sources }))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
