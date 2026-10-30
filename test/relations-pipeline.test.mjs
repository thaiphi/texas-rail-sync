// RRC-15 (Phase 3b, Task 1): query version 5 end to end in fixture mode. v5 queries exactly the
// v4 targets and adds evidence_relations.json; the §5 regression (v5 vs derived v4), determinism
// and replay, the scope cross-check, D7 guest and transfer-script refusals, tampering, and the
// local /api/collect switch. Fixture provenance only (the Phase 3 wellbore fixture network);
// nothing here is a public observation and no network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm,writeFile,readdir,cp,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Buffer} from 'node:buffer';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {loadSnapshot,buildArtifact} from '../src/artifact.mjs';
import {exportArtifact} from '../src/pipeline.mjs';
import {prepareArtifactFromReader,finalizeArtifactFromReader} from '../src/exportCore.mjs';
import {resumeRunRecorder} from '../src/runEvents.mjs';
import {collectionScope,boundedScope,boundedTestScope,boundedWellboreScope,boundedRelationScope,targetsForScope,isLocalOnly,isBounded,versionLabels} from '../src/sources.mjs';
import {normalize,sha256} from '../src/normalize.mjs';
import {workflowView} from '../public/workflow.js';
import {loadVerifiedSidecar} from '../public/artifact-integrity.js';
import {performLookup,loadSelection} from '../src/lookup.mjs';
import {createExplorerServer} from '../scripts/serve.mjs';
const root=new URL('../',import.meta.url),rootPath=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const raw=name=>readFile(new URL('raw/'+name,root)),tests=name=>readFile(new URL('test/fixtures/test-reports/'+name,root)),wellbore=name=>readFile(new URL('test/fixtures/wellbore/'+name,root));
const inventory=JSON.parse(await raw('candidate-inventory.json')),monthly=JSON.parse(await raw('candidate-monthly.json'));
const casingRows=JSON.parse(await wellbore('candidate-casing.json')),pluggingRows=JSON.parse(await wellbore('synthetic-plugging.json'));
const uic='000020838',api='38910201',selectedRow=inventory[0];
const v4Scope=boundedWellboreScope(uic,'2024-01','2026-04',api),v5Scope=boundedRelationScope(uic,'2024-01','2026-04',api);
const wellboreSidecars=['casing.json','casing.csv','plugging.json','plugging.csv','wellbore_dictionary.json'];
async function setup(t,prefix='trrc-v5-'){await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(resolve(rootPath,'tmp',prefix));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,lookupRoot:resolve(dir,'lookups'),sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'bounded-fixture-v5',testFixture:true};}
// The Phase 3 fixture network (test/wellbore-pipeline.test.mjs), routed by exact host/path.
function network({row=selectedRow,byApi=null,casing=casingRows,plugging=pluggingRows,seen=[]}={}){
 const body=value=>typeof value==='string'?value:JSON.stringify(value);
 return async url=>{
  seen.push(url);const u=new URL(url),where=u.searchParams.get('$where'),path=u.hostname+u.pathname;
  const routes={'data.texas.gov/resource/givw-z9t4.json':()=>where?.startsWith('api_no=')?body(byApi??[row]):JSON.stringify([row]),'data.texas.gov/resource/qq2j-f2zm.json':()=>JSON.stringify(monthly),
   'data.texas.gov/resource/qxfy-wcfs.json':()=>tests('candidate-bhp.json'),'data.texas.gov/resource/h54t-xnbi.json':()=>tests('candidate-srt.json'),
   'data.texas.gov/resource/u9m4-xnh6.json':()=>body(casing),'data.texas.gov/resource/wfzn-9fje.json':()=>body(plugging),
   'data.texas.gov/api/views/givw-z9t4.json':()=>raw('inventory-metadata.json'),'data.texas.gov/api/views/qq2j-f2zm.json':()=>raw('monthly-metadata.json'),'data.texas.gov/api/views/qxfy-wcfs.json':()=>tests('bhp-metadata.json'),'data.texas.gov/api/views/h54t-xnbi.json':()=>tests('srt-metadata.json'),
   'data.texas.gov/api/views/u9m4-xnh6.json':()=>wellbore('casing-metadata.json'),'data.texas.gov/api/views/wfzn-9fje.json':()=>wellbore('plugging-metadata.json'),
   'www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf':()=>raw('uic-manual.pdf'),'www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/':()=>raw('rrc-resources.html'),'webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html':()=>raw('uic-query-help.html'),
   'www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/':()=>tests('srt-guidelines.html'),
   'www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf':()=>tests('bhp-permian-nto.pdf'),
   'www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf':()=>wellbore('wellbore-wba091.pdf'),'www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf':()=>wellbore('form-w2.pdf'),'www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf':()=>wellbore('form-w3.pdf')};
  if(!routes[path])return new Response('unknown fixture route',{status:404});
  return new Response(await routes[path]());
 };
}
async function collect(env,options={}){
 const fetchImpl=network(options);
 const found=await performLookup({request:{kind:'uic',value:uic},lookupRoot:env.lookupRoot,testFixture:true,fetchImpl});
 const selection=await loadSelection({lookupRoot:env.lookupRoot,lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey});
 return collectPublicSnapshot({...env,scope:(options.scopeFor??boundedRelationScope)(uic,'2024-01','2026-04',selection.row.api_no),selection,fetchImpl});
}
const json=async path=>JSON.parse(await readFile(path));
const published=(env,name)=>json(resolve(env.outputRoot,env.artifactId,name));

