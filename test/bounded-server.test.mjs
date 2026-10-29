import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createExplorerServer} from '../scripts/serve.mjs';
const root=new URL('../',import.meta.url);
async function setup(t,fetchImpl){await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(new URL('tmp/local-api-',root));const server=createExplorerServer({runRoot:resolve(dir,'runs'),lookupRoot:resolve(dir,'lookups'),sourceRoot:resolve(dir,'sources'),outputRoot:resolve(dir,'artifacts'),fetchImpl,testFixture:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;return {base,post:(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json',...headers},body:JSON.stringify(body)})};}
test('local API requires exact same origin and loopback Host and rejects arbitrary request fields',async t=>{
 const env=await setup(t,async()=>new Response('[]'));
 for(const origin of ['', 'null','https://example.com','http://localhost:1']){const response=await env.post('/api/lookup',{kind:'uic',value:'000020838'},{origin});assert.equal(response.status,403);}
 const badHost=await env.post('/api/lookup',{kind:'uic',value:'000020838'},{host:'example.com',origin:'http://example.com'});assert.equal(badHost.status,403);
 const extra=await env.post('/api/lookup',{kind:'uic',value:'000020838',url:'https://example.com'});assert.equal(extra.status,400);
 const oversized=await env.post('/api/lookup',{kind:'uic',value:'x'.repeat(9000)});assert.equal(oversized.status,413);
 assert.equal((await env.post('/api/unknown',{})).status,404);
 assert.equal((await fetch(env.base+'/api/versions/nonexistent/download')).status,404);assert.equal((await fetch(env.base+'/api/versions/..%5craw/download')).status,404);
 const missing=await env.post('/api/collect',{lookupId:'11111111-1111-1111-1111-111111111111',sourceRecordKey:'lookup:1',startMonth:'2024-01',endMonth:'2024-01'});assert.equal(missing.status,400);assert.doesNotMatch(JSON.stringify(await missing.json()),/C:|Users|lookups|ENOENT|\\/);
});
test('lookup returns preserved candidates and one active collection rejects concurrency and retains structured failure',async t=>{
 const inventory=JSON.parse(await readFile(new URL('raw/candidate-inventory.json',root)));let release,start;const begun=new Promise(r=>start=r),blocked=new Promise(r=>release=r);
 const env=await setup(t,async url=>{if(String(url).includes('/api/views/givw'))return new Response('{"name":"Inventory"}');if(String(url).includes('/resource/givw'))return new Response(JSON.stringify([inventory[0]]));start();await blocked;return new Response('failed',{status:503});});
 const found=await (await env.post('/api/lookup',{kind:'uic',value:'000020838'})).json();assert.equal(found.candidates[0].uic_number,'000020838');
 const body={lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey,startMonth:'2024-01',endMonth:'2026-04'};
 const first=env.post('/api/collect',body);await begun;assert.equal((await env.post('/api/collect',body)).status,409);release();const response=await first;assert.equal(response.status,502);const result=await response.json();assert.equal(result.run.status,'failed');assert.deepEqual(result.run.events.filter(e=>e.status==='skipped').map(e=>e.stage),['normalize-qc','export']);
 assert.equal((await (await fetch(env.base+'/api/versions')).json()).versions.length,1,'fixtures cannot become available public versions');
});
test('a throttled lookup returns 503 SOURCE_THROTTLED without waiting when Retry-After is absent',async t=>{
 const env=await setup(t,async()=>new Response('slow down',{status:429}));
 const response=await env.post('/api/lookup',{kind:'uic',value:'000020838'});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'SOURCE_THROTTLED');
});
