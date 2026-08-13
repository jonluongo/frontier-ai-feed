import { XMLParser } from "fast-xml-parser";

export interface SyndicationEntry {
  title: string; link: string; summary: string | null;
  published: string | null; imageURL: string | null;
  sourceName: string | null;   // RSS <source> element text; null for Atom / missing
  sourceDomain: string | null; // host of the RSS <source url="…"> attribute; null when absent
}

/** Host of a URL string, lowercased, without a leading "www."; null when unparseable. */
export function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
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

/** Feed <description>/<summary> often carries HTML. Cards render 2–3 lines, so reduce to
 *  plain text and cap. Never invents text — strip and truncate only. */
export function sanitizeSnippet(raw: string | null, maxChars = 300): string | null {
  if (raw === null) return null;
  const text = raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length <= maxChars ? text : text.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
}

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
      summary: sanitizeSnippet(text(item.description) ?? text(item.summary)),
      published: toISO(text(item.pubDate) ?? undefined),
      imageURL: (enclosure?.["@_url"] ?? media?.["@_url"] ?? null) as string | null,
      sourceName: text(item.source),
      sourceDomain: hostOf(asArray<any>(item.source)[0]?.["@_url"] as string | undefined),
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
      summary: sanitizeSnippet(text(entry.summary) ?? text(entry.content)),
      published: toISO(text(entry.published) ?? text(entry.updated) ?? undefined),
      imageURL: null,
      sourceName: null,
      sourceDomain: null,
    });
  }

  return out;
}
