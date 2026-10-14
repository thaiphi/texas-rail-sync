import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchSource as lookupFetchSource} from '../src/lookup.mjs';
import {collectPublicSnapshot,acquisitionTargets} from '../src/acquisition.mjs';
const shared=await import('../src/sourceFetch.mjs').catch(()=>({}));
const root=fileURLToPath(new URL('../',import.meta.url)),target={name:'probe.json',url:'https://data.texas.gov/api/views/givw-z9t4.json'};
const fake=({status=200,headers={},body=null}={})=>({ok:status>=200&&status<300,status,headers:new Headers(headers),body});
const pulled=(chunks,events,failAt=-1)=>{let index=0;return new ReadableStream({pull(controller){if(index===failAt){controller.error(Error('stream broke'));return;}if(index<chunks.length)controller.enqueue(chunks[index++]);else controller.close();},cancel(){events.push('cancel');}},{highWaterMark:0});};
const run=(response,statuses=[])=>shared.fetchSource(target,{testFixture:true,fetchImpl:async()=>response,onResponse:status=>statuses.push(status)});
test('one shared fetch entry serves lookup and collection callers',()=>{
 assert.equal(typeof shared.fetchSource,'function');assert.equal(lookupFetchSource,shared.fetchSource);
});
test('injected responses require fixture mode before any request is issued',async()=>{
 let calls=0;await assert.rejects(shared.fetchSource(target,{fetchImpl:async()=>{calls++;return fake();}}),error=>error.code==='SOURCE_INVALID');assert.equal(calls,0);
});
test('requests carry a real 30-second timeout signal and refuse redirects',async()=>{
 const original=AbortSignal.timeout,seen=[];AbortSignal.timeout=ms=>{seen.push(ms);return original.call(AbortSignal,ms);};
 try{let url,options;await shared.fetchSource(target,{testFixture:true,fetchImpl:async(requested,init)=>{url=requested;options=init;return fake({body:pulled([Buffer.from('[]')],[])});}});
  assert.deepEqual(seen,[30000]);assert.equal(url,target.url);assert.ok(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);assert.equal(options.redirect,'error');
 }finally{AbortSignal.timeout=original;}
});
test('bodies are privately owned Buffers with exact metadata shape, hash, size and fixture flag',async()=>{
 const expected=Buffer.from('[{"uic_number":"000020838"}]'),source=new Uint8Array(expected),statuses=[];
 const {body,metadata}=await run(fake({headers:{'last-modified':'Wed, 01 Oct 2026 00:00:00 GMT',etag:'"abc"'},body:pulled([source],[])}),statuses);
 source.fill(0);assert.ok(Buffer.isBuffer(body));assert.deepEqual(body,expected);assert.deepEqual(statuses,[200]);
 assert.deepEqual(Object.keys(metadata),['url','retrieved_at','http_status','last_modified','etag','sha256','bytes','testFixture']);
 assert.equal(metadata.url,target.url);assert.equal(new Date(metadata.retrieved_at).toISOString(),metadata.retrieved_at);assert.equal(metadata.http_status,200);
 assert.equal(metadata.last_modified,'Wed, 01 Oct 2026 00:00:00 GMT');assert.equal(metadata.etag,'"abc"');assert.equal(metadata.sha256,createHash('sha256').update(expected).digest('hex'));assert.equal(metadata.bytes,expected.length);assert.equal(metadata.testFixture,true);
});
test('declared and streamed byte caps refuse oversize bodies and cancel the stream; exact cap is accepted',async()=>{
 await assert.rejects(run(fake({headers:{'content-length':'10000001'},body:pulled([Buffer.from('x')],[])})),error=>error.code==='SOURCE_LIMIT');
 const events=[],stream=pulled([Buffer.alloc(6_000_000),Buffer.alloc(4_000_001)],events);
 await assert.rejects(run(fake({body:stream})),error=>error.code==='SOURCE_LIMIT');assert.deepEqual(events,['cancel']);assert.equal(stream.locked,false);
 assert.equal((await run(fake({body:pulled([Buffer.alloc(6_000_000),Buffer.alloc(4_000_000)],[])}))).metadata.bytes,10_000_000);
});
test('HTTP errors, missing bodies and stream failures reject after reporting status and release the reader',async()=>{
 const errorEvents=[],statuses=[];await assert.rejects(run(fake({status:503,body:pulled([Buffer.from('x')],errorEvents)}),statuses),error=>error.code==='HTTP_ERROR');assert.deepEqual(statuses,[503]);
 const empty=[];await assert.rejects(run(fake({body:null}),empty),error=>error.code==='SOURCE_INVALID');assert.deepEqual(empty,[200]);
 const broken=pulled([Buffer.from('[')],[],1);await assert.rejects(run(fake({body:broken})),/stream broke/);assert.equal(broken.locked,false);
});
test('an aborted request propagates its rejection unchanged without a status',async()=>{
 const aborted=new DOMException('The operation was aborted','AbortError'),statuses=[];
 await assert.rejects(shared.fetchSource(target,{testFixture:true,fetchImpl:async()=>{throw aborted;},onResponse:status=>statuses.push(status)}),error=>error===aborted);assert.deepEqual(statuses,[]);
});
test('timeoutMs overrides the 30-second default signal; omitting it keeps 30000',async()=>{
 const original=AbortSignal.timeout,seen=[];AbortSignal.timeout=ms=>{seen.push(ms);return original.call(AbortSignal,ms);};
 try{const fetchImpl=async()=>fake({body:pulled([Buffer.from('[]')],[])});
  await shared.fetchSource(target,{testFixture:true,fetchImpl,timeoutMs:90_000});await shared.fetchSource(target,{testFixture:true,fetchImpl});
  assert.deepEqual(seen,[90_000,30000]);
 }finally{AbortSignal.timeout=original;}
});
test('a fetch that throws before any response becomes a token-free NETWORK_ERROR with the original as cause; timeouts stay unchanged',async()=>{
 const original=new TypeError('fetch failed'),statuses=[];
 await assert.rejects(shared.fetchSource(target,{testFixture:true,fetchImpl:async()=>{throw original;},onResponse:status=>statuses.push(status)}),error=>error.code==='NETWORK_ERROR'&&error.message==='Official source unreachable'&&error.cause===original);assert.deepEqual(statuses,[]);
 const timeout=new DOMException('The operation timed out','TimeoutError');
 await assert.rejects(shared.fetchSource(target,{testFixture:true,fetchImpl:async()=>{throw timeout;}}),error=>error===timeout);
});
async function collectFailure(t,fetchImpl){
 await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/source-fetch-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let failure;try{await collectPublicSnapshot({sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'source-fetch-fixture',testFixture:true,fetchImpl});}catch(error){failure=error;}
 assert.ok(failure?.record);return {failure,requests:failure.record.events.find(event=>event.stage==='load'&&event.status==='failed').evidence.requests};
}
test('collection keeps exact request status and HTTP status evidence on source failures',async t=>{
 const http=await collectFailure(t,async url=>{const item=acquisitionTargets.find(entry=>entry.url===String(url));return item.name==='uic-manual.pdf'?new Response('down',{status:503}):new Response(await readFile(resolve(root,'raw',item.name)));});
 assert.equal(http.failure.code,'HTTP_ERROR');const last=http.requests.at(-1);
 assert.deepEqual(Object.keys(last),['url','name','status','httpStatus']);assert.equal(last.name,'uic-manual.pdf');assert.equal(last.status,'failed');assert.equal(last.httpStatus,503);
 assert.ok(http.requests.slice(0,-1).every(request=>request.status==='succeeded'&&request.httpStatus===200));
 const aborted=new DOMException('The operation was aborted','AbortError'),abort=await collectFailure(t,async()=>{throw aborted;});
 assert.equal(abort.failure,aborted);assert.equal(abort.requests.length,1);assert.deepEqual(Object.keys(abort.requests[0]),['url','name','status']);assert.equal(abort.requests[0].status,'failed');
});
