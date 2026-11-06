import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchSource,fetchSourceWithThrottleRetry} from '../src/sourceFetch.mjs';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {performLookup,loadSelection} from '../src/lookup.mjs';
import {boundedScope} from '../src/sources.mjs';
const root=new URL('../',import.meta.url),rootPath=fileURLToPath(root);
const target={name:'probe.json',url:'https://data.texas.gov/resource/givw-z9t4.json?$where=uic_no%3D%27000020838%27'};
const canned=(...responses)=>{let i=0;return async()=>{const next=responses[Math.min(i++,responses.length-1)];return new Response(next.body??'[]',{status:next.status??200,headers:next.headers??{}});};};
const recorder=()=>{const events=[];return {events,observer:event=>events.push(event)};};

test('observer receives one event per fetch attempt',async()=>{
 const {events,observer}=recorder();
 await fetchSource(target,{testFixture:true,fetchImpl:canned({body:'[1]'}),observer});
 assert.equal(events.length,1);const [event]=events;
 assert.equal(event.outcome,'succeeded');assert.equal(event.httpStatus,200);assert.equal(event.code,null);
 assert.equal(event.serverAddress,'data.texas.gov');assert.equal(event.name,target.name);assert.equal(event.appTokenUsed,false);
 assert.equal(typeof event.startMs,'number');assert.ok(event.endMs>=event.startMs);
});
test('observer sees a failed fetch',async()=>{
 const {events,observer}=recorder();
 await assert.rejects(fetchSource(target,{testFixture:true,fetchImpl:canned({status:503,body:'no'}),observer}),{code:'HTTP_ERROR'});
 assert.equal(events.length,1);assert.equal(events[0].outcome,'failed');assert.equal(events[0].httpStatus,503);assert.equal(events[0].code,'HTTP_ERROR');
});
test('observer sees both attempts of a throttle retry',async()=>{
 const {events,observer}=recorder();
 const result=await fetchSourceWithThrottleRetry(target,{testFixture:true,wait:async()=>{},observer,fetchImpl:canned({status:429,headers:{'retry-after':'0'}},{body:'[2]'})});
 assert.equal(result.body.toString(),'[2]');
 assert.deepEqual(events.map(e=>e.outcome),['throttled','succeeded']);
 assert.equal(events[0].httpStatus,429);assert.equal(events[0].code,'SOURCE_THROTTLED');assert.equal(events[1].httpStatus,200);
});
test('a throwing observer changes nothing',async()=>{
 const plain=await fetchSource(target,{testFixture:true,fetchImpl:canned({body:'[3]'})});
 const observed=await fetchSource(target,{testFixture:true,fetchImpl:canned({body:'[3]'}),observer:()=>{throw Error('x');}});
 assert.deepEqual(observed.body,plain.body);
 const strip=({retrieved_at,...rest})=>rest;
 assert.deepEqual(Object.keys(observed.metadata),Object.keys(plain.metadata));
 assert.deepEqual(strip(observed.metadata),strip(plain.metadata));
 await assert.rejects(fetchSource(target,{testFixture:true,fetchImpl:canned({status:503}),observer:()=>{throw Error('x');}}),{code:'HTTP_ERROR'});
});
test('event carries no URL or query',async()=>{
 const {events,observer}=recorder();
 await fetchSource(target,{testFixture:true,fetchImpl:canned({body:'[]'}),observer});
 await fetchSource(target,{testFixture:true,fetchImpl:canned({status:503}),observer}).catch(()=>{});
 assert.equal(events.length,2);
 for(const event of events){const text=JSON.stringify(event);assert.ok(!text.includes('?'),text);assert.ok(!text.includes('$where'),text);assert.ok(!text.includes('givw-z9t4'),text);}
 assert.deepEqual(Object.keys(events[0]).sort(),['appTokenUsed','code','endMs','httpStatus','name','outcome','serverAddress','startMs']);
});

