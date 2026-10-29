from collections import Counter,defaultdict
from pathlib import Path
from urllib.parse import urlsplit
import calendar,hashlib,html,json,random,re,shutil
from home_feed import make as make_home_feed, record as feed_record, config as feed_config, panel as feed_panel, eligible as feed_eligible, preview_row, detail_text_html

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs';APP=json.loads((ROOT/'APP.json').read_text(encoding='utf-8'))
ROWS=json.loads((ROOT/'data/posts.json').read_text(encoding='utf-8'))
RAW_ROWS=ROWS
assert all(row.get('text') is None for row in RAW_ROWS),'Raw metadata body policy changed'
TEXTS=json.loads((ROOT/'data/post-texts.json').read_text(encoding='utf-8'))
AUDIT=json.loads((ROOT/'data/source-audit.json').read_text(encoding='utf-8'))
H=lambda v:html.escape(str(v),quote=True)
ORIGIN=APP['origin'];NAME=APP['name'];SUBJECT=APP['subject']
PREFIX='/'+APP['slug']+'/'
PLATFORM={'x':'X / Twitter','facebook':'Facebook','threads':'Threads','instagram':'Instagram'}
tracking=(ROOT/'scripts/publisher-tracking.mjs').read_text(encoding='utf-8')
HEAD=re.search(r'export const HEAD=`(.*?)`;',tracking,re.S)[1]
FALLBACK=re.search(r'export const FALLBACK=`(.*?)`;',tracking,re.S)[1]
for k,v in {'ga':'G-2ZYSF0173P','gtm':'GTM-NV2WWQXB','ads':'ca-pub-9767176956440077','cf':'9f3423bb0d034d91bbe1a12afeff2429'}.items():
    HEAD=HEAD.replace('${IDS.'+k+'}',v);FALLBACK=FALLBACK.replace('${IDS.'+k+'}',v)
assert '${' not in HEAD+FALLBACK
ASSET=hashlib.sha256((ROOT/'src/archive.js').read_bytes()+(ROOT/'src/series.css').read_bytes()+(ROOT/'src/feed.js').read_bytes()+(ROOT/'src/feed.css').read_bytes()).hexdigest()[:12]
URLS=[]
FEED_PANEL=''

def safe_original(row):
    u=urlsplit(row['original_url']);host=(u.hostname or '').lower()
    allowed={'x':{'x.com','twitter.com','www.twitter.com','www.x.com'},'facebook':{'facebook.com','www.facebook.com','m.facebook.com'},'threads':{'threads.com','www.threads.com','threads.net','www.threads.net'},'instagram':{'instagram.com','www.instagram.com'}}
    assert u.scheme=='https' and host in allowed[row['platform']] and not u.username and not u.password,('Bad original URL',row['id'])
    if row['platform']=='x':
        handles=APP.get('x_handles',[APP['handle']])
        assert any(re.fullmatch('/'+handle+'/status/'+row['post_id']+'/?',u.path,re.I) for handle in handles),('Wrong X author',row['id'])
    return row['original_url']

def clock(row):return row['published_at'][11:19]+' UTC' if row['published_at'] else 'Time not provided'
def post_href(row):return PREFIX+'posts/'+row['id']+'.html'
def site_page(title,content,relative,kind='browse',config=None):
    url=ORIGIN+'/'+relative
    payload={'kind':kind,'origin':ORIGIN,'base':PREFIX,'name':NAME,**(config or {})}
    payload_json=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    header=f'<a class="skip" href="#main">Skip to content</a><header class="topbar"><a class="wordmark" href="{PREFIX}">{H(APP["wordmark"])}<span>SAYS</span><b aria-hidden="true">.</b></a><nav aria-label="Pages"><a href="{PREFIX}archive-menu.html" data-feed-action="archive-open">Archive</a><a href="{PREFIX}sources.html">Sources & coverage</a></nav></header>'
    footer=f'<footer><span>Independent archive · Partial coverage</span><a href="{PREFIX}sources.html">Sources & coverage</a><a href="{PREFIX}privacy.html">Privacy</a><a class="more" href="https://nanalab.kr/apps/">More Apps</a></footer>'
    page_title=title if title==NAME else title+' — '+NAME
    result=f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>{H(page_title)}</title><meta name="description" content="{H(SUBJECT+" social-post index. Browse verified source dates and original post links.")}"><link rel="canonical" href="{H(url)}"><meta property="og:title" content="{H(title)}"><meta property="og:url" content="{H(url)}"><meta property="og:type" content="website"><link rel="icon" href="{PREFIX}icon.svg"><link rel="stylesheet" href="{PREFIX}style.css?v={ASSET}"><link rel="stylesheet" href="{PREFIX}series.css?v={ASSET}"><link rel="stylesheet" href="{PREFIX}feed.css?v={ASSET}">{HEAD}</head><body>{FALLBACK}{header}<main id="main">{content}{footer}</main>{FEED_PANEL if not relative else feed_panel(APP, "")}{feed_config(APP)}<div id="status" class="status" role="status" aria-live="polite"></div><dialog id="copy-dialog"><h2>Copy link</h2><p>Select and copy this post’s page URL.</p><textarea readonly aria-label="Post page URL"></textarea><button data-action="close-dialog">Close</button></dialog><script type="application/json" id="page-config">{payload_json}</script><script src="{PREFIX}feed.js?v={ASSET}" defer></script><script src="{PREFIX}archive.js?v={ASSET}" defer></script></body></html>'
    target=OUT/relative
    if not relative or relative.endswith('/'):target=target/'index.html'
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(result,encoding='utf-8',newline='\n')
    URLS.append(url)

