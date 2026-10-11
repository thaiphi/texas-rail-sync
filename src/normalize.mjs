import {createHash} from 'node:crypto';
import {sourceScopeFlags} from './sources.mjs';
import {rowDisposition} from '../public/quality-validation.js';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const inventoryColumns=['source_record_key','uic_number','api_no','operator_number','district_code','lease_number','lease_name','well_no_display','county','county_basis','injection_type_code','permit_liquid_pressure_limit_psi','permit_liquid_volume_limit_bpd','permitted_top_depth_ft','permitted_bottom_depth_ft','w14_number','w14_date','permit_canceled_date','plugged_date','source_snapshot_id','quality_flags'];
export const monthlyColumns=['source_row_key','parent_key','parent_join_status','uic_number','source_report_id','reporting_year','reporting_month','period_start','injected_liquid_bbl','injected_gas_mcf','reported_avg_injection_pressure_psi','reported_max_injection_pressure_psi','calendar_days','calculated_calendar_day_avg_bpd','most_recent_record','source_snapshot_id','quality_flags'];
export function numberField(value,flags,name){
  if(value===undefined||value===null||String(value).trim()===''){flags.push(`missing:${name}`);return null;}
  if(!/^-?\d+(\.\d+)?$/.test(String(value))||!Number.isFinite(Number(value))){flags.push(`parse_failure:${name}`);return null;}
  return Number(value);
}
const str=value=>value==null?'':String(value);
const period=value=>{
 const match=/^(\d{4})-(\d{2})-01T00:00:00(?:\.000)?$/.exec(str(value));
 return match&&Number(match[2])>=1&&Number(match[2])<=12?match:null;
};
export function normalize(inventoryRaw,monthlyRaw,sourceIds,scope=null){
 const inventory=inventoryRaw.map((r,i)=>{
  const flags=[];if(!/^\d{9}$/.test(str(r.uic_number)))flags.push('invalid:uic_number');
  const row={source_record_key:`rrc:uic:${sourceIds.inventory}:${i+1}`,uic_number:str(r.uic_number),api_no:str(r.api_no),operator_number:str(r.operator_number),district_code:str(r.district_code),lease_number:str(r.lease_number),lease_name:str(r.lease_name),well_no_display:str(r.well_no_display),county:str(r.api_no).startsWith('389')?'Reeves':'',county_basis:'API county code 389; not independent location verification',injection_type_code:str(r.uic_type_injection),permit_liquid_pressure_limit_psi:numberField(r.max_liq_inj_pressure,flags,'max_liq_inj_pressure'),permit_liquid_volume_limit_bpd:numberField(r.bbl_vol_inj,flags,'bbl_vol_inj'),permitted_top_depth_ft:numberField(r.top_inj_zone,flags,'top_inj_zone'),permitted_bottom_depth_ft:numberField(r.bot_inj_zone,flags,'bot_inj_zone'),w14_number:str(r.w14_number),w14_date:str(r.w14_date),permit_canceled_date:str(r.permit_canceled_date),plugged_date:str(r.w3_plugged_date),source_snapshot_id:sourceIds.inventory,quality_flags:flags};
  for(const [name,value] of Object.entries({max_liq_inj_pressure:row.permit_liquid_pressure_limit_psi,bbl_vol_inj:row.permit_liquid_volume_limit_bpd,top_inj_zone:row.permitted_top_depth_ft,bot_inj_zone:row.permitted_bottom_depth_ft}))if(value!==null&&value<0)flags.push(`invalid_negative:${name}`);
  if(row.permitted_top_depth_ft!==null&&row.permitted_bottom_depth_ft!==null&&row.permitted_top_depth_ft>row.permitted_bottom_depth_ft)flags.push('inconsistent:top_exceeds_bottom');
  if(scope)flags.push(...sourceScopeFlags('inventory',r,scope));
  if(scope?.queryVersion===2&&!str(r.api_no).startsWith('389')){row.county=`API county code ${str(r.api_no).slice(0,3)||'unavailable'}`;row.county_basis='Original source API county prefix; county name not independently verified';}
  return row;
 });
 const byUic=new Map();for(const r of inventory){const a=byUic.get(r.uic_number)??[];a.push(r);byUic.set(r.uic_number,a);}
 for(const rows of byUic.values())if(rows.length>1)for(const r of rows)r.quality_flags.push('ambiguous_parent_identity');
 const periodCounts=new Map(),reportIds=new Map();
 for(const r of monthlyRaw){const month=period(r.formatted_date);if(month){const key=`${str(r.uic_no)}|${month[1]}-${month[2]}`;periodCounts.set(key,(periodCounts.get(key)??0)+1);}reportIds.set(str(r.id),(reportIds.get(str(r.id))??0)+1);}
 const monthly=monthlyRaw.map((r,i)=>{
  const flags=[];const parents=byUic.get(str(r.uic_no))??[];
  const join=parents.length===1?'matched':parents.length===0?'unmatched':'ambiguous';
  if(join!=='matched')flags.push(`${join}:parent`);
  const m=period(r.formatted_date);
  if(m&&periodCounts.get(`${str(r.uic_no)}|${m[1]}-${m[2]}`)>1)flags.push('duplicate_or_revision_period');
  if(!str(r.id).trim())flags.push('invalid:source_report_id');
  if(reportIds.get(str(r.id))>1)flags.push('duplicate_source_report_id');
  const validDate=!!m;
  if(!validDate)flags.push('parse_failure:formatted_date');
  const year=validDate?Number(m[1]):null,month=validDate?Number(m[2]):null;
  const days=validDate?new Date(Date.UTC(year,month,0)).getUTCDate():null;
  const liquid=numberField(r.vol_liq,flags,'vol_liq'),gas=numberField(r.vol_gas,flags,'vol_gas'),avg=numberField(r.inj_press_avg,flags,'inj_press_avg'),max=numberField(r.inj_press_max,flags,'inj_press_max');
  for(const [name,n] of Object.entries({vol_liq:liquid,vol_gas:gas,inj_press_avg:avg,inj_press_max:max}))if(n!==null&&n<0)flags.push(`invalid_negative:${name}`);
  if(avg!==null&&max!==null&&avg>max)flags.push('inconsistent:avg_exceeds_max');
  if(scope)flags.push(...sourceScopeFlags('monthly',r,scope));
  return {source_row_key:`rrc:h10:${sourceIds.monthly}:${i+1}`,parent_key:join==='matched'?parents[0].source_record_key:'',parent_join_status:join,uic_number:str(r.uic_no),source_report_id:str(r.id),reporting_year:year,reporting_month:month,period_start:validDate?`${m[1]}-${m[2]}-01`:'',injected_liquid_bbl:liquid,injected_gas_mcf:gas,reported_avg_injection_pressure_psi:avg,reported_max_injection_pressure_psi:max,calendar_days:days,calculated_calendar_day_avg_bpd:liquid!==null&&liquid>=0&&days?liquid/days:null,most_recent_record:str(r.most_recent_record),source_snapshot_id:sourceIds.monthly,quality_flags:flags};
 });
 const disposition=rowDisposition;
 const counts=rows=>({raw:rows.length,parsed:rows.length,accepted:rows.filter(r=>disposition(r)==='accepted').length,quarantined:rows.filter(r=>disposition(r)==='quarantined').length,excluded:0});
 const issueCounts={};for(const r of [...inventory,...monthly])for(const f of r.quality_flags)issueCounts[f]=(issueCounts[f]??0)+1;
 return {inventory,monthly,quality:{inventory:counts(inventory),monthly:counts(monthly),parent_join:{matched:monthly.filter(r=>r.parent_join_status==='matched').length,unmatched:monthly.filter(r=>r.parent_join_status==='unmatched').length,ambiguous:monthly.filter(r=>r.parent_join_status==='ambiguous').length},issue_counts:issueCounts,...(inventory.some(r=>disposition(r)==='quarantined')?{inventory_dispositions:inventory.map(r=>({source_record_key:r.source_record_key,disposition:disposition(r),...(disposition(r)==='quarantined'?{reasons:[...r.quality_flags]}:{})}))}:{}),dispositions:monthly.map(r=>({source_row_key:r.source_row_key,disposition:disposition(r),...(disposition(r)==='quarantined'?{reasons:[...r.quality_flags]}:{})})),annulus_fields:'not supplied by ODP dataset; not inferred',revision_policy:'Every source row retained; duplicate period or report ID quarantined without selecting a preferred revision. most_recent_record preserved without using it as a revision selector.',scope:'Bounded inventory candidates and one UIC monthly history; no statewide coverage or current operating-status assertion.'}};
}
export function csv(rows,columns){return columns.join(',')+'\n'+rows.map(r=>columns.map(k=>{const v=r[k];const s=Array.isArray(v)?v.join('|'):v==null?'':String(v);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\n')+(rows.length?'\n':'');}
