import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRunRecorder} from '../src/runEvents.mjs';
import {workflowView} from '../public/workflow.js';
import {sha256} from '../src/normalize.mjs';
const root=new URL('../',import.meta.url);
const options={mode:'offline_replay',pipelineVersion:'rrc-offline-export-v1',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0',testFixture:true};
const emptyQuality=()=>({inventory:{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0},monthly:{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0},parent_join:{matched:0,unmatched:0,ambiguous:0},issue_counts:{},dispositions:[]});
const emptyOutputs=()=>['normalized inventory','normalized monthly'].map(name=>({name,count:0,sha256:sha256(JSON.stringify([]))}));

test('events retain unique invocation identity, immutable evidence and legal transitions',()=>{
 const a=createRunRecorder(options), b=createRunRecorder(options);
 assert.notEqual(a.snapshot().runId,b.snapshot().runId);
 assert.equal(workflowView(a.snapshot()).stages[0].status,'pending');
 assert.throws(()=>a.succeed('load'),/transition/i);
 assert.throws(()=>a.start('export'),/order/i);
 const evidence={inputs:[{url:'https://data.texas.gov/resource/givw-z9t4.json',sha256:'a'.repeat(64),count:0}]};
 a.start('load');a.succeed('load',evidence);evidence.inputs[0].count=99;
 a.start('normalize-qc');a.succeed('normalize-qc',{counts:emptyQuality(),outputs:emptyOutputs()});
 a.start('export');a.succeed('export',{counts:emptyQuality(),outputs:[{path:'inventory.csv',sha256:'b'.repeat(64),count:0}]});
 const r=a.snapshot();assert.equal(r.status,'succeeded');assert.equal(r.events.length,6);
 assert.equal(new Set(r.events.map(e=>e.eventId)).size,6);
 assert.ok(r.events.every(e=>e.runId===r.runId&&e.stageId.startsWith(r.runId+':')));
 assert.equal(r.events[1].evidence.inputs[0].count,0);
 r.events[1].evidence.inputs[0].count=100;assert.equal(a.snapshot().events[1].evidence.inputs[0].count,0);
 assert.throws(()=>a.start('export'),/transition|finished/i);
 assert.equal(workflowView(a.snapshot()).consumer.status,'unrecorded');
});

test('failure preserves failed, skipped and unexecuted distinctions and safe diagnostics',()=>{
 const r=createRunRecorder(options);r.start('load');
 assert.equal(workflowView(r.snapshot()).stages[1].status,'pending');
 r.fail('load',Object.assign(new Error('private token=abc https://user:secret@example.com/?key=hidden'),{code:'SOURCE_INVALID'}));
 const record=r.snapshot(), view=workflowView(record);
 assert.equal(record.status,'failed');assert.deepEqual(view.stages.map(s=>s.status),['failed','skipped','skipped']);
 assert.equal(record.events.filter(e=>e.status==='skipped').length,2);
 assert.equal(view.stages[0].error.code,'SOURCE_INVALID');
 assert.ok(!JSON.stringify(record).includes('secret'));assert.ok(!JSON.stringify(record).includes('hidden'));
 assert.throws(()=>r.succeed('export'),/transition|finished/i);
 assert.equal(view.label,'Test fixture — offline replay');
});

test('historical manifest evidence never fabricates executed stages or consumer acknowledgement',()=>{
 const view=workflowView(null,{artifact_id:'historical',sources:[{sha256:'c'.repeat(64)}]});
 assert.deepEqual(view.stages.map(s=>s.status),['unrecorded','unrecorded','unrecorded']);
 assert.equal(view.consumer.status,'unrecorded');assert.equal(view.events.length,0);
 assert.equal(view.artifact.artifact_id,'historical');
});

test('view rejects inconsistent records rather than presenting fabricated success',()=>{
 const r=createRunRecorder(options);r.start('load');r.fail('load',new Error('failure'));
 const record=r.snapshot();record.events.at(-1).status='succeeded';
 assert.throws(()=>workflowView(record),/invalid|transition|order/i);
});

test('actual offline CLI replay reproduces pinned files, counts and source lineage without changing bytes',async()=>{
 const base=new URL('artifacts/rrc-2026-10-09-uic000020838-v1/',root);
 const manifest=await readFile(new URL('manifest.json',base));
 const pinned=JSON.parse(manifest),before={};
 for(const name of ['manifest.json','normalized.json',...Object.keys(pinned.files)])before[name]=sha256(await readFile(new URL(name,base)));
 const child=spawnSync(process.execPath,['scripts/export.mjs','--offline-replay'],{cwd:root,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);const record=JSON.parse(child.stdout),view=workflowView(record);
 assert.equal(record.mode,'offline_replay');assert.equal(record.testFixture,false);assert.equal(record.status,'succeeded');
 assert.equal(view.label,'Offline replay — preserved sources');
 assert.deepEqual(view.stages.map(s=>s.status),['succeeded','succeeded','succeeded']);
 const load=view.stages[0].evidence;assert.equal(load.inputs.length,7);
 assert.equal(load.inputs.find(s=>s.name==='candidate-inventory').sha256,'2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c');
 assert.ok(load.inputs.every(s=>s.url&&s.retrieved_at&&s.sha256));
 const qc=view.stages[1].evidence;assert.equal(qc.counts.inventory.accepted,5);assert.equal(qc.counts.monthly.accepted,28);assert.equal(qc.counts.parent_join.matched,28);
 const outputs=view.stages[2].evidence.outputs;assert.equal(outputs.find(f=>f.path.endsWith('/manifest.json')).sha256,sha256(manifest));
 assert.equal(outputs.find(f=>f.path.endsWith('/injection_monthly.csv')).count,28);
 for(const [name,hash] of Object.entries(before))assert.equal(sha256(await readFile(new URL(name,base))),hash,name);
 const pointer=JSON.parse(await readFile(new URL('public/artifact-path.json',root)));assert.equal(pointer.artifact_id,pinned.artifact_id);
});

test('actual controlled pin failure records load failure and downstream skips without fabricated export',()=>{
 const child=spawnSync(process.execPath,['scripts/export.mjs','--offline-replay','--expected-manifest-sha256','0'.repeat(64)],{cwd:root,encoding:'utf8'});
 assert.equal(child.status,1);const record=JSON.parse(child.stdout),view=workflowView(record);
 assert.equal(record.testFixture,false);assert.equal(record.status,'failed');
 assert.deepEqual(view.stages.map(s=>s.status),['failed','skipped','skipped']);
 assert.equal(view.stages[0].error.code,'MANIFEST_PIN_MISMATCH');assert.equal(view.stages[0].evidence.expectedManifestSha256,'0'.repeat(64));assert.match(view.stages[0].evidence.actualManifestSha256,/^[a-f0-9]{64}$/);
 assert.equal(view.stages[2].evidence.outputs,undefined);assert.equal(view.stages[2].evidence.reason,'upstream_failed');assert.equal(view.consumer.status,'unrecorded');
});

test('terminal failures require complete downstream skip evidence and reject reordered or duplicated events',()=>{
 const r=createRunRecorder(options);r.start('load');r.fail('load',new Error('failure'));
 for(const mutate of [record=>record.events.pop(),record=>record.events[1].eventId=record.events[0].eventId,record=>record.events[1].timestamp='2000-01-01T00:00:00Z',record=>record.events[1].runId='other',record=>record.events[1].stageId='other',record=>record.events.at(-1).stage='load']){
  const record=r.snapshot();mutate(record);assert.throws(()=>workflowView(record),/invalid|transition|order/i);
 }
});

test('failed normalization retains real prior success and never starts the export stage',()=>{
 const r=createRunRecorder(options);r.start('load');r.succeed('load',{inputs:[{url:'https://data.texas.gov/resource/givw-z9t4.json',sha256:'a'.repeat(64),count:1}]});
 r.start('normalize-qc');r.fail('normalize-qc',new Error('sensitive C:\\Users\\private\\file'));
 const view=workflowView(r.snapshot());assert.deepEqual(view.stages.map(s=>s.status),['succeeded','failed','skipped']);
 assert.equal(view.events.some(e=>e.stage==='export'&&e.status==='running'),false);
 assert.equal(view.stages[1].error.code,'STAGE_FAILED');assert.equal(JSON.stringify(view).includes('private'),false);
});

test('successful stages require count and hash evidence, not an unsupported success label',()=>{
 const r=createRunRecorder(options);r.start('load');
 assert.throws(()=>r.succeed('load'),/evidence/i);
 assert.throws(()=>r.succeed('load',{inputs:[{url:'https://data.texas.gov',sha256:'bad',count:1}]}),/evidence/i);
 assert.equal(r.snapshot().events.length,1);
});

test('a valid uppercase manifest pin is accepted and export-stage failures retain prior evidence',async()=>{
 const manifest=await readFile(new URL('artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json',root));
 const child=spawnSync(process.execPath,['scripts/export.mjs','--offline-replay','--expected-manifest-sha256',sha256(manifest).toUpperCase()],{cwd:root,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(workflowView(JSON.parse(child.stdout)).status,'succeeded');
 const r=createRunRecorder(options);r.start('load');r.succeed('load',{inputs:[{url:'https://data.texas.gov',sha256:'a'.repeat(64),count:0}]});
 r.start('normalize-qc');r.succeed('normalize-qc',{counts:emptyQuality(),outputs:emptyOutputs()});r.start('export');r.fail('export',{code:'EXPORT_MISMATCH'});
 const view=workflowView(r.snapshot());assert.deepEqual(view.stages.map(s=>s.status),['succeeded','succeeded','failed']);
 assert.equal(view.stages[2].error.code,'EXPORT_MISMATCH');assert.equal(view.status,'failed');assert.equal(view.consumer.status,'unrecorded');
});
