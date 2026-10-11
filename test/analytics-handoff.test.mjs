import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAnalyticsHandoff, MAX_PACKAGE_BYTES} from '../public/analytics-handoff.js';

const receiverId='22222222-2222-4222-8222-222222222222',otherReceiver='33333333-3333-4333-8333-333333333333';
const pins={artifactId:'rrc-example-v1',classification:'public_reported',defaultPinned:true,manifestSha256:'a'.repeat(64),normalizedSha256:'b'.repeat(64)};
const artifact={artifactId:pins.artifactId,manifest:{artifact_id:pins.artifactId},inventory:[{uic_number:'000000002'},{uic_number:'000000001'},{uic_number:'000000002'}],injectionMonthly:[{uic_number:'000000002',period_start:'2025-03-01'},{uic_number:'000000002',period_start:'2025-01-01'}]};
function setup({response,origin='http://127.0.0.1:4391',blocked=false}={}){
 let tick=0,id=0;const jobs=new Map(),listeners=new Set(),stateWaiters=new Set(),sent=[],opens=[],states=[],fetches=[];const archive=new Uint8Array(1024);archive[0]=88;
 const target={closed:false,postMessage(message,to,transfers){sent.push({message,to,transfers});}};
 const timers={setTimeout(fn,delay){jobs.set(++id,{fn,at:tick+delay});return id;},clearTimeout(i){jobs.delete(i);},setInterval(fn,delay){jobs.set(++id,{fn,at:tick+delay,interval:delay});return id;},clearInterval(i){jobs.delete(i);}};
 const window={location:{origin},crypto:webcrypto,open(url,name){opens.push({url,name});return blocked?null:target;},addEventListener(type,fn){if(type==='message')listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);},...timers};
 const controller=createAnalyticsHandoff({window,cryptoImpl:webcrypto,timers,onState:state=>{states.push(state);for(const notify of [...stateWaiters])notify(state);},fetchImpl:async(url,options)=>{fetches.push({url,options});return response?response(archive):new Response(archive);}});
 const message=(type,fields={},event={})=>{const transferId=controller.state.transferId;for(const fn of [...listeners])fn({origin:'http://127.0.0.1:4290',source:target,data:{channel:'swd-explorer-handoff',version:1,type,transferId,receiverId,...fields},...event});};
 const advance=ms=>{const end=tick+ms;while(true){let selected;for(const [i,job]of jobs)if(job.at<=end&&(!selected||job.at<selected[1].at))selected=[i,job];if(!selected)break;const [i,job]=selected;tick=job.at;if(job.interval)job.at+=job.interval;else jobs.delete(i);job.fn();}tick=end;};
 const waitFor=state=>new Promise((resolve,reject)=>{const matches=value=>typeof state==='function'?state(value):value.state===state;if(matches(controller.state)){resolve(controller.state);return;}const timeout=setTimeout(()=>{stateWaiters.delete(notify);reject(Error(`Timed out waiting for ${state}; actual ${controller.state.state}`));},5000);const notify=value=>{if(matches(value)){clearTimeout(timeout);stateWaiters.delete(notify);resolve(value);}};stateWaiters.add(notify);});
 return {controller,target,archive,sent,states,opens,fetches,message,advance,jobs,listeners,waitFor};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function offered(h){h.controller.start({artifact,pins});h.message('ready');await h.waitFor('waiting');assert.equal(h.sent[0]?.message.type,'offer');}
async function packaged(h){await offered(h);h.message('request-package');assert.equal(h.sent[1]?.message.type,'package');}

