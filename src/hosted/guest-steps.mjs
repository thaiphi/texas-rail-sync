// Guest job steps: each advance executes at most one due step under a fenced lease,
// with at most one official fetch. Shared fetch, lookup inspection, selection replay,
// reader export and archive contracts are reused unchanged. Job success is only the
// fenced C9 publication commit; acquisition markers and run status never imply it.
import {Buffer} from 'node:buffer';
import {randomBytes,randomUUID} from 'node:crypto';
import {fetchSource} from '../sourceFetch.mjs';
import {boundedScope,lookupTarget,targetsForScope} from '../sources.mjs';
import {inspectRows,validateSelectionEvidence} from '../lookup.mjs';
import {prepareArtifactFromReader,finalizeArtifactFromReader} from '../exportCore.mjs';
import {createRunRecorder,resumeRunRecorder} from '../runEvents.mjs';
import {buildVersionArchiveFromReader} from '../archiveBytes.mjs';
import {sha256} from '../normalize.mjs';
import {GUEST_LIMITS,GUEST_STEPS,monotonicClock} from './guest-journal.mjs';
import {createStagedPublisher,createVerifiedEvidenceReader,putReservedObject,readPublishedArchive,recordEvidence,stageOutputs} from './evidence-store.mjs';
import {GUEST_BUDGETS,resolveAdmission} from './guest-admission.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
const lookupMetadataTarget=Object.freeze({name:'lookup-metadata.json',url:'https://data.texas.gov/api/views/givw-z9t4.json'});
const lookupFiles=Object.freeze(['lookup-metadata.json','lookup-metadata.source.json','lookup-inventory.json','lookup-inventory.source.json']);
const sidecar=name=>name.replace(/\.[^.]+$/,'')+'.source.json';
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
// The complete versioned evidence set that live preparation and finalization require.
export const GUEST_EVIDENCE_NAMES=Object.freeze(['acquisition.json','selection.json','lookup.json',...lookupFiles,...targetsForScope().flatMap(target=>[target.name,sidecar(target.name)])].sort());
const v2Recorder=Object.freeze({pipelineVersion:'rrc-collection-v2',schemaVersion:1,transformationVersion:'rrc-odp-v2.0.0'});
// Slow official hosts (TLS/response ~30 s+): 90 s fits Edge wall 150 s and leaseMs 180 s; 2 attempts, 30-120 s backoff, laneMs 600 s.
export const GUEST_SOURCE_TIMEOUT_MS=90_000;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const retryable=error=>error?.code==='HTTP_ERROR'||error?.code==='NETWORK_ERROR'||error?.name==='TimeoutError'||error?.name==='AbortError';
function errorCode(error){
 if(error?.code==='ENOENT')return 'EVIDENCE_UNAVAILABLE';
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'SOURCE_TIMEOUT';
 return typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)?error.code:'STEP_FAILED';
}
// Fails the current running stage (starting load for a fresh record); downstream is skipped.
function failRecorder(recorder,error){
 const current=recorder.snapshot();if(current.endedAt)return current;
 if(!current.events.length)recorder.start('load');
 recorder.fail(recorder.snapshot().events.at(-1).stage,error,error?.evidence??null);return recorder.snapshot();
}
export function createGuestService({journal,store:objectStore,fetchImpl=fetch,testFixture=false,preserved=null,random=Math.random,admission=null}={}){
 const store=objectStore;
 if(typeof journal?.claim!=='function'||typeof store?.get!=='function'||typeof store?.put!=='function')throw failure('GUEST_UNAVAILABLE','Guest journal and object store required');
 // Mirrors fetchSource: injected responses are fixtures, labeled as such end to end.
 if(fetchImpl!==fetch&&testFixture!==true)throw failure('SOURCE_INVALID','Injected responses require fixture mode');
 if(preserved!==null&&(typeof preserved?.read!=='function'||!Array.isArray(preserved.artifactIds)))throw failure('GUEST_UNAVAILABLE','Preserved replay source invalid');
 // Every step's Storage request is metered; only downloads read the unwrapped store.
 const meter=resolveAdmission(journal,admission),metered=meter.wrapStore(objectStore);
 const tokenHash=token=>{if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw failure('TOKEN_INVALID','Guest token required');return sha256(token);};
 const digest=value=>sha256(JSON.stringify(value));
 const scopeOf=job=>boundedScope(job.data.uic,job.request.startMonth,job.request.endMonth);
 const marker=(job,status)=>jsonBytes({schemaVersion:2,runId:job.data.runId,mode:'live_collection',testFixture:job.testFixture,status,targets:targetsForScope(scopeOf(job)).map(target=>target.url),scope:scopeOf(job)});
 const put=(ctx,path,bytes,attemptId=ctx.attemptId)=>recordEvidence({journal,store:metered,lease:ctx.lease,attemptId,path,bytes});
 async function fetchInto(ctx,target){
  ctx.fetchStep=true;
  if(ctx.job.usedBytes>=GUEST_LIMITS.evidenceBytes)throw failure('SOURCE_LIMIT','Guest evidence byte limit reached before fetch');
  const request={url:target.url,name:target.name,status:'running'};
  // fetchSource retains its 10 MB per-source cap. Smaller remaining journal room
  // is checked after fetch, so reserve the full network envelope, including failures.
  await meter.reserveEgress({kind:'processing',jobId:ctx.job.jobId,bytes:GUEST_LIMITS.evidenceBytes+65_536});
  try{
   const {body,metadata}=await fetchSource(target,{fetchImpl,testFixture,timeoutMs:GUEST_SOURCE_TIMEOUT_MS,onResponse:status=>{request.httpStatus=status;}}),metaBytes=jsonBytes(metadata);
   if(ctx.job.usedBytes+body.length+metaBytes.length>GUEST_LIMITS.evidenceBytes)throw failure('SOURCE_LIMIT','Guest evidence would exceed 10,000,000 total bytes; nothing was truncated');
   await put(ctx,target.name,body);await put(ctx,sidecar(target.name),metaBytes);
   request.status='succeeded';return {request,body};
  }catch(error){request.status='failed';if(error&&typeof error==='object'&&error.code!=='LEASE_LOST')error.request=request;throw error;}
 }
 async function lookupFetch(ctx){
  const {job}=ctx;await fetchInto(ctx,ctx.step==='L1'?lookupMetadataTarget:lookupTarget(job.request));
  return journal.advance({lease:ctx.lease,select:ctx.attemptId,data:{...job.data,lookupId:job.data.lookupId??randomUUID()}});
 }
 async function lookupInspect(ctx){
  const {job}=ctx,reader=await createVerifiedEvidenceReader({journal,store:metered,jobId:job.jobId}),files={};
  for(const name of lookupFiles)files[name]=sha256(await reader.read(name));
  const evidence={schemaVersion:2,lookupId:job.data.lookupId,request:job.request,testFixture,status:'running',files};
  try{
   const view=inspectRows(JSON.parse(await reader.read('lookup-inventory.json')),job.request);evidence.status=view.status;
   await put(ctx,'lookup.json',jsonBytes(evidence));
   const retrieval=JSON.parse(await reader.read('lookup-inventory.source.json')),metadata=JSON.parse(await reader.read('lookup-metadata.json'));
   return await journal.publish({lease:ctx.lease,select:ctx.attemptId,result:{lookupId:evidence.lookupId,...view,queryUrl:lookupTarget(job.request).url,sha256:files['lookup-inventory.json'],testFixture,retrievedAt:retrieval.retrieved_at,sourceRowsUpdatedAt:metadata.rowsUpdatedAt??null}});
  }catch(error){
   if(error?.code==='LEASE_LOST')throw error;
   evidence.status='failed';evidence.error={code:error?.code??'SOURCE_INVALID',message:error?.message};
   await put(ctx,'lookup.json',jsonBytes(evidence),'F0-a1').catch(markerError=>{if(markerError?.code==='LEASE_LOST')throw markerError;});
   if(error&&typeof error==='object')error.select='F0-a1';throw error;
  }
 }
 async function collectionPrepare(ctx){
  const {job}=ctx,recorder=createRunRecorder({mode:'live_collection',...v2Recorder,testFixture:job.testFixture,clock:ctx.clock});
  recorder.start('load');
  if(job.testFixture)recorder.classifySource({classification:'test_fixture',basis:'recorded_test_fixture_selection'});
  try{
   const lookup=await createVerifiedEvidenceReader({journal,store:metered,jobId:job.lookup.jobId});
   // Revalidated under this lease: selection identity, lookup hash and classification.
   const selection=await validateSelectionEvidence(lookup.read,{lookupId:job.lookup.lookupId,sourceRecordKey:job.request.sourceRecordKey,lookupSha256:job.lookup.lookupSha256});
   if(selection.testFixture!==job.testFixture)throw failure('SOURCE_PROVENANCE_CONFLICT','Selected lookup evidence and collection classification disagree');
   const scope=boundedScope(selection.row.uic_number,job.request.startMonth,job.request.endMonth);
   const data={uic:scope.monthlyUic,runId:recorder.snapshot().runId,artifactId:`rrc-${job.createdAt.slice(0,10)}-uic${scope.monthlyUic}-${job.jobId}`,sourceReference:`guest/${job.jobId}`,marker:'running',requests:[],outputs:[],attempts:[]};
   await put(ctx,'acquisition.json',marker({...job,data},'running'));
   for(const name of ['lookup.json',...lookupFiles])await put(ctx,name,await lookup.read(name));
   await put(ctx,'selection.json',jsonBytes({lookupId:selection.lookupId,sourceRecordKey:selection.sourceRecordKey,ordinal:selection.ordinal,lookupSha256:selection.lookupSha256}));
   return await journal.advance({lease:ctx.lease,select:ctx.attemptId,data,run:recorder.snapshot()});
  }catch(error){if(error?.code!=='LEASE_LOST'&&error&&typeof error==='object'&&!error.record)error.record=failRecorder(recorder,error);throw error;}
 }
 async function collectionFetch(ctx,index){
  const {job}=ctx,target=targetsForScope(scopeOf(job))[index];
  let fetched;
  try{fetched=await fetchInto(ctx,target);}
  catch(error){if(error&&typeof error==='object'&&error.code!=='LEASE_LOST')error.evidence={requests:[...job.data.requests,error.request??{url:target.url,name:target.name,status:'failed'}],outputs:job.data.outputs};throw error;}
  const {request,body}=fetched;
  return journal.advance({lease:ctx.lease,select:ctx.attemptId,data:{...job.data,requests:[...job.data.requests,{url:target.url,name:target.name,status:'succeeded',httpStatus:request.httpStatus}],outputs:[...job.data.outputs,{path:`${job.data.sourceReference}/${target.name}`,url:target.url,sha256:sha256(body),bytes:body.length,count:null}]}});
 }
 async function replayCopy(ctx){
  const {job}=ctx,artifactId=job.request.artifactId;
  // Preserved public package bytes, read-only. This is an offline replay, not a fetch.
  for(const name of GUEST_EVIDENCE_NAMES)await put(ctx,name,await preserved.read(artifactId,name));
  return journal.advance({lease:ctx.lease,select:ctx.attemptId,data:{artifactId,sourceReference:`guest/${job.jobId}`,attempts:[]}});
 }
 async function processStep(ctx){
  const {job}=ctx,live=job.kind==='collection';
  const recorder=live?resumeRunRecorder(job.run,{clock:ctx.clock}):createRunRecorder({mode:'offline_replay',...v2Recorder,testFixture:false,clock:ctx.clock});
  try{
   const pending=live?[await put(ctx,'acquisition.json',marker(job,'succeeded'))]:[];
   const reader=await createVerifiedEvidenceReader({journal,store:metered,jobId:job.jobId,pending});
   await reader.requireAll(GUEST_EVIDENCE_NAMES);
   const prepared=await prepareArtifactFromReader({readBytes:reader.read,sourceReference:job.data.sourceReference,artifactId:job.data.artifactId,recorder,acquisitionEvidence:live?{requests:job.data.requests,outputs:job.data.outputs}:null});
   await stageOutputs({journal,store:metered,lease:ctx.lease,files:prepared.files});
   return await journal.advance({lease:ctx.lease,select:live?ctx.attemptId:null,data:{...job.data,...(live?{marker:'succeeded'}:{})},run:prepared.record});
  }catch(error){if(error?.code!=='LEASE_LOST'&&error&&typeof error==='object'&&!error.record)error.record=failRecorder(recorder,error);throw error;}
 }
 async function commitStep(ctx){
  const {job}=ctx,reader=await createVerifiedEvidenceReader({journal,store:metered,jobId:job.jobId});
  await reader.requireAll(GUEST_EVIDENCE_NAMES);
  const publisher=await createStagedPublisher({journal,store:metered,jobId:job.jobId,buildArchive:async read=>{
   let pinsBytes;try{pinsBytes=await read('version-pins.json');}catch{throw failure('ARCHIVE_INVALID','Publication pins are unavailable');}
   // The production whole-version builder; it refuses fixtures and non-public provenance.
   return buildVersionArchiveFromReader({read,pins:{...JSON.parse(pinsBytes),publicationPinsSha256:sha256(pinsBytes),defaultPinned:false}});
  }});
  const result=await finalizeArtifactFromReader({readBytes:reader.read,sourceReference:job.data.sourceReference,artifactId:job.data.artifactId,recorder:resumeRunRecorder(job.run,{clock:ctx.clock}),publisher});
  const archive=await putReservedObject({journal,store:metered,lease:ctx.lease,bytes:publisher.pending().archive}),pinsBytes=Buffer.from(result.files['version-pins.json']),pins={...JSON.parse(pinsBytes),publicationPinsSha256:sha256(pinsBytes)};
  return journal.publish({lease:ctx.lease,run:result.record,publication:{artifactId:job.data.artifactId,files:publisher.entries(),pins,archive,runId:result.record.runId},result:{kind:job.kind,mode:result.record.mode,artifactId:job.data.artifactId,pins,archiveSha256:archive.sha256,archiveBytes:archive.bytes,runId:result.record.runId,scope:result.manifest.scope,realHistoryStatus:result.manifest.real_history_status,testFixture:result.record.testFixture}});
 }
 async function failJob(ctx,error){
  const {job}=ctx;let run=error?.record??null,select=error?.select??null;
  if(!run&&job.run)run=failRecorder(resumeRunRecorder(job.run,{clock:ctx.clock}),error);
  if(job.kind==='collection'&&job.data.marker==='running'){
   try{await put(ctx,'acquisition.json',marker(job,'failed'),'F0-a1');select='F0-a1';}catch(markerError){if(markerError?.code==='LEASE_LOST')throw markerError;}
  }
  const attempts=[...(job.data.attempts??[]),...(error?.request?[{step:ctx.step,attempt:job.attempt,...error.request,code:errorCode(error)}]:[])];
  return journal.fail({lease:ctx.lease,errorCode:errorCode(error),run,select,data:{...job.data,attempts}});
 }
 async function execute(lease,job){
  const step=GUEST_STEPS[job.kind][job.step],ctx={lease,job,step,clock:monotonicClock(lease.stampBase),attemptId:`${step}-a${job.attempt}`,fetchStep:false};
  try{
   
   if(job.attempt>GUEST_LIMITS.maxAttempts)throw failure('STEP_INTERRUPTED','The step lost its lease on every permitted attempt');
   if(step==='L1'||step==='L2')return await lookupFetch(ctx);
   if(step==='L3')return await lookupInspect(ctx);
   if(step==='C0')return await collectionPrepare(ctx);
   if(step==='R0')return await replayCopy(ctx);
   if(step==='C8')return await processStep(ctx);
   if(step==='C9')return await commitStep(ctx);
   return await collectionFetch(ctx,Number(step.slice(1))-1);
  }catch(error){
   if(error?.code==='LEASE_LOST')throw error;
   if(ctx.fetchStep&&retryable(error)&&job.attempt<GUEST_LIMITS.maxAttempts)return journal.retry({lease,backoffMs:30_000+Math.floor(random()*90_001),data:{...job.data,attempts:[...(job.data.attempts??[]),{step,attempt:job.attempt,...(error.request??{}),code:errorCode(error)}]}});
   return failJob(ctx,error);
  }
 }
 async function advance({token,jobId}={}){
  const hash=tokenHash(token),{lease,job}=await journal.claim({tokenHash:hash,jobId,leaseOwner:randomUUID()});
  if(!lease)return job;
  // A lost lease is neither success nor failure evidence; status is reported as-is.
  try{await execute(lease,job);}catch(error){if(error?.code!=='LEASE_LOST')throw error;}
  return journal.job({tokenHash:hash,jobId});
 }
 async function enqueueLookup({token,idemKey,request}={}){
  const hash=tokenHash(token);lookupTarget(request);const owned={kind:request.kind,value:request.value},requestDigest=digest({kind:'lookup',request:owned});
  // Idempotent replays return first; only new jobs need current budget admission.
  const existing=await journal.replay({tokenHash:hash,idemKey,requestDigest});if(existing)return {job:existing,replayed:true};
  await meter.admitJob('lookup');
  return journal.enqueue({tokenHash:hash,idemKey,kind:'lookup',requestDigest,request:owned,testFixture});
 }
 async function enqueueCollection({token,idemKey,request}={}){
  const hash=tokenHash(token);
  if(!request||typeof request!=='object'||JSON.stringify(Object.keys(request).sort())!=='["endMonth","lookupJobId","sourceRecordKey","startMonth"]'||typeof request.lookupJobId!=='string'||!uuid.test(request.lookupJobId)||typeof request.sourceRecordKey!=='string'||!/^lookup:[1-9]\d?$/.test(request.sourceRecordKey))throw failure('REQUEST_INVALID','Collection requires lookupJobId, sourceRecordKey, startMonth and endMonth');
  boundedScope('000000000',request.startMonth,request.endMonth);
  const owned={lookupJobId:request.lookupJobId.toLowerCase(),sourceRecordKey:request.sourceRecordKey,startMonth:request.startMonth,endMonth:request.endMonth},requestDigest=digest({kind:'collection',request:owned});
  const existing=await journal.replay({tokenHash:hash,idemKey,requestDigest});if(existing)return {job:existing,replayed:true};
  await meter.admitJob('collection');
  // Selection validation runs outside the enqueue transaction; enqueue re-checks
  // ownership, age and lookup identity atomically, and C0 revalidates under lease.
  const lookupJob=await journal.job({tokenHash:hash,jobId:owned.lookupJobId});
  if(lookupJob.kind!=='lookup'||lookupJob.state!=='succeeded'||!lookupJob.result)throw failure('LOOKUP_UNAVAILABLE','An owned succeeded lookup under 24 hours old is required');
  const reader=await createVerifiedEvidenceReader({journal,store:metered,jobId:owned.lookupJobId});
  const selection=await validateSelectionEvidence(reader.read,{lookupId:lookupJob.result.lookupId,sourceRecordKey:owned.sourceRecordKey});
  if(selection.testFixture!==testFixture)throw failure('SOURCE_PROVENANCE_CONFLICT','Lookup classification and collection mode disagree');
  boundedScope(selection.row.uic_number,owned.startMonth,owned.endMonth);
  return journal.enqueue({tokenHash:hash,idemKey,kind:'collection',requestDigest,request:owned,testFixture,lookup:{jobId:owned.lookupJobId,lookupId:selection.lookupId,lookupSha256:selection.lookupSha256}});
 }
 async function enqueueReplay({token,idemKey,request}={}){
  if(!preserved)throw failure('REPLAY_UNAVAILABLE','Preserved public replay is not enabled');
  const hash=tokenHash(token);
  if(!request||typeof request!=='object'||JSON.stringify(Object.keys(request))!=='["artifactId"]'||!preserved.artifactIds.includes(request.artifactId))throw failure('REQUEST_INVALID','Replay requires one preserved public version identifier');
  const owned={artifactId:request.artifactId},requestDigest=digest({kind:'replay',request:owned});
  const existing=await journal.replay({tokenHash:hash,idemKey,requestDigest});if(existing)return {job:existing,replayed:true};
  await meter.admitJob('replay');
  return journal.enqueue({tokenHash:hash,idemKey,kind:'replay',requestDigest,request:owned,testFixture:false});
 }
 return Object.freeze({testFixture,replayEnabled:preserved!==null,
  async issueSession(){const token=randomBytes(32).toString('base64url');return {token,...await journal.issueToken({tokenHash:sha256(token)})};},
  enqueueLookup,enqueueCollection,enqueueReplay,advance,
  async job({token,jobId}={}){return journal.job({tokenHash:tokenHash(token),jobId});},
  async history({token}={}){return journal.history({tokenHash:tokenHash(token)});},
  async run({token,jobId,runId}={}){return journal.run({tokenHash:tokenHash(token),jobId,runId});},
  // The full archive is reserved as a download before any read; every call is charged.
  async archive({token,jobId}={}){const hash=tokenHash(token),publication=await journal.publication({tokenHash:hash,jobId});await meter.reserveEgress({kind:'download',tokenHash:hash,jobId,bytes:publication.archive.bytes+GUEST_BUDGETS.requestOverheadBytes});return {artifactId:publication.artifactId,bytes:await readPublishedArchive({store,publication})};}
 });
}
