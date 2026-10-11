import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSupabaseArchiveTransport} from '../src/hosted/supabase-transport.mjs';
const manifest=[{path:'public/artifact-path.json',sha256:'0'.repeat(64),byteCount:1,chunkHashes:['1'.repeat(64)],chunkCount:1}];
const id='trrc-'+createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const endpoint='https://project.supabase.co';
test('server-only transport pins snapshot identity and manifest before returning it',async()=>{
 const seen=[];
 const transport=createSupabaseArchiveTransport({url:endpoint,secretKey:'sb_secret_test',snapshotId:id,fetchImpl:async(url,options)=>{
  seen.push({url,options});return Response.json({snapshot_id:id,verified_at:'2026-10-11T05:22:55Z',manifest});
 }});
 assert.deepEqual((await transport.loadSnapshot()).manifest,manifest);
 assert.equal(seen[0].url,endpoint+'/rest/v1/rpc/trrc_archive_snapshot');
 assert.equal(seen[0].options.headers.apikey,'sb_secret_test');
 assert.equal(seen[0].options.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(seen[0].options.body),{requested_snapshot_id:id});
 const changed=structuredClone(manifest);changed[0].byteCount=2;
 const tampered=createSupabaseArchiveTransport({url:endpoint,secretKey:'sb_secret_test',snapshotId:id,fetchImpl:async()=>Response.json({snapshot_id:id,verified_at:'2026-10-11T05:22:55Z',manifest:changed})});
 await assert.rejects(tampered.loadSnapshot(),/manifest|pin/i);
});
test('transport refuses insecure endpoints, public credentials, unpublished snapshots and upstream errors',async()=>{
 assert.throws(()=>createSupabaseArchiveTransport({url:'http://project.supabase.co',secretKey:'sb_secret_test',snapshotId:id}),/https/i);
 assert.throws(()=>createSupabaseArchiveTransport({url:endpoint,secretKey:'sb_publishable_test',snapshotId:id}),/secret/i);
 const options={url:endpoint,secretKey:'sb_secret_test',snapshotId:id};
 await assert.rejects(createSupabaseArchiveTransport({...options,fetchImpl:async()=>Response.json({snapshot_id:id,verified_at:null,manifest})}).loadSnapshot(),/verified/i);
 await assert.rejects(createSupabaseArchiveTransport({...options,fetchImpl:async()=>new Response('secret error details',{status:500})}).loadSnapshot(),/unavailable/i);
});
test('chunk fetch validates requested identity and base64, and does not forward secret to redirects',async()=>{
 let init;
 const transport=createSupabaseArchiveTransport({url:endpoint,secretKey:'sb_secret_test',snapshotId:id,fetchImpl:async(_url,options)=>{init=options;return Response.json({sha256:'1'.repeat(64),base64:'AAE='});}});
 assert.deepEqual(await transport.readChunk('1'.repeat(64)),new Uint8Array([0,1]));assert.equal(init.redirect,'error');
 await assert.rejects(transport.readChunk('../secret'),/hash/i);
 const wrong=createSupabaseArchiveTransport({url:endpoint,secretKey:'sb_secret_test',snapshotId:id,fetchImpl:async()=>Response.json({sha256:'2'.repeat(64),base64:'AAE='})});
 await assert.rejects(wrong.readChunk('1'.repeat(64)),/identity/i);
});
