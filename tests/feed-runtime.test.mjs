import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../src/feed.js',import.meta.url),'utf8');
const row=(id,date='2026-10-28T10:00:00Z',overrides={})=>({id:'x-'+id,post_id:String(id),platform:'x',author:'Example',original_url:'https://x.com/Example/status/'+id,published_at:date,published_date:date.slice(0,10),permalink:'/example-says/posts/x-'+id+'.html',like_count:5,text:null,...overrides});
const baseRows=[row('200','2026-10-28T12:00:00Z'),row('199','2026-10-28T11:00:00Z')];

function matches(el,selector){
  if(!el||el.nodeType!==1)return false;
  selector=selector.trim();
  const attributes=[...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
  selector=selector.replace(/\[[^\]]+\]/g,'');
  const id=selector.match(/#([\w-]+)/)?.[1];if(id&&el.id!==id)return false;
  const classes=[...selector.matchAll(/\.([\w-]+)/g)].map(x=>x[1]);if(classes.some(c=>!el.classList.contains(c)))return false;
  const tag=selector.match(/^[A-Za-z][\w-]*/)?.[0];if(tag&&el.tagName!==tag.toUpperCase())return false;
  return attributes.every(([,name,value])=>el.getAttribute(name)!==null&&(value===undefined||el.getAttribute(name)===value));
}
class Element{
  constructor(tag='div',doc=null,nodeType=1){this.tagName=tag.toUpperCase();this.nodeType=nodeType;this.ownerDocument=doc;this.attrs={};this.dataset={};this.children=[];this.parentNode=null;this._text='';this.className='';this.hidden=false;this.disabled=false;this.events=new Map();this.rect={top:2000,bottom:2200,height:200};this.style={};}
  get classList(){const self=this;return {contains:c=>self.className.split(/\s+/).includes(c),add:c=>{if(!self.className.split(/\s+/).includes(c))self.className=(self.className+' '+c).trim();},remove:c=>self.className=self.className.split(/\s+/).filter(x=>x!==c).join(' ')};}
  get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
  set textContent(v){this._text=String(v??'');this.children.forEach(c=>{if(typeof c==='object')c.parentNode=null;});this.children=[];}
  get isConnected(){let n=this;while(n){if(n.nodeType===9)return true;n=n.parentNode;}return false;}
  setAttribute(k,v){v=String(v);this.attrs[k]=v;if(k==='class')this.className=v;if(k==='id')this.id=v;if(k==='type')this.type=v;if(k==='href')this.href=v;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  getAttribute(k){if(k==='id')return this.id??null;if(k==='href')return this.href??null;if(k==='class')return this.className||null;if(k.startsWith('data-'))return this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??null;return this.attrs[k]??(typeof this[k]==='string'?this[k]:null);}
  removeAttribute(k){delete this.attrs[k];if(['href','type','id'].includes(k))delete this[k];}
  append(...nodes){for(const node of nodes){if(node?.nodeType===11){this.append(...[...node.children]);continue;}if(node&&typeof node==='object'){node.remove();node.parentNode=this;node.ownerDocument=this.ownerDocument;}this.children.push(node);}}
  insertBefore(node,before){node.remove();const index=this.children.indexOf(before);if(index<0){this.append(node);return;}node.parentNode=this;node.ownerDocument=this.ownerDocument;this.children.splice(index,0,node);}
  replaceChildren(...nodes){this._text='';for(const c of this.children)if(c&&typeof c==='object')c.parentNode=null;this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}}
  matches(s){return s.split(',').some(x=>matches(this,x));}
  querySelectorAll(s){const selectors=s.split(',').map(x=>x.trim());const result=[];const walk=n=>{for(const c of n.children){if(!c||typeof c!=='object')continue;if(selectors.some(x=>matches(c,x)))result.push(c);walk(c);}};walk(this);return result;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){let n=this;while(n){if(n.matches?.(s))return n;n=n.parentNode;}return null;}
  contains(el){let n=el;while(n){if(n===this)return true;n=n.parentNode;}return false;}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(fn);}
  dispatch(type,extra={}){const event={target:this,button:0,preventDefault(){this.prevented=true;},...extra};for(const fn of this.events.get(type)||[])fn(event);return event;}
  click(){let n=this;const event={target:this,button:0,preventDefault(){this.prevented=true;}};while(n){for(const fn of n.events.get('click')||[])fn(event);n=n.parentNode;}return event;}
  focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
  getBoundingClientRect(){return this.rect;}
  getClientRects(){return this.hidden?[]:[this.rect];}
}
class Document extends Element{
  constructor(){super('document',null,9);this.ownerDocument=this;this.documentElement=new Element('html',this);this.head=new Element('head',this);this.body=new Element('body',this);this.append(this.documentElement);this.documentElement.append(this.head,this.body);this.activeElement=this.body;}
  createElement(tag){return new Element(tag,this);}
  createDocumentFragment(){return new Element('fragment',this,11);}
  getElementById(id){return this.querySelector('#'+id);}
}
const make=(doc,tag,attrs={},text)=>{const e=doc.createElement(tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
function card(doc,r,{button=true}={}){
 const e=make(doc,'li',{class:'feed-record archive-record','data-feed-id':r.id});
 e.append(make(doc,'script',{class:'feed-record-data',type:'application/json'},JSON.stringify(r)),make(doc,'div',{class:'feed-embed','data-feed-embed':''}));
 const actions=make(doc,'div',{class:'feed-actions'});if(button)actions.append(make(doc,'button',{'data-feed-action':'embed'},'Load original'));e.append(actions);return e;
}
function fixturePage(rows,{page=2,next=3,canonical='https://nanalab.kr/example-says/feed/latest-'+String(page).padStart(4,'0')+'.html',extra=''}={}){
 return '<html><head><link rel="canonical" href="'+canonical+'"></head><body><ol data-feed-items>'+rows.map(r=>'<li class="feed-record" data-feed-id="'+r.id+'"><script type="application/json" class="feed-record-data">'+JSON.stringify(r).replaceAll('<','\\u003c')+'</script><img src="https://evil.example/pixel" onerror="EVIL()">'+extra+'</li>').join('')+'</ol>'+(next?'<a id="feed-next" href="/example-says/feed/latest-'+String(next).padStart(4,'0')+'.html">Next</a>':'')+'</body></html>';
}
function fixtureArchive({badHref=false,canonical='https://nanalab.kr/example-says/archive-menu.html'}={}){
 return '<html><head><link rel="canonical" href="'+canonical+'"></head><body><div id="archive-menu-content"><section class="year-group"><h3>2026</h3><nav class="year-grid"><a class="month-button" href="'+(badHref?'https://evil.example/2026-10.html':'/example-says/archive/2026-10.html')+'"><b>Oct</b><span>2</span></a><span class="month-button disabled"><b>Nov</b><span>—</span></span></nav></section></div></body></html>';
}
class Parser{
 parseFromString(text){
  const doc=new Document();
  for(const match of text.matchAll(/<link rel="canonical" href="([^"]*)"\s*\/?\s*>/g))doc.head.append(make(doc,'link',{rel:'canonical',href:match[1]}));
  if(text.includes('data-feed-items')){
   const list=make(doc,'ol',{'data-feed-items':''});doc.body.append(list);
   for(const match of text.matchAll(/<li class="feed-record" data-feed-id="([^"]*)">[\s\S]*?<script type="application\/json" class="feed-record-data">([\s\S]*?)<\/script>[\s\S]*?<\/li>/g)){
    const item=make(doc,'li',{class:'feed-record','data-feed-id':match[1]});item.append(make(doc,'script',{class:'feed-record-data',type:'application/json'},match[2]));list.append(item);
   }
  }
  const next=text.match(/<a id="feed-next" href="([^"]*)"/);if(next)doc.body.append(make(doc,'a',{id:'feed-next',href:next[1]}));
  if(text.includes('id="archive-menu-content"')){
   const source=make(doc,'div',{id:'archive-menu-content'});doc.body.append(source);
   for(const group of text.matchAll(/<section class="year-group"><h3>(\d{4})<\/h3><nav class="year-grid">([\s\S]*?)<\/nav><\/section>/g)){
    const section=make(doc,'section',{class:'year-group'});section.append(make(doc,'h3',{},group[1]));const nav=make(doc,'nav',{class:'year-grid'});section.append(nav);
    for(const month of group[2].matchAll(/<(a|span) class="month-button(?: disabled)?"(?: href="([^"]*)")?><b>([^<]+)<\/b><span>([^<]+)<\/span><\/(?:a|span)>/g)){
     const item=make(doc,month[1],{class:'month-button',...(month[2]?{href:month[2]}:{})});item.append(make(doc,'b',{},month[3]),make(doc,'span',{},month[4]));nav.append(item);
    }
    source.append(section);
   }
  }
  return doc;
 }
}
async function flush(){for(let i=0;i<15;i++)await Promise.resolve();}
function setup(options={}){
 const doc=new Document(),timers=new Map(),requests=[],ios=[],mutations=[];let timerId=0;
 const config={base:'/example-says/',origin:'https://nanalab.kr/example-says',name:'Example Says',handle:'Example',listTextOnly:true,autoEmbeds:false,allowText:true,...options.config};
 doc.body.append(make(doc,'script',{id:'feed-config',type:'application/json'},JSON.stringify(config)));
 const popular=make(doc,'ol',{id:'popular-records'}),latest=make(doc,'ol',{id:'latest-records','data-feed-items':''});
 if(!options.noFeed){doc.body.append(popular,latest);for(const r of options.popular||[])popular.append(card(doc,r));for(const r of options.initial||baseRows)latest.append(card(doc,r,{button:!options.noButton}));}
 const next=make(doc,'a',{id:'feed-next',href:'/example-says/feed/latest-0002.html'},'Load more');const status=make(doc,'p',{id:'feed-status'});const sentinel=make(doc,'div',{id:'feed-sentinel'});sentinel.rect={top:10000,bottom:10002,height:2};
 if(!options.noFeed)doc.body.append(next,status,sentinel);
 const toggle=make(doc,'button',{id:'archive-toggle'},'Archive'),panel=make(doc,'aside',{id:'archive-panel'}),close=make(doc,'button',{id:'archive-close'},'Close'),panelBody=make(doc,'div',{id:'archive-panel-body'});
 panel.hidden=true;panel.append(close,panelBody);doc.body.append(toggle,panel);
 if(options.ssrMenu)panelBody.append(make(doc,'section',{class:'year-group'}));else panelBody.append(make(doc,'a',{href:'/example-says/archive-menu.html'},'Browse all years'));
 class IO{constructor(fn){this.fn=fn;this.targets=new Set();ios.push(this);}observe(e){this.targets.add(e);}unobserve(e){this.targets.delete(e);}fire(e){this.fn([{target:e,isIntersecting:true}]);}}
 class MO{constructor(fn){this.fn=fn;mutations.push(this);}observe(){}}
 const hostname=options.hostname||'localhost',origin=hostname==='localhost'?'http://localhost:8790':'https://'+hostname;
 const context={document:doc,location:{href:origin+'/example-says/'},URL,Intl,Date,console,DOMParser:Parser,AbortController,
 setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
 fetch:async(url,opts)=>{requests.push({url,opts});if(options.fetch)return options.fetch(url,opts,requests.length);return {ok:true,url,headers:{get:()=> 'text/html'},text:async()=>fixturePage([row('198','2026-10-28T09:00:00Z')])};},
 addEventListener:(...args)=>doc.addEventListener(...args),innerHeight:812,MutationObserver:MO};
 if(options.io!==false)context.IntersectionObserver=IO;
 context.window=context;
 if(options.embed)context.twttr={widgets:{createTweet:options.embed}};
 vm.runInNewContext(code,context);
 return {doc,latest,popular,next,status,toggle,panel,close,panelBody,requests,ios,mutations,timers,context,api:context.SaysFeed};
}

