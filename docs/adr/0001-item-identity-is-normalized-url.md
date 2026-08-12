# Item identity is the normalized URL

An Item's identity is a stable hash of its **normalized URL**, not `hash(source + url)` as
the original handoff proposed. We chose this so the same story surfaced by multiple
Fetchers (e.g. an OpenAI post appearing both in the OpenAI RSS Fetcher and via Hacker
News) collapses into a single Item, with the merge preserving every Source that surfaced
it. The trade-off: we deliberately give up the ability to show the same URL as separate
per-source cards, and we depend on a URL-normalization step (strip tracking params,
fragments, trailing slashes, scheme/host casing) being correct — a bad normalizer could
either merge distinct stories or fail to merge duplicates.
