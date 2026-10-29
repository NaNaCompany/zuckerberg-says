# Zuckerberg Says

English interface for a dated social-post archive. Original post language only; no translations.

Launch: https://nanalab.kr/zuckerberg-says/

Original account: https://www.facebook.com/zuck

## Text-first display

The main page starts with up to 100 eligible collected posts ranked by known source like-count snapshots, then continues newest first without popular-post duplicates. Unknown like counts remain unknown; this is not a live or complete-account ranking.

Home, continuation feeds, month lists, day lists and shuffled month cards show text first. These lists do not initialize X, Meta or Truth Social embeds. A text-preview anchor opens the existing individual static detail page. Normal pagination and detail links remain usable without JavaScript.

A preview contains at most 800 Unicode characters in total. When the captured source string exceeds that limit, the preview is its first 799 Unicode characters followed by one ellipsis character (…). The source string itself is not truncated or overwritten. Shorter strings remain intact.

An individual detail page displays the complete available captured source string together with the official platform embed and an original-source link. The saved string can be partial if the source capture was partial; displaying it in full does not claim recovery of the entire original post. Provider metadata descriptions remain labeled as source-page descriptions and are not presented as verified full post bodies. Empty source bodies and unavailable text receive explicit source-availability labels; no text is inferred, completed, translated or generated to fill a gap.

## Source data and coverage

Partial snapshot: 1,681 collected original permalinks, 2004-02-15 through 2026-07-04. This is not a complete account export, live feed, recent-activity ranking or claim of personal authorship. Exact coverage, source snapshots and exclusions remain in data/source-audit.json and Sources & coverage.

data/posts.json remains the original identity/date/permalink corpus. The separate data/post-texts.json overlay is keyed by the same stable record ID and contains exact available source strings, source links, status/completeness labels and hashes. The overlay does not rewrite the metadata corpus.

The new public text overlay follows the user's original-language display request. Source attribution, status, provenance, normalization/completeness notes and rights declarations remain visible. A dataset or repository license is not represented as a blanket license for all underlying third-party posts. Unlicensed images, post media and third-party translations are not added by this text display change. The separate local TXT archive remains local; the public overlay explicitly contains the source strings selected for this release.

Native reposts are excluded from the home and rendered list feeds. Original identities and existing detail routes are preserved. For the political-account collection, retained records require matching author markers; replies and quotes with the account's own added content are eligible. Historical source classifications and unknown values are not silently rewritten. Staff may operate an account.

## Navigation and runtime

The floating Archive control opens year/month navigation. Month pages retain random samples of up to 50 distinct eligible collected posts and day navigation; each day lists the collected eligible records for that date. The archive menu is loaded on demand outside the home. Source dates use UTC for exact timestamps; date-only source records keep their supplied calendar date without an invented clock time.

Continuation pages are ordinary static HTML, loaded sequentially on scroll with a normal Load more link as fallback. Text previews and detail URLs use the same stable record identities. Individual details keep copy/share page links, retry/original controls and an original-link fallback if the official embed cannot display. Deletion, privacy, regional limits and platform sign-in rules may affect the live embed independently of the stored snapshot.

## Portraits, publisher integrations and independence

Existing portrait or graphic files, original bytes, creator/source/license links, modification notices and hashes remain in src/assets/portrait-credit.json and Sources & coverage.

Every generated HTML page retains the verified GA4, GTM with noscript fallback, Google AdSense and Cloudflare Web Analytics integrations, a self-referencing canonical URL and the More Apps footer link. Publisher requests and platform embeds do not initialize on local/test hosts. Search values, copied text and other user input are not sent as custom analytics events; analytics page locations omit query strings and fragments.

Independent archive; no affiliation or endorsement by an account holder, government, company or social platform is implied. Original platform embed documentation: https://help.x.com/en/using-x/how-to-embed-a-post.

## Build and verification

```text
python scripts/build_site.py
python scripts/check_site.py
node --test tests/publisher.test.mjs tests/runtime.test.mjs tests/feed-runtime.test.mjs
```

The build writes docs/. GitHub Pages serves main:/docs. Source documentation is not proof of completed testing, a pushed commit, Pages deployment, public HTTP/browser verification or search-engine indexing. Release validation and publication evidence for this text-first change are recorded separately under .tools/says-text-first-20261029/ in the workspace; per-app evidence remains under evidence/.

## Sitemap

Existing public page paths and canonical identities are preserved. Each sitemap leaf remains within 50,000 URLs and 50 MB. Parent sitemap indexes must reference leaf maps directly rather than nesting this app's sitemap.xml index.

- https://nanalab.kr/zuckerberg-says/sitemap-main.xml
- https://nanalab.kr/zuckerberg-says/sitemap-posts-01.xml