test('same-origin HTML pagination appends newest records and drops pinned/seen identities',async()=>{
 const s=setup({popular:[row('300','2026-10-28T13:00:00Z')],fetch:async(url)=>({ok:true,url,headers:{get:()=> 'text/html'},text:async()=>fixturePage([row('199','2026-10-28T11:00:00Z'),row('198','2026-10-28T09:00:00Z'),row('198','2026-10-28T09:00:00Z')])})});
 assert.equal(await s.api.loadMore(),true);assert.deepEqual(s.latest.children.map(e=>e.dataset.feedId),['x-200','x-199','x-198']);assert.equal(s.requests[0].opts.headers.Accept,'text/html');assert.equal(s.requests[0].opts.cache,'no-store');assert.equal(s.next.getAttribute('href'),'http://localhost:8790/example-says/feed/latest-0003.html');
 assert.equal(s.latest.querySelectorAll('img').length,0);assert.equal(s.latest.querySelectorAll('script').length,3);assert.ok(s.latest.querySelectorAll('script').every(x=>x.type==='application/json'));
});

test('concurrent sentinel/manual loads coalesce and a failed load retains retry URL and records',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);let attempt=0;
 const s=setup({fetch:async(url)=>{attempt++;if(attempt===1)return pending;return {ok:true,url,text:async()=>fixturePage([row('198','2026-10-28T09:00:00Z')],{next:null})};}});
 const first=s.api.loadMore();assert.equal(await s.api.loadMore(),false);assert.equal(s.requests.length,1);release({ok:false});assert.equal(await first,false);assert.equal(s.latest.children.length,2);assert.match(s.next.textContent,/Retry/);assert.equal(s.requests.length,1);
 s.ios[0].fire(s.doc.querySelector('#feed-sentinel'));await flush();assert.equal(s.requests.length,1,'automatic retry storm prevented');
 assert.equal(await s.api.loadMore(),true);assert.equal(s.requests.length,2);assert.equal(s.next.hidden,true);assert.match(s.status.textContent,/End/);
});