test('v5 collection: the 21 v4 targets, v5 labels, evidence_relations.json listed last and reconciled',async t=>{
 const env=await setup(t),seen=[],result=await collect(env,{seen});
 assert.deepEqual(targetsForScope(v5Scope),targetsForScope(v4Scope),'v5 queries exactly the v4 targets in order');
 const marker=await json(resolve(env.sourceDir,'acquisition.json'));assert.equal(marker.schemaVersion,2);assert.deepEqual(marker.scope,v5Scope);assert.equal(marker.scope.queryVersion,5);
 assert.deepEqual(marker.targets,targetsForScope(v4Scope).map(target=>target.url));assert.equal(marker.targets.length,21);
 assert.deepEqual([...new Set(seen)].sort(),[...marker.targets].sort(),'no URL beyond the v4 targets was requested');
 assert.equal(result.record.pipelineVersion,'rrc-collection-v5');assert.equal(result.record.transformationVersion,'rrc-odp-v2.3.0');workflowView(result.record);
 assert.equal(result.manifest.transformation_version,'rrc-odp-v2.3.0');assert.equal(result.manifest.scope.query_version,5);
 const names=Object.keys(result.manifest.files);assert.equal(names.at(-1),'evidence_relations.json');assert.deepEqual(names.slice(-6,-1),wellboreSidecars);
 const out=resolve(env.outputRoot,env.artifactId),bytes=await readFile(resolve(out,'evidence_relations.json'));
 assert.equal(sha256(bytes),result.manifest.files['evidence_relations.json'].sha256);assert.equal(bytes.length,result.manifest.files['evidence_relations.json'].bytes);
 const doc=JSON.parse(bytes);assert.equal(bytes.toString('utf8'),JSON.stringify(doc,null,2)+'\n');
 assert.equal(doc.artifactId,env.artifactId);assert.deepEqual(doc.scope,{query_version:5,inventory_source_record_key:JSON.parse(result.files['normalized.json']).inventory[0].source_record_key,source_api_id:api});
 for(const name of ['tests.json','casing.json','plugging.json'])assert.equal((await published(env,name)).scope.query_version,5,name+' OD-7');
 const casing=await published(env,'casing.json'),plugging=await published(env,'plugging.json'),testsJson=await published(env,'tests.json'),quality=await published(env,'quality_report.json');
 assert.deepEqual(doc.counts.inventory_to_h10.total,quality.monthly.raw);assert.equal(doc.counts.inventory_to_test_report.total,testsJson.quality.bhp.raw+testsJson.quality.srt.raw);
 assert.equal(doc.counts.wellbore_to_casing.total,casing.quality.counts.raw);assert.equal(doc.counts.wellbore_to_plugging.total,plugging.quality.counts.raw);
 for(const item of doc.relations)for(const ref of item.evidence)assert.equal(ref.sha256,result.manifest.files[ref.file].sha256,ref.file);
 assert.ok(!doc.relations.some(r=>r.status==='needs_review'));
 const added=result.manifest.limitations.filter(item=>/evidence_relations/.test(item));assert.equal(added.length,1);assert.match(added[0],/query version 5 queries exactly the version 4 targets/);
 // Run evidence is unchanged: no new normalize-qc key; the export stage lists the file.
 const qc=result.record.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence;assert.equal(qc.outputs.length,2);assert.ok(qc.wellbore&&qc.testReports);assert.equal(qc.relations,undefined);
 const exported=result.record.events.find(e=>e.stage==='export'&&e.status==='succeeded').evidence;assert.ok(exported.outputs.some(o=>o.path.endsWith('/evidence_relations.json')&&o.sha256===sha256(bytes)));
});

