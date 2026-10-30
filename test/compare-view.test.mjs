// RRC-16 compare screen (Phase 4 spec §7, §9 Task 2). Fixtures are built only from the spec §6 result shape;
// no Task 1 code (public/version-compare.js) is imported. compareVersions is a stub in the app harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderCompareView,compareEntry,compareOptions,compareFailure,compareSide,collectedAt,orderSides,OUTCOMES,OUTCOME_LABELS,FIXED_SENTENCE,CALCULATED_SENTENCE,ONLY_LISTED,noOtherVersion} from '../public/compare-view.js';
import * as compareView from '../public/compare-view.js';
import * as nav from '../public/navigation.js';
import {facts,filterInventory,dispositionRows,sourceUrl,countText} from '../public/presentation.js';
import {clearDatasetEvidence,historyState} from '../public/dataset-state.js';
import {createLatestRequest} from '../public/collection.js';
import {escapeHtml,formatNumber} from '../public/inspection.js';
import {renderTestsView,testReportsCollected} from '../public/tests-view.js';
import {renderWellboreView,wellboreCollected} from '../public/wellbore-view.js';
import {renderDossierView,dossierCollected} from '../public/dossier-view.js';
import * as integrityModule from '../public/artifact-integrity.js';

const A='rrc-cmp-fixture-a',B='rrc-cmp-fixture-b',SHA_A='0123456789abcdef'.repeat(4),SHA_B='fedcba9876543210'.repeat(4);
const BANNED=['improved','corrected','correction','fixed','updated','better','worse','regression','revised','error in','wrong','deleted','removed','added','compliant','violation','safe','latest','newer','older',
 'non-compliant','plugged and abandoned','not plugged','properly','adequate','communication','most recent'];
// Verbatim manifest field names (source_revisions keys) are source values, not page wording (spec §7.3).
const VERBATIM=['inventory_rows_updated_at','monthly_rows_updated_at'];
const stripVerbatim=html=>VERBATIM.reduce((text,word)=>text.split(word).join(''),html);

