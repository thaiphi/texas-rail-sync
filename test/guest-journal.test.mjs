import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sha256} from '../src/normalize.mjs';
import {createMemoryGuestJournal,GUEST_LIMITS,monotonicClock} from '../src/hosted/guest-journal.mjs';
import {createRunRecorder} from '../src/runEvents.mjs';
import {workflowView} from '../public/workflow.js';
const start=Date.parse('2026-10-13T05:00:00.000Z'),owner=()=>randomUUID(),key=label=>`idem-${label}-0123456789`,digest=value=>sha256(JSON.stringify(value));
function setup(limits){let now=start;return {journal:createMemoryGuestJournal({clock:()=>now,...(limits?{limits:{...GUEST_LIMITS,...limits}}:{})}),tick:ms=>{now+=ms;}};}
async function token(journal){const tokenHash=sha256(randomUUID());await journal.issueToken({tokenHash});return tokenHash;}
const lookup=(journal,tokenHash,label='a',value='000020838')=>journal.enqueue({tokenHash,idemKey:key(label),kind:'lookup',requestDigest:digest({kind:'uic',value}),request:{kind:'uic',value},testFixture:true});
const claim=(journal,tokenHash,jobId)=>journal.claim({tokenHash,jobId,leaseOwner:owner()});
test('jobs are visible only to their unexpired owner token',async()=>{
 const {journal,tick}=setup(),a=await token(journal),b=await token(journal),{job}=await lookup(journal,a);
 assert.equal((await journal.job({tokenHash:a,jobId:job.jobId})).state,'queued');
 await assert.rejects(journal.job({tokenHash:b,jobId:job.jobId}),error=>error.code==='NOT_FOUND');
 await assert.rejects(claim(journal,b,job.jobId),error=>error.code==='NOT_FOUND');
 await assert.rejects(journal.job({tokenHash:sha256('never issued'),jobId:job.jobId}),error=>error.code==='TOKEN_INVALID');
 tick(GUEST_LIMITS.tokenMs);
 await assert.rejects(journal.job({tokenHash:a,jobId:job.jobId}),error=>error.code==='TOKEN_EXPIRED');
});
test('idempotent replay returns the same job before quota checks; a changed request conflicts',async()=>{
 const {journal}=setup({lookupsPerHour:1}),a=await token(journal),first=await lookup(journal,a);
 const again=await lookup(journal,a);assert.equal(again.replayed,true);assert.equal(again.job.jobId,first.job.jobId);
 await assert.rejects(lookup(journal,a,'a','000099999'),error=>error.code==='IDEMPOTENCY_CONFLICT');
 assert.equal((await journal.history({tokenHash:a})).length,1);
});
test('one active job per session and per lane across the project',async()=>{
 const {journal}=setup(),a=await token(journal),b=await token(journal),c=await token(journal);
 await lookup(journal,a);
 await assert.rejects(lookup(journal,a,'b'),error=>error.code==='TOKEN_BUSY');
 await assert.rejects(lookup(journal,b,'b'),error=>error.code==='LANE_BUSY');
 const replay=await journal.enqueue({tokenHash:b,idemKey:key('r'),kind:'replay',requestDigest:digest({artifactId:'x'}),request:{artifactId:'x'},testFixture:false});assert.equal(replay.job.state,'queued');
 await assert.rejects(journal.enqueue({tokenHash:c,idemKey:key('r2'),kind:'replay',requestDigest:digest({artifactId:'y'}),request:{artifactId:'y'},testFixture:false}),error=>error.code==='LANE_BUSY');
});
test('claims are fenced: a live lease is never shared and a stale lease commits nothing',async()=>{
 const {journal,tick}=setup(),a=await token(journal),{job}=await lookup(journal,a);
 const first=await claim(journal,a,job.jobId);assert.equal(first.lease.fence,1);
 const duplicate=await claim(journal,a,job.jobId);assert.equal(duplicate.lease,null);assert.equal(duplicate.job.state,'running');
 tick(GUEST_LIMITS.leaseMs+1);
 const second=await claim(journal,a,job.jobId);assert.equal(second.lease.fence,2);assert.equal(second.job.attempt,2);
 const hash='a'.repeat(64);
 for(const operation of [()=>journal.advance({lease:first.lease,data:{}}),()=>journal.renew({lease:first.lease}),()=>journal.fail({lease:first.lease,errorCode:'HTTP_ERROR'}),()=>journal.recordEvidence({lease:first.lease,attemptId:'L1-a1',path:'lookup-metadata.json',sha256:hash,bytes:1,objectKey:`sha256/${hash}`})])await assert.rejects(operation(),error=>error.code==='LEASE_LOST');
 assert.equal((await journal.job({tokenHash:a,jobId:job.jobId})).step,1);
 const view=await journal.advance({lease:second.lease,data:{}});assert.equal(view.step,2);assert.equal(view.state,'queued');
});
test('status reads never claim, reap or change fences',async()=>{
 const {journal,tick}=setup(),a=await token(journal),{job}=await lookup(journal,a);
 for(let i=0;i<5;i++)await journal.job({tokenHash:a,jobId:job.jobId});
 const {lease}=await claim(journal,a,job.jobId);assert.equal(lease.fence,1);
 tick(GUEST_LIMITS.laneMs+GUEST_LIMITS.leaseMs);
 assert.equal((await journal.job({tokenHash:a,jobId:job.jobId})).state,'running');
});
test('abandoned jobs past the lane deadline are interrupted by another guest and fenced out',async()=>{
 const {journal,tick}=setup(),a=await token(journal),b=await token(journal),{job}=await lookup(journal,a),{lease}=await claim(journal,a,job.jobId);
 tick(GUEST_LIMITS.laneMs);
 assert.equal((await lookup(journal,b,'b')).job.state,'queued');
 const view=await journal.job({tokenHash:a,jobId:job.jobId});assert.equal(view.state,'interrupted');assert.equal(view.errorCode,'LANE_DEADLINE');
 await assert.rejects(journal.advance({lease,data:{}}),error=>error.code==='LEASE_LOST');
});
test('evidence admission fails closed at 10,000,000 total bytes and selected evidence is never replaced',async()=>{
 const {journal}=setup(),a=await token(journal),{job}=await lookup(journal,a),{lease}=await claim(journal,a,job.jobId);
 const entry=(held,attemptId,path,letter,bytes)=>({lease:held,attemptId,path,sha256:letter.repeat(64),bytes,objectKey:`sha256/${letter.repeat(64)}`});
 await journal.recordEvidence(entry(lease,'L1-a1','lookup-metadata.json','a',9_999_000));
 await assert.rejects(journal.recordEvidence(entry(lease,'L1-a1','lookup-metadata.source.json','b',1_001)),error=>error.code==='SOURCE_LIMIT');
 assert.equal((await journal.recordEvidence(entry(lease,'L1-a1','lookup-metadata.source.json','b',1_000))).usedBytes,10_000_000);
 await assert.rejects(journal.recordEvidence(entry(lease,'L1-a1','lookup-metadata.json','c',1)),error=>error.code==='EVIDENCE_CONFLICT');
 await journal.advance({lease,data:{},select:'L1-a1'});
 assert.deepEqual((await journal.evidence({jobId:job.jobId})).map(row=>row.path),['lookup-metadata.json','lookup-metadata.source.json']);
 const next=await claim(journal,a,job.jobId);
 await journal.recordEvidence(entry(next.lease,'L2-a1','lookup-metadata.json','d',0));
 await assert.rejects(journal.advance({lease:next.lease,data:{},select:'L2-a1'}),error=>error.code==='EVIDENCE_CONFLICT');
});
test('per-session quota is enforced while idempotent replay is never charged',async()=>{
 const {journal}=setup({lookupsPerHour:1}),a=await token(journal),{job}=await lookup(journal,a),{lease}=await claim(journal,a,job.jobId);
 await journal.fail({lease,errorCode:'HTTP_ERROR'});
 await assert.rejects(lookup(journal,a,'second'),error=>error.code==='QUOTA_EXCEEDED');
 assert.equal((await lookup(journal,a)).replayed,true);
});
test('the journal clock is monotonic and success requires the final-step publication commit',async()=>{
 const clock=monotonicClock('2026-10-13T05:00:00.000Z');assert.deepEqual([clock(),clock()],['2026-10-13T05:00:00.000Z','2026-10-13T05:00:00.001Z']);
 assert.throws(()=>monotonicClock('2026-10-13T05:00:00Z'),error=>error.code==='RUN_STATE_INVALID');
 const {journal}=setup(),a=await token(journal),{job}=await lookup(journal,a),{lease}=await claim(journal,a,job.jobId);
 await assert.rejects(journal.publish({lease,result:{}}),error=>error.code==='RUN_STATE_INVALID');
 assert.equal((await journal.job({tokenHash:a,jobId:job.jobId})).state,'running');
});
const replayJob=(journal,tokenHash,label)=>journal.enqueue({tokenHash,idemKey:key(label),kind:'replay',requestDigest:digest({artifactId:label}),request:{artifactId:label},testFixture:false});
test('a lane-deadline interruption appends one terminal failed event to an existing run and makes it inspectable',async()=>{
 const {journal,tick}=setup(),a=await token(journal),b=await token(journal),{job}=await replayJob(journal,a,'x');
 let {lease}=await claim(journal,a,job.jobId);await journal.advance({lease,data:{}});
 ({lease}=await claim(journal,a,job.jobId));
 const recorder=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v2',schemaVersion:1,transformationVersion:'rrc-odp-v2.0.0',clock:monotonicClock(lease.stampBase)});recorder.start('load');
 const before=recorder.snapshot();await journal.advance({lease,data:{},run:before});
 tick(GUEST_LIMITS.laneMs);await replayJob(journal,b,'y');
 const view=await journal.job({tokenHash:a,jobId:job.jobId});
 assert.equal(view.state,'interrupted');assert.equal(view.errorCode,'LANE_DEADLINE');assert.equal(view.runId,before.runId);
 const run=await journal.run({tokenHash:a,jobId:job.jobId,runId:before.runId});
 assert.deepEqual(run.events.slice(0,before.events.length),before.events);assert.equal(run.status,'failed');
 assert.deepEqual(workflowView(run).stages.map(stage=>stage.status),['failed','skipped','skipped']);
 const failed=run.events.find(event=>event.status==='failed');
 assert.equal(failed.evidence.reason,'LANE_DEADLINE');assert.ok(Date.parse(failed.timestamp)>Date.parse(before.events.at(-1).timestamp));
 assert.equal(run.events.some(event=>event.status==='succeeded'),false);
});
test('an interruption before any run exists invents no run',async()=>{
 const {journal,tick}=setup(),a=await token(journal),b=await token(journal),{job}=await lookup(journal,a);await claim(journal,a,job.jobId);
 tick(GUEST_LIMITS.laneMs);await lookup(journal,b,'b');
 const view=await journal.job({tokenHash:a,jobId:job.jobId});assert.equal(view.state,'interrupted');assert.equal(view.runId,null);
 await assert.rejects(journal.run({tokenHash:a,jobId:job.jobId,runId:randomUUID()}),error=>error.code==='NOT_FOUND');
});
