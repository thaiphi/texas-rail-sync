// Shared by the producer and read-only run validator; no I/O or UI mutation.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const invalid=()=>{throw Object.assign(Error('Invalid quality counts or dispositions'),{code:'QUALITY_INVALID'});};
const quarantineReason=flag=>/^(parse_failure|invalid|inconsistent|duplicate|unmatched|ambiguous|source_scope)/.test(flag);
export const rowDisposition=row=>row.quality_flags.some(quarantineReason)?'quarantined':'accepted';
const assertReasons=item=>{
 if(item.reasons!==undefined&&(!Array.isArray(item.reasons)||!item.reasons.every(reason=>typeof reason==='string'&&reason.length)))invalid();
 if(item.disposition==='quarantined'&&(!item.reasons?.length||!item.reasons.some(quarantineReason)))invalid();
 if(item.disposition==='accepted'&&item.reasons?.some(quarantineReason))invalid();
};
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
export const sameQualityReport=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
export function assertQualityReport(quality,rows=null){
 if(!object(quality))invalid();
 for(const name of ['inventory','monthly']){
  const summary=quality[name];
  if(!object(summary)||!['raw','parsed','accepted','quarantined','excluded'].every(key=>count(summary[key])))invalid();
  // This collector retains every source row, including excluded/quarantined rows.
  if(summary.raw!==summary.parsed||summary.parsed!==summary.accepted+summary.quarantined+summary.excluded)invalid();
 }
 const join=quality.parent_join;
 if(!object(join)||!['matched','unmatched','ambiguous'].every(key=>count(join[key]))||join.matched+join.unmatched+join.ambiguous!==quality.monthly.parsed)invalid();
 if(join.unmatched+join.ambiguous>quality.monthly.quarantined)invalid();
 if(!object(quality.issue_counts)||!Object.values(quality.issue_counts).every(value=>count(value)&&value<=quality.inventory.parsed+quality.monthly.parsed))invalid();
 if((quality.issue_counts['unmatched:parent']??0)!==join.unmatched||(quality.issue_counts['ambiguous:parent']??0)!==join.ambiguous)invalid();
 if(!Array.isArray(quality.dispositions)||quality.dispositions.length!==quality.monthly.parsed)invalid();
 const keys=new Set(),dispositions={accepted:0,quarantined:0,excluded:0};
 for(const item of quality.dispositions){
  if(!object(item)||typeof item.source_row_key!=='string'||!item.source_row_key||keys.has(item.source_row_key)||!Object.hasOwn(dispositions,item.disposition))invalid();
  assertReasons(item);
  keys.add(item.source_row_key);dispositions[item.disposition]++;
 }
 if(Object.entries(dispositions).some(([key,value])=>quality.monthly[key]!==value))invalid();
 if(quality.inventory.quarantined>0&&quality.inventory_dispositions===undefined)invalid();
 if(quality.inventory_dispositions!==undefined){
  if(!Array.isArray(quality.inventory_dispositions)||quality.inventory_dispositions.length!==quality.inventory.parsed)invalid();
  const inventoryKeys=new Set(),totals={accepted:0,quarantined:0,excluded:0};
  for(const item of quality.inventory_dispositions){if(!object(item)||typeof item.source_record_key!=='string'||!item.source_record_key||inventoryKeys.has(item.source_record_key)||!Object.hasOwn(totals,item.disposition))invalid();assertReasons(item);inventoryKeys.add(item.source_record_key);totals[item.disposition]++;}
  if(Object.entries(totals).some(([key,value])=>quality.inventory[key]!==value))invalid();
 }
 const recordedIssues=Object.create(null);
 for(const item of [...quality.dispositions,...(quality.inventory_dispositions??[])])if(item.disposition==='quarantined')for(const reason of item.reasons)if(quarantineReason(reason))recordedIssues[reason]=(recordedIssues[reason]??0)+1;
 const quarantineIssues=new Set([...Object.keys(recordedIssues),...Object.keys(quality.issue_counts).filter(quarantineReason)]);
 if([...quarantineIssues].some(key=>(recordedIssues[key]??0)!==quality.issue_counts[key]))invalid();
 if(rows){
  for(const name of ['inventory','monthly']){
   const records=rows[name];if(!Array.isArray(records)||records.length!==quality[name].parsed)invalid();
   if(records.some(row=>!Array.isArray(row.quality_flags)||!row.quality_flags.every(flag=>typeof flag==='string')))invalid();
   if(records.filter(row=>rowDisposition(row)==='accepted').length!==quality[name].accepted||records.filter(row=>rowDisposition(row)==='quarantined').length!==quality[name].quarantined||quality[name].excluded!==0)invalid();
  }
  for(const [key,value] of Object.entries(join))if(['matched','unmatched','ambiguous'].includes(key)&&rows.monthly.filter(row=>row.parent_join_status===key).length!==value)invalid();
  for(const [name,key,items] of [['inventory','source_record_key',quality.inventory_dispositions??[]],['monthly','source_row_key',quality.dispositions]]){
   const byKey=new Map(rows[name].map(row=>[row[key],row]));
   if(byKey.size!==rows[name].length)invalid();
   for(const item of items){
    const row=byKey.get(item[key]);
    if(!row||item.disposition!==rowDisposition(row)||(item.disposition==='quarantined'&&!sameQualityReport(item.reasons,row.quality_flags)))invalid();
   }
  }
  const issues={};for(const row of [...rows.inventory,...rows.monthly])for(const flag of row.quality_flags)issues[flag]=(issues[flag]??0)+1;
  const allKeys=new Set([...Object.keys(issues),...Object.keys(quality.issue_counts)]);
  if([...allKeys].some(key=>issues[key]!==quality.issue_counts[key]))invalid();
 }
 return quality;
}
