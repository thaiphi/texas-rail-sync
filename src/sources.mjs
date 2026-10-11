export const collectionScope=Object.freeze({apiPrefix:'389',injectionType:'1',monthlyUic:'000020838',monthlyStart:'2024-01-01T00:00:00'});
const inventoryQuery=new URLSearchParams({'$where':`api_no like '${collectionScope.apiPrefix}%' AND uic_type_injection='${collectionScope.injectionType}' AND permit_canceled_date IS NULL AND w3_plugged_date IS NULL`,'$limit':'5','$order':'uic_number'});
const monthlyQuery=new URLSearchParams({'$where':`uic_no='${collectionScope.monthlyUic}' AND formatted_date >= '${collectionScope.monthlyStart}'`,'$limit':'1000','$order':'formatted_date,id'});
export function sourceScopeFlags(kind,row,scope=collectionScope){
 const flags=[];
 if(scope.queryVersion===2){
  if(kind==='inventory'){if(row.uic_number!==scope.monthlyUic)flags.push('source_scope:uic_number');}
  else{
   if(row.uic_no!==scope.monthlyUic)flags.push('source_scope:uic_no');
   if(typeof row.formatted_date!=='string'||row.formatted_date<scope.monthlyStart||row.formatted_date>=scope.monthlyEndExclusive)flags.push('source_scope:formatted_date');
  }
  return flags;
 }
 if(kind==='inventory'){
  if(typeof row.api_no!=='string'||!row.api_no.startsWith(scope.apiPrefix))flags.push('source_scope:api_no_prefix');
  if(row.uic_type_injection!==scope.injectionType)flags.push('source_scope:uic_type_injection');
  for(const key of ['permit_canceled_date','w3_plugged_date'])if(row[key]!==undefined&&row[key]!==null)flags.push(`source_scope:${key}`);
 }else{
  if(row.uic_no!==scope.monthlyUic)flags.push('source_scope:uic_no');
  if(typeof row.formatted_date!=='string'||row.formatted_date<scope.monthlyStart)flags.push('source_scope:formatted_date');
 }
 return flags;
}
export const acquisitionTargets=Object.freeze([
 {name:'inventory-metadata.json',url:'https://data.texas.gov/api/views/givw-z9t4.json'},
 {name:'monthly-metadata.json',url:'https://data.texas.gov/api/views/qq2j-f2zm.json'},
 {name:'candidate-inventory.json',url:`https://data.texas.gov/resource/givw-z9t4.json?${inventoryQuery}`},
 {name:'candidate-monthly.json',url:`https://data.texas.gov/resource/qq2j-f2zm.json?${monthlyQuery}`},
 {name:'uic-manual.pdf',url:'https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf'},
 {name:'rrc-resources.html',url:'https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/'},
 {name:'uic-query-help.html',url:'https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html'}
].map(Object.freeze));
const invalid=message=>Object.assign(Error(message),{code:'SOURCE_INVALID'});
export function lookupTarget(request){
 if(!request||!['uic','api'].includes(request.kind))throw invalid('Unsupported identifier kind');
 if(typeof request.value!=='string'||!(request.kind==='uic'?/^\d{9}$/:/^\d{8}$/).test(request.value))throw invalid('Identifier format requires exactly nine UIC digits or eight source API digits');
 if(Object.keys(request).some(key=>!['kind','value'].includes(key)))throw invalid('Unsupported identifier request field');
 const query=new URLSearchParams({'$where':`${request.kind==='uic'?'uic_number':'api_no'}='${request.value}'`,'$limit':'25','$order':'uic_number,api_no'});
 return {name:'lookup-inventory.json',url:`https://data.texas.gov/resource/givw-z9t4.json?${query}`};
}
export function boundedScope(uic,startMonth,endMonth){
 if(typeof uic!=='string'||!/^\d{9}$/.test(uic))throw invalid('UIC identifier format requires nine digits');
 if(typeof startMonth!=='string'||typeof endMonth!=='string')throw invalid('Reporting months must be strings in YYYY-MM format');
 const index=value=>{const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);if(!m||Number(m[1])<1900||Number(m[1])>9998)throw invalid('Invalid reporting month');return Number(m[1])*12+Number(m[2])-1;};
 const start=index(startMonth),end=index(endMonth);if(end<start||end-start>=36)throw invalid('Reporting range must contain 1–36 inclusive months');
 const next=end+1,endExclusive=`${String(Math.floor(next/12)).padStart(4,'0')}-${String(next%12+1).padStart(2,'0')}-01T00:00:00`;
 return Object.freeze({queryVersion:2,monthlyUic:uic,startMonth,endMonth,monthlyStart:startMonth+'-01T00:00:00',monthlyEndExclusive:endExclusive,inventoryLimit:25,monthlyLimit:1000});
}
export function targetsForScope(scope=collectionScope){
 if(scope.queryVersion!==2)return acquisitionTargets;
 const checked=boundedScope(scope.monthlyUic,scope.startMonth,scope.endMonth);
 if(JSON.stringify(checked)!==JSON.stringify(scope))throw invalid('Collection scope does not match the query contract');
 const inventory=new URLSearchParams({'$where':`uic_number='${scope.monthlyUic}'`,'$limit':'25','$order':'uic_number,api_no'});
 const monthly=new URLSearchParams({'$where':`uic_no='${scope.monthlyUic}' AND formatted_date >= '${scope.monthlyStart}' AND formatted_date < '${scope.monthlyEndExclusive}'`,'$limit':'1000','$order':'formatted_date,id'});
 return acquisitionTargets.map(target=>target.name==='candidate-inventory.json'?{...target,url:`https://data.texas.gov/resource/givw-z9t4.json?${inventory}`}:target.name==='candidate-monthly.json'?{...target,url:`https://data.texas.gov/resource/qq2j-f2zm.json?${monthly}`}:target);
}
