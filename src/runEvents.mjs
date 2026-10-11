import {randomUUID} from 'node:crypto';
import {collectionStages,safeError,workflowView} from '../public/workflow.js';
// Recorder owns its copies; callers cannot mutate previous evidence or events.
export function createRunRecorder({mode,pipelineVersion,schemaVersion,transformationVersion,testFixture=false}){
 if(!['offline_replay','offline_export','live_collection'].includes(mode)||!pipelineVersion||schemaVersion!==1||!transformationVersion||typeof testFixture!=='boolean')throw Error('Invalid recorder metadata');
 const now=()=>new Date().toISOString();
 const record={schemaVersion:1,runId:randomUUID(),mode,testFixture,provenance:{classification:testFixture?'test_fixture':'unknown',basis:testFixture?'explicit_test_fixture':'source_classification_unavailable'},pipelineVersion,dataSchemaVersion:schemaVersion,transformationVersion,startedAt:now(),endedAt:null,status:'pending',events:[]};
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

