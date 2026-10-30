// RRC-16 Task 1: pure comparison module, fed by committed bytes through the browser's own verified loaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadVerifiedVersion,loadVerifiedSidecar} from '../public/artifact-integrity.js';
import {compareVersions,COMPARISON_KEYS,IDENTITY_FIELDS,NEVER_COMPARED,COMPARED_FIELDS,CONTRACT_COLUMNS,DATASETS,OUTCOMES,ROW_REASONS,REFUSAL_REASONS} from '../public/version-compare.js';
import {inventoryColumns,monthlyColumns} from '../src/normalize.mjs';
import {testColumns} from '../src/testReports.mjs';
import {wellboreColumns} from '../src/wellbore.mjs';

const root=new URL('../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const V1='rrc-2026-10-09-uic000020838-v1',V2='rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0',V3='rrc-2026-10-29-uic000020838-a8606089-cd03-4c22-9161-11dd443331a8',V4='rrc-2026-10-29-uic000020838-903b89ff-452c-422c-87cf-ae3e4260b733';
const P4='rrc-2026-10-29-uic000109605-70983258-9751-4e79-bb78-1a1cb7068e14',P5='rrc-2026-10-30-uic000109605-b7628a71-03fe-4a16-928c-033353e1fce0';
const T3='rrc-2026-10-29-uic000111186-fbee3ba0-9d68-4572-9331-7a545cbbade7',T4='rrc-2026-10-29-uic000111186-b477a317-a6bb-4ab9-b059-ac2e5d61b12d';
const N3='rrc-2026-10-29-uic000119875-b911ce3c-2d6d-430e-bee0-8b3cb8cc7465',N4='rrc-2026-10-29-uic000119875-edce4598-1396-49f0-9829-96271fa93249';
const SIDECARS=[['tests','tests.json'],['casing','casing.json'],['plugging','plugging.json'],['relations','evidence_relations.json']];

// Committed bytes from disk, served as the browser would request them (no network).
const diskFetch=(override={})=>async path=>{
 if(Object.hasOwn(override,path))return new Response(override[path]);
 const match=/^\/artifacts\/([a-z0-9][a-z0-9._-]{0,127})\/((?:sources\/)?[a-z0-9][a-z0-9._-]*)$/i.exec(path);
 if(!match)return new Response('not found',{status:404});
 try{return new Response(await readFile(new URL(`artifacts/${match[1]}/${match[2]}`,root)));}catch{return new Response('not found',{status:404});}
};
// Pins exactly as scripts/serve.mjs builds them: the pinned v1 from public/artifact-integrity.json, others from version-pins.json.
async function allPins(){
 const integrity=JSON.parse(await readFile(new URL('public/artifact-integrity.json',root))),pins=new Map([[integrity.artifactId,{...integrity,path:`/artifacts/${integrity.artifactId}/`,classification:'public_reported',defaultPinned:true}]]);
 for(const name of (await readdir(new URL('artifacts/',root))).sort()){if(pins.has(name))continue;let bytes;try{bytes=await readFile(new URL(`artifacts/${name}/version-pins.json`,root));}catch{continue;}pins.set(name,{...JSON.parse(bytes),defaultPinned:false});}
 return pins;
}
const pinsPromise=allPins();
async function loadSide(id,fetchImpl=diskFetch()){
 const pins=(await pinsPromise).get(id),artifact=await loadVerifiedVersion(pins,fetchImpl),side={...artifact};
 for(const [property,name] of SIDECARS){
  if(!Object.hasOwn(artifact.manifest.files,name)){side[property]=null;continue;}
  side[property]=JSON.parse(new TextDecoder().decode(await loadVerifiedSidecar(artifact,pins,name,fetchImpl)));
 }
 return side;
}
const sideCache=new Map(),side=id=>{if(!sideCache.has(id))sideCache.set(id,loadSide(id));return sideCache.get(id);};
async function samePairs(){
 const ids=[...(await pinsPromise).keys()].sort(),loaded=await Promise.all(ids.map(side)),pairs=[];
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)if(loaded[i].manifest.scope.uic_number===loaded[j].manifest.scope.uic_number)pairs.push([ids[i],ids[j]]);
 return pairs;
}

