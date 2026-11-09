// ZC-05 Task 2: OTLP/HTTP JSON sender (scripts/telemetry.mjs). Built-ins only; every fetch is injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelemetry,telemetryFromEnv} from '../scripts/telemetry.mjs';

const capture=()=>{
 const calls=[];
 const fetchImpl=(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return Promise.resolve({ok:true,status:200});};
 return {calls,fetchImpl};
};
const clock=(start=1_700_000_000_000)=>{let t=start;return ()=>t++;};
const attrs=list=>Object.fromEntries((list??[]).map(({key,value})=>[key,value.stringValue??value.intValue??value.boolValue??value.doubleValue]));
const make=(extra={})=>{const c=capture();const tel=createTelemetry({endpoint:'http://c:4318',serviceVersion:'v1',environment:'test',fetchImpl:c.fetchImpl,now:clock(),warn:()=>{},...extra});return {...c,tel};};
const HEX32=/^[0-9a-f]{32}$/,HEX16=/^[0-9a-f]{16}$/,NANO=/^\d+$/;

test('disabled without endpoint',async()=>{
 let fetched=0;const fetchImpl=()=>{fetched++;return Promise.resolve({ok:true});};
 for(const endpoint of ['',undefined,null,'   ']){
  const tel=createTelemetry({endpoint,fetchImpl,now:()=>{throw Error('no-op must not read the clock');}});
  assert.equal(tel.enabled,false);
  const span=tel.startSpan('collect',{attributes:{'run.id':'r'}});
  for(const key of ['traceId','spanId','setAttributes','setStartTime','end'])assert.ok(key in span,key);
  span.setAttributes({stage:'load'});span.setStartTime(1);
  const child=tel.startSpan('load',{parent:span});child.end({outcome:'failed'});span.end();span.end();
  tel.log(span,{severity:'ERROR',body:'collect failed'});tel.log(null,{body:'x'});
  tel.sendTrace(span.traceId);tel.count('rrc_collect_runs',{outcome:'failed'});tel.observe('rrc_collect_duration',{},1);
  await tel.flushMetrics();await tel.shutdown();
 }
 assert.equal(fetched,0);
});

test('trace export shape',()=>{
 const {calls,tel}=make();
 const root=tel.startSpan('POST /api/collect',{kind:'server',attributes:{'run.id':'r1','http.route':'/api/collect'}});
 const child=tel.startSpan('load',{parent:root,attributes:{stage:'load'}});
 child.end({outcome:'failed',attributes:{'error.code':'HTTP_ERROR'}});
 root.end({outcome:'failed'});
 tel.sendTrace(root.traceId);
 assert.equal(calls.length,1);
 const [{url,init,body}]=calls;
 assert.equal(url,'http://c:4318/v1/traces');
 assert.equal(init.method,'POST');assert.equal(init.headers['content-type'],'application/json');assert.ok(init.signal instanceof AbortSignal);
 const resource=attrs(body.resourceSpans[0].resource.attributes);
 assert.equal(resource['service.name'],'explorer');assert.equal(resource['service.version'],'v1');assert.equal(resource['deployment.environment.name'],'test');
 const scope=body.resourceSpans[0].scopeSpans[0];assert.deepEqual(scope.scope,{name:'explorer'});
 const spans=scope.spans;assert.equal(spans.length,2);
 const r=spans.find(s=>s.name==='POST /api/collect'),c=spans.find(s=>s.name==='load');
 assert.match(r.traceId,HEX32);assert.equal(c.traceId,r.traceId);
 assert.match(r.spanId,HEX16);assert.match(c.spanId,HEX16);assert.notEqual(c.spanId,r.spanId);
 assert.equal(c.parentSpanId,r.spanId);assert.ok(!r.parentSpanId);
 assert.equal(r.kind,2);assert.equal(c.kind,1);
 for(const s of spans){assert.match(s.startTimeUnixNano,NANO);assert.match(s.endTimeUnixNano,NANO);assert.ok(BigInt(s.endTimeUnixNano)>=BigInt(s.startTimeUnixNano));}
 assert.equal(c.status.code,2);assert.equal(r.status.code,2);
 assert.equal(attrs(c.attributes)['error.code'],'HTTP_ERROR');assert.equal(attrs(c.attributes).outcome,'failed');
 // sent spans are cleared
 tel.sendTrace(root.traceId);assert.equal(calls.length,1);
});

