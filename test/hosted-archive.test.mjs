import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createArchiveStore,archiveSha256,ARCHIVE_CHUNK_BYTES,ARCHIVE_LIMITS} from '../src/hosted/archive-store.mjs';
import {createHostedCatalog} from '../src/hosted/catalog.mjs';
const verifiedAt='2026-10-11T00:00:00.000Z',root=new URL('../',import.meta.url),encode=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
const clone=value=>structuredClone(value),oldId='rrc-2026-10-09-uic000020838-v1',newId='rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0',runId='c24eb125-53eb-42cb-9d5a-d73c5387ce05',failureId='2c0ddcde-fd65-4342-bc48-d331fb154fa6';
async function archive(files){
 const manifest=[],chunks=new Map();
 for(const [path,value] of Object.entries(files)){
  const bytes=typeof value==='string'?encode(value):value,chunkHashes=[];
  for(let offset=0;offset<bytes.length;offset+=ARCHIVE_CHUNK_BYTES){const chunk=bytes.slice(offset,offset+ARCHIVE_CHUNK_BYTES),hash=await archiveSha256(chunk);chunks.set(hash,chunk);chunkHashes.push(hash);}
  manifest.push({path,sha256:await archiveSha256(bytes),byteCount:bytes.length,chunkCount:chunkHashes.length,chunkHashes});
 }
 return {manifest,chunks,store:createArchiveStore({manifest,verifiedAt,readChunk:async hash=>chunks.get(hash)})};
}
async function catalogFiles(){
 const names=['public/artifact-path.json','public/artifact-integrity.json',`runs/${runId}/record.json`,`runs/${failureId}/record.json`,...[oldId,newId].flatMap(id=>[`artifacts/${id}/manifest.json`,`artifacts/${id}/normalized.json`]),`artifacts/${newId}/version-pins.json`];
 return Object.fromEntries(await Promise.all(names.map(async path=>[path,await readFile(new URL(path,root))])));
}
async function catalog(files){return createHostedCatalog({store:(await archive(files)).store});}