test('pagination rejects outside URLs, canonical mismatches, cycles and out-of-order data without mutation',async()=>{
 for(const html of [fixturePage([row('198','2026-10-28T09:00:00Z')],{canonical:'https://evil.example/page'}),fixturePage([row('198','2026-10-28T09:00:00Z')],{next:2}),fixturePage([row('201','2026-10-28T14:00:00Z')]),fixturePage([row('198','2026-10-28T09:00:00Z')]).replace('/example-says/feed/latest-0003.html','https://evil.example/feed/latest-0003.html')]){
  const s=setup({fetch:async(url)=>({ok:true,url,text:async()=>html})});assert.equal(await s.api.loadMore(),false);assert.equal(s.latest.children.length,2);assert.match(s.next.textContent,/Retry/);
 }
 const s=setup();assert.throws(()=>s.api.safeFeedURL('https://evil.example/example-says/feed/latest-0002.html'));assert.throws(()=>s.api.safeFeedURL('/example-says/feed/latest-0002.html?query=x'));assert.throws(()=>s.api.safeFeedURL('/example-says-evil/feed/latest-0002.html'));
});

test('record validation rejects reposts, unsafe authors/URLs, invalid likes and uncleared bodies',()=>{
 const s=setup();
 for(const bad of [{is_repost:true},{post_kind:'retweet'},{kind:'repost'},{original_url:'https://x.com/Other/status/200'},{original_url:'javascript:alert(1)'},{original_url:'https://x.com.evil.example/Example/status/200'},{like_count:-1},{like_count:NaN},{like_count:1.5},{post_id:200},{text:'x'.repeat(801)},{published_date:'2026-02-30'},{permalink:'https://evil.example/posts/x-200.html'}])assert.throws(()=>s.api.validateRecord({...baseRows[0],...bad}),JSON.stringify(bad));
 const zero=s.api.createCard({...baseRows[0],like_count:0});assert.match(zero.querySelector('.feed-likes').textContent,/^0 likes$/);
 const unknown=s.api.createCard({...baseRows[0],like_count:null});assert.equal(unknown.querySelector('.feed-likes').textContent,'Likes unavailable');
 const approx=s.api.createCard({...baseRows[0],like_count:23000,likes_source:{count_precision:'display-rounded'}});assert.equal(approx.querySelector('.feed-likes').textContent,'~23,000 likes');
});