test('succeeded span gets status 1, rejected gets 2, end is idempotent',()=>{
 const {calls,tel}=make();
 const ok=tel.startSpan('a');ok.end();ok.end({outcome:'failed'});
 const rej=tel.startSpan('b');rej.end({outcome:'rejected'});
 tel.sendTrace(ok.traceId);tel.sendTrace(rej.traceId);
 const spans=calls.flatMap(c=>c.body.resourceSpans[0].scopeSpans[0].spans);
 assert.equal(spans.length,2);
 assert.equal(spans.find(s=>s.name==='a').status.code,1);assert.equal(attrs(spans.find(s=>s.name==='a').attributes).outcome,'succeeded');
 assert.equal(spans.find(s=>s.name==='b').status.code,2);
});

test('explicit startMs/endMs and setStartTime before end',()=>{
 const {calls,tel}=make();
 const span=tel.startSpan('load',{startMs:1000});
 span.setStartTime(2500);
 span.end({endMs:4000});
 span.setStartTime(9999);// after end: ignored
 tel.sendTrace(span.traceId);
 const [s]=calls[0].body.resourceSpans[0].scopeSpans[0].spans;
 assert.equal(s.startTimeUnixNano,'2500000000');assert.equal(s.endTimeUnixNano,'4000000000');
});

test('unended spans stay buffered until ended',()=>{
 const {calls,tel}=make();
 const root=tel.startSpan('root');const child=tel.startSpan('child',{parent:root});
 child.end();tel.sendTrace(root.traceId);
 assert.deepEqual(calls[0].body.resourceSpans[0].scopeSpans[0].spans.map(s=>s.name),['child']);
 root.end();tel.sendTrace(root.traceId);
 assert.deepEqual(calls[1].body.resourceSpans[0].scopeSpans[0].spans.map(s=>s.name),['root']);
});

test('logs carry trace and span id',()=>{
 const {calls,tel}=make();
 const span=tel.startSpan('load');
 tel.log(span,{severity:'ERROR',body:'collect failed',attributes:{'error.code':'HTTP_ERROR',uic:'000020838'}});
 span.end({outcome:'failed'});tel.sendTrace(span.traceId);
 const logCall=calls.find(c=>c.url==='http://c:4318/v1/logs');assert.ok(logCall);
 assert.equal(calls.length,2);
 const rl=logCall.body.resourceLogs[0];
 assert.equal(attrs(rl.resource.attributes)['service.name'],'explorer');
 const [record]=rl.scopeLogs[0].logRecords;
 assert.equal(record.traceId,span.traceId);assert.equal(record.spanId,span.spanId);
 assert.equal(record.severityText,'ERROR');assert.equal(record.severityNumber,17);
 assert.deepEqual(record.body,{stringValue:'collect failed'});
 assert.match(record.timeUnixNano,NANO);
 assert.deepEqual(attrs(record.attributes),{'error.code':'HTTP_ERROR'});
});

test('log severities and a span-less log is sent on its own',()=>{
 const {calls,tel}=make();
 tel.log(null,{body:'started'});tel.log(null,{severity:'WARN',body:'slow'});
 const records=calls.filter(c=>c.url.endsWith('/v1/logs')).flatMap(c=>c.body.resourceLogs[0].scopeLogs[0].logRecords);
 assert.deepEqual(records.map(r=>[r.severityText,r.severityNumber]),[['INFO',9],['WARN',13]]);
 for(const r of records){assert.ok(!r.traceId);assert.ok(!r.spanId);}
});

test('attribute allowlist',()=>{
 const {calls,tel}=make();
 const span=tel.startSpan('x',{attributes:{'run.id':'r','url':'https://x?y','artifactId':'a'}});
 span.setAttributes({'$where':'uic_no=1','row.count':3,'app_token_used':false,'test_fixture':true});
 span.end({attributes:{'http.request.header.x':'secret'}});
 tel.sendTrace(span.traceId);
 const [s]=calls[0].body.resourceSpans[0].scopeSpans[0].spans;
 const keys=s.attributes.map(a=>a.key).sort();
 assert.deepEqual(keys,['app_token_used','outcome','row.count','run.id','test_fixture']);
 const byKey=Object.fromEntries(s.attributes.map(a=>[a.key,a.value]));
 assert.deepEqual(byKey['row.count'],{intValue:'3'});assert.deepEqual(byKey.app_token_used,{boolValue:false});assert.deepEqual(byKey['run.id'],{stringValue:'r'});
});