test('no eight-digit API: v5 has 18 targets and none/api_missing_or_invalid edges with to_key null',async t=>{
 const env=await setup(t),result=await collect(env,{row:{...selectedRow,api_no:''}});
 assert.equal((await json(resolve(env.sourceDir,'acquisition.json'))).targets.length,18);
 assert.deepEqual(targetsForScope(boundedRelationScope(uic,'2024-01','2026-04',null)),targetsForScope(boundedWellboreScope(uic,'2024-01','2026-04',null)));
 const doc=await published(env,'evidence_relations.json');
 const links=doc.relations.filter(r=>r.relation==='inventory_to_wellbore');
 assert.deepEqual(links.map(r=>[r.dataset,r.status,r.reason,r.to_key,r.evidence.map(e=>e.file)]),[['casing','none','api_missing_or_invalid',null,['sources/candidate-inventory.json']],['plugging','none','api_missing_or_invalid',null,['sources/candidate-inventory.json']]]);
 assert.equal(doc.scope.source_api_id,null);assert.ok(!doc.relations.some(r=>r.from_kind==='wellbore'));assert.equal(result.record.status,'succeeded');
});

test('§5 regression criterion: v5 differs from the derived v4 version only by the closed list',async t=>{
 const env=await setup(t);await collect(env);
 const v4Dir=resolve(env.dir,'v4-sources');await mkdir(v4Dir);
 for(const name of await readdir(env.sourceDir))if(name!=='acquisition.json')await cp(resolve(env.sourceDir,name),resolve(v4Dir,name));
 const marker=await json(resolve(env.sourceDir,'acquisition.json'));
 await writeFile(resolve(v4Dir,'acquisition.json'),JSON.stringify({...marker,targets:targetsForScope(v4Scope).map(t=>t.url),scope:v4Scope},null,2)+'\n');
 const artifactId='same-artifact-id',v5=await exportArtifact({sourceDir:env.sourceDir,artifactId,outputRoot:resolve(env.dir,'out-v5'),testFixture:true,record:false}),v4=await exportArtifact({sourceDir:v4Dir,artifactId,outputRoot:resolve(env.dir,'out-v4'),testFixture:true,record:false});
 assert.equal(v4.record.pipelineVersion,'rrc-collection-v4');assert.equal(v5.record.pipelineVersion,'rrc-collection-v5');
 assert.equal(v4.files['evidence_relations.json'],undefined,'a v4 version never gets the relation file');assert.ok(v5.files['evidence_relations.json']);
 for(const name of ['inventory.csv','injection_monthly.csv','quality_report.json','data_dictionary.json','tests_bhp.csv','tests_srt.csv','tests_dictionary.json','casing.csv','plugging.csv','wellbore_dictionary.json'])assert.ok(Buffer.from(v5.files[name]).equals(Buffer.from(v4.files[name])),name);
 assert.equal(v5.manifest.normalized_payload_sha256,v4.manifest.normalized_payload_sha256);
 for(const name of ['tests.json','casing.json','plugging.json']){const a=JSON.parse(v5.files[name]),b=JSON.parse(v4.files[name]);assert.equal(a.scope.query_version,5);assert.equal(b.scope.query_version,4);a.scope.query_version=4;assert.deepEqual(a,b,name);}
 const a=structuredClone(v5.manifest),b=structuredClone(v4.manifest);
 assert.equal(a.transformation_version,'rrc-odp-v2.3.0');assert.equal(b.transformation_version,'rrc-odp-v2.2.0');a.transformation_version=b.transformation_version;
 assert.equal(a.scope.query_version,5);a.scope.query_version=4;
 assert.deepEqual(a.sources,b.sources,'no sources entry is added');
 const appended=Object.keys(a.files).filter(name=>!Object.hasOwn(b.files,name));assert.deepEqual(appended,['evidence_relations.json']);delete a.files['evidence_relations.json'];
 assert.ok(!Object.keys(a.files).some(name=>name.startsWith('sources/')&&!Object.hasOwn(b.files,name)),'no sources/ file is added');
 for(const name of ['sources/acquisition.json','tests.json','casing.json','plugging.json']){assert.notEqual(a.files[name].sha256,b.files[name].sha256,name);a.files[name]=b.files[name];}
 const added=a.limitations.filter(item=>!b.limitations.includes(item));assert.equal(added.length,1);assert.match(added[0],/evidence_relations/);a.limitations=a.limitations.filter(item=>item!==added[0]);
 assert.deepEqual(a,b);
 const n5=JSON.parse(v5.files['normalized.json']),n4=JSON.parse(v4.files['normalized.json']);delete n5.manifest;delete n4.manifest;
 assert.equal(JSON.stringify(n5),JSON.stringify(n4));
});

