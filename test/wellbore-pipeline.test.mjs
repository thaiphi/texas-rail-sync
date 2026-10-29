// RRC-14 (Phase 3): v4 local collection, additive casing/plugging sidecars, link statuses
// end to end, fail-closed contradictions and caps, the §6 regression criterion (v4 vs derived
// v3), the scope cross-check, the D7 guest refusal and the negative "no API -> H-10" targets.
// Fixture provenance only: casing bytes copied from the API format proof; plugging rows and
// shared-API inventory rows are synthetic. Nothing here is a public observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm,writeFile,stat,readdir,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Buffer} from 'node:buffer';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {loadSnapshot,buildArtifact} from '../src/artifact.mjs';
import {exportArtifact} from '../src/pipeline.mjs';
import {prepareArtifactFromReader,finalizeArtifactFromReader} from '../src/exportCore.mjs';
import {resumeRunRecorder} from '../src/runEvents.mjs';
import {collectionScope,boundedScope,boundedTestScope,boundedWellboreScope,targetsForScope,isLocalOnly,isBounded,versionLabels} from '../src/sources.mjs';
import {normalize,sha256} from '../src/normalize.mjs';
import {wellboreColumns} from '../src/wellbore.mjs';
import {workflowView} from '../public/workflow.js';
import {loadVerifiedSidecar} from '../public/artifact-integrity.js';
import {performLookup,loadSelection} from '../src/lookup.mjs';
const root=new URL('../',import.meta.url),rootPath=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const raw=name=>readFile(new URL('raw/'+name,root)),tests=name=>readFile(new URL('test/fixtures/test-reports/'+name,root)),wellbore=name=>readFile(new URL('test/fixtures/wellbore/'+name,root));
const inventory=JSON.parse(await raw('candidate-inventory.json')),monthly=JSON.parse(await raw('candidate-monthly.json'));
const casingRows=JSON.parse(await wellbore('candidate-casing.json')),pluggingRows=JSON.parse(await wellbore('synthetic-plugging.json'));
const uic='000020838',api='38910201',selectedRow=inventory[0];
const v3Scope=boundedTestScope(uic,'2024-01','2026-04'),v4Scope=boundedWellboreScope(uic,'2024-01','2026-04',api);
const testNames=['bhp-metadata.json','srt-metadata.json','candidate-bhp.json','candidate-srt.json','srt-guidelines.html','bhp-permian-nto.pdf'];
const wellboreNames=['casing-metadata.json','plugging-metadata.json','wellbore-inventory.json','candidate-casing.json','candidate-plugging.json','wellbore-wba091.pdf','form-w2.pdf','form-w3.pdf'];
const wellboreSidecars=['casing.json','casing.csv','plugging.json','plugging.csv','wellbore_dictionary.json'];
const testSidecars=['tests.json','tests_bhp.csv','tests_srt.csv','tests_dictionary.json'];
const synthetic=(fields={})=>({...selectedRow,uic_number:'000999999',lease_name:'SYNTHETIC SECOND PERMIT',...fields});
async function setup(t,prefix='trrc-v4-'){await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(resolve(rootPath,'tmp',prefix));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,lookupRoot:resolve(dir,'lookups'),sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'bounded-fixture-v4',testFixture:true};}
// Routes by exact host/path; records every requested URL. The exact-UIC and exact-API
// inventory queries are told apart by their $where field.
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
 const row=options.row??selectedRow,fetchImpl=network(options);
 const found=await performLookup({request:{kind:'uic',value:uic},lookupRoot:env.lookupRoot,testFixture:true,fetchImpl});
 const selection=await loadSelection({lookupRoot:env.lookupRoot,lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey});
 return collectPublicSnapshot({...env,scope:boundedWellboreScope(uic,'2024-01','2026-04',selection.row.api_no),selection,fetchImpl});
}
const json=async path=>JSON.parse(await readFile(path));
const published=(env,name)=>json(resolve(env.outputRoot,env.artifactId,name));
const forbidden=/compliant|non-compliant|violation|plugged and abandoned|not plugged|properly|adequate|safe/i;
const allowed=['No casing rows were returned by the exact-API query; this does not show that no casing exists.','No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged.'];
const assertNoComplianceWording=(text,label)=>{let rest=text;for(const sentence of allowed)rest=rest.split(sentence).join('');assert.doesNotMatch(rest,forbidden,label);};

