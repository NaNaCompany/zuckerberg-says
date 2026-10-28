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
