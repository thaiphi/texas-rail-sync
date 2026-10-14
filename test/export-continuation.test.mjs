import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile,readdir} from 'node:fs/promises';
import * as exports from '../src/exportCore.mjs';
import {resumeRunRecorder,createRunRecorder} from '../src/runEvents.mjs';
import {workflowView} from '../public/workflow.js';
import {acquisitionTargets} from '../src/sources.mjs';
const root=new URL('../',import.meta.url),id='rrc-2026-10-09-uic000020838-v1';
const readBytes=async name=>new Uint8Array(await readFile(new URL(`raw/${name}`,root)));
const options={artifactId:id,sourceReference:'raw',readBytes};
async function staged(overrides={}){
 assert.equal(typeof exports.prepareArtifactFromReader,'function');
 const prepared=await exports.prepareArtifactFromReader({...options,...overrides});
 const files=new Map(Object.entries(prepared.files).map(([name,body])=>[name,Buffer.from(body)]));
 let commits=0;
 const readStored=async(_id,name)=>{if(!files.has(name))throw Object.assign(Error('Missing staged output'),{code:'ENOENT'});return Buffer.from(files.get(name));};
 const publisher={readStaged:readStored,readPublished:readStored,publish:async expected=>{
  for(const [name,body] of Object.entries(expected))if(!files.has(name)||!Buffer.from(body).equals(files.get(name)))throw Object.assign(Error('Staged conflict'),{code:'EXPORT_MISMATCH'});
  commits++;return 'verified_existing_bytes';
 }};
 return {prepared,files,publisher,commits:()=>commits};
}
test('preparation runs validation but never claims publication or saves a terminal run',async()=>{
 assert.equal(typeof exports.prepareArtifactFromReader,'function');let publications=0,saves=0;
 const prepared=await exports.prepareArtifactFromReader({...options,publisher:{publish:async()=>{publications++;},readPublished:async()=>{throw Error('No output yet');}},saveRecord:async()=>{saves++;}});
 assert.equal(prepared.record.status,'running');assert.equal(prepared.record.events.length,5);
 assert.deepEqual(workflowView(prepared.record).stages.map(stage=>stage.status),['succeeded','succeeded','running']);
 assert.equal(publications,0);assert.equal(saves,0);
});
test('a separately resumed finalizer preserves all prior events and exact package bytes',async()=>{
 assert.equal(typeof exports.finalizeArtifactFromReader,'function');const state=await staged();
 const journal=JSON.parse(JSON.stringify(state.prepared.record)),recorder=resumeRunRecorder(journal);
 const result=await exports.finalizeArtifactFromReader({...options,recorder,publisher:state.publisher});
 assert.equal(state.commits(),1);assert.equal(result.record.runId,journal.runId);assert.deepEqual(result.record.events.slice(0,5),journal.events);
 assert.equal(result.record.events.length,6);assert.equal(result.record.status,'succeeded');
 for(const [name,body] of Object.entries(result.files))assert.deepEqual(Buffer.from(body),await readFile(new URL(`artifacts/${id}/${name}`,root)),name);
});
test('corrupted or absent staged output cannot be repaired or published silently',async()=>{
 for(const fault of ['missing','changed']){const state=await staged();
  if(fault==='missing')state.files.delete('manifest.json');else state.files.set('normalized.json',Buffer.from('corrupt'));
  await assert.rejects(exports.finalizeArtifactFromReader({...options,recorder:resumeRunRecorder(state.prepared.record),publisher:state.publisher}),error=>{
   assert.equal(error.code,'EXPORT_MISMATCH');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;
  });assert.equal(state.commits(),0);
 }
});
test('a forged journal hash cannot override newly verified source and QC evidence',async()=>{
 const state=await staged(),journal=structuredClone(state.prepared.record);
 journal.events.find(event=>event.stage==='normalize-qc'&&event.status==='succeeded').evidence.outputs[0].sha256='f'.repeat(64);
 workflowView(journal);
 await assert.rejects(exports.finalizeArtifactFromReader({...options,recorder:resumeRunRecorder(journal),publisher:state.publisher}),error=>{
  assert.equal(error.record.status,'failed');assert.equal(workflowView(error.record).stages[2].status,'failed');return true;
 });assert.equal(state.commits(),0);
});

test('changed legacy source bytes lose verified provenance and cannot commit',async()=>{
 const state=await staged();
 await assert.rejects(exports.finalizeArtifactFromReader({...options,recorder:resumeRunRecorder(state.prepared.record),publisher:state.publisher,readBytes:async name=>{
  const bytes=await readBytes(name);return name==='candidate-monthly.json'?Buffer.concat([bytes,Buffer.from('\n')]):bytes;
 }}),error=>{assert.equal(error.code,'SOURCE_PROVENANCE_CONFLICT');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;});
 assert.equal(state.commits(),0);
});

