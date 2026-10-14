import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {randomUUID} from 'node:crypto';
import {buildVersionArchive} from '../src/versionArchive.mjs';
import {createHostedEdgeHandler} from '../src/hosted/edge-bootstrap.mjs';
const journalModule=await import('../src/hosted/guest-journal.mjs').catch(()=>({}));
const evidenceModule=await import('../src/hosted/evidence-store.mjs').catch(()=>({}));
const serviceModule=await import('../src/hosted/guest-steps.mjs').catch(()=>({}));
const root=new URL('../',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('guest ownership, immutable replay identity and stale leases fail closed',async()=>{
 assert.equal(typeof journalModule.createMemoryGuestJournal,'function');let now=Date.now();
 const journal=journalModule.createMemoryGuestJournal({clock:()=>now}),tokenHash='a'.repeat(64),other='b'.repeat(64);
 await journal.issueToken({tokenHash});await journal.issueToken({tokenHash:other});
 const request={tokenHash,idemKey:'release-test-key-0001',kind:'replay',requestDigest:'1'.repeat(64),request:{artifactId:'preserved-public'},testFixture:false};
 const first=await journal.enqueue(request),again=await journal.enqueue(request);assert.equal(again.job.jobId,first.job.jobId);assert.equal(again.replayed,true);
 await assert.rejects(journal.enqueue({...request,requestDigest:'2'.repeat(64)}),error=>error.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(journal.job({tokenHash:other,jobId:first.job.jobId}),error=>error.code==='NOT_FOUND');
 const acquired=await journal.claim({tokenHash,jobId:first.job.jobId,leaseOwner:randomUUID()});assert.ok(acquired.lease);
 const duplicate=await journal.claim({tokenHash,jobId:first.job.jobId,leaseOwner:randomUUID()});assert.equal(duplicate.lease,null);
 now+=180001;const reclaimed=await journal.claim({tokenHash,jobId:first.job.jobId,leaseOwner:randomUUID()});assert.ok(reclaimed.lease.fence>acquired.lease.fence);
 await assert.rejects(journal.advance({lease:acquired.lease,data:{}}),error=>error.code==='LEASE_LOST');
});
test('owned preserved-public replay commits a real verified package without claiming live collection',async()=>{
 assert.equal(typeof serviceModule.createGuestService,'function');
 const id=(await readdir(new URL('artifacts/',root))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));assert.ok(id);
 const journal=journalModule.createMemoryGuestJournal(),store=evidenceModule.createMemoryObjectStore();
 const service=serviceModule.createGuestService({journal,store,preserved:{artifactIds:[id],read:async(artifactId,name)=>{assert.equal(artifactId,id);return readFile(new URL(`artifacts/${id}/sources/${name}`,root));}}});
 const session=await service.issueSession(),queued=await service.enqueueReplay({token:session.token,idemKey:'release-replay-key-0001',request:{artifactId:id}});
 let job=queued.job;for(let i=0;i<5&&!['succeeded','failed','interrupted'].includes(job.state);i++)job=await service.advance({token:session.token,jobId:job.jobId});
 assert.equal(job.state,'succeeded',JSON.stringify(job));
 const {bytes,artifactId}=await service.archive({token:session.token,jobId:job.jobId});assert.equal(artifactId,id);
 const pinsBytes=await readFile(new URL(`artifacts/${id}/version-pins.json`,root)),pins={...JSON.parse(pinsBytes),publicationPinsSha256:hash(pinsBytes),defaultPinned:false};
 const expected=await buildVersionArchive({directory:new URL(`artifacts/${id}/`,root),pins});assert.deepEqual(Buffer.from(bytes),Buffer.from(expected));
 const record=await service.run({token:session.token,jobId:job.jobId,runId:job.runId});
 assert.equal(record.mode,'offline_replay');assert.equal(record.testFixture,false);assert.equal(record.status,'succeeded');
});
test('hosted Edge mounts guest routes only when TRRC_GUEST_ENABLED is exactly 1',async()=>{
 const env=extra=>name=>({SUPABASE_URL:'https://p.supabase.co',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_x'}),SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_x'}),...extra})[name];
 let built=0;const createGuest=()=>{built++;return {handle:async()=>new Response('{}',{status:201}),maintain:async()=>{}};};
 const off=createHostedEdgeHandler({getEnv:env({}),createGuest,createTransport:()=>{throw Error('no reads');}});
 assert.equal((await off(new Request('https://p.supabase.co/functions/v1/trrc-explorer/api/guest/session',{method:'POST'}))).status,405);assert.equal(built,0);
 const on=createHostedEdgeHandler({getEnv:env({TRRC_GUEST_ENABLED:'1',TRRC_GUEST_ALLOWED_ORIGIN:'https://explorer.example'}),createGuest,createTransport:()=>{throw Error('no reads');}});
 assert.equal((await on(new Request('https://p.supabase.co/functions/v1/trrc-explorer/api/guest/session',{method:'POST'}))).status,201);assert.equal(built,1);
 assert.equal((await createHostedEdgeHandler({getEnv:env({TRRC_GUEST_ENABLED:'true'}),createGuest,createTransport:()=>{throw Error('no reads');}})(new Request('https://p.supabase.co/trrc-explorer/api/guest/session',{method:'POST'}))).status,405);
});
test('a guest session schedules maintenance at most once per ten minutes and never fails the response',async()=>{
 let maint=0,t=0;const scheduled=[],warnings=[];
 const failures=[Object.assign(Error('storage down https://p.supabase.co/x?token=secret'),{code:'STORAGE_UNAVAILABLE'}),Error('sweep failed sb_secret_x')];
 const createGuest=()=>({handle:async()=>new Response('{}',{status:201}),maintain:async()=>{throw failures[maint++];}});
 const env=name=>({SUPABASE_URL:'https://p.supabase.co',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_x'}),TRRC_GUEST_ENABLED:'1',TRRC_GUEST_ALLOWED_ORIGIN:'https://explorer.example'})[name];
 const originalWarn=console.warn;console.warn=(...args)=>{warnings.push(args);};
 try{
  const handler=createHostedEdgeHandler({getEnv:env,createGuest,clock:()=>t,waitUntil:p=>scheduled.push(p),createTransport:()=>{throw Error('no reads');}});
  const session=()=>handler(new Request('https://p.supabase.co/trrc-explorer/api/guest/session',{method:'POST'}));
  assert.equal((await session()).status,201);await Promise.allSettled(scheduled);assert.equal(maint,1);assert.equal(warnings.length,1);
  t+=60_000;assert.equal((await session()).status,201);await Promise.allSettled(scheduled);assert.equal(maint,1);assert.equal(warnings.length,1);
  t+=600_001;assert.equal((await session()).status,201);await Promise.allSettled(scheduled);assert.equal(maint,2);assert.equal(warnings.length,2);
  assert.deepEqual(warnings.map(args=>args.length),[1,1]);
  assert.deepEqual(warnings.map(([line])=>JSON.parse(line)),[{event:'guest_maintenance_failed',code:'STORAGE_UNAVAILABLE'},{event:'guest_maintenance_failed',code:'UNKNOWN'}]);
  for(const [line] of warnings)assert.doesNotMatch(line,/storage down|sweep failed|token|secret|https?:|\bat\b/);
 }finally{console.warn=originalWarn;}
});
