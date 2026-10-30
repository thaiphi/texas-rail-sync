// RRC-15 / E11a single-well reported-depth ladder (Phase 3b spec §8, OD-9, OD-10). Presentation only, browser only:
// no ladder file is exported. Fed only by verified contract/sidecar values handed in by the dossier.
// Values are placed exactly as published: no interpolation, no TVD, measured-depth or datum correction, no elevation
// arithmetic, no reference-code harmonisation, no swapping of interval ends and no "latest" record selection.
import {escapeHtml as escape} from './inspection.js';

export const AXIS_LABEL='Reported depth value (ft as reported; depth basis and reference point vary or are undocumented)';
export const CODE_NOTE='meaning undocumented in ODP metadata';
export const NOT_SUPPLIED='not supplied by this dataset';
export const OMITTED_NOTE='Not shown as depths: depth_reference is an elevation and is never placed on this axis; H-10 toz/boz and inventory prod_casing_pkr_depth exist only in the preserved raw source files and in no contract column, so they are not part of this ladder.';
const MALFORMED='Malformed interval: top exceeds bottom as reported';
const END_MISSING='interval end missing';
const NOT_REPORTED='Not reported';

// Section 8.1, in lane order (dataset lane, then record order, then this field order). Unit labels follow source forms §3.
export const LANES=[
 {lane:'inventory',title:'Inventory permit',fields:[{top:'permitted_top_depth_ft',bottom:'permitted_bottom_depth_ft',unitLabel:'as named in data_dictionary.json; no page citation recorded'}]},
 {lane:'casing',title:'Casing (G-1/W-2)',fields:[
  {point:'csg_depth',unitLabel:'CONFIRMED (Form W-2 item 36; WBA091)'},
  {point:'multi_stg_depth',unitLabel:'CONFIRMED (Form W-2 item 36; WBA091)'},
  {point:'total_depth_g1w2',unitLabel:'CONFIRMED (Form W-2 item 31)'},
  {point:'toc',unitLabel:'INFERRED (unit inferred from the other W-2 depth columns)'}]},
 {lane:'plugging',title:'Plugging (W-3)',fields:[
  {top:'plug_top_depth',bottom:'plug_bottom_depth',unitLabel:'CONFIRMED (Form W-3 items 24/25, 21)'},
  {point:'total_depth_w3',unitLabel:'INFERRED (unit inferred from the other W-3 depth items)'}]},
 {lane:'bhp',title:'BHP test report',fields:[{point:'test_depth_ft',name:'tested_formation',unitLabel:'from field name (odp_field_name)'}]},
 {lane:'srt',title:'SRT report',fields:[{top:'top_perf_ft',bottom:'bottom_perf_ft',name:'formation_tested',unitLabel:'from field name (odp_field_name)'}]}
];
const DICTIONARY={inventory:'dataDictionary',casing:'wellboreDictionary',plugging:'wellboreDictionary',bhp:'testsDictionary',srt:'testsDictionary'};

const present=value=>value!==null&&value!==undefined&&value!=='';
const numeric=value=>typeof value==='number'&&Number.isFinite(value);
const shown=value=>present(value)?String(value):NOT_REPORTED;
// Per-table entries are read first (as in wellbore-view.js), then the flat `fields` map.
function fieldEntry(dictionary,dataset,field){
 const table=dictionary?.tables?.[dataset];
 return table&&typeof table==='object'&&!Array.isArray(table)&&Object.hasOwn(table,field)?table[field]:dictionary?.fields&&typeof dictionary.fields==='object'&&Object.hasOwn(dictionary.fields,field)?dictionary.fields[field]:null;
}
function unitOf(dictionary,dataset,field){const entry=fieldEntry(dictionary,dataset,field);return typeof entry?.units==='string'&&entry.units?entry.units:null;}
// The dictionary note of depth_reference_code (its WBA091 citation for GL/DF/KB/RT/GR) is shown verbatim beside the codes.
function codeNote(dictionary,dataset){const note=fieldEntry(dictionary,dataset,'depth_reference_code')?.note;return typeof note==='string'&&note?note:null;}
const feet=unit=>typeof unit==='string'&&unit.startsWith('ft');