test('text-first lists have no platform requests or frames on production or local hosts',async()=>{
 for(const hostname of ['localhost','nanalab.kr']){
  let embeds=0;const s=setup({hostname,initial:[row('200','2026-10-28T10:00:00Z',{text:'Actual post body'}),row('199','2026-10-28T09:00:00Z',{text:null})],embed:async()=>{embeds++;return {};}});await flush();
  for(const cardElement of s.latest.children)s.ios[0].fire(cardElement);await flush();
  assert.equal(s.doc.head.children.length,0);assert.equal(s.doc.querySelectorAll('iframe').length,0);assert.equal(s.doc.querySelectorAll('[data-feed-embed]').length,0);assert.equal(s.doc.querySelectorAll('[data-feed-action="embed"]').length,0);assert.equal(embeds,0);assert.equal(s.requests.length,0);
  assert.equal(s.latest.children[0].querySelector('.feed-text').textContent,'Actual post body');assert.equal(s.latest.children[0].querySelector('.feed-text-link').href,'/example-says/posts/x-200.html');assert.match(s.latest.children[1].querySelector('.feed-text').textContent,/Source text unavailable/);
 }
});

test('hydration replaces legacy SSR embed controls with the exact text and detail link',async()=>{
 const s=setup({noFeed:true});const r=row('200','2026-10-28T10:00:00Z',{text:'First line\nSecond line @Example'});const old=card(s.doc,r);old.append(make(s.doc,'iframe',{src:'https://platform.twitter.com/old'}));s.doc.body.append(old);s.mutations[0].fn([{addedNodes:[old]}]);await flush();
 assert.equal(old.querySelectorAll('iframe').length,0);assert.equal(old.querySelectorAll('.feed-embed').length,0);assert.equal(old.querySelectorAll('[data-feed-action="embed"]').length,0);assert.equal(old.querySelectorAll('.feed-text-link').length,1);assert.equal(old.querySelector('.feed-text').textContent,r.text);assert.equal(old.querySelector('.feed-text-link').href,r.permalink);
});

