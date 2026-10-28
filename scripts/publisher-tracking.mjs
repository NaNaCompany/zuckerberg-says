import fs from 'node:fs/promises';
import path from 'node:path';
export const IDS={ga:'G-2ZYSF0173P',gtm:'GTM-NV2WWQXB',ads:'ca-pub-9767176956440077',cf:'9f3423bb0d034d91bbe1a12afeff2429'};
export const HEAD=`<!-- NaNa publisher integrations: GA4, GTM, AdSense, Cloudflare -->
<script>(function(){
if(!['nanalab.kr','www.nanalab.kr','nanacompany.github.io'].includes(location.hostname.toLowerCase()))return;
function load(src,attrs){var s=document.createElement('script');s.async=true;s.src=src;for(var k in attrs)s.setAttribute(k,attrs[k]);document.head.appendChild(s);}
window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
load('https://www.googletagmanager.com/gtm.js?id=${IDS.gtm}',{});
gtag('js',new Date());gtag('config','${IDS.ga}',{page_location:location.origin+location.pathname,page_referrer:document.referrer?document.referrer.split(/[?#]/)[0]:''});
load('https://www.googletagmanager.com/gtag/js?id=${IDS.ga}',{});
load('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${IDS.ads}',{crossorigin:'anonymous'});
function beacon(){if(document.querySelector('script[src*="static.cloudflareinsights.com/beacon.min.js"]'))return;load('https://static.cloudflareinsights.com/beacon.min.js',{'data-cf-beacon':JSON.stringify({token:'${IDS.cf}'})});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',beacon,{once:true});else beacon();
})();</script><!-- /NaNa publisher integrations -->`;
export const FALLBACK=`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${IDS.gtm}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>`;
export function completeTracking(html){if(html.includes('NaNa publisher integrations:'))return html;return html.replace(/<\/head>/i,HEAD+'</head>').replace(/<body\b[^>]*>/i,m=>m+FALLBACK);}
export async function finalizePublicSite(directory,app,skipPosts=false){
 const files=[];
 async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory()){if(!(skipPosts&&entry.name==='posts'))await walk(file);}else if(entry.name.endsWith('.html'))files.push(file);}}
 await walk(directory);let cursor=0;
 async function job(){while(cursor<files.length){const file=files[cursor++],original=await fs.readFile(file,'utf8');let html=original.replace(/<meta\s+name="robots"\s+content="noindex,nofollow"\s*\/?>/gi,'<meta name="robots" content="index,follow">');
 if(!/rel="canonical"/i.test(html)){const route=path.relative(directory,file).split(path.sep).join('/').replace(/index\.html$/,'');html=html.replace('</head>','<link rel="canonical" href="'+app.origin+'/'+route+'"></head>');}
 html=completeTracking(html);if(html!==original)await fs.writeFile(file,html);
 }}
 await Promise.all(Array.from({length:24},job));await fs.writeFile(path.join(directory,'.nojekyll'),'');
 await fs.writeFile(path.join(directory,'ads.txt'),'google.com, pub-9767176956440077, DIRECT, f08c47fec0942fa0\n');
 await fs.writeFile(path.join(directory,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: '+app.origin+'/sitemap.xml\n');return files.length;
}