const quality=(raw,quarantined=0)=>({raw,parsed:raw,accepted:raw-quarantined,quarantined,excluded:0});
const row=(outcome,key,a,b,extra={})=>({outcome,key,a,b,fields:[],flags:null,disposition:null,reason:null,...extra});
// A §6 result: every outcome, a not_comparable dataset per reason family, sources in one or both versions.
function fixture(){
 const side=(id,collected,end,query)=>({artifact_id:id,query_version:query,transformation_version:'rrc-transform-fixture',window:{start:'2024-01-01',end},collected_at:collected});
 const h10Rows=[
  row('same',{uic_number:'000020838',period_start:'2024-01-01'},['rrc:monthly:a:1'],['rrc:monthly:b:1'],{flags:{a:[],b:[]},disposition:{a:'accepted',b:'accepted'}}),
  row('identity_differs',{uic_number:'000020838',period_start:'2024-02-01'},['rrc:monthly:a:2'],['rrc:monthly:b:2'],{fields:[{field:'source_report_id',identity:true,a:'3775425',b:'3777861'}],flags:{a:[],b:[]},disposition:{a:'accepted',b:'accepted'}}),
  row('values_differ',{uic_number:'000020838',period_start:'2024-03-01'},['rrc:monthly:a:3'],['rrc:monthly:b:3'],{fields:[{field:'injected_gas_mcf',identity:false,a:null,b:0},{field:'injected_liquid_bbl',identity:false,a:'1',b:1}],flags:{a:[],b:['missing:pressure']},disposition:{a:'accepted',b:'quarantined'}}),
  row('only_in_a',{uic_number:'000020838',period_start:'2024-04-01'},['rrc:monthly:a:4'],[],{flags:{a:[],b:null},disposition:{a:'accepted',b:null}}),
  row('only_in_b',{uic_number:'000020838',period_start:'2024-05-01'},[],['rrc:monthly:b:5']),
  row('outside_other_scope',{uic_number:'000020838',period_start:'2026-08-01'},[],['rrc:monthly:b:6'],{reason:'outside the other version\'s reporting window'}),
  row('multiple_rows',{uic_number:'000020838',period_start:'2024-06-01'},['rrc:monthly:a:7','rrc:monthly:a:8'],['rrc:monthly:b:9'],{reason:'2 rows in A, 1 row in B'})];
 const counts=rows=>Object.fromEntries(OUTCOMES.map(outcome=>[outcome,rows.filter(item=>item.outcome===outcome).length]));
 const inventoryRows=[row('same',{uic_number:'000020838'},['rrc:inventory:a:1'],['rrc:inventory:b:1']),row('outside_other_scope',{uic_number:'000022085'},['rrc:inventory:a:2'],[],{reason:'outside the other version\'s inventory query'})];
 const relationRows=[row('values_differ',{relation:'inventory_to_h10',status:'matched'},[],[],{fields:[{field:'by_status',identity:false,a:16,b:17}]})];
 const notComparable=(dataset,reason)=>({dataset,comparable:false,reason,key:[],identity_fields:[],coverage:{a:null,b:null},quality:null,counts:counts([]),rows:[]});
 return {schemaVersion:1,comparison_version:'rrc-compare-v1',uic_number:'000020838',
  sides:{a:side(A,'2026-10-10T08:00:00.000Z',null,null),b:side(B,'2026-10-29T08:00:00.000Z','2026-09-30',3)},
  datasets:[
   {dataset:'inventory',comparable:true,reason:null,key:['uic_number'],identity_fields:[],coverage:{a:{rows:2},b:{rows:1}},quality:{a:quality(2),b:quality(1),parent_join:null,issue_counts:[],paired_rows_with_qc_change:0},counts:counts(inventoryRows),rows:inventoryRows},
   {dataset:'h10',comparable:true,reason:null,key:['uic_number','period_start'],identity_fields:['source_report_id'],coverage:{a:{rows:7,distinct_months:6,first:'2024-01-01',last:'2024-06-01',window:{start:'2024-01-01',end:null}},b:{rows:7,distinct_months:7,first:'2024-01-01',last:'2026-08-01',window:{start:'2024-01-01',end:'2026-09-30'}}},
    quality:{a:quality(7),b:quality(7,1),parent_join:{a:{matched:7,unmatched:0,ambiguous:0},b:{matched:7,unmatched:0,ambiguous:0}},issue_counts:[{flag:'missing:pressure',a:0,b:1}],paired_rows_with_qc_change:1},counts:counts(h10Rows),rows:h10Rows},
   notComparable('bhp','not_collected_in_either'),
   {dataset:'srt',comparable:true,reason:null,key:['source_report_id','tracking_no'],identity_fields:[],coverage:{a:{rows:0,srt_status:'confirmed_empty'},b:{rows:0,srt_status:'confirmed_empty'}},quality:{a:quality(0),b:quality(0),parent_join:{a:{matched:0},b:{matched:0}},issue_counts:[],paired_rows_with_qc_change:0},counts:counts([]),rows:[]},
   notComparable('casing','different_source_api_id'),notComparable('plugging','not_queried_in_a'),
   {dataset:'relations',comparable:true,reason:null,key:['relation','status'],identity_fields:[],coverage:{a:{relations:16},b:{relations:17}},quality:null,counts:counts(relationRows),rows:relationRows}],
  sources:[
   {name:'candidate-monthly',kind:'monthly',class:'data',a:{sha256:SHA_A,bytes:100,url:'https://data.example/monthly?a',retrieved_at:'2026-10-10T08:00:00.000Z',etag:null,last_modified:null,http_status:200},b:{sha256:SHA_A,bytes:100,url:'https://data.example/monthly?b',retrieved_at:'2026-10-29T08:00:00.000Z',etag:'"e1"',last_modified:null,http_status:200},bytes_equal:true},
   {name:'monthly-metadata',kind:'metadata',class:'metadata',a:{sha256:SHA_A,bytes:50,url:'https://data.example/meta',retrieved_at:'2026-10-10T08:00:00.000Z',etag:null,last_modified:null,http_status:200},b:{sha256:SHA_B,bytes:51,url:'https://data.example/meta',retrieved_at:'2026-10-29T08:00:00.000Z',etag:null,last_modified:null,http_status:200},bytes_equal:false},
   {name:'wellbore-inventory',kind:'wellbore_inventory',class:'selection',a:null,b:{sha256:SHA_B,bytes:9,url:'https://data.example/w',retrieved_at:'2026-10-29T08:00:00.000Z',etag:null,last_modified:null,http_status:200},bytes_equal:null}],
  source_revisions:{a:{inventory_rows_updated_at:1,monthly_rows_updated_at:2},b:{inventory_rows_updated_at:3,monthly_rows_updated_at:2}}};
}
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;};
const tables=html=>html.match(/<table>[\s\S]*?<\/table>/g)??[];
const tbodyRows=html=>html.match(/<tr data-outcome="[^"]+">[\s\S]*?<\/tr>/g)??[];
const noDownload=html=>{assert.ok(!/\sdownload[\s=>]/i.test(html),'no download attribute');assert.ok(!html.includes('?download=1'));assert.ok(!/href="[^"]*\/download/.test(html));};