test('month shuffle cards become text-only even with automatic embed config accidentally enabled',async()=>{
 let embeds=0;const s=setup({hostname:'nanalab.kr',noFeed:true,config:{autoEmbeds:true},embed:async()=>{embeds++;return {};}});const original=row('200','2026-10-28T10:00:00Z',{text:'Shuffled source text'});const e=s.api.createCard(original);s.doc.body.append(e);s.mutations[0].fn([{addedNodes:[e]}]);await flush();
 assert.equal(e.querySelector('.feed-text').textContent,original.text);assert.equal(e.querySelector('.feed-text-link').href,original.permalink);assert.equal(s.doc.querySelectorAll('iframe').length,0);assert.equal(s.doc.head.children.length,0);assert.equal(embeds,0);
});

test('the lazy observer watches pagination sentinel only, never individual text cards',()=>{
 const s=setup({hostname:'nanalab.kr'});assert.equal(s.ios[0].targets.size,1);assert.equal(s.ios[0].targets.has(s.doc.querySelector('#feed-sentinel')),true);assert.equal(s.ios[0].targets.has(s.latest.children[0]),false);
});

test('missing, empty and media-only source text have truthful linked fallbacks without invented text',()=>{
 const s=setup();for(const [text,extra]of [[null,{}],['',{}],['  \n ',{}],[null,{content_status:'media_only'}]]){
  const cardElement=s.api.createCard({...baseRows[0],text,...extra});assert.match(cardElement.querySelector('.feed-text').textContent,/Source text unavailable/);assert.equal(cardElement.querySelector('.feed-text-link').href,baseRows[0].permalink);assert.equal(cardElement.querySelector('.feed-embed'),null);
 }
});

test('all supported platforms render text links rather than platform embeds on lists',async()=>{
 const cases=[row('200','2026-10-28T10:00:00Z',{text:'X post'}),row('123','2026-10-28T10:00:00Z',{id:'truth:123',platform:'truth',original_url:'https://truthsocial.com/@realDonaldTrump/posts/123',permalink:'/example-says/posts/truth-123.html',text:'Truth post'}),row('124','2026-10-28T10:00:00Z',{id:'archive-124',platform:'facebook',original_url:'https://www.facebook.com/zuck/posts/124',permalink:'/example-says/posts/archive-124.html',text:'Facebook post'}),row('125','2026-10-28T10:00:00Z',{id:'archive-125',platform:'threads',original_url:'https://www.threads.com/@zuck/post/ABC',permalink:'/example-says/posts/archive-125.html',text:'Threads post'}),row('126','2026-10-28T10:00:00Z',{id:'archive-126',platform:'instagram',original_url:'https://www.instagram.com/p/ABC/',permalink:'/example-says/posts/archive-126.html',text:'Instagram post'})];
 const s=setup({hostname:'nanalab.kr',initial:cases});await flush();assert.deepEqual(s.latest.children.map(e=>e.querySelector('.feed-text').textContent),cases.map(r=>r.text));assert.equal(s.doc.head.children.length,0);assert.equal(s.doc.querySelectorAll('iframe').length,0);assert.equal(s.requests.length,0);
});