function entryFor(lane,spec,row,context){
 const dictionary=context[DICTIONARY[lane]],key=lane==='inventory'?row?.source_record_key:row?.source_row_key;
 const status=context.disposition(lane,key);
 const base={lane,dataset:lane,recordKey:key??null,attributed:context.attributed,api:lane==='casing'||lane==='plugging'?row?.source_api_id??null:null,
  unitLabel:spec.unitLabel,referenceNote:lane==='casing'||lane==='plugging'?codeNote(dictionary,lane):null,referenceCode:lane==='casing'||lane==='plugging'?(present(row?.depth_reference_code)?String(row.depth_reference_code):NOT_REPORTED):NOT_SUPPLIED,
  recordSequence:lane==='casing'||lane==='plugging'?(present(row?.record_sequence)?String(row.record_sequence):NOT_REPORTED):null,
  onTopRecord:lane==='casing'||lane==='plugging'?(row?.on_top_record===true?'true':row?.on_top_record===false?'false':'not set'):null,
  disposition:status.disposition,reasons:status.reasons,
  nameField:spec.name??null,name:spec.name?(present(row?.[spec.name])?String(row[spec.name]):null):null};
 let entry,marks=[];
 if(spec.point){
  const value=row?.[spec.point];
  entry={...base,shape:'point',field:spec.point,value,unit:unitOf(dictionary,lane,spec.point),intervalStatus:present(value)?'point':NOT_REPORTED};
  if(numeric(value))marks=[{at:value}];
 }else{
  const top=row?.[spec.top],bottom=row?.[spec.bottom],topUnit=unitOf(dictionary,lane,spec.top),bottomUnit=unitOf(dictionary,lane,spec.bottom);
  entry={...base,shape:'interval',field:`${spec.top} – ${spec.bottom}`,top,bottom,unit:topUnit===bottomUnit?topUnit:null,unitsDiffer:topUnit!==bottomUnit};
  if(present(top)&&present(bottom)){
   if(numeric(top)&&numeric(bottom)&&top>bottom)entry.intervalStatus=MALFORMED;
   else{entry.intervalStatus='interval';if(numeric(top)&&numeric(bottom))marks=[{from:top,to:bottom}];}
  }else if(present(top)||present(bottom)){entry.intervalStatus=END_MISSING;const end=present(top)?top:bottom;if(numeric(end))marks=[{at:end}];}
  else entry.intervalStatus=NOT_REPORTED;
 }
 // Why an entry is or is not drawn, first reason wins; nothing is ever drawn that the table does not list.
 let why=null;
 if(!context.attributed)why='not attributed to this UIC; listed only';
 else if(entry.disposition==='quarantined'||entry.disposition==='excluded')why=`${entry.disposition}; listed only`;
 else if(entry.disposition!=='accepted')why='disposition unavailable; listed only';
 else if(entry.intervalStatus===NOT_REPORTED)why='Not reported; nothing drawn';
 else if(entry.intervalStatus===MALFORMED)why=MALFORMED+'; not drawn, ends not swapped';
 else if(entry.unitsDiffer)why='interval ends have different units; not drawn';
 else if(!entry.unit)why='unit not stated; not drawn';
 else if(!feet(entry.unit))why='unit not stated as ft; not drawn';
 else if(!marks.length)why='value is not a number as published; not drawn';
 entry.drawn=why===null;entry.why=why??(entry.intervalStatus===END_MISSING?'drawn as a point (interval end missing)':'drawn');entry.marks=entry.drawn?marks:[];
 delete entry.unitsDiffer;
 return entry;
}

// state: {inventory (one row), bhp[], srt[], casing:{rows,attributed}, plugging:{rows,attributed},
//  dataDictionary, testsDictionary, wellboreDictionary, dispositions:Map(key -> {disposition,reasons})}
export function ladderEntries(state){
 const dispositions=state?.dispositions instanceof Map?state.dispositions:new Map();
 const disposition=(lane,key)=>{const item=dispositions.get(`${lane}\u0000${key}`);return {disposition:item?.disposition??'Unavailable',reasons:Array.isArray(item?.reasons)?[...item.reasons]:[]};};
 const sources={inventory:{rows:state?.inventory?[state.inventory]:[],attributed:true},casing:{rows:state?.casing?.rows??[],attributed:state?.casing?.attributed===true},plugging:{rows:state?.plugging?.rows??[],attributed:state?.plugging?.attributed===true},bhp:{rows:state?.bhp??[],attributed:true},srt:{rows:state?.srt??[],attributed:true}};
 const entries=[];
 for(const {lane,fields} of LANES){
  const {rows,attributed}=sources[lane],context={dataDictionary:state?.dataDictionary,testsDictionary:state?.testsDictionary,wellboreDictionary:state?.wellboreDictionary,disposition,attributed};
  for(const row of Array.isArray(rows)?rows:[])for(const spec of fields)entries.push(entryFor(lane,spec,row,context));
 }
 return entries;
}

const valueText=entry=>entry.shape==='point'?shown(entry.value):`${shown(entry.top)} – ${shown(entry.bottom)}`;
const fieldText=entry=>entry.nameField?`${entry.field} (${entry.nameField}: ${entry.name??NOT_REPORTED})`:entry.field;
function tableRows(entries){
 return entries.map(entry=>`<tr class="${entry.drawn?'':'listed-only'}"><td>${escape(entry.dataset)}</td><th scope="row">${escape(shown(entry.recordKey))}</th><td>${escape(fieldText(entry))}</td><td>${escape(valueText(entry))}</td><td>${escape(entry.unit??'unit not stated')}</td><td>${escape(entry.unitLabel)}</td><td>${escape(entry.referenceCode)} · ${CODE_NOTE}</td><td>${escape(entry.recordSequence??'—')} / ${escape(entry.onTopRecord??'—')}</td><td>${escape(entry.intervalStatus)}</td><td>${escape(entry.disposition)}${entry.reasons.length?' ('+escape(entry.reasons.join(', '))+')':''}</td><td>${entry.drawn?'yes':'no'} · ${escape(entry.why)}</td></tr>`).join('');
}
const HEAD='<thead><tr><th scope="col">Dataset lane</th><th scope="col">Record key</th><th scope="col">Field</th><th scope="col">Value as published</th><th scope="col">Unit (verbatim)</th><th scope="col">Unit label</th><th scope="col">Reference code</th><th scope="col">record_sequence / on_top_record</th><th scope="col">Interval status</th><th scope="col">Disposition</th><th scope="col">Drawn</th></tr></thead>';

