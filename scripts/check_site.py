"""Exhaustive text-first checks against immutable metadata and a separate text overlay.

Copy to each Python app's scripts/check_site.py after the text-first build sources
are installed. This checker does not import the renderer or its text helpers.
HTML reads/checks use 32 workers; all expectation construction is independent.
"""
from collections import Counter,defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote,urljoin,urlsplit
import hashlib,html,json,re,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'
WORKERS=32
PREVIEW_LIMIT=800
LIST_FALLBACK='Source text unavailable. Open the post to view the original.'
DETAIL_FALLBACK='Source text unavailable. Open the original post below.'
SHORTENED_NOTE=' Preview shortened to 800 characters. Open the post for the complete captured text.'
app=json.loads((ROOT/'APP.json').read_text(encoding='utf-8'))
rows=json.loads((ROOT/'data/posts.json').read_text(encoding='utf-8'))
texts=json.loads((ROOT/'data/post-texts.json').read_text(encoding='utf-8'))
byid={r['id']:r for r in rows}
assert len(rows)==len(byid)>0,'Duplicate or empty original metadata corpus'
assert isinstance(texts,dict) and set(texts)<=set(byid),'Text overlay references an unknown post'
prefix='/'+app['slug']+'/'
origin=app['origin']
assert origin=='https://nanalab.kr/'+app['slug']
proof_file=ROOT/'data/classification-evidence.json'
proofs=json.loads(proof_file.read_text(encoding='utf-8')) if proof_file.exists() else None

def eligible(row):
    return row.get('is_repost') is not True and row.get('kind') not in ('repost','retweet') and row.get('post_kind') not in ('repost','retweet')

def permalink(identity):
    return origin+'/posts/'+identity.replace(':','-')+'.html'

def expected_preview(row):
    entry=texts.get(row['id'])
    full=entry['text'] if entry is not None else None
    truncated=full is not None and len(full)>PREVIEW_LIMIT
    snippet=full[:PREVIEW_LIMIT-1]+'…' if truncated else full
    return {**row,'text':snippet,'text_status':entry['status'] if entry is not None else 'unavailable',
            'text_source':entry['source_url'] if entry is not None else None,'text_truncated':truncated}

def note_for(full,status,truncated=False):
    if not isinstance(full,str) or not full.strip():note='Source text unavailable.'
    elif 'description' in status:note='Official original-page description; not a full post transcript.'
    elif 'partial' in status or 'truncated' in status:note='Partial source text; the original may contain more.'
    else:note='Captured source text.'
    return note+(SHORTENED_NOTE if truncated else '')

def escaped(value):return html.escape(value,quote=True)

def attr(attrs,name):
    found=re.search(r'\b'+re.escape(name)+r'="([^"]*)"',attrs)
    return html.unescape(found[1]) if found else None

def class_element(markup,cls,tag=None):
    name=re.escape(tag) if tag else r'[A-Za-z][\w:-]*'
    pattern=re.compile(r'<(?P<tag>'+name+r')\b(?P<attrs>[^>]*\bclass="(?:[^"]*\s)?'+re.escape(cls)+r'(?:\s[^"]*)?"[^>]*)>(?P<body>.*?)</(?P=tag)>',re.S)
    return pattern.findall(markup)

def plain(markup):return html.unescape(re.sub(r'<[^>]*>','',markup))

def visible_note(markup,expected,status,source=None):
    notes=class_element(markup,'post-text-note','p')
    assert len(notes)==1,'Expected exactly one full-text provenance note'
    assert attr(notes[0][1],'data-text-status')==status,'Full-text raw status mismatch'
    body=notes[0][2]
    assert plain(body).startswith(expected),'Full-text status description mismatch'
    links=[html.unescape(x) for x in re.findall(r'<a\b[^>]*\bhref="([^"]+)"',body)]
    assert links==([source] if source else []),'Full-text source link mismatch'

