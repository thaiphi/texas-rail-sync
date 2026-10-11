import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as integrity from '../public/artifact-integrity.js';
const collection=await import('../public/collection.js').catch(()=>({}));
const root=new URL('../',import.meta.url),artifactId='rrc-2026-10-09-uic000020838-v1';
const manifest=await readFile(new URL(`artifacts/${artifactId}/manifest.json`,root)),normalized=await readFile(new URL(`artifacts/${artifactId}/normalized.json`,root));
const hash=body=>createHash('sha256').update(body).digest('hex');
test('explicit version loader verifies publication pins and rejects tampered bytes and fixture versions',async()=>{
 assert.equal(typeof integrity.loadVerifiedVersion,'function','explicit version verification required');
 const pins={artifactId,path:`/artifacts/${artifactId}/`,manifestSha256:hash(manifest),normalizedSha256:hash(normalized),classification:'public_reported',defaultPinned:true};
 const network=async path=>new Response(path.endsWith('manifest.json')?manifest:normalized);
 assert.equal((await integrity.loadVerifiedVersion(pins,network)).inventory.length,5);
 await assert.rejects(integrity.loadVerifiedVersion(pins,async()=>new Response('{}')),/hash/i);
 await assert.rejects(integrity.loadVerifiedVersion({...pins,classification:'test_fixture'},network),/public|fixture/i);
 await assert.rejects(integrity.loadVerifiedVersion({...pins,path:'/artifacts/../raw/'},network),/identity|path/i);
});
test('latest selection suppresses slower responses after a new lookup or version choice',async()=>{
 assert.equal(typeof collection.createLatestRequest,'function','stale response protection required');
 const latest=collection.createLatestRequest();const old=latest.begin(),current=latest.begin();assert.equal(latest.isCurrent(old),false);assert.equal(latest.isCurrent(current),true);latest.invalidate();assert.equal(latest.isCurrent(current),false);
});
