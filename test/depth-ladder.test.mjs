// RRC-15 / E11a reported-depth ladder (Phase 3b spec §8, §9 tests 8-9). Every row here is a synthetic fixture built
// from the Phase 2/3 sidecar shapes; the committed wellbore_dictionary.json is read only to cross-check unit labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ladderEntries,renderLadder,LANES,AXIS_LABEL,CODE_NOTE} from '../public/depth-ladder.js';
import {escapeHtml} from '../public/inspection.js';

const TRIPPET=new URL('../artifacts/rrc-2026-10-29-uic000109605-70983258-9751-4e79-bb78-1a1cb7068e14/',import.meta.url);
const committed=JSON.parse(await readFile(new URL('wellbore_dictionary.json',TRIPPET),'utf8'));
const testsDictionary=JSON.parse(await readFile(new URL('tests_dictionary.json',TRIPPET),'utf8'));
const dataDictionary={fields:{permitted_top_depth_ft:{units:'ft'},permitted_bottom_depth_ft:{units:'ft'}}};
const API='38910201',INV='rrc:uic:givw-z9t4:1111111111111111:1';
const inventory={source_record_key:INV,uic_number:'000020838',api_no:API,permitted_top_depth_ft:4000,permitted_bottom_depth_ft:8000,quality_flags:[]};
const common=(dataset,ordinal)=>({source_row_key:`rrc:${dataset}:${dataset==='casing'?'u9m4-xnh6':'wfzn-9fje'}:abc:${ordinal}`,source_api_id:API,wellbore_link_status:'matched',source_id:String(9000+ordinal),api_no:API,record_sequence:'1',on_top_record:null});
const casingRow=(ordinal,extra={})=>({...common('casing',ordinal),completion_date_text:'2001-05-06T00:00:00.000',csg_size:9.625,hole_size:12.25,csg_depth:1547,toc:0,multi_stg_depth:null,cmt_sacks:600,total_depth_g1w2:5000,depth_reference:2849,depth_reference_code:'KB',source_snapshot_id:'u9m4-xnh6:abc',quality_flags:[],...extra});
const plugRow=(ordinal,extra={})=>({...common('plugging',ordinal),w3_date_text:'2025-02-03T00:00:00.000',plug_top_depth:100,plug_bottom_depth:200,plug_cmt_sacks:40,total_depth_w3:6515,depth_reference:null,depth_reference_code:'GL',source_snapshot_id:'wfzn-9fje:abc',quality_flags:[],...extra});
const bhpRow=(ordinal,extra={})=>({source_row_key:`rrc:bhp:qxfy-wcfs:abc:${ordinal}`,parent_key:INV,parent_join_status:'matched',bhp_psia:2150.5,test_depth_ft:5000,tested_formation:'SAN ANDRES',quality_flags:[],...extra});
const srtRow=(ordinal,extra={})=>({source_row_key:`rrc:srt:h54t-xnbi:def:${ordinal}`,parent_key:INV,parent_join_status:'matched',top_perf_ft:4000,bottom_perf_ft:4200,formation_tested:'DEVONIAN',quality_flags:[],...extra});
function dispositions(rows,quarantined=[]){
 const map=new Map([[`inventory\u0000${INV}`,{disposition:'accepted'}]]);
 for(const [lane,list] of Object.entries(rows))for(const row of list)map.set(`${lane}\u0000${row.source_row_key}`,quarantined.includes(row.source_row_key)?{disposition:'quarantined',reasons:[...row.quality_flags]}:{disposition:'accepted'});
 return map;
}
function ladder({casing=[casingRow(1)],plugging=[plugRow(1)],bhp=[],srt=[],attributed=true,wellboreDictionary=committed,quarantined=[]}={}){
 const entries=ladderEntries({inventory,dataDictionary,testsDictionary,wellboreDictionary,bhp,srt,casing:{rows:casing,attributed},plugging:{rows:plugging,attributed},dispositions:dispositions({casing,plugging,bhp,srt},quarantined)});
 return {entries,html:renderLadder(entries)};
}
const find=(entries,key,field)=>entries.find(entry=>entry.recordKey===key&&entry.field===field);
const tbodies=html=>[...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map(match=>match[1]);
const rowCount=html=>tbodies(html).reduce((total,body)=>total+(body.match(/<tr[ >]/g)??[]).length,0);
const marks=html=>(html.match(/<circle |<rect /g)??[]).length;

test('missing csg_depth is "Not reported" with no mark; a published zero toc is drawn at 0',()=>{
 const {entries,html}=ladder({casing:[casingRow(1,{csg_depth:null})]});
 const missing=find(entries,'rrc:casing:u9m4-xnh6:abc:1','csg_depth');
 assert.equal(missing.value,null);assert.equal(missing.intervalStatus,'Not reported');assert.equal(missing.drawn,false);assert.deepEqual(missing.marks,[]);
 const zero=find(entries,'rrc:casing:u9m4-xnh6:abc:1','toc');assert.equal(zero.value,0);assert.equal(zero.drawn,true);assert.deepEqual(zero.marks,[{at:0}]);
 assert.match(html,/<td>csg_depth<\/td><td>Not reported<\/td>/);assert.match(html,/<td>toc<\/td><td>0<\/td>/);
});
test('duplicate record_sequence rows are all listed in source order; on_top_record "not set" stays distinct from true',()=>{
 const rows=[casingRow(1,{record_sequence:'1',on_top_record:null}),casingRow(2,{record_sequence:'1',on_top_record:true})];
 const {entries,html}=ladder({casing:rows});
 const csg=entries.filter(entry=>entry.field==='csg_depth');assert.equal(csg.length,2);assert.deepEqual(csg.map(entry=>entry.recordKey),rows.map(row=>row.source_row_key));
 assert.deepEqual(csg.map(entry=>[entry.recordSequence,entry.onTopRecord]),[['1','not set'],['1','true']]);
 assert.ok(html.includes('1 / not set')&&html.includes('1 / true'));assert.ok(csg.every(entry=>entry.drawn),'nothing is collapsed or chosen as latest');
});
test('a malformed plug interval (top 4629 > bottom 4508) is listed, not drawn and never swapped',()=>{
 const {entries,html}=ladder({plugging:[plugRow(1,{plug_top_depth:4629,plug_bottom_depth:4508})]});
 const entry=find(entries,'rrc:plugging:wfzn-9fje:abc:1','plug_top_depth – plug_bottom_depth');
 assert.equal(entry.top,4629);assert.equal(entry.bottom,4508);assert.equal(entry.drawn,false);assert.deepEqual(entry.marks,[]);
 assert.equal(entry.intervalStatus,'Malformed interval: top exceeds bottom as reported');
 assert.ok(html.includes('<td>4629 – 4508</td>'),'ends shown in published order');assert.ok(!html.includes('4508 – 4629'));
});
test('an interval with one end missing draws the present end as a point labelled "interval end missing"',()=>{
 const {entries}=ladder({plugging:[plugRow(1,{plug_bottom_depth:null})],srt:[srtRow(1,{top_perf_ft:null})]});
 const plug=find(entries,'rrc:plugging:wfzn-9fje:abc:1','plug_top_depth – plug_bottom_depth');
 assert.equal(plug.intervalStatus,'interval end missing');assert.equal(plug.drawn,true);assert.deepEqual(plug.marks,[{at:100}]);
 const srt=find(entries,'rrc:srt:h54t-xnbi:def:1','top_perf_ft – bottom_perf_ft');assert.deepEqual(srt.marks,[{at:4200}]);assert.equal(srt.intervalStatus,'interval end missing');
});
test('unit-less fields are listed with the unit verbatim or "unit not stated" and are not drawn',()=>{
 const removed=structuredClone(committed);delete removed.fields.csg_depth;
 const first=ladder({wellboreDictionary:removed});const entry=find(first.entries,'rrc:casing:u9m4-xnh6:abc:1','csg_depth');
 assert.equal(entry.unit,null);assert.equal(entry.drawn,false);assert.match(entry.why,/unit not stated/);assert.match(first.html,/<td>csg_depth<\/td><td>1547<\/td><td>unit not stated<\/td>/);
 const stated=structuredClone(committed);stated.fields.toc.units='not stated by the source';
 const second=ladder({wellboreDictionary:stated});const toc=find(second.entries,'rrc:casing:u9m4-xnh6:abc:1','toc');
 assert.equal(toc.unit,'not stated by the source');assert.equal(toc.drawn,false);assert.ok(second.html.includes('<td>not stated by the source</td>'));
});
test('depth_reference is never a ladder entry and no value is converted or derived',()=>{
 const {entries,html}=ladder({bhp:[bhpRow(1)],srt:[srtRow(1)]});
 assert.ok(entries.every(entry=>!/depth_reference(?!_code)/.test(entry.field)));assert.ok(!html.includes('<td>2849</td>'),'the elevation is never placed');
 assert.ok(html.includes(AXIS_LABEL));assert.match(html,/toz\/boz and inventory prod_casing_pkr_depth/);
 assert.ok(!/TVD conversion|true vertical depth =|datum corrected/i.test(html));
});
test('BHP tested_formation appears only as the label of the same row\'s test_depth_ft; without a depth it is listed, not drawn',()=>{
 const {entries,html}=ladder({bhp:[bhpRow(1),bhpRow(2,{test_depth_ft:null,tested_formation:'ELLENBURGER'})]});
 assert.ok(entries.every(entry=>entry.field!=='tested_formation'&&entry.field!=='formation_tested'),'no formation entries or tops');
 const first=find(entries,'rrc:bhp:qxfy-wcfs:abc:1','test_depth_ft'),second=find(entries,'rrc:bhp:qxfy-wcfs:abc:2','test_depth_ft');
 assert.equal(first.name,'SAN ANDRES');assert.equal(first.drawn,true);assert.equal(second.name,'ELLENBURGER');assert.equal(second.drawn,false);
 assert.ok(html.includes('test_depth_ft (tested_formation: SAN ANDRES)'));assert.ok(html.includes('test_depth_ft (tested_formation: ELLENBURGER)'));
});
test('every entry value equals the sidecar value; every drawn entry has a table row and rows equal entries',()=>{
 const casing=[casingRow(1),casingRow(2,{csg_depth:null,toc:'4000300.0'})],plugging=[plugRow(1),plugRow(2,{plug_top_depth:4629,plug_bottom_depth:4508})],bhp=[bhpRow(1)],srt=[srtRow(1)];
 const {entries,html}=ladder({casing,plugging,bhp,srt});
 const source=new Map([[INV,inventory],...[...casing,...plugging,...bhp,...srt].map(row=>[row.source_row_key,row])]);
 for(const entry of entries){
  const row=source.get(entry.recordKey);
  if(entry.shape==='point')assert.equal(entry.value,row[entry.field],entry.field);
  else{const [top,bottom]=entry.field.split(' – ');assert.equal(entry.top,row[top]);assert.equal(entry.bottom,row[bottom]);}
 }
 assert.equal(rowCount(html),entries.length,'one table row per entry');
 const drawn=entries.filter(entry=>entry.drawn);assert.equal(marks(html),drawn.reduce((total,entry)=>total+entry.marks.length,0),'one mark per drawn value');
 for(const entry of drawn)assert.ok(html.includes(`<th scope="row">${entry.recordKey}</th>`));
 assert.match(html,new RegExp(`aria-label="${drawn.length} reported depths drawn, ${entries.length-drawn.length} listed only"`));
 assert.match(html,/<svg class="depth-ladder"[^>]*role="img"/);
 const order=entries.map(entry=>LANES.findIndex(lane=>lane.lane===entry.lane));assert.deepEqual([...order].sort((a,b)=>a-b),order,'ladder order is lane order');
 assert.equal(find(entries,'rrc:casing:u9m4-xnh6:abc:2','toc').drawn,false,'a non-numeric published value is listed, not drawn');
});
test('quarantined rows are listed with disposition and reasons, not drawn',()=>{
 const row=plugRow(1,{quality_flags:['duplicate_source_id']});
 const {entries,html}=ladder({plugging:[row],quarantined:[row.source_row_key]});
 const listed=entries.filter(entry=>entry.recordKey===row.source_row_key);assert.ok(listed.length===2&&listed.every(entry=>!entry.drawn&&entry.disposition==='quarantined'));
 assert.ok(html.includes('quarantined (duplicate_source_id)'));
});
test('rows under an ambiguous link go to a separate table and are not drawn for the subject',()=>{
 const {entries,html}=ladder({attributed:false});
 const wellbore=entries.filter(entry=>entry.lane==='casing'||entry.lane==='plugging');assert.ok(wellbore.length&&wellbore.every(entry=>!entry.drawn&&!entry.attributed));
 assert.ok(html.includes(`Rows for API ${API}, not attributed to this UIC`));
 const [main,separate]=tbodies(html);assert.ok(!main.includes('rrc:casing:'));assert.ok(separate.includes('rrc:casing:u9m4-xnh6:abc:1'));
 assert.equal(rowCount(html),entries.length);
});
test('reference codes are verbatim with the undocumented note; dataset without codes says so',()=>{
 const {html,entries}=ladder({casing:[casingRow(1,{depth_reference_code:'<b>X9</b>'})],bhp:[bhpRow(1)]});
 assert.ok(html.includes(`&lt;b&gt;X9&lt;/b&gt; · ${CODE_NOTE}`));assert.ok(!html.includes('<b>X9'));
 assert.equal(find(entries,'rrc:bhp:qxfy-wcfs:abc:1','test_depth_ft').referenceCode,'not supplied by this dataset');
 assert.ok(html.includes(escapeHtml(committed.fields.depth_reference_code.note)),'dictionary note shown verbatim');assert.match(html,/GL, DF, KB, RT and GR are CONFIRMED elevation reference points \(WBA091 p\.2-15\)/);
 assert.equal(find(entries,INV,'permitted_top_depth_ft – permitted_bottom_depth_ft').unitLabel,'as named in data_dictionary.json; no page citation recorded');
});
test('unit labels: toc and total_depth_w3 INFERRED, the five form-cited fields CONFIRMED, matching the committed dictionary',()=>{
 const {entries}=ladder({casing:[casingRow(1,{multi_stg_depth:900})]});
 const label=field=>entries.find(entry=>entry.field===field).unitLabel;
 for(const field of ['toc','total_depth_w3']){assert.match(label(field),/^INFERRED/);assert.match(committed.fields[field].units,/\(INFERRED\)/);}
 for(const field of ['csg_depth','multi_stg_depth','total_depth_g1w2']){assert.match(label(field),/^CONFIRMED/);assert.equal(committed.fields[field].units,'ft');}
 assert.match(label('plug_top_depth – plug_bottom_depth'),/^CONFIRMED/);for(const field of ['plug_top_depth','plug_bottom_depth'])assert.equal(committed.fields[field].units,'ft');
 for(const entry of entries.filter(entry=>entry.lane==='casing'||entry.lane==='plugging')){const field=entry.shape==='point'?entry.field:entry.field.split(' – ')[0];assert.equal(entry.unit,committed.fields[field].units,'unit verbatim from the dictionary');}
});
test('the ladder module performs no I/O and writes nothing',async()=>{
 const code=await readFile(new URL('../public/depth-ladder.js',import.meta.url),'utf8');
 for(const word of ['fetch(','indexedDB','localStorage','saveVerifiedPackage','method:'])assert.ok(!code.includes(word),word);
 const state={inventory,dataDictionary,testsDictionary,wellboreDictionary:committed,bhp:[bhpRow(1)],srt:[],casing:{rows:[casingRow(1)],attributed:true},plugging:{rows:[plugRow(1)],attributed:true},dispositions:new Map()};
 const before=JSON.stringify(state);renderLadder(ladderEntries(state));assert.equal(JSON.stringify(state),before);
});