// Mirror of a result: every a/b pair swapped, only_in_a<->only_in_b and *_in_a<->*_in_b reasons flipped.
const flip=text=>typeof text==='string'?text.replace(/_in_a$/,'_in_\u0000').replace(/_in_b$/,'_in_a').replace(/_in_\u0000$/,'_in_b'):text;
function swapSides(value){
 if(Array.isArray(value))return value.map(swapSides);
 if(value===null||typeof value!=='object')return flip(value);
 const out={};
 for(const [key,item] of Object.entries(value)){
  const target=key==='a'&&Object.hasOwn(value,'b')?'b':key==='b'&&Object.hasOwn(value,'a')?'a':flip(key);
  out[target]=swapSides(item);
 }
 return out;
}
const ds=(result,name)=>result.datasets.find(item=>item.dataset===name);
const nonZero=counts=>Object.fromEntries(Object.entries(counts).filter(([,count])=>count));
// Every compare call in the fixtures is also checked for determinism and exact mirror symmetry.
function run(a,b){
 const result=compareVersions(a,b);
 assert.equal(JSON.stringify(compareVersions(a,b)),JSON.stringify(result));
 assert.deepEqual(compareVersions(b,a),swapSides(result));
 return result;
}
const clone=value=>structuredClone(value);

test('nine committed same-UIC pairs exist',async()=>{
 const pairs=await samePairs();
 assert.equal(pairs.length,9);
 assert.equal(pairs.filter(([a])=>a.includes('uic000020838')).length,6);
});

test('000020838 v1 vs v2: inventory candidates outside the v2 query, H-10 identical, other datasets not collected',async()=>{
 const r=run(await side(V1),await side(V2));
 assert.equal(r.uic_number,'000020838');
 assert.deepEqual(r.sides.a,{artifact_id:V1,query_version:null,transformation_version:'rrc-odp-v1.0.0',window:{start:'2024-01-01',end:null},collected_at:'2026-10-09T11:11:48.192Z'});
 assert.equal(r.sides.b.query_version,2);assert.deepEqual(r.sides.b.window,{start:'2024-01-01',end:'2026-04-30'});
 const inventory=ds(r,'inventory');
 assert.deepEqual(nonZero(inventory.counts),{same:1,outside_other_scope:4});
 const outside=inventory.rows.filter(row=>row.outcome==='outside_other_scope');
 assert.deepEqual(outside.map(row=>row.key.uic_number),['000022085','000039655','000039709','000048561']);
 for(const row of outside){assert.equal(row.reason,ROW_REASONS.outside_inventory_query);assert.equal(row.a.length,1);assert.deepEqual(row.b,[]);}
 assert.deepEqual(nonZero(ds(r,'h10').counts),{same:28});
 for(const name of ['bhp','srt','casing','plugging','relations']){const d=ds(r,name);assert.equal(d.comparable,false);assert.equal(d.reason,'not_collected_in_either');assert.deepEqual(d.rows,[]);}
 const monthly=r.sources.find(source=>source.name==='candidate-monthly');
 assert.equal(monthly.bytes_equal,true);assert.equal(monthly.class,'data');assert.notEqual(monthly.a.url,monthly.b.url);
});

test('000020838 v2 vs v3: all 28 reissued H-10 report IDs read as identity differences, never removed plus added',async()=>{
 const r=run(await side(V2),await side(V3)),h10=ds(r,'h10');
 assert.deepEqual(nonZero(h10.counts),{identity_differs:28});
 assert.equal(h10.counts.values_differ,0);assert.equal(h10.counts.only_in_a,0);assert.equal(h10.counts.only_in_b,0);
 for(const row of h10.rows){assert.equal(row.fields.length,1);assert.equal(row.fields[0].field,'source_report_id');assert.equal(row.fields[0].identity,true);assert.notEqual(row.fields[0].a,row.fields[0].b);}
 // Row references differ on every row: they are version-local and never a key.
 assert.ok(h10.rows.every(row=>row.a[0]!==row.b[0]));
 assert.deepEqual(h10.key,['uic_number','period_start']);assert.deepEqual(h10.identity_fields,['source_report_id']);
 // Rows are in key order, not source position.
 const periods=h10.rows.map(row=>row.key.period_start);assert.deepEqual(periods,[...periods].sort());
});

