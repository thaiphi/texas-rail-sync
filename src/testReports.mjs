// RRC-13: UIC-keyed BHP (qxfy-wcfs) and SRT (h54t-xnbi) test-report normalization.
// Grain: one retained source row; rows are never merged, dropped or converted.
// Pure: no I/O. Output is an additive sidecar and never enters normalize()'s quality.
import {numberField,csv} from './normalize.mjs';
import {sourceScopeFlags,officialTestDocuments,testReportOrder} from './sources.mjs';
import {rowDisposition} from '../public/quality-validation.js';
export const testColumns=Object.freeze({
 bhp:Object.freeze(['source_row_key','parent_key','parent_join_status','uic_number','source_report_id','tracking_no','test_sequence_no','report_conducted_date','report_conducted_date_text','report_received_date','report_received_date_text','bhp_psia','test_depth_ft','gradient_psi_ft','tested_formation','source_snapshot_id','quality_flags']),
 srt:Object.freeze(['source_row_key','parent_key','parent_join_status','uic_number','source_report_id','tracking_no','srt_received_date','srt_received_date_text','test_date','test_date_text','satisfactory_test_code','top_perf_ft','bottom_perf_ft','formation_tested','min_inj_rate_bpm','max_inj_rate_bpm','isip_psig','formation_frac_press_psig','frac_inj_rate_capacity_bpd','surface_pressure_firc_psig','fracture_gradient_psi_ft','comments','source_snapshot_id','quality_flags'])
});
const str=value=>value==null?'':String(value);
// Only YYYY-MM-DD that is also a real Gregorian date. Missing is accepted (flagged);
// anything else is a quarantined parse failure. The original text is always kept.
function dateField(value,flags,name){
 const text=str(value);
 if(value===undefined||value===null||text.trim()===''){flags.push(`missing:${name}`);return {date:null,text};}
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
 const valid=match&&Number(match[2])>=1&&Number(match[2])<=12&&Number(match[3])>=1&&Number(match[3])<=new Date(Date.UTC(Number(match[1]),Number(match[2]),0)).getUTCDate();
 if(!valid){flags.push(`parse_failure:${name}`);return {date:null,text};}
 return {date:text,text};
}
// invalid_negative applies to ft, bbl/min, bbl/day and psia fields; never to psig
// fields and not to the psi/ft gradient fields (a separate unit in the contract).
const nonNegative=new Set(['bhp_psia','test_depth_ft','top_perf_ft','bottom_perf_ft','min_inj_rate_bpm','max_inj_rate_bpm','frac_inj_rate_capacity_bpd']);
function numbers(row,flags,names){
 const values={};
 for(const name of names){values[name]=numberField(row[name],flags,name);if(nonNegative.has(name)&&values[name]!==null&&values[name]<0)flags.push(`invalid_negative:${name}`);}
 return values;
}
const identity={bhp:row=>`${str(row.report_id)}|${str(row.tracking_no)}|${str(row.test_sequence_no)}`,srt:row=>`${str(row.report_id)}|${str(row.tracking_no)}`};
function normalizeKind(kind,rows,sourceIds,byUic,scope){
 const seen=new Map();for(const row of rows)seen.set(identity[kind](row),(seen.get(identity[kind](row))??0)+1);
 return rows.map((r,i)=>{
  const flags=[],parents=byUic.get(str(r.uic_no))??[];
  const join=parents.length===1?'matched':parents.length===0?'unmatched':'ambiguous';
  if(join!=='matched')flags.push(`${join}:parent`);
  if(!str(r.report_id).trim())flags.push('invalid:source_report_id');
  if(seen.get(identity[kind](r))>1)flags.push('duplicate_report_identity');
  const common={source_row_key:`rrc:${kind}:${sourceIds[kind]}:${i+1}`,parent_key:join==='matched'?parents[0].source_record_key:'',parent_join_status:join,uic_number:str(r.uic_no),source_report_id:str(r.report_id),tracking_no:str(r.tracking_no)};
  let row;
  if(kind==='bhp'){
   const conducted=dateField(r.report_conducted_date,flags,'report_conducted_date'),received=dateField(r.report_received_date,flags,'report_received_date');
   const n=numbers(r,flags,['bhp_psia','test_depth_ft','gradient_psi_ft']);
   row={...common,test_sequence_no:str(r.test_sequence_no),report_conducted_date:conducted.date,report_conducted_date_text:conducted.text,report_received_date:received.date,report_received_date_text:received.text,...n,tested_formation:str(r.tested_formation)};
  }else{
   const received=dateField(r.srt_received_date,flags,'srt_received_date'),tested=dateField(r.test_date,flags,'test_date');
   const perf=numbers(r,flags,['top_perf_ft','bottom_perf_ft']),rate=numbers(r,flags,['min_inj_rate_bpm','max_inj_rate_bpm']),rest=numbers(r,flags,['isip_psig','formation_frac_press_psig','frac_inj_rate_capacity_bpd','surface_pressure_firc_psig','fracture_gradient_psi_ft']);
   if(perf.top_perf_ft!==null&&perf.bottom_perf_ft!==null&&perf.top_perf_ft>perf.bottom_perf_ft)flags.push('inconsistent:top_perf_exceeds_bottom');
   if(rate.min_inj_rate_bpm!==null&&rate.max_inj_rate_bpm!==null&&rate.min_inj_rate_bpm>rate.max_inj_rate_bpm)flags.push('inconsistent:min_rate_exceeds_max');
   row={...common,srt_received_date:received.date,srt_received_date_text:received.text,test_date:tested.date,test_date_text:tested.text,satisfactory_test_code:str(r.satisfactory_test),...perf,formation_tested:str(r.formation_tested),...rate,...rest,comments:str(r.comments)};
  }
  if(scope)flags.push(...sourceScopeFlags(kind,r,scope));
  return {...row,source_snapshot_id:sourceIds[kind],quality_flags:flags};
 });
}
// inventory: normalized inventory rows (source_record_key, uic_number), exact UIC join (ADR 004).
export function normalizeTests({bhp,srt},sourceIds,inventory,scope=null){
 const byUic=new Map();for(const r of inventory){const a=byUic.get(r.uic_number)??[];a.push(r);byUic.set(r.uic_number,a);}
 const rows={bhp:normalizeKind('bhp',bhp,sourceIds,byUic,scope),srt:normalizeKind('srt',srt,sourceIds,byUic,scope)};
 const counts=list=>({raw:list.length,parsed:list.length,accepted:list.filter(r=>rowDisposition(r)==='accepted').length,quarantined:list.filter(r=>rowDisposition(r)==='quarantined').length,excluded:0});
 const join=list=>({matched:list.filter(r=>r.parent_join_status==='matched').length,unmatched:list.filter(r=>r.parent_join_status==='unmatched').length,ambiguous:list.filter(r=>r.parent_join_status==='ambiguous').length});
 const issues=list=>{const out={};for(const r of list)for(const flag of r.quality_flags)out[flag]=(out[flag]??0)+1;return out;};
 const dispositions=list=>list.map(r=>({source_row_key:r.source_row_key,disposition:rowDisposition(r),...(rowDisposition(r)==='quarantined'?{reasons:[...r.quality_flags]}:{})}));
 return {...rows,quality:{bhp:counts(rows.bhp),srt:counts(rows.srt),parent_join:{bhp:join(rows.bhp),srt:join(rows.srt)},issue_counts:{bhp:issues(rows.bhp),srt:issues(rows.srt)},dispositions:[...dispositions(rows.bhp),...dispositions(rows.srt)],
  duplicate_policy:'Every source row retained. Rows sharing a report identity (BHP report_id|tracking_no|test_sequence_no; SRT report_id|tracking_no) are all flagged duplicate_report_identity and quarantined; no preferred row is selected or merged.',
  empty_result_policy:'An empty exact-UIC response ([]) is recorded as confirmed_empty: no rows were returned by the query. It does not show that no test was conducted.'}};
}
const NO_DESCRIPTIONS='ODP publishes no column descriptions.';
const SRT_CONCEPT='Concept per official RRC step rate test guidelines (srt-guidelines.html); units from the ODP field name.';
// [units, status, definition, source_field, basis, note]
const fieldDefinitions={
 source_row_key:['string','calculated','Dataset snapshot plus 1-based raw response ordinal; retained duplicates stay distinct',null,'calculated',''],
 parent_key:['string','calculated','Inventory source_record_key when the exact uic_no string matches exactly one retained inventory parent (ADR 004 inventory_to_test_report)','uic_no','calculated',''],
 parent_join_status:['enum','calculated','matched / unmatched / ambiguous by exact UIC string','uic_no','calculated',''],
 uic_number:['string','public reported','Original nine-character uic_no; preserves leading zeros','uic_no','odp_field_name',''],
 source_report_id:['string','public reported','Original report_id kept as a string; part of the report identity','report_id','odp_field_name','Identity value; meaning undocumented.'],
 tracking_no:['string','public reported','Original tracking_no kept as a string; part of the report identity','tracking_no','odp_field_name','Identity value; meaning undocumented.'],
 test_sequence_no:['string','public reported','Original test_sequence_no kept as a string; part of the BHP report identity','test_sequence_no','odp_field_name','Identity value; meaning undocumented.'],
 report_conducted_date:['date','public reported','report_conducted_date when it is a valid YYYY-MM-DD date; otherwise empty','report_conducted_date','odp_field_name',''],
 report_conducted_date_text:['text','public reported','Original report_conducted_date text exactly as published','report_conducted_date','odp_field_name',''],
 report_received_date:['date','public reported','report_received_date when it is a valid YYYY-MM-DD date; otherwise empty','report_received_date','odp_field_name',''],
 report_received_date_text:['text','public reported','Original report_received_date text exactly as published','report_received_date','odp_field_name',''],
 bhp_psia:['psia as named by the ODP field','public reported','Reported bottom hole pressure as published','bhp_psia','odp_field_name','Official RRC Permian guidance (bhp-permian-nto.pdf p.1) states BHP is reported in PSIG; the ODP field name says psia. The conflict is unresolved; the value is shown as published and never converted. That guidance covers Permian districts 7C, 8, 8A and Fisher County only.'],
 test_depth_ft:['ft','public reported','Reported test depth as published','test_depth_ft','odp_field_name','Reported depth; depth basis unstated (measured or true vertical depth is not documented).'],
 gradient_psi_ft:['psi/ft','public reported','Reported BHP gradient as published','gradient_psi_ft','odp_field_name','Meaning unstated; not the SRT fracture gradient.'],
 tested_formation:['name','public reported','Original tested_formation text','tested_formation','odp_field_name',''],
 srt_received_date:['date','public reported','srt_received_date when it is a valid YYYY-MM-DD date; otherwise empty','srt_received_date','odp_field_name',''],
 srt_received_date_text:['text','public reported','Original srt_received_date text exactly as published','srt_received_date','odp_field_name',''],
 test_date:['date','public reported','test_date when it is a valid YYYY-MM-DD date; otherwise empty','test_date','odp_field_name',''],
 test_date_text:['text','public reported','Original test_date text exactly as published','test_date','odp_field_name',''],
 satisfactory_test_code:['source code','public reported','Original satisfactory_test value shown verbatim','satisfactory_test','odp_field_name','Values 0/1 shown verbatim; code meaning undocumented.'],
 top_perf_ft:['ft','public reported','Reported top perforation depth as published','top_perf_ft','odp_field_name','Depth basis unstated.'],
 bottom_perf_ft:['ft','public reported','Reported bottom perforation depth as published','bottom_perf_ft','odp_field_name','Depth basis unstated.'],
 formation_tested:['name','public reported','Original formation_tested text','formation_tested','odp_field_name',''],
 min_inj_rate_bpm:['bbl/min (bpm as named)','public reported','Reported minimum step injection rate as published','min_inj_rate_bpm','official_document:srt-guidelines.html',SRT_CONCEPT],
 max_inj_rate_bpm:['bbl/min (bpm as named)','public reported','Reported maximum step injection rate as published','max_inj_rate_bpm','official_document:srt-guidelines.html',SRT_CONCEPT],
 isip_psig:['psig','public reported','Reported instantaneous shut-in pressure as published','isip_psig','official_document:srt-guidelines.html',SRT_CONCEPT+' The guidance records ISIP at both the surface and the bottom hole; which one this column holds is unstated.'],
 formation_frac_press_psig:['psig','public reported','Reported formation fracture (parting) pressure as published','formation_frac_press_psig','official_document:srt-guidelines.html',SRT_CONCEPT],
 frac_inj_rate_capacity_bpd:['bbl/day','public reported','Reported value as published','frac_inj_rate_capacity_bpd','odp_field_name','FIRC is not defined in any RRC document found; meaning unverified. Units from the ODP field name.'],
 surface_pressure_firc_psig:['psig','public reported','Reported value as published','surface_pressure_firc_psig','odp_field_name','FIRC is not defined in any RRC document found; meaning unverified. Units from the ODP field name.'],
 fracture_gradient_psi_ft:['psi/ft','public reported','Reported fracture gradient as published','fracture_gradient_psi_ft','official_document:srt-guidelines.html',SRT_CONCEPT],
 comments:['text','public reported','Original comments text verbatim','comments','odp_field_name','Verbatim text; meaning undocumented.'],
 source_snapshot_id:['string','calculated','Dataset ID plus raw response SHA256 prefix',null,'calculated',''],
 quality_flags:['list','calculated','Pipe-delimited issues; issues may overlap',null,'calculated','']
};
const documentSupport={'srt-guidelines.html':'SRT purpose, fracture (parting) pressure, fracture gradient in psi/ft, ISIP recorded at shut-in, stepped injection rates','bhp-permian-nto.pdf':'BHP method and unit, p.1; Permian districts 7C, 8, 8A and Fisher County only; states "Operator shall report pressure (PSIG)"'};
// Same shape as data_dictionary.json (flat fields), plus per-table column order.
export function testsDictionary({testFixture=false,provenance=null}={}){
 const fields={};
 for(const column of [...new Set([...testColumns.bhp,...testColumns.srt])]){
  const [units,status,definition,source_field,basis,note]=fieldDefinitions[column];
  fields[column]={units,status:testFixture&&status==='public reported'?'synthetic':status,definition,source_field,basis,note:(NO_DESCRIPTIONS+(note?' '+note:'')).trim()};
 }
 return {schema_version:1,row_grain:testFixture?{bhp:'one retained test fixture BHP row',srt:'one retained test fixture SRT row'}:{bhp:'one retained official BHP report-inventory row (qxfy-wcfs)',srt:'one retained official SRT report-inventory row (h54t-xnbi)'},
  ...(testFixture&&provenance?{provenance:{...provenance}}:{}),
  missing_value:'CSV empty cell / JSON null for absent numbers or dates. Zero remains zero. String absence is empty string.',
  date_policy:'Only valid YYYY-MM-DD dates are parsed; the original text is always kept in the matching _text column.',
  unit_policy:'Units come from the ODP field-name suffix unless an entry cites an official document. Values are shown as reported; psia and psig are kept as labelled and never converted.',
  window:'Exact uic_no; not limited to the reporting period.',
  documents:officialTestDocuments.map(document=>({...document,supports:documentSupport[document.name]})),
  not_cited:'Form W-7 (oil and gas wells, not UIC), conference slides and the versioned review spreadsheet are not used as evidence.',
  order:{...testReportOrder},
  tables:{bhp:[...testColumns.bhp],srt:[...testColumns.srt]},
  fields};
}
export const testsCsv=(rows,kind)=>csv(rows,testColumns[kind]);
