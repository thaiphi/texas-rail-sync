// ZC-02: the optional Postgres run index, the container write-guard setting and /api/health.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunIndex,connectRunIndex,RUN_INDEX_SCHEMA} from '../src/runIndex.mjs';
import {createExplorerServer,trustedAddressList,isSameOriginWrite,LOOPBACK} from '../scripts/serve.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fakePool({failOn=null}={}){
 const calls=[];let released=0;
 const query=async(text,values)=>{calls.push({text:text.trim().split(/\s+/).slice(0,3).join(' '),values});if(failOn&&text.includes(failOn))throw Object.assign(Error('boom'),{code:'XX000'});
  if(text.startsWith('select'))return {rows:[{runs:2,versions:1,indexed_at:new Date('2026-11-05T12:00:00Z')}]};return {rows:[]};};
 return {calls,get released(){return released;},query,connect:async()=>({query,release:()=>{released++;}})};
}
const runs=[{runId:'1e6243d3-91f6-408d-ab61-f97770920ade',mode:'offline_replay',status:'succeeded',startedAt:'2026-10-09T20:32:40.177Z',endedAt:'2026-10-09T20:32:40.217Z',artifactId:'a1'},{runId:'2012fe57-a89b-45f9-8249-3f598d2e27ea',mode:'live',status:'failed',startedAt:'2026-10-10T00:00:00.000Z'}];
const versions=[{artifactId:'a1',runId:runs[0].runId,classification:'public_reported',defaultPinned:true,publicationPinsSha256:'f'.repeat(64),startedAt:runs[0].startedAt}];

test('sync migrates once, upserts every run and version in one transaction, then releases the client',async()=>{
 const pool=fakePool(),index=createRunIndex({pool});
 await index.sync({runs,versions});await index.sync({runs,versions});
 assert.equal(pool.calls.filter(call=>call.text.startsWith('create table')).length,1);
 const first=pool.calls.slice(1,6).map(call=>call.text);
 assert.deepEqual(first,['begin','insert into explorer_runs(run_id,mode,status,started_at,ended_at,artifact_id,indexed_at)','insert into explorer_runs(run_id,mode,status,started_at,ended_at,artifact_id,indexed_at)','insert into explorer_versions(artifact_id,run_id,classification,default_pinned,publication_pins_sha256,collected_at,indexed_at)','commit']);
 assert.deepEqual(pool.calls[3].values,[runs[1].runId,'live','failed','2026-10-10T00:00:00.000Z',null,null]);
 assert.equal(pool.released,2);
});

test('a failed sync rolls back, releases the client and reports degraded with the error code only',async()=>{
 const pool=fakePool({failOn:'explorer_versions(artifact_id'}),index=createRunIndex({pool});
 await assert.rejects(index.sync({runs,versions}),/boom/);
 assert.ok(pool.calls.some(call=>call.text==='rollback'));assert.equal(pool.released,1);
 assert.deepEqual(await index.status(),{status:'degraded',runs:2,versions:1,indexedAt:'2026-11-05T12:00:00.000Z',lastError:'XX000'});
});

test('status reports counts only, and error with a code when the database is unreachable',async()=>{
 assert.deepEqual(await createRunIndex({pool:fakePool()}).status(),{status:'ok',runs:2,versions:1,indexedAt:'2026-11-05T12:00:00.000Z'});
 const down={query:async()=>{throw Object.assign(Error('connect ECONNREFUSED 10.0.0.1:5432'),{code:'ECONNREFUSED'});},connect:async()=>{throw Error('down');}};
 assert.deepEqual(await createRunIndex({pool:down}).status(),{status:'error',code:'ECONNREFUSED'});
});

test('schema creates the two index tables only',()=>{
 assert.deepEqual([...RUN_INDEX_SCHEMA.matchAll(/create table if not exists (\w+)/g)].map(match=>match[1]),['explorer_runs','explorer_versions']);
});

