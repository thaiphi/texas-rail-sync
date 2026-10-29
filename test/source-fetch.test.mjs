import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchSource as lookupFetchSource} from '../src/lookup.mjs';
import {collectPublicSnapshot,acquisitionTargets} from '../src/acquisition.mjs';
import {performLookup} from '../src/lookup.mjs';
import {readdir} from 'node:fs/promises';
import {createMemoryGuestJournal} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore} from '../src/hosted/evidence-store.mjs';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
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
 assert.deepEqual(Object.keys(metadata),['url','retrieved_at','http_status','last_modified','etag','sha256','bytes','testFixture','app_token_used']);assert.equal(metadata.app_token_used,false);
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
// Phase 1.2: optional Socrata app token, 429 throttling and the local-only retry helper.
const TOKEN='tok-SECRET-9f3c1a77-do-not-leak';
const rrcTarget=acquisitionTargets.find(entry=>new URL(entry.url).hostname==='www.rrc.texas.gov');
const ok=()=>fake({body:pulled([Buffer.from('[]')],[])});
const capture=(seen,respond=ok)=>async(url,init)=>{seen.push({url,init,header:new Headers(init?.headers).get('x-app-token')});return respond();};
const noToken=(value,label)=>assert.ok(!String(value).includes(TOKEN),`${label} leaks the app token`);
async function filesUnder(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true,recursive:true}))if(entry.isFile())out.push(resolve(entry.parentPath??entry.path,entry.name));return out;}
async function tempDir(t){await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/source-token-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('an app token is sent only as X-App-Token to https://data.texas.gov; the URL is unchanged and metadata records only whether it was used',async()=>{
 const withToken=[],without=[],rrc=[];
 const a=await shared.fetchSource(target,{testFixture:true,appToken:TOKEN,fetchImpl:capture(withToken)});
 const b=await shared.fetchSource(target,{testFixture:true,fetchImpl:capture(without)});
 const c=await shared.fetchSource(rrcTarget,{testFixture:true,appToken:TOKEN,fetchImpl:capture(rrc)});
 assert.equal(withToken[0].header,TOKEN);assert.equal(without[0].header,null);assert.equal(rrc[0].header,null);
 assert.equal(Object.hasOwn(without[0].init,'headers'),false);assert.equal(Object.hasOwn(rrc[0].init,'headers'),false);
 assert.equal(withToken[0].url,target.url);assert.equal(withToken[0].url,without[0].url);noToken(withToken[0].url,'request URL');
 assert.equal(a.metadata.app_token_used,true);assert.equal(b.metadata.app_token_used,false);assert.equal(c.metadata.app_token_used,false);
 for(const {metadata} of [a,b,c])noToken(JSON.stringify(metadata),'metadata');
 assert.equal(a.metadata.url,b.metadata.url);
});
test('empty, non-string or look-alike-origin targets never carry the token',async()=>{
 for(const [item,appToken] of [[target,''],[target,null],[target,123],[{name:'x.json',url:'http://data.texas.gov/api/views/givw-z9t4.json'},TOKEN],[{name:'x.json',url:'https://data.texas.gov.evil.example/x.json'},TOKEN],[{name:'x.json',url:'https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html'},TOKEN],[{name:'x.json',url:'https://data.texas.gov:8443/x.json'},TOKEN]]){
  const seen=[],{metadata}=await shared.fetchSource(item,{testFixture:true,appToken,fetchImpl:capture(seen)});
  assert.equal(seen[0].header,null,item.url);assert.equal(metadata.app_token_used,false);
 }
});
test('the token never appears in thrown errors, including the NETWORK_ERROR cause',async()=>{
 const errors=[];
 for(const respond of [()=>fake({status:503,body:pulled([Buffer.from('x')],[])}),()=>fake({status:429,headers:{'retry-after':'5'}}),()=>fake({body:null}),()=>{throw new TypeError('fetch failed');}]){
  try{await shared.fetchSource(target,{testFixture:true,appToken:TOKEN,fetchImpl:async()=>respond()});assert.fail('expected rejection');}catch(error){errors.push(error);}
 }
 assert.deepEqual(errors.map(e=>e.code),['HTTP_ERROR','SOURCE_THROTTLED','SOURCE_INVALID','NETWORK_ERROR']);
 for(const error of errors){noToken(error.message,'message');noToken(error.stack,'stack');noToken(String(error.cause??''),'cause');noToken(error.cause?.stack??'','cause stack');noToken(JSON.stringify({...error,message:error.message,cause:error.cause&&{...error.cause,message:error.cause.message}}),'error JSON');}
});
test('HTTP 429 throws SOURCE_THROTTLED with retryAfterMs from delta-seconds, HTTP-date or null, after reporting the status',async()=>{
 const statuses=[];
 await assert.rejects(run(fake({status:429,headers:{'retry-after':'7'}}),statuses),error=>error.code==='SOURCE_THROTTLED'&&error.retryAfterMs===7000);assert.deepEqual(statuses,[429]);
 const date=new Date(Date.now()+30_000).toUTCString();
 await assert.rejects(run(fake({status:429,headers:{'retry-after':date}})),error=>error.code==='SOURCE_THROTTLED'&&error.retryAfterMs>=28_000&&error.retryAfterMs<=30_000);
 await assert.rejects(run(fake({status:429,headers:{'retry-after':new Date(Date.now()-60_000).toUTCString()}})),error=>error.retryAfterMs===0);
 await assert.rejects(run(fake({status:429})),error=>error.code==='SOURCE_THROTTLED'&&error.retryAfterMs===null);
 await assert.rejects(run(fake({status:429,headers:{'retry-after':'soon'}})),error=>error.code==='SOURCE_THROTTLED'&&error.retryAfterMs===null);
 await assert.rejects(run(fake({status:503,headers:{'retry-after':'7'}})),error=>error.code==='HTTP_ERROR'&&!Object.hasOwn(error,'retryAfterMs'));
 assert.equal(shared.parseRetryAfter(' 12 '),12_000);assert.equal(shared.parseRetryAfter(''),null);assert.equal(shared.parseRetryAfter(null),null);assert.equal(shared.parseRetryAfter('-3'),null);
});
test('fetchSource never waits on 429: it rejects without scheduling a timer',async()=>{
 const original=globalThis.setTimeout;let timers=0;globalThis.setTimeout=(...args)=>{timers++;return original(...args);};
 try{await assert.rejects(run(fake({status:429,headers:{'retry-after':'30'}})),error=>error.code==='SOURCE_THROTTLED');}finally{globalThis.setTimeout=original;}
 assert.equal(timers,0);
});
test('the local throttle-retry helper waits the advertised time once, then retries once with the same token and URL',async()=>{
 assert.equal(shared.THROTTLE_RETRY_CAP_MS,60_000);
 const seen=[],waits=[],statuses=[];let n=0;
 const result=await shared.fetchSourceWithThrottleRetry(target,{testFixture:true,appToken:TOKEN,wait:async ms=>{waits.push(ms);},onResponse:status=>statuses.push(status),fetchImpl:capture(seen,()=>++n===1?fake({status:429,headers:{'retry-after':'3'}}):ok())});
 assert.deepEqual(waits,[3000]);assert.deepEqual(statuses,[429,200]);assert.equal(seen.length,2);
 assert.ok(seen.every(call=>call.url===target.url&&call.header===TOKEN));assert.equal(result.metadata.app_token_used,true);assert.equal(result.metadata.http_status,200);
 const twice=[];let m=0;
 await assert.rejects(shared.fetchSourceWithThrottleRetry(target,{testFixture:true,wait:async ms=>{twice.push(ms);},fetchImpl:async()=>(++m,fake({status:429,headers:{'retry-after':'1'}}))}),error=>error.code==='SOURCE_THROTTLED');
 assert.deepEqual(twice,[1000]);assert.equal(m,2);
});
test('the throttle-retry helper rethrows without waiting when Retry-After is absent, unparseable or over the cap; other errors pass through',async()=>{
 for(const headers of [{},{'retry-after':'later'},{'retry-after':'61'},{'retry-after':new Date(Date.now()+3_600_000).toUTCString()}]){
  const waits=[];let calls=0;
  await assert.rejects(shared.fetchSourceWithThrottleRetry(target,{testFixture:true,wait:async ms=>{waits.push(ms);},fetchImpl:async()=>(calls++,fake({status:429,headers}))}),error=>error.code==='SOURCE_THROTTLED');
  assert.deepEqual(waits,[]);assert.equal(calls,1);
 }
 const waits=[];let calls=0;
 await assert.rejects(shared.fetchSourceWithThrottleRetry(target,{testFixture:true,wait:async ms=>{waits.push(ms);},fetchImpl:async()=>(calls++,fake({status:503,headers:{'retry-after':'1'}}))}),error=>error.code==='HTTP_ERROR');
 assert.deepEqual(waits,[]);assert.equal(calls,1);
 let cap=0;await shared.fetchSourceWithThrottleRetry(target,{testFixture:true,wait:async ms=>{cap=ms;},fetchImpl:async()=>cap?ok():fake({status:429,headers:{'retry-after':'60'}})});assert.equal(cap,60_000);
 let injected=0;await assert.rejects(shared.fetchSourceWithThrottleRetry(target,{fetchImpl:async()=>{injected++;return ok();}}),error=>error.code==='SOURCE_INVALID');assert.equal(injected,0);
});
test('collection sends the token only to data.texas.gov targets and never records it in run, request, sidecar or output files',async t=>{
 const dir=await tempDir(t),seen=[],waits=[];let throttled=false;
 const fetchImpl=async(url,init)=>{const item=acquisitionTargets.find(entry=>entry.url===String(url));seen.push({host:new URL(String(url)).hostname,header:new Headers(init?.headers).get('x-app-token'),url:String(url)});
  if(item.name==='inventory-metadata.json'&&!throttled){throttled=true;return new Response('slow down',{status:429,headers:{'retry-after':'2'}});}
  return new Response(await readFile(resolve(root,'raw',item.name)));};
 const result=await collectPublicSnapshot({sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'source-token-fixture',testFixture:true,fetchImpl,appToken:TOKEN,wait:async ms=>{waits.push(ms);}});
 assert.deepEqual(waits,[2000]);assert.equal(seen.length,acquisitionTargets.length+1);
 assert.ok(seen.some(call=>call.host!=='data.texas.gov'));
 for(const call of seen){assert.equal(call.header,call.host==='data.texas.gov'?TOKEN:null,call.url);noToken(call.url,'request URL');}
 noToken(JSON.stringify(result.record),'run record');
 const load=result.record.events.find(event=>event.stage==='load'&&event.status==='succeeded');
 for(const request of load.evidence.requests)assert.deepEqual(Object.keys(request),['url','name','status','httpStatus']);
 const files=await filesUnder(dir);assert.ok(files.length>acquisitionTargets.length);for(const file of files)noToken(await readFile(file,'latin1'),file);
 assert.equal(JSON.parse(await readFile(resolve(dir,'raw','inventory-metadata.source.json'))).app_token_used,true);
 assert.equal(JSON.parse(await readFile(resolve(dir,'raw','uic-manual.source.json'))).app_token_used,false);
});
test('a failed collection with a token keeps it out of the failed run record and request evidence',async t=>{
 const dir=await tempDir(t);let failure;
 try{await collectPublicSnapshot({sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'source-token-fail',testFixture:true,appToken:TOKEN,wait:async()=>{assert.fail('no wait without Retry-After');},fetchImpl:async url=>{const item=acquisitionTargets.find(entry=>entry.url===String(url));return item.name==='candidate-inventory.json'?new Response('busy',{status:429}):new Response(await readFile(resolve(root,'raw',item.name)));}});}catch(error){failure=error;}
 assert.equal(failure?.code,'SOURCE_THROTTLED');assert.equal(failure.retryAfterMs,null);
 noToken(JSON.stringify(failure.record),'failed run record');noToken(failure.message,'error message');
 const last=failure.record.events.find(event=>event.stage==='load'&&event.status==='failed').evidence.requests.at(-1);
 assert.deepEqual(last,{url:acquisitionTargets.find(entry=>entry.name==='candidate-inventory.json').url,name:'candidate-inventory.json',status:'failed',httpStatus:429});
 for(const file of await filesUnder(dir))noToken(await readFile(file,'latin1'),file);
});
test('lookup threads the token to data.texas.gov and writes no token into lookup evidence',async t=>{
 const dir=await tempDir(t),seen=[],waits=[];let first=true;
 const fetchImpl=async(url,init)=>{seen.push(new Headers(init?.headers).get('x-app-token'));if(first){first=false;return new Response('',{status:429,headers:{'retry-after':'1'}});}return new Response(String(url).includes('/api/views/')?'{}':'[]');};
 const found=await performLookup({request:{kind:'uic',value:'000020838'},lookupRoot:dir,testFixture:true,fetchImpl,appToken:TOKEN,wait:async ms=>{waits.push(ms);}});
 assert.equal(found.status,'empty');assert.deepEqual(waits,[1000]);assert.deepEqual(seen,[TOKEN,TOKEN,TOKEN]);
 noToken(JSON.stringify(found),'lookup result');
 const files=await filesUnder(dir);assert.ok(files.length>=5);for(const file of files)noToken(await readFile(file,'latin1'),file);
 assert.equal(JSON.parse(await readFile(resolve(dir,found.lookupId,'lookup-inventory.source.json'))).app_token_used,true);
});
test('the hosted guest path treats SOURCE_THROTTLED as retryable with the existing backoff and sends no token',async()=>{
 const now=Date.parse('2026-10-13T05:00:00.000Z'),journal=createMemoryGuestJournal({clock:()=>now}),store=createMemoryObjectStore({objects:new Map()}),headers=[];
 const service=createGuestService({journal,store,testFixture:true,random:()=>0,fetchImpl:async(url,init)=>{headers.push(new Headers(init?.headers).get('x-app-token'));return new Response('',{status:429,headers:{'retry-after':'1'}});}});
 const {token}=await service.issueSession(),{job}=await service.enqueueLookup({token,idemKey:'throttle-0001-0123456789',request:{kind:'uic',value:'000020838'}});
 const view=await service.advance({token,jobId:job.jobId});
 assert.equal(view.state,'retry_wait');assert.equal(view.attempt,2);assert.equal(Date.parse(view.nextStepAt)-now,30_000);
 assert.deepEqual(headers,[null]);
});