test('000020838 v3 vs v4: H-10 same, empty BHP/SRT comparable, wellbore not collected in v3, eight v4-only sources',async()=>{
 const r=run(await side(V3),await side(V4));
 assert.deepEqual(nonZero(ds(r,'h10').counts),{same:28});
 for(const name of ['bhp','srt']){const d=ds(r,name);assert.equal(d.comparable,true);assert.equal(d.rows.length,0);assert.equal(d.coverage.a.status,'confirmed_empty');assert.equal(d.coverage.b.status,'confirmed_empty');assert.equal(d.coverage.a.row_count,0);}
 for(const name of ['casing','plugging']){const d=ds(r,name);assert.equal(d.comparable,false);assert.equal(d.reason,'not_collected_in_a');assert.equal(d.coverage.a,null);assert.equal(d.quality.a,null);}
 const onlyB=r.sources.filter(source=>source.a===null);
 assert.equal(onlyB.length,8);
 assert.deepEqual(onlyB.map(source=>source.name),['candidate-casing','candidate-plugging','casing-metadata','form-w2.pdf','form-w3.pdf','plugging-metadata','wellbore-inventory','wellbore-wba091.pdf']);
 assert.ok(onlyB.every(source=>source.bytes_equal===null));
});

test('000020838 v1 vs v4: H-10 report identity differs on all 28 rows; v1 window has no end',async()=>{
 const r=run(await side(V1),await side(V4)),h10=ds(r,'h10');
 assert.deepEqual(nonZero(h10.counts),{identity_differs:28});
 assert.equal(r.sides.a.window.end,null);assert.equal(h10.coverage.a.window.end,null);assert.equal(h10.coverage.b.window.end,'2026-09-30');
 assert.equal(h10.coverage.a.distinct_months,28);assert.equal(h10.coverage.a.first_period,'2024-01-01');
});

test('000109605 v4 vs v5: every dataset same; relations not collected in v4; data bytes equal, metadata bytes differ',async()=>{
 const r=run(await side(P4),await side(P5));
 const expected={inventory:1,h10:16,casing:9,plugging:7};
 for(const [name,count] of Object.entries(expected))assert.deepEqual(nonZero(ds(r,name).counts),{same:count},name);
 for(const name of ['bhp','srt'])assert.deepEqual(nonZero(ds(r,name).counts),{});
 assert.equal(ds(r,'relations').comparable,false);assert.equal(ds(r,'relations').reason,'not_collected_in_a');
 assert.ok(r.sources.filter(source=>source.class==='data').every(source=>source.bytes_equal===true));
 const differ=r.sources.filter(source=>source.bytes_equal===false).map(source=>source.name);
 assert.deepEqual(differ,['bhp-metadata','casing-metadata','inventory-metadata','monthly-metadata','plugging-metadata','srt-metadata']);
 assert.equal(ds(r,'casing').coverage.a.source_api_id,'38934609');
});

test('000111186 v3 vs v4: BHP 8 same with missing report_received_date 5 on both sides',async()=>{
 const r=run(await side(T3),await side(T4)),bhp=ds(r,'bhp');
 assert.deepEqual(nonZero(bhp.counts),{same:8});
 assert.deepEqual(bhp.quality.issue_counts.find(item=>item.flag==='missing:report_received_date'),{flag:'missing:report_received_date',a:5,b:5});
 assert.deepEqual(bhp.quality.parent_join,{a:{matched:8,unmatched:0,ambiguous:0},b:{matched:8,unmatched:0,ambiguous:0}});
});