def card(row):
    return feed_record(row,APP)

def sources_page(credit):
    source_list=[]
    for s in AUDIT['sources']:
        label=s.get('creator') or s['id']
        source_list.append(f'<li><a href="{H(s["url"])}">{H(label)}</a> · {H(s["id"])}'+(f'<br>Version: {H(s["version"])}' if s.get('version') else '')+(f'<br>{H(s["attribution"])} · <a href="{H(s["upstream"])}">upstream</a>' if s.get('attribution') else '')+'</li>')
    photo=(f'<p>{H(credit["creator"])} · <a href="{H(credit["source"])}">Original image and license record</a> · <a href="{H(credit["license_url"])}">{H(credit["license"])}</a>. {H(credit["modifications"])}</p>' if APP['photo'] else '<p>Original initials graphic by NaNaCompany. The original account photo is displayed only through official embeds.</p>')
    counts=Counter(r['platform'] for r in ROWS)
    coverage=''.join(f'<tr><th>{PLATFORM[k]}</th><td>{v:,}</td></tr>' for k,v in counts.items())
    kind_note='<p>The Sam Altman collection begins with 50 permalinks from a top-post listing. It is a selected set, not his full posting history.</p>' if APP['slug']=='sam-altman-says' else ''
    identity='<p>Tibo means Thibault Sottiaux, @thsottiaux, from the OpenAI Codex team. It does not mean @tibo_maker. <a href="https://forum.openai.com/public/videos/event-replay-codex-is-for-everyone-why-codex-matters-beyond-code-2026-05-13">OpenAI identity reference</a>.</p>' if APP['slug']=='tibo-says' else ''
    content=f'<section class="sources"><h1>Sources & coverage</h1><div class="box">{len(ROWS):,} indexed post permalinks · {AUDIT["first"]} to {AUDIT["last"]}<br>Snapshot: {H(AUDIT["captured_at"])} · Partial coverage</div>{identity}{kind_note}<h2>Content display</h2><p>Browse lists display original-language text previews of up to 800 characters and link to individual post pages without loading post embeds. Individual pages display the captured source text alongside the official platform embed. Text source links and availability labels distinguish missing text, partial source strings and official original-page descriptions. A description is not a full post transcript. No translated or reconstructed text is added.</p><p>Captured text is attributed to its recorded source. Source availability or a dataset license does not by itself establish ownership of the underlying post. Original rights remain with the applicable authors and platforms. Source strings may be incomplete or outdated; the original permalink and official embed remain available for context.</p><h2>Platform coverage</h2><table><thead><tr><th>Platform</th><th>Indexed posts</th></tr></thead><tbody>{coverage}</tbody></table><h2>Sources</h2><ul>{"".join(source_list)}</ul><h2>Time and dates</h2><p>X creation times are derived from the exact decimal Snowflake post ID. Older IDs retain an available timezone-aware source timestamp. Month/day navigation uses UTC dates for exact timestamps. University records with only a calendar date keep that date; their clock time is marked unavailable and is never inferred.</p><p>All IDs remain strings. Records are deduplicated by platform identity or original permalink. No simulated quotes or inferred publication times are added.</p><h2>Limits</h2><ul><li>This is a snapshot, not a complete account export or live monitor.</li><li>Uncollected posts, replies, deleted posts and prior revisions may be absent.</li><li>Embeds may be unavailable after deletion, privacy changes, regional limits or platform sign-in requirements. The original permalink remains available.</li><li>No login credentials or private-account content were collected.</li></ul><h2>Portrait / graphic credit</h2>{photo}<h2>Embed documentation</h2><ul><li><a href="https://help.x.com/en/using-x/how-to-embed-a-post">X official embedded-post documentation</a></li><li><a href="https://github.com/facebook/meta-embeds-for-wordpress">Meta official embed integration</a></li></ul><p><a href="{PREFIX}data/summary.json">Machine-readable coverage manifest</a> · <a href="{PREFIX}">Back to {H(NAME)}</a></p><p>Independent project. Not affiliated with {H(SUBJECT)} or the social platforms.</p></section>'
    site_page('Sources & coverage',content,'sources.html')