days=defaultdict(set);months=defaultdict(set);month_order=defaultdict(list)
for row in rows:
    assert row.get('text') is None,'Original data/posts.json text must remain null'
    assert isinstance(row['post_id'],str),'Post IDs must remain exact strings'
    day=row['published_date'];assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',day)
    days.setdefault(day,set());months.setdefault(day[:7],set());month_order.setdefault(day[:7],[])
    if eligible(row):
        days[day].add(row['id']);months[day[:7]].add(row['id']);month_order[day[:7]].append(row['id'])
    u=urlsplit(row['original_url']);assert u.scheme=='https' and not u.username and not u.password
    if row['platform']=='x':
        assert u.hostname in ('x.com','twitter.com','www.twitter.com','www.x.com')
        handles=app.get('x_handles',[app['handle']])
        assert any(u.path.lower()==f'/{handle}/status/{row["post_id"]}'.lower() for handle in handles)
        if int(row['post_id'])>100000000000:
            milliseconds=(int(row['post_id'])>>22)+1288834974657
            got=datetime.fromisoformat(row['published_at'].replace('Z','+00:00')).timestamp()
            assert abs(milliseconds/1000-got)<.0011,(row['id'],'X timestamp mismatch')
        assert row['published_at'][:10]==day
    else:
        assert row['published_at'] is None and row['date_precision']=='day'
        assert u.hostname in ('facebook.com','www.facebook.com','m.facebook.com','threads.net','www.threads.net','threads.com','www.threads.com','instagram.com','www.instagram.com')
    count=row.get('like_count')
    assert count is None or isinstance(count,int) and not isinstance(count,bool) and count>=0
    if proofs is not None:
        p=proofs[row['id']]
        assert row['is_repost'] is False and row['author_verified'] is True and p['retweet_header'] is False
        assert all(p[k].lower()==app['handle'].lower() for k in ('permalink_author','username_author','item_author'))
        assert p['classification']==row['post_kind']
        if row['post_kind']=='quote':assert p['quote_has_authored_content']
for identity,entry in texts.items():
    assert isinstance(entry,dict) and isinstance(entry['text'],str)
    assert isinstance(entry['status'],str) and entry['status']
    assert isinstance(entry['source_url'],str)
    source=urlsplit(entry['source_url'])
    assert source.scheme=='https' and source.hostname and not source.username and not source.password,(identity,'Unsafe text source')
    assert re.fullmatch('[a-f0-9]{64}',entry['sha256'])
    assert hashlib.sha256(entry['text'].encode('utf-8')).hexdigest()==entry['sha256'],(identity,'Overlay body hash mismatch')
previews={identity:expected_preview(row) for identity,row in byid.items()}

if app.get('photo'):
    credit=json.loads((ROOT/'src/assets/portrait-credit.json').read_text(encoding='utf-8'))
    assert hashlib.sha256((OUT/app['portrait']).read_bytes()).hexdigest()==credit['sha256']
    license_url=credit['license_url'];license_name=credit['license'].lower()
    assert license_url.startswith('https://creativecommons.org/') or ('public domain' in license_name and (license_url.startswith('https://commons.wikimedia.org/wiki/Template:PD-USGov') or license_url in ('https://www.copyright.gov/title17/92chap1.html#105','https://commons.wikimedia.org/wiki/Template:PD-CAGov')))
    assert credit['source'].startswith('https://commons.wikimedia.org/wiki/File:') and credit['creator'] and credit['modifications']

index=ET.parse(OUT/'sitemap.xml')
assert index.getroot().tag.endswith('sitemapindex')
refs=[e.text for e in index.findall('.//{*}sitemap/{*}loc')]
assert refs and len(refs)==len(set(refs))
urls=[]
for ref in refs:
    assert ref.startswith(origin+'/')
    f=OUT/ref.removeprefix(origin+'/');assert f.is_file() and f.stat().st_size<50_000_000
    tree=ET.parse(f);assert tree.getroot().tag.endswith('urlset')
    locs=[e.text for e in tree.findall('.//{*}url/{*}loc')]
    assert len(locs)<=50000 and all(u.startswith(origin+'/') for u in locs)
    urls+=locs