test('determinism: two exports, the published replay and a rebuild give the same evidence_relations.json',async t=>{
 const env=await setup(t),result=await collect(env),expected=result.manifest.files['evidence_relations.json'].sha256;
 const first=await exportArtifact({sourceDir:env.sourceDir,artifactId:'determinism',outputRoot:resolve(env.dir,'out-a'),testFixture:true,record:false});
 const second=await exportArtifact({sourceDir:env.sourceDir,artifactId:'determinism',outputRoot:resolve(env.dir,'out-b'),testFixture:true,record:false});
 assert.ok(Buffer.from(first.files['evidence_relations.json']).equals(Buffer.from(second.files['evidence_relations.json'])));
 assert.ok((await readFile(resolve(env.dir,'out-a/determinism/evidence_relations.json'))).equals(await readFile(resolve(env.dir,'out-b/determinism/evidence_relations.json'))));
 const sources=resolve(env.outputRoot,env.artifactId,'sources');
 const replay=await exportArtifact({...env,sourceDir:sources,record:false});assert.equal(replay.operation,'verified_existing_bytes');assert.equal(replay.record.pipelineVersion,'rrc-collection-v5');
 const snapshot=await loadSnapshot(sources),built=await buildArtifact(snapshot,env.artifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));
 assert.equal(sha256(built.files['evidence_relations.json']),expected);
});

test('scope cross-check: targetsForScope refuses tampered v5 scopes and round-trips through JSON',()=>{
 assert.deepEqual(targetsForScope(JSON.parse(JSON.stringify(v5Scope))),targetsForScope(v5Scope));
 for(const tamper of [{sourceApiId:'1234'},{sourceApiId:38910201},{wellboreLimit:999},{wellboreInventoryLimit:26},{testReportLimit:500},{inventoryLimit:5},{relationCatalogue:true}])assert.throws(()=>targetsForScope({...v5Scope,...tamper}),/query contract/,JSON.stringify(tamper));
 const missing={...v5Scope};delete missing.sourceApiId;assert.throws(()=>targetsForScope(missing),/query contract/);
 assert.ok(Object.isFrozen(v5Scope));assert.deepEqual({...v5Scope,queryVersion:4},{...v4Scope});
 assert.ok(isBounded(v5Scope)&&isLocalOnly(v5Scope));assert.ok(!isBounded({...v5Scope,queryVersion:6}));
 assert.deepEqual(versionLabels(v5Scope),{pipelineVersion:'rrc-collection-v5',transformationVersion:'rrc-odp-v2.3.0'});
 assert.deepEqual(versionLabels(v4Scope),{pipelineVersion:'rrc-collection-v4',transformationVersion:'rrc-odp-v2.2.0'});
});

test('negative: no target of v1-v5 sends api_no to H-10, no v5 target names uumf-5r4y',()=>{
 const scopes=[collectionScope,boundedScope(uic,'2024-01','2026-04'),boundedTestScope(uic,'2024-01','2026-04'),v4Scope,boundedWellboreScope(uic,'2024-01','2026-04',null),v5Scope,boundedRelationScope(uic,'2024-01','2026-04',null)];
 for(const scope of scopes)for(const target of targetsForScope(scope)){
  const url=new URL(target.url),query=decodeURIComponent(url.search);
  if(url.pathname.includes('qq2j-f2zm'))assert.doesNotMatch(query,/api_no/,target.name);
  assert.doesNotMatch(target.url,/uumf-5r4y/,target.name);
 }
 assert.equal(targetsForScope(v5Scope).length,21);assert.equal(targetsForScope(boundedRelationScope(uic,'2024-01','2026-04',null)).length,18);
});

