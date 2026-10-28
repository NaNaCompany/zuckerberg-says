import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {HEAD,completeTracking,IDS} from '../scripts/publisher-tracking.mjs';
const script=HEAD.match(/<script>([\s\S]*?)<\/script>/)[1];
function run(hostname,existingBeacon=false){const requests=[],context={location:{hostname,origin:'https://'+hostname,pathname:'/tool/',search:'?query=PRIVATE_INPUT',hash:'#PRIVATE_INPUT'},Date,document:{readyState:'complete',referrer:'https://example.com/?token=PRIVATE_INPUT',querySelector:()=>existingBeacon?{}:null,createElement:()=>({setAttribute(k,v){this[k]=v;}}),head:{appendChild:s=>requests.push(s)}}};context.window=context;vm.runInNewContext(script,context);return {requests,context};}
test('publisher requests are disabled on local and unapproved test hosts',()=>{for(const host of ['localhost','127.0.0.1','::1','preview.invalid'])assert.equal(run(host).requests.length,0);});
test('all four integrations initialize on production without URL input values',()=>{const {requests,context}=run('nanalab.kr');assert.equal(requests.length,4);for(const id of Object.values(IDS))assert.ok(HEAD.includes(id));assert.ok(!JSON.stringify(context.dataLayer).includes('PRIVATE_INPUT'));assert.equal(requests.find(x=>x.src.includes('cloudflare')).src,'https://static.cloudflareinsights.com/beacon.min.js');});
test('existing edge beacon is reused and HTML injection is idempotent',()=>{assert.equal(run('nanalab.kr',true).requests.length,3);const once=completeTracking('<html><head></head><body>App</body></html>');assert.equal(completeTracking(once),once);assert.ok(once.includes('googletagmanager.com/ns.html'));});
