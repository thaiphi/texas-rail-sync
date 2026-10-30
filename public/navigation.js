const tabs=['overview','records','tests','wellbore','dossier','quality','sources','downloads','collection'];
const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)&&id!=='..';
// Dossier subject (ADR 004 §4, OD-8): an inventory source_record_key carried verbatim; never a UIC, API or name.
const validRecordKey=key=>typeof key==='string'&&/^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(key);
export function parseRoute(hash){
 const key=String(hash??'').replace(/^#/,'');
 if(['find','datasets','history','help'].includes(key))return {screen:key};
 const run=/^history\/([a-f0-9-]{36})$/i.exec(key);if(run)return {screen:'history',runId:run[1]};
 if(!key||key==='workflow')return {screen:'find'};
 const legacy={records:'records',exports:'downloads',sources:'sources',quality:'quality'};
 if(legacy[key])return {screen:'workspace',artifactId:null,tab:legacy[key]};
 const match=/^dataset\/([^/]+)\/([^/]+)$/.exec(key);
 if(match){let id;try{id=decodeURIComponent(match[1]);}catch{return {screen:'datasets'};}if(validId(id)&&tabs.includes(match[2]))return {screen:'workspace',artifactId:id,tab:match[2]};}
 // Only the dossier tab accepts a third segment: the subject's encoded source_record_key.
 const dossier=/^dataset\/([^/]+)\/dossier\/([^/]+)$/.exec(key);
 if(dossier){let id,recordKey;try{id=decodeURIComponent(dossier[1]);recordKey=decodeURIComponent(dossier[2]);}catch{return {screen:'datasets'};}if(validId(id)&&validRecordKey(recordKey))return {screen:'workspace',artifactId:id,tab:'dossier',recordKey};}
 // Phase 4 compare screen (RRC-16): two distinct, valid version IDs; anything else falls back to the library.
 const compare=/^compare\/([^/]+)\/([^/]+)$/.exec(key);
 if(compare){let a,b;try{a=decodeURIComponent(compare[1]);b=decodeURIComponent(compare[2]);}catch{return {screen:'datasets'};}if(validId(a)&&validId(b)&&a!==b)return {screen:'compare',a,b};}
 return {screen:'datasets'};
}
export function compareRoute(a,b){
 if(!validId(a)||!validId(b)||a===b)throw Error('Invalid comparison: two different valid version identities are required');
 return '#compare/'+encodeURIComponent(a)+'/'+encodeURIComponent(b);
}
export function datasetRoute(artifactId,tab='overview',recordKey=null){
 if(!validId(artifactId)||!tabs.includes(tab))throw Error('Invalid dataset version identity or tab');
 if(recordKey!==null&&recordKey!==undefined){if(tab!=='dossier'||!validRecordKey(recordKey))throw Error('Invalid dossier record key');return '#dataset/'+encodeURIComponent(artifactId)+'/dossier/'+encodeURIComponent(recordKey);}
 return '#dataset/'+encodeURIComponent(artifactId)+'/'+tab;
}
export function localTime(value,options={}){
 if(typeof value==='string'&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(value))return value;
 if(value===null||value===undefined||value==='')return 'Unavailable';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Unavailable';
 return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short',...options}).format(date);
}
export const localZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
export function monthWindow(start,end){
 if(typeof start!=='string'||typeof end!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(end))throw Error('Choose valid first and last reporting months.');
 const ordinal=value=>Number(value.slice(0,4))*12+Number(value.slice(5,7));const count=ordinal(end)-ordinal(start)+1;
 if(count<1||count>36)throw Error('Choose an inclusive period of 1–36 reporting months.');return count;
}
export function datasetSummary(artifact){
 const manifest=artifact.manifest,scope=manifest.scope,record=artifact.inventory.find(row=>row.uic_number===scope.uic_number),periods=artifact.injectionMonthly.map(row=>row.period_start).filter(Boolean).sort();
 return {artifactId:artifact.artifactId,uic:scope.uic_number,api:record?.api_no??'Unavailable',name:record?.lease_name??'Inventory dataset',well:record?.well_no_display??'',inventoryRows:artifact.inventory.length,monthlyRows:artifact.injectionMonthly.length,reportingMonths:new Set(periods.map(value=>value.slice(0,7))).size,linkedWells:new Set(artifact.injectionMonthly.filter(row=>row.parent_key).map(row=>row.uic_number)).size,quarantined:artifact.qualityReport.inventory.quarantined+artifact.qualityReport.monthly.quarantined,period:periods.length?periods[0].slice(0,7)+' – '+periods.at(-1).slice(0,7):'No reports returned',queryPeriod:scope.start+(scope.end?' – '+scope.end:' onward (no upper bound recorded)'),retrievedAt:manifest.sources.find(source=>source.kind==='monthly')?.retrieved_at??manifest.sources[0]?.retrieved_at};
}
export function associatedRun(artifactId,runs,preferred=null){
 const matching=runs.filter(run=>run.artifactId===artifactId&&run.status==='succeeded');return matching.find(run=>run.runId===preferred)?.runId??matching[0]?.runId??null;
}
