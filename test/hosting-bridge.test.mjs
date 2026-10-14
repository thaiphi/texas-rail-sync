import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostingBridge} from '../src/hosted/hosting-bridge.mjs';
import {prepareHosting} from '../scripts/prepare-hosting.mjs';
import {mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
test('hosting preparation removes stale generated files and copies only current UI assets',async()=>{
 await mkdir(resolve('tmp'),{recursive:true});
 const root=await mkdtemp(resolve('tmp/hosting-preparation-'));
 try{
  await mkdir(resolve(root,'public'));await mkdir(resolve(root,'tmp/hosting/public'),{recursive:true});
  await writeFile(resolve(root,'public/index.html'),'<body>original</body>');await writeFile(resolve(root,'public/app.js'),'original');
  await writeFile(resolve(root,'public/artifact-integrity.json'),'private pin');
  await writeFile(resolve(root,'tmp/hosting/public/index.html'),'stale shell');await writeFile(resolve(root,'tmp/hosting/public/old.js'),'stale script');
  const assets=prepareHosting({root});assert.deepEqual(await readdir(assets),['app.js']);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('hosting bridge serves the existing shell and preserves hash navigation without React replacement',async()=>{
 const handler=createHostingBridge({html:'<!doctype html><body><main>original</main></body>',fetchImpl:()=>{throw Error('unexpected');}});
 const response=await handler(new Request('https://preview.example/'));
 assert.equal(response.status,200);assert.match(await response.text(),/<main>original<\/main>/);
 assert.equal((await handler(new Request('https://preview.example/',{method:'HEAD'}))).body,null);
 assert.equal(await handler(new Request('https://preview.example/app.js')),null);
});
test('hosting bridge proxies only supported evidence routes to the fixed backend without cookies or redirects',async()=>{
 let captured;const handler=createHostingBridge({html:'shell',fetchImpl:async(url,options)=>{captured={url,options};return new Response('{}',{headers:{'content-type':'application/json'}});}});
 const result=await handler(new Request('https://preview.example/api/versions',{headers:{cookie:'private=secret'}}));
 assert.equal(result.status,200);assert.equal(captured.url,'https://phxiqnsebqaalvkanljb.supabase.co/functions/v1/trrc-explorer/api/versions');
 assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.get('cookie'),null);
 assert.equal(await handler(new Request('https://preview.example/raw/private.json')),null);
});
test('hosting bridge sanitizes backend failures and refuses unsupported methods',async()=>{
 const handler=createHostingBridge({html:'shell',fetchImpl:async()=>{throw Error('credential secret');}});
 const failed=await handler(new Request('https://preview.example/api/versions'));
 assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/credential secret/);
 assert.equal((await handler(new Request('https://preview.example/api/versions',{method:'DELETE'}))).status,405);
});
test('hosting bridge refuses unexpected encoded bodies and never forwards a stale streamed length',async()=>{
 let headers;const handler=createHostingBridge({html:'shell',fetchImpl:async(url,options)=>{headers=options.headers;return new Response('decoded',{headers:{'content-encoding':'gzip','content-length':'35'}});}});
 const response=await handler(new Request('https://preview.example/api/versions'));
 assert.equal(headers.get('accept-encoding'),'identity');assert.equal(response.status,503);
 const plain=createHostingBridge({html:'shell',fetchImpl:async()=>new Response('plain',{headers:{'content-length':'35'}})});
 const streamed=await plain(new Request('https://preview.example/api/versions'));assert.equal(streamed.headers.get('content-length'),null);assert.equal(await streamed.text(),'plain');
});
test('hosting bridge forwards guest routes with guest auth, idempotency key and verified origin only',async()=>{
 const seen=[];const bridge=createHostingBridge({html:'<html><head></head><body></body></html>',fetchImpl:async(url,init)=>{seen.push({url,init});return new Response('{}',{status:202,headers:{'content-type':'application/json'}});}});
 const token='a'.repeat(43),site='https://site.example';
 const post=(path,headers={})=>bridge(new Request(site+path,{method:'POST',headers:{'content-type':'application/json',origin:site,authorization:`Guest ${token}`,'idempotency-key':'k'.repeat(20),...headers},body:'{}'}));
 assert.equal((await post('/api/guest/lookups')).status,202);
 const forwarded=seen.at(-1).init.headers;
 assert.equal(forwarded.get('authorization'),`Guest ${token}`);assert.equal(forwarded.get('idempotency-key'),'k'.repeat(20));assert.equal(forwarded.get('origin'),site);
 assert.match(seen.at(-1).url,/\/functions\/v1\/trrc-explorer\/api\/guest\/lookups$/);
 assert.equal((await post('/api/guest/lookups',{origin:'https://evil.example'})).status,403);
 assert.equal((await post('/api/guest/history')).status,405);
 const get=await bridge(new Request(site+'/api/guest/jobs/'+'0'.repeat(8)+'-0000-0000-0000-'+'0'.repeat(12),{headers:{authorization:`Guest ${token}`}}));
 assert.equal(get.status,202);assert.equal(seen.at(-1).init.headers.get('authorization'),`Guest ${token}`);
 await bridge(new Request(site+'/api/guest/history',{headers:{authorization:'Bearer x.y.z'}}));
 assert.equal(seen.at(-1).init.headers.get('authorization'),null);
 assert.equal(await bridge(new Request(site+'/api/guest/unknown')),null);
});
test('hosting bridge keeps guest and bearer credentials on their own routes and refuses non-POST guest actions',async()=>{
 const seen=[];const bridge=createHostingBridge({html:'shell',fetchImpl:async(url,init)=>{seen.push({url,init});return new Response('{}',{status:202,headers:{'content-type':'application/json'}});}});
 const site='https://site.example',json={'content-type':'application/json',origin:site};
 await bridge(new Request(site+'/api/lookup',{method:'POST',headers:{...json,authorization:'Guest '+'a'.repeat(43)},body:'{}'}));
 assert.match(seen.at(-1).url,/\/api\/lookup$/);assert.equal(seen.at(-1).init.headers.get('authorization'),null);
 await bridge(new Request(site+'/api/guest/lookups',{method:'POST',headers:{...json,authorization:'Bearer x.y.z'},body:'{}'}));
 assert.match(seen.at(-1).url,/\/api\/guest\/lookups$/);assert.equal(seen.at(-1).init.headers.get('authorization'),null);
 const count=seen.length;
 assert.equal((await bridge(new Request(site+'/api/guest/session'))).status,405);assert.equal((await bridge(new Request(site+'/api/guest/session',{method:'HEAD'}))).status,405);
 assert.equal(seen.length,count);
});
test('hosting bridge treats guest routes case-sensitively so an uppercase path never carries a Guest credential',async()=>{
 const seen=[];const bridge=createHostingBridge({html:'shell',fetchImpl:async(url,init)=>{seen.push({url,init});return new Response('{}',{status:202,headers:{'content-type':'application/json'}});}});
 const site='https://site.example',auth={authorization:'Guest '+'a'.repeat(43)};
 assert.equal(await bridge(new Request(site+'/API/GUEST/HISTORY',{headers:auth})),null);
 assert.equal(await bridge(new Request(site+'/API/GUEST/LOOKUPS',{method:'POST',headers:{...auth,'content-type':'application/json',origin:site},body:'{}'})),null);
 assert.equal(seen.length,0);
});
test('hosting shell declares guest mode and no longer says collection is unavailable',()=>{
 prepareHosting();const shell=readFileSync(new URL('../tmp/hosting/shell.html',import.meta.url),'utf8');
 assert.match(shell,/<head><meta name="trrc-mode" content="guest">/);assert.doesNotMatch(shell,/not enabled yet/);
});
