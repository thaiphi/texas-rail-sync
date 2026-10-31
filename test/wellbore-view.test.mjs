// RRC-14 browser contract (Phase 3 spec §4.4, §5, §8, §10 "Browser"): Wellbore tab, link-panel inspector,
// sidecar verification and the Analytics gate. Every casing/plugging object here is a synthetic fixture built
// from the spec §5 shapes only; nothing is a public observation and no pipeline code is imported.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {facts,filterInventory,dispositionRows,sourceUrl,countText} from '../public/presentation.js';
import {clearDatasetEvidence,historyState} from '../public/dataset-state.js';
import {createLatestRequest} from '../public/collection.js';
import {escapeHtml,formatNumber} from '../public/inspection.js';
import * as nav from '../public/navigation.js';
import * as integrityModule from '../public/artifact-integrity.js';
import {renderTestsView,testReportsCollected} from '../public/tests-view.js';
import {renderWellboreView,wellboreCollected,PRESENCE} from '../public/wellbore-view.js';

const NOT_COLLECTED='Casing and plugging records were not collected for this version.';
const HELP='ODP casing (Form G-1/W-2) and plugging (Form W-3) datasets are filing records keyed by API number, queried with the selected inventory row\'s own API. A casing string can appear once per filing (record_sequence). Values are shown as reported; units are cited from Forms W-2/W-3 and the WBA091 manual where stated (inferred units are marked); most reference codes are undocumented. Rows returned or not returned say nothing about casing, cementing or plugging status.';
const ANALYTICS_LOCAL_ONLY=queryVersion=>`Query version ${queryVersion} is not sent to Analytics. Its receiver accepts query versions 2 and 4 and the original pinned version (ADR 005).`;
const SIDECARS=['casing.json','casing.csv','plugging.json','plugging.csv','wellbore_dictionary.json'];
const FORBIDDEN=['compliant','non-compliant','violation','plugged and abandoned','not plugged','properly','adequate','safe','plugged'];
const SENTENCES={
 casing:'No casing rows were returned by the exact-API query; this does not show that no casing exists.',
 plugging:'No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged.',
 api:'The selected inventory row has no eight-digit API number, so no casing or plugging query was made.',
 ambiguous:'Several inventory permits carry this API number. These rows belong to the reported API and are attributed to no single UIC.',
 matched:'The source API string equals the selected inventory row\'s API string. An eight-digit API cannot distinguish sidetracks or recompletions.'
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ID='rrc-v4-fixture',API='38910201',INVENTORY_ID='givw-z9t4:1111111111111111';
const entry=(units,extra={})=>({units,status:'synthetic',definition:'Synthetic fixture definition',source_field:'fixture',basis:'odp_field_name',note:'ODP publishes no column descriptions.',...extra});

function dictionary(){
 const numeric='not stated by the source',fields={source_row_key:entry('string'),source_api_id:entry('string'),wellbore_link_status:entry('code',{note:'ODP publishes no column descriptions. inventory_api_no link status (ADR 004 §2); not a statement about the well'}),source_id:entry('string'),api_no:entry('string'),record_sequence:entry('string',{note:'ODP publishes no column descriptions. filing sequence shared by several rows; not a row key; repeats are normal'}),on_top_record:entry('boolean'),
  completion_date:entry('date'),completion_date_text:entry('date text'),csg_size:entry(numeric),hole_size:entry(numeric),csg_depth:entry(numeric),toc:entry(numeric),multi_stg_depth:entry(numeric),cmt_sacks:entry('sacks (as named)'),total_depth_g1w2:entry(numeric),depth_reference:entry(numeric),depth_reference_code:entry('code',{note:'ODP publishes no column descriptions. shown verbatim; meaning undocumented in ODP metadata'}),
  w3_date:entry('date'),w3_date_text:entry('date text'),plug_top_depth:entry(numeric),plug_bottom_depth:entry(numeric),plug_cmt_sacks:entry('sacks (as named)'),total_depth_w3:entry(numeric),source_snapshot_id:entry('string'),quality_flags:entry('list')};
 return {schemaVersion:1,row_grain:{casing:'synthetic fixture casing row',plugging:'synthetic fixture plugging row'},tables:{casing:['source_row_key','source_api_id'],plugging:['source_row_key','source_api_id']},fields};
}
const common=(dataset,ordinal,extra)=>({source_row_key:`rrc:${dataset}:${dataset==='casing'?'u9m4-xnh6':'wfzn-9fje'}:abc:${ordinal}`,source_api_id:API,wellbore_link_status:'matched',source_id:String(9000+ordinal),api_no:API,record_sequence:'1',on_top_record:null,...extra});
const casingRow=(ordinal,extra={})=>({...common('casing',ordinal,{}),completion_date:'2001-05-06',completion_date_text:'2001-05-06T00:00:00.000',csg_size:9.625,hole_size:12.25,csg_depth:1547,toc:0,multi_stg_depth:null,cmt_sacks:600,total_depth_g1w2:5000,depth_reference:-3.5,depth_reference_code:'KB',source_snapshot_id:'u9m4-xnh6:abc',quality_flags:['missing:multi_stg_depth'],...extra});
const plugRow=(ordinal,extra={})=>({...common('plugging',ordinal,{}),w3_date:'2025-02-03',w3_date_text:'2025-02-03T00:00:00.000',plug_top_depth:100,plug_bottom_depth:200,plug_cmt_sacks:40,total_depth_w3:0,depth_reference:null,depth_reference_code:'GL',source_snapshot_id:'wfzn-9fje:abc',quality_flags:[],...extra});
const candidate=(ordinal,selected,uic)=>({candidate_key:`rrc:uic:${INVENTORY_ID}:${ordinal}`,selected,uic_number:uic,api_no:API,operator_number:'123456',district_code:'08',lease_number:'L-1',lease_name:'FIXTURE LEASE',well_no_display:'1',w14_number:'W14-1'});
function link(dataset,{status='matched',reason=null,rows=1,candidates=[candidate(1,true,'000020838')],api=API}={}){
 const queried=api!==null;
 return {inventory_source_record_key:'rrc:inventory:fixture:1',source_api_id:api,basis:'inventory_api_no',status,reason,
  inventory_query:queried?{url:`https://data.texas.gov/resource/givw-z9t4.json?%24where=api_no%3D%27${api}%27`,sha256:'1'.repeat(64),rows:candidates.length}:null,
  wellbore_query:queried?{url:`https://data.texas.gov/resource/${dataset==='casing'?'u9m4-xnh6':'wfzn-9fje'}.json?%24where=api_no%3D%27${api}%27`,sha256:'2'.repeat(64),rows}:null,
  candidates:queried?candidates:[],wellbore_row_count:rows};
}
function doc(dataset,rows,linkOptions={},{dispositions}={}){
 const quarantined=rows.filter(row=>row.quality_flags.some(flag=>/^(parse_failure|invalid|duplicate|inconsistent)/.test(flag)));
 const api=Object.hasOwn(linkOptions,'api')?linkOptions.api:API;
 return {schemaVersion:1,artifactId:ID,dataset,
  scope:{query_version:4,source_api_id:api,wellbore_limit:1000,wellbore_inventory_limit:25,order:'record_sequence,id',returned:api===null?null:rows.length,status:api===null?'not_queried':rows.length?'returned_below_cap':'confirmed_empty',window:'exact api_no; not limited to reporting period'},
  link:link(dataset,{rows:rows.length,...linkOptions}),rows,
  quality:{counts:{raw:rows.length,parsed:rows.length,accepted:rows.length-quarantined.length,quarantined:quarantined.length,excluded:0},issue_counts:{},
   dispositions:dispositions??rows.map(row=>({source_row_key:row.source_row_key,disposition:quarantined.includes(row)?'quarantined':'accepted',...(row.quality_flags.length?{reasons:[...row.quality_flags]}:{})})),
   duplicate_policy:'synthetic',empty_result_policy:'synthetic',presence_policy:'synthetic',record_sequence_policy:'synthetic',on_top_record_policy:'synthetic'}};
}
const loaded=(casing,plugging,dict=dictionary())=>renderWellboreView({status:'loaded',casing,plugging,dictionary:dict});
const stripPresence=html=>Object.values(SENTENCES).reduce((text,sentence)=>text.split(escapeHtml(sentence)).join(''),html);

test('the section 4.4 presence sentences are exported verbatim',()=>{
 assert.deepEqual(PRESENCE,{casing_no_source_rows:SENTENCES.casing,plugging_no_source_rows:SENTENCES.plugging,api_missing_or_invalid:SENTENCES.api,ambiguous:SENTENCES.ambiguous,matched:SENTENCES.matched});
});
test('v1-v3 manifests without casing.json render the not-collected state',()=>{
 assert.equal(wellboreCollected({files:{'manifest.json':{}}}),false);assert.equal(wellboreCollected({files:{'tests.json':{}}}),false,'a v3 version is not collected');
 assert.equal(wellboreCollected({files:{'casing.json':{}}}),true);assert.equal(wellboreCollected(undefined),false);assert.equal(wellboreCollected({files:null}),false);
 const html=renderWellboreView({status:'not_collected'});assert.ok(html.includes(NOT_COLLECTED));assert.ok(!html.includes('<table'));
});
test('loading and verification failure show no rows',()=>{
 assert.match(renderWellboreView({status:'loading'}),/role="status"/);
 const html=renderWellboreView({status:'error',message:'Sidecar casing.json hash or size mismatch <x>'});
 assert.match(html,/role="alert"/);assert.match(html,/mismatch &lt;x&gt;/);assert.ok(!html.includes('<table'));assert.ok(!html.includes('rrc:casing:'));
});
test('a matched casing link panel shows API, basis, status, sentence, query URL and hash; rows keep source order',()=>{
 const rows=[casingRow(1,{record_sequence:'3',on_top_record:true}),casingRow(2,{record_sequence:'3',on_top_record:true,csg_size:5.5}),casingRow(3,{record_sequence:'1'}),casingRow(4,{record_sequence:'4',on_top_record:false})];
 const html=loaded(doc('casing',rows),doc('plugging',[],{status:'none',reason:'no_source_rows'}));
 const casing=html.slice(0,html.indexOf('Plugging records'));
 for(const text of [API,'inventory_api_no','matched','u9m4-xnh6.json?%24where=api_no%3D%27'+API,'2'.repeat(64),'1'.repeat(64),escapeHtml(SENTENCES.matched)])assert.ok(casing.includes(text),text);
 assert.ok(!casing.includes('Other permit'),'no candidate table when matched');
 const order=rows.map(row=>casing.indexOf(row.source_row_key));assert.deepEqual([...order].sort((a,b)=>a-b),order,'rows stay in source order');
 assert.match(casing,/4 raw = 4 accepted \+ 0 quarantined \+ 0 excluded/);assert.match(casing,/returned_below_cap/);assert.match(casing,/record_sequence,id/);
 assert.match(html,/public reported/i);assert.ok(!/<svg|<canvas/i.test(html),'no charts');
});
test('on_top_record shows true, false or "not set"; record_sequence is verbatim; zero stays zero and missing stays missing',()=>{
 const rows=[casingRow(1,{on_top_record:true,record_sequence:'03'}),casingRow(2,{on_top_record:false}),casingRow(3,{on_top_record:null})];
 const html=loaded(doc('casing',rows),doc('plugging',[plugRow(1)]));
 const cells=key=>html.slice(html.indexOf(key),html.indexOf('</tr>',html.indexOf(key)));
 assert.match(cells(rows[0].source_row_key),/<td>true<\/td>/);assert.match(cells(rows[1].source_row_key),/<td>false<\/td>/);assert.match(cells(rows[2].source_row_key),/<td>not set<\/td>/);
 assert.ok(!/<td>not set<\/td>/.test(cells(rows[1].source_row_key)),'false is never shown as not set');
 assert.match(cells(rows[0].source_row_key),/<td>03<\/td>/,'record_sequence verbatim');
 assert.match(cells(rows[0].source_row_key),/<td>0<\/td>/,'published toc 0 stays 0');assert.match(cells(rows[0].source_row_key),/<td>Not reported<\/td>/,'absent multi_stg_depth stays missing');
 assert.match(cells(rows[0].source_row_key),/<td>-3.5<\/td>/,'depth_reference shown as published');
 assert.match(cells('rrc:plugging:wfzn-9fje:abc:1'),/<td>0<\/td>/,'published total_depth_w3 0 stays 0');
 assert.ok(html.includes('2001-05-06T00:00:00.000'),'original date text');
});
test('headers carry dictionary units and depth_reference_code is marked undocumented even without a dictionary',()=>{
 const html=loaded(doc('casing',[casingRow(1)]),doc('plugging',[plugRow(1)]));
 assert.match(html,/<th scope="col">csg_depth <small>\(not stated by the source\)<\/small><\/th>/);assert.match(html,/<th scope="col">cmt_sacks <small>\(sacks \(as named\)\)<\/small><\/th>/);
 assert.match(html,/<th scope="col">depth_reference_code <small>\(code; meaning undocumented in ODP metadata\)<\/small><\/th>/);
 assert.ok(html.includes('<td>KB</td>'),'reference code verbatim');assert.ok(html.includes('filing sequence shared by several rows'),'dictionary notes rendered');
 assert.ok(!/\((in|ft|inches|feet)\)/.test(html),'no inch or foot unit asserted');
 const bare=loaded(doc('casing',[casingRow(1)]),doc('plugging',[plugRow(1)]),{fields:{}});
 assert.match(bare,/units unavailable/);assert.match(bare,/depth_reference_code <small>\(units unavailable; meaning undocumented in ODP metadata\)/);
});
test('none/no_source_rows and none/api_missing_or_invalid show only the fixed sentences',()=>{
 const empty=loaded(doc('casing',[],{status:'none',reason:'no_source_rows'}),doc('plugging',[],{status:'none',reason:'no_source_rows'}));
 assert.ok(empty.includes(escapeHtml(SENTENCES.casing)));assert.ok(empty.includes(escapeHtml(SENTENCES.plugging)));assert.ok(!empty.includes('<table'));assert.match(empty,/confirmed_empty/);
 const none=loaded(doc('casing',[],{status:'none',reason:'api_missing_or_invalid',api:null,candidates:[]}),doc('plugging',[],{status:'none',reason:'api_missing_or_invalid',api:null,candidates:[]}));
 assert.equal(none.split(escapeHtml(SENTENCES.api)).length-1,2);assert.match(none,/No query was made/);assert.match(none,/not_queried/);assert.ok(!none.includes('<table'));
 assert.ok(!none.includes(escapeHtml(SENTENCES.casing))&&!none.includes(escapeHtml(SENTENCES.plugging)));
});
test('an ambiguous link lists every inventory candidate with the selected row marked and keeps rows accepted',()=>{
 const candidates=[candidate(1,true,'000020838'),candidate(2,false,'000099999')];
 const html=loaded(doc('casing',[casingRow(1,{wellbore_link_status:'ambiguous'})],{status:'ambiguous',reason:'multiple_inventory_rows',candidates}),doc('plugging',[],{status:'ambiguous',reason:'multiple_inventory_rows',candidates}));
 assert.equal(html.split(escapeHtml(SENTENCES.ambiguous)).length-1,2);assert.match(html,/multiple_inventory_rows/);
 assert.match(html,/<tr class="selected"><td>Selected inventory row<\/td><td>rrc:uic:givw-z9t4:1111111111111111:1<\/td><td>000020838<\/td>/);
 assert.match(html,/<tr class=""><td>Other permit<\/td><td>rrc:uic:givw-z9t4:1111111111111111:2<\/td><td>000099999<\/td>/);
 assert.match(html,/1 raw = 1 accepted \+ 0 quarantined/);assert.match(html,/<td>accepted<\/td>/);
 const cap=Array.from({length:25},(_,index)=>candidate(index+1,index===0,String(index).padStart(9,'0')));
 const capped=loaded(doc('casing',[],{status:'ambiguous',reason:'inventory_cap_reached',candidates:cap}),doc('plugging',[],{status:'ambiguous',reason:'inventory_cap_reached',candidates:cap}));
 assert.match(capped,/inventory_cap_reached/);assert.equal(capped.split('Other permit').length-1,48,'all 25 candidates listed per dataset');
});
test('quarantined rows stay visible with disposition and recorded reasons',()=>{
 const rows=[plugRow(1),plugRow(2,{plug_top_depth:300,quality_flags:['inconsistent:plug_top_exceeds_bottom']}),plugRow(3,{w3_date:null,w3_date_text:'2025-02-30',quality_flags:['parse_failure:w3_date']})];
 const html=loaded(doc('casing',[casingRow(1)]),doc('plugging',rows));
 assert.match(html,/3 raw = 1 accepted \+ 2 quarantined \+ 0 excluded/);assert.ok(html.includes('inconsistent:plug_top_exceeds_bottom'));assert.ok(html.includes('2025-02-30'),'unparsed date text kept');
 assert.match(html,/<tr class="quarantined"><th scope="row">rrc:plugging:wfzn-9fje:abc:2<\/th><td>quarantined<\/td>/);
 const missing=loaded(doc('casing',[casingRow(1)],{},{dispositions:[]}),doc('plugging',[]));assert.match(missing,/<td>Unavailable<\/td>/,'an absent disposition is not invented');
 const hostile=loaded(doc('casing',[casingRow(1,{depth_reference_code:'<b>KB</b>'})]),doc('plugging',[]));assert.ok(hostile.includes('&lt;b&gt;KB&lt;/b&gt;'));assert.ok(!hostile.includes('<b>KB'));
});
test('no rendered state states or implies casing, cementing, plugging or compliance status',async()=>{
 const candidates=[candidate(1,true,'000020838'),candidate(2,false,'000099999')];
 const states=[renderWellboreView({status:'not_collected'}),renderWellboreView({status:'loading'}),renderWellboreView({status:'error',message:'x'}),
  loaded(doc('casing',[casingRow(1)]),doc('plugging',[plugRow(1)])),
  loaded(doc('casing',[],{status:'none',reason:'no_source_rows'}),doc('plugging',[],{status:'none',reason:'no_source_rows'})),
  loaded(doc('casing',[],{status:'none',reason:'api_missing_or_invalid',api:null,candidates:[]}),doc('plugging',[],{status:'none',reason:'api_missing_or_invalid',api:null,candidates:[]})),
  loaded(doc('casing',[casingRow(1)],{status:'ambiguous',reason:'multiple_inventory_rows',candidates}),doc('plugging',[],{status:'ambiguous',reason:'multiple_inventory_rows',candidates}))];
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const shell=index.slice(index.indexOf('<section id="wellbore-view"'),index.indexOf('<section id="quality-view"'));
 for(const html of [...states,shell]){
  const text=stripPresence(html).toLowerCase();
  for(const word of FORBIDDEN)assert.ok(!text.includes(word),`${word} in ${html.slice(0,80)}`);
 }
});
test('the Wellbore tab is routable and present in the page shell with verbatim Help text',async()=>{
 assert.deepEqual(nav.parseRoute('#dataset/rrc-v4-fixture/wellbore'),{screen:'workspace',artifactId:'rrc-v4-fixture',tab:'wellbore'});assert.equal(nav.datasetRoute('rrc-v4-fixture','wellbore'),'#dataset/rrc-v4-fixture/wellbore');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<a data-tab="tests" href="#">Tests<\/a><a data-tab="wellbore" href="#">Wellbore<\/a>/);assert.match(html,/<section id="wellbore-view" class="view"[^>]*hidden>/);assert.match(html,/id="wellbore-content"/);
 assert.ok(html.indexOf('id="tests-view"')<html.indexOf('id="wellbore-view"'),'after the Tests section');
 const help=html.slice(html.indexOf('id="help-view"'),html.indexOf('id="dataset-workspace"'));assert.ok(help.includes(HELP),'verbatim Help text');
 const section=html.slice(html.indexOf('id="wellbore-view"'),html.indexOf('id="quality-view"'));assert.ok(section.includes(HELP),'verbatim section heading text');
 const node={textContent:'stale',tagName:'DIV'};clearDatasetEvidence({getElementById:id=>id==='wellbore-content'?node:null});assert.equal(node.textContent,'');
});