assert len(urls)==len(set(urls))
allfiles={f.relative_to(OUT).as_posix() for f in OUT.rglob('*') if f.is_file()}
htmlfiles={f for f in allfiles if f.endswith('.html')}
assert len(urls)==len(htmlfiles),'HTML/sitemap count mismatch'
feed=json.loads((ROOT/'evidence/feed-build.json').read_text(encoding='utf-8'))
known=sorted([r for r in rows if eligible(r) and r.get('like_count') is not None],key=lambda r:(r['like_count'],r.get('published_at') or r['published_date'],r['id']),reverse=True)[:100]
assert feed['popular_ids']==[r['id'] for r in known] and len(known)<=100
popular_set=set(feed['popular_ids'])
latest=sorted([r for r in rows if eligible(r) and r['id'] not in popular_set],key=lambda r:(r.get('published_at') or r['published_date'],r['id']),reverse=True)
assert feed['latest_ids']==[r['id'] for r in latest] and not feed['duplicate_popular_latest']
assert feed['popular_count']==len(known)

FEED_DATA=re.compile(r'<script type="application/json" class="feed-record-data">(.*?)</script>',re.S)
FEED_RECORD=re.compile(r'<li\b(?P<attrs>[^>]*\bclass="(?:[^"]*\s)?feed-record(?:\s[^"]*)?"[^>]*)>(?P<body>.*?)</li>',re.S)
SOCIAL_HOSTS={'platform.twitter.com','syndication.twitter.com','www.facebook.com','facebook.com','www.threads.net','www.threads.com','threads.net','threads.com','www.instagram.com','instagram.com','truthsocial.com','www.truthsocial.com'}

def check_record(fragment,metadata,name):
    identity=metadata['id'];expected={**previews[identity],'permalink':permalink(identity)}
    assert metadata==expected,(name,identity,'Preview metadata differs from independent overlay projection')
    assert eligible(byid[identity]),(name,identity,'Repost leaked into a list')
    anchors=class_element(fragment,'feed-text-link','a')
    assert len(anchors)==1,(name,identity,'Expected one clickable text anchor')
    _,attrs,anchor_body=anchors[0]
    assert 'detail-link' in (attr(attrs,'class') or '').split()
    assert urljoin(origin+'/',attr(attrs,'href') or '')==permalink(identity),(name,identity,'Wrong detail link')
    bodies=class_element(anchor_body,'feed-text-body','p')
    assert len(bodies)==1 and attr(bodies[0][1],'dir')=='auto'
    assert 'feed-text' in attr(bodies[0][1],'class').split(),(name,identity,'Text body class mismatch')
    read_more=class_element(anchor_body,'feed-read-more','span')
    assert len(read_more)==1 and read_more[0][2]==escaped('View post →'),(name,identity,'Detail-link read-more label mismatch')
    meta=class_element(fragment,'feed-meta','div')
    assert len(meta)==1 and not class_element(anchor_body,'feed-meta'),(name,identity,'Feed metadata must be outside the text anchor')
    snippet=metadata['text']
    visible=snippet if isinstance(snippet,str) and snippet.strip() else LIST_FALLBACK
    assert bodies[0][2]==escaped(visible),(name,identity,'SSR preview or HTML escaping mismatch')
    full=texts.get(identity,{}).get('text')
    expected_note=note_for(full,metadata['text_status'],metadata['text_truncated'])
    notes=class_element(fragment,'feed-text-note','p')
    assert len(notes)==1 and notes[0][2]==escaped(expected_note),(name,identity,'List status/truncation note mismatch')
    assert attr(notes[0][1],'data-text-status')==metadata['text_status'],(name,identity,'List raw status mismatch')
    assert not class_element(anchor_body,'feed-text-note'),(name,identity,'Status note must be outside the text anchor')
    assert len(snippet)<=PREVIEW_LIMIT if snippet is not None else True
    assert bool(metadata['text_truncated'])==(full is not None and len(full)>PREVIEW_LIMIT)

