"""Static home/feed HTML; bodies remain official platform embeds unless cleared."""
from pathlib import Path
from collections import Counter
from urllib.parse import urlsplit
import html,json,re

H=lambda v:html.escape(str(v),quote=True)
PAGE_SIZE=20
def json_html(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
def eligible(row):
 return row.get('is_repost') is not True and row.get('kind') not in ('repost','retweet') and row.get('post_kind') not in ('repost','retweet')
def prepared(row,app):
 data=dict(row);data['permalink']=app['origin']+'/posts/'+row['id'].replace(':','-')+'.html'
 count=data.get('like_count');assert count is None or isinstance(count,int) and not isinstance(count,bool) and count>=0
 assert data.get('text') is None,'Uncleared body must not be copied into the feed'
 return data
def record(row,app):
 data=prepared(row,app);prefix='/'+app['slug']+'/'
 when=row.get('published_at') or row['published_date'];clock=when[11:19]+' UTC' if row.get('published_at') else 'Time not provided'
 count=row.get('like_count');likes=f'{count:,} likes' if count is not None else 'Likes unavailable'
 kind=row.get('post_kind') or row.get('kind') or 'post'
 return f'<li class="feed-record archive-record" data-feed-id="{H(row["id"])}" data-post-id="{H(row["id"])}"><div class="feed-meta"><time datetime="{H(when)}">{row["published_date"]} · {clock}</time><span class="feed-likes">{H(likes)}</span></div><div class="feed-embed" data-feed-embed><p class="feed-loading">Loading original post…</p></div><div class="feed-actions"><button type="button" data-feed-action="embed">Load original post</button><a href="{H(data["permalink"])}">View post</a><a href="{H(row["original_url"])}" target="_blank" rel="noopener noreferrer">Original ↗</a></div><script type="application/json" class="feed-record-data">{json_html(data)}</script></li>'
def config(app):
 return '<script type="application/json" id="feed-config">'+json_html(dict(base='/'+app['slug']+'/',origin=app['origin'],name=app['name'],handle=app['handle'],xHandles=app.get('x_handles',[app['handle']]),autoEmbeds=True,allowText=False,archiveMenuUrl='/'+app['slug']+'/archive-menu.html'))+'</script>'
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
 portrait=f'<img class="portrait" src="{prefix}{H(app["portrait"])}" width="150" height="188" alt="{H(app["subject"])}" fetchpriority="high"><a class="photo-credit" href="{prefix}sources.html">Photo credit</a>' if app.get('photo') else '<a class="portrait-original-link" href="'+H(app['profile'])+'">Profile photo appears in original X posts below.</a>'
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
 feed_audit=dict(status='passed',posts_considered=len(rows),known_like_counts=len(known),unknown_like_counts=len(rows)-len(known),popular_ids=[r['id'] for r in popular],popular_count=len(popular),latest_count=len(latest),latest_ids=[r['id'] for r in latest],page_size=PAGE_SIZE,html_feed_pages=len(chunks),home_latest_count=len(chunks[0]) if chunks else 0,duplicate_popular_latest=bool(pinned&{r['id'] for r in latest}),like_policy='Known source snapshot integers only; null is not zero. Ties use newest collected time.',body_policy='Original platform embeds load automatically. Uncleared post bodies are not redistributed. Separate local TXT archive is outside the public repository.')
 (root/'evidence/feed-build.json').write_text(json.dumps(feed_audit,indent=2)+'\n',encoding='utf-8')
 return feed_audit