test('guest path refuses v5 by prepare and finalize with the unchanged D7 message',async t=>{
 const env=await setup(t);await collect(env);
 const v5Read=name=>readFile(resolve(env.outputRoot,env.artifactId,'sources',name));
 await assert.rejects(prepareArtifactFromReader({readBytes:v5Read,sourceReference:'guest/v5',artifactId:'guest-v5',testFixture:true}),error=>{assert.equal(error.code,'SOURCE_INVALID');assert.equal(error.message,'test-report versions are local-only (D7)');assert.equal(error.record.status,'failed');assert.equal(error.record.pipelineVersion,'rrc-collection-v1','guest recorder never takes v5 labels');return true;});
 const v2Source=resolve(rootPath,'artifacts/rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0/sources'),v2Read=name=>readFile(resolve(v2Source,name));
 const prepared=await prepareArtifactFromReader({readBytes:v2Read,sourceReference:'guest/v2',artifactId:'guest-v2',testFixture:true});
 assert.equal(prepared.files['evidence_relations.json'],undefined);
 const store=new Map(Object.entries(prepared.files)),publisher={readStaged:async(_id,name)=>store.get(name),readPublished:async(_id,name)=>store.get(name),publish:async()=>'verified_existing_bytes'};
 await assert.rejects(finalizeArtifactFromReader({readBytes:v5Read,sourceReference:'guest/v2',artifactId:'guest-v2',testFixture:true,recorder:resumeRunRecorder(JSON.parse(JSON.stringify(prepared.record))),publisher}),error=>error.code==='SOURCE_INVALID'&&error.message==='test-report versions are local-only (D7)');
});

test('transfer script (unchanged) skips a v5 version, its collected sources and its run',async t=>{
 const env=await setup(t,'trrc-v5-transfer-'),base=env.dir,id='rrc-2026-10-29-uic000020838-v5-fixture',sourceId='00000000-0000-4000-8000-000000000005',runId='00000000-0000-4000-8000-000000000055';
 for(const dir of ['scripts','raw','lookups','public','artifacts/'+id,'artifacts/kept-v2','collected-sources/'+sourceId,'runs/'+runId])await mkdir(resolve(base,dir),{recursive:true});
 await copyFile(resolve(rootPath,'scripts/prepare-supabase-archive.mjs'),resolve(base,'scripts/prepare-supabase-archive.mjs'));
 assert.ok((await readFile(resolve(base,'scripts/prepare-supabase-archive.mjs'))).equals(await readFile(resolve(rootPath,'scripts/prepare-supabase-archive.mjs'))));
 await writeFile(resolve(base,'artifacts',id,'manifest.json'),JSON.stringify({artifact_id:id,scope:{query_version:5}}));
 await writeFile(resolve(base,'artifacts',id,'evidence_relations.json'),'{}');
 await writeFile(resolve(base,'artifacts/kept-v2/manifest.json'),JSON.stringify({scope:{query_version:2}}));
 await writeFile(resolve(base,'collected-sources',sourceId,'acquisition.json'),JSON.stringify({schemaVersion:2,scope:{queryVersion:5},targets:[]}));
 await writeFile(resolve(base,'runs',runId,'record.json'),JSON.stringify({runId,pipelineVersion:'rrc-collection-v5',events:[{stage:'export',status:'succeeded',evidence:{artifactId:id}}]}));
 for(const name of ['artifact-path.json','artifact-integrity.json'])await writeFile(resolve(base,'public',name),'{}');
 const {stdout,stderr}=await promisify(execFile)(process.execPath,[resolve(base,'scripts/prepare-supabase-archive.mjs')],{cwd:base});
 const skips=stderr.trim().split('\n').map(line=>JSON.parse(line));
 assert.deepEqual(skips,[{event:'skipped_local_only_test_report_version',path:'artifacts/'+id},{event:'skipped_local_only_test_report_version',path:'runs/'+runId},{event:'skipped_local_only_test_report_version',path:'collected-sources/'+sourceId}]);
 const paths=JSON.parse(stdout).files.map(file=>file.path);
 assert.ok(paths.includes('artifacts/kept-v2/manifest.json'));assert.ok(!paths.some(path=>path.includes(id)||path.includes(sourceId)||path.includes(runId)||path.includes('evidence_relations')));
});