def main():
    global FEED_PANEL,ROWS
    assert re.fullmatch('[a-z0-9-]+',APP['slug']) and ORIGIN=='https://nanalab.kr/'+APP['slug']
    assert len({r['id'] for r in ROWS})==len(ROWS)>0
    for row in RAW_ROWS:
        safe_original(row)
        assert re.fullmatch(r'(?:x-\d+|archive-\d+)',row['id'])
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['published_date'])
    ROWS=[preview_row(row,TEXTS) for row in RAW_ROWS]
    OUT.mkdir(exist_ok=True)
    for name in ('style.css','series.css','archive.js','icon.svg','feed.js','feed.css'):shutil.copy2(ROOT/'src'/name,OUT/name)
    shutil.copytree(ROOT/'src/assets',OUT/'assets',dirs_exist_ok=True)
    (OUT/'data').mkdir(exist_ok=True)
    credit=json.loads((ROOT/'src/assets/portrait-credit.json').read_text(encoding='utf-8'))
    months=defaultdict(list);days=defaultdict(list)
    for row in ROWS:
        if not feed_eligible(row):continue
        months[row['published_date'][:7]].append(row);days[row['published_date']].append(row)
    summary={k:v for k,v in AUDIT.items() if k!='failures'}|dict(subject=SUBJECT,account=APP['handle'],platform_counts=dict(Counter(r['platform'] for r in ROWS)),days=len(days),months=len(months),content_mode='text_preview_and_official_embeds')
    (OUT/'data/summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    years=sorted({m[:4] for m in months},reverse=True);grids=[]
    for year in years:
        buttons=[]
        for m in range(1,13):
            key=year+'-'+str(m).zfill(2);label=calendar.month_abbr[m]
            buttons.append(f'<a class="month-button" href="{PREFIX}archive/{key}.html"><b>{label}</b><span>{len(months[key]):,}</span></a>' if key in months else f'<span class="month-button disabled" aria-disabled="true"><b>{label}</b><span>—</span></span>')
        grids.append(f'<section class="year-group"><h3>{year}</h3><nav class="year-grid" aria-label="Months in {year}">{"".join(buttons)}</nav></section>')
    FEED_PANEL=feed_panel(APP,''.join(grids))
    feed_stats=make_home_feed(ROOT,APP,ROWS,AUDIT,site_page,grids)
    sources_page(credit)
    site_page('Privacy',f'<section class="sources"><h1>Privacy</h1><p>This static site has no accounts or server-side reading history. Copy and share use your browser or operating system. Loading an original post connects to X or Meta; those services may receive your visit and device information and may use cookies.</p><p>Published pages use Google Analytics 4, Google Tag Manager, Google AdSense and Cloudflare Web Analytics. Search fields, copied content and other user inputs are not sent as custom analytics events. Page-view URLs omit query strings and fragments. <a href="https://policies.google.com/privacy">Google privacy</a> · <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy</a>.</p><p>Browse lists show text previews and link to individual pages without initializing post embeds. Individual post pages show the captured source text and load the original platform embed. Opening a detail page or retrying its embed connects to that platform; the original permalink remains available if an embed fails.</p></section>','privacy.html')
    for month,items in sorted(months.items(),reverse=True):
        by_day={day:rows for day,rows in days.items() if day.startswith(month)}
        picker=''.join(f'<a class="day-button" href="{PREFIX}archive/{day}.html"><b>{int(day[-2:])}</b><span>{len(rows):,} posts</span></a>' for day,rows in sorted(by_day.items()))
        sample=random.Random(month+'|'+APP['slug']).sample(items,min(50,len(items)))
        filename='month-'+month+'.json';(OUT/'data'/filename).write_text(json.dumps(items,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        content=f'<section class="sources archive-month"><nav class="breadcrumb"><a href="{PREFIX}#archive">All months</a> / {month}</nav><h1>{month}</h1><p>{len(items):,} indexed posts · Choose a day to see all its indexed posts.</p><nav class="day-picker" aria-label="Days in {month}">{picker}</nav><div class="sample-heading"><h2>Random {min(50,len(items))} posts</h2><button id="shuffle" data-action="shuffle">Shuffle posts</button></div><p class="hint">Open a text preview to see its post page and original embed.</p><ul id="records" class="archive-list">{"".join(card(r) for r in sample)}</ul><p id="load-error" role="alert" hidden></p></section>'
        site_page(month+' posts',content,'archive/'+month+'.html','month',dict(month=month,monthData=PREFIX+'data/'+filename,records=sample))
    for day,items in sorted(days.items(),reverse=True):
        order_note='All posts for this date, newest first.' if all(row['published_at'] for row in items) else 'All indexed posts for this date. Clock times are unavailable.'
        content=f'<section class="sources archive-day"><nav class="breadcrumb"><a href="{PREFIX}#archive">All months</a> / <a href="{PREFIX}archive/{day[:7]}.html">{day[:7]}</a> / {day}</nav><h1>{day}</h1><p>{len(items):,} indexed posts · {order_note}</p><ul class="archive-list">{"".join(card(r) for r in items)}</ul></section>'
        site_page(day+' posts',content,'archive/'+day+'.html','day',dict(records=items))
    for row in ROWS:
        url=ORIGIN+'/posts/'+row['id']+'.html'
        record_label=('Archive record '+row['post_id']) if row['id'].startswith('archive-') else ('Post '+row['post_id'])
        content=f'<section class="sources post-page"><nav class="breadcrumb"><a href="{PREFIX}archive-menu.html" data-feed-action="archive-open">Archive</a> / <a href="{PREFIX}archive/{row["published_date"][:7]}.html">{row["published_date"][:7]}</a> / <a href="{PREFIX}archive/{row["published_date"]}.html">{row["published_date"]}</a></nav><h1>{H(SUBJECT)}</h1><p class="post-date"><time datetime="{H(row["published_at"] or row["published_date"])}">{row["published_date"]} · {clock(row)}</time></p><div class="meta"><span>{PLATFORM[row["platform"]]}</span><span>{H(record_label)}</span></div>{detail_text_html(row,TEXTS)}<div class="original-panel"><p class="hint">Original content from {PLATFORM[row["platform"]]}. If unavailable, open the original link below.</p><div class="embed-slot" id="embed-{row["id"]}"></div><button data-action="preview" data-id="{row["id"]}">Load / retry original post</button></div><div class="actions post-actions"><a href="{H(safe_original(row))}" target="_blank" rel="noopener noreferrer">Open original ↗</a><button data-action="copy" data-url="{H(url)}">Copy page link</button><button data-action="share" data-url="{H(url)}">Share</button></div><p class="provenance">Source IDs: {H(", ".join(row["source_ids"]))}. Date precision: {H(row["date_precision"])}.'+(f' <a href="{H(row["source_url"])}">Source record</a>.' if row.get('source_url') else '')+f' <a href="{PREFIX}sources.html">Coverage details</a>.</p></section>'
        site_page(SUBJECT+' · '+row['published_date']+' · '+row['post_id'],content,'posts/'+row['id']+'.html','post',dict(records=[row]))
    navigation=[u for u in URLS if '/posts/' not in u];posts=[u for u in URLS if '/posts/' in u]
    maps=[('sitemap-main.xml',navigation)]+[(f'sitemap-posts-{i//50000+1:02}.xml',posts[i:i+50000]) for i in range(0,len(posts),50000)]
    for filename,urls in maps:
        assert len(urls)<=50000
        xml='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+H(u)+'</loc></url>' for u in urls)+'</urlset>\n'
        assert len(xml.encode())<50_000_000
        (OUT/filename).write_text(xml,encoding='utf-8')
    (OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<sitemap><loc>{ORIGIN}/{name}</loc></sitemap>' for name,_ in maps)+'</sitemapindex>\n',encoding='utf-8')
    (OUT/'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {ORIGIN}/sitemap.xml\n',encoding='utf-8')
    (OUT/'ads.txt').write_text('google.com, pub-9767176956440077, DIRECT, f08c47fec0942fa0\n',encoding='utf-8')
    (OUT/'.nojekyll').write_text('',encoding='utf-8')
    report=dict(status='built',slug=APP['slug'],subject=SUBJECT,handle=APP['handle'],posts=len(ROWS),months=len(months),days=len(days),html_pages=len(URLS),sitemap_leaves=[dict(file=name,urls=len(urls)) for name,urls in maps],home_corpus_requests=0,monthly_sample=50,content_mode='text_preview_and_official_embeds',portrait_sha256=credit.get('sha256'))
    (ROOT/'evidence/build.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report),flush=True)

if __name__=='__main__':main()