test('000119875 v3 vs v4: SRT 98 same with 22 quarantined rows on both sides and no QC delta',async()=>{
 const r=run(await side(N3),await side(N4)),srt=ds(r,'srt');
 assert.deepEqual(nonZero(srt.counts),{same:98});
 assert.equal(srt.quality.a.quarantined,22);assert.equal(srt.quality.b.quarantined,22);
 assert.equal(srt.rows.filter(row=>row.disposition.a==='quarantined'&&row.disposition.b==='quarantined').length,22);
 assert.equal(srt.quality.paired_rows_with_qc_change,0);
 assert.ok(srt.quality.issue_counts.every(item=>item.a===item.b));
 assert.deepEqual(srt.quality.a,srt.quality.b);
});

test('reconciliation: every row of every comparable dataset is referenced exactly once per side',async()=>{
 const rowsOf=(s,name)=>({inventory:s.inventory,h10:s.injectionMonthly,bhp:s.tests?.bhp,srt:s.tests?.srt,casing:s.casing?.rows,plugging:s.plugging?.rows})[name];
 const refOf={inventory:'source_record_key',h10:'source_row_key',bhp:'source_row_key',srt:'source_row_key',casing:'source_id',plugging:'source_id'};
 for(const [x,y] of await samePairs()){
  const a=await side(x),b=await side(y),r=compareVersions(a,b);
  for(const d of r.datasets.filter(item=>item.comparable&&item.dataset!=='relations')){
   for(const [sideName,s] of [['a',a],['b',b]]){
    const refs=d.rows.flatMap(row=>row[sideName]),expected=rowsOf(s,d.dataset).map(row=>row[refOf[d.dataset]]);
    assert.equal(refs.length,expected.length,`${x} ${y} ${d.dataset} ${sideName}`);
    assert.deepEqual([...refs].sort(),[...expected].sort());
    assert.equal(new Set(refs).size,refs.length);
   }
   assert.equal(Object.values(d.counts).reduce((sum,count)=>sum+count,0),d.rows.length);
  }
 }
});

test('determinism and exact mirror symmetry on all nine pairs',async()=>{
 for(const [x,y] of await samePairs()){
  const a=await side(x),b=await side(y),forward=compareVersions(a,b);
  assert.equal(JSON.stringify(compareVersions(a,b)),JSON.stringify(forward));
  assert.deepEqual(compareVersions(b,a),swapSides(forward));
  assert.deepEqual(forward.datasets.map(d=>d.dataset),DATASETS);
  assert.deepEqual(forward.sources.map(s=>s.name),forward.sources.map(s=>s.name).sort());
 }
});

const refused=refusal=>error=>{assert.equal(error.code,'COMPARE_REFUSED');assert.equal(error.refusal,refusal);assert.equal(error.reason,REFUSAL_REASONS[refusal]);return true;};
test('refusals (error.refusal code plus short reason text): different UIC, same version, tampered bytes, wrong sidecar identity and missing sidecars',async()=>{
 assert.throws(()=>compareVersions({},{}),refused('side_incomplete'));assert.throws(()=>compareVersions(null,undefined),refused('side_incomplete'));
 const v2=await side(V2),v3=await side(V3),p4=await side(P4);
 assert.throws(()=>compareVersions(v2,p4),refused('different_uic'));
 assert.throws(()=>compareVersions(v3,v3),refused('same_version'));
 assert.throws(()=>compareVersions(v2,{...v3,inventory:undefined}),refused('side_incomplete'));
 // Tampered committed bytes never reach the comparison: the browser's loaders refuse them.
 const pins=(await pinsPromise).get(V3),normalized=await readFile(new URL(`artifacts/${V3}/normalized.json`,root)),tests=await readFile(new URL(`artifacts/${V3}/tests.json`,root));
 const flipped=bytes=>{const copy=Buffer.from(bytes);copy[copy.length-3]^=1;return copy;};
 await assert.rejects(loadVerifiedVersion(pins,diskFetch({[`/artifacts/${V3}/normalized.json`]:flipped(normalized)})),/hash/i);
 await assert.rejects(loadSide(V3,diskFetch({[`/artifacts/${V3}/tests.json`]:flipped(tests)})),/hash or size/i);
 // A sidecar of another version, a wrong wellbore dataset, a listed file not supplied, or an unlisted file supplied.
 const v4=await side(V4);
 assert.throws(()=>compareVersions(v3,{...v4,tests:{...v4.tests,artifactId:V3}}),refused('sidecar_identity'));
 assert.throws(()=>compareVersions(v3,{...v4,casing:{...v4.casing,dataset:'plugging'}}),refused('sidecar_dataset'));
 assert.throws(()=>compareVersions(v3,{...v4,plugging:null}),refused('sidecar_missing'));
 assert.throws(()=>compareVersions(v2,{...v3,casing:v4.casing}),refused('sidecar_unlisted'));
});

