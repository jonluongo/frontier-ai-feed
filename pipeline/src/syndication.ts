import { XMLParser } from "fast-xml-parser";

export interface SyndicationEntry {
  title: string; link: string; summary: string | null;
  published: string | null; imageURL: string | null;
  sourceName: string | null; // RSS <source> element text; null for Atom / missing
}

const toISO = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const d = new Date(raw); // handles both ISO-8601 and RFC-822
  return isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

const text = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && v !== null && "#text" in v) return text((v as Record<string, unknown>)["#text"]);
  return null;
};

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Parse RSS 2.0 or Atom into neutral entries. Malformed → []. */
export function parseSyndication(xml: string): SyndicationEntry[] {
  let doc: Record<string, any>;
  try {
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", htmlEntities: true }).parse(xml);
  } catch { return []; }

  const out: SyndicationEntry[] = [];

  for (const item of asArray<any>(doc?.rss?.channel?.item)) {           // RSS 2.0
    const link = text(item.link);
    if (!link) continue;
    const enclosure = asArray<any>(item.enclosure)
      .find(e => String(e?.["@_type"] ?? "").startsWith("image"));
    const media = asArray<any>(item["media:content"]).concat(asArray<any>(item["media:thumbnail"]))[0];
    out.push({
      title: text(item.title) ?? "",
      link,
      summary: text(item.description) ?? text(item.summary),
      published: toISO(text(item.pubDate) ?? undefined),
      imageURL: (enclosure?.["@_url"] ?? media?.["@_url"] ?? null) as string | null,
      sourceName: text(item.source),
    });
  }

  for (const entry of asArray<any>(doc?.feed?.entry)) {                  // Atom
    const links = asArray<any>(entry.link);
    const alt = links.find(l => (l?.["@_rel"] ?? "alternate") === "alternate") ?? links[0];
    const link = (alt?.["@_href"] ?? null) as string | null;
    if (!link) continue;
    out.push({
      title: text(entry.title) ?? "",
      link,
      summary: text(entry.summary) ?? text(entry.content),
      published: toISO(text(entry.published) ?? text(entry.updated) ?? undefined),
      imageURL: null,
      sourceName: null,
    });
  }

  return out;
}
