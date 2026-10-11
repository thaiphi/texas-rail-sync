import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {loadSnapshot} from '../src/artifact.mjs';
import {exportArtifact} from '../src/pipeline.mjs';
import {boundedScope} from '../src/sources.mjs';
import {buildVersionArchive} from '../src/versionArchive.mjs';
import {sha256} from '../src/normalize.mjs';
const lookup=await import('../src/lookup.mjs').catch(()=>({}));
const root=new URL('../',import.meta.url),inventory=JSON.parse(await readFile(new URL('raw/candidate-inventory.json',root))),monthly=JSON.parse(await readFile(new URL('raw/candidate-monthly.json',root)));
async function setup(t){await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(new URL('tmp/bounded-',root));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,lookupRoot:resolve(dir,'lookups'),sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'bounded-fixture-v2',testFixture:true};}
const network=({candidates=[inventory[0]],fresh=[inventory[0]],reports=monthly,fail=null}={})=>async url=>{
 const u=new URL(url),where=u.searchParams.get('$where');
 if(fail&&u.pathname.includes(fail))return new Response('failed',{status:503});
 if(u.pathname.includes('/resource/givw-z9t4'))return new Response(JSON.stringify(where?.startsWith('api_no=')?candidates:fresh));
 if(u.pathname.includes('/resource/qq2j-f2zm'))return new Response(JSON.stringify(reports));
 const name=u.pathname.includes('givw-z9t4')?'inventory-metadata.json':u.pathname.includes('qq2j-f2zm')?'monthly-metadata.json':u.pathname.endsWith('.pdf')?'uic-manual.pdf':u.hostname==='webapps2.rrc.texas.gov'?'uic-query-help.html':'rrc-resources.html';
 return new Response(await readFile(new URL('raw/'+name,root)));
};
async function selected(env,fetchImpl=network()){
 assert.equal(typeof lookup.performLookup,'function','source-preserving lookup is required');
 const found=await lookup.performLookup({request:{kind:'api',value:'38910201'},lookupRoot:env.lookupRoot,testFixture:true,fetchImpl});
 return lookup.loadSelection({lookupRoot:env.lookupRoot,lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey});
}
test('lookup preserves empty, multiple and duplicate candidates; cap and predicate contradictions block selection',async t=>{
 const env=await setup(t);assert.equal(typeof lookup.performLookup,'function');
 const get=rows=>lookup.performLookup({request:{kind:'api',value:'38910201'},lookupRoot:env.lookupRoot,testFixture:true,fetchImpl:network({candidates:rows})});
 const empty=await get([]);assert.equal(empty.status,'empty');assert.equal(empty.candidates.length,0);
 const other={...inventory[0],uic_number:'000000001'};const multiple=await get([inventory[0],other]);assert.equal(multiple.candidates.length,2);assert.equal(multiple.candidates[0].selectable,true);
 const duplicate=await get([inventory[0],inventory[0]]);assert.equal(duplicate.candidates[0].selectable,false);assert.ok(Number.isFinite(Date.parse(duplicate.retrievedAt)));assert.equal(duplicate.candidates[0].max_liq_inj_pressure,inventory[0].max_liq_inj_pressure);
 await assert.rejects(lookup.loadSelection({lookupRoot:env.lookupRoot,lookupId:duplicate.lookupId,sourceRecordKey:duplicate.candidates[0].sourceRecordKey}),/duplicate|ambiguous/i);
 const capped=await get(Array.from({length:25},(_,i)=>({...inventory[0],uic_number:String(i).padStart(9,'0')})));assert.equal(capped.status,'cap_reached');assert.ok(capped.candidates.every(row=>!row.selectable));
 await assert.rejects(get([{...inventory[0],api_no:'00000000'}]),/predicate|scope/i);
});
test('new bounded snapshot independently replays complete hashed selection and retrieval evidence',async t=>{
 const env=await setup(t),selection=await selected(env),scope=boundedScope('000020838','2024-01','2026-04');
 const result=await collectPublicSnapshot({...env,scope,selection,fetchImpl:network()});
 assert.equal(result.manifest.transformation_version,'rrc-odp-v2.0.0');assert.equal(result.manifest.scope.end,'2026-04-30');assert.equal(result.manifest.scope.uic_number,'000020838');assert.equal(result.normalized.inventory.length,1);assert.equal(result.normalized.injectionMonthly.length,28);assert.equal(result.manifest.testFixture,true);
 for(const name of ['acquisition.json','selection.json','lookup-inventory.json','lookup-inventory.source.json','lookup-metadata.json','lookup-metadata.source.json','lookup.json','candidate-monthly.source.json'])assert.ok(result.manifest.files['sources/'+name],name);
 const archive=await buildVersionArchive({directory:resolve(env.outputRoot,env.artifactId),pins:{...JSON.parse(result.files['version-pins.json']),classification:'public_reported',defaultPinned:false,publicationPinsSha256:sha256(result.files['version-pins.json'])}}).catch(error=>error);
 assert.match(archive.message,/public|fixture/i,'even valid fixture publication pins cannot enter whole-version public export');
 const loaded=await loadSnapshot(resolve(env.outputRoot,env.artifactId,'sources'));assert.equal(loaded.scope.queryVersion,2);assert.equal(loaded.testFixture,true);
 const replay=await exportArtifact({...env,sourceDir:resolve(env.outputRoot,env.artifactId,'sources'),record:false});assert.equal(replay.operation,'verified_existing_bytes');assert.equal(replay.record.pipelineVersion,'rrc-collection-v2');assert.equal(replay.record.transformationVersion,'rrc-odp-v2.0.0');
 await assert.rejects(exportArtifact({...env,sourceDir:resolve(env.outputRoot,env.artifactId,'sources'),artifactId:env.artifactId,record:false,testFixture:true,expectedManifestSha256:'0'.repeat(64)}),/pin/i);
});
test('fresh exact-UIC parent query blocks duplicate or changed identity and preserves failed evidence',async t=>{
 for(const fresh of [[inventory[0],inventory[0]],[{...inventory[0],operator_number:'000000'}]]){
  const env=await setup(t),selection=await selected(env);
  await assert.rejects(collectPublicSnapshot({...env,selection,scope:boundedScope('000020838','2024-01','2026-04'),fetchImpl:network({fresh})}),error=>{assert.equal(error.record.status,'failed');return /parent|identity/i.test(error.message);});
  assert.equal(JSON.parse(await readFile(resolve(env.sourceDir,'acquisition.json'))).status,'failed');await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
 }
});
test('wrong UIC, outside period and exact monthly cap never publish; empty success stays incomplete',async t=>{
 for(const reports of [[{...monthly[0],uic_no:'000000001'}],[{...monthly[0],formatted_date:'2026-05-01T00:00:00'}],Array.from({length:1000},()=>monthly[0])]){
  const env=await setup(t),selection=await selected(env);
  await assert.rejects(collectPublicSnapshot({...env,selection,scope:boundedScope('000020838','2024-01','2026-04'),fetchImpl:network({reports})}));await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
 }
 const env=await setup(t),selection=await selected(env);const result=await collectPublicSnapshot({...env,selection,scope:boundedScope('000020838','2024-01','2026-04'),fetchImpl:network({reports:[]})});assert.equal(result.normalized.injectionMonthly.length,0);assert.equal(result.manifest.real_history_status,'test_fixture');assert.equal(result.manifest.scope.monthly_returned,0);
});
test('tampered lookup bytes and conflicting fixture sidecars cannot supply public selection',async t=>{
 const env=await setup(t),selection=await selected(env);const path=resolve(env.lookupRoot,selection.lookupId,'lookup-inventory.json');await writeFile(path,'[]');await assert.rejects(lookup.loadSelection({lookupRoot:env.lookupRoot,lookupId:selection.lookupId,sourceRecordKey:selection.sourceRecordKey}),/hash|evidence/i);
});
test('early failed v2 acquisition retains its exact versioned scope and official targets',async t=>{
 const env=await setup(t),selection=await selected(env),scope=boundedScope('000020838','2024-01','2026-04');
 await assert.rejects(collectPublicSnapshot({...env,selection,scope,fetchImpl:async()=>new Response('failed',{status:503})}));
 const marker=JSON.parse(await readFile(resolve(env.sourceDir,'acquisition.json')));assert.equal(marker.schemaVersion,2);assert.deepEqual(marker.scope,scope);assert.equal(marker.targets.length,7);assert.equal(marker.status,'failed');
});
test('fixture selection cannot enter actual failed acquisition history when caller requests public mode',async t=>{
 const env=await setup(t),selection=await selected(env);
 await assert.rejects(collectPublicSnapshot({...env,testFixture:false,fetchImpl:fetch,selection,scope:boundedScope('000020838','2024-01','2026-04')}),error=>{assert.equal(error.record.testFixture,true);return true;});
 await assert.rejects(stat(env.runRoot),{code:'ENOENT'});
});
test('fixture classification survives failed or malformed acquisition preflight',async t=>{
 for(const mutate of [marker=>({...marker,status:'failed'}),marker=>({...marker,scope:{...marker.scope,monthlyUic:'bad'}}),()=>'{']){
  const env=await setup(t),selection=await selected(env);await collectPublicSnapshot({...env,selection,scope:boundedScope('000020838','2024-01','2026-04'),fetchImpl:network()});
  const path=resolve(env.sourceDir,'acquisition.json'),marker=mutate(JSON.parse(await readFile(path)));await writeFile(path,typeof marker==='string'?marker:JSON.stringify(marker));
  await assert.rejects(exportArtifact({...env,testFixture:false,record:true}),error=>{assert.equal(error.record.testFixture,true);return true;});await assert.rejects(stat(env.runRoot),{code:'ENOENT'});
 }
});
