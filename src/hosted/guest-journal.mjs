// Guest journal contract. Every operation takes one JSON-compatible argument and
// resolves to JSON-compatible data, so guest-transport.mjs (service-only Supabase
// RPC, unverified) is source-compatible with this reference. The in-memory journal
// is a local reference for explicit local servers and tests only: it is never
// mounted by the hosted entrypoint and holds no durable state.
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {workflowView} from '../../public/workflow.js';
import {resumeRunRecorder} from '../runEvents.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
export const GUEST_LIMITS=Object.freeze({leaseMs:180_000,laneMs:600_000,tokenMs:86_400_000,tokensPerHour:200,lookupMaxAgeMs:86_400_000,lookupRetentionMs:86_400_000,evidenceRetentionMs:604_800_000,evidenceBytes:10_000_000,lookupsPerHour:10,collectionsPerDay:3,globalCollectionsPerDay:20,maxAttempts:2,cleanupAgeMs:3_600_000});
export const GUEST_STEPS=Object.freeze({lookup:Object.freeze(['L1','L2','L3']),collection:Object.freeze(['C0','C1','C2','C3','C4','C5','C6','C7','C8','C9']),replay:Object.freeze(['R0','C8','C9'])});
const lanes=Object.freeze({lookup:'lookup',collection:'collection',replay:'collection'});
const terminal=new Set(['succeeded','failed','interrupted']);
const hex=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,attemptPattern=/^[LCRF][0-9]-a[1-9]$/,evidencePath=/^[a-z0-9][a-z0-9._-]{0,99}$/i,stagedPath=/^[a-z0-9_.\/-]{1,100}$/i,codePattern=/^[A-Z][A-Z0-9_]{0,63}$/;
const iso=ms=>new Date(ms).toISOString();
const isHash=value=>typeof value==='string'&&hex.test(value);
// Journal-anchored run clock: starts at the claim stamp (never before the last
// committed event) and advances one millisecond per event, never backwards.
export function monotonicClock(stampBase){
 let next=typeof stampBase==='string'?Date.parse(stampBase):NaN;
 if(!Number.isFinite(next)||iso(next)!==stampBase)throw failure('RUN_STATE_INVALID','Journal stamp base required');
 return ()=>iso(next++);
}
export function createMemoryGuestJournal({clock=Date.now,limits=GUEST_LIMITS,listObjects=async()=>[]}={}){
 const tokens=new Map(),jobs=new Map(),evidence=new Map(),staged=new Map(),publications=new Map(),reservations=new Map(),tombstones=new Set();
 let latest=-Infinity,maintenance={fence:0,leaseOwner:null,leaseExpiresAt:0};
 const now=()=>{const value=clock();if(!Number.isFinite(value))throw failure('JOURNAL_UNAVAILABLE','Journal clock unavailable');latest=Math.max(latest,value);return latest;};
 function owner(tokenHash){
  const token=isHash(tokenHash)?tokens.get(tokenHash):null;
  if(!token)throw failure('TOKEN_INVALID','Guest token required');
  if(token.expiresAt<=now())throw failure('TOKEN_EXPIRED','Guest token expired');
  return tokenHash;
 }
 function owned(tokenHash,jobId){const hash=owner(tokenHash),item=jobs.get(jobId);if(!item||item.ownerHash!==hash)throw failure('NOT_FOUND','Job unavailable');return item;}
 const expiresAt=item=>item.terminalAt===null?null:item.terminalAt+(item.kind==='lookup'?limits.lookupRetentionMs:limits.evidenceRetentionMs);
 const expired=item=>item.terminalAt!==null&&now()>=expiresAt(item);
 const live=item=>item.state==='running'&&item.leaseExpiresAt>now();
 const active=item=>!terminal.has(item.state);
 function view(item){
  const steps=GUEST_STEPS[item.kind],gone=expired(item),index=Math.min(item.step,steps.length-1);
  return structuredClone({jobId:item.jobId,kind:item.kind,state:gone?'expired':item.state,step:index+1,stepCount:steps.length,stepName:steps[index],attempt:item.attempt,testFixture:item.testFixture,due:active(item)&&!live(item)&&item.nextStepAt<=now(),createdAt:iso(item.createdAt),nextStepAt:iso(item.nextStepAt),laneDeadline:iso(item.laneDeadline),terminalAt:item.terminalAt===null?null:iso(item.terminalAt),expiresAt:item.terminalAt===null?null:iso(expiresAt(item)),errorCode:item.errorCode,result:item.state==='succeeded'&&!gone?item.result:null,runId:item.runCommitted&&!gone?item.run.runId:null});
 }
 const internal=item=>structuredClone({jobId:item.jobId,kind:item.kind,request:item.request,testFixture:item.testFixture,lookup:item.lookup,step:item.step,attempt:item.attempt,data:item.data,run:item.run,usedBytes:item.usedBytes,createdAt:iso(item.createdAt),state:item.state});
 // Lazy lane reaping: abandoned jobs past their deadline (with no live lease) are
 // interrupted and fenced out; freeing a lane never needs the owner's token.
 // An existing running record receives one terminal failed event (downstream skipped)
 // on the journal clock; no run or stage is invented when none was committed. An
 // invalid record stays uncommitted (unavailable) rather than being repaired.
 function interruptRun(item,t){
  const running=item.run?.events.at(-1);
  if(!item.run||item.run.endedAt||running?.status!=='running')return;
  try{
   const recorder=resumeRunRecorder(item.run,{clock:monotonicClock(iso(Math.max(t,Date.parse(running.timestamp)+1)))});
   recorder.fail(running.stage,failure('LANE_DEADLINE','Lane deadline passed before the next step'),{reason:'LANE_DEADLINE',stepName:GUEST_STEPS[item.kind][Math.min(item.step,GUEST_STEPS[item.kind].length-1)],interruptedAt:iso(t)});
   const run=recorder.snapshot();checkRun(item,run);Object.assign(item,{run,runCommitted:true});
  }catch{}
 }
 function reap(){const t=now();for(const item of jobs.values())if(active(item)&&item.laneDeadline<=t&&!live(item)){Object.assign(item,{fence:item.fence+1,state:'interrupted',leaseOwner:null,leaseExpiresAt:0,errorCode:'LANE_DEADLINE',terminalAt:t});interruptRun(item,t);}}
 function fenced(lease){
  const item=jobs.get(lease?.jobId);
  if(!item||item.fence!==lease.fence||item.leaseOwner!==lease.leaseOwner||item.state!=='running'||item.leaseExpiresAt<=now())throw failure('LEASE_LOST','Lease lost; nothing was committed');
  return item;
 }
 function checkRun(item,run){
  if(run===null)return;
  try{workflowView(run);}catch{throw failure('RUN_STATE_INVALID','Run record invalid');}
  const previous=item.run;
  if(previous&&(run.runId!==previous.runId||run.startedAt!==previous.startedAt||run.events.length<previous.events.length||!isDeepStrictEqual(run.events.slice(0,previous.events.length),previous.events)))throw failure('RUN_STATE_INVALID','Run journal events may only be appended');
 }
 function checkSelect(item,attemptId){
  if(attemptId===null||attemptId===undefined)return [];
  if(!attemptPattern.test(attemptId))throw failure('REQUEST_INVALID','Evidence attempt invalid');
  const rows=evidence.get(item.jobId),chosen=rows.filter(row=>row.attemptId===attemptId);
  for(const row of chosen)if(row.path!=='acquisition.json'&&rows.some(other=>other.selected&&other.path===row.path&&other!==row))throw failure('EVIDENCE_CONFLICT','Selected evidence is never replaced');
  return chosen;
 }
 function applySelect(item,chosen){const rows=evidence.get(item.jobId);for(const row of chosen){for(const other of rows)if(other.path===row.path)other.selected=false;row.selected=true;}}
 const release=item=>Object.assign(item,{leaseOwner:null,leaseExpiresAt:0});
 function prior(hash,idemKey,requestDigest){
  const item=[...jobs.values()].find(entry=>entry.ownerHash===hash&&entry.idemKey===idemKey);
  if(!item)return null;
  if(item.requestDigest!==requestDigest)throw failure('IDEMPOTENCY_CONFLICT','Idempotency key was already used for a different request');
  return view(item);
 }
 async function issueToken({tokenHash}={}){
  if(!isHash(tokenHash)||tokens.has(tokenHash))throw failure('REQUEST_INVALID','Token hash invalid');
  const t=now();if([...tokens.values()].filter(token=>token.issuedAt>t-3_600_000).length>=limits.tokensPerHour)throw failure('TOKEN_QUOTA','Guest session issuance limit reached');
  tokens.set(tokenHash,{issuedAt:t,expiresAt:t+limits.tokenMs});return {expiresAt:iso(t+limits.tokenMs)};
 }
 async function replay({tokenHash,idemKey,requestDigest}={}){return prior(owner(tokenHash),idemKey,requestDigest);}
 // Replay precedes every lane, age and quota check and never consumes quota again.
 async function enqueue({tokenHash,idemKey,kind,requestDigest,request,testFixture,lookup=null}={}){
  const hash=owner(tokenHash),existing=prior(hash,idemKey,requestDigest);
  if(existing)return {job:existing,replayed:true};
  if(!Object.hasOwn(GUEST_STEPS,kind)||typeof idemKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(idemKey)||!isHash(requestDigest)||!request||typeof request!=='object'||typeof testFixture!=='boolean')throw failure('REQUEST_INVALID','Job request invalid');
  reap();const t=now(),all=[...jobs.values()];
  if(kind==='collection'){const parent=jobs.get(lookup?.jobId);
   if(!parent||parent.ownerHash!==hash||parent.kind!=='lookup'||parent.state!=='succeeded'||t-parent.terminalAt>=limits.lookupMaxAgeMs||parent.result?.sha256!==lookup.lookupSha256||parent.result?.lookupId!==lookup.lookupId||parent.testFixture!==testFixture)throw failure('LOOKUP_UNAVAILABLE','An owned succeeded lookup under 24 hours old is required');}
  if(all.some(item=>item.ownerHash===hash&&active(item)))throw failure('TOKEN_BUSY','This session already has an active job');
  if(all.some(item=>lanes[item.kind]===lanes[kind]&&active(item)))throw failure('LANE_BUSY','Another guest job is active in this lane');
  const recent=(window,test)=>all.filter(item=>item.createdAt>t-window&&test(item)).length;
  if(kind==='lookup'?recent(3_600_000,item=>item.ownerHash===hash&&item.kind==='lookup')>=limits.lookupsPerHour:recent(86_400_000,item=>item.ownerHash===hash&&item.kind!=='lookup')>=limits.collectionsPerDay||recent(86_400_000,item=>item.kind!=='lookup')>=limits.globalCollectionsPerDay)throw failure('QUOTA_EXCEEDED','Guest job quota reached');
  const item={jobId:randomUUID(),kind,ownerHash:hash,idemKey,requestDigest,request:structuredClone(request),testFixture,lookup:kind==='collection'?structuredClone(lookup):null,state:'queued',fence:0,leaseOwner:null,leaseExpiresAt:0,nextStepAt:t,laneDeadline:t+limits.laneMs,step:0,attempt:1,data:{},run:null,runCommitted:false,result:null,errorCode:null,usedBytes:0,createdAt:t,terminalAt:null};
  jobs.set(item.jobId,item);evidence.set(item.jobId,[]);return {job:view(item),replayed:false};
 }
 // Reads never reap, claim or otherwise change a job.
 async function readJob({tokenHash,jobId}={}){return view(owned(tokenHash,jobId));}
 async function history({tokenHash}={}){const hash=owner(tokenHash);return [...jobs.values()].filter(item=>item.ownerHash===hash).sort((a,b)=>(b.createdAt-a.createdAt)||(a.jobId<b.jobId?-1:1)).map(view);}
 async function claim({tokenHash,jobId,leaseOwner}={}){
  const item=owned(tokenHash,jobId);
  if(typeof leaseOwner!=='string'||!uuid.test(leaseOwner))throw failure('REQUEST_INVALID','Lease owner invalid');
  reap();const t=now();
  // A live lease returns status unchanged: no fence change and no second step.
  if(!active(item)||live(item)||item.nextStepAt>t)return {lease:null,job:view(item)};
  // Reclaiming an expired lease counts the lost lease as one attempt.
  if(item.state==='running')item.attempt++;
  Object.assign(item,{fence:item.fence+1,state:'running',leaseOwner,leaseExpiresAt:t+limits.leaseMs});
  const last=item.run?Date.parse(item.run.events.at(-1)?.timestamp??item.run.startedAt)+1:t;
  return {lease:{jobId,fence:item.fence,leaseOwner,leaseExpiresAt:iso(item.leaseExpiresAt),stampBase:iso(Math.max(t,last))},job:internal(item)};
 }
 async function renew({lease}={}){const item=fenced(lease);item.leaseExpiresAt=now()+limits.leaseMs;return {...structuredClone(lease),leaseExpiresAt:iso(item.leaseExpiresAt)};}
 // Keys selected for deletion by an in-flight cleanup refuse new admission (fail closed)
 // until the cleanup confirms; admission always precedes the storage write.
 function admit(objectKey){if(tombstones.has(objectKey))throw failure('OBJECT_BUSY','Object is being cleaned up; retry later');}
 async function reserveObject({lease,sha256,bytes,objectKey}={}){
  const item=fenced(lease);
  if(!isHash(sha256)||!Number.isSafeInteger(bytes)||bytes<0||objectKey!==`sha256/${sha256}`)throw failure('REQUEST_INVALID','Object reservation invalid');
  admit(objectKey);const rows=reservations.get(item.jobId)??[];
  if(!rows.some(row=>row.objectKey===objectKey))rows.push({sha256,bytes,objectKey});
  reservations.set(item.jobId,rows);return {objectKey};
 }
 async function recordEvidence({lease,attemptId,path,sha256,bytes,objectKey}={}){
  const item=fenced(lease);
  if(!attemptPattern.test(attemptId??'')||!evidencePath.test(path??'')||!isHash(sha256)||!Number.isSafeInteger(bytes)||bytes<0||objectKey!==`sha256/${sha256}`)throw failure('REQUEST_INVALID','Evidence entry invalid');
  const rows=evidence.get(item.jobId),existing=rows.find(row=>row.attemptId===attemptId&&row.path===path);
  if(existing){if(existing.sha256===sha256&&existing.bytes===bytes)return {usedBytes:item.usedBytes};throw failure('EVIDENCE_CONFLICT','Recorded evidence is never replaced');}
  if(item.usedBytes+bytes>limits.evidenceBytes)throw failure('SOURCE_LIMIT','Guest evidence would exceed 10,000,000 total bytes; nothing was truncated');
  admit(objectKey);
  rows.push({attemptId,path,sha256,bytes,objectKey,selected:false});item.usedBytes+=bytes;return {usedBytes:item.usedBytes};
 }
 async function listEvidence({jobId}={}){return (evidence.get(jobId)??[]).filter(row=>row.selected).map(({attemptId,path,sha256,bytes,objectKey})=>({attemptId,path,sha256,bytes,objectKey})).sort((a,b)=>a.path<b.path?-1:1);}
 async function recordStaged({lease,entries}={}){
  const item=fenced(lease);
  if(!Array.isArray(entries)||!entries.length||entries.length>103||new Set(entries.map(entry=>entry?.name)).size!==entries.length||entries.some(entry=>!entry||JSON.stringify(Object.keys(entry))!=='["name","sha256","bytes","objectKey"]'||!stagedPath.test(entry.name)||entry.name.split('/').some(part=>!part||part==='.'||part==='..')||!isHash(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.objectKey!==`sha256/${entry.sha256}`))throw failure('REQUEST_INVALID','Staged output set invalid');
  const existing=staged.get(item.jobId);
  if(existing&&!isDeepStrictEqual(existing,entries))throw failure('EXPORT_MISMATCH','A different staged output set already exists');
  if(existing)return {count:entries.length};
  for(const entry of entries)admit(entry.objectKey);
  staged.set(item.jobId,structuredClone(entries));return {count:entries.length};
 }
 async function listStaged({jobId}={}){return structuredClone(staged.get(jobId)??[]);}
 async function advance({lease,data,run=null,select=null}={}){
  const item=fenced(lease);checkRun(item,run);
  if(run?.endedAt)throw failure('RUN_STATE_INVALID','Intermediate steps commit only a running record');
  if(item.step+1>=GUEST_STEPS[item.kind].length)throw failure('RUN_STATE_INVALID','The final step commits only through publish');
  const chosen=checkSelect(item,select);applySelect(item,chosen);
  Object.assign(release(item),{data:structuredClone(data??{}),run:run?structuredClone(run):item.run,step:item.step+1,attempt:1,state:'queued',nextStepAt:now()});
  return view(item);
 }
 async function retry({lease,data,backoffMs}={}){
  const item=fenced(lease);
  if(!Number.isSafeInteger(backoffMs)||backoffMs<30_000||backoffMs>120_000)throw failure('REQUEST_INVALID','Retry backoff must be 30-120 seconds');
  if(item.attempt>=limits.maxAttempts)throw failure('RUN_STATE_INVALID','Retry budget exhausted');
  Object.assign(release(item),{data:structuredClone(data??{}),attempt:item.attempt+1,state:'retry_wait',nextStepAt:now()+backoffMs});
  return view(item);
 }
 async function fail({lease,errorCode,run=null,data=null,select=null}={}){
  const item=fenced(lease);checkRun(item,run);
  if(!codePattern.test(errorCode??''))throw failure('REQUEST_INVALID','Error code invalid');
  if((item.run||run)&&(!run?.endedAt||run.status!=='failed'))throw failure('RUN_STATE_INVALID','A failed job commits only its terminal failed run record');
  const chosen=checkSelect(item,select);applySelect(item,chosen);
  Object.assign(release(item),{state:'failed',errorCode,run:run?structuredClone(run):item.run,runCommitted:Boolean(run),terminalAt:now(),data:data===null?item.data:structuredClone(data)});
  return view(item);
 }
 // The only success transition: one fenced commit of publication, run record and result.
 async function publish({lease,result,run=null,publication=null,select=null}={}){
  const item=fenced(lease);
  if(item.step!==GUEST_STEPS[item.kind].length-1)throw failure('RUN_STATE_INVALID','Success commits only at the final step');
  if(!result||typeof result!=='object')throw failure('REQUEST_INVALID','Job result required');
  if(item.kind==='lookup'){if(run!==null||publication!==null)throw failure('REQUEST_INVALID','Lookups publish no run or archive');}
  else{
   checkRun(item,run);
   if(run?.status!=='succeeded'||!run.endedAt)throw failure('RUN_STATE_INVALID','Publication requires the succeeded terminal run record');
   const archive=publication?.archive;
   if(publications.has(item.jobId)||!isDeepStrictEqual(publication?.files,staged.get(item.jobId))||!isHash(archive?.sha256)||!Number.isSafeInteger(archive.bytes)||archive.objectKey!==`sha256/${archive.sha256}`||publication.runId!==run.runId||result.archiveSha256!==archive.sha256||result.runId!==run.runId||result.artifactId!==publication.artifactId)throw failure('EXPORT_MISMATCH','Publication must reference exactly the staged set, its archive and run');
  }
  const chosen=checkSelect(item,select);applySelect(item,chosen);
  if(publication)publications.set(item.jobId,structuredClone(publication));
  Object.assign(release(item),{state:'succeeded',result:structuredClone(result),run:run?structuredClone(run):item.run,runCommitted:Boolean(run),terminalAt:now()});
  return view(item);
 }
 function retained(tokenHash,jobId){const item=owned(tokenHash,jobId);if(expired(item))throw failure('EVIDENCE_EXPIRED','Guest evidence has expired and is unavailable');return item;}
 async function readPublication({tokenHash,jobId}={}){const item=retained(tokenHash,jobId);if(item.state!=='succeeded'||!publications.has(item.jobId))throw failure('NOT_FOUND','No committed publication');return structuredClone(publications.get(item.jobId));}
 async function readRun({tokenHash,jobId,runId}={}){const item=retained(tokenHash,jobId);if(!item.runCommitted||item.run.runId!==runId||!item.run.endedAt)throw failure('NOT_FOUND','Only an owned committed terminal run is served');return structuredClone(item.run);}
 async function claimMaintenance({leaseOwner}={}){
  if(typeof leaseOwner!=='string'||!uuid.test(leaseOwner))throw failure('REQUEST_INVALID','Lease owner invalid');
  const t=now();if(maintenance.leaseOwner&&maintenance.leaseExpiresAt>t)return null;
  maintenance={fence:maintenance.fence+1,leaseOwner,leaseExpiresAt:t+limits.leaseMs};
  return {fence:maintenance.fence,leaseOwner,leaseExpiresAt:iso(maintenance.leaseExpiresAt)};
 }
 function maintained(lease){if(lease?.fence!==maintenance.fence||lease.leaseOwner!==maintenance.leaseOwner||maintenance.leaseExpiresAt<=now())throw failure('LEASE_LOST','Maintenance lease lost; nothing may be deleted');}
 const references=item=>[...(evidence.get(item.jobId)??[]).map(row=>row.objectKey),...(staged.get(item.jobId)??[]).map(entry=>entry.objectKey),...(reservations.get(item.jobId)??[]).map(row=>row.objectKey),...(publications.has(item.jobId)?[publications.get(item.jobId).archive.objectKey]:[])];
 // Terminal for at least cleanupAgeMs and past retention: no in-flight request can still write.
 const settled=item=>expired(item)&&item.terminalAt!==null&&item.terminalAt<=now()-limits.cleanupAgeMs;
 function candidates(){const keep=new Set(),drop=new Set();for(const item of jobs.values())for(const key of references(item))(settled(item)?drop:keep).add(key);return [...drop].filter(key=>!keep.has(key)).sort();}
 async function cleanupCandidates({lease}={}){maintained(lease);reap();const keys=candidates();for(const key of keys)tombstones.add(key);return keys;}
 // Rechecks references under the maintenance fence. Rows are released only after the
 // caller confirmed deletion, so incomplete cleanup frees nothing optimistically.
 async function confirmCleanup({lease,keys}={}){
  maintained(lease);const current=new Set(candidates());
  if(!Array.isArray(keys)||keys.some(key=>!current.has(key)))throw failure('CLEANUP_CONFLICT','Cleanup references changed; nothing was released');
  const removed=new Set(keys);
  for(const item of jobs.values())if(expired(item)){
   evidence.set(item.jobId,(evidence.get(item.jobId)??[]).filter(row=>!removed.has(row.objectKey)));
   if(staged.has(item.jobId))staged.set(item.jobId,staged.get(item.jobId).filter(entry=>!removed.has(entry.objectKey)));
  if(reservations.has(item.jobId))reservations.set(item.jobId,reservations.get(item.jobId).filter(row=>!removed.has(row.objectKey)));
   if(removed.has(publications.get(item.jobId)?.archive.objectKey))publications.delete(item.jobId);
  }
 for(const key of keys)tombstones.delete(key);
  maintenance={...maintenance,leaseOwner:null,leaseExpiresAt:0};return {removed:keys.length};
 }
 const referenced=()=>{const all=new Set();for(const item of jobs.values())for(const key of references(item))all.add(key);return all;};
 async function orphanCandidates({lease}={}){
  maintained(lease);const refs=referenced(),cutoff=now()-limits.cleanupAgeMs,keys=[];
  for(const {key,createdAt} of await listObjects())if(/^sha256\/[a-f0-9]{64}$/.test(key)&&createdAt<=cutoff&&!refs.has(key)){tombstones.add(key);keys.push(key);}
  return keys.sort();
 }
 // Like confirmCleanup, releases the maintenance lease so the next sweep can run.
 async function confirmOrphans({lease,keys}={}){
  maintained(lease);const refs=referenced();
  if(!Array.isArray(keys)||keys.some(key=>!tombstones.has(key)||refs.has(key)))throw failure('CLEANUP_CONFLICT','Orphan references changed; nothing was released');
  for(const key of keys)tombstones.delete(key);
  maintenance={...maintenance,leaseOwner:null,leaseExpiresAt:0};return {removed:keys.length};
 }
 return Object.freeze({kind:'local_reference',issueToken,replay,enqueue,job:readJob,history,claim,renew,reserveObject,recordEvidence,evidence:listEvidence,recordStaged,staged:listStaged,advance,retry,fail,publish,publication:readPublication,run:readRun,claimMaintenance,cleanupCandidates,confirmCleanup,orphanCandidates,confirmOrphans});
}
