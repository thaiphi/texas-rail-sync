// One shape for collection.js: {ok,result,error}. Legacy calls the loopback API; guest calls
// the hosted guest client and returns legacy field names so the screens stay unchanged.
import {guestMessage} from './guest-client.js';
export function createLegacyCollectionApi({fetchImpl=globalThis.fetch.bind(globalThis)}={}){
 const post=async(path,body)=>{const response=await fetchImpl(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();return {ok:response.ok,result,error:result.error??null};};
 return Object.freeze({mode:'local',lookup:body=>post('/api/lookup',body),collect:body=>post('/api/collect',body)});
}
export function createGuestCollectionApi({client,onGuestPackage}){
 const lookupJobs=new Map();
 const failed=error=>({ok:false,result:{},error:{code:error.code??'GUEST_UNAVAILABLE',message:error.message||guestMessage('GUEST_UNAVAILABLE')}});
 return Object.freeze({mode:'guest',
  async lookup(body,{onProgress}={}){try{const result=await client.lookup(body,{onProgress});lookupJobs.set(result.lookupId,result.lookupJobId);return {ok:true,result,error:null};}catch(error){return failed(error);}},
  async collect({lookupId,sourceRecordKey,startMonth,endMonth},{onProgress}={}){
   try{
    const lookupJobId=lookupJobs.get(lookupId);if(!lookupJobId)return failed({code:'LOOKUP_UNAVAILABLE',message:'Look up the well again before collecting.'});
    const {jobId,result,runId}=await client.collect({lookupJobId,sourceRecordKey,startMonth,endMonth},{onProgress});
    const run=runId?await client.run(jobId,runId):null;onProgress?.('Preparing your private dataset…');
    await onGuestPackage?.({artifactId:result.artifactId,tarBytes:await client.archive(jobId),pins:result.pins,jobId});
    return {ok:true,result:{...result,run},error:null};
   }catch(error){return failed(error);}
  }});
}
