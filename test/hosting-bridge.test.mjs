import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostingBridge} from '../src/hosted/hosting-bridge.mjs';
import {prepareHosting} from '../scripts/prepare-hosting.mjs';
import {mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
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
