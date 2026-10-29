// RRC-14 (Phase 3): pure casing/plugging normalization, link statuses (ADR 004 §2), the
// wellbore dictionary and the negative "no API -> H-10 join" checks. Fixture provenance:
// casing bytes are copied from raw-discovery-2026-10-29-api-proof/; plugging rows are the
// owner-authorized discovery bytes (16300331) or synthetic rows; shared-API inventory rows are
// constructed (the proof found no shared API). Nothing here is a public observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeWellbore,wellboreColumns,wellboreDictionary,wellboreCsv,wellboreScopeFailure,presenceSentence} from '../src/wellbore.mjs';
import {boundedWellboreScope} from '../src/sources.mjs';
import {normalize} from '../src/normalize.mjs';
const root=new URL('../',import.meta.url),fixture=async name=>JSON.parse(await readFile(new URL('test/fixtures/wellbore/'+name,root)));
const proofInventory=JSON.parse(await readFile(new URL('raw-discovery-2026-10-29-api-proof/inventory-givw-z9t4-api20332896.json',root)));
const multi=await fixture('casing-api20332896.json'),plugs=await fixture('synthetic-plugging.json');
const api='20332896',selectedRaw=proofInventory[0],scope=boundedWellboreScope(selectedRaw.uic_number,'2024-01','2024-12',api);
const sourceIds={inventory:'givw-z9t4:aaaaaaaaaaaaaaaa',monthly:'qq2j-f2zm:bbbbbbbbbbbbbbbb',wellbore_inventory:'givw-z9t4:cccccccccccccccc',casing:'u9m4-xnh6:dddddddddddddddd',plugging:'wfzn-9fje:eeeeeeeeeeeeeeee'};
const selected={row:{source_record_key:'rrc:uic:givw-z9t4:aaaaaaaaaaaaaaaa:1'},raw:selectedRaw};
const queries={inventory:{url:'https://example.invalid/inventory',sha256:'a'.repeat(64)},casing:{url:'https://example.invalid/casing',sha256:'b'.repeat(64)},plugging:{url:'https://example.invalid/plugging',sha256:'c'.repeat(64)}};
const run=({inventory=[selectedRaw],casing=multi,plugging=[],withScope=scope}={})=>normalizeWellbore({inventory,casing,plugging},sourceIds,selected,withScope,queries);
const casingRow=(fields={})=>({...multi[0],...fields});
const flagsOf=rows=>rows.map(row=>row.quality_flags);