test('fixture: a changed SRT value, null vs 0 and "1" vs 1 are value differences',async()=>{
 const a=clone(await side(N3)),b=clone(await side(N4));
 const target=b.tests.srt.findIndex(row=>row.isip_psig!==null),key=b.tests.srt[target];
 const match=a.tests.srt.find(row=>row.source_report_id===key.source_report_id&&row.tracking_no===key.tracking_no);
 match.isip_psig=1500;b.tests.srt[target].isip_psig=1520;
 let r=run(a,b),srt=ds(r,'srt');
 assert.deepEqual(nonZero(srt.counts),{same:97,values_differ:1});
 assert.deepEqual(srt.rows.find(row=>row.outcome==='values_differ').fields,[{field:'isip_psig',identity:false,a:1500,b:1520}]);
 const c=clone(await side(P4)),d=clone(await side(P5));
 c.injectionMonthly[0].injected_gas_mcf=null;d.injectionMonthly[0].injected_gas_mcf=0;
 c.injectionMonthly[1].most_recent_record='1';d.injectionMonthly[1].most_recent_record=1;
 r=run(c,d);const h10=ds(r,'h10');
 assert.deepEqual(nonZero(h10.counts),{same:14,values_differ:2});
 const fields=h10.rows.filter(row=>row.outcome==='values_differ').flatMap(row=>row.fields);
 assert.deepEqual(fields,[{field:'injected_gas_mcf',identity:false,a:null,b:0},{field:'most_recent_record',identity:false,a:'1',b:1}]);
});

test('fixture: duplicate BHP identity is never paired; duplicate H-10 periods pair only by full tuple',async()=>{
 const a=clone(await side(T3)),b=clone(await side(T4));
 a.tests.bhp.push({...a.tests.bhp[0],source_row_key:a.tests.bhp[0].source_row_key+'-copy'});
 let r=run(a,b),bhp=ds(r,'bhp');
 assert.deepEqual(nonZero(bhp.counts),{same:7,multiple_rows:1});
 const group=bhp.rows.find(row=>row.outcome==='multiple_rows');
 assert.equal(group.a.length,2);assert.equal(group.b.length,1);assert.equal(group.reason,ROW_REASONS.shared_key);assert.equal(group.flags,null);
 // Both sides repeat a period with distinct report IDs: each (period, report ID) tuple is unique on both sides, so both pair.
 const c=clone(await side(P4)),d=clone(await side(P5)),extra=row=>({...row,source_row_key:row.source_row_key+'-x',source_report_id:'X1'});
 c.injectionMonthly.push(extra(c.injectionMonthly[3]));d.injectionMonthly.push(extra(d.injectionMonthly[3]));
 r=run(c,d);assert.deepEqual(nonZero(ds(r,'h10').counts),{same:17});
 // Different extra report IDs: the original tuple still pairs; the unmatched rows stay grouped, not added or missing.
 d.injectionMonthly.at(-1).source_report_id='X2';
 r=run(c,d);const h10=ds(r,'h10');
 assert.deepEqual(nonZero(h10.counts),{same:16,multiple_rows:1});
 const rest=h10.rows.find(row=>row.outcome==='multiple_rows');assert.equal(rest.a.length,1);assert.equal(rest.b.length,1);
 // A BHP row without a report ID is never paired.
 const e=clone(await side(T3)),f=clone(await side(T4));e.tests.bhp[0].source_report_id='';f.tests.bhp[0].source_report_id='';
 const incomplete=ds(run(e,f),'bhp').rows.find(row=>row.outcome==='multiple_rows');assert.equal(incomplete.reason,ROW_REASONS.key_incomplete);
});

