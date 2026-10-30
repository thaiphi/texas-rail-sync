// RRC-15 (Phase 3b, Task 1): the pure relation-catalogue builder (src/relations.mjs). Committed
// v4 bytes are read only; no scope or file is rewritten. Constructed inputs below are synthetic
// variations of those canonical records, built in memory; nothing here is a public observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadSnapshot} from '../src/artifact.mjs';
import {normalize} from '../src/normalize.mjs';
import {normalizeTests} from '../src/testReports.mjs';
import {normalizeSnapshotWellbore,normalizeWellbore} from '../src/wellbore.mjs';
import {buildRelations,relationTypes,relationKeys,topLevelKeys,notPermitted,catalogueVersion,statusPolicy} from '../src/relations.mjs';
const rootPath=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const TRIPPET='rrc-2026-10-29-uic000109605-70983258-9751-4e79-bb78-1a1cb7068e14';
const committedJson=async(id,name)=>JSON.parse(await readFile(resolve(rootPath,'artifacts',id,name)));
// The committed v4 directory names are discovered, not typed, so a typo cannot silently skip one.
const v4Versions=[];
for(const id of await readdir(resolve(rootPath,'artifacts')))if((await committedJson(id,'manifest.json')).scope?.query_version===4)v4Versions.push(id);
async function derive(id){
 const snapshot=await loadSnapshot(resolve(rootPath,'artifacts',id,'sources'));
 const canonical=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 const testRows=normalizeTests(snapshot.tests,snapshot.sourceIds,canonical.inventory,snapshot.scope);
 const wellboreRows=normalizeSnapshotWellbore(snapshot,canonical.inventory);
 const input={artifactId:id,scope:snapshot.scope,inventory:canonical.inventory,monthly:canonical.monthly,testRows,wellboreRows,sources:snapshot.sources};
 return {snapshot,canonical,testRows,wellboreRows,input,doc:buildRelations(input),manifest:await committedJson(id,'manifest.json')};
}
const trippet=await derive(TRIPPET);
// Closed (relation, from_kind, to_kind) table (spec §3); any other triple fails.
const allowedTriples=['inventory_to_h10|inventory_record|h10_row','inventory_to_test_report|inventory_record|bhp_row','inventory_to_test_report|inventory_record|srt_row','inventory_to_wellbore|inventory_record|wellbore','wellbore_to_casing|wellbore|casing_row','wellbore_to_plugging|wellbore|plugging_row',
 ...['inventory_record','h10_row','bhp_row','srt_row','casing_row','plugging_row'].map(kind=>`record_to_source_snapshot|${kind}|source_snapshot`)];