test('fresh and terminal finalizers are rejected without reads or record changes',async()=>{
 const state=await staged();const finished=await exports.finalizeArtifactFromReader({...options,recorder:resumeRunRecorder(state.prepared.record),publisher:state.publisher});
 for(const recorder of [createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v1',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0'}),resumeRunRecorder(finished.record)]){
  const before=recorder.snapshot();let reads=0;
  await assert.rejects(exports.finalizeArtifactFromReader({...options,recorder,publisher:{...state.publisher,readStaged:async()=>{reads++;throw Error('Unexpected read');}}}),error=>error.code==='RUN_STATE_INVALID');
  assert.deepEqual(recorder.snapshot(),before);assert.equal(reads,0);
 }
});

test('preparation continues a running load instead of duplicating its start event',async()=>{
 const recorder=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v1',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0'});recorder.start('load');
 const initial=recorder.snapshot();const prepared=await exports.prepareArtifactFromReader({...options,recorder});
 assert.equal(prepared.record.runId,initial.runId);assert.deepEqual(prepared.record.events[0],initial.events[0]);assert.equal(prepared.record.events.length,5);
});

test('versioned preparation and finalization retain all preserved pins and files',async()=>{
 const versions=await readdir(new URL('artifacts/',root));
 const version=versions.find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));assert.ok(version);
 const v2={...options,artifactId:version,readBytes:async name=>new Uint8Array(await readFile(new URL(`artifacts/${version}/sources/${name}`,root)))};
 const state=await staged(v2);const result=await exports.finalizeArtifactFromReader({...v2,recorder:resumeRunRecorder(state.prepared.record),publisher:state.publisher});
 assert.ok(result.files['version-pins.json']);
 for(const [name,body] of Object.entries(result.files))assert.deepEqual(Buffer.from(body),await readFile(new URL(`artifacts/${version}/${name}`,root)),name);
});

test('a final commit exception retains prior successes and a failed export',async()=>{
 const state=await staged();state.publisher.publish=async()=>{throw Object.assign(Error('Commit interrupted'),{code:'STORAGE_UNAVAILABLE'});};
 await assert.rejects(exports.finalizeArtifactFromReader({...options,recorder:resumeRunRecorder(state.prepared.record),publisher:state.publisher}),error=>{assert.equal(error.code,'STORAGE_UNAVAILABLE');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;});
});

