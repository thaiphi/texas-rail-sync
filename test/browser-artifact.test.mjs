import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadPinnedArtifact} from '../public/artifact-integrity.js';
const base='/artifacts/rrc-2026-10-09-uic000020838-v1/',root=new URL('../',import.meta.url);
const integrity={artifactId:'rrc-2026-10-09-uic000020838-v1',manifestSha256:'3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f',normalizedSha256:'4f243138c833f09a5be6a970e85f76f3f73e95040c69677a10b8c3b2fe03ca5b'};
const fetchFixture=change=>async path=>{if(path==='/artifact-integrity.json')return new Response(JSON.stringify(integrity));const name=path.split('/').at(-1),bytes=await readFile(new URL(`artifacts/rrc-2026-10-09-uic000020838-v1/${name}`,root));return new Response(change?change(bytes,name):bytes);};
test('browser inspection validates exact pinned manifest/payload bytes before displaying data',async()=>{
 const artifact=await loadPinnedArtifact({artifact_id:integrity.artifactId,path:base},fetchFixture());assert.equal(artifact.inventory.length,5);assert.equal(artifact.injectionMonthly.length,28);
 await assert.rejects(loadPinnedArtifact({artifact_id:integrity.artifactId,path:base},fetchFixture((bytes,name)=>name==='normalized.json'?Buffer.from(bytes.toString().replace('17173','17174')):bytes)),/hash|pin/i);
 await assert.rejects(loadPinnedArtifact({artifact_id:integrity.artifactId,path:base},async()=>new Response('missing',{status:404})),/unavailable/i);
 await assert.rejects(loadPinnedArtifact({artifact_id:'other',path:base},fetchFixture()),/identity|pin/i);
});
