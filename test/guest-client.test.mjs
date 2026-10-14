import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestClient,guestMessage} from '../public/guest-client.js';
import {createGuestCollectionApi} from '../public/collection-api.js';
const TOKEN='t'.repeat(43),JOB='11111111-1111-1111-1111-111111111111',CJOB='22222222-2222-2222-2222-222222222222';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function memoryStorage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
function fakeServer(script){const calls=[];return {calls,fetchImpl:async(url,init={})=>{calls.push({url,method:init.method??'GET',headers:new Headers(init.headers),body:init.body});const next=script.shift();if(!next)throw Error('unexpected '+url);return typeof next==='function'?next(url,init):next;}};}
const lookupResult={lookupId:'L-1',status:'ok',candidates:[{sourceRecordKey:'k1',selectable:true}],sha256:'a'.repeat(64),queryUrl:'https://x',testFixture:false,retrievedAt:'2026-10-14T00:00:00.000Z',sourceRowsUpdatedAt:null};
const job=(state,extra={})=>({jobId:JOB,kind:'lookup',state,step:1,stepCount:3,stepName:'L1',due:true,nextStepAt:'2026-10-14T00:00:00.000Z',errorCode:null,result:null,...extra});
test('lookup starts a session once, stores the token, advances to success and returns legacy fields plus lookupJobId',async()=>{
 const storage=memoryStorage(),server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('queued'),replayed:false}),json(200,{job:job('running',{step:2,stepName:'L2'})}),json(200,{job:job('succeeded',{result:lookupResult})})]);
 const progress=[];const client=createGuestClient({fetchImpl:server.fetchImpl,storage,sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 const result=await client.lookup({kind:'uic',value:'000020838'},{onProgress:m=>progress.push(m)});
 assert.equal(result.lookupJobId,JOB);assert.equal(result.lookupId,'L-1');
 assert.equal(server.calls[0].url,'/api/guest/session');assert.equal(server.calls[1].headers.get('authorization'),`Guest ${TOKEN}`);assert.equal(server.calls[1].headers.get('idempotency-key'),'k'.repeat(24));
 assert.ok(server.calls.every(call=>!call.url.includes(TOKEN)));assert.match(storage.getItem('trrc-guest-session'),/t{43}/);assert.ok(progress.some(m=>/step 2 of 3/i.test(m)));
});
test('busy lanes and retry waits sleep until nextStepAt and continue',async()=>{
 const sleeps=[],server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('queued'),replayed:false}),json(409,{error:{code:'LANE_BUSY',message:'busy'}}),json(200,{job:job('retry_wait',{due:false,nextStepAt:'1970-01-01T00:00:45.000Z'})}),json(200,{job:job('succeeded',{result:lookupResult})})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:memoryStorage(),sleep:async ms=>{sleeps.push(ms);},newKey:()=>'k'.repeat(24),now:()=>0});
 await client.lookup({kind:'uic',value:'000020838'});
 assert.deepEqual(sleeps,[5000,45000]);
});
test('expired token clears storage and reports a plain session message',async()=>{
 const storage=memoryStorage();storage.setItem('trrc-guest-session',JSON.stringify({token:TOKEN,expiresAt:'2099-01-01T00:00:00.000Z'}));
 const server=fakeServer([json(401,{error:{code:'TOKEN_EXPIRED',message:'expired'}})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage,sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 await assert.rejects(client.lookup({kind:'uic',value:'000020838'}),error=>error.code==='TOKEN_EXPIRED'&&error.message===guestMessage('TOKEN_EXPIRED'));
 assert.equal(storage.getItem('trrc-guest-session'),null);
});
test('throwing sessionStorage falls back to an in-memory token for the page lifetime',async()=>{
 const broken={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
 const server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:broken,sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 await client.lookup({kind:'uic',value:'000020838'});await client.lookup({kind:'uic',value:'000020838'});
 assert.equal(server.calls.filter(call=>call.url==='/api/guest/session').length,1);
});
test('guest API collects, fetches the archive exactly once and hands the package to the app',async()=>{
 const pins={artifactId:'rrc-guest-1',manifestSha256:'m'.repeat(64),normalizedSha256:'n'.repeat(64),classification:'public_reported'};
 const collection={kind:'collection',artifactId:'rrc-guest-1',pins,runId:'33333333-3333-3333-3333-333333333333',scope:{monthly_returned:3},realHistoryStatus:'verified_bounded_linkage'};
 const tar=new Uint8Array([1,2,3]).buffer;
 const server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false}),json(202,{job:{...job('queued'),jobId:CJOB,kind:'collection'},replayed:false}),json(200,{job:{...job('succeeded',{result:collection}),jobId:CJOB,kind:'collection',runId:collection.runId}}),json(200,{runId:collection.runId,events:[]}),new Response(tar,{status:200,headers:{'content-type':'application/x-tar'}})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:memoryStorage(),sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 const packages=[];const api=createGuestCollectionApi({client,onGuestPackage:p=>packages.push(p)});
 const lookup=await api.lookup({kind:'uic',value:'000020838'});assert.equal(lookup.ok,true);
 const outcome=await api.collect({lookupId:'L-1',sourceRecordKey:'k1',startMonth:'2024-01',endMonth:'2024-03'});
 assert.equal(outcome.ok,true);assert.equal(outcome.result.artifactId,'rrc-guest-1');assert.equal(outcome.result.run.runId,collection.runId);
 assert.deepEqual(JSON.parse(server.calls[2].body),{lookupJobId:JOB,sourceRecordKey:'k1',startMonth:'2024-01',endMonth:'2024-03'});
 assert.equal(server.calls.filter(call=>call.url.endsWith('/archive')).length,1);assert.equal(packages[0].artifactId,'rrc-guest-1');assert.equal(packages[0].tarBytes.byteLength,3);
 await client.archive(CJOB);assert.equal(server.calls.filter(call=>call.url.endsWith('/archive')).length,1);
});
test('every guest code has one plain message; unknown and disabled routes read as temporarily unavailable',()=>{
 for(const code of ['QUOTA_EXCEEDED','TOKEN_QUOTA','STORAGE_QUOTA','DATABASE_QUOTA','EGRESS_QUOTA','DOWNLOAD_QUOTA'])assert.match(guestMessage(code),/demo limit reached/i);
 assert.match(guestMessage('BUDGET_UNVERIFIED'),/paused/i);assert.match(guestMessage('EVIDENCE_EXPIRED'),/expired/i);
 assert.match(guestMessage('NOT_FOUND'),/temporarily unavailable/i);assert.match(guestMessage('WHATEVER'),/temporarily unavailable/i);
});
test('non-guest errors never reach the screens as raw text; the custom lookup message stays',async()=>{
 const collection={kind:'collection',artifactId:'rrc-guest-1',pins:{artifactId:'rrc-guest-1'},runId:null,scope:{monthly_returned:0},realHistoryStatus:'incomplete'};
 const server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false}),json(202,{job:{...job('succeeded',{result:collection}),jobId:CJOB,kind:'collection'},replayed:false}),new Response(new Uint8Array([1]).buffer,{status:200})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:memoryStorage(),sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 const api=createGuestCollectionApi({client,onGuestPackage:()=>{throw TypeError('secret-ish text');}});
 const early=await api.collect({lookupId:'L-1',sourceRecordKey:'k1',startMonth:'2024-01',endMonth:'2024-01'});assert.equal(early.error.code,'LOOKUP_UNAVAILABLE');assert.equal(early.error.message,'Look up the well again before collecting.');
 await api.lookup({kind:'uic',value:'000020838'});
 const outcome=await api.collect({lookupId:'L-1',sourceRecordKey:'k1',startMonth:'2024-01',endMonth:'2024-01'});
 assert.equal(outcome.ok,false);assert.deepEqual(outcome.result,{});assert.equal(outcome.error.message,guestMessage('GUEST_UNAVAILABLE'));assert.ok(!JSON.stringify(outcome).includes('secret-ish'));
 const raw=await createGuestCollectionApi({client:{lookup:async()=>{throw SyntaxError('Unexpected token < in JSON');}}}).lookup({kind:'uic',value:'000020838'});
 assert.equal(raw.error.message,guestMessage('GUEST_UNAVAILABLE'));assert.doesNotMatch(raw.error.message,/Unexpected token/);
});
test('an expired terminal job rejects as expired evidence unless it names a more specific code',async()=>{
 const client=createGuestClient({fetchImpl:fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('queued'),replayed:false}),json(200,{job:job('expired')})]).fetchImpl,storage:memoryStorage(),sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 await assert.rejects(client.lookup({kind:'uic',value:'000020838'}),error=>error.code==='EVIDENCE_EXPIRED'&&error.message===guestMessage('EVIDENCE_EXPIRED'));
 const specific=createGuestClient({fetchImpl:fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('expired',{errorCode:'STORAGE_QUOTA'}),replayed:false})]).fetchImpl,storage:memoryStorage(),sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 await assert.rejects(specific.lookup({kind:'uic',value:'000020838'}),error=>error.code==='STORAGE_QUOTA');
});