function svg(entries){
 const drawn=entries.filter(entry=>entry.drawn),listed=entries.length-drawn.length;
 const summary=`${drawn.length} reported depths drawn, ${listed} listed only`;
 if(!drawn.length)return `<p class="note" role="status">${escape(summary)}. Nothing is drawn; every entry is in the table below.</p>`;
 const values=drawn.flatMap(entry=>entry.marks.flatMap(mark=>'at' in mark?[mark.at]:[mark.from,mark.to]));
 let min=Math.min(0,...values),max=Math.max(...values);if(max===min)max=min+1;
 const width=760,height=380,left=96,top=36,plot=height-top-28,laneWidth=(width-left-12)/LANES.length,y=value=>top+(value-min)/(max-min)*plot;
 const ticks=[min,min+(max-min)/2,max].map(value=>`<g class="ladder-tick"><line x1="${left-6}" x2="${width-12}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/><text x="${left-10}" y="${(y(value)+4).toFixed(1)}" text-anchor="end">${escape(String(Math.round(value*100)/100))}</text></g>`).join('');
 const lanes=LANES.map(({lane,title},index)=>{
  const x=left+index*laneWidth,items=drawn.filter(entry=>entry.lane===lane);
  const marks=items.map((entry,position)=>{const offset=x+12+(position%8)*((laneWidth-24)/8);
   return entry.marks.map(mark=>'at' in mark?`<circle class="ladder-point" cx="${offset.toFixed(1)}" cy="${y(mark.at).toFixed(1)}" r="4"/>`:`<rect class="ladder-interval" x="${(offset-4).toFixed(1)}" y="${y(mark.from).toFixed(1)}" width="8" height="${Math.max(1,y(mark.to)-y(mark.from)).toFixed(1)}"/>`).join('');}).join('');
  return `<g class="ladder-lane"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${top+plot}"/><text x="${(x+laneWidth/2).toFixed(1)}" y="${top-12}" text-anchor="middle">${escape(title)}</text>${marks}</g>`;}).join('');
 return `<svg class="depth-ladder" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(summary)}"><text class="ladder-axis" x="12" y="${top+plot/2}" transform="rotate(-90 12 ${top+plot/2})" text-anchor="middle">Reported depth value (ft as reported)</text>${ticks}${lanes}</svg>`;
}

export function renderLadder(entries){
 const list=Array.isArray(entries)?entries:[];
 const attributed=list.filter(entry=>entry.attributed),separate=list.filter(entry=>!entry.attributed);
 const apis=[...new Set(separate.map(entry=>entry.api??NOT_REPORTED))];
 const others=separate.length?`<h4>Rows for API ${escape(apis.join(', '))}, not attributed to this UIC</h4><div class="scroll-table" tabindex="0" role="region" aria-label="Rows for API ${escape(apis.join(', '))}, not attributed to this UIC"><table><caption>Wellbore rows under an ambiguous inventory link: they belong to the reported API and are attributed to no single UIC. Listed only; nothing here is drawn.</caption>${HEAD}<tbody>${tableRows(separate)}</tbody></table></div>`:'';
 const notes=[...new Set(list.map(entry=>entry.referenceNote).filter(Boolean))];
 const codeNotes=notes.map(note=>`<p class="note">depth_reference_code (wellbore_dictionary.json note): ${escape(note)}</p>`).join('');
 return `<section class="ladder" aria-labelledby="ladder-title"><h3 id="ladder-title">Reported-depth ladder <small class="badge">public reported</small></h3><p class="note">Points and intervals are placed exactly as published. Missing values are gaps, never interpolated; a published zero is drawn at zero. Quarantined rows are listed, not drawn. depth_reference_code is shown verbatim; ${CODE_NOTE}. ${escape(OMITTED_NOTE)}</p>${codeNotes}<p class="note">Vertical axis: ${escape(AXIS_LABEL)}.</p>${svg(attributed)}<div class="scroll-table" tabindex="0" role="region" aria-label="Reported-depth ladder entries"><table><caption>One row per ladder entry, in ladder order (dataset lane, record order, field order). Every drawn mark has a row here.</caption>${HEAD}<tbody>${attributed.length?tableRows(attributed):'<tr><td colspan="11">No depth fields for this record.</td></tr>'}</tbody></table></div>${others}</section>`;
}
