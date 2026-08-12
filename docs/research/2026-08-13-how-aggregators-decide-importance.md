# How Real-World News Aggregators Scan the Web and Decide What's Important

**Date:** 2026-08-13
**Research question:** How do professional aggregators discover content and rank importance, and how much is editorial vs algorithmic — and what should a personal-scale product (Frontier AI Feed) steal?
**Builds on:** [2026-08-12-backend-architecture-audit.md](./2026-08-12-backend-architecture-audit.md) (Google News clustering/patents, Techmeme editorial pyramid, NewsCatcher embedding clustering, HN gravity, Reddit hot() — not re-researched here).

---

## TL;DR

1. **Every serious aggregator converged on hybrid.** Techmeme started fully automated in 2005 and publicly gave up in 2008 ("the lack of real intelligence leads to really unintelligent results" — Rivera); Google News stayed algorithmic for *ranking* but automated away human *gatekeeping* (2019: no more application to be included); Feedly sells human-tunable AI models; Particle gates AI behind human accuracy oversight; even Perplexity Discover runs a human Curator program. Nobody credible is 100% algorithm or 100% human.
2. **The universal importance signal is cross-source pickup.** Techmeme: "What are the most linked blog posts and news articles from this set of blogs? And once they reach a certain threshold, they're featured on the site" (Rivera, 2025). Particle won't even form a story until ≥3 articles from ≥2 publishers exist. Google News ranks on "prominence" and "authoritativeness." Corroboration count *is* the algorithm.
3. **Discovery is a two-tier trick: a curated seed set that transitively discovers the rest.** Techmeme monitors "in the low thousands" of sources, where "the majority of monitored sources are found through yet not actually contained in the seeding set," with a *daily* automated source-discovery reset (~3am ET). Source authority is earned continuously (Leaderboard "presence"), not hardcoded.
4. **Velocity is the professional edge signal.** NewsWhip samples social engagement every 2 minutes, computes rate-of-change ("social velocity"), and extrapolates with double-exponential smoothing — "if a story is one hour old, Spike can predict what its social engagement will look like in six hours time." Dataminr does the multi-modal version across 1M+ public sources. This is the only part of pro infrastructure that's genuinely expensive.
5. **For a personal product, web-scale discovery is nearly free today:** Google News RSS query URLs still work (verified live 2026-08-12), GDELT is "100% free and open" updating every 15 minutes, HN/Reddit are aggregators-of-aggregators you can poll. Bing News API is **dead** (retired 2025-08-11) — don't plan around it.

---

## 1. Discovery — how they find content beyond a fixed list

### Techmeme

