import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadSnapshot,buildArtifact,pinnedArtifactId} from '../src/artifact.mjs';
import {normalize,sha256} from '../src/normalize.mjs';
import {collectPublicSnapshot,acquisitionTargets} from '../src/acquisition.mjs';
import {exportArtifact,saveRun} from '../src/pipeline.mjs';
import {workflowView} from '../public/workflow.js';
const root=fileURLToPath(new URL('../',import.meta.url));
async function setup(t){await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/provenance-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs')};}
const preservedFetch=async url=>{const target=acquisitionTargets.find(t=>t.url===String(url));assert.ok(target);return new Response(await readFile(resolve(root,'raw',target.name)),{status:200});};
function fixtureArtifact(result){
 assert.equal(result.manifest.provenance.classification,'test_fixture');
 assert.equal(result.manifest.testFixture,true);
 assert.equal(result.normalized.manifest.provenance.classification,'test_fixture');
 assert.equal(result.manifest.real_history_status,'test_fixture');
 assert.equal(result.normalized.dataDictionary.fields.injected_liquid_bbl.status,'synthetic');
 assert.equal(result.normalized.dataDictionary.fields.calculated_calendar_day_avg_bpd.status,'calculated');
 assert.equal(result.normalized.dataDictionary.provenance.classification,'test_fixture');
}
test('fixture acquisition and separate default export retain classification and cannot enter actual history',async t=>{
 const env=await setup(t);
 const first=await collectPublicSnapshot({...env,artifactId:'fixture-acquisition',fetchImpl:preservedFetch,testFixture:true});
 fixtureArtifact(first);
 assert.ok(first.manifest.sources.every(s=>s.testFixture===true));
 const snapshot=await loadSnapshot(env.sourceDir);assert.equal(snapshot.testFixture,true);
 const replay=await exportArtifact({...env,artifactId:'fixture-replay'});
 fixtureArtifact(replay);assert.equal(replay.record.testFixture,true);
 assert.equal(replay.record.provenance.classification,'test_fixture');
 assert.ok(replay.record.events.filter(e=>e.status==='succeeded').every(e=>e.evidence.provenance.classification==='test_fixture'));
 await assert.rejects(readdir(env.runRoot),{code:'ENOENT'});
 await assert.rejects(saveRun({...replay.record,testFixture:false},env.runRoot),/fixture|provenance/i);
 assert.throws(()=>workflowView({...replay.record,testFixture:false}),/provenance/i);
 const child=spawnSync(process.execPath,[resolve(root,'scripts/export.mjs'),'--source-dir',env.sourceDir,'--artifact-id','fixture-cli-replay','--output-root',env.outputRoot],{cwd:root,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);const cliRecord=JSON.parse(child.stdout);
 assert.equal(cliRecord.testFixture,true);assert.equal(cliRecord.provenance.classification,'test_fixture');
 assert.equal(JSON.parse(await readFile(resolve(env.outputRoot,'fixture-cli-replay/manifest.json'))).real_history_status,'test_fixture');
 await assert.rejects(readFile(resolve(root,'runs',cliRecord.runId,'record.json')),{code:'ENOENT'});
});
test('legacy fixture marker survives loading and direct artifact construction',async t=>{
 const env=await setup(t);await cp(resolve(root,'raw'),env.sourceDir,{recursive:true});
 await writeFile(resolve(env.sourceDir,'acquisition.json'),JSON.stringify({schemaVersion:1,status:'succeeded',testFixture:true,mode:'live_collection',runId:'legacy-test'}));
 const snapshot=await loadSnapshot(env.sourceDir);
 assert.equal(snapshot.testFixture,true);
 fixtureArtifact(await buildArtifact(snapshot,'legacy-fixture',normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds)));
});
test('approved legacy public sample reproduces every pinned artifact byte and remains public in scratch history',async t=>{
 const env=await setup(t);await cp(resolve(root,'raw'),env.sourceDir,{recursive:true});
 const snapshot=await loadSnapshot(env.sourceDir);assert.equal(snapshot.testFixture,false);assert.equal(snapshot.provenance.classification,'public_reported');
 const built=await buildArtifact(snapshot,pinnedArtifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds));
 for(const [name,body] of Object.entries(built.files))assert.equal(sha256(body),sha256(await readFile(resolve(root,'artifacts',pinnedArtifactId,name))),name);
 const result=await exportArtifact({...env,artifactId:pinnedArtifactId});
 assert.equal(result.record.testFixture,false);assert.equal(result.record.provenance.classification,'public_reported');
 assert.equal(result.manifest.real_history_status,'verified_bounded_linkage');
 assert.equal(result.normalized.dataDictionary.fields.injected_liquid_bbl.status,'public reported');
 assert.equal(JSON.parse(await readFile(resolve(env.runRoot,result.record.runId,'record.json'))).provenance.classification,'public_reported');
 assert.equal(result.normalized.injectionMonthly[0].injected_liquid_bbl,17173);
});
test('unknown or contradictory source provenance cannot pass the public export gate',async t=>{
 const env=await setup(t);await cp(resolve(root,'raw'),env.sourceDir,{recursive:true});
 const metadataPath=resolve(env.sourceDir,'candidate-monthly.source.json'),original=await readFile(metadataPath);
 const metadata=JSON.parse(original);metadata.retrieved_at='2026-10-10T00:00:00.000Z';await writeFile(metadataPath,JSON.stringify(metadata));
 const unknown=await loadSnapshot(env.sourceDir);assert.equal(unknown.provenance.classification,'unknown');
 await assert.rejects(buildArtifact(unknown,'unknown-direct-build',normalize(unknown.inventory,unknown.monthly,unknown.sourceIds)),e=>e.code==='SOURCE_PROVENANCE_UNVERIFIED');
 await assert.rejects(exportArtifact({...env,artifactId:'unknown'}),e=>e.code==='SOURCE_PROVENANCE_UNVERIFIED');
 await writeFile(metadataPath,original);
 await writeFile(resolve(env.sourceDir,'acquisition.json'),JSON.stringify({schemaVersion:1,status:'succeeded',testFixture:false,mode:'live_collection',runId:'unsupported-public-claim'}));
 await assert.rejects(exportArtifact({...env,artifactId:'unsupported-public'}),e=>e.code==='SOURCE_PROVENANCE_UNVERIFIED');
 await writeFile(metadataPath,JSON.stringify({...metadata,testFixture:true}));
 await assert.rejects(exportArtifact({...env,artifactId:'contradictory'}),e=>e.code==='SOURCE_PROVENANCE_CONFLICT');
 await assert.rejects(readdir(env.outputRoot),{code:'ENOENT'});
});
test('removing fixture acquisition marker cannot promote classified sidecars to public',async t=>{
 const env=await setup(t);await collectPublicSnapshot({...env,artifactId:'fixture-original',fetchImpl:preservedFetch,testFixture:true});
 await rm(resolve(env.sourceDir,'acquisition.json'));
 const replay=await exportArtifact({...env,artifactId:'fixture-no-marker'});fixtureArtifact(replay);assert.equal(replay.record.testFixture,true);
 await assert.rejects(readdir(env.runRoot),{code:'ENOENT'});
});
test('failed fixture replay retains fixture status and stays outside actual history',async t=>{
 const env=await setup(t);await cp(resolve(root,'raw'),env.sourceDir,{recursive:true});
 await writeFile(resolve(env.sourceDir,'acquisition.json'),JSON.stringify({schemaVersion:1,status:'failed',testFixture:true}));
 await assert.rejects(exportArtifact({...env,artifactId:'failed-fixture'}),error=>{
  assert.equal(error.record.testFixture,true);
  assert.equal(error.record.provenance.classification,'test_fixture');
  assert.equal(error.record.status,'failed');return true;
 });
 await assert.rejects(readdir(env.runRoot),{code:'ENOENT'});
});
test('fixture sidecars retain classification when a markerless replay has invalid source bytes',async t=>{
 const env=await setup(t);await collectPublicSnapshot({...env,artifactId:'fixture-before-corruption',fetchImpl:preservedFetch,testFixture:true});
 await rm(resolve(env.sourceDir,'acquisition.json'));
 await writeFile(resolve(env.sourceDir,'candidate-monthly.json'),'not JSON');
 await assert.rejects(exportArtifact({...env,artifactId:'fixture-corrupted'}),error=>{assert.equal(error.record.testFixture,true);assert.equal(error.record.provenance.classification,'test_fixture');return true;});
 await assert.rejects(readdir(env.runRoot),{code:'ENOENT'});
});
test('complete recorded public provenance is retained on new versions and separate replays',async t=>{
 const env=await setup(t);await cp(resolve(root,'raw'),env.sourceDir,{recursive:true});
 // The independently verified SOURCE_PROOF sample supplies these public bytes;
 // this is offline acquisition-metadata replay, not a fresh network fetch.
 await writeFile(resolve(env.sourceDir,'acquisition.json'),JSON.stringify({schemaVersion:1,status:'succeeded',testFixture:false,mode:'live_collection',runId:'00000000-0000-4000-8000-000000000001'}));
 for(const target of acquisitionTargets){const name=target.name.replace(/\.[^.]+$/,'')+'.source.json',path=resolve(env.sourceDir,name),metadata=JSON.parse(await readFile(path)),body=await readFile(resolve(env.sourceDir,target.name));await writeFile(path,JSON.stringify({...metadata,testFixture:false,sha256:sha256(body),bytes:body.length}));}
 const result=await exportArtifact({...env,artifactId:'public-source-proof-replay'});
 assert.equal(result.manifest.provenance.classification,'public_reported');assert.equal(result.manifest.testFixture,false);
 assert.equal(result.manifest.real_history_status,'verified_bounded_linkage');
 assert.equal(result.normalized.dataDictionary.fields.injected_liquid_bbl.status,'public reported');
 assert.equal(result.record.provenance.basis,'recorded_official_acquisition');
 const again=await exportArtifact({...env,artifactId:'public-source-proof-replay'});assert.equal(again.operation,'verified_existing_bytes');
 await rm(resolve(env.sourceDir,'acquisition.json'));
 await assert.rejects(exportArtifact({...env,artifactId:'public-marker-removed'}),e=>e.code==='SOURCE_PROVENANCE_UNVERIFIED');
});