def check_url(item):
    i,url=item
    counts=Counter();links=set()
    name=url.removeprefix(origin+'/') or 'index.html'
    assert name in htmlfiles,(name,'HTML missing')
    # Preserve captured CR/LF bytes rather than normalizing source text on read.
    text=(OUT/name).read_bytes().decode('utf-8')
    assert re.findall(r'<link rel="canonical" href="([^"]+)">',text)==[escaped(url)],name
    for value in ('G-2ZYSF0173P','GTM-NV2WWQXB','ca-pub-9767176956440077','9f3423bb0d034d91bbe1a12afeff2429','googletagmanager.com/ns.html?id=GTM-NV2WWQXB'):
        assert value in text,(name,value)
    assert 'https://nanalab.kr/apps/' in text and 'content="noindex' not in text
    assert "if(!['nanalab.kr','www.nanalab.kr','nanacompany.github.io'].includes(location.hostname.toLowerCase()))return;" in text
    page_match=re.search(r'id="page-config">(.*?)</script>',text,re.S)
    feed_match=re.search(r'id="feed-config">(.*?)</script>',text,re.S)
    assert page_match and feed_match,name
    assert '<' not in page_match[1] and '<' not in feed_match[1],(name,'Unescaped script JSON')
    cfg=json.loads(page_match[1]);fcfg=json.loads(feed_match[1])
    assert cfg['origin']==origin and cfg['name']==app['name']
    assert fcfg['allowText'] is True and fcfg['listTextOnly'] is True and fcfg['autoEmbeds'] is False
    assert fcfg['archiveMenuUrl']==prefix+'archive-menu.html'
    assert 'id="archive-toggle"' in text and 'id="archive-panel"' in text and prefix+'feed.js?' in text
    metadata=[]
    for raw in FEED_DATA.findall(text):
        assert '<' not in raw,(name,'Unescaped feed JSON')
        metadata.append(json.loads(raw))
    ids=[r['id'] for r in metadata]
    assert len(ids)==len(set(ids)),(name,'Duplicate list records')
    records=list(FEED_RECORD.finditer(text))
    assert len(records)==len(metadata),(name,'Record markup/data count mismatch')
    for match,row in zip(records,metadata):
        assert attr(match['attrs'],'data-feed-id')==row['id'] and attr(match['attrs'],'data-post-id')==row['id']
        inside=FEED_DATA.findall(match['body']);assert len(inside)==1 and json.loads(inside[0])==row
        check_record(match['body'],row,name)
        counts['list_records']+=1
        if not isinstance(row['text'],str) or not row['text'].strip():counts['list_fallbacks']+=1
        if row['text_truncated']:counts['truncated_previews']+=1
    selected=cfg.get('records',[])
    for row in selected:assert row==previews[row['id']],(name,row['id'],'Page config contains full or incorrect text')
    if cfg['kind']=='post':
        counts['post_pages']+=1
        assert len(selected)==1 and name=='posts/'+selected[0]['id'].replace(':','-')+'.html'
        assert not metadata,(name,'Detail page must not contain feed cards')
        assert 'data-action="copy"' in text and 'data-action="share"' in text
        assert len(class_element(text,'embed-slot','div'))==1
        assert 'data-action="preview"' in text,(name,'Original embed retry removed')
        identity=selected[0]['id'];entry=texts.get(identity);full=entry['text'] if entry is not None else None
        blocks=class_element(text,'post-text')
        assert len(blocks)==1,(name,'Expected exactly one captured full-text or missing-text block')
        tag,attrs,body=blocks[0]
        if isinstance(full,str) and full.strip():
            assert tag=='div' and attr(attrs,'dir')=='auto' and 'post-text-unavailable' not in attr(attrs,'class').split()
            assert body==escaped(full),(name,'Full text or HTML escaping differs from overlay')
            assert hashlib.sha256(html.unescape(body).encode('utf-8')).hexdigest()==entry['sha256'],(name,'Rendered full-body hash mismatch')
            counts['full_text_pages']+=1
        else:
            assert tag=='p' and 'post-text-unavailable' in attr(attrs,'class').split() and body==escaped(DETAIL_FALLBACK),(name,'Missing/empty text must use exact fallback')
            counts['detail_fallbacks']+=1
        status=entry['status'] if entry is not None else 'unavailable'
        source=entry['source_url'] if entry is not None else None
        visible_note(text,note_for(full,status),status,source)
    elif cfg['kind']=='month':
        counts['month_pages']+=1
        assert len(selected)==min(50,len(months[cfg['month']])) and set(ids)=={r['id'] for r in selected}
        assert set(ids)<=months[cfg['month']] and 'id="shuffle"' in text
    elif cfg['kind']=='day':
        counts['day_pages']+=1
        assert set(ids)==days[Path(name).stem]
        assert ids==[identity for identity in month_order[Path(name).stem[:7]] if byid[identity]['published_date']==Path(name).stem]
    if name=='index.html':
        assert ids==feed['popular_ids']+feed['latest_ids'][:feed['page_size']]
        assert '<h2>Most liked posts</h2>' in text and '<h2>Latest posts</h2>' in text
        assert bool(app.get('photo'))==bool(re.search(r'<img class="portrait"',text))
    elif name.startswith('feed/'):
        counts['feed_pages']+=1;number=int(Path(name).stem.rsplit('-',1)[1])
        assert ids==feed['latest_ids'][(number-1)*feed['page_size']:number*feed['page_size']]
    if cfg['kind']!='post':
        assert not class_element(text,'feed-embed') and not class_element(text,'embed-slot'),(name,'List-page embed slot present')
        assert not re.search(r'<button\b[^>]*\bdata-(?:feed-)?action="(?:embed|preview)"',text),(name,'List-page embed button present')
        for attrs in re.findall(r'<iframe\b([^>]*)>',text):
            assert urlsplit(attr(attrs,'src') or '').hostname not in SOCIAL_HOSTS,(name,'List-page social iframe present')
    if name!='index.html':assert not re.search(r'id="archive-panel-body" data-archive-menu><section class="year-group"',text),'Full year menu duplicated across archive'
    links.update(html.unescape(x) for x in re.findall(r'(?:href|src)="([^"]+)"',text))
    if i%20000==0:print(json.dumps(dict(checked=i,total=len(urls))),flush=True)
    return counts,links

