// RRC-13 (Phase 2): v3 local collection, additive test-report sidecars, the §6
// regression criterion, committed-version replay and the D7 guest refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm,writeFile,stat,readdir,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Buffer} from 'node:buffer';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {loadSnapshot,buildArtifact,pinnedArtifactId} from '../src/artifact.mjs';
import {exportArtifact} from '../src/pipeline.mjs';
import {prepareArtifactFromReader,finalizeArtifactFromReader} from '../src/exportCore.mjs';
import {resumeRunRecorder} from '../src/runEvents.mjs';
import {boundedScope,boundedTestScope,targetsForScope} from '../src/sources.mjs';
import {normalize,sha256} from '../src/normalize.mjs';
import {testColumns} from '../src/testReports.mjs';
import {workflowView} from '../public/workflow.js';
import {performLookup,loadSelection} from '../src/lookup.mjs';
import {GUEST_EVIDENCE_NAMES} from '../src/hosted/guest-steps.mjs';
import {createExplorerServer} from '../scripts/serve.mjs';
const root=new URL('../',import.meta.url),rootPath=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const raw=name=>readFile(new URL('raw/'+name,root)),fixture=name=>readFile(new URL('test/fixtures/test-reports/'+name,root));
const inventory=JSON.parse(await raw('candidate-inventory.json')),monthly=JSON.parse(await raw('candidate-monthly.json'));
const bhpRows=JSON.parse(await fixture('candidate-bhp.json')),srtRows=JSON.parse(await fixture('candidate-srt.json'));
const uic='000020838',scope=boundedTestScope(uic,'2024-01','2026-04'),v2Scope=boundedScope(uic,'2024-01','2026-04');
const newNames=['bhp-metadata.json','srt-metadata.json','candidate-bhp.json','candidate-srt.json','srt-guidelines.html','bhp-permian-nto.pdf'];
const sidecarFiles=['tests.json','tests_bhp.csv','tests_srt.csv','tests_dictionary.json'];
async function setup(t,prefix='trrc-v3-'){await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(resolve(rootPath,'tmp',prefix));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,lookupRoot:resolve(dir,'lookups'),sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'bounded-fixture-v3',testFixture:true};}
// Routes by exact host/path; never falls back to another preserved document.
const network=({bhp=bhpRows,srt=srtRows,reports=monthly}={})=>async url=>{
 const u=new URL(url),where=u.searchParams.get('$where'),path=u.hostname+u.pathname;
 const routes={'data.texas.gov/resource/givw-z9t4.json':()=>JSON.stringify(where?.startsWith('api_no=')?[inventory[0]]:[inventory[0]]),'data.texas.gov/resource/qq2j-f2zm.json':()=>JSON.stringify(reports),'data.texas.gov/resource/qxfy-wcfs.json':()=>typeof bhp==='string'?bhp:JSON.stringify(bhp),'data.texas.gov/resource/h54t-xnbi.json':()=>JSON.stringify(srt),
  'data.texas.gov/api/views/givw-z9t4.json':()=>raw('inventory-metadata.json'),'data.texas.gov/api/views/qq2j-f2zm.json':()=>raw('monthly-metadata.json'),'data.texas.gov/api/views/qxfy-wcfs.json':()=>fixture('bhp-metadata.json'),'data.texas.gov/api/views/h54t-xnbi.json':()=>fixture('srt-metadata.json'),
  'www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf':()=>raw('uic-manual.pdf'),'www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/':()=>raw('rrc-resources.html'),'webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html':()=>raw('uic-query-help.html'),
  'www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/':()=>fixture('srt-guidelines.html'),
  'www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf':()=>fixture('bhp-permian-nto.pdf')};
 if(!routes[path])return new Response('unknown fixture route',{status:404});
 return new Response(await routes[path]());
};
async function selected(env,fetchImpl=network()){
 const found=await performLookup({request:{kind:'uic',value:uic},lookupRoot:env.lookupRoot,testFixture:true,fetchImpl});
 return loadSelection({lookupRoot:env.lookupRoot,lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey});
}
async function collect(env,options={}){const selection=await selected(env);return collectPublicSnapshot({...env,scope,selection,fetchImpl:network(options),...(options.collect??{})});}
const json=async path=>JSON.parse(await readFile(path));

