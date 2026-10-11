import {escapeHtml as escape} from './inspection.js';

export const unavailable='Unavailable';
export const valueText=value=>value===null||value===undefined||value===''?unavailable:String(value);
export const countText=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('en-US'):unavailable;
export const facts=entries=>`<dl class="facts">${entries.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(valueText(value))}</dd></div>`).join('')}</dl>`;
export function sourceUrl(value){
 try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}
}
export function artifactDownload(path){
 return /^artifacts\/[a-z0-9][a-z0-9._-]*\/(?:sources\/)?[a-z0-9][a-z0-9._-]*$/i.test(path??'')&&!path.split('/').some(part=>part==='..')?'/'+path+'?download=1':null;
}
export function filterInventory(data,{term='',county='',operator=''}){
 const query=term.trim().toLowerCase();
 return data.inventory.filter(row=>(!county||row.county===county)&&(!operator||row.operator_number===operator)&&[row.uic_number,row.api_no,row.operator_number,row.lease_name,row.well_no_display].some(value=>String(value??'').toLowerCase().includes(query)));
}
export function stageFacts(view,node){
 const events=view.events.filter(event=>event.stage===node.id);
 return {startedAt:events.find(event=>event.status==='running')?.timestamp??null,endedAt:events.findLast(event=>['succeeded','failed','skipped'].includes(event.status))?.timestamp??null,inputs:node.evidence?.inputs??[],outputs:node.evidence?.outputs??[],counts:node.evidence?.counts??null};
}
export function stageCount(node){
 if(node.id==='load')return Array.isArray(node.evidence?.inputs)?`${node.evidence.inputs.length} input references`:'Input count unavailable';
 if(node.id==='normalize-qc')return node.evidence?.counts?.monthly?.parsed==null?'Monthly count unavailable':`${countText(node.evidence.counts.monthly.parsed)} monthly rows`;
 return Array.isArray(node.evidence?.outputs)?`${node.evidence.outputs.length} output files`:'Output count unavailable';
}
export function runMetrics(view){
 // Never fall back to the pinned dataset: these values belong to this invocation.
 const counts=view.stages.find(node=>node.id==='normalize-qc')?.evidence?.counts;
 const inputs=view.stages.find(node=>node.id==='load')?.evidence?.inputs;
 return [['Inventory accepted',counts?.inventory?.accepted],['Monthly matched',counts?.parent_join?.matched],['Monthly quarantined',counts?.monthly?.quarantined],['Input references',Array.isArray(inputs)?inputs.length:null]];
}
export function dispositionRows(data){
 const monthly=new Map(data.injectionMonthly.map(row=>[row.source_row_key,row]));
 const inventory=new Map((data.inventory??[]).map(row=>[row.source_record_key,row]));
 return [...(data.qualityReport.inventory_dispositions??[]),...(data.qualityReport.dispositions??[])].filter(row=>row.disposition!=='accepted').map(row=>({...row,reasons:[...new Set([...((row.source_record_key?inventory.get(row.source_record_key):monthly.get(row.source_row_key))?.quality_flags??[]),...(row.reasons??[])])]}));
}