// D1: hosted C0-C7 leave a live load running; its acquisition evidence must survive C8/C9.
const loadEvidence=record=>record.events.find(event=>event.stage==='load'&&event.status==='succeeded').evidence;
async function liveCollection(){
 const version=(await readdir(new URL('artifacts/',root))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));assert.ok(version);
 const readV2=async name=>new Uint8Array(await readFile(new URL(`artifacts/${version}/sources/${name}`,root)));
 const recorder=createRunRecorder({mode:'live_collection',pipelineVersion:'rrc-collection-v2',schemaVersion:1,transformationVersion:'rrc-odp-v2.0.0'});recorder.start('load');
 const requests=[],outputs=[];
 for(const {name} of acquisitionTargets){const meta=JSON.parse(Buffer.from(await readV2(name.replace(/\.[^.]+$/,'')+'.source.json')).toString('utf8'));
  requests.push({url:meta.url,name,status:'succeeded',httpStatus:meta.http_status});outputs.push({path:`raw/${name}`,url:meta.url,sha256:meta.sha256,bytes:meta.bytes,count:null});}
 return {version,recorder,acquisition:{requests,outputs},base:{...options,artifactId:version,readBytes:readV2}};
}
test('resumed live preparation preserves exact acquisition requests and outputs through serialized finalization',async()=>{
 const live=await liveCollection(),state=await staged({...live.base,recorder:live.recorder,acquisitionEvidence:live.acquisition});
 assert.deepEqual(loadEvidence(state.prepared.record).requests,live.acquisition.requests);assert.deepEqual(loadEvidence(state.prepared.record).outputs,live.acquisition.outputs);
 const journal=JSON.parse(JSON.stringify(state.prepared.record));
 const result=await exports.finalizeArtifactFromReader({...live.base,recorder:resumeRunRecorder(journal),publisher:state.publisher});
 assert.equal(result.record.status,'succeeded');assert.equal(state.commits(),1);assert.deepEqual(loadEvidence(result.record),loadEvidence(journal));
 for(const [name,body] of Object.entries(result.files))assert.deepEqual(Buffer.from(body),await readFile(new URL(`artifacts/${live.version}/${name}`,root)),name);
});
test('acquisition evidence is privately copied before preparation records it',async()=>{
 const live=await liveCollection(),supplied=structuredClone(live.acquisition);
 const pending=exports.prepareArtifactFromReader({...live.base,recorder:live.recorder,acquisitionEvidence:supplied});
 supplied.requests[0].url='https://example.invalid/';supplied.outputs.length=0;
 const prepared=await pending;assert.deepEqual(loadEvidence(prepared.record).requests,live.acquisition.requests);assert.deepEqual(loadEvidence(prepared.record).outputs,live.acquisition.outputs);
 loadEvidence(prepared.record).requests[0].url='mutated';assert.deepEqual(loadEvidence(live.recorder.snapshot()).requests,live.acquisition.requests);
});
test('live acquisition evidence is required, never invented offline, and refused when it contradicts sources',async()=>{
 const missing=await liveCollection(),before=missing.recorder.snapshot();
 await assert.rejects(exports.prepareArtifactFromReader({...missing.base,recorder:missing.recorder}),error=>error.code==='SOURCE_INVALID');assert.deepEqual(missing.recorder.snapshot(),before);
 const offline=await liveCollection();
 await assert.rejects(exports.prepareArtifactFromReader({...offline.base,acquisitionEvidence:offline.acquisition}),error=>error.code==='SOURCE_INVALID');
 for(const [mutate,code] of [[e=>{e.requests[0].url='https://example.invalid/x';},'SOURCE_PROVENANCE_CONFLICT'],[e=>{e.requests.pop();},'SOURCE_PROVENANCE_CONFLICT'],[e=>{e.requests[1].status='failed';},'SOURCE_PROVENANCE_CONFLICT'],[e=>{e.outputs[2].sha256='0'.repeat(64);},'SOURCE_HASH_MISMATCH'],[e=>{e.outputs[3].bytes+=1;},'SOURCE_HASH_MISMATCH']]){
  const live=await liveCollection(),evidence=structuredClone(live.acquisition);mutate(evidence);
  await assert.rejects(exports.prepareArtifactFromReader({...live.base,recorder:live.recorder,acquisitionEvidence:evidence}),error=>{assert.equal(error.code,code);assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['failed','skipped','skipped']);return true;});
 }
});
test('a tampered journal acquisition reference is refused before commit',async()=>{
 const live=await liveCollection(),state=await staged({...live.base,recorder:live.recorder,acquisitionEvidence:live.acquisition}),journal=JSON.parse(JSON.stringify(state.prepared.record));
 loadEvidence(journal).outputs[0].sha256='f'.repeat(64);workflowView(journal);
 await assert.rejects(exports.finalizeArtifactFromReader({...live.base,recorder:resumeRunRecorder(journal),publisher:state.publisher}),error=>{assert.equal(error.code,'SOURCE_HASH_MISMATCH');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;});
 assert.equal(state.commits(),0);
});
test('fresh or not-yet-started live preparation without acquisition evidence is refused before reads or record changes',async()=>{
 let reads=0;const counting=async name=>{reads++;return readBytes(name);};
 await assert.rejects(exports.prepareArtifactFromReader({...options,readBytes:counting,mode:'live_collection'}),error=>error.code==='SOURCE_INVALID');
 const recorder=createRunRecorder({mode:'live_collection',pipelineVersion:'rrc-collection-v1',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0'}),before=recorder.snapshot();
 await assert.rejects(exports.prepareArtifactFromReader({...options,readBytes:counting,recorder}),error=>error.code==='SOURCE_INVALID');
 assert.deepEqual(recorder.snapshot(),before);assert.equal(reads,0);
});
test('a live journal missing acquisition requests or outputs, or an offline journal carrying them, cannot finalize',async()=>{
 const refused=state=>error=>{assert.equal(error.code,'SOURCE_PROVENANCE_CONFLICT');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);assert.equal(state.commits(),0);return true;};
 for(const strip of [['requests','outputs'],['requests'],['outputs']]){
  const live=await liveCollection(),state=await staged({...live.base,recorder:live.recorder,acquisitionEvidence:live.acquisition}),journal=JSON.parse(JSON.stringify(state.prepared.record));
  for(const key of strip)delete loadEvidence(journal)[key];workflowView(journal);
  await assert.rejects(exports.finalizeArtifactFromReader({...live.base,recorder:resumeRunRecorder(journal),publisher:state.publisher}),refused(state));
 }
 const offline=await staged(),journal=JSON.parse(JSON.stringify(offline.prepared.record));
 Object.assign(loadEvidence(journal),{requests:[],outputs:[]});workflowView(journal);
 await assert.rejects(exports.finalizeArtifactFromReader({...options,recorder:resumeRunRecorder(journal),publisher:offline.publisher}),refused(offline));
});
test('changed v2 source bytes are refused by exact source hash before commit',async()=>{
 const live=await liveCollection(),state=await staged(live.base);
 await assert.rejects(exports.finalizeArtifactFromReader({...live.base,recorder:resumeRunRecorder(state.prepared.record),publisher:state.publisher,readBytes:async name=>{const bytes=await live.base.readBytes(name);return name==='candidate-monthly.json'?Buffer.concat([bytes,Buffer.from('\n')]):bytes;}}),error=>{
  assert.equal(error.code,'SOURCE_HASH_MISMATCH');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;});
 assert.equal(state.commits(),0);
});
