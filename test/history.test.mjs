import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createExplorerServer} from '../scripts/serve.mjs';
import {exportArtifact,saveRun} from '../src/pipeline.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('history persistence failure rejects without falsifying completed export evidence',async t=>{
 await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/history-failure-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const runRoot=resolve(dir,'unavailable-history');await writeFile(runRoot,'not a directory');
 const manifestPath=resolve(root,'artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json'),before=await readFile(manifestPath);
 await assert.rejects(exportArtifact({runRoot}),error=>{
  assert.ok(['EEXIST','ENOTDIR'].includes(error.code));
  assert.equal(error.record.status,'succeeded');
  assert.equal(error.record.events.at(-1).stage,'export');
  assert.equal(error.record.events.at(-1).status,'succeeded');
  return true;
 });
 assert.deepEqual(await readFile(manifestPath),before);
});
test('read-only history serves actual preserved records, excludes fixtures, and confines routes',async t=>{
 await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/history-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const runRoot=resolve(dir,'runs');const success=await exportArtifact({runRoot});let failure;
 try{await exportArtifact({runRoot,expectedManifestSha256:'0'.repeat(64)});}catch(error){failure=error.record;}
 assert.equal(failure.status,'failed');
 await assert.rejects(saveRun({...success.record,testFixture:true},runRoot),/fixture/i);
 await mkdir(resolve(runRoot,'invalid'));await writeFile(resolve(runRoot,'invalid/record.json'),'broken');
 const server=createExplorerServer({runRoot});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 const list=await fetch(base+'/api/runs').then(r=>r.json());assert.equal(list.runs.length,2);assert.equal(list.unavailableRecords,1);assert.ok(list.runs.every(r=>r.testFixture===false));
 const record=await fetch(base+'/api/runs/'+success.record.runId).then(r=>r.json());assert.deepEqual(record,success.record);
 assert.equal((await fetch(base+'/api/runs/'+failure.runId).then(r=>r.json())).status,'failed');
 for(const path of ['/api/runs/../../package.json','/api/runs/%2e%2e%5cpackage.json','/runs/'+success.record.runId+'/record.json'])assert.equal((await fetch(base+path)).status,404);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await fetch(base+'/api/runs',{method})).status,404);
 const again=await fetch(base+'/api/runs/'+success.record.runId).then(r=>r.json());assert.deepEqual(again,record);
});
