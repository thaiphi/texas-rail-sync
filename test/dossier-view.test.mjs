// RRC-15 read-only dossier (Phase 3b spec §7, §9 tests 1-7). The relation catalogue here is a synthetic fixture built
// by this file from the spec §2 shapes only; no Task 1 (src/relations.mjs) or pipeline code is imported.
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
import {renderDossierView,dossierCollected,reconcileDossier,NOT_COLLECTED,RELATION_TYPES} from '../public/dossier-view.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const RELATION_KEYS=['relation','from_kind','from_key','to_kind','to_key','dataset','basis','status','reason','candidates','evidence'];
const FORBIDDEN=['compliant','non-compliant','violation','plugged and abandoned','not plugged','properly','adequate','safe','communication'];
const ID='rrc-v5-fixture',API='38934609',UIC='000109605',INV='rrc:uic:givw-z9t4:1111111111111111:1';
const SNAPSHOT={inventory:'givw-z9t4:1111111111111111',monthly:'qq2j-f2zm:2222222222222222',bhp:'qxfy-wcfs:3333333333333333',srt:'h54t-xnbi:3333333333333333',wellbore_inventory:'givw-z9t4:1111111111111111',casing:'u9m4-xnh6:4444444444444444',plugging:'wfzn-9fje:5555555555555555'};
const FILE={inventory:'sources/candidate-inventory.json',monthly:'sources/candidate-monthly.json',bhp:'sources/candidate-bhp.json',srt:'sources/candidate-srt.json',wellbore_inventory:'sources/wellbore-inventory.json',casing:'sources/candidate-casing.json',plugging:'sources/candidate-plugging.json'};
const KIND={inventory:'inventory_record',monthly:'h10_row',bhp:'bhp_row',srt:'srt_row',casing:'casing_row',plugging:'plugging_row'};

// Synthetic rows in the Phase 1-3 normalized/sidecar shapes.
const inventoryRow=(ordinal=1,extra={})=>({source_record_key:`rrc:uic:givw-z9t4:1111111111111111:${ordinal}`,uic_number:UIC,api_no:API,operator_number:'609265',district_code:'08',lease_number:'46166',lease_name:'FIXTURE SWD',well_no_display:'1',county:'Reeves',permitted_top_depth_ft:4000,permitted_bottom_depth_ft:8000,w14_number:'14479',source_snapshot_id:SNAPSHOT.inventory,quality_flags:[],...extra});
const monthlyRow=(ordinal,extra={})=>({source_row_key:`rrc:h10:qq2j-f2zm:2222222222222222:${ordinal}`,parent_key:INV,parent_join_status:'matched',uic_number:UIC,source_report_id:String(20000+ordinal),period_start:`2024-${String(((ordinal-1)%12)+1).padStart(2,'0')}-01`,injected_liquid_bbl:ordinal,source_snapshot_id:SNAPSHOT.monthly,quality_flags:[],...extra});
const bhpRow=(ordinal,extra={})=>({source_row_key:`rrc:bhp:qxfy-wcfs:3333333333333333:${ordinal}`,parent_key:INV,parent_join_status:'matched',uic_number:UIC,source_report_id:String(100+ordinal),bhp_psia:2150.5,test_depth_ft:5000,tested_formation:'SAN ANDRES',source_snapshot_id:SNAPSHOT.bhp,quality_flags:[],...extra});
const common=(dataset,ordinal)=>({source_row_key:`rrc:${dataset}:${dataset==='casing'?'u9m4-xnh6:4444444444444444':'wfzn-9fje:5555555555555555'}:${ordinal}`,source_api_id:API,wellbore_link_status:'matched',source_id:String(9000+ordinal),api_no:API,record_sequence:'1',on_top_record:true});
const casingRow=(ordinal,extra={})=>({...common('casing',ordinal),completion_date_text:'2021-10-28T00:00:00.000',csg_size:10.75,hole_size:14.75,csg_depth:1550,toc:0,multi_stg_depth:null,cmt_sacks:1205,total_depth_g1w2:6515,depth_reference:2849,depth_reference_code:'KB',source_snapshot_id:SNAPSHOT.casing,quality_flags:['missing:multi_stg_depth'],...extra});
const plugRow=(ordinal,extra={})=>({...common('plugging',ordinal),w3_date_text:'2025-01-23T00:00:00.000',plug_top_depth:3270,plug_bottom_depth:3400,plug_cmt_sacks:40,total_depth_w3:6515,depth_reference:null,depth_reference_code:'KB',source_snapshot_id:SNAPSHOT.plugging,quality_flags:[],...extra});
const candidate=(key,selected,extra={})=>({candidate_key:key,selected,uic_number:UIC,api_no:API,operator_number:'609265',district_code:'08',lease_number:'46166',lease_name:'FIXTURE SWD',well_no_display:'1',w14_number:'14479',...extra});
const counted=(rows,disposition)=>({raw:rows.length,parsed:rows.length,accepted:rows.filter(row=>disposition(row)==='accepted').length,quarantined:rows.filter(row=>disposition(row)==='quarantined').length,excluded:0});
const quarantinedRow=row=>row.quality_flags.some(flag=>/^(duplicate|inconsistent|parse_failure|invalid)/.test(flag))?'quarantined':'accepted';
const dispositionList=rows=>rows.map(row=>({source_row_key:row.source_row_key,disposition:quarantinedRow(row),...(quarantinedRow(row)==='quarantined'?{reasons:[...row.quality_flags]}:{})}));
function wellboreDoc(dataset,rows,{status='matched',reason=null,candidates=[candidate(INV,true)],api=API,inventoryKey=INV}={}){
 return {schemaVersion:1,artifactId:ID,dataset,scope:{query_version:5,source_api_id:api,wellbore_limit:1000,wellbore_inventory_limit:25,order:'record_sequence,id',returned:api===null?null:rows.length,status:api===null?'not_queried':rows.length?'returned_below_cap':'confirmed_empty',window:'exact api_no; not limited to reporting period'},
  link:{inventory_source_record_key:inventoryKey,source_api_id:api,basis:'inventory_api_no',status,reason,inventory_query:api===null?null:{url:'https://data.texas.gov/resource/givw-z9t4.json',sha256:'1'.repeat(64),rows:candidates.length},wellbore_query:api===null?null:{url:`https://data.texas.gov/resource/${dataset==='casing'?'u9m4-xnh6':'wfzn-9fje'}.json`,sha256:'2'.repeat(64),rows:rows.length},candidates:api===null?[]:candidates,wellbore_row_count:rows.length},
  rows,quality:{counts:counted(rows,quarantinedRow),issue_counts:{},dispositions:dispositionList(rows)}};
}
const testsDoc=(bhp=[],srt=[])=>({schemaVersion:1,artifactId:ID,scope:{query_version:5,uic_number:UIC},bhp,srt,quality:{bhp:counted(bhp,quarantinedRow),srt:counted(srt,quarantinedRow),parent_join:{bhp:{matched:bhp.length,unmatched:0,ambiguous:0},srt:{matched:srt.length,unmatched:0,ambiguous:0}},issue_counts:{},dispositions:dispositionList([...bhp,...srt])}});
const wellboreDictionary={fields:{csg_depth:{units:'ft'},multi_stg_depth:{units:'ft'},total_depth_g1w2:{units:'ft'},toc:{units:'ft (INFERRED)'},plug_top_depth:{units:'ft'},plug_bottom_depth:{units:'ft'},total_depth_w3:{units:'ft (INFERRED)'},depth_reference_code:{units:'source code',note:'ODP publishes no column descriptions. Shown verbatim; meaning undocumented in ODP metadata. GL, DF, KB, RT and GR are CONFIRMED elevation reference points (WBA091 p.2-15); every other code: meaning not stated.'}}};
const testsDictionary={fields:{test_depth_ft:{units:'ft'},top_perf_ft:{units:'ft'},bottom_perf_ft:{units:'ft'}}};