test('only run.id survives the brief allowlist example',()=>{
 const {calls,tel}=make();
 const span=tel.startSpan('x',{attributes:{'run.id':'r','url':'https://x?y','artifactId':'a'}});
 let seen=null;span.end();tel.sendTrace(span.traceId);
 seen=calls[0].body.resourceSpans[0].scopeSpans[0].spans[0].attributes.filter(a=>a.key!=='outcome').map(a=>a.key);
 assert.deepEqual(seen,['run.id']);
});

const sumPoints=(call,name)=>call.body.resourceMetrics[0].scopeMetrics[0].metrics.find(m=>m.name===name);

test('metric labels allowlist and cumulative sums',async()=>{
 const {calls,tel}=make();
 tel.count('rrc_collect_runs',{outcome:'failed',stage:'load',error_code:'HTTP_ERROR',uic:'1'});
 tel.count('rrc_collect_runs',{outcome:'failed',stage:'load',error_code:'HTTP_ERROR',uic:'1'});
 await tel.flushMetrics();
 assert.equal(calls.length,1);assert.equal(calls[0].url,'http://c:4318/v1/metrics');
 assert.equal(attrs(calls[0].body.resourceMetrics[0].resource.attributes)['service.name'],'explorer');
 const metric=sumPoints(calls[0],'rrc_collect_runs');
 assert.equal(metric.sum.isMonotonic,true);assert.equal(metric.sum.aggregationTemporality,2);
 assert.equal(metric.sum.dataPoints.length,1);
 const [dp]=metric.sum.dataPoints;
 assert.equal(dp.asInt,'2');
 assert.deepEqual(attrs(dp.attributes),{error_code:'HTTP_ERROR',outcome:'failed',stage:'load'});
 assert.match(dp.startTimeUnixNano,NANO);assert.match(dp.timeUnixNano,NANO);
 await tel.flushMetrics();
 const again=sumPoints(calls[1],'rrc_collect_runs').sum.dataPoints[0];
 assert.equal(again.asInt,'2');assert.equal(again.startTimeUnixNano,dp.startTimeUnixNano);
});

test('distinct label sets are distinct series',async()=>{
 const {calls,tel}=make();
 tel.count('rrc_source_fetch',{outcome:'succeeded',source_name:'uic'});
 tel.count('rrc_source_fetch',{source_name:'uic',outcome:'succeeded'},2);
 tel.count('rrc_source_fetch',{outcome:'throttled',source_name:'uic'});
 await tel.flushMetrics();
 const points=sumPoints(calls[0],'rrc_source_fetch').sum.dataPoints;
 assert.deepEqual(points.map(p=>[attrs(p.attributes).outcome,p.asInt]).sort(),[['succeeded','3'],['throttled','1']]);
});

test('histogram',async()=>{
 const {calls,tel}=make();
 tel.observe('rrc_collect_duration',{outcome:'succeeded'},1.5);
 await tel.flushMetrics();
 const metric=sumPoints(calls[0],'rrc_collect_duration');
 assert.equal(metric.unit,'s');
 assert.equal(metric.histogram.aggregationTemporality,2);
 const [dp]=metric.histogram.dataPoints;
 assert.deepEqual(dp.explicitBounds,[0.1,0.25,0.5,1,2.5,5,10,30,60,120]);
 assert.equal(dp.bucketCounts.length,dp.explicitBounds.length+1);
 assert.deepEqual(dp.bucketCounts,['0','0','0','0','1','0','0','0','0','0','0']);
 assert.equal(dp.count,'1');assert.equal(dp.sum,1.5);
 assert.deepEqual(attrs(dp.attributes),{outcome:'succeeded'});
 tel.observe('rrc_collect_duration',{outcome:'succeeded'},500);tel.observe('rrc_collect_duration',{outcome:'succeeded'},0.1);
 await tel.flushMetrics();
 const dp2=sumPoints(calls[1],'rrc_collect_duration').histogram.dataPoints[0];
 assert.deepEqual(dp2.bucketCounts,['1','0','0','0','1','0','0','0','0','0','1']);
 assert.equal(dp2.count,'3');assert.equal(dp2.sum,501.6);
});

