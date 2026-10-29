import {assertQualityReport,sameQualityReport} from './quality-validation.js';
// Fixed executable stages shared with the Node recorder. This module performs no I/O.
export const collectionStages=Object.freeze([
 Object.freeze({id:'load',label:'Source loading / raw preservation'}),
 Object.freeze({id:'normalize-qc',label:'Normalize / link parents / account for quality'}),
 Object.freeze({id:'export',label:'Versioned export'})
]);
const assertSuccessfulQuality=quality=>{
 assertQualityReport(quality);
 if(Object.entries(quality.issue_counts).some(([flag,value])=>flag.startsWith('source_scope:')&&value>0))throw Error('Invalid successful source scope evidence');
};
const errorMessages={SOURCE_SCOPE_MISMATCH:'Monthly rows fall outside the fixed selected UIC query; export was not verified.',HTTP_ERROR:'Official source request failed; inspect the recorded URL and HTTP status.',SOURCE_THROTTLED:'Official source throttled the request (HTTP 429); try again later.',SOURCE_LIMIT:'Official source exceeded the bounded byte limit.',SOURCE_EXISTS:'Source directory already exists; use a new snapshot directory.',VERSION_CONFLICT:'Artifact version conflicts or is incomplete; use a new artifact ID.',SOURCE_INVALID:'Source input is invalid or acquisition is incomplete.',MANIFEST_PIN_MISMATCH:'Preserved manifest does not match the requested SHA256 pin.',SOURCE_HASH_MISMATCH:'Preserved source bytes do not match manifest evidence.',EXPORT_MISMATCH:'Replayed export differs from the preserved artifact.',STAGE_FAILED:'Stage execution failed; no success is claimed.'};
export function safeError(error){
 if(error?.code==='QUALITY_INVALID')return {code:error.code,message:'Recorded quality counts or dispositions are invalid; validation was not verified.'};
 if(error?.code==='SOURCE_SCOPE_MISMATCH')return {code:error.code,message:'Source rows contradict the declared collection bounds; quarantined reasons are retained and export was refused.'};
 if(error?.code==='SOURCE_PROVENANCE_UNVERIFIED')return {code:error.code,message:'Source classification is unavailable; public export was refused.'};
 if(error?.code==='SOURCE_PROVENANCE_CONFLICT')return {code:error.code,message:'Acquisition and source classifications disagree; export was refused.'};
 if(error?.code==='SOURCE_ROW_LIMIT')return {code:'SOURCE_ROW_LIMIT',message:'Monthly response reached its query cap; completeness requires a reviewed acquisition.'};
 const code=Object.hasOwn(errorMessages,error?.code)?error.code:'STAGE_FAILED';
 return {code,message:errorMessages[code]};
}
export function workflowView(record,artifact=null){
 if(!record)return {runId:null,label:'Historical artifact — execution unrecorded',status:'unrecorded',artifact:structuredClone(artifact),events:[],stages:collectionStages.map(s=>({...s,status:'unrecorded',evidence:null,error:null})),consumer:{label:'External Analytics consumer',status:'unrecorded'}};
 if(record.schemaVersion!==1||!record.runId||!['offline_replay','offline_export','live_collection'].includes(record.mode)||typeof record.testFixture!=='boolean'||!record.pipelineVersion||!record.transformationVersion||record.dataSchemaVersion!==1||!Array.isArray(record.events))throw Error('Invalid run record');
 if(record.provenance&&(!['public_reported','test_fixture','unknown'].includes(record.provenance.classification)||typeof record.provenance.basis!=='string'||record.testFixture!==(record.provenance.classification==='test_fixture')||(record.status==='succeeded'&&record.provenance.classification==='unknown')))throw Error('Invalid run provenance');
 const states=collectionStages.map(()=> 'pending'),latest=new Map(),ids=new Set();
 let failed=false,lastTime=Date.parse(record.startedAt);
 if(!Number.isFinite(lastTime))throw Error('Invalid invocation time');
 for(const [index,event] of record.events.entries()){
  if(event.evidence?.provenance&&record.provenance&&event.evidence.provenance.classification!==record.provenance.classification)throw Error('Invalid event provenance');
  const stage=collectionStages.findIndex(s=>s.id===event.stage);
  const time=Date.parse(event.timestamp);
  if(stage<0||event.runId!==record.runId||event.stageId!==`${record.runId}:${event.stage}`||event.eventId!==`${record.runId}:${index+1}`||ids.has(event.eventId)||!Number.isFinite(time)||time<lastTime)throw Error('Invalid event identity or chronology');
  const previous=states[stage],status=event.status;
  const ordered=states.slice(0,stage).every(s=>s==='succeeded');
  if(status==='running'&&previous==='pending'&&ordered&&!failed){}
  else if(['succeeded','failed'].includes(status)&&previous==='running'&&!failed){if(status==='failed'){failed=true;if(!event.error?.code)throw Error('Invalid failure evidence');}}
  else if(status==='skipped'&&previous==='pending'&&failed){}
  else throw Error('Invalid transition or stage order');
  if(status==='succeeded'){
   const evidence=event.evidence,hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value),count=value=>value===null||(Number.isSafeInteger(value)&&value>=0);
   if(!evidence||typeof evidence!=='object')throw Error('Invalid success evidence');
   if(event.stage==='load'&&(!Array.isArray(evidence.inputs)||!evidence.inputs.length||!evidence.inputs.every(s=>hash(s.sha256)&&typeof s.url==='string'&&count(s.count))))throw Error('Invalid source evidence');
   if(event.stage==='normalize-qc'){
    assertSuccessfulQuality(evidence.counts);
    for(const input of latest.get('load')?.evidence?.inputs??[]){const kind=['inventory','monthly'].includes(input.kind)?input.kind:input.name==='candidate-inventory'?'inventory':input.name==='candidate-monthly'?'monthly':null;if(kind&&input.count!==null&&input.count!==evidence.counts[kind].raw)throw Error('Invalid source/quality count reconciliation');}
    // Additive v3 (RRC-13) evidence: BHP/SRT counts reconcile on their own; absent in v1/v2 runs.
    const testInputs=(latest.get('load')?.evidence?.inputs??[]).filter(input=>input.kind==='bhp'||input.kind==='srt');
    if(evidence.testReports!==undefined||testInputs.length){
     const reports=evidence.testReports,valid=summary=>summary!==null&&typeof summary==='object'&&['raw','parsed','accepted','quarantined','excluded'].every(key=>Number.isSafeInteger(summary[key])&&summary[key]>=0)&&summary.raw===summary.parsed&&summary.parsed===summary.accepted+summary.quarantined+summary.excluded&&summary.excluded===0;
     if(!reports||typeof reports!=='object'||JSON.stringify(Object.keys(reports).sort())!=='["bhp","srt"]'||!valid(reports.bhp)||!valid(reports.srt))throw Error('Invalid test-report quality evidence');
     for(const input of testInputs)if(input.count!==null&&input.count!==reports[input.kind].raw)throw Error('Invalid test-report source/quality count reconciliation');
    }
    if(!Array.isArray(evidence.outputs)||evidence.outputs.length!==2)throw Error('Invalid normalization output evidence');
    const outputKinds=new Set();
    for(const output of evidence.outputs){const kind=output?.name==='normalized inventory'?'inventory':output?.name==='normalized monthly'?'monthly':null;if(!kind||outputKinds.has(kind)||!hash(output.sha256)||!Number.isSafeInteger(output.count)||output.count<0||output.count!==evidence.counts[kind].parsed)throw Error('Invalid normalization output/quality count or hash evidence');outputKinds.add(kind);}
   }
   if(event.stage==='export'){
    assertSuccessfulQuality(evidence.counts);const previous=latest.get('normalize-qc')?.evidence?.counts;if(previous&&!sameQualityReport(evidence.counts,previous))throw Error('Invalid export quality count reconciliation');
    const quality=evidence.counts;
    if(evidence.realHistoryStatus==='verified_bounded_linkage'&&(record.testFixture||!quality.monthly.parsed||quality.inventory.accepted!==quality.inventory.parsed||quality.monthly.accepted!==quality.monthly.parsed||quality.parent_join.matched!==quality.monthly.parsed))throw Error('Invalid verified public history quality evidence');
    for(const output of evidence.outputs??[]){const kind=output.path?.endsWith('inventory.csv')?'inventory':output.path?.endsWith('injection_monthly.csv')?'monthly':null;if(kind&&output.count!==evidence.counts[kind].parsed)throw Error('Invalid export output/quality count reconciliation');}
   }
   if(event.stage==='export'&&(!Array.isArray(evidence.outputs)||!evidence.outputs.length||!evidence.outputs.every(s=>typeof s.path==='string'&&hash(s.sha256)&&count(s.count))))throw Error('Invalid output evidence');
  }
  states[stage]=status;ids.add(event.eventId);latest.set(event.stage,event);lastTime=time;
 }
 const status=failed?'failed':states.every(s=>s==='succeeded')?'succeeded':record.events.length?'running':'pending';
 if(failed&&states.some(s=>s==='pending'||s==='running'))throw Error('Invalid incomplete downstream failure events');
 if(status!==record.status)throw Error('Invalid recorded run status');
 if(['succeeded','failed'].includes(status)&&(!record.endedAt||Date.parse(record.endedAt)<lastTime||!Number.isFinite(Date.parse(record.endedAt))))throw Error('Invalid run end time');
 return {runId:record.runId,label:record.testFixture?'Test fixture — '+(record.mode==='live_collection'?'collection':'offline replay'):record.mode==='live_collection'?'Official acquisition — recorded execution':record.mode==='offline_export'?'Offline export — preserved sources':'Offline replay — preserved sources',mode:record.mode,status,startedAt:record.startedAt,endedAt:record.endedAt,versions:{pipeline:record.pipelineVersion,schema:record.dataSchemaVersion,transformation:record.transformationVersion},artifact:structuredClone(artifact),events:structuredClone(record.events).map(e=>({...e,...(e.error?{error:safeError(e.error)}:{})})),stages:collectionStages.map((s,i)=>({...s,label:s.id==='load'?(record.mode==='live_collection'?'Official acquisition / raw preservation':'Offline source loading / raw verification'):s.label,status:states[i],stageId:`${record.runId}:${s.id}`,evidence:structuredClone(latest.get(s.id)?.evidence??null),error:latest.get(s.id)?.error?safeError(latest.get(s.id).error):null})),consumer:{label:'External Analytics consumer',status:'unrecorded'}};
}