const statuses={inventory_to_h10:['matched','unmatched','ambiguous'],inventory_to_test_report:['matched','unmatched','ambiguous'],inventory_to_wellbore:['matched','none','ambiguous'],wellbore_to_casing:['matched'],wellbore_to_plugging:['matched'],record_to_source_snapshot:[null]};
// Tables by kind: a key is only ever resolved against the table its kind names.
function tables({inventory,monthly,testRows,wellboreRows,sources}){
 return {inventory_record:inventory.map(r=>r.source_record_key),h10_row:monthly.map(r=>r.source_row_key),bhp_row:(testRows?.bhp??[]).map(r=>r.source_row_key),srt_row:(testRows?.srt??[]).map(r=>r.source_row_key),
  casing_row:(wellboreRows?.casing.rows??[]).map(r=>r.source_row_key),plugging_row:(wellboreRows?.plugging.rows??[]).map(r=>r.source_row_key),
  wellbore:wellboreRows?['casing','plugging'].map(d=>wellboreRows[d].link.source_api_id).filter(v=>v!==null):[],source_snapshot:sources.map(s=>s.snapshot_id)};
}
// Invariants every catalogue must hold, whatever its input.
function assertInvariants(doc,input){
 assert.deepEqual(Object.keys(doc),topLevelKeys);
 assert.deepEqual(doc.relation_types,relationTypes);
 const table=tables(input),rawFile=new Map(input.sources.map(s=>[s.raw_file,s.sha256]));
 for(const item of doc.relations){
  assert.deepEqual(Object.keys(item),relationKeys);
  assert.ok(allowedTriples.includes(`${item.relation}|${item.from_kind}|${item.to_kind}`),JSON.stringify(item));
  assert.ok(statuses[item.relation].includes(item.status),item.relation+' '+item.status);
  assert.notEqual(item.status,'needs_review');
  if(item.from_key===null)assert.ok(['inventory_to_h10','inventory_to_test_report'].includes(item.relation)&&item.status!=='matched',JSON.stringify(item));
  else assert.ok(table[item.from_kind].includes(item.from_key),`${item.from_kind} ${item.from_key}`);
  if(item.to_key===null)assert.ok(item.relation==='inventory_to_wellbore'&&item.status==='none'&&item.reason==='api_missing_or_invalid');
  else assert.ok(table[item.to_kind].includes(item.to_key),`${item.to_kind} ${item.to_key}`);
  assert.equal(item.reason===null||item.relation==='inventory_to_wellbore',true);
  assert.ok(Array.isArray(item.candidates)&&Array.isArray(item.evidence)&&item.evidence.length>=1);
  for(const ref of item.evidence){assert.deepEqual(Object.keys(ref),['file','sha256']);assert.match(ref.file,/^sources\//);assert.match(ref.sha256,/^[a-f0-9]{64}$/);assert.equal(rawFile.get(ref.file),ref.sha256,ref.file);}
  if(item.relation==='record_to_source_snapshot'){assert.equal(item.evidence.length,1);assert.equal(input.sources.find(s=>s.raw_file===item.evidence[0].file).snapshot_id,item.to_key);}
 }
 // counts = a recount of relations (null status counted under the key "null").
 const recount={};for(const type of relationTypes){const items=doc.relations.filter(r=>r.relation===type),by={};for(const r of items)by[String(r.status)]=(by[String(r.status)]??0)+1;recount[type]={total:items.length,by_status:by};}
 assert.deepEqual(doc.counts,recount);assert.deepEqual(Object.keys(doc.counts),relationTypes);
 // Relation order follows relation_types.
 const order=doc.relations.map(r=>relationTypes.indexOf(r.relation));assert.deepEqual(order,[...order].sort((a,b)=>a-b));
}

test('shape: exact top-level and relation keys, catalogue version, fixed strings',()=>{
 const {doc}=trippet;
 assert.deepEqual(Object.keys(doc),['schemaVersion','artifactId','catalogue_version','scope','relation_types','not_permitted','status_policy','counts','relations']);
 assert.equal(doc.schemaVersion,1);assert.equal(doc.artifactId,TRIPPET);assert.equal(doc.catalogue_version,'rrc-relations-v1');assert.equal(catalogueVersion,'rrc-relations-v1');
 assert.deepEqual(Object.keys(doc.scope),['query_version','inventory_source_record_key','source_api_id']);
 assert.deepEqual(doc.relation_types,['inventory_to_h10','inventory_to_test_report','inventory_to_wellbore','wellbore_to_casing','wellbore_to_plugging','record_to_source_snapshot']);
 assert.deepEqual(doc.not_permitted,['API → H-10','Wellbore/API → BHP or SRT','Casing or plugging → UIC directly','permit -> document','Spatial / "nearby"','Bottom location uumf-5r4y → anything','Operator, lease or well-name similarity']);
 assert.deepEqual(Object.keys(doc.status_policy),[...relationTypes,'needs_review']);assert.equal(doc.status_policy.needs_review,'reserved; not emitted by catalogue rrc-relations-v1');
 assert.equal(doc.status_policy.inventory_to_h10,'parent_join_status reused as is (matched / unmatched / ambiguous)');
 assert.deepEqual(doc.status_policy,statusPolicy);
 for(const sentence of Object.values(doc.status_policy))assert.doesNotMatch(sentence,/compliant|violation|plugged and abandoned|not plugged|properly|adequate|safe|communication|cement/i);
 for(const item of doc.relations)assert.deepEqual(Object.keys(item),['relation','from_kind','from_key','to_kind','to_key','dataset','basis','status','reason','candidates','evidence']);
 assertInvariants(doc,trippet.input);
});

test('derivation on the TRIPPET committed bytes: 16 + 0 + 2 + 9 + 7 + 33 = 67 relations',()=>{
 const {doc}=trippet,count=type=>doc.relations.filter(r=>r.relation===type);
 assert.deepEqual(doc.scope,{query_version:4,inventory_source_record_key:'rrc:uic:givw-z9t4:9243e138d823f249:1',source_api_id:'38934609'});
 assert.equal(count('inventory_to_h10').length,16);assert.ok(count('inventory_to_h10').every(r=>r.status==='matched'&&r.from_key===doc.scope.inventory_source_record_key&&r.dataset==='h10'&&r.basis==='exact_uic_string'));
 assert.equal(count('inventory_to_test_report').length,0);
 const links=count('inventory_to_wellbore');assert.deepEqual(links.map(r=>[r.dataset,r.status,r.reason,r.candidates.length,r.to_key]),[['casing','matched',null,1,'38934609'],['plugging','matched',null,1,'38934609']]);
 assert.equal(count('wellbore_to_casing').length,9);assert.equal(count('wellbore_to_plugging').length,7);
 assert.equal(count('record_to_source_snapshot').length,33);assert.equal(doc.relations.length,67);
 assert.deepEqual(doc.counts.record_to_source_snapshot,{total:33,by_status:{null:33}});
 assert.deepEqual(doc.counts.inventory_to_test_report,{total:0,by_status:{}});
 // Evidence order per spec §2.3.
 assert.deepEqual(links[0].evidence.map(e=>e.file),['sources/candidate-inventory.json','sources/wellbore-inventory.json','sources/candidate-casing.json']);
 assert.deepEqual(count('wellbore_to_plugging')[0].evidence.map(e=>e.file),['sources/candidate-inventory.json','sources/candidate-plugging.json']);
 assert.deepEqual(count('inventory_to_h10')[0].evidence.map(e=>e.file),['sources/candidate-inventory.json','sources/candidate-monthly.json']);
 assert.deepEqual(count('record_to_source_snapshot').map(r=>r.dataset),[...Array(1).fill('inventory'),...Array(16).fill('h10'),...Array(9).fill('casing'),...Array(7).fill('plugging')]);
});

test('reconciliation against every committed v4 version: edges equal quality counts and parent_join splits',async()=>{
 assert.equal(v4Versions.length,4);assert.ok(v4Versions.includes(TRIPPET));
 for(const id of v4Versions){
  const {doc,input}=await derive(id),quality=await committedJson(id,'quality_report.json'),tests=await committedJson(id,'tests.json'),casing=await committedJson(id,'casing.json'),plugging=await committedJson(id,'plugging.json');
  assertInvariants(doc,input);
  const of=type=>doc.relations.filter(r=>r.relation===type),split=items=>({matched:items.filter(r=>r.status==='matched').length,unmatched:items.filter(r=>r.status==='unmatched').length,ambiguous:items.filter(r=>r.status==='ambiguous').length});
  assert.equal(of('inventory_to_h10').length,quality.monthly.raw,id);assert.deepEqual(split(of('inventory_to_h10')),quality.parent_join,id);
  for(const kind of ['bhp','srt']){const items=of('inventory_to_test_report').filter(r=>r.dataset===kind);assert.equal(items.length,tests.quality[kind].raw,id+kind);assert.deepEqual(split(items),tests.quality.parent_join[kind],id+kind);}
  assert.equal(of('wellbore_to_casing').length,casing.quality.counts.raw,id);assert.equal(of('wellbore_to_plugging').length,plugging.quality.counts.raw,id);
  assert.deepEqual(of('inventory_to_wellbore').map(r=>[r.status,r.reason]),[[casing.link.status,casing.link.reason],[plugging.link.status,plugging.link.reason]],id);
  assert.equal(of('record_to_source_snapshot').length,quality.inventory.raw+quality.monthly.raw+tests.quality.bhp.raw+tests.quality.srt.raw+casing.quality.counts.raw+plugging.quality.counts.raw,id);
  // excluded is 0 everywhere, so every raw row has exactly one edge in its driving relation.
  for(const counts of [quality.inventory,quality.monthly,tests.quality.bhp,tests.quality.srt,casing.quality.counts,plugging.quality.counts])assert.equal(counts.excluded,0);
  for(const c of Object.values(doc.counts))assert.ok(!Object.hasOwn(c.by_status,'needs_review'),'needs_review is never a count key');
  assert.ok(!doc.relations.some(r=>r.status==='needs_review'));
 }
});

test('evidence: every sha256 equals the committed manifest.files entry; no file outside sources/',async()=>{
 for(const id of v4Versions){
  const {doc,manifest}=await derive(id);
  for(const item of doc.relations)for(const ref of item.evidence){assert.match(ref.file,/^sources\/[^/]+$/);assert.ok(Object.hasOwn(manifest.files,ref.file),ref.file);assert.equal(ref.sha256,manifest.files[ref.file].sha256,id+' '+ref.file);}
 }
});

test('statuses: ambiguous and unmatched H-10, wellbore ambiguous/none, needs_review never emitted',()=>{
 const {snapshot,canonical,wellboreRows,input}=trippet,inv=snapshot.inventory[0],selectedApi=inv.api_no;
 const seen=[];const build=over=>{const next={...input,...over},doc=buildRelations(next);assertInvariants(doc,next);seen.push(doc);return doc;};
 // Two inventory rows with one UIC (pure builder): every H-10 edge is ambiguous with both candidates, in inventory order.
 const two=normalize([inv,{...inv,api_no:'38999999',lease_name:'SYNTHETIC SECOND PERMIT'}],snapshot.monthly,snapshot.sourceIds);
 const amb=build({inventory:two.inventory,monthly:two.monthly});
 const h10=amb.relations.filter(r=>r.relation==='inventory_to_h10');assert.equal(h10.length,16);
 for(const r of h10){assert.equal(r.status,'ambiguous');assert.equal(r.from_key,null);assert.deepEqual(r.candidates,two.inventory.map(row=>row.source_record_key));}
 assert.deepEqual(amb.counts.inventory_to_h10,{total:16,by_status:{ambiguous:16}});
 // A foreign-UIC H-10 row: unmatched, from_key null, no candidates.
 const foreign=normalize(snapshot.inventory,[...snapshot.monthly,{...snapshot.monthly[0],id:'synthetic-foreign',uic_no:'000999999',api_no:selectedApi}],snapshot.sourceIds);
 const un=build({inventory:foreign.inventory,monthly:foreign.monthly}),last=un.relations.filter(r=>r.relation==='inventory_to_h10').at(-1);
 assert.equal(last.status,'unmatched');assert.equal(last.from_key,null);assert.deepEqual(last.candidates,[]);assert.deepEqual(un.counts.inventory_to_h10.by_status,{matched:16,unmatched:1});
 // Wellbore links built by the existing normalizer from constructed API-inventory responses.
 const queries=name=>{const s=snapshot.sources.find(x=>x.name===name);return {url:s.url,sha256:s.sha256};};
 const link=(wellbore,scope=snapshot.scope)=>normalizeWellbore(wellbore,snapshot.sourceIds,{row:canonical.inventory[0],raw:inv},scope,{inventory:queries('wellbore-inventory'),casing:queries('candidate-casing'),plugging:queries('candidate-plugging')});
 const shared=link({inventory:[snapshot.wellbore.inventory[0],{...snapshot.wellbore.inventory[0],uic_number:'000999999',lease_name:'SYNTHETIC SECOND PERMIT'}],casing:snapshot.wellbore.casing,plugging:[]});
 const ambWell=build({wellboreRows:shared}),ambLinks=ambWell.relations.filter(r=>r.relation==='inventory_to_wellbore');
 assert.deepEqual(ambLinks.map(r=>[r.dataset,r.status,r.reason]),[['casing','ambiguous','multiple_inventory_rows'],['plugging','ambiguous','multiple_inventory_rows']]);
 assert.deepEqual(ambLinks[0].candidates,shared.casing.link.candidates);assert.deepEqual(ambLinks[0].candidates.map(c=>c.selected),[true,false]);
 assert.equal(ambWell.relations.filter(r=>r.relation==='wellbore_to_casing').length,9,'rows under an ambiguous link keep their wellbore edges');
 const empty=build({wellboreRows:link({inventory:[snapshot.wellbore.inventory[0]],casing:snapshot.wellbore.casing,plugging:[]})});
 const none=empty.relations.find(r=>r.relation==='inventory_to_wellbore'&&r.dataset==='plugging');
 assert.deepEqual([none.status,none.reason,none.to_key,none.candidates.length],['none','no_source_rows','38934609',1]);assert.equal(empty.relations.filter(r=>r.relation==='wellbore_to_plugging').length,0);
 const noApi={...snapshot.scope,sourceApiId:null},missing=build({scope:noApi,wellboreRows:link(null,noApi)});
 for(const r of missing.relations.filter(r=>r.relation==='inventory_to_wellbore')){assert.equal(r.status,'none');assert.equal(r.reason,'api_missing_or_invalid');assert.equal(r.to_key,null);assert.deepEqual(r.candidates,[]);assert.deepEqual(r.evidence.map(e=>e.file),['sources/candidate-inventory.json']);}
 assert.equal(missing.scope.source_api_id,null);assert.ok(!missing.relations.some(r=>r.from_kind==='wellbore'));
 for(const doc of [...seen,trippet.doc]){assert.ok(!doc.relations.some(r=>r.status==='needs_review'));for(const c of Object.values(doc.counts))assert.ok(!Object.hasOwn(c.by_status,'needs_review'));}
});

test('not permitted (ADR 004 §3): each row of the spec §3 table',async()=>{
 const {snapshot,input}=trippet,docs=[trippet.doc];
 for(const id of v4Versions)docs.push((await derive(id)).doc);
 // API → H-10: an H-10 row carrying the inventory API but a foreign UIC is unmatched, never a wellbore edge.
 const foreign=normalize(snapshot.inventory,[...snapshot.monthly,{...snapshot.monthly[0],id:'synthetic-foreign',uic_no:'000999999',api_no:snapshot.inventory[0].api_no}],snapshot.sourceIds);
 const doc=buildRelations({...input,inventory:foreign.inventory,monthly:foreign.monthly});docs.push(doc);
 const foreignKey=foreign.monthly.at(-1).source_row_key;
 assert.deepEqual(doc.relations.filter(r=>r.to_key===foreignKey||r.from_key===foreignKey).map(r=>[r.relation,r.status,r.from_key===null]),[['inventory_to_h10','unmatched',true],['record_to_source_snapshot',null,false]]);
 for(const d of docs){
  for(const r of d.relations){
   assert.ok(allowedTriples.includes(`${r.relation}|${r.from_kind}|${r.to_kind}`),'closed triple table');
   assert.ok(!(r.from_kind==='wellbore'&&r.to_kind==='h10_row'),'API → H-10');
   assert.ok(!(r.from_kind==='wellbore'&&['bhp_row','srt_row'].includes(r.to_kind)),'Wellbore/API → BHP or SRT');
   assert.ok(!(r.from_kind==='inventory_record'&&['casing_row','plugging_row'].includes(r.to_kind)),'Casing or plugging → UIC directly');
   if(['casing_row','plugging_row'].includes(r.to_kind))assert.equal(r.from_kind,'wellbore');
   assert.ok(relationTypes.includes(r.relation));for(const name of [r.relation,r.from_kind,r.to_kind,r.basis])assert.doesNotMatch(name,/document|permit|nearby|distance|spatial/i,'permit -> document / spatial');
   for(const ref of r.evidence)assert.doesNotMatch(ref.file,/uumf-5r4y/,'bottom location');
   for(const key of [r.from_key,r.to_key])if(key!==null)assert.doesNotMatch(key,/uumf-5r4y/);
  }
 }
 // Casing/plugging rows still carry no UIC or parent key (Phase 3).
 for(const dataset of ['casing','plugging'])for(const row of trippet.wellboreRows[dataset].rows){assert.ok(!Object.hasOwn(row,'uic_number'));assert.ok(!Object.hasOwn(row,'parent_key'));}
 assert.equal(notPermitted.length,7);
});

test('not permitted: static scans of src/relations.mjs (outside the fixed not_permitted strings)',async()=>{
 const text=await readFile(resolve(rootPath,'src/relations.mjs'),'utf8');
 const blocks=text.split('// BEGIN not_permitted');assert.equal(blocks.length,2,'one delimited not_permitted block');
 const [inside,after]=blocks[1].split('// END not_permitted');assert.ok(after!==undefined);
 assert.match(inside,/export const notPermitted=Object\.freeze\(\[/);assert.doesNotMatch(inside.split('\n').slice(1).join('\n'),/[;{}()=]\s*(?:if|for|return|const|let)\b/,'the block holds only string literals');
 const code=blocks[0]+after;
 assert.doesNotMatch(code,/api_no/,'API → H-10: the builder never reads api_no');
 for(const word of ['latitude','longitude','distance','nearby'])assert.ok(!code.includes(word),'spatial: '+word);
 for(const word of ['operator_number','lease_name','lease_number','well_no_display','w14_number'])assert.ok(!code.includes(word),'similarity: '+word);
 assert.doesNotMatch(code,/uumf-5r4y/);
});

test('key kinds: colliding keys and snapshot IDs resolve by kind and evidence file',()=>{
 const {doc,manifest,wellboreRows,canonical}=trippet;
 // The casing link's candidate_key equals the inventory source_record_key: textually equal keys of two files.
 const candidateKey=wellboreRows.casing.link.candidates[0].candidate_key;assert.equal(candidateKey,canonical.inventory[0].source_record_key);
 for(const r of doc.relations.filter(r=>r.from_key===candidateKey))assert.equal(r.from_kind,'inventory_record','resolved only as an inventory record');
 assert.ok(!doc.relations.some(r=>r.to_key===candidateKey),'a candidate is never an edge endpoint');
 // Identical bytes give one snapshot ID to two files; the evidence file disambiguates.
 const id=canonical.inventory[0].source_snapshot_id,sharing=manifest.sources.filter(s=>s.snapshot_id===id);
 assert.deepEqual(sharing.map(s=>s.raw_file),['sources/candidate-inventory.json','sources/wellbore-inventory.json']);
 const edge=doc.relations.find(r=>r.relation==='record_to_source_snapshot'&&r.from_kind==='inventory_record');
 assert.equal(edge.to_key,id);assert.deepEqual(edge.evidence,[{file:'sources/candidate-inventory.json',sha256:manifest.files['sources/candidate-inventory.json'].sha256}]);
 // Empty BHP and SRT responses share their hash part but not their snapshot IDs.
 const bhp=manifest.sources.find(s=>s.name==='candidate-bhp'),srt=manifest.sources.find(s=>s.name==='candidate-srt');
 assert.equal(bhp.snapshot_id.split(':')[1],srt.snapshot_id.split(':')[1]);assert.notEqual(bhp.snapshot_id,srt.snapshot_id);
});

test('fail closed: missing evidence sources and records that contradict their snapshot are refused',()=>{
 const {input}=trippet;
 assert.throws(()=>buildRelations({...input,sources:input.sources.filter(s=>s.name!=='candidate-monthly')}),{code:'SOURCE_INVALID'});
 assert.throws(()=>buildRelations({...input,sources:[...input.sources,{...input.sources[0]}]}),{code:'SOURCE_INVALID'},'a duplicated source name is not one file');
 assert.throws(()=>buildRelations({...input,sources:input.sources.map(s=>s.name==='candidate-casing'?{...s,raw_file:'casing.json'}:s)}),{code:'SOURCE_INVALID'});
 assert.throws(()=>buildRelations({...input,sources:input.sources.map(s=>s.name==='candidate-plugging'?{...s,sha256:s.sha256.slice(0,16)}:s)}),{code:'SOURCE_INVALID'});
 assert.throws(()=>buildRelations({...input,monthly:input.monthly.map((r,i)=>i?r:{...r,source_snapshot_id:'qq2j-f2zm:0000000000000000'})}),{code:'SOURCE_INVALID'});
});

test('purity: deep copies give identical JSON, inputs are not mutated, the module imports nothing',async()=>{
 const {input}=trippet,before=JSON.stringify(input);
 const a=buildRelations(structuredClone(input)),b=buildRelations(structuredClone(input));
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(buildRelations(input)),JSON.stringify(a));assert.equal(JSON.stringify(input),before);
 a.relations.find(r=>r.relation==='inventory_to_wellbore').candidates[0].selected=false;assert.equal(input.wellboreRows.casing.link.candidates[0].selected,true,'candidates are copied');
 const text=await readFile(resolve(rootPath,'src/relations.mjs'),'utf8');
 assert.doesNotMatch(text,/^\s*import\b|\bimport\s*\(|\brequire\s*\(/m,'no imports');
 for(const word of ['node:fs','node:net','fetch','normalize.mjs','Date.now','Math.random','localeCompare','.sort('])assert.ok(!text.includes(word),word);
});