test('archive reads exact binary, empty, and ordered multichunk files with independent returned bytes',async()=>{
 const bytes=Uint8Array.from({length:ARCHIVE_CHUNK_BYTES*2+7},(_,i)=>(i*23)%251),{store}=await archive({'raw/a.bin':bytes,'raw/empty':new Uint8Array(),'public/pin.json':encode('{}')});
 assert.deepEqual(await store.read('raw/a.bin'),bytes);assert.equal((await store.read('raw/empty')).length,0);
 const changed=await store.read('raw/a.bin');changed[0]^=255;assert.deepEqual(await store.read('raw/a.bin'),bytes);
 assert.deepEqual(store.list('raw/'),['raw/a.bin','raw/empty']);assert.equal(store.has('raw/a.bin'),true);assert.equal(store.has('raw/missing'),false);
 await assert.rejects(store.read('raw/missing'),{code:'ARCHIVE_NOT_FOUND'});
});
test('archive rejects unsafe paths, duplicate paths, and file/directory conflicts before transport access',async()=>{
 const {manifest}=await archive({'raw/good.json':encode('{}')}),entry=manifest[0];let reads=0;
 const make=manifest=>createArchiveStore({manifest,verifiedAt,readChunk:async()=>{reads++;}});
 for(const path of ['/raw/a','../a','raw/../a','raw//a','raw/./a','C:/a','raw\\a','raw/%2e%2e/a','raw/a?x','raw/a#x','raw/a\n'])assert.throws(()=>make([{...entry,path}]),/path/i);
 for(const path of ['raw/good.json','RAW/GOOD.JSON'])assert.throws(()=>make([entry,{...entry,path}]),/Duplicate/);
 assert.throws(()=>make([{...entry,path:'raw'},{...entry,path:'raw/a'}]),/conflict/);assert.equal(reads,0);
 const {store}=await archive({'raw/good.json':encode('{}')});assert.throws(()=>store.list('../'),/path/);await assert.rejects(store.read('../a'),/path/);
});
test('archive requires verified status, exact transport choice and bounded manifest shape',async()=>{
 const {manifest}=await archive({'a':encode('a')}),entry=manifest[0],make=options=>createArchiveStore({manifest,verifiedAt,readChunk:async()=>encode('a'),...options});
 for(const value of [undefined,null,'','2026-10-11','not a date'])assert.throws(()=>make({verifiedAt:value}),/Verified/);
 assert.throws(()=>make({readFile:async()=>encode('a')}),/transport/);assert.throws(()=>make({readChunk:undefined}),/transport/);
 for(const value of [[],null,Array(ARCHIVE_LIMITS.files+1).fill(entry)])assert.throws(()=>make({manifest:value}),/inventory/);
 for(const edit of [{sha256:'z'.repeat(64)},{byteCount:-1},{byteCount:1.5},{byteCount:ARCHIVE_LIMITS.fileBytes+1},{chunkCount:2},{chunkHashes:[]},{chunkHashes:['A'.repeat(64)]}])assert.throws(()=>make({manifest:[{...entry,...edit}]}),/hashes|counts/);
 const large={...entry,byteCount:ARCHIVE_LIMITS.fileBytes,chunkCount:2048,chunkHashes:Array(2048).fill(entry.sha256)};
 assert.throws(()=>make({manifest:Array.from({length:9},(_,i)=>({...large,path:`large${i}`}))}),/cap/);
});
test('manifest changes after construction cannot alter validated paths, hashes or chunk order',async()=>{
 const {manifest,chunks}=await archive({'a':encode('correct')}),store=createArchiveStore({manifest,verifiedAt,readChunk:async hash=>chunks.get(hash)});
 manifest[0].path='elsewhere';manifest[0].sha256='0'.repeat(64);manifest[0].chunkHashes[0]='0'.repeat(64);manifest.push({...manifest[0],path:'new'});
 assert.equal(new TextDecoder().decode(await store.read('a')),'correct');assert.deepEqual(store.list(),['a']);
});
test('chunk tampering, truncation, missing chunks, reordering and wrong whole-file hash fail closed',async()=>{
 const bytes=new Uint8Array(ARCHIVE_CHUNK_BYTES*2);bytes.fill(7,0,ARCHIVE_CHUNK_BYTES);bytes.fill(8,ARCHIVE_CHUNK_BYTES);
 const {manifest,chunks}=await archive({'a':bytes}),hashes=manifest[0].chunkHashes;
 for(const readChunk of [async()=>new Uint8Array(ARCHIVE_CHUNK_BYTES),async()=>new Uint8Array(1),async()=>undefined,async hash=>chunks.get(hash===hashes[0]?hashes[1]:hashes[0])])await assert.rejects(createArchiveStore({manifest,verifiedAt,readChunk}).read('a'),{code:'ARCHIVE_INVALID'});
 const reverse=clone(manifest);reverse[0].chunkHashes.reverse();await assert.rejects(createArchiveStore({manifest:reverse,verifiedAt,readChunk:async hash=>chunks.get(hash)}).read('a'),/file hash/);
 const wrong=clone(manifest);wrong[0].sha256='0'.repeat(64);await assert.rejects(createArchiveStore({manifest:wrong,verifiedAt,readChunk:async hash=>chunks.get(hash)}).read('a'),/file hash/);
});
test('whole-file transport still verifies ordered chunk and whole-file hashes and refuses text',async()=>{
 const bytes=encode('exact bytes'),{manifest}=await archive({'a':bytes});
 assert.deepEqual(await createArchiveStore({manifest,verifiedAt,readFile:async()=>bytes.buffer}).read('a'),bytes);
 for(const result of ['exact bytes',new Uint8Array(bytes.length),bytes.slice(1),new Uint8Array(bytes.length+1)])await assert.rejects(createArchiveStore({manifest,verifiedAt,readFile:async()=>result}).read('a'),{code:'ARCHIVE_INVALID'});
 const wrong=clone(manifest);wrong[0].chunkHashes[0]='0'.repeat(64);await assert.rejects(createArchiveStore({manifest:wrong,verifiedAt,readFile:async()=>bytes}).read('a'),/chunk hash/);
});
test('catalog retains legacy default, public publication pins, failed runs, and independent history reads',async()=>{
 const files=await catalogFiles(),view=await catalog(files),versions=await view.listVersions(),runs=await view.listRuns();
 assert.deepEqual(versions.map(pin=>pin.artifactId),[oldId,newId]);assert.equal(versions[0].defaultPinned,true);assert.equal(versions[1].defaultPinned,false);assert.equal(versions[1].runId,runId);
 assert.equal(versions[1].publicationPinsSha256,await archiveSha256(files[`artifacts/${newId}/version-pins.json`]));
 assert.equal(runs.schemaVersion,1);assert.equal(runs.unavailableRecords,0);assert.equal(runs.runs.length,2);assert.ok(runs.runs.some(run=>run.status==='failed'));
 const before=clone(versions);assert.equal((await view.readRun(failureId)).status,'failed');assert.deepEqual(await view.listVersions(),before);
 assert.deepEqual(await view.readRun(runId),JSON.parse(files[`runs/${runId}/record.json`]));
 await assert.rejects(view.readRun('../record.json'),/unavailable/);
});
test('catalog excludes fixture, malformed, mismatched and tampered runs with unavailable counts',async()=>{
 const files=await catalogFiles(),source=JSON.parse(files[`runs/${runId}/record.json`]);
 const fixture=clone(source);fixture.testFixture=true;delete fixture.provenance;for(const event of fixture.events)if(event.evidence)delete event.evidence.provenance;
 files[`runs/${runId}/record.json`]=encode(fixture);files['runs/invalid/record.json']=encode('{');files['runs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/record.json']=encode(source);files['runs/not-directory']=encode('stray');
 const view=await catalog(files),runs=await view.listRuns();assert.equal(runs.runs.length,1);assert.equal(runs.unavailableRecords,4);await assert.rejects(view.readRun(runId));assert.deepEqual((await view.listVersions()).map(pin=>pin.artifactId),[oldId]);
});
test('catalog refuses publication pins without matching successful public export evidence',async()=>{
 for(const mutation of ['pins','output-hash','classification','manifest','normalized']){
  const files=await catalogFiles();
  if(mutation==='pins'){const path=`artifacts/${newId}/version-pins.json`;files[path]=encode({...JSON.parse(files[path]),classification:'test_fixture'});}
  if(mutation==='output-hash'||mutation==='classification'){const path=`runs/${runId}/record.json`,record=JSON.parse(files[path]);if(mutation==='classification')delete record.provenance;else record.events.find(event=>event.stage==='export'&&event.status==='succeeded').evidence.outputs.find(output=>output.path.endsWith('version-pins.json')).sha256='0'.repeat(64);files[path]=encode(record);}
  if(mutation==='manifest'||mutation==='normalized')files[`artifacts/${newId}/${mutation}.json`]=encode('{}');
  assert.deepEqual((await (await catalog(files)).listVersions()).map(pin=>pin.artifactId),[oldId],mutation);
 }
});
test('catalog fails closed on inconsistent legacy pins and explicit fixture default evidence',async()=>{
 for(const mutation of ['path','hash','fixture']){
  const files=await catalogFiles(),pin=JSON.parse(files['public/artifact-integrity.json']);
  if(mutation==='path')files['public/artifact-path.json']=encode({artifact_id:oldId,path:'/artifacts/other/'});
  if(mutation==='hash'){pin.manifestSha256='0'.repeat(64);files['public/artifact-integrity.json']=encode(pin);}
  if(mutation==='fixture'){const path=`artifacts/${oldId}/manifest.json`,manifest=JSON.parse(files[path]);manifest.testFixture=true;files[path]=encode(manifest);pin.manifestSha256=await archiveSha256(files[path]);files['public/artifact-integrity.json']=encode(pin);}
  await assert.rejects((await catalog(files)).listVersions(),{code:'CATALOG_INVALID'});
 }
});
