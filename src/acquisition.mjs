import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {repositoryRoot,exportArtifact,saveRun} from './pipeline.mjs';
import {loadSnapshot} from './artifact.mjs';
import {fetchSourceWithThrottleRetry} from './sourceFetch.mjs';
import {createRunRecorder} from './runEvents.mjs';
import {acquisitionTargets,targetsForScope,collectionScope,isBounded,versionLabels} from './sources.mjs';
import {sourceCount} from './exportCore.mjs';
export {acquisitionTargets} from './sources.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
export async function collectPublicSnapshot({sourceDir,artifactId,outputRoot=resolve(repositoryRoot,'artifacts'),runRoot=resolve(repositoryRoot,'runs'),fetchImpl=fetch,testFixture=false,scope=collectionScope,selection=null,appToken=null,wait=undefined}={}){
 if(fetchImpl!==fetch&&!testFixture)throw Error('Injected network responses require explicit test-fixture mode');
 // v2 and v3 share the bounded acquisition marker (schemaVersion 2); labels follow the query version.
 const dynamic=isBounded(scope);
 const recorder=createRunRecorder({mode:'live_collection',...versionLabels(dynamic?scope:null),schemaVersion:1,testFixture});
 const evidence={requests:[],outputs:[]};let created=false,result,targets=acquisitionTargets;
 try{
  recorder.start('load');
  if(dynamic&&selection?.testFixture===true)recorder.classifySource({classification:'test_fixture',basis:'recorded_test_fixture_selection'});
  targets=targetsForScope(scope);
  if(dynamic&&(!selection?.files||selection.testFixture!==testFixture))throw failure('SOURCE_PROVENANCE_CONFLICT','Selected lookup evidence and collection classification disagree');
  if(!sourceDir||!artifactId||!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(artifactId))throw failure('SOURCE_INVALID','Supply a new source directory and artifact identifier');
  sourceDir=resolve(sourceDir);const part=relative(repositoryRoot,sourceDir);
  if(!part||part==='..'||part.startsWith('..'+sep)||isAbsolute(part))throw failure('SOURCE_INVALID','Source directory must be new and inside this repository');
  const parent=await realpath(resolve(sourceDir,'..')),parentPart=relative(repositoryRoot,parent);
  if(parentPart==='..'||parentPart.startsWith('..'+sep)||isAbsolute(parentPart))throw failure('SOURCE_INVALID','Source directory resolves outside this repository');
  try{await mkdir(sourceDir);created=true;}catch(error){if(error.code==='EEXIST')throw failure('SOURCE_EXISTS','Source directory already exists');throw error;}
  const marker=status=>writeFile(resolve(sourceDir,'acquisition.json'),JSON.stringify({schemaVersion:dynamic?2:1,runId:recorder.snapshot().runId,mode:'live_collection',testFixture,status,targets:targets.map(t=>t.url),...(dynamic?{scope}:{})},null,2)+'\n');
  await marker('running');
  if(dynamic){
   for(const name of ['lookup.json','lookup-metadata.json','lookup-metadata.source.json','lookup-inventory.json','lookup-inventory.source.json']){if(!selection.files[name])throw failure('SOURCE_INVALID','Selection source evidence missing');await writeFile(resolve(sourceDir,name),selection.files[name],{flag:'wx'});}
   const {lookupId,sourceRecordKey,ordinal,lookupSha256}=selection;
   await writeFile(resolve(sourceDir,'selection.json'),JSON.stringify({lookupId,sourceRecordKey,ordinal,lookupSha256},null,2)+'\n',{flag:'wx'});
  }
  for(const target of targets){
   const request={url:target.url,name:target.name,status:'running'};evidence.requests.push(request);
   try{
   const {body,metadata}=await fetchSourceWithThrottleRetry(target,{fetchImpl,testFixture,appToken,wait,onResponse:status=>{request.httpStatus=status;}});
   await writeFile(resolve(sourceDir,target.name),body,{flag:'wx'});
   const metadataName=target.name.replace(/\.[^.]+$/,'')+'.source.json';
   await writeFile(resolve(sourceDir,metadataName),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
   request.status='succeeded';evidence.outputs.push({path:relative(repositoryRoot,resolve(sourceDir,target.name)).replaceAll('\\','/'),url:target.url,sha256:metadata.sha256,bytes:body.length,count:null});
   }catch(error){request.status='failed';throw error;}
  }
  await marker('succeeded');const snapshot=await loadSnapshot(sourceDir);
  recorder.classifySource(snapshot.provenance);
  recorder.succeed('load',{...evidence,provenance:snapshot.provenance,inputs:snapshot.sources.map(s=>({...s,count:sourceCount(snapshot,s)}))});
  result=await exportArtifact({sourceDir,artifactId,outputRoot,mode:'live_collection',testFixture,record:false,recorder,snapshot});
 }catch(error){
  if(error.provenance&&!recorder.snapshot().endedAt)recorder.classifySource(error.provenance);
  if(!recorder.snapshot().endedAt)recorder.fail('load',error,evidence);
  if(created&&recorder.snapshot().events.find(e=>e.stage==='load'&&e.status==='failed'))await writeFile(resolve(sourceDir,'acquisition.json'),JSON.stringify({schemaVersion:dynamic?2:1,runId:recorder.snapshot().runId,mode:'live_collection',testFixture,status:'failed',targets:targets.map(target=>target.url),...(dynamic?{scope}:{})},null,2)+'\n');
  error.record=recorder.snapshot();if(!error.record.testFixture)await saveRun(error.record,runRoot);throw error;
 }
 if(!result.record.testFixture)try{await saveRun(result.record,runRoot);}catch(error){error.record=result.record;throw error;}
 return result;
}
