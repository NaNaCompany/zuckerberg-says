# Zuckerberg Says

English social-post directory for Mark Zuckerberg (https://www.facebook.com/zuck).

Launch: https://nanalab.kr/zuckerberg-says/

## Navigation

Year → month → up to 50 random indexed posts → day → all indexed posts for that day → individual static post page. The main page does not load the post corpus. A month loads its own JSON only when the shuffle button is used.

## Coverage

This is a partial snapshot containing 1,681 original permalinks, dated 2004-02-15 through 2026-07-04. It is not a complete account export, live feed, or scheduled collector. Each source and excluded record is documented in `data/source-audit.json` and the generated Sources & coverage page. Sam Altman's initial collection is a selected 50-post set; Tibo means Thibault Sottiaux (@thsottiaux) from the Codex team.

Only factual identifiers, dates, available timestamps and original URLs are stored. Post bodies and third-party translations are not redistributed. Content displays through official X/Meta embeds. Deleted, private, region-limited or platform-blocked posts may not display; their original links remain available. Calendar-only university records retain their date without invented clock times. X Snowflake IDs remain strings.

## Build and verify

Requires Python 3.10+ and Node.js 20+; no third-party build dependencies.

```text
python scripts/build_site.py
python scripts/check_site.py
node --test tests/publisher.test.mjs tests/runtime.test.mjs
```

The build writes `docs/`. GitHub Pages serves `main:/docs`; there is no per-app CNAME. Every HTML page has the verified NaNa Lab GA4, GTM including noscript, AdSense and Cloudflare integrations. Publisher requests and original embeds are disabled on local/test hosts. No copy/share or other user input is sent as a custom analytics event. The footer links to More Apps.

## Sitemap

`sitemap.xml` is an index. Each leaf contains at most 50,000 URLs and is smaller than 50 MB. Connect the following leaf files directly to a parent sitemap index, without nesting this app's index:

- https://nanalab.kr/zuckerberg-says/sitemap-main.xml (1463 URLs)
- https://nanalab.kr/zuckerberg-says/sitemap-posts-01.xml (1681 URLs)

## Attribution

Portrait and graphic attribution, license links and modification notices are preserved in `src/assets/portrait-credit.json` and the public Sources & coverage page. Original JPEG bytes are retained. Tibo uses an original initials graphic rather than an unlicensed portrait. Raw third-party source downloads are excluded from this repository.

The stylesheet follows the owner's existing Trump Says design. Independent project; not affiliated with the subjects or social platforms.