test('v3 collection appends BHP/SRT sources and four sidecars, records v3 labels and reconciles test counts',async t=>{
 const env=await setup(t),result=await collect(env);
 assert.equal(result.record.pipelineVersion,'rrc-collection-v3');assert.equal(result.record.transformationVersion,'rrc-odp-v2.1.0');workflowView(result.record);
 assert.equal(result.manifest.transformation_version,'rrc-odp-v2.1.0');assert.equal(result.manifest.scope.query_version,3);assert.equal(result.manifest.scope.test_report_limit,1000);
 const marker=await json(resolve(env.sourceDir,'acquisition.json'));assert.equal(marker.schemaVersion,2);assert.deepEqual(marker.scope,scope);assert.equal(marker.targets.length,13);
 const names=result.manifest.sources.map(s=>s.name);assert.deepEqual(names.slice(-6),['candidate-bhp','candidate-srt','bhp-metadata','srt-metadata','srt-guidelines.html','bhp-permian-nto.pdf']);assert.equal(names[7],'lookup-inventory');
 const bhp=result.manifest.sources.find(s=>s.name==='candidate-bhp');assert.equal(bhp.kind,'bhp');assert.match(bhp.snapshot_id,/^qxfy-wcfs:[a-f0-9]{16}$/);assert.equal(bhp.title,'RRC-UIC Bottom Hole Pressure Test Results');
 assert.match(result.manifest.sources.find(s=>s.name==='candidate-srt').snapshot_id,/^h54t-xnbi:[a-f0-9]{16}$/);
 const fileNames=Object.keys(result.manifest.files);assert.deepEqual(fileNames.slice(-4),sidecarFiles);
 for(const name of newNames)for(const file of [name,name.replace(/\.[^.]+$/,'')+'.source.json'])assert.ok(result.manifest.files['sources/'+file],file);
 assert.ok(fileNames.slice(0,-4).every(name=>!sidecarFiles.includes(name)));
 const published=resolve(env.outputRoot,env.artifactId);
 for(const name of sidecarFiles){const bytes=await readFile(resolve(published,name));assert.equal(sha256(bytes),result.manifest.files[name].sha256);assert.equal(bytes.length,result.manifest.files[name].bytes);}
 const tests=await json(resolve(published,'tests.json'));
 assert.deepEqual(Object.keys(tests),['schemaVersion','artifactId','scope','bhp','srt','quality']);assert.equal(tests.schemaVersion,1);assert.equal(tests.artifactId,env.artifactId);
 assert.deepEqual(tests.scope,{query_version:3,uic_number:uic,test_report_limit:1000,order:'BHP report_id,tracking_no,test_sequence_no; SRT report_id,tracking_no',bhp_returned:2,srt_returned:1,bhp_status:'returned_below_cap',srt_status:'returned_below_cap',window:'exact uic_no; not limited to reporting period'});
 assert.equal(tests.manifest,undefined);assert.equal(tests.bhp.length,2);assert.equal(tests.srt[0].isip_psig,-35);
 assert.deepEqual(Object.keys(tests.quality),['bhp','srt','parent_join','issue_counts','dispositions','duplicate_policy','empty_result_policy']);
 assert.equal((await readFile(resolve(published,'tests_bhp.csv'),'utf8')).split('\n')[0],testColumns.bhp.join(','));
 assert.equal((await readFile(resolve(published,'tests_srt.csv'),'utf8')).split('\n')[0],testColumns.srt.join(','));
 const dictionary=await json(resolve(published,'tests_dictionary.json'));assert.equal(dictionary.fields.bhp_psia.status,'synthetic','fixture dictionary is never public reported');
 const load=result.record.events.find(e=>e.stage==='load'&&e.status==='succeeded').evidence,qc=result.record.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence;
 assert.equal(load.inputs.find(i=>i.kind==='bhp').count,2);assert.equal(load.inputs.find(i=>i.kind==='srt').count,1);assert.equal(load.requests.length,13);
 assert.deepEqual(qc.testReports,{bhp:{raw:2,parsed:2,accepted:2,quarantined:0,excluded:0},srt:{raw:1,parsed:1,accepted:1,quarantined:0,excluded:0}});assert.equal(qc.outputs.length,2);
 assert.equal(qc.counts.issue_counts['duplicate_report_identity'],undefined,'test-report quality never enters the v1 quality report');
 const replay=await exportArtifact({...env,sourceDir:resolve(published,'sources'),record:false});
 assert.equal(replay.operation,'verified_existing_bytes');assert.equal(replay.record.pipelineVersion,'rrc-collection-v3');assert.deepEqual(replay.record.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence.testReports,qc.testReports);
});
test('empty BHP/SRT responses publish confirmed_empty with 0 = 0 + 0',async t=>{
 const env=await setup(t),result=await collect(env,{bhp:[],srt:[]});
 const tests=await json(resolve(env.outputRoot,env.artifactId,'tests.json'));
 assert.equal(tests.scope.bhp_status,'confirmed_empty');assert.equal(tests.scope.srt_status,'confirmed_empty');assert.equal(tests.scope.bhp_returned,0);
 assert.deepEqual(tests.quality.bhp,{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0});assert.deepEqual(tests.bhp,[]);
 assert.equal(await readFile(resolve(env.outputRoot,env.artifactId,'tests_srt.csv'),'utf8'),testColumns.srt.join(',')+'\n');
 assert.match(tests.quality.empty_result_policy,/does not show that no test was conducted/);assert.equal(result.record.status,'succeeded');
});
test('quarantined test rows publish with dispositions and reasons; the v1 history status is unaffected',async t=>{
 const env=await setup(t),result=await collect(env,{bhp:[bhpRows[0],bhpRows[0]],srt:[{...srtRows[0],test_date:'2023-02-30'}]});
 const tests=await json(resolve(env.outputRoot,env.artifactId,'tests.json'));
 assert.equal(tests.quality.dispositions.length,3);assert.deepEqual(tests.quality.dispositions.map(d=>d.disposition),['quarantined','quarantined','quarantined']);assert.ok(tests.quality.dispositions[2].source_row_key.startsWith('rrc:srt:'));assert.ok(tests.quality.dispositions[2].reasons.includes('parse_failure:test_date'));
 assert.equal(tests.srt[0].test_date_text,'2023-02-30');assert.equal(result.manifest.real_history_status,'test_fixture');
});
test('BHP/SRT row caps, malformed responses and wrong UIC never publish, record a failed run and keep raw bytes',async t=>{
 const row=bhpRows[0],cases=[[{bhp:Array.from({length:1000},(_,i)=>({...row,report_id:String(i)}))},'SOURCE_ROW_LIMIT'],[{srt:Array.from({length:1001},(_,i)=>({...srtRows[0],report_id:String(i)}))},'SOURCE_INVALID'],[{bhp:'{"not":"rows"}'},'SOURCE_INVALID'],[{srt:[{...srtRows[0],uic_no:'000000001'}]},'SOURCE_SCOPE_MISMATCH'],[{bhp:[{...row,uic_no:'000020839'}]},'SOURCE_SCOPE_MISMATCH']];
 for(const [options,code] of cases){
  const env=await setup(t);
  await assert.rejects(collect(env,options),error=>{assert.equal(error.code,code);assert.equal(error.record.status,'failed');workflowView(error.record);return true;});
  await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
  for(const name of ['candidate-bhp.json','candidate-srt.json','candidate-bhp.source.json'])await stat(resolve(env.sourceDir,name));
  if(code!=='SOURCE_SCOPE_MISMATCH')assert.equal((await json(resolve(env.sourceDir,'acquisition.json'))).status,'failed');
 }
});
test('public-mode refusal of v3 fixture responses never enters actual run history',async t=>{
 const env=await setup(t),selection=await selected(env);
 // Public-mode refusal of fixture responses still records a (fixture) failure without public history.
 await assert.rejects(collectPublicSnapshot({...env,testFixture:false,fetchImpl:fetch,selection,scope}),error=>error.record.status==='failed');
 await assert.rejects(stat(env.runRoot),{code:'ENOENT'});
});
test('tampered tests.json is refused by package replay and by the manifest hash chain',async t=>{
 const env=await setup(t),result=await collect(env),published=resolve(env.outputRoot,env.artifactId);
 const path=resolve(published,'tests.json'),tests=await json(path);tests.srt[0].isip_psig=99;await writeFile(path,JSON.stringify(tests,null,2)+'\n');
 assert.notEqual(sha256(await readFile(path)),result.manifest.files['tests.json'].sha256);
 await assert.rejects(exportArtifact({...env,sourceDir:resolve(published,'sources'),record:false}),error=>error.code==='VERSION_CONFLICT');
 const pins=await json(resolve(published,'version-pins.json'));assert.equal(pins.manifestSha256,sha256(await readFile(resolve(published,'manifest.json'))),'pins -> manifest still verifies; manifest -> tests.json does not');
});
test('caller-supplied test rows are never accepted by buildArtifact',async t=>{
 const env=await setup(t);await collect(env);
 const snapshot=await loadSnapshot(resolve(env.outputRoot,env.artifactId,'sources')),normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 assert.equal(snapshot.tests.bhp.length,2);assert.ok(Buffer.isBuffer(snapshot.tests.rawBhp));
 for(const mutate of [s=>{s.tests.bhp[0].bhp_psia='1';},s=>{s.tests.srt.push(srtRows[0]);},s=>{s.tests.rawSrt=Buffer.from('[]');},s=>{s.tests={...s.tests,bhp:[]};}]){
  const copy=await loadSnapshot(resolve(env.outputRoot,env.artifactId,'sources'));mutate(copy);
  await assert.rejects(buildArtifact(copy,env.artifactId,normalize(copy.inventory,copy.monthly,copy.sourceIds,copy.scope)),error=>error.code==='SOURCE_HASH_MISMATCH');
 }
 const built=await buildArtifact(snapshot,env.artifactId,normalized);assert.ok(built.files['tests.json']);
});
test('§6 regression criterion: v3 differs from the derived v2 version only by the closed list',async t=>{
 const env=await setup(t);await collect(env);
 const v2Dir=resolve(env.dir,'v2-sources');await mkdir(v2Dir);
 const v3Files=await readdir(env.sourceDir),extra=new Set(newNames.flatMap(name=>[name,name.replace(/\.[^.]+$/,'')+'.source.json']));
 for(const name of v3Files)if(!extra.has(name)&&name!=='acquisition.json')await cp(resolve(env.sourceDir,name),resolve(v2Dir,name));
 const marker=await json(resolve(env.sourceDir,'acquisition.json'));
 await writeFile(resolve(v2Dir,'acquisition.json'),JSON.stringify({...marker,targets:targetsForScope(v2Scope).map(t=>t.url),scope:v2Scope},null,2)+'\n');
 const artifactId='same-artifact-id',v3=await exportArtifact({sourceDir:env.sourceDir,artifactId,outputRoot:resolve(env.dir,'out-v3'),testFixture:true,record:false}),v2=await exportArtifact({sourceDir:v2Dir,artifactId,outputRoot:resolve(env.dir,'out-v2'),testFixture:true,record:false});
 assert.equal(v2.record.pipelineVersion,'rrc-collection-v2');assert.equal(v3.record.pipelineVersion,'rrc-collection-v3');
 for(const name of ['inventory.csv','injection_monthly.csv','quality_report.json','data_dictionary.json'])assert.ok(Buffer.from(v3.files[name]).equals(Buffer.from(v2.files[name])),name);
 assert.equal(v3.manifest.normalized_payload_sha256,v2.manifest.normalized_payload_sha256);
 const a=structuredClone(v3.manifest),b=structuredClone(v2.manifest);
 assert.equal(a.transformation_version,'rrc-odp-v2.1.0');a.transformation_version=b.transformation_version;
 assert.equal(a.scope.query_version,3);a.scope.query_version=2;assert.equal(a.scope.test_report_limit,1000);delete a.scope.test_report_limit;
 assert.deepEqual(a.sources.slice(b.sources.length).map(s=>s.name),['candidate-bhp','candidate-srt','bhp-metadata','srt-metadata','srt-guidelines.html','bhp-permian-nto.pdf']);a.sources=a.sources.slice(0,b.sources.length);
 const appended=Object.keys(a.files).filter(name=>!Object.hasOwn(b.files,name));
 assert.deepEqual(appended.sort(),[...[...extra].map(name=>'sources/'+name),...sidecarFiles].sort());for(const name of appended)delete a.files[name];
 assert.notEqual(a.files['sources/acquisition.json'].sha256,b.files['sources/acquisition.json'].sha256);a.files['sources/acquisition.json']=b.files['sources/acquisition.json'];
 const added=a.limitations.filter(item=>!b.limitations.includes(item));assert.equal(added.length,1);assert.match(added[0],/BHP|SRT|test-report/i);a.limitations=a.limitations.filter(item=>item!==added[0]);
 assert.deepEqual(a,b);
 const n3=JSON.parse(v3.files['normalized.json']),n2=JSON.parse(v2.files['normalized.json']);delete n3.manifest;delete n2.manifest;
 assert.equal(JSON.stringify(n3),JSON.stringify(n2));
});
test('all committed artifact versions replay byte-identically',async()=>{
 const versions=(await readdir(resolve(rootPath,'artifacts'),{withFileTypes:true})).filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).map(entry=>entry.name);
 assert.ok(versions.length>=3);
 for(const artifactId of versions){
  const sourceDir=artifactId===pinnedArtifactId?resolve(rootPath,'raw'):resolve(rootPath,'artifacts',artifactId,'sources'),snapshot=await loadSnapshot(sourceDir);
  const built=await buildArtifact(snapshot,artifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));
  for(const [name,body] of Object.entries(built.files))assert.equal(sha256(body),sha256(await readFile(resolve(rootPath,'artifacts',artifactId,name))),artifactId+'/'+name);
  // Query-version-3 versions carry the four test sidecars (compared byte for byte above); older versions never do.
  if(snapshot.scope?.queryVersion===3)for(const name of ['tests.json','tests_bhp.csv','tests_srt.csv','tests_dictionary.json'])assert.ok(built.files[name],artifactId+'/'+name);
  else assert.equal(built.files['tests.json'],undefined);
 }
});
test('guest path stays v2: evidence names and URLs are frozen and v3 is refused by prepare and finalize',async t=>{
 assert.deepEqual(GUEST_EVIDENCE_NAMES,['acquisition.json','candidate-inventory.json','candidate-inventory.source.json','candidate-monthly.json','candidate-monthly.source.json','inventory-metadata.json','inventory-metadata.source.json','lookup-inventory.json','lookup-inventory.source.json','lookup-metadata.json','lookup-metadata.source.json','lookup.json','monthly-metadata.json','monthly-metadata.source.json','rrc-resources.html','rrc-resources.source.json','selection.json','uic-manual.pdf','uic-manual.source.json','uic-query-help.html','uic-query-help.source.json']);
 const committed=await json(resolve(rootPath,'artifacts/rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0/sources/acquisition.json'));
 assert.deepEqual(targetsForScope(committed.scope).map(t=>t.url),committed.targets);assert.equal(committed.scope.queryVersion,2);
 const env=await setup(t);await collect(env);
 const v3Read=name=>readFile(resolve(env.outputRoot,env.artifactId,'sources',name));
 await assert.rejects(prepareArtifactFromReader({readBytes:v3Read,sourceReference:'guest/v3',artifactId:'guest-v3',testFixture:true}),error=>{assert.equal(error.code,'SOURCE_INVALID');assert.match(error.message,/test-report versions are local-only \(D7\)/);assert.equal(error.record.status,'failed');return true;});
 const v2Source=resolve(rootPath,'artifacts/rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0/sources'),v2Read=name=>readFile(resolve(v2Source,name));
 const prepared=await prepareArtifactFromReader({readBytes:v2Read,sourceReference:'guest/v2',artifactId:'guest-v2',testFixture:true});
 assert.equal(prepared.record.pipelineVersion,'rrc-collection-v2');assert.equal(prepared.files['tests.json'],undefined);
 const store=new Map(Object.entries(prepared.files)),publisher={readStaged:async(_id,name)=>store.get(name),readPublished:async(_id,name)=>store.get(name),publish:async()=>'verified_existing_bytes'};
 await assert.rejects(finalizeArtifactFromReader({readBytes:v3Read,sourceReference:'guest/v2',artifactId:'guest-v2',testFixture:true,recorder:resumeRunRecorder(JSON.parse(JSON.stringify(prepared.record))),publisher}),error=>error.code==='SOURCE_INVALID'&&/local-only \(D7\)/.test(error.message));
});
test('local /api/collect produces v3 with the request schema unchanged',async t=>{
 const env=await setup(t,'trrc-v3-api-'),server=createExplorerServer({runRoot:env.runRoot,lookupRoot:env.lookupRoot,sourceRoot:resolve(env.dir,'sources'),outputRoot:env.outputRoot,fetchImpl:network(),testFixture:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`,post=(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
 const found=await (await post('/api/lookup',{kind:'uic',value:uic})).json();
 const body={lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey,startMonth:'2024-01',endMonth:'2026-04'};
 assert.equal((await post('/api/collect',{...body,queryVersion:3})).status,400,'request schema unchanged: no version field');
 const response=await post('/api/collect',body);assert.equal(response.status,201);const result=await response.json();
 assert.equal(result.scope.query_version,3);assert.equal(result.scope.test_report_limit,1000);assert.equal(result.run.pipelineVersion,'rrc-collection-v3');
 for(const name of sidecarFiles)await stat(resolve(env.outputRoot,result.artifactId,name));
});