// Adds the seven preserved source files of a v5 version (synthetic bytes) to manifest.sources and manifest.files.
function attachSources(artifact){
 const manifest=artifact.manifest;manifest.sources=[...(manifest.sources??[])];manifest.files={...manifest.files};
 for(const [name,file] of Object.entries(FILE)){
  let source=manifest.sources.find(item=>item.raw_file===file);
  const snapshot=name==='inventory'||name==='wellbore_inventory'?artifact.inventory[0].source_snapshot_id:name==='monthly'?(artifact.injectionMonthly[0]?.source_snapshot_id??SNAPSHOT.monthly):SNAPSHOT[name];
  if(!source){const bytes=Buffer.from(`synthetic ${name} source bytes`);source={snapshot_id:snapshot,name,kind:name,raw_file:file,sha256:sha(bytes),bytes:bytes.length};manifest.sources.push(source);}
  manifest.files[file]={sha256:source.sha256,bytes:source.bytes??1};
 }
 return artifact;
}
// Test-side catalogue built from the section 2 rules (one relation object per rule, 11 keys in order).
function buildCatalogue({artifact,tests,casing,plugging}){
 const files=artifact.manifest.files,evidence=(...names)=>names.map(name=>({file:FILE[name],sha256:files[FILE[name]].sha256}));
 const relation=(values)=>Object.fromEntries(RELATION_KEYS.map(key=>[key,values[key]??(key==='candidates'?[]:null)]));
 const candidatesFor=row=>row.parent_join_status==='ambiguous'?artifact.inventory.filter(item=>item.uic_number===row.uic_number).map(item=>item.source_record_key):[];
 const relations=[];
 for(const row of artifact.injectionMonthly)relations.push(relation({relation:'inventory_to_h10',from_kind:'inventory_record',from_key:row.parent_join_status==='matched'?row.parent_key:null,to_kind:'h10_row',to_key:row.source_row_key,dataset:'h10',basis:'exact_uic_string',status:row.parent_join_status,candidates:candidatesFor(row),evidence:evidence('inventory','monthly')}));
 for(const [name,rows] of [['bhp',tests.bhp],['srt',tests.srt]])for(const row of rows)relations.push(relation({relation:'inventory_to_test_report',from_kind:'inventory_record',from_key:row.parent_join_status==='matched'?row.parent_key:null,to_kind:KIND[name],to_key:row.source_row_key,dataset:name,basis:'exact_uic_string',status:row.parent_join_status,candidates:candidatesFor(row),evidence:evidence('inventory',name)}));
 for(const [name,doc] of [['casing',casing],['plugging',plugging]]){const link=doc.link;relations.push(relation({relation:'inventory_to_wellbore',from_kind:'inventory_record',from_key:link.inventory_source_record_key,to_kind:'wellbore',to_key:link.source_api_id,dataset:name,basis:'inventory_api_no',status:link.status,reason:link.reason,candidates:structuredClone(link.candidates),evidence:link.source_api_id===null?evidence('inventory'):evidence('inventory','wellbore_inventory',name)}));}
 for(const [name,doc] of [['casing',casing],['plugging',plugging]])for(const row of doc.rows)relations.push(relation({relation:`wellbore_to_${name}`,from_kind:'wellbore',from_key:row.source_api_id,to_kind:KIND[name],to_key:row.source_row_key,dataset:name,basis:'exact_api_string',status:'matched',evidence:evidence('inventory',name)}));
 for(const [name,rows] of [['inventory',artifact.inventory],['monthly',artifact.injectionMonthly],['bhp',tests.bhp],['srt',tests.srt],['casing',casing.rows],['plugging',plugging.rows]])for(const row of rows)relations.push(relation({relation:'record_to_source_snapshot',from_kind:KIND[name],from_key:row.source_record_key??row.source_row_key,to_kind:'source_snapshot',to_key:row.source_snapshot_id,dataset:name==='monthly'?'h10':name,basis:'source_file_hash',evidence:evidence(name)}));
 const counts=Object.fromEntries(RELATION_TYPES.map(type=>{const edges=relations.filter(edge=>edge.relation===type),by={};for(const edge of edges){const status=edge.status===null?'null':edge.status;by[status]=(by[status]??0)+1;}return [type,{total:edges.length,by_status:by}];}));
 return {schemaVersion:1,artifactId:artifact.artifactId,catalogue_version:'rrc-relations-v1',scope:{query_version:5,inventory_source_record_key:INV,source_api_id:API},relation_types:[...RELATION_TYPES],
  not_permitted:['API -> H-10','wellbore/API -> BHP or SRT','casing or plugging -> UIC directly','permit -> document','spatial / nearby','bottom location uumf-5r4y -> anything','operator, lease or well-name similarity'],
  status_policy:{inventory_to_h10:'parent_join_status reused as is (matched / unmatched / ambiguous)',needs_review:'reserved; not emitted by catalogue rrc-relations-v1'},counts,relations};
}
function fixture({inventory=[inventoryRow()],monthly=Array.from({length:16},(_,index)=>monthlyRow(index+1)),bhp=[],srt=[],casing,plugging,subjectKey=INV}={}){
 const artifact=attachSources({artifactId:ID,inventory,injectionMonthly:monthly,
  qualityReport:{inventory:counted(inventory,()=> 'accepted'),monthly:counted(monthly,quarantinedRow),parent_join:{matched:monthly.filter(row=>row.parent_join_status==='matched').length,unmatched:monthly.filter(row=>row.parent_join_status==='unmatched').length,ambiguous:monthly.filter(row=>row.parent_join_status==='ambiguous').length},issue_counts:{},dispositions:dispositionList(monthly)},
  dataDictionary:{fields:{permitted_top_depth_ft:{units:'ft'},permitted_bottom_depth_ft:{units:'ft'}}},
  manifest:{artifact_id:ID,scope:{query_version:5,uic_number:UIC,start:'2024-01-01',end:'2026-09-30'},files:{'manifest.json':{sha256:'a'.repeat(64),bytes:1}},sources:[],limitations:[]}});
 const tests=testsDoc(bhp,srt),casingDoc=casing??wellboreDoc('casing',[casingRow(1),casingRow(2)]),pluggingDoc=plugging??wellboreDoc('plugging',[plugRow(1)]);
 return {status:'loaded',artifact,subjectKey,catalogue:buildCatalogue({artifact,tests,casing:casingDoc,plugging:pluggingDoc}),tests,casing:casingDoc,plugging:pluggingDoc,testsDictionary,wellboreDictionary};
}
const tbody=(html,label)=>{const start=html.indexOf(`aria-label="${label}"`);return start<0?'':html.slice(html.indexOf('<tbody>',start),html.indexOf('</tbody>',start));};
const stripPresence=html=>Object.values(PRESENCE).reduce((text,sentence)=>text.split(escapeHtml(sentence)).join(''),html);
const unreconciled=html=>{assert.match(html,/role="alert"/);assert.match(html,/Relation catalogue does not reconcile with this version: /);assert.match(html,/No dossier is shown\./);assert.ok(!html.includes('<table')&&!html.includes('<tr'),'no rows');assert.equal((html.match(/<p /g)??[]).length,1,'only the refusal');};

