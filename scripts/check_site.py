"""Exhaustive source-backed static checks for feed, navigation and integrations."""
from pathlib import Path
from collections import defaultdict
from datetime import datetime,timezone
from urllib.parse import urlsplit,unquote
import hashlib,html,json,re,xml.etree.ElementTree as ET
from home_feed import eligible
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs'
app=json.loads((ROOT/'APP.json').read_text(encoding='utf-8'));rows=json.loads((ROOT/'data/posts.json').read_text(encoding='utf-8'))
byid={r['id']:r for r in rows};assert len(rows)==len(byid)>0
proof_file=ROOT/'data/classification-evidence.json';proofs=json.loads(proof_file.read_text(encoding='utf-8')) if proof_file.exists() else None
days=defaultdict(set);months=defaultdict(set)
for row in rows:
 assert row['text'] is None and isinstance(row['post_id'],str)
 if eligible(row):days[row['published_date']].add(row['id']);months[row['published_date'][:7]].add(row['id'])
 u=urlsplit(row['original_url']);assert u.scheme=='https' and not u.username and not u.password
 if row['platform']=='x':
  assert u.hostname in ('x.com','twitter.com','www.twitter.com','www.x.com')
  assert u.path.lower()==f'/{app["handle"]}/status/{row["post_id"]}'.lower()
  if int(row['post_id'])>100000000000:
   milliseconds=(int(row['post_id'])>>22)+1288834974657
   got=datetime.fromisoformat(row['published_at'].replace('Z','+00:00')).timestamp()
   assert abs(milliseconds/1000-got)<.0011
  assert row['published_at'][:10]==row['published_date']
 else:assert row['published_at'] is None and row['date_precision']=='day'
 assert row.get('like_count') is None or isinstance(row['like_count'],int) and not isinstance(row['like_count'],bool) and row['like_count']>=0
 if proofs:
  p=proofs[row['id']];assert row['is_repost'] is False and row['author_verified'] is True and p['retweet_header'] is False
  assert all(p[k].lower()==app['handle'].lower() for k in ('permalink_author','username_author','item_author'))
  assert p['classification']==row['post_kind']
  if row['post_kind']=='quote':assert p['quote_has_authored_content']
if app.get('photo'):
 credit=json.loads((ROOT/'src/assets/portrait-credit.json').read_text(encoding='utf-8'))
 assert hashlib.sha256((OUT/app['portrait']).read_bytes()).hexdigest()==credit['sha256']
 license_url=credit['license_url'];license_name=credit['license'].lower()
 assert license_url.startswith('https://creativecommons.org/') or ('public domain' in license_name and (license_url.startswith('https://commons.wikimedia.org/wiki/Template:PD-USGov') or license_url=='https://www.copyright.gov/title17/92chap1.html#105'))
 assert credit['source'].startswith('https://commons.wikimedia.org/wiki/File:') and credit['creator'] and credit['modifications']
index=ET.parse(OUT/'sitemap.xml');refs=[e.text for e in index.findall('.//{*}sitemap/{*}loc')];urls=[]
for ref in refs:
 f=OUT/ref.removeprefix(app['origin']+'/');assert f.is_file() and f.stat().st_size<50_000_000
 tree=ET.parse(f);assert tree.getroot().tag.endswith('urlset')
 locs=[e.text for e in tree.findall('.//{*}url/{*}loc')];assert len(locs)<=50000;urls+=locs
