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
 return '<html><head><link rel="canonical" href="'+canonical+'"></head><body><ol data-feed-items>'+rows.map(r=>'<li class="feed-record" data-feed-id="'+r.id+'"><script type="application/json" class="feed-record-data">'+JSON.stringify(r)+'</script><img src="https://evil.example/pixel" onerror="EVIL()">'+extra+'</li>').join('')+'</ol>'+(next?'<a id="feed-next" href="/example-says/feed/latest-'+String(next).padStart(4,'0')+'.html">Next</a>':'')+'</body></html>';
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
 const config={base:'/example-says/',origin:'https://nanalab.kr/example-says',name:'Example Says',handle:'Example',autoEmbeds:true,allowText:false,...options.config};
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
 assert.equal(await s.api.loadMore(),true);assert.deepEqual(s.latest.children.map(e=>e.dataset.feedId),['x-200','x-199','x-198']);assert.equal(s.requests[0].opts.headers.Accept,'text/html');assert.equal(s.next.getAttribute('href'),'http://localhost:8790/example-says/feed/latest-0003.html');
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
 for(const bad of [{is_repost:true},{post_kind:'retweet'},{kind:'repost'},{original_url:'https://x.com/Other/status/200'},{original_url:'javascript:alert(1)'},{original_url:'https://x.com.evil.example/Example/status/200'},{like_count:-1},{like_count:NaN},{like_count:1.5},{post_id:200},{text:'uncleared'},{published_date:'2026-02-30'},{permalink:'https://evil.example/posts/x-200.html'}])assert.throws(()=>s.api.validateRecord({...baseRows[0],...bad}),JSON.stringify(bad));
 const zero=s.api.createCard({...baseRows[0],like_count:0});assert.match(zero.querySelector('.feed-likes').textContent,/^0 likes$/);
 const unknown=s.api.createCard({...baseRows[0],like_count:null});assert.equal(unknown.querySelector('.feed-likes'),null);
 const approx=s.api.createCard({...baseRows[0],like_count:23000,likes_source:{count_precision:'display-rounded'}});assert.equal(approx.querySelector('.feed-likes').textContent,'~23,000 likes');
});

test('local previews never create platform scripts or iframes and always retain original links',async()=>{
 const s=setup();await flush();assert.equal(s.doc.head.children.length,0);assert.equal(s.doc.querySelectorAll('iframe').length,0);assert.match(s.latest.children[0].querySelector('.feed-embed').textContent,/External embeds are disabled/);
 const anchors=s.latest.children[0].querySelectorAll('a');assert.ok(anchors.some(a=>a.href===baseRows[0].original_url));
});

test('missing SSR retry controls are added and MutationObserver hydrates shuffled cards',async()=>{
 const s=setup({noButton:true,noFeed:true});const cardElement=s.api.createCard(baseRows[0]);cardElement.querySelector('[data-feed-action="embed"]').remove();s.doc.body.append(cardElement);s.mutations[0].fn([{addedNodes:[cardElement]}]);await flush();assert.ok(cardElement.querySelector('[data-feed-action="embed"]'));assert.match(cardElement.querySelector('.feed-embed').textContent,/disabled in local/);
});

test('removed shuffle cards are unobserved rather than retained by the lazy observer',()=>{
 const s=setup({hostname:'nanalab.kr'});const old=s.latest.children[0];assert.equal(s.ios[0].targets.has(old),true);old.remove();s.mutations[0].fn([{addedNodes:[],removedNodes:[old]}]);assert.equal(s.ios[0].targets.has(old),false);
});

test('official X embeds load only near viewport and respect the three-worker bound',async()=>{
 const calls=[];const resolvers=[];const s=setup({hostname:'nanalab.kr',initial:[...Array(5)].map((_,i)=>row(String(200-i),'2026-10-28T10:00:00Z')),embed:(id,slot,options)=>{calls.push({id,slot,options});return new Promise(resolve=>resolvers.push(resolve));}});
 assert.equal(calls.length,0);for(const cardElement of s.latest.children)s.ios[0].fire(cardElement);await flush();assert.equal(calls.length,3);assert.ok(calls.every(c=>c.options.dnt===true&&c.options.conversation==='none'));
 resolvers.shift()({});await flush();assert.equal(calls.length,4);resolvers.forEach(resolve=>resolve({}));await flush();assert.ok(calls.length<=5);
});

test('unavailable official embed exposes fallback and manual retry without duplicate automatic requests',async()=>{
 let calls=0;const s=setup({hostname:'nanalab.kr',embed:async()=>{calls++;return undefined;}});const first=s.latest.children[0];s.ios[0].fire(first);await flush();assert.equal(calls,1);assert.match(first.querySelector('.feed-embed').textContent,/could not display/);assert.equal(first.querySelector('[data-feed-action="embed"]').textContent,'Retry original');s.ios[0].fire(first);await flush();assert.equal(calls,1);
 first.querySelector('[data-feed-action="embed"]').click();await flush();assert.equal(calls,2);
});

