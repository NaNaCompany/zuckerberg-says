"""Static text-first lists; source text and original embeds coexist on detail pages."""
from pathlib import Path
from collections import Counter
from urllib.parse import urlsplit
import hashlib,html,json,re

H=lambda value:html.escape(str(value),quote=True)
PAGE_SIZE=20
TEXT_PREVIEW_LIMIT=800


def json_html(value):
 return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')


def eligible(row):
 return row.get('is_repost') is not True and row.get('kind') not in ('repost','retweet') and row.get('post_kind') not in ('repost','retweet')


def source_url(value):
 if value is None:return None
 assert isinstance(value,str)
 parsed=urlsplit(value)
 assert parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password,'Unsafe text source URL'
 return value


def source_entry(row,texts):
 entry=texts.get(row['id'])
 if entry is None:return None
 assert isinstance(entry,dict) and isinstance(entry.get('text'),str),'Invalid text overlay entry'
 assert isinstance(entry.get('status'),str) and entry['status'],'Text status missing'
 assert hashlib.sha256(entry['text'].encode('utf-8')).hexdigest()==entry['sha256'],'Text overlay hash mismatch'
 source_url(entry.get('source_url'))
 return entry


def preview_row(row,texts):
 """Return an ephemeral list record; never mutate the original metadata corpus."""
 data=dict(row);entry=source_entry(row,texts)
 full=entry['text'] if entry is not None else None
 shortened=isinstance(full,str) and len(full)>TEXT_PREVIEW_LIMIT
 data.update(text=full[:TEXT_PREVIEW_LIMIT-1]+'…' if shortened else full,
             text_status=entry['status'] if entry is not None else 'unavailable',
             text_source=entry.get('source_url') if entry is not None else None,
             text_truncated=shortened)
 return data


def text_note(row,preview=True):
 text=row.get('text');status=row.get('text_status','unavailable')
 if not isinstance(text,str) or not text.strip():note='Source text unavailable.'
 elif 'description' in status:note='Official original-page description; not a full post transcript.'
 elif 'partial' in status or 'truncated' in status:note='Partial source text; the original may contain more.'
 else:note='Captured source text.'
 if preview and row.get('text_truncated'):note+=' Preview shortened to 800 characters. Open the post for the complete captured text.'
 return note


def detail_text_html(row,texts):
 entry=source_entry(row,texts)
 full=entry['text'] if entry is not None else None
 status=entry['status'] if entry is not None else 'unavailable'
 source=source_url(entry.get('source_url')) if entry is not None else None
 display=dict(text=full,text_status=status,text_truncated=False)
 body=f'<div class="post-text" dir="auto">{H(full)}</div>' if isinstance(full,str) and full.strip() else '<p class="post-text post-text-unavailable">Source text unavailable. Open the original post below.</p>'
 provenance=(f' <a href="{H(source)}" target="_blank" rel="noopener noreferrer">Text source</a>.' if source else '')
 return '<section class="post-source-text" aria-label="Source text">'+body+f'<p class="post-text-note" data-text-status="{H(status)}">{H(text_note(display,preview=False))}{provenance}</p></section>'


def prepared(row,app):
 data=dict(row);data['permalink']=app['origin']+'/posts/'+row['id'].replace(':','-')+'.html'
 count=data.get('like_count');assert count is None or isinstance(count,int) and not isinstance(count,bool) and count>=0
 text=data.get('text');assert text is None or isinstance(text,str) and len(text)<=TEXT_PREVIEW_LIMIT,'List preview exceeds 800 codepoints'
 assert isinstance(data.get('text_status'),str) and isinstance(data.get('text_truncated'),bool)
 source_url(data.get('text_source'))
 return data


def record(row,app):
 data=prepared(row,app)
 when=row.get('published_at') or row['published_date'];clock=when[11:19]+' UTC' if row.get('published_at') else 'Time not provided'
 count=row.get('like_count');likes=f'{count:,} likes' if count is not None else 'Likes unavailable'
 text=row.get('text');body=text if isinstance(text,str) and text.strip() else 'Source text unavailable. Open the post to view the original.'
 return f'<li class="feed-record archive-record" data-feed-id="{H(row["id"])}" data-post-id="{H(row["id"])}"><div class="feed-meta"><time datetime="{H(when)}">{row["published_date"]} · {clock}</time><span class="feed-likes">{H(likes)}</span></div><a class="feed-text-link detail-link" href="{H(data["permalink"])}"><p class="feed-text feed-text-body" dir="auto">{H(body)}</p><span class="feed-read-more">View post →</span></a><p class="feed-text-note" data-text-status="{H(row["text_status"])}">{H(text_note(row))}</p><script type="application/json" class="feed-record-data">{json_html(data)}</script></li>'


def config(app):
 data=dict(base='/'+app['slug']+'/',origin=app['origin'],name=app['name'],handle=app['handle'],xHandles=app.get('x_handles',[app['handle']]),autoEmbeds=False,allowText=True,listTextOnly=True,archiveMenuUrl='/'+app['slug']+'/archive-menu.html')
 return '<script type="application/json" id="feed-config">'+json_html(data)+'</script>'


