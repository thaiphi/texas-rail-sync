// ZC-05 Task 3: the Explorer server's telemetry wiring. One collect = one trace with matching logs and
// metrics; the response is never delayed or changed by telemetry. Fixture network only; no real RRC call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createExplorerServer,serverTelemetry} from '../scripts/serve.mjs';
import {createTelemetry,telemetryFromEnv} from '../scripts/telemetry.mjs';
import {fixtureNetwork,FIXTURE_LOOKUP,FIXTURE_MONTHS} from '../scripts/fixture-network.mjs';
const root=new URL('../',import.meta.url),rootPath=fileURLToPath(root);
const pinnedId=JSON.parse(await readFile(new URL('public/artifact-integrity.json',root))).artifactId;

const capture=()=>{
 const calls=[];
 const fetchImpl=(url,init)=>{calls.push({url,text:init.body,body:JSON.parse(init.body)});return Promise.resolve({ok:true,status:200});};
 return {calls,fetchImpl};
};
const attrs=list=>Object.fromEntries((list??[]).map(({key,value})=>[key,value.stringValue??(value.intValue!==undefined?Number(value.intValue):undefined)??value.boolValue??value.doubleValue]));
const spansOf=calls=>calls.filter(c=>c.url.endsWith('/v1/traces')).flatMap(c=>c.body.resourceSpans.flatMap(r=>r.scopeSpans.flatMap(s=>s.spans)));
const logsOf=calls=>calls.filter(c=>c.url.endsWith('/v1/logs')).flatMap(c=>c.body.resourceLogs.flatMap(r=>r.scopeLogs.flatMap(s=>s.logRecords)));
// Sums are cumulative: the last export carrying a series holds its value.
function metricValue(calls,name,labels){
 let value;
 for(const c of calls.filter(c=>c.url.endsWith('/v1/metrics')))for(const rm of c.body.resourceMetrics)for(const sm of rm.scopeMetrics)for(const m of sm.metrics){
  if(m.name!==name)continue;
  for(const point of (m.sum??m.histogram).dataPoints){const a=attrs(point.attributes);if(Object.entries(labels).every(([k,v])=>a[k]===v)&&Object.keys(a).length===Object.keys(labels).length)value=Number(point.asInt??point.count);}
 }
 return value;
}