test('archive menu opens, traps focus, closes with Escape/outside click and restores trigger focus',()=>{
 const s=setup({ssrMenu:true});s.toggle.focus();s.toggle.click();assert.equal(s.panel.hidden,false);assert.equal(s.toggle.getAttribute('aria-expanded'),'true');assert.equal(s.doc.activeElement,s.close);assert.equal(s.doc.documentElement.classList.contains('feed-archive-open'),true);
 const last=make(s.doc,'a',{href:'/example-says/archive/2026-10.html'},'Oct');s.panelBody.append(last);last.focus();const tab=s.doc.dispatch('keydown',{key:'Tab'});assert.equal(tab.prevented,true);assert.equal(s.doc.activeElement,s.close);
 s.doc.dispatch('keydown',{key:'Escape'});assert.equal(s.panel.hidden,true);assert.equal(s.doc.activeElement,s.toggle);
 s.toggle.click();s.doc.body.click();assert.equal(s.panel.hidden,true);
});

test('lazy archive menu fetches inert HTML only once and reconstructs safe year/month links',async()=>{
 const s=setup({config:{archiveMenuUrl:'/example-says/archive-menu.html'},fetch:async(url)=>({ok:true,url,text:async()=>fixtureArchive()})});s.toggle.click();await flush();assert.equal(s.requests.length,1);assert.equal(s.requests[0].url,'http://localhost:8790/example-says/archive-menu.html');assert.equal(s.requests[0].opts.cache,'no-store');assert.equal(s.panelBody.querySelector('h3').textContent,'2026');assert.equal(s.panelBody.querySelector('.month-button').href,'/example-says/archive/2026-10.html');assert.equal(s.panelBody.querySelectorAll('script').length,0);s.api.closeArchive();s.api.openArchive();await flush();assert.equal(s.requests.length,1);
});

test('lazy archive failure keeps fallback link and can retry; untrusted menu links are rejected',async()=>{
 let attempt=0;const s=setup({config:{archiveMenuUrl:'/example-says/archive-menu.html'},fetch:async(url)=>({ok:++attempt>1,url,text:async()=>fixtureArchive()})});s.api.openArchive();await flush();assert.match(s.panelBody.textContent,/Could not load/);assert.ok(s.panelBody.querySelector('a'));s.panelBody.querySelector('[data-feed-action="archive-retry"]').click();await flush();assert.equal(s.requests.length,2);assert.equal(s.panelBody.querySelector('h3').textContent,'2026');
 assert.throws(()=>s.api.parseArchiveMenu(fixtureArchive({badHref:true}),'http://localhost:8790/example-says/archive-menu.html'));assert.throws(()=>s.api.parseArchiveMenu(fixtureArchive({canonical:'https://evil.example/menu'}),'http://localhost:8790/example-says/archive-menu.html'));
});

test('archive body-read stall times out, exposes retry and does not retain a permanently pending promise',async()=>{
 let attempts=0;const never=new Promise(()=>{});const s=setup({config:{archiveMenuUrl:'/example-says/archive-menu.html'},fetch:async(url)=>({ok:true,url,text:()=>++attempts===1?never:Promise.resolve(fixtureArchive())})});
 s.api.openArchive();await flush();assert.match(s.panelBody.textContent,/Loading archive/);[...s.timers.values()][0]();await flush();assert.match(s.panelBody.textContent,/Could not load/);assert.equal(s.requests[0].opts.signal.aborted,true);
 s.panelBody.querySelector('[data-feed-action="archive-retry"]').click();await flush();assert.equal(s.requests.length,2);assert.equal(s.panelBody.querySelector('h3').textContent,'2026');
});

test('SSR menu avoids a menu request and header archive action opens the same panel',async()=>{
 const s=setup({ssrMenu:true,config:{archiveMenuUrl:'/example-says/archive-menu.html'}});const link=make(s.doc,'a',{'data-feed-action':'archive-open',href:'/example-says/archive-menu.html'},'Archive');s.doc.body.append(link);link.click();await flush();assert.equal(s.panel.hidden,false);assert.equal(s.requests.length,0);
});

