import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedExplorerHandler} from '../src/hosted/http.mjs';
const id='rrc-example-v1',bytes=new Uint8Array([0,1,2]);
function setup(authorize=async()=>true){
 const reads=[];
 const catalog={listVersions:async()=>[{artifactId:id}],listRuns:async()=>({schemaVersion:1,runs:[],unavailableRecords:0}),readRun:async runId=>({runId,status:'failed'})};
 const store={read:async path=>{reads.push(path);return bytes;}};
 return {reads,handler:createHostedExplorerHandler({store,catalog,authorize})};
}
test('hosted API requires explicit authorization before reading any archive evidence',async()=>{
 assert.throws(()=>createHostedExplorerHandler({store:{},catalog:{}}),/authoriz/i);
 const {handler,reads}=setup(async()=>false);
 const response=await handler(new Request('https://app.example/api/versions'));
 assert.equal(response.status,401);assert.deepEqual(reads,[]);
});
test('hosted API preserves version and run envelopes, HEAD semantics and immutable source download bytes',async()=>{
 const {handler,reads}=setup();
 const versions=await handler(new Request('https://app.example/api/versions'));assert.equal((await versions.json()).versions[0].artifactId,id);
 const runs=await handler(new Request('https://app.example/api/runs'));assert.equal((await runs.json()).schemaVersion,1);
 const source=await handler(new Request(`https://app.example/artifacts/${id}/sources/report.html?download=1`));
 assert.equal(source.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(source.headers.get('content-disposition'),'attachment; filename="report.html"');
 assert.deepEqual(new Uint8Array(await source.arrayBuffer()),bytes);assert.equal(reads.at(-1),`artifacts/${id}/sources/report.html`);
 const head=await handler(new Request(`https://app.example/artifacts/${id}/inventory.csv`,{method:'HEAD'}));assert.equal(head.headers.get('content-length'),'3');assert.equal((await head.arrayBuffer()).byteLength,0);
});
test('hosted routes do not expose backups, unknown versions, traversal or unsupported collection success',async()=>{
 const {handler}=setup();
 for(const path of ['/raw/candidate-inventory.json','/lookups/lookup.json','/artifacts/unknown/inventory.csv','/artifacts/'+id+'/%2e%2e%5csecret'])assert.equal((await handler(new Request('https://app.example'+path))).status,404,path);
 const collection=await handler(new Request('https://app.example/api/collect',{method:'POST'}));assert.equal(collection.status,503);assert.equal((await collection.json()).error.code,'HOSTED_COLLECTION_UNAVAILABLE');
 assert.equal((await handler(new Request('https://app.example/api/versions',{method:'DELETE'}))).status,405);
});
test('unavailable or corrupt backend evidence is unavailable, and internal errors do not leak',async()=>{
 const {handler}=setup(async()=>{throw Error('secret backend details');});
 const response=await handler(new Request('https://app.example/api/versions'));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret backend'));
});