async function setup(t,{fetchImpl=fixtureNetwork(),telemetry,outputRoot,appToken=null}={}){
 await mkdir(new URL('tmp/',root),{recursive:true});
 const dir=await mkdtemp(resolve(rootPath,'tmp','telemetry-server-'));
 const server=createExplorerServer({runRoot:resolve(dir,'runs'),lookupRoot:resolve(dir,'lookups'),sourceRoot:resolve(dir,'sources'),outputRoot:outputRoot??resolve(dir,'artifacts'),fetchImpl,testFixture:true,appToken,...(telemetry===undefined?{}:{telemetry})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
 return {base,post};
}
async function lookupAndCollect(env,extra={}){
 const lookup=await env.post('/api/lookup',FIXTURE_LOOKUP);assert.equal(lookup.status,200);
 const found=await lookup.json();
 const response=await env.post('/api/collect',{lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey,...FIXTURE_MONTHS,...extra});
 return {found,response,body:await response.json()};
}
const telemetryWith=(fetchImpl,extra={})=>createTelemetry({endpoint:'http://collector.test:4318',serviceVersion:'test',environment:'test',fetchImpl,warn:()=>{},...extra});

test('one trace per collect',async t=>{
 const cap=capture(),telemetry=telemetryWith(cap.fetchImpl);
 const env=await setup(t,{telemetry});
 const {response,body}=await lookupAndCollect(env);
 assert.equal(response.status,201);
 await telemetry.shutdown();
 const spans=spansOf(cap.calls),byName=name=>spans.filter(s=>s.name===name);
 for(const name of ['collect','load','normalize-qc','export'])assert.equal(byName(name).length,1,name);
 const [rootSpan]=byName('collect'),traceId=rootSpan.traceId;
 for(const name of ['load','normalize-qc','export']){const [s]=byName(name);assert.equal(s.traceId,traceId,name);assert.equal(s.parentSpanId,rootSpan.spanId,name);assert.equal(attrs(s.attributes).stage,name);assert.equal(attrs(s.attributes).outcome,'succeeded');}
 const rootAttrs=attrs(rootSpan.attributes);
 assert.equal(rootSpan.kind,2);assert.equal(rootAttrs['http.route'],'/api/collect');assert.equal(rootAttrs.outcome,'succeeded');
 assert.equal(rootAttrs['run.id'],body.run.runId);assert.equal(rootAttrs['http.response.status_code'],201);assert.equal(rootAttrs.test_fixture,true);
 const [load]=byName('load'),fetches=spans.filter(s=>s.name==='source.fetch'&&s.parentSpanId===load.spanId);
 assert.ok(fetches.length>=1);
 for(const s of fetches){const a=attrs(s.attributes);assert.equal(s.traceId,traceId);assert.equal(typeof a['source.name'],'string');assert.equal(typeof a['server.address'],'string');assert.equal(a.outcome,'succeeded');assert.equal(a.app_token_used,false);assert.ok(!('error.code' in a));}
 // load runs from its recorded start to its terminal event and encloses its fetches.
 assert.ok(BigInt(load.startTimeUnixNano)<=BigInt(fetches[0].startTimeUnixNano));
 const logs=logsOf(cap.calls),finished=logs.filter(l=>l.body.stringValue==='run finished');
 assert.equal(finished.length,1);assert.equal(finished[0].traceId,traceId);
 const fa=attrs(finished[0].attributes);assert.equal(fa['run.id'],body.run.runId);assert.equal(fa.outcome,'succeeded');assert.equal(fa.stage,'none');assert.equal(fa['error.code'],'none');
 assert.ok(logs.some(l=>l.body.stringValue==='collect started'&&l.traceId===traceId));
 assert.equal(logs.filter(l=>l.body.stringValue==='stage succeeded'&&l.traceId===traceId).length,3);
 assert.equal(metricValue(cap.calls,'rrc_collect_runs',{outcome:'succeeded',stage:'none',error_code:'none'}),1);
 assert.equal(metricValue(cap.calls,'rrc_collect_duration',{outcome:'succeeded'}),1);
 assert.ok(metricValue(cap.calls,'rrc_source_fetch',{source_name:'candidate-monthly.json',outcome:'succeeded'})>=1);
 // The lookup is its own trace.
 const [lookup]=byName('lookup');assert.ok(lookup);assert.notEqual(lookup.traceId,traceId);assert.equal(attrs(lookup.attributes).outcome,'succeeded');
 assert.match(attrs(lookup.attributes)['lookup.id'],/^[a-f0-9-]{36}$/);
 assert.ok(spans.some(s=>s.name==='source.fetch'&&s.parentSpanId===lookup.spanId));
 assert.ok(logs.some(l=>l.body.stringValue==='lookup finished'&&l.traceId===lookup.traceId));
});

test('failed collect',async t=>{
 const cap=capture(),telemetry=telemetryWith(cap.fetchImpl);
 const env=await setup(t,{telemetry,fetchImpl:fixtureNetwork({fail:'qq2j-f2zm'})});
 const {response,body}=await lookupAndCollect(env);
 assert.equal(response.status,502);
 await telemetry.shutdown();
 const spans=spansOf(cap.calls),[rootSpan]=spans.filter(s=>s.name==='collect');
 assert.equal(attrs(rootSpan.attributes).outcome,'failed');assert.equal(rootSpan.status.code,2);assert.equal(attrs(rootSpan.attributes)['http.response.status_code'],502);
 assert.equal(attrs(rootSpan.attributes)['run.id'],body.run.runId);
 const [load]=spans.filter(s=>s.name==='load');
 assert.equal(load.status.code,2);assert.equal(attrs(load.attributes)['error.code'],'HTTP_ERROR');assert.equal(load.traceId,rootSpan.traceId);
 const failedFetch=spans.filter(s=>s.name==='source.fetch'&&s.parentSpanId===load.spanId&&attrs(s.attributes).outcome==='failed');
 assert.ok(failedFetch.length>=1);assert.equal(attrs(failedFetch[0].attributes)['error.code'],'HTTP_ERROR');assert.equal(attrs(failedFetch[0].attributes)['http.response.status_code'],503);
 assert.equal(spans.filter(s=>['normalize-qc','export'].includes(s.name)).length,0);
 assert.equal(metricValue(cap.calls,'rrc_collect_runs',{outcome:'failed',stage:'load',error_code:'HTTP_ERROR'}),1);
 const logs=logsOf(cap.calls);
 const stageFailed=logs.find(l=>l.body.stringValue==='stage failed');assert.equal(stageFailed.severityText,'ERROR');assert.equal(stageFailed.traceId,rootSpan.traceId);
 const fa=attrs(logs.find(l=>l.body.stringValue==='run finished').attributes);assert.equal(fa.outcome,'failed');assert.equal(fa.stage,'load');assert.equal(fa['error.code'],'HTTP_ERROR');
});

test('rejected collect',async t=>{
 const cap=capture(),telemetry=telemetryWith(cap.fetchImpl);
 const env=await setup(t,{telemetry});
 const {response}=await lookupAndCollect(env,{queryVersion:4});
 assert.equal(response.status,400);
 await telemetry.shutdown();
 const spans=spansOf(cap.calls),roots=spans.filter(s=>s.name==='collect');
 assert.equal(roots.length,1);assert.equal(attrs(roots[0].attributes).outcome,'rejected');assert.equal(attrs(roots[0].attributes)['error.code'],'REQUEST_INVALID');
 assert.equal(spans.filter(s=>s.traceId===roots[0].traceId).length,1,'no orphan load span');
 assert.equal(metricValue(cap.calls,'rrc_collect_runs',{outcome:'rejected',stage:'request',error_code:'REQUEST_INVALID'}),1);
 assert.equal(metricValue(cap.calls,'rrc_collect_runs',{outcome:'failed',stage:'request',error_code:'REQUEST_INVALID'}),undefined);
});

test('collector down',async t=>{
 const unhandled=[],onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 t.after(()=>process.off('unhandledRejection',onUnhandled));
 const warnings=[],telemetry=createTelemetry({endpoint:'http://127.0.0.1:1',warn:w=>warnings.push(w)});
 const env=await setup(t,{telemetry});
 const {response}=await lookupAndCollect(env);
 assert.equal(response.status,201);
 await telemetry.shutdown();
 assert.ok(warnings.length<=1,String(warnings.length));
 assert.deepEqual(unhandled,[]);
});

test('collector hangs',async t=>{
 const telemetry=telemetryWith(()=>new Promise(()=>{}));
 const env=await setup(t,{telemetry});
 const started=Date.now();
 const {response}=await lookupAndCollect(env);
 assert.equal(response.status,201);
 assert.ok(Date.now()-started<5000,`took ${Date.now()-started} ms`);
 await telemetry.shutdown();
});

test('no telemetry, no change',async t=>{
 const plain=await setup(t),traced=await setup(t,{telemetry:telemetryWith(capture().fetchImpl)});
 for(const env of [plain,traced]){
  const {response,body}=await lookupAndCollect(env);
  assert.equal(response.status,201);assert.deepEqual(Object.keys(body),['artifactId','version','run','scope','realHistoryStatus']);
  const lookup=await (await env.post('/api/lookup',FIXTURE_LOOKUP)).json();
  const rejected=await env.post('/api/collect',{lookupId:lookup.lookupId,sourceRecordKey:'x',...FIXTURE_MONTHS,extra:1});
  assert.equal(rejected.status,400);assert.deepEqual(Object.keys(await rejected.json()),['error']);
 }
});

test('download is traced without the artifact id',async t=>{
 const cap=capture(),telemetry=telemetryWith(cap.fetchImpl);
 const repoArtifacts=await setup(t,{telemetry,outputRoot:resolve(rootPath,'artifacts')}),temp=await setup(t,{telemetry});
 const statuses=[];
 for(const env of [repoArtifacts,temp]){const response=await fetch(`${env.base}/api/versions/${pinnedId}/download`);await response.arrayBuffer();statuses.push(response.status);}
 assert.deepEqual(statuses,[200,404],"the published pinned version downloads; a temp outputRoot has none");
 await telemetry.shutdown();
 const spans=spansOf(cap.calls).filter(s=>s.name==='handoff.package');
 assert.equal(spans.length,2);
 spans.forEach((span,i)=>{
  const a=attrs(span.attributes);
  assert.equal(span.kind,2);assert.equal(a['http.route'],'/api/versions/{id}/download');
  assert.equal(a.outcome,statuses[i]===200?'succeeded':'failed');assert.equal(a['http.response.status_code'],statuses[i]);
  assert.ok(!JSON.stringify(span).includes(pinnedId));
 });
 const outcomes=statuses.map(status=>status===200?'succeeded':'failed');
 for(const outcome of new Set(outcomes))assert.equal(metricValue(cap.calls,'rrc_handoff_packages',{outcome}),outcomes.filter(o=>o===outcome).length);
 assert.equal(logsOf(cap.calls).filter(l=>l.body.stringValue==='package served').length,2);
 for(const call of cap.calls)assert.ok(!call.text.includes(pinnedId));
});

test('index refresh is a child of the collect root, sent in its own export',async t=>{
 const cap=capture(),telemetry=telemetryWith(cap.fetchImpl);
 let synced;const settled=new Promise(r=>synced=r);
 const runIndex={sync:async()=>{setImmediate(synced);},status:async()=>({status:'ok'})};
 await mkdir(new URL('tmp/',root),{recursive:true});
 const dir=await mkdtemp(resolve(rootPath,'tmp','telemetry-index-'));
 const server=createExplorerServer({runRoot:resolve(dir,'runs'),lookupRoot:resolve(dir,'lookups'),sourceRoot:resolve(dir,'sources'),outputRoot:resolve(dir,'artifacts'),fetchImpl:fixtureNetwork(),testFixture:true,runIndex,telemetry});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const {response}=await lookupAndCollect({post:(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)})});
 assert.equal(response.status,201);
 await settled;await new Promise(r=>setImmediate(r));
 const spans=spansOf(cap.calls),[rootSpan]=spans.filter(s=>s.name==='collect'),[refresh]=spans.filter(s=>s.name==='index.refresh');
 assert.ok(refresh,'index.refresh exported before shutdown');
 assert.equal(refresh.traceId,rootSpan.traceId);assert.equal(refresh.parentSpanId,rootSpan.spanId);assert.equal(attrs(refresh.attributes).outcome,'succeeded');
 await telemetry.shutdown();
});

