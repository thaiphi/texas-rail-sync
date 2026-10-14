import {randomUUID} from 'node:crypto';
import {collectionStages,safeError,workflowView} from '../public/workflow.js';
const modes=['offline_replay','offline_export','live_collection'];
const canonicalTime=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const recordKeys=JSON.stringify(['dataSchemaVersion','endedAt','events','mode','pipelineVersion','provenance','runId','schemaVersion','startedAt','status','testFixture','transformationVersion']);
// Default time is the existing wall clock. An optional trusted clock (for example
// a caller-owned database stamp supplied synchronously) must return canonical UTC ISO.
function timeSource(clock){
 if(clock===undefined)return ()=>new Date().toISOString();
 if(typeof clock!=='function')throw Error('Recorder clock must be a function');
 return ()=>{const value=clock();if(typeof value!=='string'||!canonicalTime.test(value)||new Date(value).toISOString()!==value)throw Error('Recorder clock must return a canonical UTC ISO timestamp');return value;};
}
// Recorder owns its copies; callers cannot mutate previous evidence or events.
function recorderFor(record,now){
 const snapshot=()=>structuredClone(record);
 function add(next,stage,status,evidence=null,error=null){
  next.events.push({runId:record.runId,stage,stageId:`${record.runId}:${stage}`,eventId:`${record.runId}:${next.events.length+1}`,timestamp:now(),status,evidence:structuredClone(evidence),...(error?{error:safeError(error)}:{})});
 }
 function change(stage,status,evidence=null,error=null){
  if(record.endedAt)throw Error('Run already finished; invalid transition');
  const next=snapshot();add(next,stage,status,evidence,error);
  next.status=status==='failed'?'failed':status==='succeeded'&&stage===collectionStages.at(-1).id?'succeeded':'running';
  if(status==='failed')for(const downstream of collectionStages.slice(collectionStages.findIndex(s=>s.id===stage)+1))add(next,downstream.id,'skipped',{reason:'upstream_failed',failedStage:stage});
  if(['failed','succeeded'].includes(next.status))next.endedAt=next.events.at(-1).timestamp;
  // Commit atomically only after the complete proposed event batch validates.
  workflowView(next);Object.assign(record,next);
 }
 function classifySource(provenance){
  if(record.endedAt||record.events.some(e=>e.stage!=='load'))throw Error('Source classification must precede normalization');
  if(!['public_reported','test_fixture','unknown'].includes(provenance?.classification)||typeof provenance.basis!=='string'||(record.testFixture&&provenance.classification!=='test_fixture'))throw Error('Invalid source provenance');
  record.provenance=structuredClone(provenance);record.testFixture=provenance.classification==='test_fixture';
 }
 return Object.freeze({snapshot,classifySource,start:stage=>change(stage,'running'),succeed:(stage,evidence)=>change(stage,'succeeded',evidence),fail:(stage,error,evidence=null)=>change(stage,'failed',evidence,error)});
}
export function createRunRecorder({mode,pipelineVersion,schemaVersion,transformationVersion,testFixture=false,clock}){
 if(!modes.includes(mode)||!pipelineVersion||schemaVersion!==1||!transformationVersion||typeof testFixture!=='boolean')throw Error('Invalid recorder metadata');
 const now=timeSource(clock);
 const record={schemaVersion:1,runId:randomUUID(),mode,testFixture,provenance:{classification:testFixture?'test_fixture':'unknown',basis:testFixture?'explicit_test_fixture':'source_classification_unavailable'},pipelineVersion,dataSchemaVersion:schemaVersion,transformationVersion,startedAt:now(),endedAt:null,status:'pending',events:[]};
 return recorderFor(record,now);
}
// Resumes a trusted, owned journal record (never an HTTP payload). Run metadata
// only: a resumed record never grants a loaded-snapshot brand. Terminal records
// resume read-only because every transition refuses an ended run.
export function resumeRunRecorder(record,{clock}={}){
 const now=timeSource(clock),owned=structuredClone(record);
 if(!owned||typeof owned!=='object'||Array.isArray(owned)||JSON.stringify(Object.keys(owned).sort())!==recordKeys)throw Error('Invalid resumable run record');
 if(!modes.includes(owned.mode)||typeof owned.runId!=='string'||!/^[a-f0-9-]{36}$/i.test(owned.runId)||typeof owned.pipelineVersion!=='string'||!owned.pipelineVersion||typeof owned.transformationVersion!=='string'||!owned.transformationVersion||!owned.provenance||typeof owned.provenance!=='object'||Array.isArray(owned.provenance))throw Error('Invalid resumable run metadata');
 workflowView(owned);
 return recorderFor(owned,now);
}