test('fixture: an H-10 row outside the other window is outside scope, not missing',async()=>{
 const a=clone(await side(P4)),b=clone(await side(P5));
 a.injectionMonthly.push({...a.injectionMonthly[0],source_row_key:'early',period_start:'2023-12-01',reporting_year:2023,reporting_month:12});
 b.injectionMonthly.push({...b.injectionMonthly[0],source_row_key:'late',period_start:'2026-10-01',reporting_year:2026,reporting_month:10});
 const h10=ds(run(a,b),'h10');
 assert.deepEqual(nonZero(h10.counts),{same:16,outside_other_scope:2});
 assert.ok(h10.rows.filter(row=>row.outcome==='outside_other_scope').every(row=>row.reason===ROW_REASONS.outside_window));
 assert.equal(h10.rows[0].key.period_start,'2023-12-01');assert.equal(h10.rows.at(-1).key.period_start,'2026-10-01');
});

test('fixture: a casing source_id reissue reads only-in-A plus only-in-B (native-key limit); a changed quarantine is a QC difference',async()=>{
 const a=clone(await side(P4)),b=clone(await side(P5));
 b.casing.rows[0].source_id='reissued';
 const casing=ds(run(a,b),'casing');
 assert.deepEqual(nonZero(casing.counts),{same:8,only_in_a:1,only_in_b:1});
 const c=clone(await side(N3)),d=clone(await side(N4)),row=d.tests.srt.find(item=>item.quality_flags.length===0||!item.quality_flags.includes('inconsistent:top_perf_exceeds_bottom'));
 row.quality_flags=[...row.quality_flags,'inconsistent:top_perf_exceeds_bottom'];
 const srt=ds(run(c,d),'srt');
 assert.deepEqual(nonZero(srt.counts),{same:98});
 assert.equal(srt.quality.paired_rows_with_qc_change,1);
 const changed=srt.rows.find(item=>item.b[0]===row.source_row_key);
 assert.equal(changed.outcome,'same');assert.deepEqual(changed.disposition,{a:'accepted',b:'quarantined'});assert.notDeepEqual(changed.flags.a,changed.flags.b);
});

test('fixture: different source_api_id or not-queried wellbore is not comparable; relation catalogues compare by counts',async()=>{
 const a=clone(await side(P4)),b=clone(await side(P5));
 b.casing.link.source_api_id='99999999';b.plugging.scope.status='not_queried';
 let r=run(a,b);
 assert.equal(ds(r,'casing').comparable,false);assert.equal(ds(r,'casing').reason,'different_source_api_id');assert.deepEqual(ds(r,'casing').rows,[]);
 assert.equal(ds(r,'plugging').reason,'not_queried_in_b');
 const c=clone(await side(P4)),d=clone(await side(P5));
 c.manifest.files['evidence_relations.json']=d.manifest.files['evidence_relations.json'];
 c.relations={...clone(d.relations),artifactId:P4};
 c.relations.counts.inventory_to_h10={total:16,by_status:{matched:15,unmatched:1}};
 c.relations.counts.wellbore_to_casing={total:8,by_status:{matched:8}};
 r=run(c,d);const relations=ds(r,'relations');
 assert.equal(relations.comparable,true);assert.deepEqual(relations.quality,{a:null,b:null,parent_join:null,issue_counts:[],paired_rows_with_qc_change:0});
 assert.deepEqual(nonZero(relations.counts),{same:3,values_differ:2,only_in_a:1});
 assert.deepEqual(relations.rows.find(row=>row.key.relation==='inventory_to_h10'&&row.key.status==='matched').fields,[{field:'count',identity:false,a:15,b:16}]);
 assert.ok(relations.rows.every(row=>row.a.length===0&&row.b.length===0));
});

