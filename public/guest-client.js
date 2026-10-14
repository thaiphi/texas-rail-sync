// Browser guest client. The token lives only in sessionStorage (or memory when storage is
// blocked) and in the Authorization header; never in URLs. Jobs advance step by step.
const KEY='trrc-guest-session',TERMINAL=new Set(['succeeded','failed','expired','interrupted']);
const MESSAGES=Object.freeze({
 LANE_BUSY:'Busy — retrying shortly.',TOKEN_BUSY:'Busy — retrying shortly.',
 BUDGET_UNVERIFIED:'Guest collection is paused right now. Browsing saved datasets still works.',
 TOKEN_EXPIRED:'Your guest session expired. Start the lookup again.',TOKEN_INVALID:'Your guest session expired. Start the lookup again.',
 EVIDENCE_EXPIRED:'This guest dataset has expired. Collect it again to view it.'});
const LIMIT='Demo limit reached. Please try again later.',UNAVAILABLE='Guest collection is temporarily unavailable. Browsing saved datasets still works.';
export function guestMessage(code){return MESSAGES[code]??(/^(?:QUOTA_EXCEEDED|TOKEN_QUOTA|STORAGE_QUOTA|DATABASE_QUOTA|EGRESS_QUOTA|DOWNLOAD_QUOTA)$/.test(code)?LIMIT:UNAVAILABLE);}
// Only errors made here carry plain, user-safe text; anything else is shown as a guest code message.
const GUEST_ERROR=Symbol('guest-error');
const guestError=(code,detail)=>Object.assign(Error(guestMessage(code)),{code,detail,[GUEST_ERROR]:true});
export function isGuestError(error){return error?.[GUEST_ERROR]===true;}
export function createGuestClient({fetchImpl=globalThis.fetch.bind(globalThis),storage=globalThis.sessionStorage,sleep=ms=>new Promise(r=>setTimeout(r,ms)),newKey=()=>crypto.randomUUID().replaceAll('-',''),now=Date.now}={}){
 let memory=null;const archives=new Map();
 const read=()=>{try{const value=JSON.parse(storage.getItem(KEY)??'null');return value&&typeof value.token==='string'?value:memory;}catch{return memory;}};
 const write=value=>{memory=value;try{value?storage.setItem(KEY,JSON.stringify(value)):storage.removeItem(KEY);}catch{}};
 async function call(path,{method='GET',body,key,auth=true}={}){
  const headers={};if(body!==undefined)headers['content-type']='application/json';if(key)headers['idempotency-key']=key;
  if(auth){const session=await ensureSession();headers.authorization=`Guest ${session.token}`;}
  let response;try{response=await fetchImpl(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});}catch{throw guestError('GUEST_UNAVAILABLE');}
  if(response.ok)return response;
  let code='GUEST_UNAVAILABLE';try{code=(await response.json())?.error?.code??code;}catch{}
  if(code==='TOKEN_EXPIRED'||code==='TOKEN_INVALID')write(null);
  throw guestError(code);
 }
 async function ensureSession(){
  const current=read();if(current&&Date.parse(current.expiresAt)>now()+60_000)return current;
  const issued=await (await call('/api/guest/session',{method:'POST',body:{},auth:false})).json();write({token:issued.token,expiresAt:issued.expiresAt});return issued;
 }
 async function run(start,label,onProgress){
  let {job}=await (await start()).json(),busy=0;
  while(!TERMINAL.has(job.state)){
   onProgress?.(`${label}: step ${job.step} of ${job.stepCount}${job.state==='retry_wait'?' — waiting to retry the official source':''}…`);
   if(!job.due){await sleep(Math.min(120_000,Math.max(1_000,Date.parse(job.nextStepAt)-now())));}
   try{({job}=await (await call(`/api/guest/jobs/${job.jobId}/advance`,{method:'POST',body:{}})).json());busy=0;}
   catch(error){if((error.code==='LANE_BUSY'||error.code==='TOKEN_BUSY')&&++busy<=24){onProgress?.(guestMessage(error.code));await sleep(5_000);continue;}throw error;}
  }
  if(job.state!=='succeeded')throw guestError(job.errorCode??(job.state==='expired'?'EVIDENCE_EXPIRED':'GUEST_UNAVAILABLE'),job);
  return job;
 }
 return Object.freeze({
  async lookup({kind,value},{onProgress}={}){const job=await run(()=>call('/api/guest/lookups',{method:'POST',body:{kind,value},key:newKey()}),'Looking up official inventory',onProgress);return {...job.result,lookupJobId:job.jobId};},
  async collect(request,{onProgress}={}){const job=await run(()=>call('/api/guest/collections',{method:'POST',body:request,key:newKey()}),'Collecting official records',onProgress);return {jobId:job.jobId,result:job.result,runId:job.runId};},
  async run(jobId,runId){return (await call(`/api/guest/jobs/${jobId}/runs/${runId}`)).json();},
  async archive(jobId){if(!archives.has(jobId))archives.set(jobId,call(`/api/guest/jobs/${jobId}/archive`).then(r=>r.arrayBuffer()).catch(error=>{archives.delete(jobId);throw error;}));return archives.get(jobId);}
 });
}
