import type { Item, SourceRef } from "./types.js";

/** Normalized comparison key for a title: casefolded, diacritics stripped, punctuation
 *  collapsed to single spaces, trimmed. Used by dedupeByTitle for an interim exact-match
 *  merge across sources (Stage-3 will replace this with real semantic clustering). */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const isGoogleHost = (rawURL: string): boolean => {
  try {
    const host = new URL(rawURL).hostname.toLowerCase();
    return host === "google.com" || host.endsWith(".google.com");
  } catch {
    return false;
  }
};

/**
 * Interim exact-title dedupe, run *after* dedupeByURL. Google News often surfaces the same
 * story as the outlet's own RSS entry under a different URL (a news.google.com redirect vs.
 * the outlet's real link), so URL-identity alone misses the pickup. Two Items whose titles
 * share the same normalized key merge into one Story, provided that key is at least 25
 * characters — short/generic titles ("llama cpp") are common enough across unrelated stories
 * that merging on them would produce false positives. No time window: a title this specific
 * matching by coincidence across unrelated stories is not a realistic risk we're guarding
 * against here.
 *
 * Representative preference: prefer the occurrence whose URL host is not google.com (or a
 * google.com subdomain) — that keeps the real outlet link over the opaque Google redirect.
 * Sources are unioned by name; engagement is the max non-null reading across occurrences.
 * Merges replace the surviving item in place at its first-seen array position, so overall
 * order is otherwise preserved.
 */
export function dedupeByTitle(items: Item[]): Item[] {
  const indexByKey = new Map<string, number>();
  const out: Item[] = [];

  for (const item of items) {
    const key = titleKey(item.title);
    if (key.length < 25) {
      out.push(item);
      continue;
    }

    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, out.length);
      out.push(item);
      continue;
    }

    const existing = out[idx]!;
    const preferNew = isGoogleHost(existing.url) && !isGoogleHost(item.url);
    const primary = preferNew ? item : existing;
    const secondary = preferNew ? existing : item;

    const sources = [...primary.sources];
    for (const s of secondary.sources) if (!sources.some(x => x.name === s.name)) sources.push(s);

    const engagement = [existing.engagement, item.engagement]
      .filter((e): e is number => e !== null)
      .reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null);

    out[idx] = { ...primary, sources, engagement };
  }

  return out;
}

/**
 * Fuzzy same-story clustering v0 (Stage-3 pulled forward, conservatively): two Items merge
 * when their titles share ≥3 DISTINCTIVE stems. Stems are normalized-title tokens with
 * common suffixes stripped; generic AI-feed vocabulary ("ai", "model", "new", "release"…)
 * never counts toward the match, so "OpenAI releases new AI model" cannot false-merge with
 * "Anthropic releases new AI model" (their distinctive stems — openai vs anthropic — differ).
 * Observed motivation: the same watermarking story from four outlets under four headlines.
 * Runs after dedupeByTitle; same merge semantics (union sources, prefer non-Google URL,
 * max engagement, in-place replacement preserving order).
 */
const GENERIC_STEMS = new Set([
  "ai", "new", "model", "release", "launch", "update", "say", "will", "now", "everyth",
  "get", "use", "tech", "technolog", "artifici", "intellig", "report", "announc",
  "the", "and", "for", "with", "its", "into", "how", "why", "what", "about", "over",
  "amid", "across", "your", "our", "their", "this", "that", "are", "has", "have",
]);

const stem = (token: string): string =>
  token.replace(/(ing|ers|ies|ied|ed|es|s)$/g, "").replace(/(ing|er)$/g, "");

/** Distinctive stems of a title (exported for tests). */
export function distinctiveStems(title: string): Set<string> {
  const stems = new Set<string>();
  for (const tok of titleKey(title).split(" ")) {
    if (tok.length < 3) continue;
    const st = stem(tok);
    if (st.length >= 3 && !GENERIC_STEMS.has(st)) stems.add(st);
  }
  return stems;
}

export function clusterByStems(items: Item[], minShared = 3): Item[] {
  const out: Item[] = [];
  const stemSets: (Set<string> | null)[] = [];

  for (const item of items) {
    const stems = distinctiveStems(item.title);
    let mergedInto = -1;
    if (stems.size >= minShared) {
      for (let i = 0; i < out.length; i++) {
        const other = stemSets[i];
        if (!other || other.size < minShared) continue;
        let shared = 0;
        for (const s of stems) if (other.has(s)) shared++;
        if (shared >= minShared) { mergedInto = i; break; }
      }
    }

    if (mergedInto === -1) {
      stemSets.push(stems);
      out.push(item);
      continue;
    }

    const existing = out[mergedInto]!;
    const preferNew = isGoogleHost(existing.url) && !isGoogleHost(item.url);
    const primary = preferNew ? item : existing;
    const secondary = preferNew ? existing : item;
    const sources = [...primary.sources];
    for (const s of secondary.sources) if (!sources.some(x => x.name === s.name)) sources.push(s);
    const engagement = [existing.engagement, item.engagement]
      .filter((e): e is number => e !== null)
      .reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null);
    out[mergedInto] = { ...primary, sources, engagement };
    // union the stems so later occurrences can join the grown cluster
    const grown = stemSets[mergedInto]!;
    for (const s of stems) grown.add(s);
  }

  return out;
}

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
