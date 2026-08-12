import { createHash } from "node:crypto";

const TRACKING = new Set(["fbclid","gclid","mc_cid","mc_eid","igshid","ref","ref_src","cmpid","spm"]);
const isTracking = (name: string) =>
  name.toLowerCase().startsWith("utm_") || TRACKING.has(name.toLowerCase());

/** Canonical, comparable form of a URL (ADR-0001). */
export function canonicalKey(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return raw.toLowerCase(); }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);
  return url.toString();
}

/** Stable Item id: SHA-256 hex of the canonical key. */
export function itemID(raw: string): string {
  return createHash("sha256").update(canonicalKey(raw)).digest("hex");
}