assert len(urls)==len(set(urls))
allfiles={f.relative_to(OUT).as_posix() for f in OUT.rglob('*') if f.is_file()}
htmlfiles={f for f in allfiles if f.endswith('.html')};assert len(urls)==len(htmlfiles)
prefix='/'+app['slug']+'/';links=set();post_pages=month_pages=day_pages=feed_pages=0
feed=json.loads((ROOT/'evidence/feed-build.json').read_text(encoding='utf-8'))
known=sorted([r for r in rows if eligible(r) and r.get('like_count') is not None],key=lambda r:(r['like_count'],r.get('published_at') or r['published_date'],r['id']),reverse=True)[:100]
assert feed['popular_ids']==[r['id'] for r in known] and len(known)<=100
latest=sorted([r for r in rows if eligible(r) and r['id'] not in set(feed['popular_ids'])],key=lambda r:(r.get('published_at') or r['published_date'],r['id']),reverse=True)
assert feed['latest_ids']==[r['id'] for r in latest] and not feed['duplicate_popular_latest']
pattern=re.compile(r'<script type="application/json" class="feed-record-data">(.*?)</script>',re.S)
for i,url in enumerate(urls,1):
 name=url.removeprefix(app['origin']+'/') or 'index.html';assert name in htmlfiles
 text=(OUT/name).read_text(encoding='utf-8')
 assert re.findall(r'<link rel="canonical" href="([^"]+)">',text)==[html.escape(url,quote=True)]
 for value in ('G-2ZYSF0173P','GTM-NV2WWQXB','ca-pub-9767176956440077','9f3423bb0d034d91bbe1a12afeff2429','googletagmanager.com/ns.html?id=GTM-NV2WWQXB'):
  assert value in text,(name,value)
 assert 'https://nanalab.kr/apps/' in text and 'content="noindex' not in text
 assert "if(!['nanalab.kr','www.nanalab.kr','nanacompany.github.io'].includes(location.hostname.toLowerCase()))return;" in text
 cfg=json.loads(re.search(r'id="page-config">(.*?)</script>',text,re.S)[1]);assert cfg['origin']==app['origin'] and cfg['name']==app['name']
 fcfg=json.loads(re.search(r'id="feed-config">(.*?)</script>',text,re.S)[1]);assert fcfg['allowText'] is False and fcfg['archiveMenuUrl']==prefix+'archive-menu.html'
 assert f'id="archive-toggle"' in text and f'id="archive-panel"' in text and prefix+'feed.js?' in text
 metadata=[json.loads(m) for m in pattern.findall(text)]
 for row in metadata:
  expected={**byid[row['id']], 'permalink':app['origin']+'/posts/'+row['id']+'.html'};assert row==expected,(name,row['id'],'feed metadata mismatch')
 ids=[r['id'] for r in metadata];assert len(ids)==len(set(ids)),name
 selected=cfg.get('records',[])
 for row in selected:assert row==byid[row['id']]
 if cfg['kind']=='post':
  post_pages+=1;assert len(selected)==1 and name=='posts/'+selected[0]['id']+'.html'
  assert 'data-action="copy"' in text and 'data-action="share"' in text
 elif cfg['kind']=='month':
  month_pages+=1;assert len(selected)==min(50,len(months[cfg['month']])) and set(ids)=={r['id'] for r in selected}
  assert set(ids)<=months[cfg['month']] and 'id="shuffle"' in text
 elif cfg['kind']=='day':
  day_pages+=1;assert set(ids)==days[Path(name).stem]
 if name=='index.html':
  assert ids==feed['popular_ids']+feed['latest_ids'][:feed['page_size']]
  assert '<h2>Most liked posts</h2>' in text and '<h2>Latest posts</h2>' in text
  assert bool(app.get('photo'))==bool(re.search(r'<img class="portrait"',text))
 elif name.startswith('feed/'):
  feed_pages+=1;number=int(Path(name).stem.rsplit('-',1)[1]);assert ids==feed['latest_ids'][(number-1)*feed['page_size']:number*feed['page_size']]
 if name!='index.html':assert not re.search(r'id="archive-panel-body" data-archive-menu><section class="year-group"',text),'Full year menu duplicated across archive'
 links.update(html.unescape(x) for x in re.findall(r'(?:href|src)="([^"]+)"',text))
 if i%20000==0:print(json.dumps(dict(checked=i,total=len(urls))),flush=True)
for link in links:
 u=urlsplit(link)
 if u.netloc and u.netloc!='nanalab.kr':continue
 if not u.path.startswith(prefix):continue
 name=unquote(u.path.removeprefix(prefix)) or 'index.html';assert name in allfiles,(link,'broken link')
assert post_pages==len(rows) and month_pages==len(months) and day_pages==len(days) and feed_pages==feed['html_feed_pages']
report=dict(status='passed',slug=app['slug'],posts=len(rows),html_pages=len(urls),feed_pages=feed_pages,popular_count=feed['popular_count'],known_like_counts=feed['known_like_counts'],unknown_like_counts=feed['unknown_like_counts'],monthly_sample_correct=True,day_lists_complete=True,exact_ids_dates=True,four_tags_every_html=True,gtm_noscript_every_html=True,canonical_and_local_links=True,feed_source_records_matched=True,latest_order_and_unique=True,archive_menu_every_page=True,portrait_verified=bool(app.get('photo')),public_uncleared_bodies=False)
(ROOT/'evidence/static-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report),flush=True)
