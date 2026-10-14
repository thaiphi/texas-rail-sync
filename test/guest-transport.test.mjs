import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseObjectStore,createSupabaseGuestJournal} from '../src/hosted/guest-transport.mjs';
import {sha256} from '../src/normalize.mjs';
const base={url:'https://local-test.supabase.co',secretKey:'sb_secret_local_test_not_a_credential'};
const bytes=new TextEncoder().encode('recorded source'),key=`sha256/${sha256(bytes)}`;
test('unsafe bucket paths and non-server credentials are rejected before network',()=>{
 for(const bucket of ['../trrc_archive','guest/bucket','guest%2fbucket','guest?other=1','guest#fragment','',null])assert.throws(()=>createSupabaseObjectStore({...base,bucket}),e=>e.code==='GUEST_UNAVAILABLE');
 for(const secretKey of ['sb_publishable_not_secret','legacy-jwt',''])assert.throws(()=>createSupabaseObjectStore({...base,secretKey}),e=>e.code==='GUEST_UNAVAILABLE');
});
test('object writes reject invalid bytes, oversized buffers and substituted hash addresses',async()=>{
 let calls=0;const store=createSupabaseObjectStore({...base,fetchImpl:async()=>{calls++;return new Response(null,{status:201});}});
 for(const bad of ['recorded source',new ArrayBuffer(3),null])await assert.rejects(store.put(key,bad),e=>e.code==='STORAGE_INVALID');
 await assert.rejects(store.put(key,new Uint8Array(80_106_497)),e=>e.code==='STORAGE_INVALID');
 await assert.rejects(store.put(`sha256/${'a'.repeat(64)}`,bytes),e=>e.code==='STORAGE_INVALID');
 assert.equal(calls,0);
});
test('accepted upload bytes are owned before awaits and empty evidence remains valid',async()=>{
 let body,release;const waiting=new Promise(r=>release=r),owned=bytes.slice();
 const store=createSupabaseObjectStore({...base,fetchImpl:async(_url,init)=>{body=init.body;await waiting;return new Response(null,{status:201});}});
 const pending=store.put(key,owned);owned.fill(0);release();assert.equal(await pending,'created');assert.deepEqual(new Uint8Array(body),bytes);
 const empty=new Uint8Array(),emptyStore=createSupabaseObjectStore({...base,fetchImpl:async()=>new Response(null,{status:201})});
 assert.equal(await emptyStore.put(`sha256/${sha256(empty)}`,empty),'created');
});
test('missing objects stay distinct from service failures and oversized responses',async()=>{
 for(const response of [()=>Response.json({statusCode:'404'},{status:400}),()=>new Response(null,{status:404})]){
  const store=createSupabaseObjectStore({...base,fetchImpl:async()=>response()});await assert.rejects(store.get(key),e=>e.code==='ENOENT');
 }
 const failed=createSupabaseObjectStore({...base,fetchImpl:async()=>Response.json({message:'unavailable'},{status:503})});await assert.rejects(failed.get(key),e=>e.code==='STORAGE_UNAVAILABLE');
 const large=createSupabaseObjectStore({...base,fetchImpl:async()=>new Response('x',{headers:{'content-length':'80106497'}})});await assert.rejects(large.get(key),e=>e.code==='GUEST_UNAVAILABLE');
});
test('add-only conflicts verify existing bytes, refuse substitutions and keep redirect/error semantics',async()=>{
 let uploaded;
 const store=createSupabaseObjectStore({...base,fetchImpl:async(url,init)=>{
  assert.match(url,/\/storage\/v1\/object\/trrc-guest-evidence\/sha256\//);assert.equal(init.redirect,'error');assert.equal(init.headers.apikey,base.secretKey);
  if(init.method==='POST'){uploaded=init;return new Response(null,{status:409});}return new Response(bytes);
 }});
 assert.equal(await store.put(key,bytes),'verified_existing');assert.equal(uploaded.headers['x-upsert'],'false');
 const changed=createSupabaseObjectStore({...base,fetchImpl:async(_url,init)=>init.method==='POST'?new Response(null,{status:409}):new Response('changed')});
 await assert.rejects(changed.put(key,bytes),e=>e.code==='OBJECT_CONFLICT');
});
test('maintenance methods use actual RPC names and malformed journal responses fail closed',async()=>{
 const names=[];const journal=createSupabaseGuestJournal({...base,fetchImpl:async(url,init)=>{names.push(new URL(url).pathname.split('/').at(-1));assert.ok(JSON.parse(init.body).args);return Response.json([]);}});
 await journal.claimMaintenance({leaseOwner:'local-test'});await journal.cleanupCandidates({lease:{}});await journal.confirmCleanup({lease:{},keys:[]});
 assert.deepEqual(names,['trrc_guest_claim_maintenance','trrc_guest_cleanup_candidates','trrc_guest_confirm_cleanup']);
 const broken=createSupabaseGuestJournal({...base,fetchImpl:async()=>new Response('not JSON')});await assert.rejects(broken.job({}),e=>e.code==='GUEST_UNAVAILABLE');
});
test('unavailable or missing upload readback is a service failure, not a fabricated conflict',async()=>{
 for(const status of [503,404]){
  const store=createSupabaseObjectStore({...base,fetchImpl:async(_url,init)=>new Response(null,{status:init.method==='POST'?503:status})});
  await assert.rejects(store.put(key,bytes),e=>e.code==='STORAGE_UNAVAILABLE');
 }
});
test('deletion uses the supported exact-key batch endpoint without a wildcard',async()=>{
 const store=createSupabaseObjectStore({...base,fetchImpl:async(url,init)=>{
  assert.equal(new URL(url).pathname,'/storage/v1/object/trrc-guest-evidence');assert.equal(init.method,'DELETE');
  assert.equal(init.headers['content-type'],'application/json');assert.deepEqual(JSON.parse(init.body),{prefixes:[key]});
  return Response.json([]);
 }});
 await store.delete(key);
});
