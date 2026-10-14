import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryGuestJournal,GUEST_LIMITS,monotonicClock} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore,recordEvidence,stageOutputs} from '../src/hosted/evidence-store.mjs';
import {createRunRecorder} from '../src/runEvents.mjs';
import {workflowView} from '../public/workflow.js';
import {sha256} from '../src/normalize.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
async function setup(kind='lookup'){
 let now=Date.parse('2026-10-13T19:30:00.000Z');
 const journal=createMemoryGuestJournal({clock:()=>now}),objects=new Map(),store=createMemoryObjectStore({objects});
 const tokenHash=sha256(randomUUID());await journal.issueToken({tokenHash});
 const {job}=await journal.enqueue({tokenHash,idemKey:'review-regression-0001',requestDigest:sha256('request'),kind,request:kind==='replay'?{artifactId:'preserved-public'}:{kind:'uic',value:'000020838'},testFixture:false});
 const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
 return {journal,store,objects,tokenHash,job,lease,tick:ms=>now+=ms};
}
test('an interrupted recorded run remains inspectable with failed and skipped stages',async()=>{
 const state=await setup('replay');
 const recorder=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v2',schemaVersion:1,transformationVersion:'rrc-odp-v2.0.0',clock:monotonicClock(state.lease.stampBase)});
 recorder.start('load');const previous=recorder.snapshot();
 await state.journal.advance({lease:state.lease,data:{},run:previous});
 state.tick(GUEST_LIMITS.laneMs+1);
 const other=sha256(randomUUID());await state.journal.issueToken({tokenHash:other});
 await state.journal.enqueue({tokenHash:other,idemKey:'review-regression-0002',requestDigest:sha256('other'),kind:'replay',request:{artifactId:'preserved-public'},testFixture:false});
 const view=await state.journal.job({tokenHash:state.tokenHash,jobId:state.job.jobId});
 assert.equal(view.state,'interrupted');assert.equal(view.errorCode,'LANE_DEADLINE');
 assert.equal(view.runId,previous.runId);
 const run=await state.journal.run({tokenHash:state.tokenHash,jobId:state.job.jobId,runId:previous.runId});
 assert.equal(run.status,'failed');assert.ok(run.endedAt);
 assert.deepEqual(run.events.slice(0,previous.events.length),previous.events);
 assert.deepEqual(workflowView(run).stages.map(s=>s.status),['failed','skipped','skipped']);
 assert.equal(run.events.find(e=>e.status==='failed').evidence.reason,'LANE_DEADLINE');
 assert.equal(run.events.find(e=>e.status==='failed').error.code,'STAGE_FAILED');
});
test('stale evidence uploads are refused before writing any object',async()=>{
 const state=await setup();state.tick(GUEST_LIMITS.leaseMs+1);
 await assert.rejects(recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:new TextEncoder().encode('untracked')}),e=>e.code==='LEASE_LOST');
 assert.equal(state.objects.size,0);
});
test('stale staged-output uploads are refused before writing any object',async()=>{
 const state=await setup();state.tick(GUEST_LIMITS.leaseMs+1);
 await assert.rejects(stageOutputs({...state,files:{'manifest.json':'untracked'}}),e=>e.code==='LEASE_LOST');
 assert.equal(state.objects.size,0);
});
test('the complete published archive is journal-reserved before upload',async()=>{
 const root=new URL('../artifacts/',import.meta.url);
 const id=(await readdir(root)).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
 const journal=createMemoryGuestJournal();let reservations=0,uploadedBeforeReservation=false;
 const reserved=new Set(),base=createMemoryObjectStore();
 const journalProxy={...journal,reserveObject:async args=>{reserved.add(args.objectKey);reservations++;return journal.reserveObject(args);}};
 // Archive is larger than any individual staged output in this preserved version.
 const store={...base,put:async(key,bytes)=>{if(bytes.length>1_300_000&&!reserved.has(key))uploadedBeforeReservation=true;return base.put(key,bytes);}};
 const service=createGuestService({journal:journalProxy,store,preserved:{artifactIds:[id],read:async(artifactId,name)=>readFile(new URL(`${artifactId}/sources/${name}`,root))}});
 const {token}=await service.issueSession();let {job}=await service.enqueueReplay({token,idemKey:'review-archive-reserve-01',request:{artifactId:id}});
 for(let i=0;i<3;i++)job=await service.advance({token,jobId:job.jobId});
 assert.equal(job.state,'succeeded');assert.equal(reservations,1);assert.equal(uploadedBeforeReservation,false);
});
