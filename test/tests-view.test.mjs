// RRC-13 browser contract (Phase 2 spec §7–8, §10 "Browser"): Tests tab, sidecar loading and the
// Analytics gate. Every test-report object here is a synthetic fixture built from the spec shapes.
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
const view=await import('../public/tests-view.js').catch(()=>({}));

const NOT_COLLECTED='Test reports were not collected for this version.';
const EMPTY='No rows were returned by the exact-UIC query; this does not show that no test was conducted.';
const HELP='ODP BHP/SRT datasets are report inventories: one row per source record (the source does not document how many rows one test produces), without test documents or pressure series. Values are shown as reported; psia and psig are kept as labelled and not interpreted.';
const ANALYTICS_V3='Test-report versions are not sent to Analytics until the receiver accepts additive files (D10, Phase 6).';
const PSIA_NOTE='Official RRC Permian guidance (bhp-permian-nto.pdf p.1) states BHP is reported in PSIG; the ODP field name says psia. The conflict is unresolved; the value is shown as published and never converted.';
const SIDECARS=['tests.json','tests_bhp.csv','tests_srt.csv','tests_dictionary.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const entry=(units,extra={})=>({units,status:'synthetic',definition:'Synthetic fixture definition',source_field:'fixture',basis:'odp_field_name',...extra});

function dictionary(){
 return {schema_version:1,fields:{
  source_row_key:entry('string'),uic_number:entry('string'),source_report_id:entry('string',{note:'meaning undocumented'}),tracking_no:entry('string'),test_sequence_no:entry('string'),
  report_conducted_date_text:entry('date text'),report_received_date_text:entry('date text'),
  bhp_psia:entry('psia as named by the ODP field',{note:PSIA_NOTE}),test_depth_ft:entry('ft',{note:'depth basis unstated'}),gradient_psi_ft:entry('psi/ft',{note:'not the SRT fracture gradient'}),tested_formation:entry('string'),
  srt_received_date_text:entry('date text'),test_date_text:entry('date text'),satisfactory_test_code:entry('code',{note:'code meaning undocumented'}),top_perf_ft:entry('ft'),bottom_perf_ft:entry('ft'),formation_tested:entry('string'),
  min_inj_rate_bpm:entry('bbl/min (bpm as named)'),max_inj_rate_bpm:entry('bbl/min (bpm as named)'),isip_psig:entry('psig'),formation_frac_press_psig:entry('psig'),frac_inj_rate_capacity_bpd:entry('bbl/day'),surface_pressure_firc_psig:entry('psig'),fracture_gradient_psi_ft:entry('psi/ft'),comments:entry('string'),quality_flags:entry('list')}};
}
const bhpRow=(ordinal,extra={})=>({source_row_key:`rrc:bhp:qxfy-wcfs:abc:${ordinal}`,parent_key:'inv-1',parent_join_status:'matched',uic_number:'000111186',source_report_id:String(100+ordinal),tracking_no:'T-1',test_sequence_no:String(ordinal),report_conducted_date:'2024-03-05',report_conducted_date_text:'2024-03-05',report_received_date:'2024-04-01',report_received_date_text:'2024-04-01',bhp_psia:2150.5,test_depth_ft:5000,gradient_psi_ft:0.465,tested_formation:'SAN ANDRES',source_snapshot_id:'qxfy-wcfs:abc',quality_flags:[],...extra});
const srtRow=(ordinal,extra={})=>({source_row_key:`rrc:srt:h54t-xnbi:def:${ordinal}`,parent_key:'inv-1',parent_join_status:'matched',uic_number:'000119875',source_report_id:String(200+ordinal),tracking_no:'S-1',srt_received_date:'2023-01-02',srt_received_date_text:'2023-01-02',test_date:'2022-12-01',test_date_text:'2022-12-01',satisfactory_test_code:'1',top_perf_ft:4000,bottom_perf_ft:4200,formation_tested:'DEVONIAN',min_inj_rate_bpm:0,max_inj_rate_bpm:null,isip_psig:-15,formation_frac_press_psig:3100,frac_inj_rate_capacity_bpd:12000,surface_pressure_firc_psig:900,fracture_gradient_psi_ft:0.72,comments:'Verbatim <b>comment</b>',source_snapshot_id:'h54t-xnbi:def',quality_flags:[],...extra});
function testsDoc({bhp=[],srt=[],dispositions}={}){
 const counts=rows=>({raw:rows.length,parsed:rows.length,accepted:rows.filter(row=>!row.quality_flags.length).length,quarantined:rows.filter(row=>row.quality_flags.length).length,excluded:0});
 return {schemaVersion:1,artifactId:'rrc-v3-fixture',scope:{query_version:3,uic_number:'000111186',test_report_limit:1000,order:'report_id,tracking_no',bhp_returned:bhp.length,srt_returned:srt.length,bhp_status:bhp.length?'returned':'confirmed_empty',srt_status:srt.length?'returned':'confirmed_empty',window:'exact uic_no; not limited to reporting period'},bhp,srt,quality:{bhp:counts(bhp),srt:counts(srt),parent_join:{matched:bhp.length+srt.length,unmatched:0,ambiguous:0},issue_counts:{},dispositions:dispositions??[...bhp,...srt].map(row=>({source_row_key:row.source_row_key,disposition:row.quality_flags.length?'quarantined':'accepted',...(row.quality_flags.length?{reasons:[...row.quality_flags]}:{})})),duplicate_policy:'quarantine every occurrence',empty_result_policy:'confirmed_empty is not evidence that no test was conducted'}};
}

test('a version without test-report sidecars shows the not-collected state',()=>{
 assert.equal(typeof view.renderTestsView,'function');assert.equal(typeof view.testReportsCollected,'function');
 assert.equal(view.testReportsCollected({files:{'manifest.json':{}}}),false);assert.equal(view.testReportsCollected({files:{'tests.json':{}}}),true);assert.equal(view.testReportsCollected(undefined),false);
 const html=view.renderTestsView({status:'not_collected'});assert.ok(html.includes(NOT_COLLECTED));assert.ok(!html.includes('<table'));
});
test('a confirmed-empty exact-UIC result says no rows were returned without claiming no test was conducted',()=>{
 const html=view.renderTestsView({status:'loaded',tests:testsDoc(),dictionary:dictionary()});
 assert.equal(html.split(EMPTY).length-1,2,'both BHP and SRT show the empty-result message');assert.ok(!html.includes('<table'));
 assert.ok(html.includes('exact uic_no; not limited to reporting period'));assert.match(html,/0 raw = 0 accepted \+ 0 quarantined/);
});
test('quarantined rows stay visible with disposition and recorded reasons',()=>{
 const bhp=[bhpRow(1),bhpRow(2,{report_conducted_date:null,report_conducted_date_text:'2024-02-30',quality_flags:['parse_failure:report_conducted_date','duplicate_report_identity']})];
 const html=view.renderTestsView({status:'loaded',tests:testsDoc({bhp}),dictionary:dictionary()});
 assert.ok(html.includes('rrc:bhp:qxfy-wcfs:abc:2'));assert.match(html,/quarantined/);assert.ok(html.includes('parse_failure:report_conducted_date, duplicate_report_identity'));
 assert.ok(html.includes('2024-02-30'),'original date text is shown even when it failed to parse');assert.match(html,/accepted/);
 assert.match(html,/2 raw = 1 accepted \+ 1 quarantined \+ 0 excluded/);
 const missing=view.renderTestsView({status:'loaded',tests:testsDoc({bhp:[bhpRow(1)],dispositions:[]}),dictionary:dictionary()});assert.match(missing,/Unavailable/,'an absent disposition is not invented');
});
test('table headers carry units from the dictionary and values are shown exactly as reported',()=>{
 const html=view.renderTestsView({status:'loaded',tests:testsDoc({bhp:[bhpRow(1)],srt:[srtRow(1)]}),dictionary:dictionary()});
 for(const units of ['psia as named by the ODP field','psi/ft','bbl/min (bpm as named)','bbl/day','psig','ft'])assert.ok(html.includes(`(${escapeHtml(units)})`),units);
 assert.match(html,/<th[^>]*>bhp_psia <small>\(psia as named by the ODP field\)<\/small><\/th>/);
 assert.ok(html.includes('>0.465<'),'decimals are not rounded');assert.ok(html.includes('>2150.5<'));assert.ok(html.includes('>-15<'),'negative psig shown as reported');
 assert.ok(html.includes('>0<'),'zero remains zero');assert.match(html,/Not reported/,'missing stays missing');
 assert.ok(html.includes('Verbatim &lt;b&gt;comment&lt;/b&gt;'),'source text is escaped');assert.ok(!html.includes('<b>comment'));
 assert.match(html,/public reported/i);assert.ok(!/<svg|<canvas/i.test(html),'no charts');
 const noDictionary=view.renderTestsView({status:'loaded',tests:testsDoc({bhp:[bhpRow(1)]}),dictionary:{fields:{}}});assert.match(noDictionary,/units unavailable/);
});
test('dictionary notes, including the psia/PSIG conflict, are rendered with their basis',()=>{
 const html=view.renderTestsView({status:'loaded',tests:testsDoc({bhp:[bhpRow(1)],srt:[srtRow(1)]}),dictionary:dictionary()});
 assert.ok(html.includes(escapeHtml(PSIA_NOTE)));assert.ok(html.includes('not the SRT fracture gradient'));assert.ok(html.includes('code meaning undocumented'));assert.ok(html.includes('odp_field_name'));
});
test('load errors render as a visible refusal instead of rows',()=>{
 const html=view.renderTestsView({status:'error',message:'Sidecar hash mismatch <x>'});assert.match(html,/Sidecar hash mismatch &lt;x&gt;/);assert.ok(!html.includes('<table'));
});

function sidecarFixture(){
 const body=new TextEncoder().encode(JSON.stringify(testsDoc({bhp:[bhpRow(1)]})));
 const artifact={artifactId:'rrc-v3-fixture',manifest:{artifact_id:'rrc-v3-fixture',files:{'tests.json':{sha256:sha(body),bytes:body.length}}}};
 const integrity={artifactId:'rrc-v3-fixture',path:'/artifacts/rrc-v3-fixture/',manifestSha256:'a'.repeat(64),normalizedSha256:'b'.repeat(64)};
 const requests=[];const fetchFor=bytes=>async path=>{requests.push(path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
 return {body,artifact,integrity,requests,fetchFor};
}
test('loadVerifiedSidecar returns exact bytes only for a manifest-listed, hash- and size-matched file',async()=>{
 assert.equal(typeof integrityModule.loadVerifiedSidecar,'function');
 const {body,artifact,integrity,requests,fetchFor}=sidecarFixture();
 const bytes=await integrityModule.loadVerifiedSidecar(artifact,integrity,'tests.json',fetchFor(body));
 assert.deepEqual([...bytes],[...body]);assert.deepEqual(requests,['/artifacts/rrc-v3-fixture/tests.json']);
});
test('loadVerifiedSidecar refuses names absent from manifest.files without fetching',async()=>{
 const {body,artifact,integrity,requests,fetchFor}=sidecarFixture();
 for(const name of ['tests_dictionary.json','toString','__proto__','../manifest.json'])await assert.rejects(integrityModule.loadVerifiedSidecar(artifact,integrity,name,fetchFor(body)),/not listed|invalid/i,name);
 assert.equal(requests.length,0);
});
test('loadVerifiedSidecar refuses a tampered, truncated or mis-identified sidecar',async()=>{
 const {body,artifact,integrity,fetchFor}=sidecarFixture();
 const tampered=new Uint8Array(body);tampered[tampered.length-2]^=1;
 await assert.rejects(integrityModule.loadVerifiedSidecar(artifact,integrity,'tests.json',fetchFor(tampered)),/mismatch/i);
 await assert.rejects(integrityModule.loadVerifiedSidecar(artifact,integrity,'tests.json',fetchFor(body.subarray(0,body.length-1))),/mismatch/i);
 await assert.rejects(integrityModule.loadVerifiedSidecar(artifact,{...integrity,artifactId:'other',path:'/artifacts/other/'},'tests.json',fetchFor(body)),/identity/i);
 await assert.rejects(integrityModule.loadVerifiedSidecar(artifact,integrity,'tests.json',async()=>({ok:false})),/unavailable/i);
});

test('the Tests tab is a routable workspace tab with Help text in the page shell',async()=>{
 assert.deepEqual(nav.parseRoute('#dataset/rrc-v3-fixture/tests'),{screen:'workspace',artifactId:'rrc-v3-fixture',tab:'tests'});assert.equal(nav.datasetRoute('rrc-v3-fixture','tests'),'#dataset/rrc-v3-fixture/tests');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<a data-tab="tests" href="#">Tests<\/a>/);assert.match(html,/<section id="tests-view" class="view"[^>]*hidden>/);assert.match(html,/id="tests-content"/);
 const help=html.slice(html.indexOf('id="help-view"'),html.indexOf('id="dataset-workspace"'));assert.ok(help.includes(HELP),'verbatim Help text');assert.match(help,/no reporting-window bound/i);
});

async function startUI({artifact,hash,sidecars=new Map()}){
 const nodes=new Map(),handlers={};
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(){},removeAttribute(){},appendChild(){},focus(){},querySelectorAll(){return [];},replaceChildren(){this.textContent='';this.innerHTML='';},insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}});return nodes.get(id);};
 const pins={artifactId:artifact.artifactId,path:`/artifacts/${artifact.artifactId}/`,defaultPinned:true,manifestSha256:'a'.repeat(64),normalizedSha256:'b'.repeat(64)};
 const fetch=async path=>{if(sidecars.has(path)){const bytes=sidecars.get(path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return {ok:true,json:async()=>path==='/artifact-path.json'?{artifact_id:artifact.artifactId,path:pins.path}:path==='/artifact-integrity.json'?pins:{versions:[pins]}};};
 const env={document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},window:{addEventListener:(name,handler)=>{handlers[name]=handler;},scrollTo(){},matchMedia:()=>({matches:false})},location:{hash},fetch,loadPinnedArtifact:async()=>artifact,loadVerifiedVersion:async()=>artifact,mountCollection(){},createLatestRequest,clearDatasetEvidence,historyState,...nav,chart:()=>'',fmt:formatNumber,escape:escapeHtml,mountWorkflow:async()=>({refresh(){},forDataset(){},showHistory(){},clearDataset(){}}),facts,filterInventory,dispositionRows,sourceUrl,countText,
  createAnalyticsHandoff:()=>({start(){},cancel(){},destroy(){}}),PORTFOLIO_URL:'',createLegacyCollectionApi:()=>({}),createGuestCollectionApi:()=>({}),createGuestClient:()=>({}),
  listSavedPackages:async()=>[],saveVerifiedPackage:async()=>{},verifyVersionPackage:async()=>{},loadVerifiedSidecar:(a,i,name,impl)=>integrityModule.loadVerifiedSidecar(a,i,name,impl??fetch),renderTestsView:view.renderTestsView,testReportsCollected:view.testReportsCollected,...await import('../public/wellbore-view.js').then(({renderWellboreView,wellboreCollected})=>({renderWellboreView,wellboreCollected}))};
 env.document.querySelector=selector=>selector.startsWith('meta[')?null:element(selector);
 const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 await new AsyncFunction(...Object.keys(env),code)(...Object.values(env));
 for(let attempt=0;attempt<200&&element('tests-content').innerHTML.includes('Verifying test-report');attempt++)await new Promise(resolve=>setTimeout(resolve,5));
 return {element,route:()=>handlers.hashchange?.()};
}
const original=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url)));
function v3Artifact(tests=testsDoc({bhp:[bhpRow(1)],srt:[srtRow(1)]})){
 const artifact=structuredClone(original);artifact.artifactId='rrc-v3-fixture';artifact.manifest.artifact_id='rrc-v3-fixture';artifact.manifest.scope.query_version=3;artifact.manifest.files['sources/acquisition.json']={sha256:'c'.repeat(64),bytes:1};
 const encoder=new TextEncoder(),bodies=new Map([['tests.json',encoder.encode(JSON.stringify(tests))],['tests_bhp.csv',encoder.encode('source_row_key\n')],['tests_srt.csv',encoder.encode('source_row_key\n')],['tests_dictionary.json',encoder.encode(JSON.stringify(dictionary()))]]);
 for(const [name,bytes] of bodies)artifact.manifest.files[name]={sha256:sha(bytes),bytes:bytes.length};
 return {artifact,sidecars:new Map([...bodies].map(([name,bytes])=>[`/artifacts/rrc-v3-fixture/${name}`,bytes]))};
}
test('existing versions open with the Tests tab in the not-collected state and keep Analytics',async()=>{
 const ui=await startUI({artifact:original,hash:`#dataset/${original.artifactId}/tests`});
 assert.equal(ui.element('tests-view').hidden,false);assert.equal(ui.element('records-view').hidden,true);
 assert.ok(ui.element('tests-content').innerHTML.includes(NOT_COLLECTED));
 const downloads=ui.element('downloads').innerHTML;for(const name of SIDECARS)assert.ok(!downloads.includes(`download="${name}"`),name);
 const v2=await startUI({artifact:original,hash:`#dataset/${original.artifactId}/downloads`});assert.equal(v2.element('analytics-start').disabled,false);assert.ok(!v2.element('analytics-status').textContent.includes(ANALYTICS_V3));
});
test('a v3 version renders verified test reports, lists the four sidecars and is not sent to Analytics',async()=>{
 const {artifact,sidecars}=v3Artifact();
 const ui=await startUI({artifact,hash:'#dataset/rrc-v3-fixture/tests',sidecars});
 const html=ui.element('tests-content').innerHTML;assert.ok(html.includes('rrc:bhp:qxfy-wcfs:abc:1'),html.slice(0,300));assert.ok(html.includes('rrc:srt:h54t-xnbi:def:1'));assert.ok(html.includes(escapeHtml(PSIA_NOTE)));
 const downloads=ui.element('downloads').innerHTML;for(const name of SIDECARS)assert.ok(downloads.includes(`download="${name}"`),name);assert.match(downloads,/Publication pins/);
 const exportsUi=await startUI({artifact,hash:'#dataset/rrc-v3-fixture/downloads',sidecars});
 assert.equal(exportsUi.element('analytics-start').disabled,true);assert.equal(exportsUi.element('analytics-status').textContent,ANALYTICS_V3);
});
test('a v3 version whose tests.json bytes were modified is refused in the Tests tab',async()=>{
 const {artifact,sidecars}=v3Artifact();const tampered=new Uint8Array(sidecars.get('/artifacts/rrc-v3-fixture/tests.json'));tampered[10]^=1;sidecars.set('/artifacts/rrc-v3-fixture/tests.json',tampered);
 const ui=await startUI({artifact,hash:'#dataset/rrc-v3-fixture/tests',sidecars});
 const html=ui.element('tests-content').innerHTML;assert.match(html,/mismatch/i);assert.ok(!html.includes('rrc:bhp:qxfy-wcfs:abc:1'));
});