test('versions without evidence_relations.json (v1, v3, v4, guest) show the not-collected state',()=>{
 for(const files of [{'manifest.json':{}},{'tests.json':{}},{'tests.json':{},'casing.json':{}}])assert.equal(dossierCollected({files}),false);
 assert.equal(dossierCollected(undefined),false);assert.equal(dossierCollected({files:null}),false);assert.equal(dossierCollected({files:{'evidence_relations.json':{}}}),true);
 const html=renderDossierView({status:'not_collected'});assert.ok(html.includes(NOT_COLLECTED));assert.ok(!html.includes('<table'));
 assert.equal(NOT_COLLECTED,'The relation catalogue was not produced for this version. Versions before query version 5 keep their original files unchanged.');
});
test('loading, verification failure and unknown key show no rows',()=>{
 assert.match(renderDossierView({status:'loading'}),/role="status"/);
 const failure=renderDossierView({status:'error',message:'Sidecar evidence_relations.json hash or size mismatch <x>'});assert.match(failure,/role="alert"/);assert.match(failure,/mismatch &lt;x&gt;/);assert.ok(!failure.includes('<table'));
 const unknown=renderDossierView(fixture({subjectKey:'rrc:uic:givw-z9t4:1111111111111111:9'}));
 assert.ok(unknown.includes(`This record is not part of version ${ID}.`));assert.ok(!unknown.includes('<table'));assert.ok(!unknown.includes(INV),'never a fallback to another row');
});
test('a catalogue that does not reconcile is refused before any row is shown',()=>{
 const cases={
  counts:[/counts\.inventory_to_h10\.total/,state=>{state.catalogue.counts.inventory_to_h10.total=15;}],
  by_status:[/by_status/,state=>{state.catalogue.counts.inventory_to_h10.by_status={matched:15,unmatched:1};}],
  unresolved_key:[/does not resolve to a h10_row/,state=>{state.catalogue.relations[0].to_key='rrc:h10:qq2j-f2zm:2222222222222222:99';}],
  kind_confusion:[/not a permitted relation/,state=>{const edge=state.catalogue.relations.find(item=>item.relation==='wellbore_to_casing');edge.from_kind='inventory_record';edge.relation='inventory_to_h10';}],
  wrong_kind_table:[/from_key rrc:uic:\S+ does not resolve to a h10_row/,state=>{state.catalogue.relations.find(item=>item.relation==='record_to_source_snapshot'&&item.from_kind==='inventory_record').from_kind='h10_row';}],
  evidence_hash:[/does not match the verified manifest SHA-256/,state=>{state.catalogue.relations[0].evidence[1].sha256='f'.repeat(64);}],
  evidence_outside_sources:[/not a sources\/ file/,state=>{state.catalogue.relations[0].evidence=[{file:'quality_report.json',sha256:'a'.repeat(64)}];}],
  needs_review:[/needs_review is outside the inventory_to_h10 vocabulary/,state=>{state.catalogue.relations[0].status='needs_review';}],
  unknown_relation:[/outside rrc-relations-v1/,state=>{state.catalogue.relations[0].relation='permit_to_document';}],
  api_to_h10:[/\(inventory_to_h10, wellbore → h10_row\) is not a permitted relation/,state=>{const edge=state.catalogue.relations[0];edge.from_kind='wellbore';edge.from_key=API;}],
  missing_field:[/exactly the 11 relation fields/,state=>{delete state.catalogue.relations[0].reason;}],
  foreign_version:[/artifactId names another version/,state=>{state.catalogue.artifactId='rrc-other';}],
  snapshot_file:[/does not match the record's source file/,state=>{const edge=state.catalogue.relations.find(item=>item.relation==='record_to_source_snapshot'&&item.from_kind==='casing_row');edge.evidence=[{file:FILE.inventory,sha256:state.artifact.manifest.files[FILE.inventory].sha256}];}],
  link_contradiction:[/does not repeat the casing wellbore link/,state=>{state.catalogue.relations.find(item=>item.relation==='inventory_to_wellbore').status='none';}],
  quality_mismatch:[/quality report lists 17 raw/,state=>{state.artifact.qualityReport.monthly.raw=17;}]
 };
 const clean=fixture();assert.equal(reconcileDossier(clean).ok,true,reconcileDossier(clean).reason);
 for(const [name,[reason,mutate]] of Object.entries(cases)){const state=fixture();mutate(state);const check=reconcileDossier(state);assert.equal(check.ok,false,name);assert.match(check.reason,reason,name);unreconciled(renderDossierView(state));}
 const nullable=fixture();nullable.catalogue.counts.record_to_source_snapshot.by_status={};assert.equal(reconcileDossier(nullable).ok,false,'a null status must be counted under "null", as the pipeline writes it');
});
test('the edge table is an accessible table with captions, scoped headers, focusable regions and full SHA-256 evidence',()=>{
 const state=fixture(),html=renderDossierView(state);
 assert.ok(!/<svg[^>]*class="(graph|network)/.test(html),'no graph');
 const regions=[...html.matchAll(/<div class="scroll-table"([^>]*)>/g)].map(match=>match[1]);assert.ok(regions.length>=3);
 for(const attributes of regions){assert.match(attributes,/tabindex="0"/);assert.match(attributes,/role="region"/);assert.match(attributes,/aria-label="[^"]+"/);}
 assert.equal((html.match(/<table>/g)??[]).length,(html.match(/<caption>/g)??[]).length,'every table has a caption');
 assert.ok(!/<th>/.test(html),'every header cell is scoped');assert.match(html,/<th scope="col">Relation<\/th>/);assert.match(html,/<th scope="row">inventory_to_h10<\/th>/);
 assert.ok(html.includes(state.artifact.manifest.files[FILE.monthly].sha256),'full 64-hex hash in text');assert.ok(html.includes(FILE.monthly));
 assert.match(html,/<label for="dossier-relation-filter">Show relation type<\/label><select id="dossier-relation-filter">/);
 for(const type of RELATION_TYPES)assert.ok(html.includes(`<option value="${type}">${type}</option>`),type);
 const main=tbody(html,`Relations of record ${INV}`);
 for(const key of ['rrc:h10:qq2j-f2zm:2222222222222222:16','rrc:casing:u9m4-xnh6:4444444444444444:2','rrc:plugging:wfzn-9fje:5555555555555555:1'])assert.ok(main.includes(key),key);
 assert.ok(main.includes(`href="${nav.datasetRoute(ID,'records')}"`)&&main.includes(`href="${nav.datasetRoute(ID,'wellbore')}"`),'key cells link to the record tabs by route');
 const order=state.catalogue.relations.filter(edge=>edge.relation==='inventory_to_h10').map(edge=>main.indexOf(`<code>${edge.to_key}</code>`));assert.deepEqual([...order].sort((a,b)=>a-b),order,'file order');
 const snapshots=tbody(html,'Source file relations of the related records');assert.equal((snapshots.match(/<tr>/g)??[]).length,1+16+2+1,'record_to_source_snapshot for every related record');
 assert.ok(html.includes(`<dt>Version (artifact ID)</dt><dd>${ID}</dd>`)&&html.includes('<dd>rrc-relations-v1</dd>')&&html.includes(`<dd>${API}</dd>`));
 const filtered=renderDossierView({...state,filter:'wellbore_to_casing'}),only=tbody(filtered,`Relations of record ${INV}`);
 assert.equal((only.match(/<tr>/g)??[]).length,2);assert.ok(!only.includes('inventory_to_h10'));assert.match(filtered,/<option value="wellbore_to_casing" selected>/);
});
test('presence sentences are reused verbatim for wellbore links',()=>{
 const html=renderDossierView(fixture({plugging:wellboreDoc('plugging',[],{status:'none',reason:'no_source_rows'})}));
 assert.ok(html.includes(escapeHtml(PRESENCE.matched)));assert.ok(html.includes(escapeHtml(PRESENCE.plugging_no_source_rows)));
 const none=renderDossierView(fixture({casing:wellboreDoc('casing',[],{status:'none',reason:'api_missing_or_invalid',api:null}),plugging:wellboreDoc('plugging',[],{status:'none',reason:'api_missing_or_invalid',api:null})}));
 assert.equal(none.split(escapeHtml(PRESENCE.api_missing_or_invalid)).length-1,2);assert.ok(!none.includes('<code>null</code>'));
});
test('group counts reconcile with quality evidence; one quarantined H-10 row shows 16 = 15 accepted + 1 quarantined',()=>{
 const html=renderDossierView(fixture());
 assert.ok(html.includes('H-10: 16 related rows = 16 accepted + 0 quarantined (quality report: 16 raw = 16 accepted + 0 quarantined + 0 excluded). Not attributed to this record: 0.'));
 assert.ok(html.includes('Casing: 2 related rows = 2 accepted + 0 quarantined (quality report: 2 raw = 2 accepted + 0 quarantined + 0 excluded)'));
 assert.ok(html.includes('BHP: 0 related rows = 0 accepted + 0 quarantined'));
 const monthly=Array.from({length:16},(_,index)=>monthlyRow(index+1,index===3?{quality_flags:['duplicate:period']}:{}));
 const quarantined=renderDossierView(fixture({monthly}));
 assert.ok(quarantined.includes('H-10: 16 related rows = 15 accepted + 1 quarantined (quality report: 16 raw = 15 accepted + 1 quarantined + 0 excluded)'));
 assert.ok(tbody(quarantined,`Relations of record ${INV}`).includes('rrc:h10:qq2j-f2zm:2222222222222222:4'),'a quarantined row keeps its edge');
});
test('unmatched and ambiguous relations are listed apart with all candidates and never folded into the subject',()=>{
 const monthly=[...Array.from({length:14},(_,index)=>monthlyRow(index+1)),monthlyRow(15,{parent_key:'',parent_join_status:'unmatched',uic_number:'000999999'}),monthlyRow(16,{parent_key:'',parent_join_status:'ambiguous'})];
 const inventory=[inventoryRow(1),inventoryRow(2,{lease_name:'FIXTURE SWD',operator_number:'609265'})];
 const html=renderDossierView(fixture({monthly,inventory}));
 assert.ok(html.includes('H-10: 14 related rows = 14 accepted + 0 quarantined (quality report: 16 raw = 16 accepted + 0 quarantined + 0 excluded). Not attributed to this record: 2.'));
 const apart=tbody(html,'Relations not attributed to this record');assert.ok(apart.includes('rrc:h10:qq2j-f2zm:2222222222222222:15')&&apart.includes('rrc:h10:qq2j-f2zm:2222222222222222:16'));
 assert.ok(!tbody(html,`Relations of record ${INV}`).includes('rrc:h10:qq2j-f2zm:2222222222222222:16'));
 const candidates=tbody(html,'Candidates for inventory_to_h10 1');
 for(const ordinal of [1,2])assert.ok(candidates.includes(`href="${escapeHtml(nav.datasetRoute(ID,'dossier',`rrc:uic:givw-z9t4:1111111111111111:${ordinal}`))}"`),'inventory rows of this version are links');
});
test('an ambiguous wellbore link is not selectable: candidates listed, same-name permits never merged or linked, rows apart',()=>{
 const candidates=[candidate(INV,true),candidate('rrc:uic:givw-z9t4:9999999999999999:1',false,{uic_number:'000099999'})];
 const casing=wellboreDoc('casing',[casingRow(1,{wellbore_link_status:'ambiguous'})],{status:'ambiguous',reason:'multiple_inventory_rows',candidates});
 const plugging=wellboreDoc('plugging',[],{status:'ambiguous',reason:'multiple_inventory_rows',candidates});
 const html=renderDossierView(fixture({casing,plugging}));
 assert.ok(html.includes(escapeHtml(PRESENCE.ambiguous)));
 assert.ok(!tbody(html,`Relations of record ${INV}`).includes('rrc:casing:'),'wellbore rows are not folded into the subject');
 const apart=tbody(html,'Relations not attributed to this record');assert.ok(apart.includes('rrc:casing:u9m4-xnh6:4444444444444444:1'));assert.match(apart,/<td>ambiguous<\/td><td>multiple_inventory_rows<\/td>/);
 const listed=tbody(html,'Candidates for inventory_to_wellbore 1');
 assert.match(listed,/<tr class="selected"><th scope="row"><a href="[^"]+">/);assert.match(listed,/Selected inventory row/);
 assert.ok(listed.includes('<code>rrc:uic:givw-z9t4:9999999999999999:1</code>')&&!listed.includes('dossier/rrc%3Auic%3Agivw-z9t4%3A9999999999999999'),'the same-name permit is listed but never linked');
 assert.ok(!listed.includes('FIXTURE SWD')&&!listed.includes('609265'),'no lease name or operator matching or display');
 assert.ok(html.includes('Casing: 0 related rows = 0 accepted + 0 quarantined (quality report: 1 raw = 1 accepted + 0 quarantined + 0 excluded). Not attributed to this record: 1.'));
 assert.ok(html.includes(`Rows for API ${API}, not attributed to this UIC`),'ladder lists the rows apart');
});
test('rendering writes nothing: state objects stay unchanged and the modules have no I/O',async()=>{
 const state=fixture(),before=JSON.stringify(state);
 const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};
 freeze(state);renderDossierView(state);renderDossierView({...state,filter:'inventory_to_h10'});reconcileDossier(state);assert.equal(JSON.stringify(state),before);
 for(const file of ['../public/dossier-view.js','../public/depth-ladder.js']){const code=await readFile(new URL(file,import.meta.url),'utf8');for(const word of ['fetch(','indexedDB','localStorage','saveVerifiedPackage','method:'])assert.ok(!code.includes(word),`${file} ${word}`);}
});
test('no rendered state or shell text states casing, plugging, compliance, safety or communication conclusions',async()=>{
 const candidates=[candidate(INV,true),candidate('rrc:uic:givw-z9t4:9999999999999999:1',false)];
 const states=[renderDossierView({status:'not_collected'}),renderDossierView({status:'loading'}),renderDossierView({status:'error',message:'x'}),renderDossierView(fixture()),
  renderDossierView(fixture({plugging:wellboreDoc('plugging',[],{status:'none',reason:'no_source_rows'})})),
  renderDossierView(fixture({casing:wellboreDoc('casing',[casingRow(1)],{status:'ambiguous',reason:'multiple_inventory_rows',candidates}),plugging:wellboreDoc('plugging',[],{status:'ambiguous',reason:'multiple_inventory_rows',candidates})})),
  renderDossierView(fixture({casing:wellboreDoc('casing',[],{status:'none',reason:'api_missing_or_invalid',api:null}),plugging:wellboreDoc('plugging',[],{status:'none',reason:'api_missing_or_invalid',api:null})}))];
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const shell=index.slice(index.indexOf('<section id="dossier-view"'),index.indexOf('<section id="quality-view"'));assert.ok(shell.includes('id="dossier-content"'));
 for(const html of [...states,shell]){const text=stripPresence(html).toLowerCase();for(const word of FORBIDDEN)assert.ok(!text.includes(word),`${word} in ${html.slice(0,80)}`);}
});
test('routes: the dossier key round-trips encoded; only the dossier tab takes a third segment; invalid keys are rejected',()=>{
 assert.equal(nav.datasetRoute(ID,'dossier'),`#dataset/${ID}/dossier`);assert.deepEqual(nav.parseRoute(`#dataset/${ID}/dossier`),{screen:'workspace',artifactId:ID,tab:'dossier'});
 const route=nav.datasetRoute(ID,'dossier',INV);assert.equal(route,`#dataset/${ID}/dossier/rrc%3Auic%3Agivw-z9t4%3A1111111111111111%3A1`);
 assert.deepEqual(nav.parseRoute(route),{screen:'workspace',artifactId:ID,tab:'dossier',recordKey:INV});
 assert.deepEqual(nav.parseRoute(`#dataset/${ID}/dossier/${INV}`),nav.parseRoute(route),'a typed bookmark with raw colons opens the same subject');
 for(const hash of [`#dataset/${ID}/records/${encodeURIComponent(INV)}`,`#dataset/${ID}/wellbore/x`,`#dataset/${ID}/dossier/%E0%A4%A`,`#dataset/${ID}/dossier/has%20space`,`#dataset/${ID}/dossier/%2Fslash`,`#dataset/${ID}/dossier/a/b`,`#dataset/${ID}/dossier/`])assert.deepEqual(nav.parseRoute(hash),{screen:'datasets'},hash);
 assert.throws(()=>nav.datasetRoute(ID,'records',INV),/record key/);assert.throws(()=>nav.datasetRoute(ID,'dossier','bad key'),/record key/);
 assert.deepEqual(nav.parseRoute(`#dataset/${ID}/wellbore`),{screen:'workspace',artifactId:ID,tab:'wellbore'},'other tabs keep their shape');
});

// Browser integration: the app.js harness of test/wellbore-view.test.mjs with the dossier exports injected.
async function startUI({artifact,hash,sidecars=new Map()}){
 const nodes=new Map(),handlers={};
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(){},removeAttribute(){},appendChild(){},focus(){},querySelectorAll(){return [];},replaceChildren(){this.textContent='';this.innerHTML='';},insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}});return nodes.get(id);};
 const pins={artifactId:artifact.artifactId,path:`/artifacts/${artifact.artifactId}/`,defaultPinned:true,manifestSha256:'a'.repeat(64),normalizedSha256:'b'.repeat(64)};
 const requests=[],fetch=async(path,options)=>{requests.push({path,options});if(sidecars.has(path)){const bytes=sidecars.get(path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return {ok:true,json:async()=>path==='/artifact-path.json'?{artifact_id:artifact.artifactId,path:pins.path}:path==='/artifact-integrity.json'?pins:{versions:[pins]}};};
 const location={hash},saved=[];
 const env={document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},window:{addEventListener:(name,handler)=>{handlers[name]=handler;},scrollTo(){},matchMedia:()=>({matches:false})},location,fetch,loadPinnedArtifact:async()=>artifact,loadVerifiedVersion:async()=>artifact,mountCollection(){},createLatestRequest,clearDatasetEvidence,historyState,...nav,chart:()=>'',fmt:formatNumber,escape:escapeHtml,mountWorkflow:async()=>({refresh(){},forDataset(){},showHistory(){},clearDataset(){}}),facts,filterInventory,dispositionRows,sourceUrl,countText,
  createAnalyticsHandoff:()=>({start(){},cancel(){},destroy(){}}),PORTFOLIO_URL:'',createLegacyCollectionApi:()=>({}),createGuestCollectionApi:()=>({}),createGuestClient:()=>({}),
  listSavedPackages:async()=>[],saveVerifiedPackage:async value=>{saved.push(value);},verifyVersionPackage:async()=>{},loadVerifiedSidecar:(a,i,name,impl)=>integrityModule.loadVerifiedSidecar(a,i,name,impl??fetch),renderTestsView,testReportsCollected,renderWellboreView,wellboreCollected,renderDossierView,dossierCollected};
 env.document.querySelector=selector=>selector.startsWith('meta[')?null:element(selector);
 const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 await new AsyncFunction(...Object.keys(env),code)(...Object.values(env));
 const settle=async()=>{for(let attempt=0;attempt<200&&/Verifying (test-report|casing and plugging|the relation catalogue)/.test(element('tests-content').innerHTML+element('wellbore-content').innerHTML+element('dossier-content').innerHTML);attempt++)await new Promise(resolve=>setTimeout(resolve,5));};
 await settle();
 return {element,requests,saved,navigate:async next=>{location.hash=next;handlers.hashchange();await new Promise(resolve=>setTimeout(resolve,0));await settle();}};
}
const original=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url)));
// A v5 fixture version derived from the committed v1 normalized bytes (5 inventory rows, 28 matched H-10 rows).
function versionArtifact({tamper}={}){
 const artifact=attachSources(structuredClone(original));artifact.artifactId=ID;artifact.manifest.artifact_id=ID;artifact.manifest.scope.query_version=5;
 const subject=artifact.inventory.find(row=>row.uic_number===artifact.manifest.scope.uic_number),api=subject.api_no;
 const casing=wellboreDoc('casing',[casingRow(1,{source_api_id:api,api_no:api})],{api,inventoryKey:subject.source_record_key,candidates:[candidate(subject.source_record_key,true,{api_no:api})]}),plugging=wellboreDoc('plugging',[],{status:'none',reason:'no_source_rows',api,inventoryKey:subject.source_record_key,candidates:[candidate(subject.source_record_key,true,{api_no:api})]});
 const tests=testsDoc();
 const catalogue=buildCatalogue({artifact,tests,casing,plugging}),encoder=new TextEncoder();
 const bodies=new Map([['tests.json',tests],['tests_dictionary.json',testsDictionary],['casing.json',casing],['plugging.json',plugging],['wellbore_dictionary.json',wellboreDictionary],['evidence_relations.json',catalogue]].map(([name,value])=>[name,encoder.encode(JSON.stringify(value,null,2)+'\n')]));
 for(const [name,bytes] of bodies)artifact.manifest.files[name]={sha256:sha(bytes),bytes:bytes.length};
 if(tamper){const bytes=new Uint8Array(bodies.get(tamper));bytes[20]^=1;bodies.set(tamper,bytes);}
 return {artifact,subject,sidecars:new Map([...bodies].map(([name,bytes])=>[`/artifacts/${ID}/${name}`,bytes]))};
}
test('a v1 version opens the Dossier tab as not collected',async()=>{
 const ui=await startUI({artifact:original,hash:`#dataset/${original.artifactId}/dossier`});
 assert.equal(ui.element('dossier-view').hidden,false);assert.equal(ui.element('wellbore-view').hidden,true);assert.ok(ui.element('dossier-content').innerHTML.includes(NOT_COLLECTED));
 assert.ok(!ui.element('downloads').innerHTML.includes('download="evidence_relations.json"'));
});
test('the Records link, the Overview action and a typed bookmark open the same (artifactId, source_record_key) under the same version header',async()=>{
 const {artifact,subject,sidecars}=versionArtifact();
 const records=await startUI({artifact,hash:`#dataset/${ID}/records`,sidecars});
 const link=/href="(#dataset\/[^"]+\/dossier\/[^"]+)">Open dossier<\/a>/.exec(records.element('record-provenance').innerHTML)?.[1];assert.ok(link,'Records well details link to the keyed dossier');
 const overview=/href="(#dataset\/[^"]+\/dossier\/[^"]+)">Open dossier<\/a>/.exec(records.element('overview-actions').innerHTML)?.[1];assert.equal(overview,link);
 assert.deepEqual(nav.parseRoute(link),{screen:'workspace',artifactId:ID,tab:'dossier',recordKey:subject.source_record_key});
 await records.navigate(link);const fromLink=records.element('dossier-content').innerHTML;
 const bookmark=await startUI({artifact,hash:`#dataset/${ID}/dossier/${subject.source_record_key}`,sidecars});const fromBookmark=bookmark.element('dossier-content').innerHTML;
 assert.ok(fromLink.includes(`Record ${subject.source_record_key}`),fromLink.slice(0,400));assert.equal(fromBookmark,fromLink);
 assert.equal(records.element('workspace-version').textContent,ID);assert.equal(bookmark.element('workspace-version').textContent,ID);
 assert.ok(fromLink.includes('H-10: 28 related rows = 28 accepted + 0 quarantined'));assert.ok(fromLink.includes(escapeHtml(PRESENCE.matched)));
 assert.equal(bookmark.element('dossier-view').hidden,false);assert.ok(bookmark.element('downloads').innerHTML.includes('download="evidence_relations.json"'));
 assert.ok(bookmark.requests.every(request=>!request.options),'only plain verified GETs');assert.equal(bookmark.saved.length,0,'nothing saved');
});
test('another inventory row of the version is a separate subject; a key outside the version is refused without fallback',async()=>{
 const {artifact,sidecars}=versionArtifact(),other=artifact.inventory[1].source_record_key;
 const ui=await startUI({artifact,hash:nav.datasetRoute(ID,'dossier',other),sidecars});
 const html=ui.element('dossier-content').innerHTML;assert.ok(html.includes(`Record ${other}`));assert.ok(html.includes('H-10: 0 related rows = 0 accepted + 0 quarantined (quality report: 28 raw'));
 await ui.navigate(`#dataset/${ID}/dossier/rrc:uic:givw-z9t4:0000000000000000:7`);
 assert.equal(ui.element('dossier-content').innerHTML,renderDossierView({status:'unknown_key',artifactId:ID}));
});
test('a tampered evidence_relations.json is refused with no rows',async()=>{
 const {artifact,sidecars}=versionArtifact({tamper:'evidence_relations.json'});
 const ui=await startUI({artifact,hash:`#dataset/${ID}/dossier`,sidecars});
 const html=ui.element('dossier-content').innerHTML;assert.match(html,/role="alert"/);assert.match(html,/mismatch/i);assert.ok(!html.includes('<table'));assert.ok(!html.includes('rrc:h10:'));
});