- **Seed set + transitive discovery.** From Gabe Rivera's 2007 Q&A: Techmeme monitors "in the low thousands" of sources at a time, and "the majority of monitored sources are found through yet not actually contained in the seeding set" — i.e., a hand-picked seed list is crawled, and whatever the seed set *links to* becomes a candidate source. ([Search Engine Land Q&A with Gabe Rivera](https://searchengineland.com/qa-with-gabe-rivera-creator-of-techmeme-10278))
- **Daily source reset.** "Every day Techmeme performs a bit of a reset, usually around 3am Eastern, where it doesn't update for about an hour as it repeats the source discovery." A blog can be in the monitored set one day and out the next; sources drop when they stop being cited. (Same Q&A.)
- **Social firehose.** As of 2025, the system "chews on the API feeds from the big social networks" to find the discussions around stories; editors then approve algorithmically identified conversation clusters. ([Crazy Stupid Tech interview, Sept 2025](https://crazystupidtech.com/2025/09/08/at-20-techmeme-has-never-been-hotter/) — direct Rivera quotes; staffing figures are the journalist's reporting.)
- **Crawl tech is explicitly subordinate to editors.** The about page describes "news filtering and discovery tools that our editors rely on and which automatically re-sort our front page," built on "state-of-the-art crawling technology." ([techmeme.com/about](https://www.techmeme.com/about))

### Google News

- **Inclusion is now crawl-based, not application-based.** Since the December 2019 Publisher Center revamp, sites no longer apply; Google "automatically considers" eligible news content found via normal crawling. (Reported with Google statements in [Search Engine Land](https://searchengineland.com/google-all-sites-are-eligible-to-be-in-google-news-but-not-all-content-will-appear-in-google-news-350521); Google's own [Publisher Center overview](https://support.google.com/news/publisher-center/answer/9606538). **Flag:** I verified the exact "automatically considered" phrasing via Search Engine Land's quote of Google, not on a live Google page.)
- **News sitemaps accelerate discovery.** Google's docs: a news sitemap lets you "tell Google about your news articles," and must "only include recent URLs for articles that were created in the last two days." Freshness is structurally enforced at the discovery layer. ([Google news-sitemap docs](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap))

### Feedly

- **Fixed-but-huge source universe + user-composed AI filters.** Feedly AI "gathers, analyzes, and prioritizes information from millions of sources in real-time" ([feedly.com/ai](https://feedly.com/ai)). For its security vertical it maintains a curated bundle of "50,000+ security news sources, threat research blogs, newsletters, vendor advisories, government agencies, vulnerability databases, CISO magazines, and Reddit communities," and users build feeds by combining "pre-trained AI Models" with Boolean AND/OR/NOT ([Feedly AI feature post](https://feedly.com/new-features/posts/track-emerging-threats-with-feedly-ai)). So: discovery = giant curated RSS-ish corpus; selection = user-configured ML classifiers.
- **Flag:** Leo's original 2019 skill list (priority, mute filter, deduplication, learn-from-saves) I could only confirm via secondary coverage ([Coywolf](https://coywolf.com/news/productivity/feedly-pro-plus-leo-ai/)); Feedly's original "Meet Leo" post now redirects to the AI marketing page.

### NewsWhip / Dataminr (social-velocity monitors)

- **NewsWhip ingests engagement, not just content:** it tracks "millions of digital objects every day" across Facebook, X, Instagram, YouTube, TikTok, Reddit, and Substack, applying NLP, information extraction, text classification, and time-series analysis. ([NewsWhip: How we use machine learning](https://www.newswhip.com/2017/05/machine-learning-newswhip/))
- **Dataminr claims "Multi-Modal Fusion AI" over "1M+ public data sources"** in 150 languages (text, image, video, audio, sensor), with 50+ proprietary LLMs detecting ~500,000 events/day. ([dataminr.com/ai-platform](https://www.dataminr.com/ai-platform/) — **flag:** read via search excerpts of Dataminr's own pages; marketing numbers, not engineering documentation.)

### Particle.news / Perplexity Discover (new AI products)

- **Particle** (founders ex-Twitter: Sara Beykpour, Marcel Molina) aggregates publisher articles into "Stories." Its own launch post says little about sourcing but states: "we use both human and automated steps to perform oversight of the accuracy of our content to the source material" ([Particle intro post, Medium](https://particlenews.medium.com/introducing-particle-the-news-organized-71decda13b35)). Per the Newsroom Robots interview with Beykpour: "A story isn't touched until at least three articles from two different publishers are available," then a "Reality Check" AI pass "double-verifies each claim against the original reporting, generating citations" — claimed to cut AI errors from ~1/100 to ~1/10,000. ([Newsroom Robots](https://www.newsroomrobots.com/p/the-next-chapter-in-news-aggregation) — **flag:** these specifics are the interviewer's summary of Beykpour, not verbatim quotes.)
- **Perplexity Discover** is described by Perplexity as a curated feed of trending topics "created with Perplexity Pages," personalized by user-selected interests, and — notably — fed partly by a **human Curator program**: "we're inviting creators… to craft Pages that will inspire, surprise, and inform our global audience." ([perplexity.ai/curators](https://www.perplexity.ai/curators), [Perplexity Help Center](https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work)) **Flag:** Perplexity publishes no primary engineering detail on how Discover selects/clusters stories; treat its internals as unverified.

### RSS-era infrastructure that still matters

- **WebSub** (formerly PubSubHubbub) is a W3C Recommendation: publishers ping a hub, the hub POSTs to subscribers — push instead of poll. ([w3.org/TR/websub](https://www.w3.org/TR/websub/)) Real-world hub support is spotty outside big blog platforms; for a 10-source pipeline, polling is simpler and fine.
- **News sitemaps** (above) and classic feed autodiscovery (`<link rel="alternate" type="application/rss+xml">`) remain how crawlers find feeds on arbitrary sites. (**Flag:** autodiscovery convention is common knowledge; I did not re-verify a primary spec this session.)

---

## 2. Importance — what makes a "top story"

### Techmeme: citations + time decay + human final call

- Rivera, 2007: "Importance is determined by a number of factors. Citations can increase importance, so a post that accumulates inbound links can rise. Time is a factor as well… A headline that's appeared on the page for most of the day loses importance. Headlines usually fall off the page when the time component swamps all other factors." ([SEL Q&A](https://searchengineland.com/qa-with-gabe-rivera-creator-of-techmeme-10278))
- Rivera, 2025, on the core mechanism: "What are the most linked blog posts and news articles from this set of blogs? And once they reach a certain threshold, they're featured on the site." ([Crazy Stupid Tech](https://crazystupidtech.com/2025/09/08/at-20-techmeme-has-never-been-hotter/))
- **Source authority is measured output-side.** The Leaderboard's "presence" = "the probability that a random Techmeme headline at a random time over the past month was published by that source," recomputed every 20 minutes ([Leaderboard launch post, 2007](https://news.techmeme.com/071001/techmeme-leaderboard)). A second metric, "Leadership," ranks authors by inbound links from other tech posts ([author leaderboards, 2015](https://news.techmeme.com/150520/author-leaderboards)).
- **Humans make the final call and write every headline:** "editors make final calls on what we feature, and write descriptive, straightforward headlines" ([techmeme.com/about](https://www.techmeme.com/about)).

### Google News: algorithmic ranking on six named factors

Google's own publisher docs: ranking is "algorithmically influenced by a range of factors, including" **relevance, prominence, authoritativeness, freshness, usability, and location & language**, and Google "doesn't accept payments to expedite or improve a site's search appearance or ranking." ([Ranking within Google News](https://support.google.com/news/publisher-center/answer/9606702?hl=en)) The clustering machinery and source-authority patents behind this are covered in the prior audit doc.

### NewsWhip: velocity and acceleration as the definition of importance

This is the most explicit primary statement of "importance = rate of change" anywhere:

- Velocity is "the rate of change of engagement with content on social media"; the Highest Velocity view samples engagement "every two minutes" and ranks stories "by the speed at which they're growing." ([NewsWhip Metrics, help center](https://help.newswhip.com/hc/en-us/articles/4416522078225-NewsWhip-Metrics) — **flag:** read via search excerpts.)
- Predicted interactions: a time-series of interaction counts, weighted by acceleration/deceleration, extrapolated via "double-exponential smoothing" to estimate interactions "by the time it is double its current age." ([What are Predicted Interactions](https://help.newswhip.com/hc/en-us/articles/360004848012-What-are-Facebook-and-X-Predicted-Interactions) — **flag:** read via search excerpts; NewsWhip also holds a patent on the method per a [press release](https://www.streetinsider.com/Press+Releases/NewsWhip+Inc.+Announces+the+Issuance+of+a+New+Patent+on+Its+Social+Velocity+Methodology/11762911.html), patent number not verified.)
- Directly fetched primary: "The model looks at the early volume of social engagement to find the 'social velocity' of different stories – or how fast they are spreading"; "if a story is one hour old, Spike can predict what its social engagement will look like in six hours time." ([newswhip.com ML post, 2017](https://www.newswhip.com/2017/05/machine-learning-newswhip/))

### Cross-outlet pickup: who says it explicitly

- **Techmeme:** the threshold-of-inbound-links quote above — pickup by other monitored sources *is* featuring.
- **Particle:** ≥3 articles from ≥2 publishers before a story exists at all.
- **Google News:** "prominence" + "authoritativeness" as named ranking factors; the agglomerative clustering in the prior audit doc makes cluster size (i.e., number of outlets covering) a first-class ranking input.
- **NewsWhip inverts it:** pickup is what they *predict* (they find stories "while they're small" so customers can be the pickup).

### Editorial layers: who employs humans and what the humans do

- **Techmeme** (per the [2025 interview](https://crazystupidtech.com/2025/09/08/at-20-techmeme-has-never-been-hotter/)): ~3 full-time staff plus ~23 part-time remote editors across time zones for near-24/7 coverage. Humans: write headlines, pick the best article to lead a cluster, approve algorithmically found discussion links, kill algorithmic mistakes. Algorithm: discovery, clustering, ranking, page re-sorting. LLMs are being added "to assist our editors with headline-writing," and Rivera thinks AI "can especially improve the verticals with no editors" (Memeorandum, WeSmirch).
- **Google News:** no editorial story selection; algorithmic ranking per docs above.
- **Feedly:** no in-house editors for your feed — the *user* is the editor, configuring pre-trained models.
- **NewsWhip/Dataminr:** fully algorithmic detection; the humans are the customers (newsrooms, comms teams) acting on alerts.
- **Particle:** AI pipeline with "human and automated steps" for accuracy oversight.
- **Perplexity Discover:** algorithmic feed plus a paid/volunteer human Curator program.

---

## 3. The manual-vs-algorithmic pattern

| System | Discovery | Clustering/Ranking | Final selection & framing | Trajectory |
|---|---|---|---|---|
| Techmeme | Algorithmic (seed set + transitive crawl + daily reset) | Algorithmic (citations + time decay) | **Human** (26-ish editors; headlines, final calls) | Started 100% algo (2005) → added humans (2008) → hybrid forever; now adding LLMs *under* editors |
| Google News | Algorithmic (crawl; sitemaps assist) | Algorithmic (6 named factors) | Algorithmic (personalization on top) | Removed the human gate (applications) in 2019; doubled down on algo |
| Feedly | Curated corpus (millions of sources; hand-built vertical bundles) | Algorithmic (pre-trained ML models) | **User-as-editor** (Boolean-composed AI feeds) | Sells human-tunable AI as the product |
| NewsWhip | Algorithmic (social engagement firehose) | Algorithmic (velocity, 2-min sampling, forecasting) | Customer's humans act on alerts | Pure algo by design; humans are downstream |
| Dataminr | Algorithmic (1M+ public sources, multi-modal) | Algorithmic (50+ LLMs) | Customer's humans | Pure algo by design |
| Particle | Algorithmic aggregation | Algorithmic (≥3 articles/≥2 publishers gate) | AI summaries + **human accuracy oversight** | Born hybrid |
| Perplexity Discover | Algorithmic + **human curators** | Unpublished | Mixed | Adding humans (Curator program) |

**The pattern:** systems whose product is *judgment shown to readers* (Techmeme, Particle, Discover) all ended up paying humans; systems whose product is *infrastructure or alerts* (Google, NewsWhip, Dataminr, Feedly) stay algorithmic and push the judgment onto users. Rivera's 2008 verdict is the canonical statement: "the human+algorithm combo can curate news far more effectively tha[n] the individual human or algorithmic parts." ([news.techmeme.com/081203/automated](https://news.techmeme.com/081203/automated))

**Implication for a personal feed:** you already have the expensive part — a human editor (the user) with perfect taste alignment. The algorithm's job is Techmeme's pre-2008 job: gather, cluster, rank, decay. Don't build the part Techmeme pays 26 people for; build the part their software does, and make the human's veto/boost one tap.

---

## 4. What to steal for Frontier AI Feed (ranked by value ÷ effort)

1. **Google News RSS query feeds as discovery outriggers** (tiny effort, high value). Verified working live on 2026-08-12: `https://news.google.com/rss/search?q=%22anthropic%22%20when%3A1d&hl=en-US&gl=US&ceid=US:en` returned same-day items from The Guardian, Axios, etc. Add 3–5 query feeds (e.g., per-lab names, "frontier model", `when:1d`) as an 11th fetcher. This outsources Google's entire crawl+authority stack for free and catches stories your 10 curated sources miss. (Unofficial/undocumented endpoint — could break; treat as best-effort.)
2. **Cross-source pickup as the #1 ranking feature** (small effort — you already dedup/cluster). Count distinct sources per dedup cluster; a story appearing in ≥2–3 of your fetchers outranks anything single-source. This is Techmeme's threshold rule and Particle's story gate in one integer. Your Google News query fetcher makes this stronger: curated-source ∩ Google-News hit = strong importance evidence.
3. **Time decay in the ranker** (small effort). Rivera: headlines fall "when the time component swamps all other factors"; HN's gravity (prior doc) is the same idea. Score ≈ pickup_and_engagement / (age_hours + 2)^g. Without decay, a batch pipeline's front page goes stale in a day.
4. **Earned source authority — a mini-Leaderboard** (small–medium effort). Log which source each shown/tapped story came from; compute a 30-day "presence" per source (Techmeme's exact metric: share of featured-headline space). Use it as a ranking prior and a monthly prompt to swap out dead-weight fetchers — a manual version of Techmeme's 3am source reset.
5. **Velocity from aggregators-of-aggregators** (medium effort, high value later). Poor-man's NewsWhip: your pipeline already runs on a schedule — record HN points / Reddit score per URL at each batch run and rank by delta between runs, not absolute score. Two samples are enough for rate-of-change; skip the forecasting math.
6. **One-tap human-in-the-loop** (medium effort). The uniform lesson (Techmeme 2008, Particle's oversight, Feedly's user-tuned models): keep a human veto/boost above the algorithm. Mute-topic and more-like-this buttons feeding simple weights = Feedly's Leo skills at personal scale.
7. **GDELT for long-tail/global discovery** (higher effort, niche value). "100% free and open," 15-minute updates, 100+ languages ([gdeltproject.org](https://www.gdeltproject.org/)); the [DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) gives free full-text search over a rolling 3 months. Powerful but noisy for a curated AI feed — only worth it if you want non-English/regulatory coverage.
8. **Skip: WebSub, Bing News API, building a crawler.** WebSub solves polling cost you don't have at 10–15 sources. Bing's entire Search API family (including News) was retired 2025-08-11 ([Microsoft Lifecycle](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)). And Techmeme's seed-set lesson says a transitive crawler is how you get to *thousands* of sources — a personal feed never needs to.

---

## Sources

**Techmeme (primary):** [About](https://www.techmeme.com/about) · [2008 "Automated news doesn't quite work"](https://news.techmeme.com/081203/automated) · [2007 Leaderboard launch](https://news.techmeme.com/071001/techmeme-leaderboard) · [2015 author leaderboards](https://news.techmeme.com/150520/author-leaderboards) · [2007 SEL Q&A with Rivera](https://searchengineland.com/qa-with-gabe-rivera-creator-of-techmeme-10278) (interview) · [2025 Crazy Stupid Tech interview](https://crazystupidtech.com/2025/09/08/at-20-techmeme-has-never-been-hotter/) (interview; staffing numbers are the journalist's)

**Google (primary):** [Ranking within Google News](https://support.google.com/news/publisher-center/answer/9606702?hl=en) · [Publisher Center overview](https://support.google.com/news/publisher-center/answer/9606538) · [News sitemap docs](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap) · live-tested [Google News RSS query feed](https://news.google.com/rss/search?q=%22anthropic%22%20when%3A1d&hl=en-US&gl=US&ceid=US:en) · 2019 inclusion change via [Search Engine Land](https://searchengineland.com/google-all-sites-are-eligible-to-be-in-google-news-but-not-all-content-will-appear-in-google-news-350521) (secondary, quotes Google)

**Feedly (primary):** [feedly.com/ai](https://feedly.com/ai) · [Feedly AI feature post](https://feedly.com/new-features/posts/track-emerging-threats-with-feedly-ai) · Leo 2019 skills via [Coywolf](https://coywolf.com/news/productivity/feedly-pro-plus-leo-ai/) (secondary — flagged)

**NewsWhip (primary):** [ML/social-velocity post](https://www.newswhip.com/2017/05/machine-learning-newswhip/) · [NewsWhip Metrics](https://help.newswhip.com/hc/en-us/articles/4416522078225-NewsWhip-Metrics) and [Predicted Interactions](https://help.newswhip.com/hc/en-us/articles/360004848012-What-are-Facebook-and-X-Predicted-Interactions) (read via search excerpts — flagged) · [patent press release](https://www.streetinsider.com/Press+Releases/NewsWhip+Inc.+Announces+the+Issuance+of+a+New+Patent+on+Its+Social+Velocity+Methodology/11762911.html) (secondary)

**Dataminr:** [AI platform page](https://www.dataminr.com/ai-platform/) (own marketing; read via search excerpts — flagged)

**Particle (primary):** [Intro post](https://particlenews.medium.com/introducing-particle-the-news-organized-71decda13b35) · [Newsroom Robots interview with Beykpour](https://www.newsroomrobots.com/p/the-next-chapter-in-news-aggregation) (details are interviewer's summary — flagged)

**Perplexity (primary):** [Curator program](https://www.perplexity.ai/curators) · [Help Center](https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work) (Discover internals unpublished — flagged)

**Infrastructure (primary):** [WebSub W3C Recommendation](https://www.w3.org/TR/websub/) · [GDELT](https://www.gdeltproject.org/) · [GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) · [Bing Search APIs retirement](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)

**Not verified from primary sources this session (flagged inline):** Google's exact "automatically considered" wording; Feedly Leo's original 2019 skill list; NewsWhip help-center metric definitions and patent number; Dataminr's platform numbers; Particle's 3-articles/2-publishers gate as a verbatim Beykpour quote; feed-autodiscovery spec; HN Algolia API terms (not researched — prior doc covers HN ranking).
