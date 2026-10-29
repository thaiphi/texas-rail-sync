// RRC-14: API-keyed casing (u9m4-xnh6) and plugging (wfzn-9fje) normalization (ADR 004 §2-3).
// Grain: one retained source row; rows are never merged, collapsed, dropped or converted.
// Pure: no I/O. Casing and plugging rows link to the wellbore (source_api_id) only; the link
// object alone relates the wellbore to the selected inventory row. Rows never carry a UIC or
// parent key, and no H-10 row ever reaches this module.
import {numberField,csv} from './normalize.mjs';
import {sourceScopeFlags,officialWellboreDocuments,wellboreOrder} from './sources.mjs';
import {sameIdentity} from './lookup.mjs';
import {rowDisposition} from '../public/quality-validation.js';
const common=['source_row_key','source_api_id','wellbore_link_status','source_id','api_no','record_sequence','on_top_record'];
export const wellboreColumns=Object.freeze({
 casing:Object.freeze([...common,'completion_date','completion_date_text','csg_size','hole_size','csg_depth','toc','multi_stg_depth','cmt_sacks','total_depth_g1w2','depth_reference','depth_reference_code','source_snapshot_id','quality_flags']),
 plugging:Object.freeze([...common,'w3_date','w3_date_text','plug_top_depth','plug_bottom_depth','plug_cmt_sacks','total_depth_w3','depth_reference','depth_reference_code','source_snapshot_id','quality_flags'])
});
const numeric={casing:['csg_size','hole_size','csg_depth','toc','multi_stg_depth','cmt_sacks','total_depth_g1w2','depth_reference'],plugging:['plug_top_depth','plug_bottom_depth','plug_cmt_sacks','total_depth_w3','depth_reference']};
const dateName={casing:'completion_date',plugging:'w3_date'};
// Metadata `smallest` >= 0 for each; depth_reference (meaning undocumented) is excluded.
const nonNegative=new Set(['csg_size','hole_size','csg_depth','toc','multi_stg_depth','cmt_sacks','total_depth_g1w2','plug_top_depth','plug_bottom_depth','plug_cmt_sacks','total_depth_w3']);
const candidateFields=['uic_number','api_no','operator_number','district_code','lease_number','lease_name','well_no_display','w14_number'];
const str=value=>value==null?'':String(value);
// calendar_date arrives as YYYY-MM-DDT00:00:00.000. Only that exact form with a valid
// Gregorian month and day is parsed; missing is accepted (flagged); anything else, including
// a plain YYYY-MM-DD or another time of day, is a quarantined parse failure. Text is kept.
function dateField(value,flags,name){
 const text=str(value);
 if(value===undefined||value===null||text.trim()===''){flags.push(`missing:${name}`);return {date:null,text};}
 const match=/^(\d{4})-(\d{2})-(\d{2})T00:00:00\.000$/.exec(text);
 const valid=match&&Number(match[2])>=1&&Number(match[2])<=12&&Number(match[3])>=1&&Number(match[3])<=new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).getUTCDate();
 if(!valid){flags.push(`parse_failure:${name}`);return {date:null,text};}
 return {date:`${match[1]}-${match[2]}-${match[3]}`,text};
}
// A JSON boolean present only where the source sets it. Absent is "not set" (no flag), never
// false; it is never derived from record_sequence or a date.
function onTopRecord(value,flags){
 if(value===undefined||value===null)return null;
 if(value===true||value===false)return value;
 flags.push('parse_failure:on_top_record');return null;
}
const statusSentences={
 casing_none_no_source_rows:'No casing rows were returned by the exact-API query; this does not show that no casing exists.',
 plugging_none_no_source_rows:'No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged.',
 none_api_missing_or_invalid:'The selected inventory row has no eight-digit API number, so no casing or plugging query was made.',
 ambiguous:'Several inventory permits carry this API number. These rows belong to the reported API and are attributed to no single UIC.',
 matched:'The source API string equals the selected inventory row\'s API string. An eight-digit API cannot distinguish sidetracks or recompletions.'
};
export const presenceSentence=(dataset,link)=>link.status==='none'?statusSentences[link.reason==='no_source_rows'?`${dataset}_none_no_source_rows`:'none_api_missing_or_invalid']:statusSentences[link.status];
function normalizeRows(dataset,rows,sourceIds,scope,status){
 const ids=new Map();for(const r of rows){const id=str(r?.id);if(id.trim())ids.set(id,(ids.get(id)??0)+1);}
 return rows.map((r,i)=>{
  const flags=[],id=str(r?.id);
  if(!id.trim())flags.push('invalid:source_id');
  else if(ids.get(id)>1)flags.push('duplicate_source_id');
  const sequence=str(r?.record_sequence);if(!sequence.trim())flags.push('missing:record_sequence');
  const onTop=onTopRecord(r?.on_top_record,flags),date=dateField(r?.[dateName[dataset]],flags,dateName[dataset]);
  const values={};for(const name of numeric[dataset]){values[name]=numberField(r?.[name],flags,name);if(nonNegative.has(name)&&values[name]!==null&&values[name]<0)flags.push(`invalid_negative:${name}`);}
  if(dataset==='plugging'&&values.plug_top_depth!==null&&values.plug_bottom_depth!==null&&values.plug_top_depth>values.plug_bottom_depth)flags.push('inconsistent:plug_top_exceeds_bottom');
  if(scope)flags.push(...sourceScopeFlags(dataset,r,scope));
  const head={source_row_key:`rrc:${dataset}:${sourceIds[dataset]}:${i+1}`,source_api_id:scope?.sourceApiId??null,wellbore_link_status:status,source_id:id,api_no:str(r?.api_no),record_sequence:sequence,on_top_record:onTop};
  const body=dataset==='casing'
   ?{completion_date:date.date,completion_date_text:date.text,csg_size:values.csg_size,hole_size:values.hole_size,csg_depth:values.csg_depth,toc:values.toc,multi_stg_depth:values.multi_stg_depth,cmt_sacks:values.cmt_sacks,total_depth_g1w2:values.total_depth_g1w2}
   :{w3_date:date.date,w3_date_text:date.text,plug_top_depth:values.plug_top_depth,plug_bottom_depth:values.plug_bottom_depth,plug_cmt_sacks:values.plug_cmt_sacks,total_depth_w3:values.total_depth_w3};
  return {...head,...body,depth_reference:values.depth_reference,depth_reference_code:str(r?.depth_reference_code),source_snapshot_id:sourceIds[dataset],quality_flags:flags};
 });
}
const policies=dataset=>({
 duplicate_policy:'Every source row retained. The only duplicate rule is a repeated source id within one response: every occurrence is flagged duplicate_source_id and quarantined. Rows identical apart from id, record_sequence or date (the same string re-filed) are normal and unflagged. No preferred row is selected or merged.',
 empty_result_policy:dataset==='casing'?statusSentences.casing_none_no_source_rows:statusSentences.plugging_none_no_source_rows,
 presence_policy:'Only whether rows were returned is stated. Rows returned or not returned say nothing about casing, cementing or plugging status.',
 record_sequence_policy:'record_sequence is a filing sequence shared by several rows; it is not a row key, repeats are normal and never flagged, and it is kept verbatim without being used for ordering beyond the source order (record_sequence,id).',
 on_top_record_policy:'on_top_record is true only where the source sets it; absent in source is shown empty (not false) with no flag; a non-boolean value is a quarantined parse failure; it is never derived from record_sequence or a date.'
});
// wellbore: {inventory,casing,plugging} raw arrays (null when not queried); sourceIds from the
// load; selected: {row: normalized selected inventory row, raw: raw selected inventory row};
// scope: the v4 scope; queries: {inventory,casing,plugging} each {url,sha256} or null.
// Predicate contradictions are returned as violations (never statuses); callers fail the run.
export function normalizeWellbore(wellbore,sourceIds,selected,scope,queries){
 const apiId=scope?.sourceApiId??null,inventory=wellbore?.inventory??null,violations=[];
 if(apiId!==null){
  if(!Array.isArray(inventory)||!Array.isArray(wellbore?.casing)||!Array.isArray(wellbore?.plugging))throw Object.assign(Error('Wellbore responses are missing'),{code:'SOURCE_INVALID'});
  if(inventory.some(row=>!row||typeof row!=='object'||sourceScopeFlags('wellbore_inventory',row,scope).length))violations.push('source_scope:api_no');
  if(!inventory.some(row=>row&&typeof row==='object'&&sameIdentity(row,selected.raw)))violations.push('selected_row_absent');
 }
 const out={violations};
 for(const dataset of ['casing','plugging']){
  const raw=apiId===null?[]:wellbore[dataset];
  let status,reason;
  if(apiId===null){status='none';reason='api_missing_or_invalid';}
  else if(inventory.length>=scope.wellboreInventoryLimit){status='ambiguous';reason='inventory_cap_reached';}
  else if(inventory.length>=2){status='ambiguous';reason='multiple_inventory_rows';}
  else if(!raw.length){status='none';reason='no_source_rows';}
  else{status='matched';reason=null;}
  const query=(item,rows)=>item?{url:item.url,sha256:item.sha256,rows}:null;
  const link={inventory_source_record_key:selected.row.source_record_key,source_api_id:apiId,basis:'inventory_api_no',status,reason,
   inventory_query:apiId===null?null:query(queries?.inventory,inventory.length),wellbore_query:apiId===null?null:query(queries?.[dataset],raw.length),
   candidates:apiId===null?[]:inventory.map((row,i)=>({candidate_key:`rrc:uic:${sourceIds.wellbore_inventory}:${i+1}`,selected:Boolean(row&&typeof row==='object'&&sameIdentity(row,selected.raw)),...Object.fromEntries(candidateFields.map(key=>[key,str(row?.[key])]))})),
   wellbore_row_count:raw.length};
  const rows=normalizeRows(dataset,raw,sourceIds,scope,status);
  const issues={};for(const r of rows)for(const flag of r.quality_flags)issues[flag]=(issues[flag]??0)+1;
  out[dataset]={link,rows,quality:{counts:{raw:raw.length,parsed:rows.length,accepted:rows.filter(r=>rowDisposition(r)==='accepted').length,quarantined:rows.filter(r=>rowDisposition(r)==='quarantined').length,excluded:0},issue_counts:issues,
   dispositions:rows.map(r=>({source_row_key:r.source_row_key,disposition:rowDisposition(r),...(rowDisposition(r)==='quarantined'?{reasons:[...r.quality_flags]}:{})})),...policies(dataset)}};
 }
 return out;
}
// Shared by the export core and buildArtifact: selected/queries come from the loaded snapshot.
export function normalizeSnapshotWellbore(snapshot,normalizedInventory){
 const query=name=>{const source=snapshot.sources.find(s=>s.name===name);return source?{url:source.url,sha256:source.sha256}:null;};
 return normalizeWellbore(snapshot.wellbore,snapshot.sourceIds,{row:normalizedInventory[0],raw:snapshot.inventory[0]},snapshot.scope,{inventory:query('wellbore-inventory'),casing:query('candidate-casing'),plugging:query('candidate-plugging')});
}
export const wellboreScopeFailure=result=>result.violations.length>0||[...result.casing.rows,...result.plugging.rows].some(row=>row.quality_flags.some(flag=>flag.startsWith('source_scope:')));
const NO_DESCRIPTIONS='ODP publishes no column descriptions.';
const W2='official_document:form-w2.pdf',W3='official_document:form-w3.pdf',WBA='official_document:wellbore-wba091.pdf';
// [units, status, definition, source_field, basis, note]
const fieldDefinitions={
 source_row_key:['string','calculated','Dataset snapshot plus 1-based raw response ordinal; retained duplicates stay distinct',null,'calculated',''],
 source_api_id:['string','calculated','The selected inventory row\'s own api_no string (ADR 004 wellbore domain); rows link to this wellbore, never directly to a UIC','api_no (inventory givw-z9t4)','calculated',''],
 wellbore_link_status:['enum','calculated','matched / none / ambiguous for this dataset\'s inventory_api_no link, repeated on every row','api_no','calculated','inventory_api_no link status (ADR 004 §2); not a statement about the well.'],
 source_id:['string','public reported','Original source id kept as a string','id','odp_field_name','The only observed unique row key; a repeated id is flagged duplicate_source_id and quarantined.'],
 api_no:['string','public reported','Original api_no exactly as published; equal to source_api_id by string comparison only','api_no','odp_field_name','Never padded, trimmed or converted. An eight-digit API cannot distinguish sidetracks or recompletions.'],
 record_sequence:['text','public reported','Original record_sequence shown verbatim','record_sequence','odp_field_name','Filing sequence shared by several rows; not a row key; repeats are normal. Meaning UNSTATED by any official source; not chronological in observed data.'],
 on_top_record:['boolean','public reported','true or false only where the source publishes it; otherwise empty','on_top_record','odp_field_name','True only where the source sets it; absent in source is shown empty and is not false; never derived from sequence or date. Meaning UNSTATED by any official source.'],
 completion_date:['date','public reported','completion_date as YYYY-MM-DD when the source value is a valid calendar date at T00:00:00.000; otherwise empty','completion_date','odp_field_name','Which source date this is is not documented (completion, W-2/G-1 or file date; WBA091 p.2-15 lists several). Values are shown as published with no plausibility rule (C6).'],
 completion_date_text:['text','public reported','Original completion_date text exactly as published','completion_date','odp_field_name',''],
 csg_size:['in','public reported','Casing size as published','csg_size',`${W2}, p.2 item 36 "Casing Size (in.)"; wellbore-wba091.pdf, p.2-21 WB-CAS-INCH`,'CONFIRMED unit. Decimal inches as published; the legacy fraction-to-decimal conversion is INFERRED. Extremes such as 99.625 are kept as published (C6).'],
 hole_size:['in','public reported','Hole size as published','hole_size',`${W2}, p.2 item 36 "Hole Size (in.)"; wellbore-wba091.pdf, p.2-22 WB-HOLE-INCH`,'CONFIRMED unit. Extremes such as 100.0 are kept as published (C6).'],
 csg_depth:['ft','public reported','Casing setting depth as published','csg_depth',`${W2}, p.2 item 36 "Setting Depth (ft.)"; wellbore-wba091.pdf, p.2-21 WB-CASING-DEPTH-SET`,'CONFIRMED unit. Depth basis is not stated.'],
 toc:['ft (INFERRED)','public reported','Top of cement as published: "minimum depth up to which cement was circulated" (WBA091 p.2-22)','toc',`${WBA}, p.2-22 WB-TOP-OF-CEMENT-CASING; form-w2.pdf, p.2 item 36 "Top of Cement" (no unit)`,'CONFIRMED meaning; unit INFERRED from the other form depth columns. Zero kept as zero; whether 0 means surface or not reported is undocumented (C5). Values such as 4000300.0 are kept as published (C6).'],
 multi_stg_depth:['ft','public reported','Multi-stage cementing tool depth as published','multi_stg_depth',`${W2}, p.2 item 36 "Multi-Stage Tool Depth (ft.)"; wellbore-wba091.pdf, p.2-21 WB-MLTI-STG-TOOL-DPTH`,'CONFIRMED unit. The source omits empty values, so missing:multi_stg_depth is expected on most rows (accepted).'],
 cmt_sacks:['sacks','public reported','Cement amount for the string as published','cmt_sacks',`${W2}, p.2 item 36 "Cement Amount (sacks)"; wellbore-wba091.pdf, p.2-21 WB-AMOUNT-OF-CEMENT`,'CONFIRMED on the form. WBA091 p.2-22 allows sacks, cubic yards or cubic feet, but the ODP column names sacks with no measurement code; whether legacy records were converted or excluded is not stated (C2).'],
 total_depth_g1w2:['ft','public reported','Total depth reported on the G-1/W-2 as published','total_depth_g1w2',`${W2}, p.1 item 31 "Total Depth (ft.)"`,'CONFIRMED unit.'],
 depth_reference:['ft above mean sea level (INFERRED mapping)','public reported','Well elevation as published','depth_reference',`${WBA}, p.2-15 WB-ELEVATION`,'WBA091 p.2-15 defines the elevation as "MEASUREMENT OF FEET ABOVE MEAN SEA LEVEL OF WELL"; mapping it to this ODP column is INFERRED. No datum conversion and no depth arithmetic. The plugging view\'s value has no Form W-3 item and its origin is unstated (C3). 9999.0 may be a legacy fill value (C6).'],
 depth_reference_code:['source code','public reported','Original depth_reference_code shown verbatim','depth_reference_code',`${WBA}, p.2-15 WB-ELEVATION-CODE`,'Shown verbatim; meaning undocumented in ODP metadata. GL, DF, KB, RT and GR are CONFIRMED elevation reference points (WBA091 p.2-15); every other code: meaning not stated.'],
 w3_date:['date','public reported','w3_date as YYYY-MM-DD when the source value is a valid calendar date at T00:00:00.000; otherwise empty','w3_date','odp_field_name','Which source date this is is not documented (Form W-3 item 15 date or the W-3 filed date; WBA091 p.2-41). Values are shown as published with no plausibility rule (C6).'],
 w3_date_text:['text','public reported','Original w3_date text exactly as published','w3_date','odp_field_name',''],
 plug_top_depth:['ft','public reported','Plug top depth as published','plug_top_depth',`${W3}, p.1 items 24-25 "Calculated Top of Plug (ft.)" / "Measured Top of Plug (if tagged) (ft.)"; wellbore-wba091.pdf, p.2-47`,'CONFIRMED unit. The W-3 has a calculated and a measured plug top; the ODP keeps one, and which one is not stated (C4).'],
 plug_bottom_depth:['ft','public reported','Plug bottom depth as published','plug_bottom_depth',`${W3}, p.1 item 21 "Depth to Bottom of Tubing or Drill Pipe (ft.)"; wellbore-wba091.pdf, p.2-47 WB-BOTTOM-TUBE-PIPE-DEPTH`,'CONFIRMED unit; the mapping to this column is INFERRED from the field name.'],
 plug_cmt_sacks:['sacks','public reported','Cement used for this plug as published','plug_cmt_sacks',`${W3}, p.1 item 22 "Sacks of Cement Used (each plug)"; wellbore-wba091.pdf, p.2-47 WB-NBR-OF-CEMENT-SACKS`,'CONFIRMED unit.'],
 total_depth_w3:['ft (INFERRED)','public reported','Total depth reported on the W-3 as published: "maximum depth of the plugged bore" (WBA091 p.2-41)','total_depth_w3',`${WBA}, p.2-41 WB-PLUG-TOTAL-DEPTH; form-w3.pdf, p.1 "Total Depth" (no unit)`,'CONFIRMED meaning; unit INFERRED from the other W-3 depth items. A published zero is kept as zero; the meaning of a zero total depth is not stated by the source.'],
 source_snapshot_id:['string','calculated','Dataset ID plus raw response SHA256 prefix',null,'calculated',''],
 quality_flags:['list','calculated','Pipe-delimited issues; issues may overlap',null,'calculated','']
};
const documentSupport={'wellbore-wba091.pdf':'WBA091 well bore database manual (May 20, 2019): casing segment, plug record, elevation and elevation code list','form-w2.pdf':'Form W-2 Rev. 01/2014: casing record units (in., ft., sacks) and total depth','form-w3.pdf':'Form W-3 Rev. 08/2019: plug depth units (ft.), sacks per plug, date well plugged'};
const conflicts={
 C2:'cmt_sacks: WBA091 allows cement in sacks, cubic yards or cubic feet; the ODP column names sacks with no measurement code. Nothing is converted.',
 C3:'The plugging view\'s depth_reference and depth_reference_code have no Form W-3 item; their origin is unstated.',
 C4:'The W-3 has a calculated and a measured plug top; the ODP keeps only plug_top_depth, and which one it holds is unstated.',
 C5:'toc 0.0 may mean surface or not reported; zero is kept as zero.',
 C6:'Sentinel-like extremes (for example toc 4000300.0, csg_size 99.625, completion dates to 2070, w3_date from 1893) are kept as published; there is no plausibility rule.',
 C7:'The ODP casing description states one row per API per casing string, but the source repeats strings in each filing (record_sequence); the row grain is restated below.'
};
// Same shape as tests_dictionary.json (flat fields), plus per-table column order.
export function wellboreDictionary({testFixture=false,provenance=null}={}){
 const fields={};
 for(const column of [...new Set([...wellboreColumns.casing,...wellboreColumns.plugging])]){
  const [units,status,definition,source_field,basis,note]=fieldDefinitions[column];
  fields[column]={units,status:testFixture&&status==='public reported'?'synthetic':status,definition,source_field,basis,note:(NO_DESCRIPTIONS+(note?' '+note:'')).trim()};
 }
 return {schema_version:1,row_grain:testFixture?{casing:'one retained test fixture casing row',plugging:'one retained test fixture plugging row'}:{casing:'one retained official casing row (u9m4-xnh6); the source repeats a casing string in each filing (record_sequence), so a row is a string as reported in one filing',plugging:'one retained official plugging row (wfzn-9fje)'},
  ...(testFixture&&provenance?{provenance:{...provenance}}:{}),
  missing_value:'CSV empty cell / JSON null for absent numbers, dates or on_top_record. Zero remains zero. String absence is empty string.',
  date_policy:'Only YYYY-MM-DDT00:00:00.000 values with a valid calendar date are parsed to YYYY-MM-DD; the original text is always kept in the matching _text column.',
  unit_policy:'Units are cited from the official documents below with their CONFIRMED or INFERRED label; values are shown as reported with no unit, datum or depth conversion.',
  window:'Exact api_no of the selected inventory row (basis inventory_api_no); not limited to the reporting period.',
  documents:officialWellboreDocuments.map(document=>({...document,supports:documentSupport[document.name]})),
  conflicts:{...conflicts},
  order:{casing:wellboreOrder,plugging:wellboreOrder},
  tables:{casing:[...wellboreColumns.casing],plugging:[...wellboreColumns.plugging]},
  fields};
}
export const wellboreCsv=(rows,dataset)=>csv(rows,wellboreColumns[dataset]);