test('states: loading, refused (each reason), error and loaded; refused and error show no rows',()=>{
 assert.match(renderCompareView({status:'loading'}),/role="status"/);
 const refusals=[ONLY_LISTED,'the two versions belong to different UICs (000020838 and 000109605)','the two artifact IDs are equal','a sidecar artifactId does not match'];
 for(const reason of refusals){const html=renderCompareView({status:'refused',reason});assert.match(html,/role="alert"/);assert.ok(html.includes(escapeHtml(reason)),reason);assert.ok(!html.includes('<table'));assert.ok(!html.includes('data-outcome'));assert.ok(!html.includes('..'),'one full stop after the reason');}
 const error=renderCompareView({status:'error',message:'Selected version hash mismatch <x>'});
 assert.match(error,/role="alert"/);assert.ok(error.includes('Comparison unavailable: Selected version hash mismatch &lt;x&gt;. No differences are shown.'));assert.ok(!error.includes('<table'));
 assert.equal(renderCompareView({status:'loaded'}),renderCompareView({status:'error',message:'unknown failure'}),'a loaded state without a result fails closed');
 const html=renderCompareView({status:'loaded',result:fixture()});
 assert.ok(html.includes(escapeHtml(FIXED_SENTENCE)));assert.ok(html.includes(escapeHtml(CALCULATED_SENTENCE)));assert.ok(html.includes('UIC 000020838'));
 assert.ok(html.includes(`href="#dataset/${A}/overview"`)&&html.includes(`href="#dataset/${B}/overview"`),'each side links to its own version');
 assert.ok(html.includes('A · collected earlier')&&html.includes('B · collected later'));assert.ok(html.includes('2026-10-10T08:00:00.000Z'));
 assert.ok(html.includes('v1 shape, no query version'));assert.ok(html.includes('from 2024-01, no end stated'));assert.ok(html.includes('2024-01 – 2026-09'));
});
test('not comparable datasets read as not comparable, never as missing, and list no rows',()=>{
 const html=renderCompareView({status:'loaded',result:fixture()});
 for(const text of ['Not comparable: not collected in either version','Not comparable: the two versions queried different source API numbers','Not comparable: not queried in A'])assert.ok(html.includes(escapeHtml(text)),text);
 const bhp=html.slice(html.indexOf('id="compare-dataset-bhp"'),html.indexOf('id="compare-dataset-srt"'));assert.ok(!bhp.includes('data-outcome'));assert.ok(!/only in/i.test(bhp));
 assert.ok(html.includes('Neither version has rows for this dataset.'),'comparable 0/0 dataset');
});
test('the version-picker entry offers only other server-listed versions of the same verified UIC',()=>{
 const verified=new Map([[A,{manifest:{scope:{uic_number:'000020838'}}}],[B,{manifest:{scope:{uic_number:'000020838'}}}],['rrc-cmp-other',{manifest:{scope:{uic_number:'000109605'}}}]]);
 const versions=[{artifactId:A},{artifactId:B},{artifactId:'rrc-cmp-other'}];
 assert.deepEqual(compareEntry({artifactId:A,versions,verified}),{uic:'000020838',candidates:[B],note:null});
 const alone=compareEntry({artifactId:'rrc-cmp-other',versions,verified});assert.deepEqual(alone.candidates,[]);assert.equal(alone.note,noOtherVersion('000109605'));assert.equal(alone.note,'No other preserved version of UIC 000109605.');
 assert.match(compareEntry({artifactId:'rrc-cmp-other',versions,verified,pending:1}).note,/^Verifying/);
 assert.deepEqual(compareEntry({artifactId:A,versions,verified,listed:false}),{uic:null,candidates:[],note:ONLY_LISTED});
 assert.equal(compareOptions([B]),`<option value="${B}">${B}</option>`);
});
test('refusal classification, side order and side assembly',()=>{
 const coded=Object.assign(Error('different UIC'),{code:'COMPARE_REFUSED'});assert.deepEqual(compareFailure(coded),{status:'refused',reason:'different UIC'});
 assert.deepEqual(compareFailure(Object.assign(Error('same version'),{name:'COMPARE_REFUSED'})),{status:'refused',reason:'same version'});
 assert.deepEqual(compareFailure(Error('COMPARE_REFUSED: sidecar dataset mismatch')),{status:'refused',reason:'sidecar dataset mismatch'});
 assert.deepEqual(compareFailure(Error('Sidecar tests.json hash or size mismatch')),{status:'error',message:'Sidecar tests.json hash or size mismatch'});
 const early={artifactId:'z',collected_at:'2026-10-09T00:00:00Z'},late={artifactId:'a',collected_at:'2026-10-29T00:00:00Z'};
 assert.deepEqual(orderSides(late,early),[early,late]);assert.deepEqual(orderSides(early,late),[early,late]);
 const tieA={artifactId:'a',collected_at:'2026-10-29T00:00:00Z'},tieB={artifactId:'b',collected_at:'2026-10-29T00:00:00Z'};assert.deepEqual(orderSides(tieB,tieA),[tieA,tieB],'ties break by artifact ID');
 assert.equal(collectedAt({sources:[{name:'candidate-inventory',retrieved_at:'x'},{name:'candidate-monthly',retrieved_at:'2026-10-10T00:00:00Z'}]}),'2026-10-10T00:00:00Z');assert.throws(()=>collectedAt({sources:[]}),/unavailable/);
 assert.deepEqual(compareSide({artifactId:A},{tests:{artifactId:A}}),{artifactId:A,tests:{artifactId:A},casing:null,plugging:null,relations:null});
});
test('tables: captions, scoped headers, focusable named regions, full SHA-256 and outcome text in every row',()=>{
 const html=renderCompareView({status:'loaded',result:fixture()}),all=tables(html);
 assert.ok(all.length>=8);for(const table of all)assert.match(table,/^<table><caption>[^<]/,'every table has a caption first');
 assert.ok(!/<th(?=[\s>])(?![^>]*scope="(col|row)")[^>]*>/.test(html),'every th is scoped');
 const regions=html.match(/<div class="scroll-table"[^>]*>/g)??[];assert.equal(regions.length,all.length,'every table sits in a region');
 for(const region of regions){assert.match(region,/tabindex="0"/);assert.match(region,/role="region"/);assert.match(region,/aria-label="[^"]+"/);}
 assert.ok(html.includes(SHA_A)&&html.includes(SHA_B),'full SHA-256 in text');
 const rows=tbodyRows(html);assert.equal(rows.length,10);
 for(const item of rows){const outcome=/data-outcome="([^"]+)"/.exec(item)[1];assert.ok(item.includes(escapeHtml(OUTCOME_LABELS[outcome])),outcome);}
 for(const label of ['Same values','Same values, different report identity','Values differ','Only in A','Only in B','Outside the other version&#39;s scope','Several rows share this key (not row-matched)'])assert.ok(html.includes(label)||html.includes(label.replace('&#39;',"'")),label);
 assert.ok(html.includes('null → 0'),'null and 0 stay distinct');assert.ok(html.includes('&quot;1&quot; → 1'),'"1" and 1 stay distinct');
 assert.ok(html.includes('<small>(identity)</small>'),'identity field marked');assert.equal(html.split('quality_flags differ').length,2,'only the paired row with different flags');assert.ok(html.includes('B no row in B'),'a single-side row names the absent side');
 assert.ok(html.includes('Same bytes')&&html.includes('Different bytes')&&html.includes(`Not collected in A (${A})`));assert.ok(html.includes('Same response bytes; row references are identical.'));
 assert.match(html,/<details class="compare-same"><summary>Same values: 1 row<\/summary>/,'same rows fold with their count');
 assert.ok(html.includes('<label for="compare-filter-dataset">')&&html.includes('<label for="compare-filter-outcome">'));
});
test('filters change only the visible rows; the state is unchanged and no download is offered',()=>{
 const state=deepFreeze({status:'loaded',result:fixture()}),before=JSON.stringify(state);
 const all=renderCompareView(state),byDataset=renderCompareView({...state,filter:{dataset:'h10',outcome:''}}),byOutcome=renderCompareView({...state,filter:{dataset:'',outcome:'values_differ'}}),sameOnly=renderCompareView({...state,filter:{dataset:'h10',outcome:'same'}});
 assert.equal(tbodyRows(all).length,10);
 assert.ok(!byDataset.includes('id="compare-dataset-inventory"')&&byDataset.includes('id="compare-dataset-h10"'));assert.equal(tbodyRows(byDataset).length,7);
 assert.deepEqual([...new Set(tbodyRows(byOutcome).map(item=>/data-outcome="([^"]+)"/.exec(item)[1]))],['values_differ']);assert.equal(tbodyRows(byOutcome).length,2);
 assert.match(sameOnly,/<details class="compare-same" open>/);assert.equal(tbodyRows(sameOnly).length,1);
 assert.ok(byOutcome.includes('Showing 2 of 10 compared rows.'));assert.ok(all.includes('Showing 10 of 10 compared rows.'));
 assert.ok(byOutcome.includes('<option value="values_differ" selected>'));
 for(const html of [all,byDataset,byOutcome,sameOnly]){noDownload(html);assert.ok(html.includes('Summary by dataset'),'summary stays complete');}
 assert.equal(JSON.stringify(state),before);
});
test('wording: no banned word in any rendered state, entry note or the page shell',async()=>{
 const result=fixture(),states=[renderCompareView({status:'loading'}),renderCompareView({status:'refused',reason:ONLY_LISTED}),renderCompareView({status:'refused',reason:'the two versions belong to different UICs (000020838 and 000109605)'}),renderCompareView({status:'error',message:'Selected version hash mismatch'}),
  renderCompareView({status:'loaded',result}),...OUTCOMES.map(outcome=>renderCompareView({status:'loaded',result,filter:{dataset:'',outcome}})),
  noOtherVersion('000056484'),ONLY_LISTED,compareEntry({artifactId:A,versions:[{artifactId:A}],verified:new Map([[A,{manifest:{scope:{uic_number:'1'}}}]]),pending:1}).note];
 const index=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const shell=index.slice(index.indexOf('<section id="compare-view"'),index.indexOf('<div id="dataset-workspace"')),picker=index.slice(index.indexOf('<details class="version-picker">'),index.indexOf('</details>',index.indexOf('<details class="version-picker">')));
 assert.ok(shell.includes('id="compare-title"')&&shell.includes('id="compare-content"'));assert.match(shell,/^<section id="compare-view" class="view" aria-labelledby="compare-title" hidden>/);
 assert.ok(picker.includes('<label for="compare-selection">Compare with another version of UIC <span id="compare-uic"></span></label><select id="compare-selection"></select><a id="compare-open"'));
 for(const html of [...states,shell,picker]){const text=stripVerbatim(html).toLowerCase();for(const word of BANNED)assert.ok(!text.includes(word),`${word} in ${html.slice(0,80)}`);}
 for(const html of states)noDownload(html);
});
test('routes: compareRoute and parseRoute round-trip; equal, invalid or extra segments are refused',()=>{
 assert.equal(nav.compareRoute(A,B),`#compare/${A}/${B}`);assert.deepEqual(nav.parseRoute(nav.compareRoute(A,B)),{screen:'compare',a:A,b:B});
 assert.deepEqual(nav.parseRoute('#compare/rrc%2Dcmp.v_1/rrc-cmp.v_2'),{screen:'compare',a:'rrc-cmp.v_1',b:'rrc-cmp.v_2'},'encoded IDs decode');
 assert.deepEqual(nav.parseRoute(nav.compareRoute('rrc-cmp.v_1','rrc-cmp.v_2')),{screen:'compare',a:'rrc-cmp.v_1',b:'rrc-cmp.v_2'});
 for(const hash of [`#compare/${A}/${A}`,`#compare/${A}`,`#compare/${A}/${B}/x`,`#compare/../${B}`,`#compare/a%2Fb/${B}`,`#compare/%E0%A4%A/${B}`,`#compare/${A}/has%20space`,'#compare//'])assert.deepEqual(nav.parseRoute(hash),{screen:'datasets'},hash);
 assert.throws(()=>nav.compareRoute(A,A),/comparison/i);assert.throws(()=>nav.compareRoute('../x',B),/comparison/i);assert.throws(()=>nav.compareRoute(A,null),/comparison/i);
});
test('static scan: the compare renderer has no network, storage, method or comparison-module import',async()=>{
 const code=await readFile(new URL('../public/compare-view.js',import.meta.url),'utf8');
 for(const word of ['fetch(','import(','localStorage','sessionStorage','indexedDB','XMLHttpRequest','method:','saveVerifiedPackage','version-compare','download'])assert.ok(!code.includes(word),word);
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/^import \{compareVersions\} from '\.\/version-compare\.js';$/m,'app.js imports compareVersions per the §6 contract');
});

// App harness (the public/app.js pattern of test/dossier-view.test.mjs) with compareVersions stubbed.
const original=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function later(id,{uic,retrieved='2026-10-29T08:00:00.000Z',tests}={}){
 const artifact=structuredClone(original);artifact.artifactId=id;artifact.manifest.artifact_id=id;if(uic)artifact.manifest.scope.uic_number=uic;
 for(const source of artifact.manifest.sources)if(source.name==='candidate-monthly')source.retrieved_at=retrieved;
 const sidecars=new Map();
 if(tests){const bytes=new TextEncoder().encode(JSON.stringify(tests.doc));artifact.manifest.files['tests.json']={sha256:sha(bytes),bytes:bytes.length};const served=new Uint8Array(bytes);if(tests.tamper)served[3]^=1;sidecars.set(`/artifacts/${id}/tests.json`,served);}
 return {artifact,sidecars};
}
async function startUI({hash,versions,compare,failVerify=new Set()}){
 const nodes=new Map(),handlers={},requests=[],replaced=[],calls=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(){},removeAttribute(){},appendChild(){},focus(){this.focused=(this.focused??0)+1;},querySelectorAll(){return [];},replaceChildren(){this.textContent='';this.innerHTML='';},insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}});return nodes.get(id);};
 const pin=artifact=>({artifactId:artifact.artifactId,path:`/artifacts/${artifact.artifactId}/`,classification:'public_reported',defaultPinned:artifact.artifactId===original.artifactId,manifestSha256:'a'.repeat(64),normalizedSha256:'b'.repeat(64)});
 const byId=new Map(versions.map(item=>[item.artifact.artifactId,item])),sidecars=new Map(versions.flatMap(item=>[...(item.sidecars??new Map())]));
 const fetch=async(path,options)=>{requests.push({path,options});if(sidecars.has(path)){const bytes=sidecars.get(path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return {ok:true,json:async()=>path==='/artifact-path.json'?{artifact_id:original.artifactId,path:`/artifacts/${original.artifactId}/`}:path==='/artifact-integrity.json'?pin(original):{versions:versions.filter(item=>item.listed!==false).map(item=>pin(item.artifact))}};};
 const location={hash};
 const env={document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},window:{addEventListener:(name,handler)=>{handlers[name]=handler;},scrollTo(){},matchMedia:()=>({matches:false})},location,fetch,
  loadPinnedArtifact:async()=>original,loadVerifiedVersion:async pins=>{if(GATES.has(pins.artifactId))await GATES.get(pins.artifactId);if(failVerify.has(pins.artifactId))throw Error('Selected version hash mismatch');const item=byId.get(pins.artifactId);if(!item)throw Error('Selected version evidence unavailable');return item.artifact;},
  mountCollection(){},createLatestRequest,clearDatasetEvidence,historyState,...nav,chart:()=>'',fmt:formatNumber,escape:escapeHtml,mountWorkflow:async()=>({refresh(){},forDataset(){},showHistory(){},clearDataset(){}}),facts,filterInventory,dispositionRows,sourceUrl,countText,
  createAnalyticsHandoff:()=>({start(){},cancel(){},destroy(){}}),PORTFOLIO_URL:'',createLegacyCollectionApi:()=>({}),createGuestCollectionApi:()=>({}),createGuestClient:()=>({}),
  listSavedPackages:async()=>[],saveVerifiedPackage:async()=>{throw Error('nothing is saved');},verifyVersionPackage:async()=>{},loadVerifiedSidecar:(a,i,name,impl)=>integrityModule.loadVerifiedSidecar(a,i,name,impl??fetch),
  renderTestsView,testReportsCollected,renderWellboreView,wellboreCollected,renderDossierView,dossierCollected,...compareView,
  compareVersions:(a,b)=>{calls.push([a,b]);return compare?compare(a,b):fixture();},history:{state:null,replaceState(state,title,url){replaced.push(url);location.hash=url;}}};
 env.document.querySelector=selector=>selector.startsWith('meta[')?null:element(selector);
 const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 await new AsyncFunction(...Object.keys(env),code)(...Object.values(env));
 const settle=async()=>{for(let attempt=0;attempt<200&&(element('compare-content').innerHTML.includes('Verifying both versions')||/Verifying (test-report|casing)/.test(element('tests-content').innerHTML+element('wellbore-content').innerHTML));attempt++)await new Promise(resolve=>setTimeout(resolve,5));};
 await settle();
 return {element,requests,replaced,calls,location,navigate:async next=>{location.hash=next;handlers.hashchange();await new Promise(resolve=>setTimeout(resolve,0));await settle();}};
}
const V1=original.artifactId;
// Holds a version's verification open until the test releases it (stale-result guard tests).
const GATES=new Map();
const gate=()=>{let open;const promise=new Promise(resolve=>{open=resolve;});return {promise,open};};
test('app: the reversed route is rewritten to the earlier collection as A, then compared once',async()=>{
 const b=later(B);const ui=await startUI({hash:`#compare/${B}/${V1}`,versions:[{artifact:original},b]});
 assert.deepEqual(ui.replaced,[`#compare/${V1}/${B}`],'canonical order, replaceState only');assert.equal(ui.location.hash,`#compare/${V1}/${B}`);
 assert.equal(ui.calls.length,1);assert.equal(ui.calls[0][0].artifactId,V1);assert.equal(ui.calls[0][1].artifactId,B);
 assert.equal(ui.element('compare-view').hidden,false);assert.equal(ui.element('dataset-workspace').hidden,true);
 assert.ok(ui.element('compare-content').innerHTML.includes(escapeHtml(FIXED_SENTENCE)));assert.ok(ui.element('compare-title').focused>=1,'focus moves to the heading');
 assert.ok(ui.requests.every(request=>!request.options),'only plain GETs');
 assert.ok(ui.requests.every(request=>['/artifact-path.json','/artifact-integrity.json','/api/versions'].includes(request.path)||request.path.startsWith('/artifacts/')),'same-origin artifact and registry reads only');
 const canonical=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},b]});assert.deepEqual(canonical.replaced,[],'canonical order is left as is');assert.equal(canonical.calls[0][0].artifactId,V1);
});
test('app: filters re-render visible rows only and never recompute or change the result',async()=>{
 const result=deepFreeze(fixture()),before=JSON.stringify(result);
 const ui=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B)],compare:()=>result});
 assert.equal(tbodyRows(ui.element('compare-content').innerHTML).length,10);
 ui.element('compare-filter-outcome').value='only_in_b';ui.element('compare-filter-outcome').handlers.change();
 const filtered=ui.element('compare-content').innerHTML;assert.equal(tbodyRows(filtered).length,1);assert.ok(filtered.includes('data-outcome="only_in_b"'));noDownload(filtered);
 assert.equal(ui.calls.length,1,'filters never recompute');assert.equal(JSON.stringify(result),before);
 await ui.navigate('#datasets');assert.equal(ui.element('compare-view').hidden,true);assert.equal(ui.element('compare-content').innerHTML,'');
});
test('app: unlisted, different-UIC and unverifiable pairs are refused or fail closed without a comparison',async()=>{
 const unlisted=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},{...later(B),listed:false}]});
 assert.ok(unlisted.element('compare-content').innerHTML.includes(escapeHtml(ONLY_LISTED)));assert.equal(unlisted.calls.length,0);
 const other=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B,{uic:'000109605'})]});
 assert.match(other.element('compare-content').innerHTML,/role="alert"[^>]*>Comparison refused: the two versions belong to different UICs/);assert.equal(other.calls.length,0);
 const failed=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B)],failVerify:new Set([B])});
 const html=failed.element('compare-content').innerHTML;assert.ok(html.includes('Comparison unavailable: Selected version hash mismatch. No differences are shown.'));assert.ok(!html.includes('<table'));assert.equal(failed.calls.length,0);
 const refused=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B)],compare:()=>{throw Object.assign(Error('sidecar dataset mismatch'),{code:'COMPARE_REFUSED'});}});
 assert.match(refused.element('compare-content').innerHTML,/Comparison refused: sidecar dataset mismatch\. No rows are shown\./);assert.ok(!refused.element('compare-content').innerHTML.includes('<table'));
});
test('app: sidecars are verified against each manifest; a tampered or foreign tests.json shows no rows',async()=>{
 const doc={artifactId:B,bhp:[],srt:[]};
 const good=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B,{tests:{doc}})]});
 assert.equal(good.calls.length,1);assert.deepEqual(good.calls[0][1].tests,doc);assert.equal(good.calls[0][0].tests,null,'a side without tests.json carries none');
 const tampered=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B,{tests:{doc,tamper:true}})]});
 assert.match(tampered.element('compare-content').innerHTML,/Comparison unavailable: Sidecar tests\.json hash or size mismatch/);assert.equal(tampered.calls.length,0);
 const foreign=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B,{tests:{doc:{...doc,artifactId:V1}}})]});
 assert.match(foreign.element('compare-content').innerHTML,/Comparison unavailable: tests\.json version identity mismatch/);assert.equal(foreign.calls.length,0);
});
test('app: the version picker offers same-UIC server-listed versions, or says none exists',async()=>{
 const ui=await startUI({hash:`#dataset/${V1}/overview`,versions:[{artifact:original},later(B),later('rrc-cmp-other',{uic:'000109605'})]});
 for(let attempt=0;attempt<100&&!ui.element('compare-selection').innerHTML;attempt++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(ui.element('compare-selection').innerHTML,compareOptions([B]));assert.equal(ui.element('compare-uic').textContent,'000020838');
 assert.equal(ui.element('compare-controls').hidden,false);assert.equal(ui.element('compare-none').hidden,true);assert.equal(ui.element('compare-open').href,`#compare/${V1}/${B}`);
 const alone=await startUI({hash:`#dataset/${V1}/overview`,versions:[{artifact:original},later('rrc-cmp-other',{uic:'000109605'})]});
 for(let attempt=0;attempt<100&&alone.element('compare-none').textContent!==noOtherVersion('000020838');attempt++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(alone.element('compare-none').textContent,noOtherVersion('000020838'));assert.equal(alone.element('compare-controls').hidden,true);
});
test('app: a pair that finishes verifying after navigation to another pair is never shown',async t=>{
 t.after(()=>GATES.clear());const held=gate();GATES.set(B,held.promise);const C='rrc-cmp-fixture-c';
 const ui=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B),later(C)],compare:(a,b)=>({...fixture(),uic_number:'MARK-'+b.artifactId})});
 await ui.navigate(`#compare/${V1}/${C}`);assert.ok(ui.element('compare-content').innerHTML.includes('MARK-'+C));
 held.open();await new Promise(resolve=>setTimeout(resolve,50));
 const html=ui.element('compare-content').innerHTML;assert.ok(html.includes('MARK-'+C));assert.ok(!html.includes('MARK-'+B),'the earlier pair is never shown');
 assert.deepEqual(ui.calls.map(call=>call[1].artifactId),[C]);
});
test('app: a pair that finishes verifying after leaving the compare screen renders nothing',async t=>{
 t.after(()=>GATES.clear());const held=gate();GATES.set(B,held.promise);
 const ui=await startUI({hash:`#compare/${V1}/${B}`,versions:[{artifact:original},later(B)],compare:(a,b)=>({...fixture(),uic_number:'MARK-'+b.artifactId})});
 await ui.navigate('#datasets');held.open();await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(ui.element('compare-content').innerHTML,'');assert.equal(ui.calls.length,0);assert.equal(ui.element('compare-view').hidden,true);
});
