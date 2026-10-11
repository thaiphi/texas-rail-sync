import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {lookupTarget} from './sources.mjs';
import {sha256} from './normalize.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
export async function fetchSource(target,{fetchImpl=fetch,testFixture=false}={}){
 if(fetchImpl!==fetch&&!testFixture)throw failure('SOURCE_INVALID','Injected responses require fixture mode');
 const response=await fetchImpl(target.url,{signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!response.ok)throw failure('HTTP_ERROR','Official source request failed');
 if(Number(response.headers.get('content-length'))>10_000_000)throw failure('SOURCE_LIMIT','Source byte cap exceeded');
 const reader=response.body?.getReader();if(!reader)throw failure('SOURCE_INVALID','Source response body unavailable');
 const chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10_000_000){await reader.cancel();throw failure('SOURCE_LIMIT','Source byte cap exceeded');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const body=Buffer.concat(chunks,size),metadata={url:target.url,retrieved_at:new Date().toISOString(),http_status:response.status,last_modified:response.headers.get('last-modified'),etag:response.headers.get('etag'),sha256:sha256(body),bytes:body.length,testFixture};
 return {body,metadata};
}
const identityFields=['uic_number','api_no','operator_number','district_code','lease_number','lease_name','well_no_display','w14_number'];
const candidateFields=[...identityFields,'max_liq_inj_pressure','bbl_vol_inj','top_inj_zone','bot_inj_zone','uic_type_injection','permit_canceled_date','w3_plugged_date'];
export const sameIdentity=(left,right)=>identityFields.every(key=>left[key]===right[key]);
function inspectRows(rows,request){
 if(!Array.isArray(rows)||rows.length>25)throw failure('SOURCE_INVALID','Lookup candidate bounds invalid');
 const field=request.kind==='uic'?'uic_number':'api_no';
 if(rows.some(row=>!row||typeof row!=='object'||row[field]!==request.value))throw failure('SOURCE_SCOPE_MISMATCH','Lookup rows contradict the exact identifier predicate');
 const capped=rows.length===25,counts=new Map();for(const row of rows)counts.set(row.uic_number,(counts.get(row.uic_number)??0)+1);
 return {status:capped?'cap_reached':rows.length?'ready':'empty',candidates:rows.map((row,index)=>({sourceRecordKey:`lookup:${index+1}`,ordinal:index+1,...Object.fromEntries(candidateFields.map(key=>[key,row[key]??''])),selectable:!capped&&/^\d{9}$/.test(row.uic_number)&&counts.get(row.uic_number)===1,reason:capped?'Candidate cap reached':counts.get(row.uic_number)>1?'Duplicate UIC parent identity':!/^\d{9}$/.test(row.uic_number)?'Invalid UIC identity':null}))};
}
export async function performLookup({request,lookupRoot,fetchImpl=fetch,testFixture=false}){
 const target=lookupTarget(request),lookupId=randomUUID(),directory=resolve(lookupRoot,lookupId);
 await mkdir(lookupRoot,{recursive:true});await mkdir(directory);
 const evidence={schemaVersion:2,lookupId,request,testFixture,status:'running',files:{}};
 try{
  for(const item of [{name:'lookup-metadata.json',url:'https://data.texas.gov/api/views/givw-z9t4.json'},target]){
   const {body,metadata}=await fetchSource(item,{fetchImpl,testFixture}),sidecar=item.name.replace(/\.[^.]+$/,'')+'.source.json',metaBytes=Buffer.from(JSON.stringify(metadata,null,2)+'\n');
   await writeFile(resolve(directory,item.name),body,{flag:'wx'});await writeFile(resolve(directory,sidecar),metaBytes,{flag:'wx'});
   evidence.files[item.name]=sha256(body);evidence.files[sidecar]=sha256(metaBytes);
  }
  const rows=JSON.parse(await readFile(resolve(directory,target.name))),view=inspectRows(rows,request);evidence.status=view.status;
  await writeFile(resolve(directory,'lookup.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  return {lookupId,...view,queryUrl:target.url,sha256:evidence.files[target.name],testFixture,retrievedAt:JSON.parse(await readFile(resolve(directory,'lookup-inventory.source.json'))).retrieved_at,sourceRowsUpdatedAt:JSON.parse(await readFile(resolve(directory,'lookup-metadata.json'))).rowsUpdatedAt??null};
 }catch(error){evidence.status='failed';evidence.error={code:error.code??'SOURCE_INVALID',message:error.message};await writeFile(resolve(directory,'lookup.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});throw error;}
}
export async function validateSelectionEvidence(read,selection){
 const evidence=JSON.parse(await read('lookup.json'));lookupTarget(evidence.request);
 if(evidence.schemaVersion!==2||!['ready','empty','cap_reached'].includes(evidence.status)||typeof evidence.testFixture!=='boolean'||evidence.lookupId!==selection.lookupId)throw failure('SOURCE_INVALID','Lookup evidence is incomplete');
 const expectedNames=['lookup-metadata.json','lookup-metadata.source.json','lookup-inventory.json','lookup-inventory.source.json'];
 if(JSON.stringify(Object.keys(evidence.files).sort())!==JSON.stringify(expectedNames.sort()))throw failure('SOURCE_INVALID','Lookup evidence file inventory invalid');
 for(const name of expectedNames)if(sha256(await read(name))!==evidence.files[name])throw failure('SOURCE_HASH_MISMATCH','Lookup evidence hash mismatch');
 for(const [name,url] of [['lookup-inventory',lookupTarget(evidence.request).url],['lookup-metadata','https://data.texas.gov/api/views/givw-z9t4.json']]){
  const metadata=JSON.parse(await read(name+'.source.json')),body=await read(name+'.json');
  if(metadata.url!==url||metadata.http_status!==200||metadata.testFixture!==evidence.testFixture||metadata.sha256!==sha256(body)||metadata.bytes!==body.length||!Number.isFinite(Date.parse(metadata.retrieved_at)))throw failure('SOURCE_PROVENANCE_CONFLICT','Lookup retrieval evidence classification or hash invalid');
 }
 const rows=JSON.parse(await read('lookup-inventory.json')),view=inspectRows(rows,evidence.request),candidate=view.candidates.find(row=>row.sourceRecordKey===selection.sourceRecordKey);
 if(!candidate||!candidate.selectable)throw failure('SOURCE_INVALID','Selected candidate is unavailable, capped or has ambiguous duplicate parent identity');
 if(Object.hasOwn(selection,'ordinal')&&selection.ordinal!==candidate.ordinal)throw failure('SOURCE_INVALID','Persisted selection ordinal contradicts selected source record identity');
 if(selection.lookupSha256&&selection.lookupSha256!==evidence.files['lookup-inventory.json'])throw failure('SOURCE_HASH_MISMATCH','Selected lookup hash mismatch');
 return {lookupId:evidence.lookupId,sourceRecordKey:candidate.sourceRecordKey,ordinal:candidate.ordinal,lookupSha256:evidence.files['lookup-inventory.json'],row:rows[candidate.ordinal-1],testFixture:evidence.testFixture};
}
export async function loadSelection({lookupRoot,lookupId,sourceRecordKey}){
 if(typeof lookupId!=='string'||!/^[-a-f0-9]{36}$/i.test(lookupId)||!/^lookup:[1-9]\d*$/.test(sourceRecordKey))throw failure('SOURCE_INVALID','Invalid lookup selection identity');
 const read=name=>readFile(resolve(lookupRoot,lookupId,name)),selection=await validateSelectionEvidence(read,{lookupId,sourceRecordKey});
 const files={};for(const name of ['lookup.json','lookup-metadata.json','lookup-metadata.source.json','lookup-inventory.json','lookup-inventory.source.json'])files[name]=await read(name);
 return {...selection,files};
}
