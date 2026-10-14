import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile,readdir} from 'node:fs/promises';
import {sha256} from '../src/normalize.mjs';
import {createMemoryGuestJournal} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore} from '../src/hosted/evidence-store.mjs';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
import {createGuestHttpHandler} from '../src/hosted/guest-http.mjs';
import {createHostedEdgeHandler} from '../src/hosted/edge-bootstrap.mjs';
import {createPreservedReplaySource} from '../scripts/guest-local.mjs';
const origin='http://127.0.0.1:4175',version=(await readdir(new URL('../artifacts/',import.meta.url))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
async function setup(){let fetches=0;const service=createGuestService({journal:createMemoryGuestJournal(),store:createMemoryObjectStore(),testFixture:true,fetchImpl:async()=>{fetches++;return new Response('[]',{status:200});},preserved:await createPreservedReplaySource()});return {handler:createGuestHttpHandler({service}),fetches:()=>fetches};}
const call=(handler,path,{method='GET',token,body,headers={}}={})=>handler(new Request(origin+path,{method,headers:{...(token?{authorization:`Guest ${token}`}:{}),...(body!==undefined?{'content-type':'application/json',origin}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}));
async function session(handler){const response=await call(handler,'/api/guest/session',{method:'POST',body:{}});assert.equal(response.status,201);return (await response.json()).token;}
const enqueue=(handler,path,token,body,idem)=>call(handler,path,{method:'POST',token,body,headers:{'idempotency-key':idem}});
test('sessions issue opaque 256-bit guest tokens and every job route requires one',async()=>{
 const {handler}=await setup(),token=await session(handler);assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 for(const path of ['/api/guest/history','/api/guest/jobs/00000000-0000-4000-8000-000000000000']){const response=await call(handler,path);assert.equal(response.status,401);assert.equal((await response.json()).error.code,'TOKEN_INVALID');}
 assert.equal((await call(handler,'/api/guest/history',{headers:{authorization:`Bearer ${token}`}})).status,401);
 assert.equal(await call(handler,'/api/other'),null);
});
test('enqueue requires an Idempotency-Key, replays identical requests and refuses a changed one',async()=>{
 const {handler}=await setup(),token=await session(handler),body={artifactId:version};
 assert.equal((await call(handler,'/api/guest/replays',{method:'POST',token,body})).status,400);
 const first=await enqueue(handler,'/api/guest/replays',token,body,'http-test-key-0001');assert.equal(first.status,202);const {job}=await first.json();
 const again=await enqueue(handler,'/api/guest/replays',token,body,'http-test-key-0001');assert.equal(again.status,200);assert.equal((await again.json()).job.jobId,job.jobId);
 const changed=await enqueue(handler,'/api/guest/lookups',token,{kind:'uic',value:'000020838'},'http-test-key-0001');assert.equal(changed.status,409);assert.equal((await changed.json()).error.code,'IDEMPOTENCY_CONFLICT');
});
test('GET is read-only status; only same-origin POST advance executes one step',async()=>{
 const {handler,fetches}=await setup(),token=await session(handler),other=await session(handler);
 const {job}=await (await enqueue(handler,'/api/guest/lookups',token,{kind:'uic',value:'000020838'},'http-test-key-0002')).json();
 for(let i=0;i<3;i++){const response=await call(handler,`/api/guest/jobs/${job.jobId}`,{token});assert.equal(response.status,200);assert.equal((await response.json()).job.step,1);}
 assert.equal((await call(handler,`/api/guest/jobs/${job.jobId}/advance`,{token})).status,404);
 assert.equal((await call(handler,`/api/guest/jobs/${job.jobId}`,{method:'HEAD',token})).status,405);
 assert.equal((await call(handler,`/api/guest/jobs/${job.jobId}`,{token:other})).status,404);
 assert.equal((await call(handler,`/api/guest/jobs/${job.jobId}/advance`,{method:'POST',token,body:{},headers:{origin:'https://evil.example'}})).status,403);
 assert.equal(fetches(),0);
 const advanced=await call(handler,`/api/guest/jobs/${job.jobId}/advance`,{method:'POST',token,body:{}});assert.equal(advanced.status,200);assert.equal((await advanced.json()).job.step,2);assert.equal(fetches(),1);
});
test('guest POST bodies are JSON and bounded at 8192 bytes',async()=>{
 const {handler}=await setup();
 assert.equal((await call(handler,'/api/guest/session',{method:'POST',body:JSON.stringify({pad:'x'.repeat(8200)})})).status,413);
 assert.equal((await call(handler,'/api/guest/session',{method:'POST',body:'{}',headers:{'content-type':'text/plain'}})).status,415);
});
test('archive and terminal run routes serve only owned committed results',async()=>{
 const {handler}=await setup(),token=await session(handler);
 const {job}=await (await enqueue(handler,'/api/guest/replays',token,{artifactId:version},'http-test-key-0003')).json();
 assert.equal((await call(handler,`/api/guest/jobs/${job.jobId}/archive`,{token})).status,404);
 let view;for(let i=0;i<3;i++)view=(await (await call(handler,`/api/guest/jobs/${job.jobId}/advance`,{method:'POST',token,body:{}})).json()).job;
 assert.equal(view.state,'succeeded');assert.equal(view.result.mode,'offline_replay');
 const archive=await call(handler,`/api/guest/jobs/${job.jobId}/archive`,{token});assert.equal(archive.status,200);assert.equal(archive.headers.get('content-type'),'application/x-tar');
 assert.equal(sha256(Buffer.from(await archive.arrayBuffer())),view.result.archiveSha256);
 const run=await call(handler,`/api/guest/jobs/${job.jobId}/runs/${view.runId}`,{token});assert.equal(run.status,200);assert.equal((await run.json()).status,'succeeded');
 assert.equal((await call(handler,`/api/guest/jobs/${job.jobId}/runs/00000000-0000-4000-8000-000000000000`,{token})).status,404);
 assert.equal((await (await call(handler,'/api/guest/history',{token})).json()).jobs[0].jobId,job.jobId);
});
test('the hosted bootstrap mounts guest routes only for an explicit handler; the production entrypoint supplies none',async()=>{
 const env={SUPABASE_URL:'https://project.supabase.co'},options={getEnv:name=>env[name],fetchImpl:async()=>{throw Error('Unexpected network call');}};
 const request=()=>new Request('https://edge.example/functions/v1/trrc-explorer/api/guest/session',{method:'POST',headers:{'content-type':'application/json',origin:'https://edge.example'},body:'{}'});
 assert.equal((await createHostedEdgeHandler(options)(request())).status,405);
 let seen=null;const enabled=await createHostedEdgeHandler({...options,guest:async(_request,path)=>{seen=path;return new Response(null,{status:204});}})(request());
 assert.equal(enabled.status,204);assert.equal(seen,'/api/guest/session');
 assert.throws(()=>createHostedEdgeHandler({...options,guest:'enabled'}),/Hosted configuration unavailable/);
 assert.equal(/guest/i.test(await readFile(new URL('../supabase/functions/trrc-explorer/index.ts',import.meta.url),'utf8')),false);
});