async function startUI({artifact,hash,sidecars=new Map()}){
 const nodes=new Map(),handlers={};
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(){},removeAttribute(){},appendChild(){},focus(){},querySelectorAll(){return [];},replaceChildren(){this.textContent='';this.innerHTML='';},insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}});return nodes.get(id);};
 const pins={artifactId:artifact.artifactId,path:`/artifacts/${artifact.artifactId}/`,defaultPinned:true,manifestSha256:'a'.repeat(64),normalizedSha256:'b'.repeat(64)};
 const fetch=async path=>{if(sidecars.has(path)){const bytes=sidecars.get(path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return {ok:true,json:async()=>path==='/artifact-path.json'?{artifact_id:artifact.artifactId,path:pins.path}:path==='/artifact-integrity.json'?pins:{versions:[pins]}};};
 const env={document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},window:{addEventListener:(name,handler)=>{handlers[name]=handler;},scrollTo(){},matchMedia:()=>({matches:false})},location:{hash},fetch,loadPinnedArtifact:async()=>artifact,loadVerifiedVersion:async()=>artifact,mountCollection(){},createLatestRequest,clearDatasetEvidence,historyState,...nav,chart:()=>'',fmt:formatNumber,escape:escapeHtml,mountWorkflow:async()=>({refresh(){},forDataset(){},showHistory(){},clearDataset(){}}),facts,filterInventory,dispositionRows,sourceUrl,countText,
  createAnalyticsHandoff:()=>({start(){},cancel(){},destroy(){}}),...await import('../public/compare-view.js'),compareVersions:()=>({schemaVersion:1,comparison_version:'rrc-compare-v1',uic_number:'000020838',sides:{a:{},b:{}},datasets:[],sources:[],source_revisions:{a:{},b:{}}}),history:{state:null,replaceState(){}},PORTFOLIO_URL:'',createLegacyCollectionApi:()=>({}),createGuestCollectionApi:()=>({}),createGuestClient:()=>({}),
  listSavedPackages:async()=>[],saveVerifiedPackage:async()=>{},verifyVersionPackage:async()=>{},loadVerifiedSidecar:(a,i,name,impl)=>integrityModule.loadVerifiedSidecar(a,i,name,impl??fetch),renderTestsView,testReportsCollected,renderWellboreView,wellboreCollected,...await import('../public/dossier-view.js').then(({renderDossierView,dossierCollected})=>({renderDossierView,dossierCollected}))};
 env.document.querySelector=selector=>selector.startsWith('meta[')?null:element(selector);
 const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 await new AsyncFunction(...Object.keys(env),code)(...Object.values(env));
 for(let attempt=0;attempt<200&&/Verifying (test-report|casing and plugging)/.test(element('tests-content').innerHTML+element('wellbore-content').innerHTML);attempt++)await new Promise(resolve=>setTimeout(resolve,5));
 return {element};
}
const original=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url)));
function versionArtifact({queryVersion=4,casing=doc('casing',[casingRow(1),casingRow(2,{csg_size:5.5})]),plugging=doc('plugging',[],{status:'none',reason:'no_source_rows'}),id=ID}={}){
 const artifact=structuredClone(original);artifact.artifactId=id;artifact.manifest.artifact_id=id;artifact.manifest.scope.query_version=queryVersion;artifact.manifest.files['sources/acquisition.json']={sha256:'c'.repeat(64),bytes:1};
 const encoder=new TextEncoder(),tests={schemaVersion:1,artifactId:id,scope:{query_version:queryVersion},bhp:[],srt:[],quality:{}};
 const bodies=new Map([['tests.json',encoder.encode(JSON.stringify(tests))],['tests_dictionary.json',encoder.encode('{"fields":{}}')]]);
 if(queryVersion>=4)for(const [name,body] of [['casing.json',JSON.stringify(casing)],['casing.csv','source_row_key\n'],['plugging.json',JSON.stringify(plugging)],['plugging.csv','source_row_key\n'],['wellbore_dictionary.json',JSON.stringify(dictionary())]])bodies.set(name,encoder.encode(body));
 if(queryVersion>=5)bodies.set('evidence_relations.json',encoder.encode(JSON.stringify({schemaVersion:1,artifactId:id,catalogue_version:'rrc-relations-v1',relations:[]})));
 for(const [name,bytes] of bodies)artifact.manifest.files[name]={sha256:sha(bytes),bytes:bytes.length};
 return {artifact,sidecars:new Map([...bodies].map(([name,bytes])=>[`/artifacts/${id}/${name}`,bytes]))};
}
test('existing v1 and v3 versions open the Wellbore tab as not collected and list no wellbore downloads',async()=>{
 const v1=await startUI({artifact:original,hash:`#dataset/${original.artifactId}/wellbore`});
 assert.equal(v1.element('wellbore-view').hidden,false);assert.equal(v1.element('tests-view').hidden,true);assert.equal(v1.element('records-view').hidden,true);
 assert.ok(v1.element('wellbore-content').innerHTML.includes(NOT_COLLECTED));
 for(const name of SIDECARS)assert.ok(!v1.element('downloads').innerHTML.includes(`download="${name}"`),name);
 const {artifact,sidecars}=versionArtifact({queryVersion:3,id:'rrc-v3-fixture'});
 const v3=await startUI({artifact,hash:'#dataset/rrc-v3-fixture/wellbore',sidecars});
 assert.ok(v3.element('wellbore-content').innerHTML.includes(NOT_COLLECTED));for(const name of SIDECARS)assert.ok(!v3.element('downloads').innerHTML.includes(`download="${name}"`),name);
});
test('a v4 version renders verified casing and plugging, lists the five sidecars and can be sent to Analytics',async()=>{
 const {artifact,sidecars}=versionArtifact();
 const ui=await startUI({artifact,hash:`#dataset/${ID}/wellbore`,sidecars});
 const html=ui.element('wellbore-content').innerHTML;
 assert.ok(html.includes('rrc:casing:u9m4-xnh6:abc:2'),html.slice(0,300));assert.ok(html.includes(escapeHtml(SENTENCES.matched)));assert.ok(html.includes(escapeHtml(SENTENCES.plugging)));
 assert.equal(ui.element('wellbore-view').hidden,false);
 const downloads=ui.element('downloads').innerHTML;for(const name of SIDECARS)assert.ok(downloads.includes(`download="${name}"`),name);assert.match(downloads,/Publication pins/);
 const exportsUi=await startUI({artifact,hash:`#dataset/${ID}/downloads`,sidecars});
 assert.equal(exportsUi.element('analytics-start').disabled,false);assert.ok(!exportsUi.element('analytics-status').textContent.includes('is not sent to Analytics'));
});
test('ADR 005 gate: v3 and v5 stay local, v4 is offered',async()=>{
 for(const [queryVersion,local] of [[3,true],[4,false],[5,true]]){
  const id=`rrc-v${queryVersion}-gate`,{artifact,sidecars}=versionArtifact({queryVersion,id});
  const ui=await startUI({artifact,hash:`#dataset/${id}/downloads`,sidecars});
  assert.equal(ui.element('analytics-start').disabled,local,`v${queryVersion}`);
  if(local)assert.equal(ui.element('analytics-status').textContent,ANALYTICS_LOCAL_ONLY(queryVersion));
 }
});
test('a v4 version whose casing.json bytes were modified is refused with no rows',async()=>{
 const {artifact,sidecars}=versionArtifact();const path=`/artifacts/${ID}/casing.json`,tampered=new Uint8Array(sidecars.get(path));tampered[10]^=1;sidecars.set(path,tampered);
 const ui=await startUI({artifact,hash:`#dataset/${ID}/wellbore`,sidecars});
 const html=ui.element('wellbore-content').innerHTML;assert.match(html,/mismatch/i);assert.match(html,/role="alert"/);assert.ok(!html.includes('rrc:casing:'));assert.ok(!html.includes('rrc:plugging:'));
});
test('a v4 sidecar naming another version or dataset is refused',async()=>{
 const foreign=doc('casing',[casingRow(1)]);foreign.artifactId='rrc-other';
 const first=versionArtifact({casing:foreign});const ui=await startUI({artifact:first.artifact,hash:`#dataset/${ID}/wellbore`,sidecars:first.sidecars});
 assert.match(ui.element('wellbore-content').innerHTML,/casing\.json version identity mismatch/);assert.ok(!ui.element('wellbore-content').innerHTML.includes('rrc:casing:'));
 const swapped=doc('plugging',[plugRow(1)]);swapped.dataset='casing';
 const second=versionArtifact({plugging:swapped});const other=await startUI({artifact:second.artifact,hash:`#dataset/${ID}/wellbore`,sidecars:second.sidecars});
 assert.match(other.element('wellbore-content').innerHTML,/plugging\.json dataset mismatch/);assert.ok(!other.element('wellbore-content').innerHTML.includes('rrc:plugging:'));
});
test('loadVerifiedSidecar refuses a tampered casing.json',async()=>{
 const {artifact,sidecars}=versionArtifact(),integrity={artifactId:ID,path:`/artifacts/${ID}/`};
 const body=sidecars.get(`/artifacts/${ID}/casing.json`),tampered=new Uint8Array(body);tampered[tampered.length-2]^=1;
 const fetchFor=bytes=>async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 assert.deepEqual([...await integrityModule.loadVerifiedSidecar(artifact,integrity,'casing.json',fetchFor(body))],[...body]);
 await assert.rejects(integrityModule.loadVerifiedSidecar(artifact,integrity,'casing.json',fetchFor(tampered)),/mismatch/i);
});
