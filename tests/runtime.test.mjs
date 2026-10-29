import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const code=fs.readFileSync(new URL('../src/archive.js',import.meta.url),'utf8');
const row={id:'x-2105860000000000000',post_id:'2105860000000000000',platform:'x',original_url:'https://x.com/thsottiaux/status/2105860000000000000',published_date:'2026-10-02',published_at:'2026-10-02T03:00:00Z',text:null,text_status:'unavailable',text_source:null,text_truncated:false};
class Element{
 constructor(tag='div'){this.tagName=tag;this.dataset={};this.children=[];this.hidden=false;this.style={};this.textContent='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 select(){} remove(){} showModal(){this.open=true;} close(){this.open=false;}
 querySelector(){return this.area??=new Element('textarea');}
}
function setup(options={}){
 const config={kind:'browse',origin:'https://nanalab.kr/tibo-says',base:'/tibo-says/',name:'Tibo Says',records:[row],...options.config};
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 get('#page-config').textContent=JSON.stringify(config);
 const requests=[],copied=[],shared=[],feedRecords=[],hydrationRoots=[];let handler;let fetchCount=0,platformEmbedCount=0;
 const document={querySelector:get,getElementById:id=>get('#'+id),createElement:tag=>new Element(tag),head:new Element('head'),body:new Element('body'),execCommand:()=>false,addEventListener:(type,fn)=>{if(type==='click')handler=fn;}};
 const navigator={clipboard:{writeText:async value=>{if(options.clipboardFails)throw Error('denied');copied.push(value);}}};
 if(options.share)navigator.share=async value=>{shared.push(value);if(options.share==='abort')throw Object.assign(Error('cancel'),{name:'AbortError'});if(options.share==='denied')throw Error('denied');};
 const context={document,navigator,location:{hostname:options.hostname||'localhost'},URL,Uint32Array,crypto:webcrypto,setTimeout:()=>1,clearTimeout:()=>{},fetch:async url=>{requests.push(url);fetchCount++;return {ok:!options.fetchFails,json:async()=>options.monthRows||[row]};}};
 context.window=context;
 if(options.feedAvailable!==false)context.SaysFeed={
  createCard(record){
   feedRecords.push(JSON.parse(JSON.stringify(record)));
   const item=new Element('li');item.dataset.postId=record.id;item.dataset.feedId=record.id;
   const link=new Element('a');link.className='feed-text-link';link.href=config.base+'posts/'+record.id.replaceAll(':','-')+'.html';
   const body=new Element('p');body.textContent=record.text||'Source text unavailable.';link.append(body);item.append(link);return item;
  },
  hydrate(root){hydrationRoots.push(root);}
 };
 if(options.embed)context.twttr={widgets:{createTweet:(...args)=>{platformEmbedCount++;return options.embed(...args);}}};
 vm.runInNewContext(code,context);
 return {nodes,get,context,requests,copied,shared,feedRecords,hydrationRoots,embedCount:()=>platformEmbedCount,fetchCount:()=>fetchCount,click:async(action,data={})=>{const button=new Element('button');button.dataset={action,...data};await handler({target:{closest:()=>button}});assert.equal(button.disabled,false);},config};
}
const shareUrl='https://nanalab.kr/tibo-says/posts/'+row.id+'.html';

test('local previews never initialize platform embeds',async()=>{
 const s=setup({config:{kind:'post'}});await Promise.resolve();
 assert.equal(s.context.document.head.children.length,0);
 const slot=s.get('#embed-'+row.id);assert.equal(slot.children[0].textContent,'External embeds are disabled in local preview. ');
 assert.equal(slot.children[0].children[0].href,row.original_url);
});
test('copy uses the canonical detail URL only',async()=>{
 const s=setup();await s.click('copy',{url:shareUrl});assert.deepEqual(s.copied,[shareUrl]);
 assert.equal(s.get('#status').textContent,'Page link copied.');
});
test('native share payload includes the app title and canonical detail URL',async()=>{
 const s=setup({share:'ok'});await s.click('share',{url:shareUrl});assert.equal(s.shared[0].title,'Tibo Says');assert.equal(s.shared[0].url,shareUrl);assert.equal(s.copied.length,0);
});
test('cancelled native sharing never overwrites the clipboard',async()=>{
 const s=setup({share:'abort'});await s.click('share',{url:shareUrl});assert.equal(s.copied.length,0);
});
test('failed sharing falls back to copying; denied clipboard exposes manual copy',async()=>{
 const deniedShare=setup({share:'denied'});await deniedShare.click('share',{url:shareUrl});assert.deepEqual(deniedShare.copied,[shareUrl]);
 const manual=setup({clipboardFails:true});await manual.click('copy',{url:shareUrl});assert.equal(manual.get('#copy-dialog').open,true);assert.equal(manual.get('#copy-dialog').area.value,shareUrl);
});
test('share rejects URLs outside this app post directory',async()=>{
 const s=setup();for(const url of ['https://evil.example/posts/a','https://nanalab.kr/tibo-says-evil/posts/a','javascript:alert(1)'])await s.click('copy',{url});assert.equal(s.copied.length,0);
});
test('shuffle samples 50 distinct posts, caches the month and delegates exact text previews without list embeds',async()=>{
 const rows=Array.from({length:100},(_,i)=>({...row,id:'x-'+(2105860000000000000n+BigInt(i)),post_id:String(2105860000000000000n+BigInt(i))})).map((record,i)=>({...record,text:i%10===0?'😀'.repeat(799)+'…':'Captured source post '+i+'\nSecond original-language line.',text_status:'captured_source',text_source:record.original_url,text_truncated:i%10===0}));
 const s=setup({hostname:'nanalab.kr',embed:async()=>({}),monthRows:rows,config:{kind:'month',month:'2026-10',monthData:'/tibo-says/data/month-2026-10.json'}});
 await s.click('shuffle');const firstIds=s.get('#records').children.map(e=>e.dataset.postId);assert.equal(firstIds.length,50);assert.equal(new Set(firstIds).size,50);
 const expected=new Map(rows.map(record=>[record.id,record]));
 for(const forwarded of s.feedRecords){const original=expected.get(forwarded.id);assert.ok(original);assert.equal(forwarded.text,original.text);assert.equal(forwarded.text_status,original.text_status);assert.equal(forwarded.text_source,original.text_source);assert.equal(forwarded.text_truncated,original.text_truncated);assert.ok(forwarded.text===null||Array.from(forwarded.text).length<=800);}
 assert.equal(s.hydrationRoots.length,1);assert.equal(s.hydrationRoots[0],s.get('#records'));assert.equal(s.feedRecords.length,50);
 assert.ok(s.get('#records').children.every(item=>item.children[0].className==='feed-text-link'&&item.children[0].href.startsWith(s.config.base+'posts/')));
 await s.click('shuffle');const secondIds=s.get('#records').children.map(e=>e.dataset.postId);assert.equal(s.fetchCount(),1);assert.equal(secondIds.length,50);assert.equal(new Set(secondIds).size,50);assert.notDeepEqual(secondIds,firstIds);assert.equal(s.hydrationRoots.length,2);assert.equal(s.feedRecords.length,100);
 assert.equal(s.embedCount(),0);assert.equal(s.context.document.head.children.length,0);assert.equal(s.context.document.body.children.length,0);assert.equal(s.requests.length,1);
 const unicode={...rows[0],text:'😀'.repeat(800),text_status:'captured_source',text_source:rows[0].original_url,text_truncated:false};const one=setup({hostname:'nanalab.kr',embed:async()=>({}),monthRows:[unicode],config:{...s.config,records:[unicode]}});await one.click('shuffle');assert.equal(one.feedRecords.length,1);assert.equal(one.feedRecords[0].text,unicode.text);assert.equal(Array.from(one.feedRecords[0].text).length,800);assert.equal(one.embedCount(),0);
});

test('invalid month and unsafe source URLs leave the current list intact',async()=>{
 for(const bad of [{...row,published_date:'2025-10-01'},{...row,text:'x'.repeat(801)},{...row,text:'😀'.repeat(801)},{...row,text:{}},{...row,text_source:'http://x.com/example'},{...row,text_source:'https://user:password@x.com/example'},{...row,text_source:5},{...row,text_status:undefined},{...row,text_truncated:'true'},{...row,original_url:'https://x.com.evil.example/post/1'}]){
  const s=setup({monthRows:[bad],config:{month:'2026-10',monthData:'/tibo-says/data/month-2026-10.json'}});s.get('#records').append('original');await s.click('shuffle');assert.equal(s.get('#load-error').hidden,false);assert.deepEqual(s.get('#records').children,['original']);
 }
});
test('missing month response or text-feed dependency preserves records, reports an error and re-enables shuffle',async()=>{
 for(const options of [{fetchFails:true},{feedAvailable:false}]){
  const s=setup({...options,config:{month:'2026-10',monthData:'/month.json'}});s.get('#records').append('original');await s.click('shuffle');assert.equal(s.get('#load-error').textContent,'Could not load this month. Please try again.');assert.equal(s.get('#load-error').hidden,false);assert.deepEqual(s.get('#records').children,['original']);assert.equal(s.context.document.head.children.length,0);assert.equal(s.embedCount(),0);
 }
});

test('unavailable X embed retains the verified original permalink',async()=>{
 const s=setup({hostname:'nanalab.kr',embed:async()=>undefined});await s.click('preview',{id:row.id});
 const slot=s.get('#embed-'+row.id);assert.equal(slot.dataset.loaded,'false');assert.equal(slot.children[0].children[0].href,row.original_url);
});
