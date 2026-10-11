import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,stat,rm,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectPublicSnapshot,acquisitionTargets} from '../src/acquisition.mjs';
import {exportArtifact} from '../src/pipeline.mjs';
import {workflowView} from '../public/workflow.js';
import {sha256} from '../src/normalize.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function setup(t){await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/acquisition-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'fixture-v1',testFixture:true};}
function preservedFetch(calls,failAt=null){return async url=>{const target=acquisitionTargets.find(t=>t.url===String(url));assert.ok(target);calls.push(target.name);if(target.name===failAt)return new Response('unavailable',{status:503});return new Response(await readFile(resolve(root,'raw',target.name)),{status:200,headers:{'content-type':'application/octet-stream'}});};}
test('bounded automated collection preserves exact bytes, metadata and pipeline provenance; fixtures never enter actual history',async t=>{
 const env=await setup(t),calls=[],result=await collectPublicSnapshot({...env,fetchImpl:preservedFetch(calls)});
 assert.equal(calls.length,7);assert.equal(result.record.testFixture,true);assert.equal(result.record.mode,'live_collection');assert.equal(workflowView(result.record).status,'succeeded');
 for(const target of acquisitionTargets){const body=await readFile(resolve(env.sourceDir,target.name));assert.deepEqual(body,await readFile(resolve(root,'raw',target.name)));const metadata=JSON.parse(await readFile(resolve(env.sourceDir,target.name.replace(/\.[^.]+$/,'')+'.source.json')));assert.equal(metadata.sha256,sha256(body));assert.equal(metadata.url,target.url);}
 assert.equal(result.normalized.injectionMonthly.length,28);assert.equal(JSON.parse(await readFile(resolve(env.sourceDir,'acquisition.json'))).status,'succeeded');
 await assert.rejects(stat(env.runRoot),{code:'ENOENT'});
 await assert.rejects(collectPublicSnapshot({...env,fetchImpl:preservedFetch([])}),/exist|source/i);
});
test('failed bounded acquisition retains partial raw evidence and skips normalization/export',async t=>{
 const env=await setup(t),calls=[];
 await assert.rejects(collectPublicSnapshot({...env,fetchImpl:preservedFetch(calls,'candidate-monthly.json')}),error=>{assert.deepEqual(workflowView(error.record).stages.map(s=>s.status),['failed','skipped','skipped']);assert.equal(error.record.events[1].error.code,'HTTP_ERROR');return true;});
 assert.equal(calls.length,4);assert.ok((await readdir(env.sourceDir)).includes('candidate-inventory.json'));assert.equal(JSON.parse(await readFile(resolve(env.sourceDir,'acquisition.json'))).status,'failed');
 await assert.rejects(exportArtifact({...env,record:false}),/incomplete|acquisition|source/i);
 await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
});
test('oversize and incorrect-source responses fail without publishing an artifact',async t=>{
 const env=await setup(t);
 await assert.rejects(collectPublicSnapshot({...env,fetchImpl:async()=>new Response(new Uint8Array(10_000_001))}),error=>{assert.equal(error.record.status,'failed');assert.equal(error.record.events[1].error.code,'SOURCE_LIMIT');assert.equal(error.record.events[1].evidence.requests[0].status,'failed');return true;});
 await assert.rejects(stat(resolve(env.outputRoot,env.artifactId)),{code:'ENOENT'});
});

test('injected demonstration responses cannot be recorded as actual collection',async t=>{
 const env=await setup(t);await assert.rejects(collectPublicSnapshot({...env,testFixture:false,fetchImpl:preservedFetch([])}),/fixture/i);await assert.rejects(stat(env.runRoot),{code:'ENOENT'});
});
