// Shared export core: one stage/QC/build/pin/output implementation for the
// filesystem wrapper (pipeline.mjs) and trusted server readers. This module
// performs no filesystem or network I/O; all I/O arrives through callbacks.
import {Buffer} from 'node:buffer';
import {loadSnapshotFromReader,buildArtifact,snapshotProvenance} from './artifact.mjs';
import {normalize,sha256} from './normalize.mjs';
import {createRunRecorder} from './runEvents.mjs';
import {collectionScope,isBounded,isLocalOnly,versionLabels} from './sources.mjs';
import {normalizeTests} from './testReports.mjs';
import {normalizeSnapshotWellbore,wellboreScopeFailure} from './wellbore.mjs';
import {isDeepStrictEqual} from 'node:util';
import {workflowView} from '../public/workflow.js';
const failure=(code,message)=>Object.assign(Error(message),{code});
const publishOperations=new Set(['published_new_version','verified_existing_bytes']);
const copies=files=>Object.fromEntries(Object.entries(files).map(([name,body])=>[name,Buffer.from(body)]));
const sameJson=(left,right)=>isDeepStrictEqual(JSON.parse(JSON.stringify(left)),JSON.parse(JSON.stringify(right)));
const stageStates=record=>workflowView(record).stages.map(stage=>stage.status).join('/');
// Row counts for row-bearing sources; bhp/srt exist only in v3+ snapshots and the exact-API
// casing/plugging/wellbore_inventory responses only in v4 snapshots.
const wellboreKind={casing:'casing',plugging:'plugging',wellbore_inventory:'inventory'};
export const sourceCount=(snapshot,s)=>s.kind==='inventory'?snapshot.inventory.length:s.kind==='monthly'?snapshot.monthly.length:(s.kind==='bhp'||s.kind==='srt')&&snapshot.tests?snapshot.tests[s.kind].length:Object.hasOwn(wellboreKind,s.kind)&&Array.isArray(snapshot.wellbore?.[wellboreKind[s.kind]])?snapshot.wellbore[wellboreKind[s.kind]].length:null;
const loadInputs=(snapshot,inputPath)=>snapshot.sources.map(s=>({...s,path:inputPath(s.raw_file.slice(8)),count:sourceCount(snapshot,s)}));
const qcInputs=snapshot=>snapshot.sources.filter(s=>['inventory','monthly'].includes(s.kind)).map(s=>({snapshotId:s.snapshot_id,url:s.url,sha256:s.sha256}));
const qcOutputs=normalized=>[{name:'normalized inventory',count:normalized.inventory.length,sha256:sha256(JSON.stringify(normalized.inventory))},{name:'normalized monthly',count:normalized.monthly.length,sha256:sha256(JSON.stringify(normalized.monthly))}];
const scopeFailure=normalized=>{if(Object.keys(normalized.quality.issue_counts).some(flag=>flag.startsWith('source_scope:')))throw failure('SOURCE_SCOPE_MISMATCH','Source rows contradict the fixed collection query');};
// v3 test-report rows (RRC-13): ADR 002 exact-UIC scope; counts reconcile per dataset.
const testReportCounts=(snapshot,normalized)=>{
 if(!snapshot.tests)return null;
 const tests=normalizeTests(snapshot.tests,snapshot.sourceIds,normalized.inventory,snapshot.scope);
 if(Object.values(tests.quality.issue_counts).some(counts=>Object.keys(counts).some(flag=>flag.startsWith('source_scope:'))))throw failure('SOURCE_SCOPE_MISMATCH','Test-report rows contradict the exact-UIC query');
 return {bhp:tests.quality.bhp,srt:tests.quality.srt};
};
// v4 casing/plugging (RRC-14, ADR 004 §2): a predicate contradiction fails the run; counts reconcile per dataset.
const wellboreCounts=(snapshot,normalized)=>{
 if(!snapshot.wellbore)return null;
 const wellbore=normalizeSnapshotWellbore(snapshot,normalized.inventory);
 if(wellboreScopeFailure(wellbore))throw failure('SOURCE_SCOPE_MISMATCH','Wellbore rows contradict the exact-API query');
 return {casing:wellbore.casing.quality.counts,plugging:wellbore.plugging.quality.counts};
};
// D7: every local-only version class (query version 3 and up); the message text is unchanged.
const refuseTestReports=snapshot=>{if(isLocalOnly(snapshot?.scope))throw failure('SOURCE_INVALID','test-report versions are local-only (D7)');};
function checkReference(sourceReference){if(typeof sourceReference!=='string'||!/^[a-z0-9][a-z0-9._\/-]{0,255}$/i.test(sourceReference)||sourceReference.split('/').some(part=>!part||part==='.'||part==='..'))throw failure('SOURCE_INVALID','Invalid source reference');}
// Trusted internal acquisition evidence (never client input): every fetched source needs
// exactly one succeeded request and one output reference matching the loaded bytes.
function verifiedAcquisition(snapshot,supplied,inputPath){
 const owned=structuredClone(supplied),keys=(value,expected)=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===expected;
 if(!keys(owned,'["outputs","requests"]')||!Array.isArray(owned.requests)||!Array.isArray(owned.outputs))throw failure('SOURCE_INVALID','Acquisition evidence shape is invalid');
 const fetched=new Map(snapshot.sources.filter(s=>s.kind!=='selection').map(s=>[s.raw_file.slice(8),s])),requested=new Set(),referenced=new Set();
 for(const request of owned.requests){const source=fetched.get(request?.name);
  if(!keys(request,'["httpStatus","name","status","url"]')||!source||requested.has(request.name)||request.status!=='succeeded'||request.url!==source.url||request.httpStatus!==source.http_status)throw failure('SOURCE_PROVENANCE_CONFLICT','Acquisition request evidence contradicts loaded sources');
  requested.add(request.name);}
 if(requested.size!==fetched.size)throw failure('SOURCE_PROVENANCE_CONFLICT','Acquisition request evidence is incomplete');
 for(const output of owned.outputs){const name=[...fetched.keys()].find(key=>inputPath(key)===output?.path),source=fetched.get(name);
  if(!keys(output,'["bytes","count","path","sha256","url"]')||!source||referenced.has(name)||output.url!==source.url||output.sha256!==source.sha256||output.bytes!==source.bytes||output.count!==null)throw failure('SOURCE_HASH_MISMATCH','Acquisition output evidence contradicts loaded source bytes');
  referenced.add(name);}
 if(referenced.size!==fetched.size)throw failure('SOURCE_HASH_MISMATCH','Acquisition output evidence is incomplete');
 return {requests:owned.requests,outputs:owned.outputs};
}
// Returns the recorded acquisition scope (or null) so run labels follow its query version.
async function detectScope(readBytes){try{const bytes=await readBytes('acquisition.json');if(bytes instanceof Uint8Array)return JSON.parse(Buffer.from(bytes).toString('utf8')).scope??null;}catch{}return null;}
async function buildOutputs(snapshot,artifactId,normalized){
 const built=await buildArtifact(snapshot,artifactId,normalized);
 if(isBounded(snapshot.scope)){
  built.files['version-pins.json']=JSON.stringify({schemaVersion:1,artifactId,path:`/artifacts/${artifactId}/`,manifestSha256:sha256(built.files['manifest.json']),normalizedSha256:sha256(built.files['normalized.json']),classification:snapshot.provenance.classification,realHistoryStatus:built.manifest.real_history_status},null,2)+'\n';
 }
 // Core-owned expected bytes; publishers only ever receive separate copies and can
 // never alter the bytes, hashes or sizes that become stage evidence.
 return {built,expected:copies(built.files)};
}
async function commitOutputs({run,artifactId,snapshot,normalized,built,expected,evidence,publish,readPublished,outputPath}){
 const operation=await publish(copies(expected),artifactId);
 if(!publishOperations.has(operation))throw failure('EXPORT_MISMATCH','Publisher returned an unrecognized operation');
 for(const [name,body] of Object.entries(expected)){
  let actual;try{actual=await readPublished(artifactId,name);}catch{throw failure('EXPORT_MISMATCH','Published output readback is unavailable');}
  if(!(actual instanceof Uint8Array)||!body.equals(Buffer.from(actual)))throw failure('EXPORT_MISMATCH','Published output readback failed verification');
 }
 const outputs=Object.entries(expected).map(([name,body])=>({path:outputPath(artifactId,name),sha256:sha256(body),bytes:body.length,count:name==='inventory.csv'?normalized.inventory.length:name==='injection_monthly.csv'?normalized.monthly.length:null}));
 run.succeed('export',{...evidence,operation,inputs:snapshot.sources.map(s=>({snapshotId:s.snapshot_id,url:s.url,sha256:s.sha256})),outputs,realHistoryStatus:built.manifest.real_history_status});
 return {...built,operation,record:run.snapshot()};
}
// scope: the recorded collection scope (null for v1); labels come from versionLabels.
export function exportRecorder({mode,scope=null,testFixture}){
 return createRunRecorder({mode,...versionLabels(scope),schemaVersion:1,testFixture});
}
export async function runExport(options){return exportCore(options);}
async function exportCore({run,artifactId,expectedManifestSha256=null,testFixture=false,providedSnapshot=null,sourceEvidence,inputPath,load,checkSource=null,checkOutput=null,readPublished,publish,outputPath,saveRecord=null,acquisition=null},{prepareOnly=false,startLoad,localOnly=true}={}){
 let result,stage='load',evidence={artifactId,...sourceEvidence};
 try{
  if(startLoad??(!providedSnapshot||!run.snapshot().events.length))run.start(stage);
  let snapshot=providedSnapshot;
  if(!snapshot)snapshot=await load();
  if(!localOnly)refuseTestReports(snapshot);
  // The caller may restrict a replay to fixture mode, but false/default must
  // never override source evidence that already identifies fixture responses.
  if(testFixture)snapshot={...snapshot,testFixture:true,provenance:{classification:'test_fixture',basis:'explicit_test_fixture'}};
  const provenance=snapshotProvenance(snapshot);
  run.classifySource(provenance);
  evidence={...evidence,provenance};
  if(provenance.classification==='unknown')throw failure('SOURCE_PROVENANCE_UNVERIFIED','Source provenance is unavailable');
  if(snapshot.provenance?.classification!==provenance.classification)throw failure('SOURCE_PROVENANCE_CONFLICT','Snapshot classification contradicts loaded source evidence');
  await checkSource?.();
  if(!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(artifactId)||artifactId==='..')throw failure('SOURCE_INVALID','Invalid artifact identifier');
  await checkOutput?.();
  if(expectedManifestSha256!==null){
   if(typeof expectedManifestSha256!=='string'||!/^[a-f0-9]{64}$/i.test(expectedManifestSha256))throw failure('SOURCE_INVALID','Invalid requested manifest hash');
   const bytes=await readPublished(artifactId,'manifest.json');
   if(!(bytes instanceof Uint8Array))throw failure('SOURCE_INVALID','Published manifest is unavailable');
   evidence={...evidence,expectedManifestSha256:expectedManifestSha256.toLowerCase(),actualManifestSha256:sha256(bytes)};
   if(evidence.expectedManifestSha256!==evidence.actualManifestSha256)throw failure('MANIFEST_PIN_MISMATCH','Requested manifest pin mismatch');
  }
  if(run.snapshot().events.filter(event=>event.stage==='load').at(-1)?.status==='running')run.succeed(stage,{...evidence,...(acquisition?verifiedAcquisition(snapshot,acquisition,inputPath):{}),inputs:loadInputs(snapshot,inputPath)});
  stage='normalize-qc';evidence={provenance:snapshot.provenance,inputs:qcInputs(snapshot)};run.start(stage);
  const normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope??collectionScope);
  evidence={...evidence,counts:normalized.quality};
  scopeFailure(normalized);
  const testReports=testReportCounts(snapshot,normalized),wellbore=wellboreCounts(snapshot,normalized);
  run.succeed(stage,{...evidence,counts:normalized.quality,outputs:qcOutputs(normalized),...(testReports?{testReports}:{}),...(wellbore?{wellbore}:{})});
  stage='export';evidence={artifactId,provenance:snapshot.provenance,counts:normalized.quality};run.start(stage);
  const {built,expected}=await buildOutputs(snapshot,artifactId,normalized);
  // Prepared (C8) outputs are staged-unpublished: export stays running, nothing is saved.
  if(prepareOnly)return {...built,files:copies(expected),operation:null,prepared:true,record:run.snapshot()};
  result=await commitOutputs({run,artifactId,snapshot,normalized,built,expected,evidence,publish,readPublished,outputPath});
 }catch(error){
  if(stage==='load'&&error.provenance&&!run.snapshot().endedAt){run.classifySource(error.provenance);evidence={...evidence,provenance:error.provenance};}
  // Collections may hand off an already successful acquisition stage. Replay
  // validation failures must retain it, rather than attempt to fail it twice.
  if(stage==='load'&&run.snapshot().events.filter(event=>event.stage==='load').at(-1)?.status==='succeeded'){stage='normalize-qc';run.start(stage);}
  if(!run.snapshot().endedAt)run.fail(stage,error,evidence);
  error.record=run.snapshot();if(saveRecord&&!error.record.testFixture)await saveRecord(structuredClone(error.record));throw error;
 }
 if(saveRecord&&!result.record.testFixture)try{await saveRecord(structuredClone(result.record));}catch(error){error.record=result.record;throw error;}
 return result;
}
// Internal trusted-server entry; never exposed to HTTP. publisher.publish(files,id)
// must return a recognized operation; publisher.readPublished(id,name) must
// return the stored bytes. saveRecord is optional and must refuse fixtures.
export async function exportArtifactFromReader({readBytes,sourceReference,artifactId,mode='offline_replay',expectedManifestSha256=null,testFixture=false,recorder=null,snapshot:providedSnapshot=null,publisher,saveRecord=null}={}){
 if(typeof publisher?.publish!=='function'||typeof publisher?.readPublished!=='function')throw failure('SOURCE_INVALID','Trusted publisher required');
 checkReference(sourceReference);
 let scope=providedSnapshot?.scope??null;
 if(!recorder&&!providedSnapshot&&typeof readBytes==='function')scope=await detectScope(readBytes);
 return runExport({run:recorder??exportRecorder({mode,scope,testFixture}),artifactId,expectedManifestSha256,testFixture,providedSnapshot,sourceEvidence:{sourceReference},inputPath:name=>`${sourceReference}/${name}`,load:()=>loadSnapshotFromReader(readBytes),readPublished:(id,name)=>publisher.readPublished(id,name),publish:(files,id)=>publisher.publish(files,id),outputPath:(id,name)=>`artifacts/${id}/${name}`,saveRecord});
}
// C8, internal trusted server only: identical load/normalize/build/pins, stopping
// before publication. Returned files are staged-unpublished; no success is claimed.
export async function prepareArtifactFromReader({readBytes,sourceReference,artifactId,mode='offline_replay',testFixture=false,recorder=null,acquisitionEvidence=null}={}){
 checkReference(sourceReference);
 let startLoad=true,live=mode==='live_collection';
 if(recorder){const current=recorder.snapshot(),states=stageStates(current);live=current.mode==='live_collection';if(states==='running/pending/pending')startLoad=false;else if(states!=='pending/pending/pending')throw failure('RUN_STATE_INVALID','Prepare requires a fresh run or a running load stage');}
 // Required for every live collection (supplied recorder mode, else requested mode);
 // offline replays never receive invented requests. Checked before any read and
 // privately copied before any await.
 if(live!==(acquisitionEvidence!==null))throw failure('SOURCE_INVALID',live?'Live collection preparation requires its acquisition evidence':'Acquisition evidence is accepted only for a live collection');
 const acquisition=acquisitionEvidence===null?null:structuredClone(acquisitionEvidence);
 const never=async()=>{throw failure('EXPORT_MISMATCH','Prepare never publishes');};
 // D7: the guest path stays v2, so its recorder never takes local-only (v3+) labels; such a snapshot is refused after load.
 const detected=typeof readBytes==='function'?await detectScope(readBytes):null;
 const run=recorder??exportRecorder({mode,scope:isLocalOnly(detected)?null:detected,testFixture});
 return exportCore({run,artifactId,testFixture,sourceEvidence:{sourceReference},inputPath:name=>`${sourceReference}/${name}`,load:()=>loadSnapshotFromReader(readBytes),readPublished:never,publish:never,outputPath:(id,name)=>`artifacts/${id}/${name}`,acquisition},{prepareOnly:true,startLoad,localOnly:false});
}
// C9, internal trusted server/journal only; not a distributed transaction. The
// recorder must be resumed from an owned journal at succeeded/succeeded/running.
// Source bytes are re-read to recreate the private brand; no serialized brand or
// client-prepared file is trusted, and staged bytes are verified, never repaired.
export async function finalizeArtifactFromReader({readBytes,sourceReference,artifactId,testFixture=false,recorder,publisher,saveRecord=null}={}){
 if(typeof publisher?.readStaged!=='function'||typeof publisher?.publish!=='function'||typeof publisher?.readPublished!=='function')throw failure('SOURCE_INVALID','Trusted staged publisher required');
 checkReference(sourceReference);
 if(typeof recorder?.snapshot!=='function'||typeof recorder?.succeed!=='function'||typeof recorder?.fail!=='function')throw failure('RUN_STATE_INVALID','Trusted resumed recorder required');
 const journal=recorder.snapshot();
 if(journal.endedAt||journal.status!=='running'||stageStates(journal)!=='succeeded/succeeded/running')throw failure('RUN_STATE_INVALID','Finalize requires succeeded load and normalize-qc with export running');
 const last=stage=>journal.events.filter(event=>event.stage===stage).at(-1).evidence;
 let result,evidence={artifactId,provenance:journal.provenance};
 try{
  let snapshot=await loadSnapshotFromReader(readBytes);
  refuseTestReports(snapshot);
  if(testFixture)snapshot={...snapshot,testFixture:true,provenance:{classification:'test_fixture',basis:'explicit_test_fixture'}};
  const provenance=snapshotProvenance(snapshot);
  if(provenance.classification==='unknown'||snapshot.provenance?.classification!==provenance.classification||!sameJson(provenance,journal.provenance))throw failure('SOURCE_PROVENANCE_CONFLICT','Replayed source provenance contradicts the run journal');
  const journalLoad=last('load'),inputPath=name=>`${sourceReference}/${name}`;
  const live=journal.mode==='live_collection';
  if(Object.hasOwn(journalLoad,'requests')!==live||Object.hasOwn(journalLoad,'outputs')!==live)throw failure('SOURCE_PROVENANCE_CONFLICT','Journal acquisition evidence contradicts the recorded run mode');
  const acquired=live?verifiedAcquisition(snapshot,{requests:journalLoad.requests,outputs:journalLoad.outputs},inputPath):{};
  if(!sameJson(journalLoad,{artifactId,sourceReference,provenance,...acquired,inputs:loadInputs(snapshot,inputPath)}))throw failure('SOURCE_HASH_MISMATCH','Replayed source inputs contradict the run journal');
  const normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope??collectionScope);
  scopeFailure(normalized);
  if(!sameJson(last('normalize-qc'),{provenance:snapshot.provenance,inputs:qcInputs(snapshot),counts:normalized.quality,outputs:qcOutputs(normalized)}))throw failure('QUALITY_INVALID','Replayed normalization contradicts journal quality evidence');
  evidence={artifactId,provenance:snapshot.provenance,counts:normalized.quality};
  const {built,expected}=await buildOutputs(snapshot,artifactId,normalized);
  for(const [name,body] of Object.entries(expected)){
   let staged;try{staged=await publisher.readStaged(artifactId,name);}catch{throw failure('EXPORT_MISMATCH','Staged output is unavailable');}
   if(!(staged instanceof Uint8Array)||!body.equals(Buffer.from(staged)))throw failure('EXPORT_MISMATCH','Staged output failed verification');
  }
  result=await commitOutputs({run:recorder,artifactId,snapshot,normalized,built,expected,evidence,publish:(files,id)=>publisher.publish(files,id),readPublished:(id,name)=>publisher.readPublished(id,name),outputPath:(id,name)=>`artifacts/${id}/${name}`});
 }catch(error){
  if(!recorder.snapshot().endedAt)recorder.fail('export',error,evidence);
  error.record=recorder.snapshot();if(saveRecord&&!error.record.testFixture)await saveRecord(structuredClone(error.record));throw error;
 }
 if(saveRecord&&!result.record.testFixture)try{await saveRecord(structuredClone(result.record));}catch(error){error.record=result.record;throw error;}
 return result;
}
