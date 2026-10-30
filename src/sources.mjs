export const collectionScope=Object.freeze({apiPrefix:'389',injectionType:'1',monthlyUic:'000020838',monthlyStart:'2024-01-01T00:00:00'});
const inventoryQuery=new URLSearchParams({'$where':`api_no like '${collectionScope.apiPrefix}%' AND uic_type_injection='${collectionScope.injectionType}' AND permit_canceled_date IS NULL AND w3_plugged_date IS NULL`,'$limit':'5','$order':'uic_number'});
const monthlyQuery=new URLSearchParams({'$where':`uic_no='${collectionScope.monthlyUic}' AND formatted_date >= '${collectionScope.monthlyStart}'`,'$limit':'1000','$order':'formatted_date,id'});
// Bounded (explicitly selected UIC) collections: query v2; v3 adds the BHP/SRT
// test-report targets; v4 (RRC-14) adds the exact-API casing/plugging targets; v5 (RRC-15)
// queries exactly the v4 targets and marks the export contract that adds evidence_relations.json.
// Test-report behaviour is gated on queryVersion>=3, wellbore on >=4, the relation catalogue on >=5.
export const isBounded=scope=>scope?.queryVersion===2||scope?.queryVersion===3||scope?.queryVersion===4||scope?.queryVersion===5;
// D7: every version from 3 up is local-only; used at every guest refusal point.
export const isLocalOnly=scope=>Number.isInteger(scope?.queryVersion)&&scope.queryVersion>=3;
export function versionLabels(scope){
 if(scope?.queryVersion===5)return {pipelineVersion:'rrc-collection-v5',transformationVersion:'rrc-odp-v2.3.0'};
 if(scope?.queryVersion===4)return {pipelineVersion:'rrc-collection-v4',transformationVersion:'rrc-odp-v2.2.0'};
 if(scope?.queryVersion===3)return {pipelineVersion:'rrc-collection-v3',transformationVersion:'rrc-odp-v2.1.0'};
 if(scope?.queryVersion===2)return {pipelineVersion:'rrc-collection-v2',transformationVersion:'rrc-odp-v2.0.0'};
 return {pipelineVersion:'rrc-collection-v1',transformationVersion:'rrc-odp-v1.0.0'};
}
export function sourceScopeFlags(kind,row,scope=collectionScope){
 const flags=[];
 if(isBounded(scope)){
  if(kind==='bhp'||kind==='srt'){if(row.uic_no!==scope.monthlyUic)flags.push('source_scope:uic_no');}
  // v4 exact-API queries: every row must carry the selected inventory row's own api_no.
  else if(kind==='casing'||kind==='plugging'||kind==='wellbore_inventory'){if(row?.api_no!==scope.sourceApiId)flags.push('source_scope:api_no');}
  else if(kind==='inventory'){if(row.uic_number!==scope.monthlyUic)flags.push('source_scope:uic_number');}
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
// v3 (local only, D7): the v2 scope plus exact-UIC BHP/SRT report queries. The test
// queries carry no reporting-window bound; the cap exceeds each whole dataset.
export function boundedTestScope(uic,startMonth,endMonth){
 return Object.freeze({...boundedScope(uic,startMonth,endMonth),queryVersion:3,testReportLimit:1000});
}
// v4 (local only, D7; RRC-14): the v3 scope plus exact-API casing/plugging queries keyed by
// the selected inventory row's own api_no. Only an eight-digit string reaches a query.
export function boundedWellboreScope(uic,startMonth,endMonth,apiNo){
 const sourceApiId=typeof apiNo==='string'&&/^\d{8}$/.test(apiNo)?apiNo:null;
 return Object.freeze({...boundedTestScope(uic,startMonth,endMonth),queryVersion:4,sourceApiId,wellboreLimit:1000,wellboreInventoryLimit:25});
}
// v5 (local only, D7; RRC-15, ADR 004 §3): the v4 scope and exactly the v4 targets, in the same
// order. The version marks the export contract (evidence_relations.json); no new dataset is queried.
export function boundedRelationScope(uic,startMonth,endMonth,apiNo){
 return Object.freeze({...boundedWellboreScope(uic,startMonth,endMonth,apiNo),queryVersion:5});
}
export const wellboreOrder='record_sequence,id';
export const officialWellboreDocuments=Object.freeze([
 {name:'wellbore-wba091.pdf',url:'https://www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf'},
 {name:'form-w2.pdf',url:'https://www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf'},
 {name:'form-w3.pdf',url:'https://www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf'}
].map(Object.freeze));
// Targets 14-21. With no eight-digit API, 16-18 are omitted (ADR 004 §2 rule 1: no query
// is made) and the dataset metadata and documents are still preserved.
function wellboreTargets(scope){
 const query=new URLSearchParams({'$where':`api_no='${scope.sourceApiId}'`,'$limit':String(scope.wellboreLimit),'$order':wellboreOrder});
 return [
  {name:'casing-metadata.json',url:'https://data.texas.gov/api/views/u9m4-xnh6.json'},
  {name:'plugging-metadata.json',url:'https://data.texas.gov/api/views/wfzn-9fje.json'},
  ...(scope.sourceApiId===null?[]:[
   {name:'wellbore-inventory.json',url:lookupTarget({kind:'api',value:scope.sourceApiId}).url},
   {name:'candidate-casing.json',url:`https://data.texas.gov/resource/u9m4-xnh6.json?${query}`},
   {name:'candidate-plugging.json',url:`https://data.texas.gov/resource/wfzn-9fje.json?${query}`}
  ]),
  ...officialWellboreDocuments
 ];
}
export const testReportOrder=Object.freeze({bhp:'report_id,tracking_no,test_sequence_no',srt:'report_id,tracking_no'});
export const officialTestDocuments=Object.freeze([
 {name:'srt-guidelines.html',url:'https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/'},
 {name:'bhp-permian-nto.pdf',url:'https://www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf'}
].map(Object.freeze));
function testReportTargets(uic){
 const query=order=>new URLSearchParams({'$where':`uic_no='${uic}'`,'$limit':'1000','$order':order});
 return [
  {name:'bhp-metadata.json',url:'https://data.texas.gov/api/views/qxfy-wcfs.json'},
  {name:'srt-metadata.json',url:'https://data.texas.gov/api/views/h54t-xnbi.json'},
  {name:'candidate-bhp.json',url:`https://data.texas.gov/resource/qxfy-wcfs.json?${query(testReportOrder.bhp)}`},
  {name:'candidate-srt.json',url:`https://data.texas.gov/resource/h54t-xnbi.json?${query(testReportOrder.srt)}`},
  ...officialTestDocuments
 ];
}
export function targetsForScope(scope=collectionScope){
 if(!isBounded(scope))return acquisitionTargets;
 const checked=scope.queryVersion===5?boundedRelationScope(scope.monthlyUic,scope.startMonth,scope.endMonth,scope.sourceApiId):scope.queryVersion===4?boundedWellboreScope(scope.monthlyUic,scope.startMonth,scope.endMonth,scope.sourceApiId):(scope.queryVersion===3?boundedTestScope:boundedScope)(scope.monthlyUic,scope.startMonth,scope.endMonth);
 if(JSON.stringify(checked)!==JSON.stringify(scope))throw invalid('Collection scope does not match the query contract');
 const inventory=new URLSearchParams({'$where':`uic_number='${scope.monthlyUic}'`,'$limit':'25','$order':'uic_number,api_no'});
 const monthly=new URLSearchParams({'$where':`uic_no='${scope.monthlyUic}' AND formatted_date >= '${scope.monthlyStart}' AND formatted_date < '${scope.monthlyEndExclusive}'`,'$limit':'1000','$order':'formatted_date,id'});
 const targets=acquisitionTargets.map(target=>target.name==='candidate-inventory.json'?{...target,url:`https://data.texas.gov/resource/givw-z9t4.json?${inventory}`}:target.name==='candidate-monthly.json'?{...target,url:`https://data.texas.gov/resource/qq2j-f2zm.json?${monthly}`}:target);
 if(scope.queryVersion<3)return targets;
 return scope.queryVersion>=4?[...targets,...testReportTargets(scope.monthlyUic),...wellboreTargets(scope)]:[...targets,...testReportTargets(scope.monthlyUic)];
}