test('no metrics send when nothing was recorded',async()=>{
 const {calls,tel}=make();
 await tel.flushMetrics();await tel.shutdown();
 assert.equal(calls.length,0);
});

test('send errors are swallowed and warned once',async()=>{
 const warnings=[];const unhandled=[];const onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 try{
  const tel=createTelemetry({endpoint:'http://c:4318',fetchImpl:()=>Promise.reject(Error('ECONNREFUSED secret detail')),warn:(...a)=>warnings.push(a),now:clock()});
  for(let i=0;i<3;i++){const s=tel.startSpan('x');s.end();tel.sendTrace(s.traceId);}
  tel.count('rrc_collect_runs',{outcome:'succeeded'});
  await tel.flushMetrics();
  await new Promise(done=>setImmediate(done));
  assert.equal(warnings.length,1);
  assert.doesNotMatch(String(warnings[0].join(' ')),/secret detail/);
  const throwing=createTelemetry({endpoint:'http://c:4318',fetchImpl:()=>{throw Error('sync');},warn:(...a)=>warnings.push(a),now:clock()});
  const s=throwing.startSpan('x');s.end();assert.doesNotThrow(()=>throwing.sendTrace(s.traceId));
  throwing.count('rrc_collect_runs');await throwing.flushMetrics();
  assert.equal(warnings.length,2);
  const notOk=createTelemetry({endpoint:'http://c:4318',fetchImpl:()=>Promise.resolve({ok:false,status:400}),warn:(...a)=>warnings.push(a),now:clock()});
  notOk.count('rrc_collect_runs');await notOk.flushMetrics();await notOk.flushMetrics();
  assert.equal(warnings.length,3);
 }finally{process.off('unhandledRejection',onUnhandled);}
 assert.deepEqual(unhandled,[]);
});

test('send does not wait for a hanging collector',()=>{
 let calls=0;
 const tel=createTelemetry({endpoint:'http://c:4318',fetchImpl:()=>{calls++;return new Promise(()=>{});},now:clock(),warn:()=>{}});
 const span=tel.startSpan('x');span.end();
 const result=tel.sendTrace(span.traceId);
 assert.equal(result,undefined);assert.equal(calls,1);
});

test('onRootEnd fires for root spans only',()=>{
 const seen=[];
 const {tel}=make({onRootEnd:info=>seen.push(info)});
 const root=tel.startSpan('POST /api/collect',{attributes:{'run.id':'r','uic':'1'}});
 const child=tel.startSpan('load',{parent:root});
 child.end({outcome:'failed'});
 assert.equal(seen.length,0);
 root.end({outcome:'failed',attributes:{'error.code':'HTTP_ERROR'}});root.end();
 assert.equal(seen.length,1);
 assert.equal(seen[0].name,'POST /api/collect');assert.equal(seen[0].traceId,root.traceId);assert.equal(seen[0].outcome,'failed');
 assert.deepEqual(seen[0].attributes,{'run.id':'r','error.code':'HTTP_ERROR',outcome:'failed'});
});

test('onRootEnd throwing does not break end',()=>{
 const {calls,tel}=make({onRootEnd:()=>{throw Error('boom');}});
 const root=tel.startSpan('r');assert.doesNotThrow(()=>root.end());
 tel.sendTrace(root.traceId);assert.equal(calls.length,1);
});

test('shutdown flushes pending traces and metrics',async()=>{
 const {calls,tel}=make();
 const s=tel.startSpan('x');s.end();tel.count('rrc_handoff_packages',{outcome:'succeeded'});
 await tel.shutdown();
 assert.deepEqual(calls.map(c=>c.url).sort(),['http://c:4318/v1/metrics','http://c:4318/v1/traces']);
});

test('metrics flush on an unref timer',async()=>{
 const {calls,tel}=make({flushIntervalMs:20});
 tel.count('rrc_collect_runs',{outcome:'succeeded'});
 await new Promise(done=>setTimeout(done,80));
 assert.ok(calls.some(c=>c.url.endsWith('/v1/metrics')));
 await tel.shutdown();
 const before=calls.length;await new Promise(done=>setTimeout(done,60));
 assert.equal(calls.length,before,'shutdown clears the timer');
});