test('opens synchronously at fixed origin, offers whole verified version scope and copied TAR bytes',async()=>{
 const h=setup();assert.equal(h.controller.start({artifact,pins}),true);assert.equal(h.opens.length,1);assert.match(h.opens[0].url,/^http:\/\/127\.0\.0\.1:4290\/\?rrcHandoff=[a-f0-9-]{36}#data\/data$/);assert.equal(h.fetches[0].url,'/api/versions/rrc-example-v1/download');
 h.message('ready');await h.waitFor('waiting');const offer=h.sent[0];assert.equal(offer.to,'http://127.0.0.1:4290');assert.equal(offer.message.packageBytes,1024);assert.deepEqual(offer.message.scope,{kind:'whole-version',inventoryUics:['000000001','000000002'],historyUics:['000000002'],periodStart:'2025-01-01',periodEnd:'2025-03-01'});assert.equal(offer.message.hashes.manifestSha256,pins.manifestSha256);assert.equal(offer.message.hashes.packageSha256,Buffer.from(await webcrypto.subtle.digest('SHA-256',h.archive)).toString('hex'));
 h.message('request-package');const delivery=h.sent[1];assert.equal(delivery.message.bytes.byteLength,1024);assert.notEqual(delivery.message.bytes,h.archive.buffer);assert.deepEqual([...new Uint8Array(delivery.message.bytes)],[...h.archive]);assert.deepEqual(delivery.transfers,[delivery.message.bytes]);h.controller.destroy();assert.equal(h.listeners.size,0);assert.equal(h.jobs.size,0);
});
test('rejects invalid origin, pins, identity, fixture provenance and invalid scope before opening',()=>{
 for(const args of [{artifact,pins:{...pins,normalizedSha256:'bad'}},{artifact:{...artifact,artifactId:'other'},pins},{artifact:{...artifact,manifest:{...artifact.manifest,testFixture:true}},pins},{artifact:{...artifact,manifest:{...artifact.manifest,provenance:{classification:'test_fixture'}}},pins},{artifact:{...artifact,inventory:[{uic_number:'../bad'}]},pins},{artifact:{...artifact,injectionMonthly:[{uic_number:'000000002',period_start:'2025-02-30'}]},pins}]){const h=setup();assert.equal(h.controller.start(args),false);assert.equal(h.opens.length,0);assert.equal(h.controller.state.state,'rejected');}
 const h=setup({origin:'http://localhost:4391'});assert.equal(h.controller.start({artifact,pins}),false);assert.equal(h.opens.length,0);
});
test('wrong origin and source are ignored without advancing',async()=>{
 const h=setup();h.controller.start({artifact,pins});for(const event of [{origin:'https://evil.example'},{source:{}}])h.message('ready',{},event);await settle();assert.equal(h.sent.length,0);assert.notEqual(h.controller.state.state,'rejected');h.controller.destroy();
});
test('wrong channel, version, transfer identity and nonobjects from bound window reject',()=>{
 for(const fields of [{channel:'wrong'},{version:2},{transferId:otherReceiver},{transferId:'bad'}]){const h=setup();h.controller.start({artifact,pins});h.message('ready',fields);assert.equal(h.controller.state.code,'INVALID_MESSAGE');assert.equal(h.sent.length,0);}
 for(const data of [null,[],42]){const h=setup();h.controller.start({artifact,pins});h.message('ready',{}, {data});assert.equal(h.controller.state.code,'INVALID_MESSAGE');}
});
test('bound malformed messages reject and first receiver document stays bound',async()=>{
 const h=setup();await offered(h);h.message('ready',{receiverId:otherReceiver});assert.equal(h.controller.state.code,'RECEIVER_CHANGED');assert.equal(h.sent.filter(s=>s.message.type==='offer').length,1);
 const bad=setup();await offered(bad);bad.message('request-package',{extra:'unexpected'});assert.equal(bad.controller.state.code,'INVALID_MESSAGE');assert.equal(bad.sent.some(s=>s.message.type==='package'),false);
});
test('popup blocked is explicit; repeated click and duplicate request never repeat delivery/adoption',async()=>{
 const blocked=setup({blocked:true});assert.equal(blocked.controller.start({artifact,pins}),false);assert.equal(blocked.controller.state.code,'POPUP_BLOCKED');assert.equal(blocked.fetches.length,0);
 const h=setup();await packaged(h);assert.equal(h.controller.start({artifact,pins}),false);h.message('request-package');assert.equal(h.sent.filter(s=>s.message.type==='package').length,1);h.message('status',{state:'validating'});h.message('status',{state:'previewed'});assert.equal(h.controller.state.state,'previewed');h.message('status',{state:'adopted'});h.message('status',{state:'adopted'});assert.equal(h.states.filter(s=>s.state==='adopted').length,1);assert.equal(h.jobs.size,0);
});
test('adoption requires preview and preview is never reported adopted automatically',async()=>{
 const early=setup();await packaged(early);early.message('status',{state:'adopted'});assert.equal(early.controller.state.state,'rejected');
 const h=setup();await packaged(h);h.message('status',{state:'validating'});h.message('status',{state:'previewed'});h.advance(120_000);assert.equal(h.controller.state.state,'previewed');h.controller.cancel();assert.equal(h.controller.state.state,'cancelled');h.message('status',{state:'adopted'});assert.equal(h.controller.state.state,'cancelled');
});
test('ready, package delivery and validation timeouts invalidate transfer and cleanup',async()=>{
 const ready=setup();ready.controller.start({artifact,pins});ready.advance(15_000);assert.equal(ready.controller.state.code,'READY_TIMEOUT');assert.equal(ready.listeners.size,0);
 const delivery=setup();await packaged(delivery);delivery.advance(30_000);assert.equal(delivery.controller.state.code,'DELIVERY_TIMEOUT');
 const validation=setup();await packaged(validation);validation.message('status',{state:'validating'});validation.advance(60_000);assert.equal(validation.controller.state.code,'VALIDATION_TIMEOUT');
});
test('receiver that never requests the offered package times out and releases the session',async()=>{
 const h=setup();await offered(h);h.advance(29_999);assert.equal(h.controller.state.state,'waiting');h.advance(1);assert.equal(h.controller.state.code,'REQUEST_TIMEOUT');assert.equal(h.listeners.size,0);assert.equal(h.jobs.size,0);assert.equal(h.sent.filter(item=>item.message.type==='package').length,0);
 const requested=setup();await packaged(requested);requested.message('status',{state:'validating'});requested.message('status',{state:'previewed'});requested.advance(30_000);assert.equal(requested.controller.state.state,'previewed');requested.controller.destroy();
});
test('closed receiver, cancellation and fresh replacement cannot reuse old transfer',async()=>{
 const h=setup();await offered(h);const old=h.controller.state.transferId;h.target.closed=true;h.advance(500);assert.equal(h.controller.state.code,'TARGET_CLOSED');h.target.closed=false;assert.equal(h.controller.start({artifact,pins}),true);assert.notEqual(h.controller.state.transferId,old);h.message('ready',{transferId:old},{source:{}});assert.equal(h.sent.filter(s=>s.message.type==='offer').length,1);h.controller.cancel();assert.equal(h.jobs.size,0);assert.equal(h.listeners.size,0);
});
test('rejects unavailable, undersize, unaligned, oversized and redirected TAR responses',async()=>{
 for(const response of [()=>new Response('missing',{status:404}),()=>new Response(new Uint8Array(512)),()=>new Response(new Uint8Array(1025)),()=>new Response(new Uint8Array(1024),{headers:{'content-length':String(MAX_PACKAGE_BYTES+512)}}),()=>({ok:true,redirected:true})]){const h=setup({response});h.controller.start({artifact,pins});await h.waitFor('rejected');assert.equal(h.sent.some(s=>s.message.type==='offer'),false);}
});
test('empty actual history has null coverage rather than inferred query dates',async()=>{
 const h=setup();h.controller.start({artifact:{...artifact,injectionMonthly:[],manifest:{...artifact.manifest,scope:{period_start:'2024-01-01',period_end:'2026-01-01'}}},pins});h.message('ready');await h.waitFor('waiting');assert.deepEqual(h.sent[0].message.scope.historyUics,[]);assert.equal(h.sent[0].message.scope.periodStart,null);assert.equal(h.sent[0].message.scope.periodEnd,null);h.controller.destroy();
});
test('streaming cap is enforced before accumulation and pending fetch cannot revive cancellation',async()=>{
 let cancelled=false;const tooBig=setup({response:()=>({ok:true,headers:new Headers(),body:{getReader:()=>({read:async()=>({done:false,value:{byteLength:MAX_PACKAGE_BYTES+1}}),cancel:async()=>{cancelled=true;},releaseLock(){}})}})});tooBig.controller.start({artifact,pins});await tooBig.waitFor('rejected');assert.equal(tooBig.controller.state.code,'PACKAGE_SIZE');assert.equal(cancelled,true);
 let resolveFetch;const pending=setup({response:()=>new Promise(resolve=>{resolveFetch=resolve;})});pending.controller.start({artifact,pins});pending.message('ready');pending.controller.cancel();resolveFetch(new Response(new Uint8Array(1024)));await settle();assert.equal(pending.controller.state.state,'cancelled');assert.equal(pending.sent.some(s=>s.message.type==='offer'),false);assert.equal(pending.fetches[0].options.signal.aborted,true);
});
test('late digest and stale receiver cannot revive or replace a newer transfer',async()=>{
 let resolveDigest,signalDigest;const digestStarted=new Promise(resolve=>{signalDigest=resolve;}),h=setup();h.controller.destroy();const fakeCrypto={randomUUID:()=>webcrypto.randomUUID(),subtle:{digest:()=>new Promise(resolve=>{resolveDigest=resolve;signalDigest();})}};
 const controller=createAnalyticsHandoff({window:{location:{origin:'http://127.0.0.1:4391'},open:()=>h.target,addEventListener(){},removeEventListener(){},...{setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){}}},fetchImpl:async()=>new Response(new Uint8Array(1024)),cryptoImpl:fakeCrypto});
 controller.start({artifact,pins});await Promise.race([digestStarted,new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(Error('Digest did not start')),5000);digestStarted.then(()=>clearTimeout(timeout));})]);controller.cancel();resolveDigest(new Uint8Array(32).buffer);await settle();assert.equal(controller.state.state,'cancelled');assert.equal(h.sent.length,0);
});
test('bound malformed receiver identity and overlong error text reject without displaying supplied content',async()=>{
 for(const fields of [{receiverId:'not-a-uuid'},{state:'rejected',message:'x'.repeat(501)},{state:'rejected',code:'<script>'}]){const h=setup();await packaged(h);h.message('status',fields);assert.equal(h.controller.state.code,'INVALID_MESSAGE');assert.notEqual(h.controller.state.message,fields.message);}
});
test('bound receiver identity and message type require primitive strings without coercion',async()=>{
 for(const receiver of [[receiverId],new String(receiverId)]){const h=setup();h.controller.start({artifact,pins});h.message('ready',{receiverId:receiver});assert.equal(h.controller.state.code,'INVALID_MESSAGE');await settle();assert.equal(h.sent.some(item=>item.message.type==='offer'),false);}
 for(const type of [['ready'],new String('ready')]){const h=setup();h.controller.start({artifact,pins});h.message(type);assert.equal(h.controller.state.code,'INVALID_MESSAGE');}
});
test('array receiver identity after package delivery rejects and clears every pending timer',async()=>{
 const h=setup();await packaged(h);h.message('status',{state:'validating',receiverId:[receiverId]});assert.equal(h.controller.state.code,'INVALID_MESSAGE');assert.equal(h.jobs.size,0);assert.equal(h.listeners.size,0);h.message('status',{state:'previewed'});assert.equal(h.controller.state.state,'rejected');
});
test('scope rejects year zero before opening a receiver or downloading a package',()=>{
 const h=setup();assert.equal(h.controller.start({artifact:{...artifact,injectionMonthly:[{uic_number:'000000002',period_start:'0000-01-01'}]},pins}),false);assert.equal(h.controller.state.code,'INVALID_SCOPE');assert.equal(h.opens.length,0);assert.equal(h.fetches.length,0);
});
test('scope rejects sparse arrays and nonrecord row shapes without fabricating identities',()=>{
 for(const change of [{inventory:new Array(1)},{injectionMonthly:new Array(1)},{inventory:[Object.assign([],{uic_number:'000000002'})]},{injectionMonthly:[Object.assign([],{uic_number:'000000002',period_start:'2025-01-01'})]},{inventory:[Object.assign(new String('record'),{uic_number:'000000002'})]}]){const h=setup();assert.equal(h.controller.start({artifact:{...artifact,...change},pins}),false);assert.equal(h.controller.state.code,'INVALID_SCOPE');assert.equal(h.opens.length,0);assert.equal(h.fetches.length,0);}
});
test('validation deadline is absolute from first progress and cannot be extended by later statuses',async()=>{
 const h=setup();await packaged(h);h.message('status',{state:'receiving'});h.advance(59_000);h.message('status',{state:'validating'});h.advance(999);assert.equal(h.controller.state.state,'validating');h.advance(1);assert.equal(h.controller.state.code,'VALIDATION_TIMEOUT');assert.equal(h.jobs.size,0);assert.equal(h.listeners.size,0);h.message('status',{state:'previewed'});assert.equal(h.controller.state.state,'rejected');
});
test('nonbyte stream chunks reject instead of becoming substituted zero package bytes',async()=>{
 for(const chunk of [new ArrayBuffer(1024),new Uint16Array(512)]){let read=false,cancelled=false;const h=setup({response:()=>({ok:true,headers:new Headers(),body:{getReader:()=>({read:async()=>read?{done:true}:(read=true,{done:false,value:chunk}),cancel:async()=>{cancelled=true;},releaseLock(){}})}})});h.controller.start({artifact,pins});h.message('ready');await h.waitFor(state=>state.state==='waiting'||state.state==='rejected');assert.equal(h.controller.state.code,'PACKAGE_INVALID');assert.equal(h.sent.some(item=>item.message.type==='offer'),false);assert.equal(cancelled,true);assert.equal(h.jobs.size,0);}
});
