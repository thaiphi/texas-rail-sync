import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {sha256} from '../src/normalize.mjs';
import {workflowView} from '../public/workflow.js';
import {buildVersionArchive} from '../src/versionArchive.mjs';
import {createMemoryGuestJournal,GUEST_LIMITS} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore} from '../src/hosted/evidence-store.mjs';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
import {createPreservedFixtureFetch,createPreservedReplaySource} from '../scripts/guest-local.mjs';
const root=new URL('../',import.meta.url),version=(await readdir(new URL('artifacts/',root))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
const manual='https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf',stages=record=>workflowView(record).stages.map(stage=>stage.status);
let idem=0;const key=()=>`steps-${String(++idem).padStart(4,'0')}-0123456789`;
async function setup({fixture=false,fetchWrap=null,storeWrap=null}={}){
 let now=Date.parse('2026-10-13T05:00:00.000Z');const objects=new Map(),journal=createMemoryGuestJournal({clock:()=>now}),base=createMemoryObjectStore({objects}),store=storeWrap?storeWrap(base):base,calls=[];
 const fixtureFetch=fixture?await createPreservedFixtureFetch(fileURLToPath(new URL(`artifacts/${version}/sources/`,root))):null;
 // Replay tests use a fetch that always throws: a preserved replay must never fetch.
 const fetchImpl=async(url,init)=>{calls.push(String(url));if(!fixtureFetch)throw Error('Replay must never fetch');return fetchWrap?fetchWrap(String(url),()=>fixtureFetch(url,init)):fixtureFetch(url,init);};
 const service=createGuestService({journal,store,fetchImpl,testFixture:true,preserved:await createPreservedReplaySource(),random:()=>0}),{token}=await service.issueSession();
 return {journal,objects,store,service,token,calls,tokenHash:sha256(token),tick:ms=>{now+=ms;}};
}
const advance=(state,jobId)=>state.service.advance({token:state.token,jobId});
const replay=state=>state.service.enqueueReplay({token:state.token,idemKey:key(),request:{artifactId:version}});
async function fixtureLookup(state){
 const {job}=await state.service.enqueueLookup({token:state.token,idemKey:key(),request:{kind:'uic',value:'000020838'}});
 let view;for(let i=0;i<3;i++)view=await advance(state,job.jobId);return view;
}
const collection=(state,lookup)=>state.service.enqueueCollection({token:state.token,idemKey:key(),request:{lookupJobId:lookup.jobId,sourceRecordKey:'lookup:1',startMonth:'2024-01',endMonth:'2026-04'}});
test('a preserved public package replays through the connected job as offline_replay with exact archive bytes and no fetch',async()=>{
 assert.ok(version);const state=await setup(),{job,replayed}=await replay(state);assert.equal(replayed,false);
 const views=[];for(let i=0;i<3;i++)views.push(await advance(state,job.jobId));
 assert.deepEqual(views.map(view=>view.state),['queued','queued','succeeded']);
 const done=views[2];assert.equal(done.result.mode,'offline_replay');assert.equal(done.result.kind,'replay');assert.equal(done.result.testFixture,false);assert.equal(state.calls.length,0);
 const pinsBytes=await readFile(new URL(`artifacts/${version}/version-pins.json`,root)),pins=JSON.parse(pinsBytes);
 assert.equal(done.result.pins.manifestSha256,pins.manifestSha256);assert.equal(done.result.pins.normalizedSha256,pins.normalizedSha256);assert.equal(done.result.pins.publicationPinsSha256,sha256(pinsBytes));
 const expected=await buildVersionArchive({directory:new URL(`artifacts/${version}/`,root),pins:{...pins,publicationPinsSha256:sha256(pinsBytes),defaultPinned:false}});
 const archive=await state.service.archive({token:state.token,jobId:job.jobId});assert.deepEqual(Buffer.from(archive.bytes),expected);assert.equal(done.result.archiveSha256,sha256(expected));
 const run=await state.service.run({token:state.token,jobId:job.jobId,runId:done.runId});
 assert.equal(run.mode,'offline_replay');assert.deepEqual(stages(run),['succeeded','succeeded','succeeded']);
 assert.equal(run.events.some(event=>Object.hasOwn(event.evidence??{},'requests')),false);
});
test('fixture lookup and collection fetch once per source step, stay fixtures and are refused by the production archive builder',async()=>{
 const state=await setup({fixture:true}),lookup=await fixtureLookup(state);
 assert.equal(lookup.state,'succeeded');assert.equal(lookup.result.testFixture,true);assert.equal(lookup.result.candidates[0].selectable,true);assert.equal(state.calls.length,2);
 const {job}=await collection(state,lookup),perStep=[];let view;
 for(let i=0;i<10;i++){const before=state.calls.length;view=await advance(state,job.jobId);perStep.push(state.calls.length-before);}
 assert.deepEqual(perStep,[0,1,1,1,1,1,1,1,0,0]);
 assert.equal(view.state,'failed');assert.equal(view.errorCode,'ARCHIVE_INVALID');assert.equal(view.result,null);
 const run=await state.service.run({token:state.token,jobId:job.jobId,runId:view.runId});
 assert.equal(run.testFixture,true);assert.equal(run.mode,'live_collection');assert.deepEqual(stages(run),['succeeded','succeeded','failed']);
 const load=run.events.find(event=>event.stage==='load'&&event.status==='succeeded').evidence;
 assert.equal(load.requests.length,7);assert.ok(load.requests.every(request=>request.status==='succeeded'&&request.httpStatus===200));
 await assert.rejects(state.service.archive({token:state.token,jobId:job.jobId}),error=>error.code==='NOT_FOUND');
 const evidence=await state.journal.evidence({jobId:job.jobId});assert.equal(evidence.length,21);
 for(const row of evidence.filter(entry=>entry.path.endsWith('.source.json')))assert.equal(JSON.parse(Buffer.from(await state.store.get(row.objectKey))).testFixture,true);
 const marker=JSON.parse(Buffer.from(await state.store.get(evidence.find(row=>row.path==='acquisition.json').objectKey)));
 assert.equal(marker.status,'succeeded');assert.equal(marker.testFixture,true);
});
test('a source HTTP error retries once after backoff, then fails with a recorded failed run and marker',async()=>{
 let failures=0;const state=await setup({fixture:true,fetchWrap:async(url,respond)=>url===manual?(failures++,new Response('down',{status:503})):respond()});
 const {job}=await collection(state,await fixtureLookup(state));
 for(let i=0;i<5;i++)await advance(state,job.jobId);
 let view=await advance(state,job.jobId);assert.equal(view.state,'retry_wait');assert.equal(view.attempt,2);assert.equal(failures,1);
 assert.equal(Date.parse(view.nextStepAt)-Date.parse('2026-10-13T05:00:00.000Z'),30_000);
 assert.equal((await advance(state,job.jobId)).state,'retry_wait');assert.equal(failures,1);
 state.tick(30_000);view=await advance(state,job.jobId);
 assert.equal(failures,2);assert.equal(view.state,'failed');assert.equal(view.errorCode,'HTTP_ERROR');
 const run=await state.service.run({token:state.token,jobId:job.jobId,runId:view.runId});assert.deepEqual(stages(run),['failed','skipped','skipped']);
 assert.deepEqual(run.events.find(event=>event.stage==='load'&&event.status==='failed').evidence.requests.at(-1),{url:manual,name:'uic-manual.pdf',status:'failed',httpStatus:503});
 const marker=(await state.journal.evidence({jobId:job.jobId})).find(row=>row.path==='acquisition.json');
 assert.equal(JSON.parse(Buffer.from(await state.store.get(marker.objectKey))).status,'failed');
});
test('concurrent advances execute one step with one fetch and one fence change',async()=>{
 const state=await setup({fixture:true}),{job}=await state.service.enqueueLookup({token:state.token,idemKey:key(),request:{kind:'uic',value:'000020838'}});
 const views=await Promise.all([advance(state,job.jobId),advance(state,job.jobId)]);
 assert.equal(state.calls.length,1);assert.deepEqual(views.map(view=>view.step).sort(),[1,2]);
 assert.equal((await state.journal.claim({tokenHash:state.tokenHash,jobId:job.jobId,leaseOwner:randomUUID()})).lease.fence,2);
});
test('a worker whose lease is lost before the C9 commit never marks success',async()=>{
 const armed={on:false,jobId:null};let state;
 state=await setup({storeWrap:store=>({...store,put:async(objectKey,bytes)=>{if(armed.on){armed.on=false;state.tick(GUEST_LIMITS.leaseMs+1);await state.journal.claim({tokenHash:state.tokenHash,jobId:armed.jobId,leaseOwner:randomUUID()});}return store.put(objectKey,bytes);}})});
 const {job}=await replay(state);armed.jobId=job.jobId;
 await advance(state,job.jobId);await advance(state,job.jobId);
 armed.on=true;const view=await advance(state,job.jobId);
 assert.equal(view.state,'running');assert.equal(view.result,null);
 await assert.rejects(state.service.archive({token:state.token,jobId:job.jobId}),error=>error.code==='NOT_FOUND');
 state.tick(GUEST_LIMITS.leaseMs+1);const final=await advance(state,job.jobId);
 assert.equal(final.state,'failed');assert.equal(final.errorCode,'STEP_INTERRUPTED');
 assert.deepEqual(stages(await state.service.run({token:state.token,jobId:job.jobId,runId:final.runId})),['succeeded','succeeded','failed']);
});
test('guest evidence over 10,000,000 total bytes fails closed without truncation',async()=>{
 const state=await setup({fixture:true,fetchWrap:async(url,respond)=>url===manual?new Response(Buffer.alloc(9_990_000,32),{status:200}):respond()});
 const {job}=await collection(state,await fixtureLookup(state));
 let view;for(let i=0;i<6;i++)view=await advance(state,job.jobId);
 assert.equal(view.state,'failed');assert.equal(view.errorCode,'SOURCE_LIMIT');
 assert.equal([...state.objects.values()].some(bytes=>bytes.length>=9_990_000),false);
 assert.deepEqual(stages(await state.service.run({token:state.token,jobId:job.jobId,runId:view.runId})),['failed','skipped','skipped']);
});
test('missing evidence and tampered staged outputs fail closed and are never repaired',async()=>{
 const missing=await setup(),first=(await replay(missing)).job;await advance(missing,first.jobId);
 missing.objects.delete((await missing.journal.evidence({jobId:first.jobId})).find(row=>row.path==='candidate-monthly.json').objectKey);
 const failed=await advance(missing,first.jobId);assert.equal(failed.state,'failed');assert.equal(failed.errorCode,'EVIDENCE_UNAVAILABLE');
 assert.deepEqual(stages(await missing.service.run({token:missing.token,jobId:first.jobId,runId:failed.runId})),['failed','skipped','skipped']);
 const tampered=await setup(),second=(await replay(tampered)).job;await advance(tampered,second.jobId);await advance(tampered,second.jobId);
 const entry=(await tampered.journal.staged({jobId:second.jobId})).find(item=>item.name==='normalized.json'),corrupt=new Uint8Array(Buffer.from('corrupt'));tampered.objects.set(entry.objectKey,corrupt);
 const refused=await advance(tampered,second.jobId);assert.equal(refused.state,'failed');assert.equal(refused.errorCode,'EXPORT_MISMATCH');
 assert.equal(tampered.objects.get(entry.objectKey),corrupt);
 assert.deepEqual(stages(await tampered.service.run({token:tampered.token,jobId:second.jobId,runId:refused.runId})),['succeeded','succeeded','failed']);
});
test('an injected fetch outside fixture mode is refused before any job exists',()=>{
 assert.throws(()=>createGuestService({journal:createMemoryGuestJournal(),store:createMemoryObjectStore(),fetchImpl:async()=>new Response('[]')}),error=>error.code==='SOURCE_INVALID');
});
