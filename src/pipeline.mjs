import {readFile,writeFile,mkdir,readdir,rename,rm,open,realpath} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadSnapshot,buildArtifact,pinnedArtifactId,snapshotProvenance} from './artifact.mjs';
import {normalize,sha256} from './normalize.mjs';
import {createRunRecorder} from './runEvents.mjs';
import {collectionScope} from './sources.mjs';
import {workflowView} from '../public/workflow.js';
export const repositoryRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
function bounded(path){const target=resolve(path),part=relative(repositoryRoot,target);if(part==='..'||part.startsWith('..'+sep)||isAbsolute(part))throw Error('Path must remain inside texas-rrc-explorer');return target;}
async function realBounded(path){bounded(path);bounded(await realpath(path));}
const failure=(code,message)=>Object.assign(Error(message),{code});
export async function saveRun(record,runRoot=resolve(repositoryRoot,'runs')){
 if(record.testFixture||record.provenance?.classification==='test_fixture')throw Error('Test fixture cannot enter actual run history');workflowView(record);
 if(record.status==='succeeded'&&record.provenance?.classification!=='public_reported')throw Error('Unknown source provenance cannot enter successful actual run history');
 if(!/^[a-f0-9-]{36}$/i.test(record.runId))throw Error('Invalid run identifier');
 bounded(runRoot);await mkdir(runRoot,{recursive:true});await realBounded(runRoot);
 const dir=resolve(runRoot,record.runId);await mkdir(dir);await writeFile(resolve(dir,'record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
 return `runs/${record.runId}/record.json`;
}
async function publish(files,artifactId,outputRoot){
 bounded(outputRoot);await mkdir(outputRoot,{recursive:true});await realBounded(outputRoot);
 const target=resolve(outputRoot,artifactId),lockPath=resolve(outputRoot,`.${artifactId}.lock`);
 const lock=await open(lockPath,'wx');let staging;
 try{
  let exists=false;try{await readdir(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(exists){
   await realBounded(target);
   const actual=[];async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink())throw failure('VERSION_CONFLICT','Existing artifact version contains links');const key=prefix+entry.name;if(entry.isDirectory())await walk(resolve(dir,entry.name),key+'/');else actual.push(key);}}
   await walk(target);
   if(actual.length!==Object.keys(files).length)throw failure('VERSION_CONFLICT','Existing artifact version conflicts or is incomplete');
   for(const [name,body] of Object.entries(files))if(!Buffer.from(body).equals(await readFile(resolve(target,name))))throw failure('VERSION_CONFLICT','Existing artifact version conflicts; choose a new artifact ID');
   return 'verified_existing_bytes';
  }
  staging=resolve(outputRoot,`.publish-${randomUUID()}`);await mkdir(staging);
  for(const [name,body] of Object.entries(files)){const path=resolve(staging,name);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,body,{flag:'wx'});if(sha256(await readFile(path))!==sha256(body))throw failure('EXPORT_MISMATCH','Staged bytes failed verification');}
  await rename(staging,target);staging=null;return 'published_new_version';
 }finally{await lock.close();await rm(lockPath,{force:true});if(staging){bounded(staging);await rm(staging,{recursive:true,force:true});}}
}
export async function exportArtifact({sourceDir=resolve(repositoryRoot,'raw'),artifactId=pinnedArtifactId,outputRoot=resolve(repositoryRoot,'artifacts'),mode='offline_replay',expectedManifestSha256=null,testFixture=false,record=true,runRoot=resolve(repositoryRoot,'runs'),recorder=null,snapshot:providedSnapshot=null}={}){
 let versioned=providedSnapshot?.scope?.queryVersion===2;
 if(!recorder&&!providedSnapshot)try{bounded(sourceDir);versioned=JSON.parse(await readFile(resolve(sourceDir,'acquisition.json'))).scope?.queryVersion===2;}catch{}
 const run=recorder??createRunRecorder({mode,pipelineVersion:versioned?'rrc-collection-v2':'rrc-collection-v1',schemaVersion:1,transformationVersion:versioned?'rrc-odp-v2.0.0':'rrc-odp-v1.0.0',testFixture});
 let result,stage='load',evidence={artifactId,sourceDirectory:relative(repositoryRoot,resolve(sourceDir)).replaceAll('\\','/')};
 try{
  if(!providedSnapshot||!run.snapshot().events.length)run.start(stage);
  let snapshot=providedSnapshot;
  if(!snapshot){bounded(sourceDir);await realBounded(sourceDir);snapshot=await loadSnapshot(sourceDir);}
  // The caller may restrict a replay to fixture mode, but false/default must
  // never override source evidence that already identifies fixture responses.
  if(testFixture)snapshot={...snapshot,testFixture:true,provenance:{classification:'test_fixture',basis:'explicit_test_fixture'}};
  const provenance=snapshotProvenance(snapshot);
  run.classifySource(provenance);
  evidence={...evidence,provenance};
  if(provenance.classification==='unknown')throw failure('SOURCE_PROVENANCE_UNVERIFIED','Source provenance is unavailable');
  if(snapshot.provenance?.classification!==provenance.classification)throw failure('SOURCE_PROVENANCE_CONFLICT','Snapshot classification contradicts loaded source evidence');
  bounded(sourceDir);await realBounded(sourceDir);
  if(!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(artifactId)||artifactId==='..')throw failure('SOURCE_INVALID','Invalid artifact identifier');
  bounded(outputRoot);
  if(expectedManifestSha256!==null){
   if(typeof expectedManifestSha256!=='string'||!/^[a-f0-9]{64}$/i.test(expectedManifestSha256))throw failure('SOURCE_INVALID','Invalid requested manifest hash');
   const bytes=await readFile(resolve(outputRoot,artifactId,'manifest.json'));
   evidence={...evidence,expectedManifestSha256:expectedManifestSha256.toLowerCase(),actualManifestSha256:sha256(bytes)};
   if(evidence.expectedManifestSha256!==evidence.actualManifestSha256)throw failure('MANIFEST_PIN_MISMATCH','Requested manifest pin mismatch');
  }
  if(run.snapshot().events.filter(event=>event.stage==='load').at(-1)?.status==='running')run.succeed(stage,{...evidence,inputs:snapshot.sources.map(s=>({...s,path:`${evidence.sourceDirectory}/${s.raw_file.slice(8)}`,count:s.kind==='inventory'?snapshot.inventory.length:s.kind==='monthly'?snapshot.monthly.length:null}))});
  stage='normalize-qc';evidence={provenance:snapshot.provenance,inputs:snapshot.sources.filter(s=>['inventory','monthly'].includes(s.kind)).map(s=>({snapshotId:s.snapshot_id,url:s.url,sha256:s.sha256}))};run.start(stage);
  const normalized=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope??collectionScope);
  evidence={...evidence,counts:normalized.quality};
  if(Object.keys(normalized.quality.issue_counts).some(flag=>flag.startsWith('source_scope:')))throw failure('SOURCE_SCOPE_MISMATCH','Source rows contradict the fixed collection query');
  run.succeed(stage,{...evidence,counts:normalized.quality,outputs:[{name:'normalized inventory',count:normalized.inventory.length,sha256:sha256(JSON.stringify(normalized.inventory))},{name:'normalized monthly',count:normalized.monthly.length,sha256:sha256(JSON.stringify(normalized.monthly))}]});
  stage='export';evidence={artifactId,provenance:snapshot.provenance,counts:normalized.quality};run.start(stage);
  const built=await buildArtifact(snapshot,artifactId,normalized);
  if(snapshot.scope?.queryVersion===2){
   built.files['version-pins.json']=JSON.stringify({schemaVersion:1,artifactId,path:`/artifacts/${artifactId}/`,manifestSha256:sha256(built.files['manifest.json']),normalizedSha256:sha256(built.files['normalized.json']),classification:snapshot.provenance.classification,realHistoryStatus:built.manifest.real_history_status},null,2)+'\n';
  }
  const operation=await publish(built.files,artifactId,outputRoot);
  const outputs=Object.entries(built.files).map(([name,body])=>({path:relative(repositoryRoot,resolve(outputRoot,artifactId,name)).replaceAll('\\','/'),sha256:sha256(body),bytes:Buffer.byteLength(body),count:name==='inventory.csv'?normalized.inventory.length:name==='injection_monthly.csv'?normalized.monthly.length:null}));
  run.succeed(stage,{...evidence,operation,inputs:snapshot.sources.map(s=>({snapshotId:s.snapshot_id,url:s.url,sha256:s.sha256})),outputs,realHistoryStatus:built.manifest.real_history_status});
  result={...built,operation,record:run.snapshot()};
 }catch(error){
  if(stage==='load'&&error.provenance&&!run.snapshot().endedAt){run.classifySource(error.provenance);evidence={...evidence,provenance:error.provenance};}
  // Collections may hand off an already successful acquisition stage. Replay
  // validation failures must retain it, rather than attempt to fail it twice.
  if(stage==='load'&&run.snapshot().events.filter(event=>event.stage==='load').at(-1)?.status==='succeeded'){stage='normalize-qc';run.start(stage);}
  if(!run.snapshot().endedAt)run.fail(stage,error,evidence);
  error.record=run.snapshot();if(record&&!error.record.testFixture)await saveRun(error.record,runRoot);throw error;
 }
 if(record&&!result.record.testFixture)try{await saveRun(result.record,runRoot);}catch(error){error.record=result.record;throw error;}
 return result;
}
