import {loadSnapshot,buildArtifact} from '../src/artifact.mjs';
import {normalize} from '../src/normalize.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,mkdir,rm,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {exportArtifact} from '../src/pipeline.mjs';
import {sha256} from '../src/normalize.mjs';
const root=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
async function setup(t){await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/versioning-'));t.after(()=>rm(dir,{recursive:true,force:true}));await cp(resolve(root,'raw'),resolve(dir,'raw'),{recursive:true});return {dir,sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts')};}
test('monthly response at its fixed query cap cannot claim complete verified history',async t=>{
 const env=await setup(t),rows=JSON.parse(await readFile(resolve(env.sourceDir,'candidate-monthly.json')));
 await writeFile(resolve(env.sourceDir,'candidate-monthly.json'),JSON.stringify(Array.from({length:1000},(_,i)=>({...rows[0],id:String(i)}))));
 await assert.rejects(exportArtifact({...env,artifactId:'capped-v1',testFixture:true,record:false}),error=>{
  assert.equal(error.record.events[1].error.code,'SOURCE_ROW_LIMIT');
  assert.deepEqual(error.record.events.map(event=>event.status),['running','failed','skipped','skipped']);return true;
 });
 await assert.rejects(stat(resolve(env.outputRoot,'capped-v1')),{code:'ENOENT'});
});
test('identical export compares existing bytes without rewriting; changed sources cannot replace a version',async t=>{
 const env=await setup(t),options={...env,artifactId:'test-version-v1',testFixture:true,record:false};
 const a=await exportArtifact(options);assert.equal(a.record.status,'succeeded');assert.equal(a.operation,'published_new_version');
 const path=resolve(env.outputRoot,'test-version-v1/manifest.json'),bytes=await readFile(path),mtime=(await stat(path)).mtimeMs;
 const b=await exportArtifact(options);assert.equal(b.operation,'verified_existing_bytes');assert.notEqual(a.record.runId,b.record.runId);assert.equal((await stat(path)).mtimeMs,mtime);
 const raw=JSON.parse(await readFile(resolve(env.sourceDir,'candidate-monthly.json')));raw[0].vol_liq='42';await writeFile(resolve(env.sourceDir,'candidate-monthly.json'),JSON.stringify(raw));
 await assert.rejects(exportArtifact(options),/version|conflict/i);assert.equal(sha256(await readFile(path)),sha256(bytes));
 const c=await exportArtifact({...options,artifactId:'test-version-v2'});assert.equal(c.manifest.artifact_id,'test-version-v2');assert.equal(c.normalized.injectionMonthly[0].injected_liquid_bbl,42);
 assert.equal(sha256(await readFile(path)),sha256(bytes));
});
test('invalid artifact identifiers and partial target directories are refused',async t=>{
 const env=await setup(t);
 for(const artifactId of ['../escape','..','a/b','a\\b','', 'x?bad'])await assert.rejects(exportArtifact({...env,artifactId,testFixture:true,record:false}),/artifact|identifier/i);
 await mkdir(resolve(env.outputRoot,'partial'),{recursive:true});await writeFile(resolve(env.outputRoot,'partial/inventory.csv'),'partial');
 await assert.rejects(exportArtifact({...env,artifactId:'partial',testFixture:true,record:false}),/version|conflict/i);
 assert.equal(await readFile(resolve(env.outputRoot,'partial/inventory.csv'),'utf8'),'partial');
});
test('incomplete source loading fails with skipped downstream stages; test fixtures never enter actual history',async t=>{
 const env=await setup(t);await rm(resolve(env.sourceDir,'candidate-monthly.source.json'));
 try{await exportArtifact({...env,artifactId:'incomplete',testFixture:true,record:false});assert.fail('must fail');}catch(error){assert.equal(error.record.status,'failed');assert.deepEqual(error.record.events.filter(e=>e.status!=='running').map(e=>e.status),['failed','skipped','skipped']);}
 await assert.rejects(stat(resolve(env.outputRoot,'incomplete')),{code:'ENOENT'});
});

test('export uses the loaded snapshot consistently if files change during execution',async t=>{
 const env=await setup(t),snapshot=await loadSnapshot(env.sourceDir),normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds);
 const path=resolve(env.sourceDir,'monthly-metadata.json'),metadata=JSON.parse(await readFile(path));metadata.rowsUpdatedAt=0;await writeFile(path,JSON.stringify(metadata));
 const built=await buildArtifact(snapshot,'snapshot-consistent-v1',normalized);
 assert.equal(built.manifest.source_revisions.monthly_rows_updated_at,1790862225);
 assert.equal(sha256(built.files['sources/monthly-metadata.json']),built.manifest.sources.find(s=>s.name==='monthly-metadata').sha256);
});

test('source evidence must match the fixed official endpoint and selected UIC scope',async t=>{
 const env=await setup(t),metadataPath=resolve(env.sourceDir,'candidate-monthly.source.json'),metadata=JSON.parse(await readFile(metadataPath));
 metadata.url='https://data.texas.gov/resource/another-dataset.json';await writeFile(metadataPath,JSON.stringify(metadata));
 await assert.rejects(exportArtifact({...env,artifactId:'wrong-source',testFixture:true,record:false}),error=>{assert.equal(error.record.events.find(e=>e.status==='failed').error.code,'SOURCE_INVALID');return true;});
 const originalMetadata=await readFile(resolve(root,'raw/candidate-monthly.source.json'));await writeFile(metadataPath,originalMetadata);
 const rows=JSON.parse(await readFile(resolve(env.sourceDir,'candidate-monthly.json')));rows[0].uic_no='000022085';await writeFile(resolve(env.sourceDir,'candidate-monthly.json'),JSON.stringify(rows));
 await assert.rejects(exportArtifact({...env,artifactId:'wrong-scope',testFixture:true,record:false}),error=>{assert.deepEqual(error.record.events.filter(e=>e.status!=='running').map(e=>e.status),['succeeded','failed','skipped']);assert.equal(error.record.events.find(e=>e.status==='failed').error.code,'SOURCE_SCOPE_MISMATCH');return true;});
});

test('source diagnostics do not expose unrecognized retrieval metadata fields',async t=>{
 const env=await setup(t),path=resolve(env.sourceDir,'candidate-monthly.source.json'),metadata=JSON.parse(await readFile(path));metadata.password='private-secret-value';await writeFile(path,JSON.stringify(metadata));
 const result=await exportArtifact({...env,artifactId:'safe-metadata',testFixture:true,record:false});assert.equal(JSON.stringify(result.record).includes('private-secret-value'),false);assert.equal(JSON.stringify(result.manifest).includes('private-secret-value'),false);
});