totals=Counter();links=set()
with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    for counts,found in pool.map(check_url,enumerate(urls,1)):
        totals.update(counts);links.update(found)

# The shuffle JSON must carry the exact same bounded projection as SSR lists.
for month,identities in month_order.items():
    path=OUT/'data'/('month-'+month+'.json')
    emitted=json.loads(path.read_text(encoding='utf-8'))
    assert emitted==[previews[identity] for identity in identities],(month,'Month data differs from preview overlay projection')
for link in links:
    u=urlsplit(link)
    if u.netloc and u.netloc!='nanalab.kr':continue
    if not u.path.startswith(prefix):continue
    name=unquote(u.path.removeprefix(prefix)) or 'index.html'
    assert name in allfiles,(link,'Broken internal link')
assert totals['post_pages']==len(rows) and totals['month_pages']==len(months) and totals['day_pages']==len(days)
assert totals['feed_pages']==feed['html_feed_pages']
nonempty=sum(bool(t['text'].strip()) for t in texts.values())
assert totals['full_text_pages']==nonempty and totals['detail_fallbacks']==len(rows)-nonempty
report=dict(status='passed',slug=app['slug'],posts=len(rows),html_pages=len(urls),feed_pages=totals['feed_pages'],popular_count=feed['popular_count'],known_like_counts=feed['known_like_counts'],unknown_like_counts=feed['unknown_like_counts'],monthly_sample_correct=True,day_lists_complete=True,exact_ids_dates=True,four_tags_every_html=True,gtm_noscript_every_html=True,canonical_and_local_links=True,feed_source_records_matched=True,latest_order_and_unique=True,archive_menu_every_page=True,portrait_verified=bool(app.get('photo')),original_metadata_text_still_null=True,text_overlay_sha256_verified=True,text_first_ssr_every_list=True,preview_limit_codepoints=PREVIEW_LIMIT,preview_metadata_independently_matched=True,full_text_independently_matched=True,html_escaping_verified=True,full_text_pages=totals['full_text_pages'],detail_fallback_pages=totals['detail_fallbacks'],list_records_checked=totals['list_records'],list_fallbacks_checked=totals['list_fallbacks'],truncated_previews_checked=totals['truncated_previews'],list_embeds_absent=True,detail_embeds_preserved=True,text_overlay_records=len(texts),text_overlay_missing_records=len(rows)-len(texts),read_workers=WORKERS,rights_boundary='Exact captured source text is verified; this checker does not independently establish copyright permission or source-display completeness.')
(ROOT/'evidence/static-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report),flush=True)