test('purity: inputs unchanged (and deep-frozen inputs accepted), static scan clean, key tables native only',async()=>{
 const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};
 const a=await side(V3),b=await side(V4),before=[clone(a),clone(b)];
 compareVersions(freeze(clone(a)),freeze(clone(b)));compareVersions(a,b);
 assert.deepEqual([a,b],before);
 const result=compareVersions(a,b);assert.equal(Object.isFrozen(result),false);assert.equal(Object.isFrozen(result.datasets[1].rows[0]),false);
 const source=await readFile(new URL('public/version-compare.js',root),'utf8');
 for(const banned of ['fetch(','import(','node:','localStorage','sessionStorage','indexedDB','XMLHttpRequest','writeFile','saveVerifiedPackage','setTimeout','setInterval','document.','window.'])assert.equal(source.includes(banned),false,banned);
 assert.deepEqual([...source.matchAll(/^import .*$/gm)].map(match=>match[0]),["import {rowDisposition} from './quality-validation.js';"]);
 for(const table of [COMPARISON_KEYS,IDENTITY_FIELDS,COMPARED_FIELDS])for(const fields of Object.values(table))for(const banned of ['source_row_key','source_record_key','parent_key','source_snapshot_id','quality_flags'])assert.equal(fields.includes(banned),false,banned);
 assert.deepEqual(COMPARISON_KEYS.h10,['uic_number','period_start']);assert.deepEqual(IDENTITY_FIELDS.h10,['source_report_id']);
 assert.deepEqual(COMPARISON_KEYS.bhp,['source_report_id','tracking_no','test_sequence_no']);assert.deepEqual(COMPARISON_KEYS.srt,['source_report_id','tracking_no']);
 assert.deepEqual(COMPARISON_KEYS.casing,['source_id']);assert.deepEqual(COMPARISON_KEYS.plugging,['source_id']);assert.deepEqual(COMPARISON_KEYS.inventory,['uic_number']);
 // The module's contract columns are the producer's.
 assert.deepEqual(CONTRACT_COLUMNS,{inventory:inventoryColumns,h10:monthlyColumns,bhp:[...testColumns.bhp],srt:[...testColumns.srt],casing:[...wellboreColumns.casing],plugging:[...wellboreColumns.plugging]});
 for(const dataset of Object.keys(CONTRACT_COLUMNS))assert.ok(NEVER_COMPARED[dataset].every(field=>CONTRACT_COLUMNS[dataset].includes(field)));
 assert.deepEqual(OUTCOMES,['same','identity_differs','values_differ','only_in_a','only_in_b','outside_other_scope','multiple_rows']);
 assert.ok(Object.isFrozen(COMPARISON_KEYS)&&Object.isFrozen(COMPARISON_KEYS.h10));
});

async function hashTree(directory,prefix=''){
 const out=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=prefix+entry.name;
  if(entry.isDirectory())out.push(...await hashTree(new URL(entry.name+'/',directory),path+'/'));
  else out.push(`${path} ${sha(await readFile(new URL(entry.name,directory)))}`);
 }
 return out.sort();
}
test('protected-clean: artifacts/ is byte-identical after comparing every pair in both orders',async()=>{
 const before=await hashTree(new URL('artifacts/',root));
 assert.ok(before.length>100);
 sideCache.clear();
 for(const [x,y] of await samePairs()){const a=await loadSide(x),b=await loadSide(y);compareVersions(a,b);compareVersions(b,a);}
 assert.deepEqual(await hashTree(new URL('artifacts/',root)),before);
});
