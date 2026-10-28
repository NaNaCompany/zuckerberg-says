(() => {
 'use strict';
 const config=JSON.parse(document.querySelector('#page-config').textContent);
 const records=new Map((config.records||[]).map(r=>[r.id,r]));
 const production=['nanalab.kr','www.nanalab.kr','nanacompany.github.io'].includes(location.hostname.toLowerCase());
 let monthData=null,scriptPromise=null,statusTimer;
 const status=document.querySelector('#status');
 function notify(text){clearTimeout(statusTimer);status.textContent=text;statusTimer=setTimeout(()=>status.textContent='',4500);}
 function safeUrl(row){const url=new URL(row.original_url);const hosts={x:['x.com','twitter.com','www.twitter.com','www.x.com'],facebook:['facebook.com','www.facebook.com','m.facebook.com'],threads:['threads.com','www.threads.com','threads.net','www.threads.net'],instagram:['instagram.com','www.instagram.com']};if(url.protocol!=='https:'||!hosts[row.platform]?.includes(url.hostname)||url.username||url.password)throw new Error('Untrusted original URL');return url;}
 function create(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function fallback(slot,row,message){slot.replaceChildren();const box=create('p','embed-fallback',message+' ');const link=create('a','', 'Open original ↗');link.href=safeUrl(row).href;link.target='_blank';link.rel='noopener noreferrer';box.append(link);slot.append(box);}
 async function loadX(){
  if(window.twttr?.widgets?.createTweet)return window.twttr;
  if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
   window.twttr=window.twttr||{_e:[],ready(callback){this._e.push(callback);}};
   const script=document.createElement('script');script.src='https://platform.twitter.com/widgets.js';script.async=true;
   const timeout=setTimeout(()=>{scriptPromise=null;reject(new Error('X embed timed out'));},15000);
   script.onload=()=>{clearTimeout(timeout);if(window.twttr?.widgets?.createTweet)resolve(window.twttr);else {scriptPromise=null;reject(new Error('X embed unavailable'));}};
   script.onerror=()=>{clearTimeout(timeout);scriptPromise=null;reject(new Error('X embed blocked'));};document.head.append(script);
  });
  return scriptPromise;
 }
 async function embed(row,slot){
  slot.hidden=false;safeUrl(row);
  if(slot.dataset.loaded==='true')return;
  if(!production){fallback(slot,row,'External embeds are disabled in local preview.');return;}
  slot.dataset.loaded='true';slot.replaceChildren(create('p','hint','Loading original post…'));
  try{
   if(row.platform==='x'){
    const twttr=await loadX();slot.replaceChildren();
    const frame=await twttr.widgets.createTweet(row.post_id,slot,{conversation:'none',dnt:true,align:'center'});
    if(!frame)throw new Error('Post unavailable');
   }else if(row.platform==='facebook'){
    const frame=document.createElement('iframe');const url=new URL('https://www.facebook.com/plugins/post.php');url.searchParams.set('href',safeUrl(row).href);url.searchParams.set('show_text','true');url.searchParams.set('width',String(Math.min(500,Math.max(280,slot.clientWidth||500))));
    frame.src=url.href;frame.title='Original Facebook post';frame.loading='lazy';frame.allow='encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';slot.replaceChildren(frame);
   }else if(row.platform==='threads'){
    const original=safeUrl(row);const match=original.pathname.match(/^\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/);if(!match)throw new Error('Unsupported Threads permalink');
    const frame=document.createElement('iframe');frame.src='https://www.threads.com/@'+encodeURIComponent(match[1])+'/post/'+encodeURIComponent(match[2])+'/embed';frame.title='Original Threads post';frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';slot.replaceChildren(frame);
   }else if(row.platform==='instagram'){
    const original=safeUrl(row);const match=original.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)/);if(!match)throw new Error('Unsupported Instagram permalink');
    const frame=document.createElement('iframe');frame.src='https://www.instagram.com/'+match[1]+'/'+match[2]+'/embed/';frame.title='Original Instagram post';frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';slot.replaceChildren(frame);
   }
  }catch{slot.dataset.loaded='false';fallback(slot,row,'This platform could not display the post here.');}
 }
 function card(row){
  const item=create('li','archive-record');item.dataset.postId=row.id;
  const top=create('div','card-top');const time=create('time','',row.published_date+' · '+(row.published_at?row.published_at.slice(11,19)+' UTC':'Time not provided'));time.dateTime=row.published_at||row.published_date;
  top.append(time,create('span','platform',({x:'X / Twitter',facebook:'Facebook',threads:'Threads',instagram:'Instagram'})[row.platform]));
  const actions=create('div','card-actions');const detail=create('a','detail-link','View post →');detail.href=config.base+'posts/'+row.id+'.html';
  const button=create('button','','Load original post');button.dataset.action='preview';button.dataset.id=row.id;
  const original=create('a','','Original ↗');original.href=safeUrl(row).href;original.target='_blank';original.rel='noopener noreferrer';
  actions.append(detail,button,original);const slot=create('div','embed-slot');slot.id='embed-'+row.id;slot.hidden=true;item.append(top,actions,slot);return item;
 }
 function sample(rows,count){
  const copy=rows.slice();for(let i=copy.length-1;i>0;i--){const random=new Uint32Array(1);crypto.getRandomValues(random);const j=random[0]%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy.slice(0,Math.min(count,copy.length));
 }
 async function copyLink(url){
  try{await navigator.clipboard.writeText(url);return true;}catch{
   const area=document.createElement('textarea');area.value=url;area.style.cssText='position:fixed;left:-9999px';document.body.append(area);area.select();let copied=false;try{copied=document.execCommand('copy');}catch{}area.remove();
   if(copied)return true;
   const dialog=document.querySelector('#copy-dialog');dialog.querySelector('textarea').value=url;dialog.showModal();dialog.querySelector('textarea').select();return false;
  }
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-action]');if(!button)return;
  const action=button.dataset.action;
  if(action==='close-dialog'){document.querySelector('#copy-dialog').close();return;}
  button.disabled=true;
  try{
   if(action==='preview'){const row=records.get(button.dataset.id);if(row)await embed(row,document.getElementById('embed-'+row.id));}
   else if(action==='shuffle'){
    const error=document.querySelector('#load-error');error.hidden=true;
    if(!monthData){const response=await fetch(config.monthData,{credentials:'same-origin'});if(!response.ok)throw new Error('Month unavailable');const data=await response.json();if(!Array.isArray(data)||!data.every(row=>row.published_date.startsWith(config.month)&&row.text===null))throw new Error('Invalid month data');data.forEach(safeUrl);monthData=data;data.forEach(row=>records.set(row.id,row));}
    document.querySelector('#records').replaceChildren(...sample(monthData,50).map(card));notify('New random sample loaded.');
   }else if(action==='copy'||action==='share'){
    const url=new URL(button.dataset.url);if(url.origin!==new URL(config.origin).origin||!url.href.startsWith(config.origin+'/posts/'))throw new Error('Invalid share URL');
    if(action==='share'&&navigator.share){try{await navigator.share({title:config.name,url:url.href});return;}catch(error){if(error.name==='AbortError')return;}}
    if(await copyLink(url.href))notify(action==='copy'?'Page link copied.':'Sharing unavailable. Page link copied.');
   }
  }catch{if(action==='shuffle'){const error=document.querySelector('#load-error');error.hidden=false;error.textContent='Could not load this month. Please try again.';}else notify('Could not complete this action. Open the original link instead.');}
  finally{button.disabled=false;}
 });
 if(config.kind==='post'&&config.records?.[0])embed(config.records[0],document.getElementById('embed-'+config.records[0].id));
})();
