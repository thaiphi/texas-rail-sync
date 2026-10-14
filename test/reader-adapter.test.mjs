import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as artifact from '../src/artifact.mjs';
import {normalize} from '../src/normalize.mjs';
const raw=new URL('../raw/',import.meta.url);

test('verified artifact loader does not depend on a global Buffer',async()=>{
 const saved=globalThis.Buffer;
 try{
  globalThis.Buffer=undefined;
  const snapshot=await artifact.loadSnapshot(fileURLToPath(raw));
  const built=await artifact.buildArtifact(snapshot,artifact.pinnedArtifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));
  assert.equal(Buffer.from(built.files['manifest.json']).toString(),await readFile(new URL(`../artifacts/${artifact.pinnedArtifactId}/manifest.json`,import.meta.url),'utf8'));
 }finally{globalThis.Buffer=saved;}
});

test('reader adapter owns returned bytes and preserves canonical artifact bytes',async()=>{
 assert.equal(typeof artifact.loadSnapshotFromReader,'function');
 const bodies=new Map();
 const snapshot=await artifact.loadSnapshotFromReader(async name=>{
  const body=new Uint8Array(await readFile(new URL(name,raw)));bodies.set(name,body);return body;
 });
 for(const bytes of bodies.values())bytes.fill(32);
 const built=await artifact.buildArtifact(snapshot,artifact.pinnedArtifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));
 for(const [name,body] of Object.entries(built.files))assert.deepEqual(Buffer.from(body),await readFile(new URL(`../artifacts/${artifact.pinnedArtifactId}/${name}`,import.meta.url)),name);
 await assert.rejects(artifact.buildArtifact({...snapshot,read:async()=>Buffer.alloc(0)},artifact.pinnedArtifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope)),error=>error.code==='SOURCE_PROVENANCE_UNVERIFIED');
});

test('reader adapter rejects non-byte evidence before public export',async()=>{
 assert.equal(typeof artifact.loadSnapshotFromReader,'function');
 await assert.rejects(artifact.loadSnapshotFromReader(async()=>'{"testFixture":false}'),error=>error.code==='SOURCE_INVALID');
});

test('reader adapter reproduces versioned selection evidence and all built files',async()=>{
 const versions=await readdir(new URL('../artifacts/',import.meta.url));
 const id=versions.find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
 assert.ok(id,'preserved v2 evidence must exist');
 const source=new URL(`../artifacts/${id}/sources/`,import.meta.url);
 const snapshot=await artifact.loadSnapshotFromReader(async name=>new Uint8Array(await readFile(new URL(name,source))));
 assert.equal(snapshot.scope.queryVersion,2);assert.equal(snapshot.provenance.classification,'public_reported');
 const built=await artifact.buildArtifact(snapshot,id,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope));
 for(const [name,body] of Object.entries(built.files))assert.deepEqual(Buffer.from(body),await readFile(new URL(`../artifacts/${id}/${name}`,import.meta.url)),name);
});

test('reader adapter distinguishes absent optional evidence from access failures',async()=>{
 const read=async name=>new Uint8Array(await readFile(new URL(name,raw)));
 const legacy=await artifact.loadSnapshotFromReader(read);
 assert.equal(legacy.provenance.basis,'source_proof_2026_10_09_exact_bytes');
 await assert.rejects(artifact.loadSnapshotFromReader(async name=>{
  if(name==='acquisition.json')throw Object.assign(Error('Reader access denied'),{code:'EACCES'});
  return read(name);
 }),error=>error.code==='EACCES');
 await assert.rejects(artifact.loadSnapshotFromReader(undefined),error=>error.code==='SOURCE_INVALID');
 await assert.rejects(artifact.loadSnapshotFromReader(async()=>new ArrayBuffer(1)),error=>error.code==='SOURCE_INVALID');
});
