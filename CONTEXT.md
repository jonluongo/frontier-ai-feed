# Frontier AI Feed

A native iOS app that aggregates real, free, public content about the leading edge of
AI, into a single scrollable feed the user reads each morning to stay ahead. It links out
to real sources and never invents content.

## Language

**Frontier**:
The leading edge of AI development the app tracks — new models, tools, techniques, and
research. Defines what is in scope. Out of scope: AI business/market news, funding,
stock, and pure opinion pieces (unless they explain a technique).
_Avoid_: AI news, cutting edge

**Feed**:
The single aggregated, de-duplicated, time-sorted stream of Items the user scrolls. There
is one Feed; Category acts as a filter over it, not a separate feed.
_Avoid_: timeline, stream, wall

**Item**:
One real, published piece of Frontier content, rendered as one card and linking out to
its real URL. The unit of the Feed. Never invented. **Identity is its normalized URL** —
the same story surfaced by several Fetchers is one Item, and the merge records every
Source that surfaced it (see ADR-0001).
_Avoid_: story, post, article, card (a *card* is how an Item is rendered, not the Item itself), entry

**Source**:
The named origin shown as attribution on an Item's card, and the unit the user toggles in
Settings — e.g. OpenAI, Anthropic, arXiv, Hacker News, r/LocalLLaMA. An Item may carry
more than one Source when the same story was surfaced from several places.
_Avoid_: publisher, outlet, provider, feed

**Fetcher**:
The behind-the-scenes adapter that pulls Items from one endpoint and normalizes them. The
user never sees a Fetcher. Not 1-to-1 with Source: the single generic RSS Fetcher yields
Items across many Sources (OpenAI, Anthropic, DeepMind… — one per configured blog).
_Avoid_: source, connector, provider, loader

**Snippet**:
The short excerpt or description that came *with* an Item from its feed — copied verbatim,
never generated. Optional (some feeds provide none).
_Avoid_: summary (reserved — see below), description, abstract, blurb

**Summary** (reserved, not in phase 1):
A future AI-generated "why it matters" line derived only from an Item's real fetched text.
The word **Summary** is reserved for this and must not be used for the feed-provided
excerpt (that is a **Snippet**).

### Categories

Every Item has exactly one Category. The four are exhaustive and mutually exclusive.

**Models**:
Announcement of a new or updated AI model, or a model-bearing product release
(e.g. a new GPT/Claude/Gemini, new open weights, a model version bump).

**Tools**:
Usable software artifacts the reader could run or adopt — repositories, libraries,
frameworks, apps, plugins, SDKs.

**Techniques**:
Know-how — methods, guides, prompting, fine-tuning walk-throughs, engineering write-ups,
tutorials. How to *do* something.

**Research**:
Formal published findings — papers and preprints (arXiv, conferences, journals).
Venue-driven: if it is a paper, it is Research.