test('production off path hands the server null',async()=>{
 const off=telemetryFromEnv({});
 assert.equal(off.enabled,false);assert.equal(serverTelemetry(off),null);
 assert.equal(serverTelemetry(null),null);assert.equal(serverTelemetry(undefined),null);
 const on=telemetryWith(capture().fetchImpl);
 assert.equal(serverTelemetry(on),on);
 await on.shutdown();
});

test('a HEAD download does not count as a handoff package',async t=>{
 const cap=capture(),telemetry=telemetryWith(cap.fetchImpl);
 const env=await setup(t,{telemetry,outputRoot:resolve(rootPath,'artifacts')});
 const head=await fetch(`${env.base}/api/versions/${pinnedId}/download`,{method:'HEAD'});
 assert.equal(head.status,200);
 const get=await fetch(`${env.base}/api/versions/${pinnedId}/download`);await get.arrayBuffer();
 assert.equal(get.status,200);
 await telemetry.shutdown();
 assert.equal(metricValue(cap.calls,'rrc_handoff_packages',{outcome:'succeeded'}),1,'only the GET counts');
 assert.equal(spansOf(cap.calls).filter(s=>s.name==='handoff.package').length,1);
 assert.equal(logsOf(cap.calls).filter(l=>l.body.stringValue==='package served').length,1);
});
