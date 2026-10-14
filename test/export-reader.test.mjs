import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile,readdir,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {exportArtifact} from '../src/pipeline.mjs';
import {exportArtifactFromReader} from '../src/exportCore.mjs';
import {workflowView} from '../public/workflow.js';
import {loadSnapshot} from '../src/artifact.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const readRaw=async name=>new Uint8Array(await readFile(resolve(root,'raw',name)));
function memoryPublisher({mutate=false,readChange=null,operation='published_new_version'}={}){
 const files=new Map();
 return {files,publish:async submitted=>{
  for(const [name,body] of Object.entries(submitted))files.set(name,Buffer.from(body));
  if(mutate)for(const body of Object.values(submitted))body.fill(32);
  return operation;
 },readPublished:async(_id,name)=>{
  if(!files.has(name))throw Object.assign(Error('Missing publication'),{code:'ENOENT'});
  const body=Buffer.from(files.get(name));return readChange?readChange(body,name):body;
 }};
}
const options=publisher=>({artifactId:'reader-fixture',readBytes:readRaw,sourceReference:'raw',testFixture:true,publisher});

test('shared filesystem and reader exports have identical bytes and stage evidence',async t=>{
 await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/export-reader-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const publisher=memoryPublisher();
 const local=await exportArtifact({sourceDir:resolve(root,'raw'),artifactId:'reader-fixture',outputRoot:resolve(dir,'artifacts'),testFixture:true,record:false});
 const remote=await exportArtifactFromReader(options(publisher));
 assert.deepEqual(Object.keys(local.files),Object.keys(remote.files));
 for(const [name,body] of Object.entries(local.files))assert.deepEqual(Buffer.from(body),Buffer.from(remote.files[name]),name);
 const canonical=record=>({mode:record.mode,status:record.status,testFixture:record.testFixture,provenance:record.provenance,pipelineVersion:record.pipelineVersion,transformationVersion:record.transformationVersion,events:record.events.map(event=>{
  const evidence=structuredClone(event.evidence);
  if(event.stage==='load'&&evidence){delete evidence.sourceDirectory;delete evidence.sourceReference;}
  if(event.stage==='export'&&evidence?.outputs)for(const output of evidence.outputs)output.path=output.path.slice(output.path.indexOf('artifacts/'));
  return {stage:event.stage,status:event.status,evidence,error:event.error};
 })});
 assert.deepEqual(canonical(local.record),canonical(remote.record));
 assert.deepEqual(workflowView(remote.record).stages.map(stage=>stage.status),['succeeded','succeeded','succeeded']);
});

test('reader export reproduces every preserved v2 file including publication pins',async()=>{
 const versions=await readdir(resolve(root,'artifacts'));
 for(const id of versions.filter(name=>name.startsWith('rrc-2026-10-10-'))){
  const publisher=memoryPublisher();
  const result=await exportArtifactFromReader({artifactId:id,sourceReference:'preserved/sources',readBytes:async name=>new Uint8Array(await readFile(resolve(root,'artifacts',id,'sources',name))),publisher});
  for(const [name,body] of Object.entries(result.files))assert.deepEqual(Buffer.from(body),await readFile(resolve(root,'artifacts',id,name)),`${id}/${name}`);
  assert.equal(result.record.pipelineVersion,'rrc-collection-v2');
  assert.equal(result.record.provenance.classification,'public_reported');
 }
});

test('publisher receives isolated copies while readback verifies canonical outputs',async()=>{
 const publisher=memoryPublisher({mutate:true});const result=await exportArtifactFromReader(options(publisher));
 for(const [name,body] of Object.entries(result.files))assert.deepEqual(Buffer.from(body),publisher.files.get(name));
 assert.equal(result.record.status,'succeeded');
});

test('missing, corrupted and invalid publisher outcomes fail the export stage',async()=>{
 const faults=[{operation:'accepted_without_verification'},{readChange:(_body,name)=>{if(name==='manifest.json')throw Error('Missing');return _body;}},{readChange:(body,name)=>name==='manifest.json'?Buffer.concat([body,Buffer.from('x')]):body}];
 for(const fault of faults)await assert.rejects(exportArtifactFromReader(options(memoryPublisher(fault))),error=>{
  assert.equal(error.code,'EXPORT_MISMATCH');
  assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;
 });
});

test('pin failures and fixture saving retain their existing dispositions',async()=>{
 const publisher=memoryPublisher();
 publisher.readPublished=async()=>new Uint8Array(await readFile(resolve(root,'artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json')));
 await assert.rejects(exportArtifactFromReader({...options(publisher),expectedManifestSha256:'0'.repeat(64)}),error=>{
  assert.equal(error.code,'MANIFEST_PIN_MISMATCH');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['failed','skipped','skipped']);return true;
 });
 let saves=0;await exportArtifactFromReader({...options(memoryPublisher()),saveRecord:async()=>{saves++;}});assert.equal(saves,0);
});

test('invalid logical source references never reach a publisher',async()=>{
 for(const sourceReference of ['raw/../secrets','raw//sources','/raw','raw/.'])await assert.rejects(exportArtifactFromReader({...options(memoryPublisher()),sourceReference}),error=>error.code==='SOURCE_INVALID');
});

test('forged snapshots and source escapes fail load, while publisher exceptions fail export',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw'));
 const forged={...snapshot,read:async()=>new Uint8Array()};
 await assert.rejects(exportArtifactFromReader({artifactId:'reader-public',sourceReference:'raw',snapshot:forged,publisher:memoryPublisher()}),error=>{
  assert.equal(error.code,'SOURCE_PROVENANCE_UNVERIFIED');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['failed','skipped','skipped']);return true;
 });
 await assert.rejects(exportArtifact({sourceDir:resolve(root,'..'),record:false}),error=>{
  assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['failed','skipped','skipped']);return true;
 });
 const publisher=memoryPublisher();publisher.publish=async()=>{throw Object.assign(Error('Publisher interrupted'),{code:'STORAGE_UNAVAILABLE'});};
 await assert.rejects(exportArtifactFromReader(options(publisher)),error=>{
  assert.equal(error.code,'STORAGE_UNAVAILABLE');assert.deepEqual(workflowView(error.record).stages.map(stage=>stage.status),['succeeded','succeeded','failed']);return true;
 });
});

test('record storage callbacks cannot mutate the returned publication evidence',async()=>{
 const result=await exportArtifactFromReader({artifactId:'reader-public',sourceReference:'raw',readBytes:readRaw,publisher:memoryPublisher(),saveRecord:async record=>{record.status='failed';record.events.pop();}});
 assert.equal(result.record.status,'succeeded');assert.equal(result.record.events.length,6);workflowView(result.record);
});