test('tampered evidence_relations.json is refused by package replay and by loadVerifiedSidecar',async t=>{
 const env=await setup(t),result=await collect(env),out=resolve(env.outputRoot,env.artifactId),path=resolve(out,'evidence_relations.json');
 const original=await readFile(path),doc=JSON.parse(original);doc.relations[0].status='ambiguous';await writeFile(path,JSON.stringify(doc,null,2)+'\n');
 assert.notEqual(sha256(await readFile(path)),result.manifest.files['evidence_relations.json'].sha256);
 await assert.rejects(exportArtifact({...env,sourceDir:resolve(out,'sources'),record:false}),error=>error.code==='VERSION_CONFLICT');
 const artifact={artifactId:env.artifactId,manifest:result.manifest},integrity={artifactId:env.artifactId,path:`/artifacts/${env.artifactId}/`};
 const fetchImpl=async url=>new Response(await readFile(resolve(env.outputRoot,url.replace(/^\/artifacts\//,''))));
 await assert.rejects(loadVerifiedSidecar(artifact,integrity,'evidence_relations.json',fetchImpl),/hash or size mismatch/);
 await writeFile(path,original);assert.ok(Buffer.from(await loadVerifiedSidecar(artifact,integrity,'evidence_relations.json',fetchImpl)).equals(original));
});

test('caller-supplied rows never reach the catalogue: mutated snapshots are refused',async t=>{
 const env=await setup(t);await collect(env);const sources=resolve(env.outputRoot,env.artifactId,'sources');
 for(const mutate of [s=>{s.monthly[0].uic_no='000999999';},s=>{s.monthly.push(structuredClone(s.monthly[0]));},s=>{s.inventory[0].uic_number='000999999';},s=>{s.tests.bhp.push({uic_no:uic,report_id:'synthetic'});},s=>{s.wellbore.casing[0].api_no='38910202';},s=>{s.wellbore.plugging=[];},s=>{s.sources[0].raw_file='sources/candidate-monthly.json';},s=>{s.sources.push({...s.sources[0],name:'extra'});}]){
  const copy=await loadSnapshot(sources);mutate(copy);
  await assert.rejects(buildArtifact(copy,env.artifactId,normalize(copy.inventory,copy.monthly,copy.sourceIds,copy.scope)),error=>error.code==='SOURCE_HASH_MISMATCH');
 }
 const snapshot=await loadSnapshot(sources),built=await buildArtifact(snapshot,env.artifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));
 assert.equal(sha256(built.files['evidence_relations.json']),sha256(await readFile(resolve(env.outputRoot,env.artifactId,'evidence_relations.json'))));
});

test('local /api/collect produces v5 with the request schema unchanged',async t=>{
 const env=await setup(t,'trrc-v5-api-'),server=createExplorerServer({runRoot:env.runRoot,lookupRoot:env.lookupRoot,sourceRoot:resolve(env.dir,'sources'),outputRoot:env.outputRoot,fetchImpl:network(),testFixture:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`,post=(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
 const found=await (await post('/api/lookup',{kind:'uic',value:uic})).json();
 const body={lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey,startMonth:'2024-01',endMonth:'2026-04'};
 for(const extra of [{queryVersion:4},{relationCatalogue:true}])assert.equal((await post('/api/collect',{...body,...extra})).status,400,'request schema unchanged');
 const response=await post('/api/collect',body);assert.equal(response.status,201);const result=await response.json();
 assert.equal(result.scope.query_version,5);assert.equal(result.run.pipelineVersion,'rrc-collection-v5');assert.equal(result.run.transformationVersion,'rrc-odp-v2.3.0');
 const marker=await json(resolve(env.outputRoot,result.artifactId,'sources/acquisition.json'));assert.equal(marker.scope.queryVersion,5);assert.deepEqual(marker.targets,targetsForScope(v4Scope).map(target=>target.url));
 const doc=await json(resolve(env.outputRoot,result.artifactId,'evidence_relations.json'));assert.equal(doc.artifactId,result.artifactId);assert.equal(doc.scope.query_version,5);
});