test('loaded X script without a ready widget API times out and a manual retry creates a fresh attempt',async()=>{
 const s=setup({hostname:'nanalab.kr'});const first=s.latest.children[0];s.ios[0].fire(first);await flush();
 const initialScript=s.doc.head.querySelector('script');assert.ok(initialScript);initialScript.dispatch('load');await flush();
 const timeout=[...s.timers.values()][0];timeout();await flush();assert.match(first.querySelector('.feed-embed').textContent,/could not display/);assert.equal(initialScript.isConnected,false);
 first.querySelector('[data-feed-action="embed"]').click();await flush();const replacement=s.doc.head.querySelector('script');assert.ok(replacement);assert.notEqual(replacement,initialScript);
 let calls=0;s.context.twttr.widgets={createTweet:async()=>{calls++;return {};}};replacement.dispatch('load');await flush();assert.equal(calls,1);assert.equal(first.querySelector('[data-feed-action="embed"]').textContent,'Original loaded');
});

test('Truth Social and Meta iframes use fixed official endpoints and preserve fallback links',async()=>{
 const truth=row('123','2026-10-28T10:00:00Z',{id:'truth:123',platform:'truth',original_url:'https://truthsocial.com/@realDonaldTrump/posts/123',permalink:'/example-says/posts/truth-123.html'});
 const s=setup({hostname:'nanalab.kr',initial:[truth]});s.ios[0].fire(s.latest.children[0]);await flush();assert.equal(s.doc.querySelector('iframe').src,'https://truthsocial.com/@realDonaldTrump/123/embed');assert.equal(s.doc.querySelector('iframe').title,'Original Truth Social post');s.doc.querySelector('iframe').dispatch('error');await flush();assert.match(s.latest.children[0].querySelector('.feed-embed').textContent,/could not display/);
 const fb={...truth,id:'archive-123',platform:'facebook',original_url:'https://www.facebook.com/zuck/posts/123',permalink:'/example-says/posts/archive-123.html'};const m=setup({hostname:'nanalab.kr',initial:[fb]});m.ios[0].fire(m.latest.children[0]);await flush();assert.ok(m.doc.querySelector('iframe').src.startsWith('https://www.facebook.com/plugins/post.php?'));assert.ok(m.doc.querySelector('iframe').src.includes('show_text=true'));
});

test('archive menu opens, traps focus, closes with Escape/outside click and restores trigger focus',()=>{
 const s=setup({ssrMenu:true});s.toggle.focus();s.toggle.click();assert.equal(s.panel.hidden,false);assert.equal(s.toggle.getAttribute('aria-expanded'),'true');assert.equal(s.doc.activeElement,s.close);assert.equal(s.doc.documentElement.classList.contains('feed-archive-open'),true);
 const last=make(s.doc,'a',{href:'/example-says/archive/2026-10.html'},'Oct');s.panelBody.append(last);last.focus();const tab=s.doc.dispatch('keydown',{key:'Tab'});assert.equal(tab.prevented,true);assert.equal(s.doc.activeElement,s.close);
 s.doc.dispatch('keydown',{key:'Escape'});assert.equal(s.panel.hidden,true);assert.equal(s.doc.activeElement,s.toggle);
 s.toggle.click();s.doc.body.click();assert.equal(s.panel.hidden,true);
});

test('lazy archive menu fetches inert HTML only once and reconstructs safe year/month links',async()=>{
 const s=setup({config:{archiveMenuUrl:'/example-says/archive-menu.html'},fetch:async(url)=>({ok:true,url,text:async()=>fixtureArchive()})});s.toggle.click();await flush();assert.equal(s.requests.length,1);assert.equal(s.requests[0].url,'http://localhost:8790/example-says/archive-menu.html');assert.equal(s.panelBody.querySelector('h3').textContent,'2026');assert.equal(s.panelBody.querySelector('.month-button').href,'/example-says/archive/2026-10.html');assert.equal(s.panelBody.querySelectorAll('script').length,0);s.api.closeArchive();s.api.openArchive();await flush();assert.equal(s.requests.length,1);
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

test('cleared text stays plaintext, uses DST-aware display and is not automatically duplicated by an embed',async()=>{
 const body='<img src=x onerror=EVIL()> literal';const s=setup({hostname:'nanalab.kr',config:{allowText:true,displayTimezone:'America/New_York'},initial:[]});const item=s.api.createCard(row('200','2026-07-01T01:02:03Z',{text:body}));s.latest.append(item);s.api.hydrate(item);s.ios[0].fire(item);await flush();assert.equal(item.querySelector('.feed-text').textContent,body);assert.equal(item.querySelector('img'),null);assert.match(item.querySelector('time').textContent,/2026-06-30 · 21:02:03 GMT-4/);assert.equal(s.doc.head.children.length,0);
});

test('without IntersectionObserver manual HTML pagination remains available',async()=>{
 const s=setup({io:false});s.next.click();await flush();assert.equal(s.requests.length,1);assert.equal(s.latest.children.length,3);assert.equal(s.next.getAttribute('href'),'http://localhost:8790/example-says/feed/latest-0003.html');
});