test('v4 collection appends 21 targets and five sidecars, records v4 labels and reconciles wellbore counts',async t=>{
 const env=await setup(t),seen=[],result=await collect(env,{seen});
 assert.equal(result.record.pipelineVersion,'rrc-collection-v4');assert.equal(result.record.transformationVersion,'rrc-odp-v2.2.0');workflowView(result.record);
 assert.equal(result.manifest.transformation_version,'rrc-odp-v2.2.0');assert.equal(result.manifest.scope.query_version,4);assert.equal(result.manifest.scope.wellbore_limit,1000);assert.equal(result.manifest.scope.wellbore_inventory_limit,25);assert.equal(result.manifest.scope.test_report_limit,1000);
 const marker=await json(resolve(env.sourceDir,'acquisition.json'));assert.equal(marker.schemaVersion,2);assert.deepEqual(marker.scope,v4Scope);assert.equal(marker.targets.length,21);
 assert.deepEqual(targetsForScope(v4Scope).slice(0,13),targetsForScope(v3Scope),'targets 1-13 are the v3 targets in order');
 assert.deepEqual(targetsForScope(v4Scope).slice(13).map(target=>target.name),wellboreNames);
 const names=result.manifest.sources.map(s=>s.name);
 assert.deepEqual(names.slice(-14),['candidate-bhp','candidate-srt','bhp-metadata','srt-metadata','srt-guidelines.html','bhp-permian-nto.pdf','wellbore-inventory','candidate-casing','candidate-plugging','casing-metadata','plugging-metadata','wellbore-wba091.pdf','form-w2.pdf','form-w3.pdf']);
 const source=name=>result.manifest.sources.find(s=>s.name===name);
 assert.equal(source('wellbore-inventory').kind,'wellbore_inventory');assert.match(source('wellbore-inventory').snapshot_id,/^givw-z9t4:[a-f0-9]{16}$/);assert.equal(source('wellbore-inventory').title,source('candidate-inventory').title);
 assert.equal(source('candidate-casing').kind,'casing');assert.match(source('candidate-casing').snapshot_id,/^u9m4-xnh6:[a-f0-9]{16}$/);assert.equal(source('candidate-casing').title,'RRC-Wellbore Casing');
 assert.equal(source('candidate-plugging').kind,'plugging');assert.match(source('candidate-plugging').snapshot_id,/^wfzn-9fje:[a-f0-9]{16}$/);assert.equal(source('candidate-plugging').title,'RRC-Wellbore Plugging');
 assert.equal(source('candidate-casing').url,'https://data.texas.gov/resource/u9m4-xnh6.json?%24where=api_no%3D%2738910201%27&%24limit=1000&%24order=record_sequence%2Cid');
 assert.equal(source('wellbore-inventory').url,'https://data.texas.gov/resource/givw-z9t4.json?%24where=api_no%3D%2738910201%27&%24limit=25&%24order=uic_number%2Capi_no');
 const fileNames=Object.keys(result.manifest.files);assert.deepEqual(fileNames.slice(-9),[...testSidecars,...wellboreSidecars]);
 for(const name of wellboreNames)for(const file of [name,name.replace(/\.[^.]+$/,'')+'.source.json'])assert.ok(result.manifest.files['sources/'+file],file);
 const out=resolve(env.outputRoot,env.artifactId);
 for(const name of wellboreSidecars){const bytes=await readFile(resolve(out,name));assert.equal(sha256(bytes),result.manifest.files[name].sha256);assert.equal(bytes.length,result.manifest.files[name].bytes);}
 const casing=await published(env,'casing.json'),plugging=await published(env,'plugging.json');
 assert.deepEqual(Object.keys(casing),['schemaVersion','artifactId','dataset','scope','link','rows','quality']);assert.equal(casing.artifactId,env.artifactId);assert.equal(casing.dataset,'casing');assert.equal(plugging.dataset,'plugging');
 assert.deepEqual(casing.scope,{query_version:4,source_api_id:api,wellbore_limit:1000,wellbore_inventory_limit:25,order:'record_sequence,id',returned:2,status:'returned_below_cap',window:'exact api_no; not limited to reporting period'});
 assert.equal(casing.link.status,'matched');assert.equal(casing.link.wellbore_query.sha256,source('candidate-casing').sha256);assert.equal(casing.link.inventory_query.url,source('wellbore-inventory').url);
 assert.equal(casing.link.inventory_source_record_key,JSON.parse(result.files['normalized.json']).inventory[0].source_record_key);
 assert.deepEqual(Object.keys(casing.quality),['counts','issue_counts','dispositions','duplicate_policy','empty_result_policy','presence_policy','record_sequence_policy','on_top_record_policy']);
 assert.deepEqual(casing.quality.counts,{raw:2,parsed:2,accepted:2,quarantined:0,excluded:0});assert.deepEqual(plugging.quality.counts,{raw:5,parsed:5,accepted:5,quarantined:0,excluded:0});
 assert.equal(casing.rows[0].csg_depth,1317);assert.equal(casing.rows[0].on_top_record,true);assert.equal(plugging.rows[0].on_top_record,null);
 assert.equal(casing.manifest,undefined,'no embedded manifest');
 assert.equal((await readFile(resolve(out,'casing.csv'),'utf8')).split('\n')[0],wellboreColumns.casing.join(','));
 assert.equal((await readFile(resolve(out,'plugging.csv'),'utf8')).split('\n')[0],wellboreColumns.plugging.join(','));
 const dictionary=await published(env,'wellbore_dictionary.json');assert.equal(dictionary.fields.csg_depth.status,'synthetic','fixture dictionary is never public reported');assert.deepEqual(dictionary.provenance,result.manifest.provenance);
 const testsJson=await published(env,'tests.json');assert.equal(testsJson.scope.query_version,4,'OD-2');
 const load=result.record.events.find(e=>e.stage==='load'&&e.status==='succeeded').evidence,qc=result.record.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence;
 assert.equal(load.requests.length,21);assert.equal(load.inputs.find(i=>i.kind==='casing').count,2);assert.equal(load.inputs.find(i=>i.kind==='plugging').count,5);assert.equal(load.inputs.find(i=>i.kind==='wellbore_inventory').count,1);
 assert.deepEqual(qc.wellbore,{casing:{raw:2,parsed:2,accepted:2,quarantined:0,excluded:0},plugging:{raw:5,parsed:5,accepted:5,quarantined:0,excluded:0}});assert.ok(qc.testReports);assert.equal(qc.outputs.length,2);
 assert.ok(seen.some(url=>url.includes('/resource/givw-z9t4.json')&&new URL(url).searchParams.get('$where')===`api_no='${api}'`),'uniqueness query issued');
 const limitation=result.manifest.limitations.filter(item=>/casing|plugging|wellbore/i.test(item));assert.equal(limitation.length,1);
 for(const name of [...wellboreSidecars,'manifest.json'])assertNoComplianceWording(await readFile(resolve(out,name),'utf8'),name);
 const replay=await exportArtifact({...env,sourceDir:resolve(out,'sources'),record:false});
 assert.equal(replay.operation,'verified_existing_bytes');assert.equal(replay.record.pipelineVersion,'rrc-collection-v4');assert.deepEqual(replay.record.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence.wellbore,qc.wellbore);
});
test('the run validator requires reconciled casing/plugging wellbore evidence',async t=>{
 const env=await setup(t),result=await collect(env);workflowView(result.record);
 for(const mutate of [qc=>{delete qc.wellbore;},qc=>{qc.wellbore.casing.raw=3;qc.wellbore.casing.parsed=3;qc.wellbore.casing.accepted=3;},qc=>{qc.wellbore.extra=qc.wellbore.casing;},qc=>{delete qc.wellbore.plugging;},qc=>{qc.wellbore.plugging.accepted=4;}]){
  const copy=structuredClone(result.record);mutate(copy.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence);
  assert.throws(()=>workflowView(copy),/wellbore/);
 }
});
test('no eight-digit API: 18 targets, no wellbore query issued, sidecars say none/api_missing_or_invalid',async t=>{
 for(const apiNo of ['','3891020']){
  const env=await setup(t),seen=[],row={...selectedRow,api_no:apiNo},result=await collect(env,{row,seen});
  const marker=await json(resolve(env.sourceDir,'acquisition.json'));assert.equal(marker.scope.sourceApiId,null);assert.equal(marker.targets.length,18);
  assert.ok(!seen.some(url=>/\/resource\/(u9m4-xnh6|wfzn-9fje)\.json/.test(url)),'no casing or plugging query');
  assert.ok(!seen.some(url=>url.includes('/resource/givw-z9t4.json')&&new URL(url).searchParams.get('$where')?.startsWith('api_no=')),'no exact-API inventory query');
  for(const name of ['casing-metadata.json','plugging-metadata.json','wellbore-wba091.pdf'])await stat(resolve(env.sourceDir,name));
  for(const name of ['wellbore-inventory.json','candidate-casing.json','candidate-plugging.json'])await assert.rejects(stat(resolve(env.sourceDir,name)),{code:'ENOENT'});
  for(const dataset of ['casing','plugging']){const doc=await published(env,dataset+'.json');
   assert.equal(doc.scope.status,'not_queried');assert.equal(doc.scope.returned,null);assert.equal(doc.scope.source_api_id,null);
   assert.equal(doc.link.status,'none');assert.equal(doc.link.reason,'api_missing_or_invalid');assert.equal(doc.link.inventory_query,null);assert.equal(doc.link.wellbore_query,null);assert.deepEqual(doc.rows,[]);}
  assert.deepEqual(result.manifest.sources.slice(-5).map(s=>s.name),['casing-metadata','plugging-metadata','wellbore-wba091.pdf','form-w2.pdf','form-w3.pdf']);
  const qc=result.record.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence;assert.deepEqual(qc.wellbore.casing,{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0});
  workflowView(result.record);
 }
});
test('shared API (constructed): two inventory permits give ambiguous/multiple_inventory_rows with accepted, listed rows',async t=>{
 const env=await setup(t),result=await collect(env,{byApi:[selectedRow,synthetic()],plugging:[]});
 const casing=await published(env,'casing.json'),plugging=await published(env,'plugging.json');
 assert.equal(casing.link.status,'ambiguous');assert.equal(casing.link.reason,'multiple_inventory_rows');assert.deepEqual(casing.link.candidates.map(c=>[c.uic_number,c.selected]),[[uic,true],['000999999',false]]);
 assert.equal(plugging.link.status,'ambiguous');assert.equal(plugging.link.wellbore_row_count,0);assert.equal(plugging.scope.status,'confirmed_empty');assert.equal(plugging.scope.returned,0);
 assert.deepEqual(casing.quality.counts,{raw:2,parsed:2,accepted:2,quarantined:0,excluded:0});assert.ok(casing.rows.every(row=>row.wellbore_link_status==='ambiguous'));
 assert.equal(result.record.status,'succeeded');assert.equal(result.record.events.find(e=>e.stage==='load'&&e.status==='succeeded').evidence.inputs.find(i=>i.kind==='wellbore_inventory').count,2);
 workflowView(result.record);// wellbore_inventory (2) is never reconciled against counts.inventory (1)
 const inventoryCsv=await readFile(resolve(env.outputRoot,env.artifactId,'inventory.csv'),'utf8');assert.doesNotMatch(inventoryCsv,/000999999/,'candidate rows never enter inventory.csv');
 const capped=await setup(t),list=[selectedRow,...Array.from({length:24},(_,i)=>synthetic({uic_number:String(900000000+i)}))],cappedResult=await collect(capped,{byApi:list});workflowView(cappedResult.record);
 const cappedCasing=await published(capped,'casing.json');assert.equal(cappedCasing.link.reason,'inventory_cap_reached');assert.equal(cappedCasing.link.candidates.length,25);
});
test('none/no_source_rows: an empty plugging response is confirmed_empty with 0 = 0 + 0',async t=>{
 const env=await setup(t);await collect(env,{plugging:[]});
 const plugging=await published(env,'plugging.json');
 assert.equal(plugging.link.status,'none');assert.equal(plugging.link.reason,'no_source_rows');assert.equal(plugging.scope.status,'confirmed_empty');assert.deepEqual(plugging.quality.counts,{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0});
 assert.equal(await readFile(resolve(env.outputRoot,env.artifactId,'plugging.csv'),'utf8'),wellboreColumns.plugging.join(',')+'\n');
});
test('quarantined casing/plugging rows publish with dispositions and reasons',async t=>{
 const env=await setup(t),result=await collect(env,{casing:[casingRows[0],casingRows[0]],plugging:[{...pluggingRows[0],plug_top_depth:'7000'}]});
 const casing=await published(env,'casing.json'),plugging=await published(env,'plugging.json');
 assert.deepEqual(casing.quality.dispositions.map(d=>d.disposition),['quarantined','quarantined']);assert.ok(casing.quality.dispositions[0].reasons.includes('duplicate_source_id'));
 assert.deepEqual(plugging.quality.dispositions[0].reasons,['inconsistent:plug_top_exceeds_bottom']);assert.equal(result.record.status,'succeeded');
});
test('contradictions fail closed with SOURCE_SCOPE_MISMATCH: nothing published, failed run recorded, raw bytes kept',async t=>{
 for(const options of [{byApi:[synthetic()]},{byApi:[]},{byApi:[selectedRow,synthetic({api_no:'38910202'})]},{casing:[{...casingRows[0],api_no:'38910202'}]},{plugging:[{...pluggingRows[0],api_no:'38910202'}]}]){
  const env=await setup(t);
  await assert.rejects(collect(env,options),error=>{assert.equal(error.code,'SOURCE_SCOPE_MISMATCH');assert.equal(error.record.status,'failed');workflowView(error.record);return true;});
  await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
  for(const name of ['wellbore-inventory.json','candidate-casing.json','candidate-plugging.json','candidate-casing.source.json'])await stat(resolve(env.sourceDir,name));
 }
});
test('caps: casing 1000 rows is SOURCE_ROW_LIMIT, 1001 is SOURCE_INVALID, inventory-by-API 26 rows is SOURCE_INVALID',async t=>{
 const many=n=>Array.from({length:n},(_,i)=>({...casingRows[0],id:String(i+1)}));
 for(const [options,code] of [[{casing:many(1000)},'SOURCE_ROW_LIMIT'],[{plugging:Array.from({length:1000},(_,i)=>({...pluggingRows[0],id:String(i+1)}))},'SOURCE_ROW_LIMIT'],[{casing:many(1001)},'SOURCE_INVALID'],[{byApi:[selectedRow,...Array.from({length:25},(_,i)=>synthetic({uic_number:String(900000000+i)}))]},'SOURCE_INVALID'],[{casing:'{"not":"rows"}'},'SOURCE_INVALID']]){
  const env=await setup(t);
  await assert.rejects(collect(env,options),error=>{assert.equal(error.code,code);assert.equal(error.record.status,'failed');workflowView(error.record);return true;});
  await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
  await stat(resolve(env.sourceDir,'candidate-casing.json'));assert.equal((await json(resolve(env.sourceDir,'acquisition.json'))).status,'failed');
 }
});
test('scope cross-check: targetsForScope refuses tampered v4 scopes and a changed sourceApiId fails the load',async t=>{
 assert.deepEqual(targetsForScope(JSON.parse(JSON.stringify(v4Scope))),targetsForScope(v4Scope),'round-trips through JSON');
 for(const tamper of [{sourceApiId:'1234'},{sourceApiId:38910201},{wellboreLimit:999},{wellboreInventoryLimit:26},{queryVersion:3},{testReportLimit:500}])assert.throws(()=>targetsForScope({...v4Scope,...tamper}),/query contract/,JSON.stringify(tamper));
 const missing={...v4Scope};delete missing.sourceApiId;assert.throws(()=>targetsForScope(missing),/query contract/);
 assert.equal(boundedWellboreScope(uic,'2024-01','2024-02',' 38910201').sourceApiId,null);assert.equal(boundedWellboreScope(uic,'2024-01','2024-02',38910201).sourceApiId,null);
 assert.ok(isLocalOnly(v4Scope)&&isLocalOnly(v3Scope)&&!isLocalOnly(boundedScope(uic,'2024-01','2024-02'))&&!isLocalOnly(null)&&isLocalOnly({queryVersion:5}));
 assert.ok(isBounded(v4Scope));assert.deepEqual(versionLabels(v4Scope),{pipelineVersion:'rrc-collection-v4',transformationVersion:'rrc-odp-v2.2.0'});
 const env=await setup(t);await collect(env);
 const changed={...v4Scope,sourceApiId:'38910202'},marker=await json(resolve(env.sourceDir,'acquisition.json'));
 await writeFile(resolve(env.sourceDir,'acquisition.json'),JSON.stringify({...marker,scope:changed,targets:targetsForScope(changed).map(target=>target.url)},null,2)+'\n');
 await assert.rejects(loadSnapshot(env.sourceDir),error=>{assert.equal(error.code,'SOURCE_INVALID');assert.match(error.message,/Selected inventory API changed/);return true;});
});
test('negative (a): no target of v1-v4 sends api_no to H-10, and no wellbore target sends a UIC',()=>{
 const scopes=[collectionScope,boundedScope(uic,'2024-01','2026-04'),v3Scope,v4Scope,boundedWellboreScope(uic,'2024-01','2026-04',null)];
 for(const scope of scopes)for(const target of targetsForScope(scope)){
  const url=new URL(target.url),query=decodeURIComponent(url.search),where=url.searchParams.get('$where')??'';
  if(url.pathname.includes('qq2j-f2zm'))assert.doesNotMatch(query,/api_no/,target.name);
  // The inventory-by-API target orders by uic_number (as the ADR 002 lookup does) but never filters on it.
  if(/u9m4-xnh6|wfzn-9fje/.test(url.pathname)||target.name==='wellbore-inventory.json'){assert.doesNotMatch(where,/uic/,target.name);if(url.pathname.startsWith('/resource/'))assert.match(where,/^api_no='\d{8}'$/,target.name);}
  if(/u9m4-xnh6|wfzn-9fje/.test(url.pathname))assert.doesNotMatch(query,/uic/,target.name);
 }
 assert.equal(targetsForScope(boundedWellboreScope(uic,'2024-01','2026-04',null)).length,18);assert.equal(targetsForScope(v4Scope).length,21);
});
test('tampered casing.json is refused by package replay and by loadVerifiedSidecar',async t=>{
 const env=await setup(t),result=await collect(env),out=resolve(env.outputRoot,env.artifactId),path=resolve(out,'casing.json');
 const original=await readFile(path),doc=JSON.parse(original);doc.rows[0].csg_depth=1;await writeFile(path,JSON.stringify(doc,null,2)+'\n');
 assert.notEqual(sha256(await readFile(path)),result.manifest.files['casing.json'].sha256);
 await assert.rejects(exportArtifact({...env,sourceDir:resolve(out,'sources'),record:false}),error=>error.code==='VERSION_CONFLICT');
 const artifact={artifactId:env.artifactId,manifest:result.manifest},integrity={artifactId:env.artifactId,path:`/artifacts/${env.artifactId}/`};
 const fetchImpl=async url=>new Response(await readFile(resolve(env.outputRoot,url.replace(/^\/artifacts\//,''))));
 await assert.rejects(loadVerifiedSidecar(artifact,integrity,'casing.json',fetchImpl),/hash or size mismatch/);
 await writeFile(path,original);assert.ok(Buffer.from(await loadVerifiedSidecar(artifact,integrity,'casing.json',fetchImpl)).equals(original));
});
test('caller-supplied wellbore rows are never accepted by buildArtifact',async t=>{
 const env=await setup(t);await collect(env);const sources=resolve(env.outputRoot,env.artifactId,'sources');
 const snapshot=await loadSnapshot(sources);assert.equal(snapshot.wellbore.casing.length,2);assert.ok(Buffer.isBuffer(snapshot.wellbore.rawCasing));
 for(const mutate of [s=>{s.wellbore.casing[0].csg_depth='1';},s=>{s.wellbore.plugging.push(pluggingRows[0]);},s=>{s.wellbore.rawPlugging=Buffer.from('[]');},s=>{s.wellbore={...s.wellbore,inventory:[]};},s=>{delete s.wellbore;}]){
  const copy=await loadSnapshot(sources);mutate(copy);
  await assert.rejects(buildArtifact(copy,env.artifactId,normalize(copy.inventory,copy.monthly,copy.sourceIds,copy.scope)),error=>error.code==='SOURCE_HASH_MISMATCH');
 }
 const built=await buildArtifact(snapshot,env.artifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));assert.ok(built.files['casing.json']);
});
test('§6 regression criterion: v4 differs from the derived v3 version only by the closed list',async t=>{
 const env=await setup(t);await collect(env);
 const v3Dir=resolve(env.dir,'v3-sources');await mkdir(v3Dir);
 const extra=new Set(wellboreNames.flatMap(name=>[name,name.replace(/\.[^.]+$/,'')+'.source.json']));
 for(const name of await readdir(env.sourceDir))if(!extra.has(name)&&name!=='acquisition.json')await cp(resolve(env.sourceDir,name),resolve(v3Dir,name));
 const marker=await json(resolve(env.sourceDir,'acquisition.json'));
 await writeFile(resolve(v3Dir,'acquisition.json'),JSON.stringify({...marker,targets:targetsForScope(v3Scope).map(t=>t.url),scope:v3Scope},null,2)+'\n');
 const artifactId='same-artifact-id',v4=await exportArtifact({sourceDir:env.sourceDir,artifactId,outputRoot:resolve(env.dir,'out-v4'),testFixture:true,record:false}),v3=await exportArtifact({sourceDir:v3Dir,artifactId,outputRoot:resolve(env.dir,'out-v3'),testFixture:true,record:false});
 assert.equal(v3.record.pipelineVersion,'rrc-collection-v3');assert.equal(v4.record.pipelineVersion,'rrc-collection-v4');
 for(const name of ['inventory.csv','injection_monthly.csv','quality_report.json','data_dictionary.json','tests_bhp.csv','tests_srt.csv','tests_dictionary.json'])assert.ok(Buffer.from(v4.files[name]).equals(Buffer.from(v3.files[name])),name);
 assert.equal(v4.manifest.normalized_payload_sha256,v3.manifest.normalized_payload_sha256);
 const t4=JSON.parse(v4.files['tests.json']),t3=JSON.parse(v3.files['tests.json']);assert.equal(t4.scope.query_version,4);assert.equal(t3.scope.query_version,3);t4.scope.query_version=3;assert.deepEqual(t4,t3);
 const a=structuredClone(v4.manifest),b=structuredClone(v3.manifest);
 assert.equal(a.transformation_version,'rrc-odp-v2.2.0');a.transformation_version=b.transformation_version;
 assert.equal(a.scope.query_version,4);a.scope.query_version=3;assert.equal(a.scope.wellbore_limit,1000);delete a.scope.wellbore_limit;assert.equal(a.scope.wellbore_inventory_limit,25);delete a.scope.wellbore_inventory_limit;
 assert.deepEqual(a.sources.slice(b.sources.length).map(s=>s.name),['wellbore-inventory','candidate-casing','candidate-plugging','casing-metadata','plugging-metadata','wellbore-wba091.pdf','form-w2.pdf','form-w3.pdf']);a.sources=a.sources.slice(0,b.sources.length);
 const appended=Object.keys(a.files).filter(name=>!Object.hasOwn(b.files,name));
 assert.deepEqual(appended.sort(),[...[...extra].map(name=>'sources/'+name),...wellboreSidecars].sort());for(const name of appended)delete a.files[name];
 assert.notEqual(a.files['sources/acquisition.json'].sha256,b.files['sources/acquisition.json'].sha256);a.files['sources/acquisition.json']=b.files['sources/acquisition.json'];
 assert.notEqual(a.files['tests.json'].sha256,b.files['tests.json'].sha256);a.files['tests.json']=b.files['tests.json'];
 const added=a.limitations.filter(item=>!b.limitations.includes(item));assert.equal(added.length,1);assert.match(added[0],/casing|plugging|wellbore/i);a.limitations=a.limitations.filter(item=>item!==added[0]);
 assert.deepEqual(a,b);
 const n4=JSON.parse(v4.files['normalized.json']),n3=JSON.parse(v3.files['normalized.json']);delete n4.manifest;delete n3.manifest;
 assert.equal(JSON.stringify(n4),JSON.stringify(n3));
});
test('guest path refuses v4 by prepare and finalize with the unchanged D7 message',async t=>{
 const env=await setup(t);await collect(env);
 const v4Read=name=>readFile(resolve(env.outputRoot,env.artifactId,'sources',name));
 await assert.rejects(prepareArtifactFromReader({readBytes:v4Read,sourceReference:'guest/v4',artifactId:'guest-v4',testFixture:true}),error=>{assert.equal(error.code,'SOURCE_INVALID');assert.equal(error.message,'test-report versions are local-only (D7)');assert.equal(error.record.status,'failed');assert.equal(error.record.pipelineVersion,'rrc-collection-v1','guest recorder never takes v4 labels');return true;});
 const v2Source=resolve(rootPath,'artifacts/rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0/sources'),v2Read=name=>readFile(resolve(v2Source,name));
 const prepared=await prepareArtifactFromReader({readBytes:v2Read,sourceReference:'guest/v2',artifactId:'guest-v2',testFixture:true});
 assert.equal(prepared.record.pipelineVersion,'rrc-collection-v2');assert.equal(prepared.files['casing.json'],undefined);
 const store=new Map(Object.entries(prepared.files)),publisher={readStaged:async(_id,name)=>store.get(name),readPublished:async(_id,name)=>store.get(name),publish:async()=>'verified_existing_bytes'};
 await assert.rejects(finalizeArtifactFromReader({readBytes:v4Read,sourceReference:'guest/v2',artifactId:'guest-v2',testFixture:true,recorder:resumeRunRecorder(JSON.parse(JSON.stringify(prepared.record))),publisher}),error=>error.code==='SOURCE_INVALID'&&error.message==='test-report versions are local-only (D7)');
});
test('no source path sends api_no to the H-10 dataset (static scan of src/, scripts/ and public/)',async()=>{
 const files=[];
 for(const dir of ['src','src/hosted','scripts','public'])for(const entry of await readdir(resolve(rootPath,dir),{withFileTypes:true}))if(entry.isFile()&&/\.(mjs|js)$/.test(entry.name))files.push(dir+'/'+entry.name);
 for(const file of files){
  const text=await readFile(resolve(rootPath,file),'utf8');
  for(const line of text.split('\n'))if(line.includes('qq2j-f2zm'))assert.doesNotMatch(line,/api_no\s*=|api_no%3D|\$\{[^}]*(api|sourceApiId)[^}]*\}/i,file);
 }
});