def panel(app,grids):
 fallback=f'<p><a href="/{app["slug"]}/archive-menu.html">Browse all years and months</a></p>'
 return f'<button type="button" id="archive-toggle" aria-controls="archive-panel" aria-expanded="false">Archive</button><noscript>{fallback}</noscript><aside id="archive-panel" aria-labelledby="archive-panel-title" hidden><div class="archive-panel-heading"><h2 id="archive-panel-title">Browse by year and month</h2><button type="button" id="archive-close" aria-label="Close archive">Close</button></div><div class="archive-panel-body" id="archive-panel-body" data-archive-menu>{grids or fallback}</div></aside>'


def make(root,app,rows,audit,site_page,grids):
 rows=[r for r in rows if eligible(r)]
 ordered=sorted(rows,key=lambda r:(r.get('published_at') or r['published_date'],r['id']),reverse=True)
 known=[r for r in ordered if r.get('like_count') is not None]
 popular=sorted(known,key=lambda r:(r['like_count'],r.get('published_at') or r['published_date'],r['id']),reverse=True)[:100]
 pinned={r['id'] for r in popular};latest=[r for r in ordered if r['id'] not in pinned]
 prefix='/'+app['slug']+'/'
 chunks=[latest[i:i+PAGE_SIZE] for i in range(0,len(latest),PAGE_SIZE)]
 def list_html(records):return ''.join(record(r,app) for r in records)
 def next_html(index):
  if index+1>=len(chunks):return '<p id="feed-status" role="status">All collected posts are shown.</p><div id="feed-sentinel" aria-hidden="true"></div>'
  return f'<a id="feed-next" href="{prefix}feed/latest-{index+2:04d}.html" rel="next">Load more posts</a><p id="feed-status" role="status"></p><div id="feed-sentinel" aria-hidden="true"></div>'
 portrait=f'<img class="portrait" src="{prefix}{H(app["portrait"])}" width="150" height="188" alt="{H(app["subject"])}" fetchpriority="high"><a class="photo-credit" href="{prefix}sources.html">Photo credit</a>' if app.get('photo') else '<a class="portrait-original-link" href="'+H(app['profile'])+'">Profile photo appears in original X embeds on post pages.</a>'
 portrait_block=f'<div class="feed-portrait">{portrait}</div>' if app.get('photo') else ''
 missing_note='' if app.get('photo') else '<p class="hint">'+portrait+'</p>'
 hero=f'<section class="feed-hero hero"><div class="identity">{portrait_block}<div class="feed-person"><h1>{H(app["name"])}</h1><p class="subject">{H(app["subject"])} · <a href="{H(app["profile"])}">@{H(app["handle"])}</a></p>{missing_note}<p class="feed-coverage feed-summary">{len(rows):,} collected posts · {audit["first"]} — {audit["last"]}<br>Partial snapshot · Original language · <a href="{prefix}sources.html">Sources & coverage</a></p></div></div></section>'
 popular_note='Up to 100 collected posts with known like counts, highest first. Counts are source snapshots, not live totals. Use Archive to browse by year and month.' if popular else 'This source does not provide verified like counts. Collected posts are shown newest first below.'
 top=f'<section id="popular" class="feed-section"><h2>Most liked posts</h2><p class="hint">{popular_note}</p><ol id="popular-records" class="feed-records">{list_html(popular)}</ol></section>'
 recent=f'<section id="latest" class="feed-section"><h2>Latest posts</h2><p class="hint">Newest collected posts first. Posts already shown above are skipped.</p><ol id="latest-records" class="feed-records" data-feed-items>{list_html(chunks[0]) if chunks else ""}</ol>{next_html(0)}</section>'
 site_page(app['name'],hero+top+recent,'','feed',dict(feed=True))
 site_page('Browse by year and month','<section class="sources"><h1>Browse by year and month</h1><div id="archive-menu-content" data-archive-months>'+''.join(grids)+'</div></section>','archive-menu.html')
 for index,chunk in enumerate(chunks):
  navigation=f'<nav class="breadcrumb"><a href="{prefix}">Home</a> / Latest posts / Page {index+1}</nav>'
  previous=f'<a rel="prev" href="{prefix}feed/latest-{index:04d}.html">Previous page</a>' if index else f'<a rel="prev" href="{prefix}#latest">Home</a>'
  content=f'<section class="sources feed-section">{navigation}<h1>Latest posts · Page {index+1}</h1><ol id="latest-records" class="feed-records" data-feed-items>{list_html(chunk)}</ol>{previous}{next_html(index)}</section>'
  site_page(app['subject']+' latest posts · Page '+str(index+1),content,'feed/latest-'+str(index+1).zfill(4)+'.html','feed',dict(feed=True))
 feed_audit=dict(status='passed',posts_considered=len(rows),known_like_counts=len(known),unknown_like_counts=len(rows)-len(known),popular_ids=[r['id'] for r in popular],popular_count=len(popular),latest_count=len(latest),latest_ids=[r['id'] for r in latest],page_size=PAGE_SIZE,html_feed_pages=len(chunks),home_latest_count=len(chunks[0]) if chunks else 0,duplicate_popular_latest=bool(pinned&{r['id'] for r in latest}),like_policy='Known source snapshot integers only; null is not zero. Ties use newest collected time.',body_policy='Text-first lists show up to 800 original-language source codepoints. Detail pages contain the captured source text plus the original platform embed. Missing, partial and official-description statuses remain explicit. No translated or reconstructed source text is added.',list_text_only=True,auto_embeds=False,preview_codepoints=TEXT_PREVIEW_LIMIT)
 (root/'evidence/feed-build.json').write_text(json.dumps(feed_audit,indent=2)+'\n',encoding='utf-8')
 return feed_audit