test('list text stays plaintext, preserves line breaks, links to detail and formats DST-aware time',async()=>{
 const body='<img src=x onerror=EVIL()> literal\nActual line two';const s=setup({hostname:'nanalab.kr',config:{displayTimezone:'America/New_York'},initial:[]});const r=row('200','2026-07-01T01:02:03Z',{text:body});const item=s.api.createCard(r);s.latest.append(item);s.api.hydrate(item);await flush();assert.equal(item.querySelector('.feed-text').textContent,body);assert.equal(item.querySelector('.feed-text-link').href,r.permalink);assert.equal(item.querySelector('img'),null);assert.match(item.querySelector('time').textContent,/2026-06-30 · 21:02:03 GMT-4/);assert.equal(s.doc.head.children.length,0);
});

test('without IntersectionObserver manual HTML pagination remains available',async()=>{
 const s=setup({io:false});s.next.click();await flush();assert.equal(s.requests.length,1);assert.equal(s.latest.children.length,3);assert.equal(s.next.getAttribute('href'),'http://localhost:8790/example-says/feed/latest-0003.html');
});

test('the 800-character preview limit counts Unicode codepoints without cutting emoji surrogates',()=>{
 const s=setup();const text='😀'.repeat(800);const e=s.api.createCard({...baseRows[0],text});assert.equal([...e.querySelector('.feed-text').textContent].length,800);assert.equal(e.querySelector('.feed-text').textContent,text);assert.throws(()=>s.api.validateRecord({...baseRows[0],text:text+'😀'}),/800 Unicode/);
});

test('pagination and createCard preserve preview source/status/truncation metadata',async()=>{
 const r=row('198','2026-10-28T09:00:00Z',{text:'Original preview text',text_status:'available',text_source:{url:'https://x.com/Example/status/198',sha256:'a'.repeat(64)},source_ids:['source-a'],text_truncated:true,content_status:'text'});
 const s=setup({fetch:async(url)=>({ok:true,url,text:async()=>fixturePage([r],{next:null})})});assert.equal(await s.api.loadMore(),true);const e=s.latest.children.at(-1);const metadata=JSON.parse(e.querySelector('script.feed-record-data').textContent);
 assert.equal(e.querySelector('.feed-text').textContent,r.text);assert.equal(metadata.text_status,r.text_status);assert.deepEqual(metadata.text_source,r.text_source);assert.deepEqual(metadata.source_ids,r.source_ids);assert.equal(metadata.text_truncated,true);assert.equal(metadata.content_status,'text');assert.equal(s.doc.querySelectorAll('iframe').length,0);
});

test('fetched HTML text containing markup and script delimiters stays literal inert text',async()=>{
 const body='<script>EVIL()</script>\n<img src=x onerror=EVIL()> @Example';const s=setup({fetch:async(url)=>({ok:true,url,text:async()=>fixturePage([row('198','2026-10-28T09:00:00Z',{text:body})],{next:null})})});assert.equal(await s.api.loadMore(),true);const e=s.latest.children.at(-1);assert.equal(e.querySelector('.feed-text').textContent,body);assert.equal(e.querySelectorAll('img').length,0);assert.equal(e.querySelectorAll('iframe').length,0);assert.equal(e.querySelectorAll('script').length,1);assert.equal(e.querySelector('script').type,'application/json');assert.equal(s.doc.head.children.length,0);
});

test('overlength or uncleared fetched preview text rejects the entire page without changing the existing list',async()=>{
 for(const config of [{},{allowText:false}]){
  const text=config.allowText===false?'body text':'x'.repeat(801);const s=setup({config,fetch:async(url)=>({ok:true,url,text:async()=>fixturePage([row('198','2026-10-28T09:00:00Z',{text})])})});assert.equal(await s.api.loadMore(),false);assert.equal(s.latest.children.length,2);assert.match(s.next.textContent,/Retry/);assert.equal(s.doc.querySelectorAll('iframe').length,0);
 }
});

