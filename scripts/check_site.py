from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit,unquote
import hashlib,html,json,re,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs'
app=json.loads((ROOT/'APP.json').read_text(encoding='utf-8'));rows=json.loads((ROOT/'data/posts.json').read_text(encoding='utf-8'))
by_id={r['id']:r for r in rows};days=defaultdict(set);months=defaultdict(set)
for row in rows:
    assert row['text'] is None
    assert isinstance(row['post_id'],str)
    days[row['published_date']].add(row['id']);months[row['published_date'][:7]].add(row['id'])
    u=urlsplit(row['original_url']);assert u.scheme=='https' and not u.username and not u.password
    if row['platform']=='x':
        assert u.hostname in ('x.com','twitter.com','www.twitter.com','www.x.com')
        assert u.path.lower()==f'/{app["handle"]}/status/{row["post_id"]}'.lower()
        if int(row['post_id'])>100000000000:
            expected=((int(row['post_id'])>>22)+1288834974657)/1000
            got=datetime.fromisoformat(row['published_at'].replace('Z','+00:00')).timestamp()
            assert abs(expected-got)<.0011,(row['id'],'timestamp mismatch')
        assert row['published_at'][:10]==row['published_date']
    else:
        assert row['published_at'] is None and row['date_precision']=='day'
        assert u.hostname in ('www.facebook.com','www.threads.net','www.threads.com','www.instagram.com')
assert len(by_id)==len(rows)
if app['slug']=='tibo-says':assert app['handle']=='thsottiaux' and app['subject']=='Thibault Sottiaux'
if app['photo']:
    credit=json.loads((ROOT/'src/assets/portrait-credit.json').read_text(encoding='utf-8'))
    assert hashlib.sha256((OUT/'assets/portrait.jpg').read_bytes()).hexdigest()==credit['sha256']
    assert credit['license_url'].startswith('https://creativecommons.org/licenses/')

index=ET.parse(OUT/'sitemap.xml');refs=[e.text for e in index.findall('.//{*}sitemap/{*}loc')];urls=[]
for ref in refs:
    f=OUT/ref.removeprefix(app['origin']+'/');assert f.is_file() and f.stat().st_size<50_000_000
    xml=ET.parse(f);assert xml.getroot().tag.endswith('urlset')
    locs=[e.text for e in xml.findall('.//{*}url/{*}loc')];assert len(locs)<=50000;urls+=locs
assert len(urls)==len(set(urls))
prefix='/'+app['slug']+'/'
all_files={str(f.relative_to(OUT)).replace('\\','/') for f in OUT.rglob('*') if f.is_file()}
html_files={f for f in all_files if f.endswith('.html')};assert len(html_files)==len(urls)
internal_links=set();post_pages=0;month_pages=0;day_pages=0
for i,url in enumerate(urls,1):
    relative=url.removeprefix(app['origin']+'/');filename=relative or 'index.html'
    assert filename in html_files,(url,'HTML missing')
    text=(OUT/filename).read_text(encoding='utf-8')
    assert f'<link rel="canonical" href="{html.escape(url,quote=True)}">' in text,url
    for identity in ('G-2ZYSF0173P','GTM-NV2WWQXB','ca-pub-9767176956440077','9f3423bb0d034d91bbe1a12afeff2429','https://www.googletagmanager.com/ns.html?id=GTM-NV2WWQXB'):
        assert identity in text,(url,identity)
    assert 'https://nanalab.kr/apps/' in text and 'content="noindex' not in text
    assert "if(!['nanalab.kr','www.nanalab.kr','nanacompany.github.io'].includes(location.hostname.toLowerCase()))return;" in text
    match=re.search(r'<script type="application/json" id="page-config">(.*?)</script>',text,re.S);assert match,url
    config=json.loads(match[1]);assert config['origin']==app['origin'] and config['name']==app['name']
    selected=config.get('records',[]);ids=[r['id'] for r in selected]
    assert len(ids)==len(set(ids))
    for record in selected:assert record==by_id[record['id']],(url,'record mismatch')
    if config['kind']=='post':
        post_pages+=1;assert len(selected)==1 and filename=='posts/'+selected[0]['id']+'.html'
        assert 'data-action="copy"' in text and 'data-action="share"' in text
        if selected[0]['published_at'] is None:assert 'Time not provided' in text
        if app['slug']!='zuckerberg-says':assert 'Archive record ' not in text
    elif config['kind']=='month':
        month_pages+=1;assert len(selected)==min(50,len(months[config['month']]))
        assert set(ids)<=months[config['month']]
        assert set(re.findall(r'data-post-id="([^"]+)"',text))==set(ids)
        assert 'id="shuffle"' in text
    elif config['kind']=='day':
        day_pages+=1;day=Path(relative).stem;assert set(ids)==days[day]
        assert set(re.findall(r'data-post-id="([^"]+)"',text))==set(ids)
    elif filename=='index.html':
        assert not selected and 'data-post-id=' not in text
        assert len(re.findall(r'class="year-group"',text))==len({m[:4] for m in months})
    internal_links.update(html.unescape(x) for x in re.findall(r'(?:href|src)="([^"]+)"',text))
    if i%15000==0:print(json.dumps({'checked':i,'total':len(urls)}),flush=True)
for link in internal_links:
    u=urlsplit(link)
    if u.netloc and u.netloc!='nanalab.kr':continue
    if not u.path.startswith(prefix):continue
    relative=unquote(u.path.removeprefix(prefix)) or 'index.html'
    assert relative in all_files,(link,'broken internal link')
assert post_pages==len(rows) and month_pages==len(months) and day_pages==len(days)
report=dict(status='passed',slug=app['slug'],posts=len(rows),html_pages=len(urls),month_pages=month_pages,day_pages=day_pages,source_rows_matched=True,four_tags_every_html=True,gtm_noscript_every_html=True,clock_times_not_invented=True,exact_x_ids_and_times=True,monthly_sample_correct=True,day_lists_complete_for_collected_data=True,canonical_and_local_links=True,source_bodies_redistributed=False,source_dates=[rows[-1]['published_date'],rows[0]['published_date']])
(ROOT/'evidence/static-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report),flush=True)