test('multi-string, multi-filing proof bytes: 8 accepted rows, repeated record_sequence unflagged, on_top_record only on seq 3, order kept',()=>{
 const {casing}=run();
 assert.equal(casing.rows.length,8);assert.deepEqual(casing.quality.counts,{raw:8,parsed:8,accepted:8,quarantined:0,excluded:0});
 assert.deepEqual(casing.rows.map(row=>row.source_id),multi.map(row=>row.id),'source order kept');
 assert.deepEqual(casing.rows.map(row=>row.record_sequence),['1','1','2','2','3','3','4','4']);
 assert.deepEqual(casing.rows.map(row=>row.on_top_record),[null,null,null,null,true,true,null,null]);
 assert.ok(flagsOf(casing.rows).every(flags=>JSON.stringify(flags)==='["missing:multi_stg_depth"]'),'only the absent multi_stg_depth is flagged');
 assert.equal(casing.rows[0].completion_date,'2004-04-08');assert.equal(casing.rows[0].completion_date_text,'2004-04-08T00:00:00.000');
 assert.equal(casing.rows[0].toc,0,'published 0.0 stays zero');assert.equal(casing.rows[1].toc,6500);assert.equal(casing.rows[0].csg_size,9.625);
 assert.equal(casing.rows[0].multi_stg_depth,null);assert.equal(casing.rows[0].depth_reference_code,'GR');
 assert.equal(casing.rows[0].source_row_key,'rrc:casing:u9m4-xnh6:dddddddddddddddd:1');assert.equal(casing.rows[0].source_snapshot_id,sourceIds.casing);
 assert.deepEqual(Object.keys(casing.rows[0]),[...wellboreColumns.casing]);
 assert.equal(casing.quality.issue_counts['missing:multi_stg_depth'],8);
});
test('duplicate source id quarantines every occurrence; empty id is invalid; repeated record_sequence is accepted',()=>{
 const rows=[casingRow({id:'7',record_sequence:'1'}),casingRow({id:'8',record_sequence:'1'}),casingRow({id:'7',record_sequence:'2'}),casingRow({id:''}),casingRow({id:undefined,record_sequence:undefined})];
 const {casing}=run({casing:rows});
 assert.deepEqual(casing.rows.map(row=>row.quality_flags.filter(flag=>!flag.startsWith('missing:multi'))),[['duplicate_source_id'],[],['duplicate_source_id'],['invalid:source_id'],['invalid:source_id','missing:record_sequence']]);
 assert.deepEqual(casing.quality.dispositions.map(item=>item.disposition),['quarantined','accepted','quarantined','quarantined','quarantined']);
 assert.ok(casing.quality.dispositions[0].reasons.includes('duplicate_source_id'));assert.equal(casing.quality.dispositions[1].reasons,undefined);
 assert.deepEqual(casing.quality.counts,{raw:5,parsed:5,accepted:1,quarantined:4,excluded:0});
 const missingSequence=run({casing:[casingRow({record_sequence:''})]}).casing;
 assert.ok(missingSequence.rows[0].quality_flags.includes('missing:record_sequence'));assert.equal(missingSequence.quality.counts.accepted,1,'missing record_sequence is accepted');
});
test('multi-plug synthetic filing: repeated record_sequence accepted, plug_top_exceeds_bottom quarantined, published zero kept',()=>{
 const rows=plugs.map(row=>({...row,api_no:api}));
 const {plugging}=run({plugging:[...rows,{...rows[0],id:'900099',plug_top_depth:'7000',plug_bottom_depth:'6100'}]});
 assert.equal(plugging.rows.length,6);assert.deepEqual(plugging.rows.map(row=>row.record_sequence),['1','1','1','2','2','1']);
 assert.deepEqual(plugging.quality.counts,{raw:6,parsed:6,accepted:5,quarantined:1,excluded:0});
 assert.deepEqual(plugging.rows[5].quality_flags,['inconsistent:plug_top_exceeds_bottom']);
 assert.equal(plugging.rows[2].plug_top_depth,0);assert.equal(plugging.rows[2].total_depth_w3,0);assert.deepEqual(plugging.rows[2].quality_flags,['missing:depth_reference']);
 assert.deepEqual(plugging.rows.map(row=>row.on_top_record),[null,null,null,true,true,null]);
 assert.deepEqual(Object.keys(plugging.rows[0]),[...wellboreColumns.plugging]);
 assert.equal(plugging.rows[0].w3_date,'2024-03-04');
});
test('owner-authorized discovery plugging bytes (API 16300331): total_depth_w3 "0" stays 0 and is accepted',async()=>{
 const rows=(await fixture('plugging-discovery-candidates.json')).filter(row=>row.api_no==='16300331');
 assert.equal(rows.length,3);
 const inventoryRow={...selectedRaw,api_no:'16300331'},local=boundedWellboreScope(selectedRaw.uic_number,'2024-01','2024-12','16300331');
 const {plugging}=normalizeWellbore({inventory:[inventoryRow],casing:[],plugging:rows},sourceIds,{row:selected.row,raw:inventoryRow},local,queries);
 assert.deepEqual(plugging.rows.map(row=>row.total_depth_w3),[0,0,0]);assert.ok(plugging.rows.every(row=>row.on_top_record===true&&row.record_sequence==='1'));
 assert.deepEqual(plugging.quality.counts,{raw:3,parsed:3,accepted:3,quarantined:0,excluded:0});assert.equal(plugging.link.status,'matched');
});
test('missing is not zero: absent -> null + missing (accepted), "0.0" -> 0, "1,234" parse failure, negative depth invalid, negative depth_reference accepted',()=>{
 const {casing}=run({casing:[casingRow({id:'1',toc:'0.0'}),casingRow({id:'2',csg_depth:'1,234'}),casingRow({id:'3',csg_depth:'-5'}),casingRow({id:'4',depth_reference:'-12.0'}),casingRow({id:'5',cmt_sacks:undefined})]});
 assert.equal(casing.rows[0].toc,0);assert.deepEqual(casing.rows[0].quality_flags,['missing:multi_stg_depth']);
 assert.equal(casing.rows[1].csg_depth,null);assert.ok(casing.rows[1].quality_flags.includes('parse_failure:csg_depth'));
 assert.equal(casing.rows[2].csg_depth,-5);assert.ok(casing.rows[2].quality_flags.includes('invalid_negative:csg_depth'));
 assert.equal(casing.rows[3].depth_reference,-12);assert.deepEqual(casing.rows[3].quality_flags,['missing:multi_stg_depth']);
 assert.equal(casing.rows[4].cmt_sacks,null);assert.ok(casing.rows[4].quality_flags.includes('missing:cmt_sacks'));
 assert.deepEqual(casing.quality.dispositions.map(item=>item.disposition),['accepted','quarantined','quarantined','accepted','accepted']);
 const csv=wellboreCsv(casing.rows,'casing').split('\n');assert.equal(csv[0],wellboreColumns.casing.join(','));
 const header=csv[0].split(','),line=csv[5].split(',');assert.equal(line[header.indexOf('cmt_sacks')],'','missing is an empty cell, never 0');assert.equal(csv[1].split(',')[header.indexOf('toc')],'0');
});
test('on_top_record: absent -> null without a flag, false stays false, a string is a quarantined parse failure; never derived',()=>{
 const base=casingRow();delete base.on_top_record;
 const {casing}=run({casing:[{...base,id:'1'},{...base,id:'2',on_top_record:false},{...base,id:'3',on_top_record:'true'},{...base,id:'4',on_top_record:true,record_sequence:'1'},{...base,id:'5',on_top_record:null}]});
 assert.deepEqual(casing.rows.map(row=>row.on_top_record),[null,false,null,true,null]);
 assert.ok(!casing.rows[0].quality_flags.some(flag=>flag.includes('on_top_record')));assert.ok(casing.rows[2].quality_flags.includes('parse_failure:on_top_record'));
 assert.deepEqual(casing.quality.dispositions.map(item=>item.disposition),['accepted','accepted','quarantined','accepted','accepted']);
 const csv=wellboreCsv(casing.rows,'casing').split('\n'),index=wellboreColumns.casing.indexOf('on_top_record');
 assert.deepEqual(csv.slice(1,6).map(line=>line.split(',')[index]),['','false','','true','']);
});
test('dates: only YYYY-MM-DDT00:00:00.000 with a valid calendar date is parsed; missing accepted; _text always kept',()=>{
 const values=['2004-04-08T00:00:00.000','2004-04-08','2004-04-08T12:00:00.000','2023-02-30T00:00:00.000',undefined];
 const {casing}=run({casing:values.map((value,i)=>casingRow({id:String(i+1),completion_date:value}))});
 assert.deepEqual(casing.rows.map(row=>row.completion_date),['2004-04-08',null,null,null,null]);
 assert.deepEqual(casing.rows.map(row=>row.completion_date_text),['2004-04-08T00:00:00.000','2004-04-08','2004-04-08T12:00:00.000','2023-02-30T00:00:00.000','']);
 assert.deepEqual(casing.quality.dispositions.map(item=>item.disposition),['accepted','quarantined','quarantined','quarantined','accepted']);
 assert.ok(casing.rows[4].quality_flags.includes('missing:completion_date'));assert.ok(casing.rows[1].quality_flags.includes('parse_failure:completion_date'));
 const leap=run({plugging:[{...plugs[0],api_no:api,w3_date:'2024-02-29T00:00:00.000'}]}).plugging;assert.equal(leap.rows[0].w3_date,'2024-02-29');
});
test('link statuses follow ADR 004 §2 order: matched, none/no_source_rows, none/api_missing_or_invalid, ambiguous (2-24 and 25 rows)',()=>{
 const matched=run();
 assert.equal(matched.casing.link.status,'matched');assert.equal(matched.casing.link.reason,null);assert.deepEqual(matched.violations,[]);
 assert.deepEqual(matched.casing.link.inventory_query,{...queries.inventory,rows:1});assert.deepEqual(matched.casing.link.wellbore_query,{...queries.casing,rows:8});
 assert.equal(matched.casing.link.basis,'inventory_api_no');assert.equal(matched.casing.link.source_api_id,api);assert.equal(matched.casing.link.inventory_source_record_key,selected.row.source_record_key);
 assert.deepEqual(matched.casing.link.candidates,[{candidate_key:'rrc:uic:givw-z9t4:cccccccccccccccc:1',selected:true,uic_number:selectedRaw.uic_number,api_no:api,operator_number:selectedRaw.operator_number,district_code:selectedRaw.district_code,lease_number:selectedRaw.lease_number,lease_name:selectedRaw.lease_name,well_no_display:selectedRaw.well_no_display,w14_number:selectedRaw.w14_number??""}]);
 assert.ok(matched.casing.rows.every(row=>row.wellbore_link_status==='matched'&&row.source_api_id===api));
 assert.equal(matched.plugging.link.status,'none');assert.equal(matched.plugging.link.reason,'no_source_rows');assert.equal(matched.plugging.link.wellbore_row_count,0);
 assert.equal(presenceSentence('plugging',matched.plugging.link),'No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged.');
 for(const apiNo of ['','3891020',undefined]){
  const local=boundedWellboreScope(selectedRaw.uic_number,'2024-01','2024-12',apiNo);assert.equal(local.sourceApiId,null);
  const none=normalizeWellbore({inventory:null,casing:null,plugging:null},sourceIds,selected,local,{inventory:null,casing:null,plugging:null});
  for(const dataset of ['casing','plugging']){const {link,rows,quality}=none[dataset];
   assert.deepEqual({status:link.status,reason:link.reason,inventory_query:link.inventory_query,wellbore_query:link.wellbore_query,candidates:link.candidates,wellbore_row_count:link.wellbore_row_count,source_api_id:link.source_api_id},{status:'none',reason:'api_missing_or_invalid',inventory_query:null,wellbore_query:null,candidates:[],wellbore_row_count:0,source_api_id:null});
   assert.deepEqual(rows,[]);assert.deepEqual(quality.counts,{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0});}
  assert.deepEqual(none.violations,[]);
 }
 const other={...selectedRaw,uic_number:'000999999',lease_name:'SYNTHETIC SECOND PERMIT'};
 const ambiguous=run({inventory:[selectedRaw,other]});
 for(const dataset of ['casing','plugging']){assert.equal(ambiguous[dataset].link.status,'ambiguous');assert.equal(ambiguous[dataset].link.reason,'multiple_inventory_rows');assert.deepEqual(ambiguous[dataset].link.candidates.map(c=>c.selected),[true,false]);assert.equal(ambiguous[dataset].link.candidates[1].uic_number,'000999999');}
 assert.equal(ambiguous.plugging.link.wellbore_row_count,0,'zero wellbore rows are still ambiguous');
 assert.deepEqual(ambiguous.casing.quality.counts,{raw:8,parsed:8,accepted:8,quarantined:0,excluded:0},'OD-3: rows are accepted, not quarantined');
 assert.ok(ambiguous.casing.rows.every(row=>row.wellbore_link_status==='ambiguous'&&!row.quality_flags.some(flag=>/^(ambiguous|unmatched)/.test(flag))));
 const capped=run({inventory:[selectedRaw,...Array.from({length:24},(_,i)=>({...other,uic_number:String(900000000+i)}))]});
 assert.equal(capped.casing.link.reason,'inventory_cap_reached');assert.equal(capped.casing.link.candidates.length,25);assert.equal(capped.plugging.link.status,'ambiguous');
 assert.equal(presenceSentence('casing',capped.casing.link),'Several inventory permits carry this API number. These rows belong to the reported API and are attributed to no single UIC.');
});
test('scope contradictions are violations or source_scope flags, never statuses',()=>{
 const other={...selectedRaw,uic_number:'000999999'};
 assert.deepEqual(run({inventory:[other]}).violations,['selected_row_absent']);
 assert.deepEqual(run({inventory:[]}).violations,['selected_row_absent']);
 assert.deepEqual(run({inventory:[selectedRaw,{...other,api_no:'20332897'}]}).violations,['source_scope:api_no']);
 const foreign=run({casing:[casingRow({api_no:'20332897'})]});
 assert.deepEqual(foreign.violations,[]);assert.ok(foreign.casing.rows[0].quality_flags.includes('source_scope:api_no'));assert.ok(wellboreScopeFailure(foreign));
 assert.ok(wellboreScopeFailure(run({inventory:[]})));assert.equal(wellboreScopeFailure(run()),false);
});
test('negative (b)/(d): a monthly row with the inventory api_no but a foreign uic_no stays unmatched; casing/plugging rows carry no UIC or parent key',()=>{
 const inventory=[{...selectedRaw}],monthly=[{uic_no:'000999999',api_no:selectedRaw.api_no,id:'1',formatted_date:'2024-01-01T00:00:00.000',vol_liq:'1',vol_gas:'0',inj_press_avg:'1',inj_press_max:'1'}];
 const result=normalize(inventory,monthly,sourceIds,null);
 assert.equal(result.monthly[0].parent_join_status,'unmatched');assert.equal(result.monthly[0].parent_key,'');
 const {casing,plugging}=run({plugging:plugs.map(row=>({...row,api_no:api}))});
 for(const row of [...casing.rows,...plugging.rows]){assert.equal(Object.hasOwn(row,'uic_number'),false);assert.equal(Object.hasOwn(row,'parent_key'),false);assert.equal(Object.hasOwn(row,'uic_no'),false);}
 for(const columns of Object.values(wellboreColumns))assert.ok(!columns.some(column=>/uic|parent/.test(column)));
});
test('negative (c): src/wellbore.mjs never imports normalize(), never reads uic_no and receives no monthly rows',async()=>{
 const source=await readFile(new URL('src/wellbore.mjs',root),'utf8');
 const imports=[...source.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gm)].map(match=>[match[2],match[1].split(',').map(name=>name.trim())]);
 assert.deepEqual(Object.fromEntries(imports),{'./normalize.mjs':['numberField','csv'],'./sources.mjs':['sourceScopeFlags','officialWellboreDocuments','wellboreOrder'],'./lookup.mjs':['sameIdentity'],'../public/quality-validation.js':['rowDisposition']});
 assert.equal(source.split('\n').filter(line=>line.startsWith('import')).length,4);
 assert.doesNotMatch(source,/uic_no\b/);assert.doesNotMatch(source,/\bmonthly\b/i);assert.doesNotMatch(source,/qq2j-f2zm/);
});
const forbidden=/compliant|non-compliant|violation|plugged and abandoned|not plugged|properly|adequate|safe/i;
const allowed=['No casing rows were returned by the exact-API query; this does not show that no casing exists.','No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged.'];
const assertNoComplianceWording=(text,label)=>{let rest=text;for(const sentence of allowed)rest=rest.split(sentence).join('');assert.doesNotMatch(rest,forbidden,label);};
test('no compliance wording in rows, quality, links or the dictionary (fixed negated sentences allow-listed)',()=>{
 const {casing,plugging}=run({plugging:plugs.map(row=>({...row,api_no:api}))});
 assertNoComplianceWording(JSON.stringify({casing,plugging}),'normalized output');
 assertNoComplianceWording(JSON.stringify(wellboreDictionary()),'dictionary');assertNoComplianceWording(JSON.stringify(wellboreDictionary({testFixture:true,provenance:{classification:'test_fixture',basis:'x'}})),'fixture dictionary');
});
test('dictionary: every column covered, ft/in units only with an official-document citation, required notes present',()=>{
 const dictionary=wellboreDictionary();
 assert.deepEqual(dictionary.tables,{casing:[...wellboreColumns.casing],plugging:[...wellboreColumns.plugging]});
 for(const column of new Set([...wellboreColumns.casing,...wellboreColumns.plugging])){
  const entry=dictionary.fields[column];assert.ok(entry,column);
  assert.deepEqual(Object.keys(entry),['units','status','definition','source_field','basis','note']);
  assert.ok(entry.note.startsWith('ODP publishes no column descriptions.'),column);assert.ok(['public reported','calculated'].includes(entry.status),column);
  if(/\b(ft|in)\b/.test(entry.units))assert.match(entry.basis,/^official_document:/,column);
 }
 assert.equal(Object.keys(dictionary.fields).length,new Set([...wellboreColumns.casing,...wellboreColumns.plugging]).size);
 assert.equal(dictionary.fields.csg_depth.units,'ft');assert.equal(dictionary.fields.csg_size.units,'in');assert.equal(dictionary.fields.cmt_sacks.units,'sacks');assert.match(dictionary.fields.toc.units,/INFERRED/);assert.match(dictionary.fields.total_depth_w3.units,/INFERRED/);
 assert.match(dictionary.fields.record_sequence.note,/filing sequence shared by several rows; not a row key; repeats are normal/i);
 assert.match(dictionary.fields.on_top_record.note,/true only where the source sets it; absent in source is shown empty and is not false; never derived from sequence or date/i);
 assert.match(dictionary.fields.source_id.note,/the only observed unique row key/i);
 assert.match(dictionary.fields.depth_reference_code.note,/shown verbatim; meaning undocumented in ODP metadata/i);
 assert.match(dictionary.fields.toc.note,/zero kept as zero; whether 0 means surface or not reported is undocumented/i);
 assert.match(dictionary.fields.wellbore_link_status.note,/inventory_api_no link status \(ADR 004 §2\); not a statement about the well/);
 assert.doesNotMatch(dictionary.row_grain.casing,/one row per API # per casing string/);
 assert.deepEqual(Object.keys(dictionary.conflicts),['C2','C3','C4','C5','C6','C7']);
 assert.deepEqual(dictionary.documents.map(document=>document.name),['wellbore-wba091.pdf','form-w2.pdf','form-w3.pdf']);
 const fixture=wellboreDictionary({testFixture:true,provenance:{classification:'test_fixture',basis:'recorded_test_fixture'}});
 assert.equal(fixture.fields.csg_depth.status,'synthetic');assert.equal(fixture.fields.source_row_key.status,'calculated');assert.match(fixture.row_grain.casing,/test fixture/);
});