test('telemetryFromEnv',()=>{
 assert.equal(telemetryFromEnv({OTEL_EXPORTER_OTLP_ENDPOINT:''}).enabled,false);
 assert.equal(telemetryFromEnv({}).enabled,false);
 const c=capture();
 const tel=telemetryFromEnv({OTEL_EXPORTER_OTLP_ENDPOINT:'http://c:4318/',OTEL_SERVICE_VERSION:'abc',DEPLOYMENT_ENVIRONMENT:'ci'},{fetchImpl:c.fetchImpl});
 assert.equal(tel.enabled,true);
 const s=tel.startSpan('x');s.end();tel.sendTrace(s.traceId);
 assert.equal(c.calls[0].url,'http://c:4318/v1/traces');
 const resource=attrs(c.calls[0].body.resourceSpans[0].resource.attributes);
 assert.equal(resource['service.version'],'abc');assert.equal(resource['deployment.environment.name'],'ci');
 const d=capture();
 const fallback=telemetryFromEnv({OTEL_EXPORTER_OTLP_ENDPOINT:'http://c:4318'},{fetchImpl:d.fetchImpl});
 const f=fallback.startSpan('x');f.end();fallback.sendTrace(f.traceId);
 const fr=attrs(d.calls[0].body.resourceSpans[0].resource.attributes);
 assert.equal(fr['service.version'],'0.1.0');assert.equal(fr['deployment.environment.name'],'local');
});

test('count ignores values that are not safe non-negative integers',async()=>{
 const {calls,tel}=make();
 tel.count('rrc_collect_runs',{outcome:'succeeded'},2);
 for(const bad of [1.5,-1,Number.MAX_SAFE_INTEGER+2,NaN,Infinity,'3'])tel.count('rrc_collect_runs',{outcome:'succeeded'},bad);
 await tel.flushMetrics();
 const [point]=calls[0].body.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints;
 assert.equal(point.asInt,'2');assert.match(point.asInt,/^\d+$/);
});

test('numbers outside the safe integer range export as doubleValue',()=>{
 const {calls,tel}=make();
 const span=tel.startSpan('collect',{attributes:{'row.count':1e21}});
 span.setAttributes({'http.response.status_code':200});span.end();tel.sendTrace(span.traceId);
 const list=calls[0].body.resourceSpans[0].scopeSpans[0].spans[0].attributes;
 const rows=list.find(a=>a.key==='row.count').value;
 assert.deepEqual(rows,{doubleValue:1e21});
 assert.deepEqual(list.find(a=>a.key==='http.response.status_code').value,{intValue:'200'});
});

test('a successful export releases the response body without unhandled rejections',async t=>{
 const unhandled=[],onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 t.after(()=>process.off('unhandledRejection',onUnhandled));
 let cancelled=0;
 const responses=[
  {ok:true,body:{cancel(){cancelled++;return Promise.resolve();}}},
  {ok:true,body:{cancel(){cancelled++;return Promise.reject(Error('cancel failed'));}}},
  {ok:true,body:{cancel(){cancelled++;throw Error('cancel threw');}}},
  {ok:true,body:null},
 ];
 const warnings=[];let i=0;
 const tel=createTelemetry({endpoint:'http://c:4318',fetchImpl:()=>Promise.resolve(responses[i++]),now:clock(),warn:w=>warnings.push(w)});
 for(let n=0;n<responses.length;n++){const span=tel.startSpan('collect');span.end();tel.sendTrace(span.traceId);}
 await tel.shutdown();
 await new Promise(r=>setImmediate(r));
 assert.equal(cancelled,3);assert.deepEqual(unhandled,[]);assert.deepEqual(warnings,[]);
});

// ZC-06: each process is its own Prometheus series (instance label), so a second failure in another process
// adds a series instead of overwriting the first one's counter.
test('resource carries exactly four keys, with a fresh service.instance.id per telemetry instance',()=>{
 const resourceOf=()=>{const {calls,tel}=make();const s=tel.startSpan('x');s.end();tel.sendTrace(s.traceId);return calls[0].body.resourceSpans[0].resource.attributes;};
 const a=resourceOf(),b=resourceOf();
 assert.deepEqual(a.map(({key})=>key).sort(),['deployment.environment.name','service.instance.id','service.name','service.version']);
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 assert.match(attrs(a)['service.instance.id'],UUID);
 assert.notEqual(attrs(a)['service.instance.id'],attrs(b)['service.instance.id']);
});
