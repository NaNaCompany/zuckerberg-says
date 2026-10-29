# Updates

## 2026-10-29 — Initial public release

- Added Zuckerberg Says in English for Mark Zuckerberg (https://www.facebook.com/zuck). Preserved the existing Trump Says navigation and visual style in a separate app.
- Indexed 1,681 original post permalinks from 2004-02-15 through 2026-07-04; partial coverage is shown on the site. No full-history or live-update claim.
- Generated 3,144 static HTML pages, including 191 months and 1,269 day lists. Month samples contain up to 50 distinct posts, with a shuffle button and day navigation. Every collected post has an individual page and original link.
- Used official platform embeds for original content, with local-preview and unavailable-content fallbacks. Preserved source metadata, exact X IDs and timestamps, date-only records, provenance and portrait/graphic licenses. Did not redistribute scraped bodies or translations.
- Included GA4, GTM plus noscript, Google AdSense and Cloudflare Web Analytics in every HTML source template. Local/test hosts do not initialize these services; inputs are not sent as custom analytics events.
- Generated canonical URLs, allow-all robots.txt, ads.txt, More Apps footer links and sitemap leaves capped at 50,000 URLs/50 MB. Parent indexes must use the listed leaves rather than a nested index.
- Exhaustive generated-page checks passed for metadata/source equality, monthly samples, complete collected day lists, canonical/internal links, sitemap coverage, all four publisher integrations and GTM fallback. Runtime tests cover shuffle failures, local embed guards, copy/share payloads and cancellation, and publisher input exclusion.
- Release HTTP and browser results are recorded separately after deployment; static checks alone do not establish live availability or search-engine indexing.

## 2026-10-29 — Ranked home feed and archive menu

- The home shows up to 100 collected posts with known source like counts, highest first. This snapshot contains 0 known-count and 1,681 unknown-count eligible records. Unknown is never rendered as zero. Source metrics are historical snapshots, not live counters; provenance and capture precision are retained.
- The newest collected posts continue through 85 static HTML pages, 20 per page. The home and continuations exclude duplicate popular records and explicitly classified reposts. Each next link works as ordinary pagination without JavaScript. Runtime HTML parsing validates IDs, authors, dates, canonical URLs, sequential next links and chronological order before reconstructing inert cards.
- Original content is loaded automatically near the viewport in the main, month and day lists through official platform embeds, with at most three active initializations. Manual retry and original links remain available. Full original text is separately recorded in a local TXT archive with ID offsets and hashes; that private archive is not included in this public repository. No translations or uncleared full bodies are newly redistributed.
- The right floating Archive control opens year/month navigation. The home renders its menu directly; other pages load the shared archive-menu.html on demand to avoid copying years of navigation into tens of thousands of pages. Escape, outside click, focus return, failed loading and retry are supported.
- A verified public-license/public-domain portrait is used with original-source attribution, license URL, download hash and modification notice on Sources & coverage.
- Existing detail URLs, original links, UTC/source calendar dates, monthly shuffle and day navigation are preserved. Verified repost-only historical dates keep their existing route with an empty eligible list rather than silently disappearing.
- Every HTML including feed and archive-menu pages retains GA4, GTM with noscript, AdSense, Cloudflare, a self canonical and More Apps. Publisher and embed requests are disabled on local hosts; the preview CSP also blocks the noscript frame. Bottom spacing and floating-menu offsets leave room for observed mobile ad anchors; third-party ad height may vary.
- Shared feed runtime regression tests cover HTML pagination, deduplication/order, concurrent loading, errors/retry, unsafe URLs/HTML, lazy embeds, source availability, menu fetching/keyboard/focus, mutation cleanup and unavailable IntersectionObserver. Full static checks validate every generated page and source-backed ranking.

## 2026-10-29 · Expanded mobile anchor navigation fix

- Move the floating Archive button to the right middle of the viewport (40% from the top). On mobile, keep the archive panel controls below top anchors and above expanded bottom anchors. An expanded production advertisement had intercepted the previous bottom button. Publisher integrations and ad settings remain unchanged.
- Verified locally at 375 × 812: visible menu open/close, month navigation, lazy archive menu and shuffled 50-card content. Only the shared stylesheet and this record changed; source data, generated HTML and the tested feed runtime remain unchanged. Production verification is recorded separately.