// Fixture network shape copied from test/bounded-collection.test.mjs.
const inventory=JSON.parse(await readFile(new URL('raw/candidate-inventory.json',root))),monthly=JSON.parse(await readFile(new URL('raw/candidate-monthly.json',root)));
const network=({candidates=[inventory[0]],fresh=[inventory[0]],reports=monthly}={})=>async url=>{
 const u=new URL(url),where=u.searchParams.get('$where');
 if(u.pathname.includes('/resource/givw-z9t4'))return new Response(JSON.stringify(where?.startsWith('api_no=')?candidates:fresh));
 if(u.pathname.includes('/resource/qq2j-f2zm'))return new Response(JSON.stringify(reports));
 const name=u.pathname.includes('givw-z9t4')?'inventory-metadata.json':u.pathname.includes('qq2j-f2zm')?'monthly-metadata.json':u.pathname.endsWith('.pdf')?'uic-manual.pdf':u.hostname==='webapps2.rrc.texas.gov'?'uic-query-help.html':'rrc-resources.html';
 return new Response(await readFile(new URL('raw/'+name,root)));
};
async function setup(t){await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(new URL('tmp/observer-',root));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,lookupRoot:resolve(dir,'lookups'),sourceDir:resolve(dir,'raw'),outputRoot:resolve(dir,'artifacts'),runRoot:resolve(dir,'runs'),artifactId:'observer-fixture-v2',testFixture:true};}
async function selected(env,observer){
 const found=await performLookup({request:{kind:'api',value:'38910201'},lookupRoot:env.lookupRoot,testFixture:true,fetchImpl:network(),...(observer?{observer}:{})});
 return loadSelection({lookupRoot:env.lookupRoot,lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey});
}
// Drop run identity, timestamps and per-event IDs; everything else must match.
const VOLATILE=/^(runId|lookupId|id|eventId|stageId|timestamp|retrieved_at|retrievedAt|startedAt|endedAt|.*At)$/;
// Files that embed a retrieval timestamp, runId or lookupId (sidecars, acquisition/selection/lookup
// markers and the manifest/normalized/pins built over them) hash differently per run; their sha256
// is masked. Raw source bodies and inventory.csv keep their hashes and must match exactly.
const VOLATILE_FILE=/(\.source\.json|\/acquisition\.json|\/selection\.json|\/lookup\.json|\/normalized\.json|\/manifest\.json|\/version-pins\.json)$/;
const masked=entry=>typeof entry.path==='string'&&VOLATILE_FILE.test(entry.path)&&'sha256' in entry?{...entry,sha256:'*'}:entry;
// The two runs necessarily use different mkdtemp directories; that path segment is masked.
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(masked(value)).filter(([key])=>!VOLATILE.test(key)).map(([key,v])=>[key,stable(v)])):typeof value==='string'?value.replace(/tmp[\/]observer-[^\/]+/g,'tmp/observer-*'):value;
test('collectPublicSnapshot and performLookup forward observer',async t=>{
 const scope=boundedScope('000020838','2024-01','2026-04');
 const plainEnv=await setup(t),plainSelection=await selected(plainEnv);
 const plain=await collectPublicSnapshot({...plainEnv,scope,selection:plainSelection,fetchImpl:network()});
 const lookupEvents=recorder(),env=await setup(t),selection=await selected(env,lookupEvents.observer);
 assert.equal(lookupEvents.events.length,2,'lookup fetches metadata then candidates');
 assert.ok(lookupEvents.events.every(e=>e.outcome==='succeeded'));
 const {events,observer}=recorder();
 const observed=await collectPublicSnapshot({...env,artifactId:plainEnv.artifactId,scope,selection,fetchImpl:network(),observer});
 const requests=observed.record.events.flatMap(e=>e.evidence?.requests??[]);
 assert.ok(requests.length>0);
 assert.equal(events.length,requests.length,'one event per target');
 assert.deepEqual(events.map(e=>e.name),requests.map(r=>r.name));
 assert.ok(events.every(e=>e.outcome==='succeeded'&&e.httpStatus===200));
 assert.deepEqual(stable(observed.record),stable(plain.record));
});
test('src stays free of telemetry imports',async()=>{
 const files=(await readdir(resolve(rootPath,'src'),{recursive:true})).filter(name=>name.endsWith('.mjs'));
 assert.ok(files.length>0);
 for(const file of files){const text=await readFile(resolve(rootPath,'src',file),'utf8');assert.doesNotMatch(text,/opentelemetry|scripts\/telemetry/,file);}
});