test('trusted write addresses: loopback by default; extra addresses must be IPs and keep loopback',()=>{
 assert.equal(trustedAddressList(undefined),LOOPBACK);assert.equal(trustedAddressList(' '),LOOPBACK);
 assert.deepEqual(trustedAddressList('172.30.0.1'),[...LOOPBACK,'172.30.0.1']);
 assert.throws(()=>trustedAddressList('172.30.0.1,evil.example'),/not an IP address: evil.example/);
 assert.throws(()=>trustedAddressList('0.0.0.0/0'),/not an IP address/);
});

test('same-origin write check: the Host/Origin rules stay; only the peer address list is configurable',()=>{
 const base={address:'172.30.0.1',port:4391,host:'127.0.0.1:4391',origin:'http://127.0.0.1:4391'};
 assert.equal(isSameOriginWrite(base),false);
 assert.equal(isSameOriginWrite({...base,trusted:trustedAddressList('172.30.0.1')}),true);
 const trusted=trustedAddressList('172.30.0.1');
 assert.equal(isSameOriginWrite({...base,trusted,origin:'https://evil.example'}),false);
 assert.equal(isSameOriginWrite({...base,trusted,host:'explorer.example:4391',origin:'http://explorer.example:4391'}),false);
 assert.equal(isSameOriginWrite({...base,trusted,host:'127.0.0.1:4390',origin:'http://127.0.0.1:4390'}),false);
 assert.equal(isSameOriginWrite({...base,address:'127.0.0.1'}),true);
});

async function listen(server){await new Promise(done=>server.listen(0,'127.0.0.1',done));return `http://127.0.0.1:${server.address().port}`;}

test('/api/health: database off without an index; counts with one; refreshIndex feeds the index from the files',async t=>{
 const plain=createExplorerServer();t.after(()=>plain.close());
 assert.deepEqual(await (await fetch(`${await listen(plain)}/api/health`)).json(),{schemaVersion:1,status:'ok',database:{status:'off'}});
 const synced=[];const runIndex={sync:async data=>{synced.push(data);},status:async()=>({status:'ok',runs:41,versions:3,indexedAt:null})};
 // A private, empty runs folder: other tests write run records concurrently.
 const runRoot=await mkdtemp(join(tmpdir(),'run-index-'));t.after(()=>rm(runRoot,{recursive:true,force:true}));
 const indexed=createExplorerServer({runIndex,runRoot});t.after(()=>indexed.close());
 const base=await listen(indexed);
 assert.deepEqual((await (await fetch(`${base}/api/health`)).json()).database,{status:'ok',runs:41,versions:3,indexedAt:null});
 await indexed.refreshIndex();
 const files=await (await fetch(`${base}/api/runs`)).json();
 assert.equal(synced.length,1);assert.deepEqual(synced[0].runs,files.runs);assert.ok(synced[0].versions.some(version=>version.defaultPinned));
});

test('a failing index never fails a request',async t=>{
 const server=createExplorerServer({runIndex:{sync:async()=>{throw Object.assign(Error('down'),{code:'ECONNREFUSED'});},status:async()=>({status:'error',code:'ECONNREFUSED'})}});t.after(()=>server.close());
 const base=await listen(server),errors=[];const original=console.error;console.error=message=>errors.push(message);
 try{await server.refreshIndex();}finally{console.error=original;}
 assert.deepEqual(errors,['run index: ECONNREFUSED']);
 assert.equal((await fetch(`${base}/api/runs`)).status,200);
 assert.deepEqual((await (await fetch(`${base}/api/health`)).json()).database,{status:'error',code:'ECONNREFUSED'});
});

test('real Postgres round trip (runs only when DATABASE_URL is set, e.g. in CI)',{skip:!process.env.DATABASE_URL&&'DATABASE_URL not set'},async t=>{
 const index=await connectRunIndex({connectionString:process.env.DATABASE_URL});t.after(()=>index.close());
 await index.sync({runs,versions});await index.sync({runs,versions});
 const status=await index.status();
 assert.equal(status.status,'ok');assert.ok(status.runs>=2);assert.ok(status.versions>=1);
});
