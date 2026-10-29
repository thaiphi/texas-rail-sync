import {readFile,writeFile,mkdir,readdir,rename,rm,open,realpath} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {loadSnapshot,pinnedArtifactId} from './artifact.mjs';
import {sha256} from './normalize.mjs';
import {runExport,exportRecorder} from './exportCore.mjs';
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
 let scope=providedSnapshot?.scope??null;
 if(!recorder&&!providedSnapshot)try{bounded(sourceDir);scope=JSON.parse(await readFile(resolve(sourceDir,'acquisition.json'))).scope??null;}catch{}
 const sourceDirectory=relative(repositoryRoot,resolve(sourceDir)).replaceAll('\\','/');
 const checkSource=async()=>{bounded(sourceDir);await realBounded(sourceDir);};
 return runExport({run:recorder??exportRecorder({mode,scope,testFixture}),artifactId,expectedManifestSha256,testFixture,providedSnapshot,
  sourceEvidence:{sourceDirectory},inputPath:name=>`${sourceDirectory}/${name}`,
  load:async()=>{await checkSource();return loadSnapshot(sourceDir);},checkSource,checkOutput:()=>{bounded(outputRoot);},
  readPublished:(id,name)=>readFile(resolve(outputRoot,id,name)),publish:(files,id)=>publish(files,id,outputRoot),
  outputPath:(id,name)=>relative(repositoryRoot,resolve(outputRoot,id,name)).replaceAll('\\','/'),
  saveRecord:record?run=>saveRun(run,runRoot):null});
}
