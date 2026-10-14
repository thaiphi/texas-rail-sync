import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GUEST_BUDGETS,UNMETERED_LOCAL_REFERENCE,checkEgress,checkStorage,createJournalAdmission,createLocalReferenceAdmission,measureStorageObjects,meterStore,resolveAdmission,validatePlatformProof} from '../src/hosted/guest-admission.mjs';
import {createMemoryGuestJournal} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore} from '../src/hosted/evidence-store.mjs';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
import {createSupabaseObjectStore} from '../src/hosted/guest-transport.mjs';
import {createPreservedFixtureFetch,createPreservedReplaySource} from '../scripts/guest-local.mjs';
const now=Date.parse('2026-10-13T22:00:00.000Z'),iso=ms=>new Date(ms).toISOString(),refused=code=>error=>error.code===code;
const version=(await readdir(new URL('../artifacts/',import.meta.url))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
const proof=(o={},at=now)=>({source:'operator_attested',attestedAt:iso(at-60_000),expiresAt:iso(at+300_000),storageLimitBytes:1_000_000_000,storageRemainingBytes:900_000_000,projectStorageBytes:50_000_000,databaseLimitBytes:500_000_000,databaseRemainingBytes:480_000_000,projectDatabaseBytes:15_000_000,egressLimitBytes:5_000_000_000,egressRemainingBytes:4_000_000_000,...o});
function recordingAdmission(log,refuse=()=>false){
 const admission={kind:'test_meter',async admitJob(kind){log.push(['admit',kind]);},
  async reserveEgress(args){if(refuse(args))throw Object.assign(Error('quota'),{code:'EGRESS_QUOTA'});log.push(['reserve',args.kind,args.bytes]);return {};},
  wrapStore:store=>meterStore(store,bytes=>admission.reserveEgress({kind:'processing',bytes}))};
 return admission;
}
function recordingStore(log){const base=createMemoryObjectStore();return {...base,get:async(key,options)=>{log.push(['get',options?.expectedBytes]);return base.get(key);},put:async(key,bytes)=>{log.push(['put',bytes.length]);return base.put(key,bytes);}};}
test('platform proof: operator-attested, at most 600 s, exact keys and self-consistent; nothing assumed',()=>{
 assert.equal(validatePlatformProof(proof(),now).storageRemainingBytes,900_000_000);
 for(const bad of [null,{},{...proof(),source:'guest_request'},{...proof(),extra:1},proof({attestedAt:iso(now+1)}),proof({expiresAt:iso(now)}),proof({attestedAt:iso(now-1_000),expiresAt:iso(now+600_000)}),proof({storageRemainingBytes:1.5}),proof({projectStorageBytes:100_000_001}),proof({databaseRemainingBytes:500_000_001}),proof({attestedAt:'2026-10-13T21:59:00Z'})])
  assert.throws(()=>validatePlatformProof(bad,now),refused('BUDGET_UNVERIFIED'));
});
test('storage measurement covers every bucket and fails closed on any unverifiable size',()=>{
 assert.deepEqual(measureStorageObjects([{bucketId:'trrc-guest-evidence',name:'a',metadata:{size:10}},{bucketId:'other',name:'a',metadata:{size:5}}]),{projectBytes:15,guestBytes:10});
 for(const rows of [null,[{bucketId:'other',name:'x',metadata:{}}],[{bucketId:'other',name:'x',metadata:{size:'1'}}],[{bucketId:'b',name:'x',metadata:{size:1}},{bucketId:'b',name:'x',metadata:{size:1}}]])
  assert.throws(()=>measureStorageObjects(rows),refused('BUDGET_UNVERIFIED'));
});
test('storage: 250,000,000 guest bytes, and project growth plus pending plus 100,000,000 margin within attested room',()=>{
 const p=validatePlatformProof(proof({storageRemainingBytes:300_000_000}),now);
 checkStorage({proof:p,guestBytes:150_000_000,projectBytes:50_000_000,addBytes:100_000_000});
 assert.throws(()=>checkStorage({proof:p,guestBytes:150_000_001,projectBytes:50_000_000,addBytes:100_000_000}),refused('STORAGE_QUOTA'));
 checkStorage({proof:p,guestBytes:0,projectBytes:150_000_000,pendingBytes:0,addBytes:100_000_000});
 assert.throws(()=>checkStorage({proof:p,guestBytes:0,projectBytes:150_000_001,addBytes:100_000_000}),refused('STORAGE_QUOTA'));
});
test('egress: downloads limited 3 per rolling day; month and attested sums include processing; 500,000,000 margin',()=>{
 const p=validatePlatformProof(proof(),now),ledger=[0,1,2].map(i=>({kind:'download',tokenHash:'t',bytes:1,at:now-i}));
 assert.throws(()=>checkEgress({proof:p,ledger,kind:'download',tokenHash:'t',bytes:1,nowMs:now}),refused('DOWNLOAD_QUOTA'));
 checkEgress({proof:p,ledger,kind:'processing',bytes:1,nowMs:now});
 assert.throws(()=>checkEgress({proof:p,ledger:[{kind:'processing',bytes:999_999_000,at:now-1}],kind:'download',tokenHash:'u',bytes:1_001,nowMs:now}),refused('EGRESS_QUOTA'));
 const tight=validatePlatformProof(proof({egressRemainingBytes:500_000_100}),now);
 checkEgress({proof:tight,ledger:[],kind:'processing',bytes:100,nowMs:now});
 assert.throws(()=>checkEgress({proof:tight,ledger:[{kind:'processing',bytes:1,at:now-1}],kind:'processing',bytes:100,nowMs:now}),refused('EGRESS_QUOTA'));
});
test('metered store reserves before every request and refuses unknown read sizes before I/O',async()=>{
 const log=[],store=meterStore(recordingStore(log),async bytes=>{log.push(['reserve',bytes]);});
 await assert.rejects(store.get('sha256/'+'a'.repeat(64)),refused('BUDGET_UNVERIFIED'));assert.deepEqual(log,[]);
 const refusing=meterStore(recordingStore(log),async()=>{throw Object.assign(Error('q'),{code:'EGRESS_QUOTA'});});
 await assert.rejects(refusing.put('sha256/'+'a'.repeat(64),new Uint8Array(3)),refused('EGRESS_QUOTA'));assert.deepEqual(log,[]);
});
test('a replay reserves processing egress before every Storage get/put; the download is charged once, as download',async()=>{
 const log=[],service=createGuestService({journal:createMemoryGuestJournal(),store:recordingStore(log),preserved:await createPreservedReplaySource(),admission:recordingAdmission(log)});
 const {token}=await service.issueSession();let {job}=await service.enqueueReplay({token,idemKey:'admission-replay-0001',request:{artifactId:version}});
 for(let i=0;i<3;i++)job=await service.advance({token,jobId:job.jobId});assert.equal(job.state,'succeeded');
 // Shared export readers perform concurrent reads: reservations may interleave, but
 // every I/O must consume an already-recorded reservation of its exact envelope.
 const credits=[];
 for(const entry of log){
  if(entry[0]==='reserve'&&entry[1]==='processing')credits.push(entry[2]);
  if(entry[0]==='get'||entry[0]==='put'){
   const expected=(entry[0]==='put'?2:1)*entry[1]+GUEST_BUDGETS.requestOverheadBytes,index=credits.indexOf(expected);
   assert.notEqual(index,-1,JSON.stringify({entry,expected,credits}));credits.splice(index,1);
  }
 }
 assert.deepEqual(credits,[]);
 const before=log.length;await service.archive({token,jobId:job.jobId});
 assert.deepEqual(log.slice(before),[['reserve','download',job.result.archiveBytes+GUEST_BUDGETS.requestOverheadBytes],['get',job.result.archiveBytes]]);
});
test('a source fetch reserves its bounded envelope before the network; a refused reservation performs no I/O',async()=>{
 const log=[],fixture=await createPreservedFixtureFetch(fileURLToPath(new URL(`../artifacts/${version}/sources/`,import.meta.url)));
 const service=createGuestService({journal:createMemoryGuestJournal(),store:recordingStore(log),testFixture:true,fetchImpl:async(url,init)=>{log.push(['fetch']);return fixture(url,init);},admission:recordingAdmission(log)});
 const {token}=await service.issueSession(),{job}=await service.enqueueLookup({token,idemKey:'admission-lookup-0001',request:{kind:'uic',value:'000020838'}});
 await service.advance({token,jobId:job.jobId});await service.advance({token,jobId:job.jobId});
 const fetches=log.flatMap((entry,index)=>entry[0]==='fetch'?[index]:[]);assert.equal(fetches.length,2);
 // The shared fetcher's unchanged per-source cap is still 10 MB even when this
 // job has less evidence room left. Reserve that actual network envelope each time.
 for(const at of fetches)assert.deepEqual(log[at-1],['reserve','processing',10_065_536]);
 const quiet=[],refusing=createGuestService({journal:createMemoryGuestJournal(),store:recordingStore(quiet),preserved:await createPreservedReplaySource(),admission:recordingAdmission(quiet,args=>args.kind==='processing')});
 const session=await refusing.issueSession(),{job:replay}=await refusing.enqueueReplay({token:session.token,idemKey:'admission-replay-0002',request:{artifactId:version}});
 const failed=await refusing.advance({token:session.token,jobId:replay.jobId});
 assert.equal(failed.state,'failed');assert.equal(failed.errorCode,'EGRESS_QUOTA');assert.equal(quiet.some(entry=>['get','put'].includes(entry[0])),false);
});
test('local reference admission: missing or expired proof refuses new jobs and downloads before reads',async()=>{
 let valid=true;const admission=createLocalReferenceAdmission({attest:async()=>valid?proof():proof({expiresAt:iso(now-1)}),clock:()=>now});
 const raw=createMemoryObjectStore(),service=createGuestService({journal:createMemoryGuestJournal(),store:raw,preserved:await createPreservedReplaySource(),admission});
 const {token}=await service.issueSession();let {job}=await service.enqueueReplay({token,idemKey:'admission-replay-0003',request:{artifactId:version}});
 for(let i=0;i<3;i++)job=await service.advance({token,jobId:job.jobId});assert.equal(job.state,'succeeded');
 valid=false;
 await assert.rejects(service.archive({token,jobId:job.jobId}),refused('BUDGET_UNVERIFIED'));
 await assert.rejects(service.enqueueReplay({token,idemKey:'admission-replay-0004',request:{artifactId:version}}),refused('BUDGET_UNVERIFIED'));
 assert.equal((await service.enqueueReplay({token,idemKey:'admission-replay-0003',request:{artifactId:version}})).replayed,true);
});
test('service journals cannot run unmetered; the in-memory reference stays explicitly unmetered',()=>{
 const store=createMemoryObjectStore(),service={kind:'supabase_service',claim:async()=>{},reserveEgress:async()=>({})};
 assert.throws(()=>createGuestService({journal:service,store}),refused('GUEST_UNAVAILABLE'));
 assert.throws(()=>createGuestService({journal:service,store,admission:UNMETERED_LOCAL_REFERENCE}),refused('GUEST_UNAVAILABLE'));
 assert.throws(()=>resolveAdmission(service,{admitJob:async()=>{},reserveEgress:async()=>{}}),refused('GUEST_UNAVAILABLE'));
 assert.equal(resolveAdmission(createMemoryGuestJournal(),null),UNMETERED_LOCAL_REFERENCE);
 assert.equal(resolveAdmission(service,createJournalAdmission(service)).kind,'journal_metered');
 assert.throws(()=>createJournalAdmission({kind:'supabase_service'}),refused('GUEST_UNAVAILABLE'));
 assert.throws(()=>createLocalReferenceAdmission({}),refused('GUEST_UNAVAILABLE'));
});
test('transport reads are capped at the recorded size; invalid sizes are refused before any request',async()=>{
 let calls=0;const store=createSupabaseObjectStore({url:'https://local-test.supabase.co',secretKey:'sb_secret_local_test',fetchImpl:async()=>{calls++;return new Response(new Uint8Array(10));}}),key='sha256/'+'a'.repeat(64);
 await assert.rejects(store.get(key,{expectedBytes:-1}),refused('STORAGE_INVALID'));assert.equal(calls,0);
 await assert.rejects(store.get(key,{expectedBytes:5}),refused('GUEST_UNAVAILABLE'));
});
