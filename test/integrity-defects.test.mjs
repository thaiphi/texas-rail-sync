import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectPublicSnapshot,acquisitionTargets} from '../src/acquisition.mjs';
import {exportArtifact} from '../src/pipeline.mjs';
import {loadSnapshot,buildArtifact,pinnedArtifactId} from '../src/artifact.mjs';
import {normalize,sha256} from '../src/normalize.mjs';
import {workflowView} from '../public/workflow.js';
import {createRunRecorder} from '../src/runEvents.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fetchFixture=async url=>{const target=acquisitionTargets.find(item=>item.url===String(url));assert.ok(target);return new Response(await readFile(resolve(root,'raw',target.name)),{status:200});};
async function fixture(t){await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/integrity-'));t.after(()=>rm(dir,{recursive:true,force:true}));const env={sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'fixture-integrity'};await collectPublicSnapshot({...env,testFixture:true,fetchImpl:fetchFixture});return env;}
async function successRecord(){for(const id of await readdir(resolve(root,'runs'))){const record=JSON.parse(await readFile(resolve(root,'runs',id,'record.json')));if(record.status==='succeeded')return record;}throw Error('No baseline successful record');}
async function noActualHistory(env){const names=await readdir(env.runRoot).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));assert.deepEqual(names,[]);}