test('detail pages are untouched by shared list hydration, including historical repost records',async()=>{
 const s=setup({noFeed:true,config:{listTextOnly:false,allowText:true,autoEmbeds:true}});const r={...baseRows[0],is_repost:true,text:null};const existing=card(s.doc,r);const body=make(s.doc,'blockquote',{},'Existing full detail body');const frame=make(s.doc,'iframe',{src:'https://platform.twitter.com/detail'});existing.append(body,frame);s.doc.body.append(existing);s.mutations[0].fn([{addedNodes:[existing]}]);await flush();assert.equal(existing.isConnected,true);assert.equal(frame.isConnected,true);assert.equal(existing.querySelector('blockquote').textContent,'Existing full detail body');assert.equal(existing.querySelector('.feed-text-link'),null);assert.equal(s.requests.length,0);assert.equal(s.doc.head.children.length,0);assert.throws(()=>s.api.validateRecord(r),/Repost excluded/);
});

test('text metadata type checks reject malformed status/source identifiers and truncation flags',()=>{
 const s=setup();for(const extra of [{text_status:{}},{content_status:[]},{text_source:5},{text_source:'javascript:alert(1)'},{text_source:'http://example.com/post'},{text_source:{url:'https://user:password@example.com/post'}},{source_ids:'source-a'},{source_ids:[{}]},{text_truncated:'yes'},{truncated:1}])assert.throws(()=>s.api.validateRecord({...baseRows[0],...extra}));
});

test('hydration preserves Python SSR date/likes metadata and explicit description/truncation notes',()=>{
 for(const metaInside of [false,true]){
  const s=setup({noFeed:true});const r={...baseRows[0],text:'Description preview',text_status:'official-page-description',text_truncated:true,text_source:'https://x.com/Example/status/200'};const e=make(s.doc,'li',{class:'feed-record','data-feed-id':r.id});const meta=make(s.doc,'div',{class:'feed-meta'});meta.append(make(s.doc,'time',{datetime:r.published_at},'2026-10-28 · 12:00:00 UTC'),make(s.doc,'span',{class:'feed-likes'},'5 likes'));const link=make(s.doc,'a',{class:'feed-text-link detail-link',href:r.permalink});if(metaInside)link.append(meta);else e.append(meta);link.append(make(s.doc,'p',{class:'feed-text-body',dir:'auto'},r.text),make(s.doc,'span',{class:'feed-read-more'},'View post →'));e.append(link,make(s.doc,'p',{class:'feed-text-note','data-text-status':r.text_status},'Original SSR source note'),make(s.doc,'script',{class:'feed-record-data',type:'application/json'},JSON.stringify(r)));s.doc.body.append(e);s.api.hydrate(e);
  assert.equal(meta.isConnected,true);assert.equal(meta.parentNode,e);assert.equal(e.querySelector('time').textContent,'2026-10-28 · 12:00:00 UTC');assert.equal(e.querySelector('.feed-likes').textContent,'5 likes');assert.equal(e.querySelectorAll('.feed-meta').length,1);assert.equal(e.querySelectorAll('.feed-text-note').length,1);assert.equal(e.querySelector('.feed-text-note').parentNode,e);assert.equal(e.querySelector('.feed-text-note').dataset.textStatus,r.text_status);assert.equal(e.querySelector('.feed-text-body').getAttribute('dir'),'auto');assert.match(e.querySelector('.feed-text-note').textContent,/Official original-page description; not a full post transcript/);assert.match(e.querySelector('.feed-text-note').textContent,/Preview shortened to 800 characters/);
 }
});

test('dynamic cards distinguish captured, partial, description and unavailable source text',()=>{
 const s=setup();for(const [status,text,pattern]of [['full-source','Body',/^Captured source text\.$/],['partial-source','Body',/^Partial source text; the original may contain more\.$/],['official-description','Body',/^Official original-page description; not a full post transcript\.$/],['unavailable',null,/^Source text unavailable\.$/]]){
  const e=s.api.createCard({...baseRows[0],text_status:status,text});const note=e.querySelector('.feed-text-note');assert.match(note.textContent,pattern);assert.equal(note.dataset.textStatus,status);assert.equal(note.parentNode,e);assert.equal(e.querySelector('.feed-meta').parentNode,e);assert.equal(e.querySelectorAll('[data-feed-action="embed"]').length,0);
 }
});