test('fixture replay pin mismatch remains fixture and never persists actual history',async t=>{
 const env=await fixture(t);let failure;try{await exportArtifact({...env,expectedManifestSha256:'0'.repeat(64)});}catch(error){failure=error;}
 assert.ok(failure);const names=await readdir(env.runRoot).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));
 assert.equal(failure.record?.testFixture,true,'pin failure occurs before fixture source evidence is classified');assert.deepEqual(names,[]);assert.equal(failure.code,'MANIFEST_PIN_MISMATCH');
 assert.deepEqual(workflowView(failure.record).stages.map(stage=>stage.status),['failed','skipped','skipped']);
});
test('fixture evidence also survives missing pin targets and invalid export parameters',async t=>{
 for(const patch of [{artifactId:'missing-version',expectedManifestSha256:'0'.repeat(64)},{artifactId:'../invalid'},{outputRoot:resolve(root,'..','forbidden-integrity-output')},{expectedManifestSha256:123}]){
  const env=await fixture(t);await assert.rejects(exportArtifact({...env,...patch}),error=>{assert.equal(error.record?.testFixture,true);assert.equal(error.record?.provenance.classification,'test_fixture');return true;});await noActualHistory(env);
 }
});
test('fixture sidecars still exclude a replay with corrupt acquisition marker from actual history',async t=>{
 const env=await fixture(t);await writeFile(resolve(env.sourceDir,'acquisition.json'),'{corrupt');let failure;try{await exportArtifact(env);}catch(error){failure=error;}
 assert.ok(failure);const names=await readdir(env.runRoot).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error));
 assert.equal(failure.record?.testFixture,true,'fixture sidecars must retain fixture classification on marker parse failure');assert.deepEqual(names,[]);
});
test('run validator rejects a successful normalization with no output hashes',async()=>{
 const record=await successRecord();delete record.events.find(event=>event.stage==='normalize-qc'&&event.status==='succeeded').evidence.outputs;
 assert.throws(()=>workflowView(record),/quality|output|evidence/i);
});
test('normalization requires both named output hashes with exact row counts, including empty outputs',async()=>{
 const baseline=await successRecord();
 const changes=[e=>{e.outputs=[];},e=>{e.outputs=null;},e=>{e.outputs={};},e=>{e.outputs.pop();},e=>{e.outputs[1]=structuredClone(e.outputs[0]);},e=>{e.outputs[0].name='unrecognized';},e=>{delete e.outputs[0].sha256;},e=>{e.outputs[0].sha256='';},e=>{e.outputs[0].sha256='not-a-hash';},e=>{e.outputs[0].sha256=123;},e=>{e.outputs[0].count=null;},e=>{e.outputs[0].count=-1;},e=>{delete e.outputs[0].count;}];
 for(const change of changes){const record=structuredClone(baseline);change(record.events.find(event=>event.stage==='normalize-qc'&&event.status==='succeeded').evidence);assert.throws(()=>workflowView(record),/quality|output|evidence/i);}
 const good=structuredClone(baseline),event=good.events.find(item=>item.stage==='normalize-qc'&&item.status==='succeeded');event.evidence.outputs.reverse();event.evidence.outputs[0].sha256=event.evidence.outputs[0].sha256.toUpperCase();assert.equal(workflowView(good).status,'succeeded');
});
test('direct artifact construction binds original source row identity as well as counts',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw')),normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 normalized.monthly[0].source_report_id='999999999';normalized.monthly[0].injected_liquid_bbl=31000;normalized.monthly[0].calculated_calendar_day_avg_bpd=1000;
 await assert.rejects(buildArtifact(snapshot,'independent-source-substitution-probe',normalized),/quality|source|identity|normaliz/i);
});
test('builder rejects substitutions of reported values, calculations, identities, ordering and missing-value semantics',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw')),original=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 const changes=[n=>{n.inventory[0].api_no='00000000';},n=>{n.inventory[0].uic_number='000000001';},n=>{n.inventory[0].permit_liquid_volume_limit_bpd++;},n=>{n.monthly[0].reported_avg_injection_pressure_psi++;},n=>{n.monthly[0].injected_gas_mcf=null;},n=>{n.monthly[0].calendar_days=30;},n=>{n.monthly[0].calculated_calendar_day_avg_bpd=0;},n=>{n.monthly[0].parent_key=n.inventory[1].source_record_key;},n=>{n.monthly.reverse();},n=>{n.monthly[0].unrecorded='injected';}];
 for(const change of changes){const bad=structuredClone(original);change(bad);await assert.rejects(buildArtifact(snapshot,'substituted-values',bad),/quality|source|identity|normaliz/i);}
 const reordered=structuredClone(original);reordered.monthly[0]=Object.fromEntries(Object.entries(reordered.monthly[0]).reverse());await buildArtifact(snapshot,'key-order-compatible',reordered);
});
test('simultaneously substituted snapshot arrays and normalized values cannot contradict retained raw bytes',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw'));snapshot.monthly[0].id='999999999';snapshot.monthly[0].vol_liq='31000';snapshot.inventory[0].operator_number='000000';
 const normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 await assert.rejects(buildArtifact(snapshot,'substituted-source-projection',normalized),/quality|source|identity|normaliz/i);
});
test('mutated source snapshot identity and retained byte buffers cannot authorize replacement values',async()=>{
 for(const mutate of [snapshot=>{snapshot.sourceIds.monthly='forged-snapshot';},snapshot=>{snapshot.rawMonthly[0]=32;},snapshot=>{snapshot.bodies['sources/candidate-monthly.json']=Buffer.from('[]');},snapshot=>{snapshot.sources.find(item=>item.kind==='monthly').sha256='0'.repeat(64);},snapshot=>{snapshot.scope={...snapshot.scope,monthlyUic:'000000001'};}]){
  const snapshot=await loadSnapshot(resolve(root,'raw'));mutate(snapshot);const normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds);
  await assert.rejects(buildArtifact(snapshot,'mutated-evidence',normalized),/quality|source|identity|normaliz|scope|hash/i);
 }
});
test('restrictive fixture override remains supported and cannot promote a loaded fixture',async t=>{
 const snapshot=await loadSnapshot(resolve(root,'raw')),normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 const restricted={...snapshot,testFixture:true,provenance:{classification:'test_fixture',basis:'explicit_test_fixture'}};
 assert.equal((await buildArtifact(restricted,'restricted-direct-fixture',normalized)).manifest.real_history_status,'test_fixture');
 const env=await fixture(t),fixtureSnapshot=await loadSnapshot(env.sourceDir),fixtureNormalized=normalize(fixtureSnapshot.inventory,fixtureSnapshot.monthly,fixtureSnapshot.sourceIds,fixtureSnapshot.scope);
 await assert.rejects(buildArtifact({...fixtureSnapshot,testFixture:false,provenance:{classification:'public_reported',basis:'caller_claim'}},'fixture-promotion',fixtureNormalized),/source|provenance|fixture/i);await noActualHistory(env);
});
test('provided fixture snapshots remain fixtures before parameter and pin failures',async t=>{
 const env=await fixture(t),loaded=await loadSnapshot(env.sourceDir),promoted={...loaded,testFixture:false,provenance:{classification:'public_reported',basis:'caller_claim'}};
 for(const patch of [{artifactId:'../invalid'},{expectedManifestSha256:'0'.repeat(64)},{sourceDir:resolve(root,'..','forbidden-source')}]){
  const recorder=createRunRecorder({mode:'offline_replay',pipelineVersion:'integrity-test',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0'});recorder.start('load');
  await assert.rejects(exportArtifact({...env,...patch,snapshot:promoted,recorder}),error=>{assert.equal(error.record?.testFixture,true);assert.equal(error.record?.provenance.classification,'test_fixture');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['failed','skipped','skipped']);return true;});await noActualHistory(env);
 }
});
test('a provided loaded fixture preserves completed load evidence on an early replay failure',async t=>{
 const env=await fixture(t),snapshot=await loadSnapshot(env.sourceDir),recorder=createRunRecorder({mode:'offline_replay',pipelineVersion:'integrity-test',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0'});
 recorder.start('load');recorder.classifySource(snapshot.provenance);recorder.succeed('load',{provenance:snapshot.provenance,inputs:snapshot.sources.map(source=>({...source,count:source.kind==='inventory'?snapshot.inventory.length:source.kind==='monthly'?snapshot.monthly.length:null}))});
 await assert.rejects(exportArtifact({...env,snapshot,recorder,expectedManifestSha256:'0'.repeat(64)}),error=>{assert.equal(error.code,'MANIFEST_PIN_MISMATCH');assert.equal(error.record?.testFixture,true);assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','failed','skipped']);return true;});await noActualHistory(env);
});
test('async construction serializes verified private copies after callers mutate inputs',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw')),normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope),original=structuredClone(normalized);
 const pending=buildArtifact(snapshot,pinnedArtifactId,normalized);
 normalized.monthly[0].source_report_id='after-validation';normalized.monthly[0].injected_liquid_bbl=31000;normalized.quality.scope='statewide';snapshot.sources[0].url='https://example.invalid/';snapshot.bodies['sources/candidate-monthly.json'][0]=32;snapshot.provenance.classification='test_fixture';
 const built=await pending;assert.deepEqual(built.normalized.injectionMonthly,original.monthly);assert.deepEqual(built.normalized.qualityReport,original.quality);
 for(const [name,body] of Object.entries(built.files))assert.equal(sha256(body),sha256(await readFile(resolve(root,'artifacts',pinnedArtifactId,name))),name);
});
test('both preserved public versions reproduce every artifact byte without rewriting',async()=>{
 for(const artifactId of [pinnedArtifactId,'rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0']){
  const sourceDir=artifactId===pinnedArtifactId?resolve(root,'raw'):resolve(root,'artifacts',artifactId,'sources'),snapshot=await loadSnapshot(sourceDir),normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope),built=await buildArtifact(snapshot,artifactId,normalized);
  for(const [name,body] of Object.entries(built.files))assert.equal(sha256(body),sha256(await readFile(resolve(root,'artifacts',artifactId,name))),artifactId+'/'+name);
 }
});
