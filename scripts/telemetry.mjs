// ZC-05: minimal OTLP/HTTP JSON sender (traces, logs, metrics) built on Node built-ins only.
// Telemetry is a no-op unless an endpoint is configured. It never throws into callers, never awaits a
// collector on a request path, drops every attribute/label outside the allowlists and warns once per instance.
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';

const SPAN_ATTRIBUTE_KEYS=new Set(['run.id','lookup.id','transfer.id','stage','outcome','error.code','source.name','server.address',
 'row.count','test_fixture','app_token_used','http.route','http.response.status_code']);
const METRIC_LABEL_KEYS=new Set(['stage','outcome','error_code','source_name']);
const SEVERITY={INFO:9,WARN:13,ERROR:17};
const FAILED_OUTCOMES=new Set(['failed','rejected']);
const INSTRUMENTS={
 rrc_collect_runs:{type:'sum'},
 rrc_source_fetch:{type:'sum'},
 rrc_handoff_packages:{type:'sum'},
 rrc_collect_duration:{type:'histogram',unit:'s',bounds:[0.1,0.25,0.5,1,2.5,5,10,30,60,120]},
};
const SEND_TIMEOUT_MS=2000;
const SETTLE_WAIT_MS=2500;
const MAX_PENDING_TRACES=256;
const WARNING='telemetry: OTLP export failed; further export errors are silenced';

const PACKAGE_VERSION=(()=>{
 try{const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;return typeof version==='string'&&version?version:'0.0.0';}
 catch{return '0.0.0';}
})();

const nano=ms=>(BigInt(Math.round(ms))*1_000_000n).toString();
const normalizeEndpoint=endpoint=>String(endpoint??'').trim().replace(/\/+$/,'');

function anyValue(value){
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {boolValue:value};
 if(typeof value==='number'){
  if(!Number.isFinite(value))return null;
  return Number.isSafeInteger(value)?{intValue:String(value)}:{doubleValue:value};
 }
 if(typeof value==='bigint')return {intValue:value.toString()};
 return null;
}
function filtered(obj,allowed){
 const out={};
 for(const [key,value] of Object.entries(obj??{}))if(allowed.has(key)&&anyValue(value))out[key]=value;
 return out;
}
const otlpAttributes=obj=>Object.entries(obj).map(([key,value])=>({key,value:anyValue(value)})).filter(a=>a.value);
const labelKey=(name,labels)=>name+'\u0000'+JSON.stringify(Object.keys(labels).sort().map(key=>[key,labels[key]]));

const ZERO_TRACE='0'.repeat(32),ZERO_SPAN='0'.repeat(16);
function noopTelemetry(){
 const span={traceId:ZERO_TRACE,spanId:ZERO_SPAN,setAttributes(){},setStartTime(){},end(){}};
 return Object.freeze({
  enabled:false,
  startSpan:()=>span,
  log(){},sendTrace(){},count(){},observe(){},
  flushMetrics:()=>Promise.resolve(),
  shutdown:()=>Promise.resolve(),
 });
}

const settleWithin=(promise,ms)=>new Promise(done=>{
 const timer=setTimeout(done,ms);timer.unref?.();
 promise.then(()=>{clearTimeout(timer);done();},()=>{clearTimeout(timer);done();});
});

export function createTelemetry({endpoint,serviceVersion,environment,fetchImpl=fetch,now=Date.now,flushIntervalMs=10000,warn=console.warn,onRootEnd=null}={}){
 const base=normalizeEndpoint(endpoint);
 if(!base)return noopTelemetry();

 const resource={attributes:otlpAttributes({
  'service.name':'explorer',
  'service.version':serviceVersion||PACKAGE_VERSION,
  'deployment.environment.name':environment||'local',
 })};
 const scope={name:'explorer'};
 const startNano=nano(now());
 let warned=false;
 const warnOnce=()=>{if(warned)return;warned=true;try{warn(WARNING);}catch{}};
 const inflight=new Set();

 function post(path,payload){
  let promise;
  try{
   const body=JSON.stringify(payload);
   promise=Promise.resolve(fetchImpl(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(SEND_TIMEOUT_MS)}))
    .then(response=>{
     if(response&&response.ok===false)warnOnce();
     // Release the unread body; cancel() may throw or reject, and neither may escape.
     try{Promise.resolve(response?.body?.cancel?.()).catch(()=>{});}catch{}
    },warnOnce);
  }catch{warnOnce();return Promise.resolve();}
  inflight.add(promise);
  promise.finally(()=>inflight.delete(promise)).catch(()=>{});
  return promise;
 }

 // traceId -> {spans: [otlp span], logs: [otlp log record]}
 const traces=new Map();
 const bucket=traceId=>{
  let entry=traces.get(traceId);
  if(!entry){
   if(traces.size>=MAX_PENDING_TRACES)traces.delete(traces.keys().next().value);
   entry={spans:[],logs:[]};traces.set(traceId,entry);
  }
  return entry;
 };

 function startSpan(name,{parent=null,attributes={},startMs,kind='internal'}={}){
  const traceId=parent?.traceId??randomBytes(16).toString('hex');
  const spanId=randomBytes(8).toString('hex');
  const parentSpanId=parent?.spanId??null;
  let start=startMs??now();
  const own=filtered(attributes,SPAN_ATTRIBUTE_KEYS);
  let ended=false;
  return {
   traceId,spanId,
   setAttributes(obj){if(!ended)Object.assign(own,filtered(obj,SPAN_ATTRIBUTE_KEYS));},
   setStartTime(ms){if(!ended&&Number.isFinite(ms))start=ms;},
   end({outcome='succeeded',attributes:endAttributes={},endMs}={}){
    if(ended)return;ended=true;
    Object.assign(own,filtered(endAttributes,SPAN_ATTRIBUTE_KEYS),filtered({outcome},SPAN_ATTRIBUTE_KEYS));
    const end=endMs??now();
    const span={traceId,spanId,name,kind:kind==='server'?2:1,
     startTimeUnixNano:nano(start),endTimeUnixNano:nano(Math.max(end,start)),
     attributes:otlpAttributes(own),status:{code:FAILED_OUTCOMES.has(outcome)?2:1}};
    if(parentSpanId)span.parentSpanId=parentSpanId;
    bucket(traceId).spans.push(span);
    if(!parent&&onRootEnd){try{onRootEnd({name,traceId,outcome,attributes:{...own}});}catch{}}
   },
  };
 }

 function logRecord(span,{severity='INFO',body,attributes={}}={}){
  const severityText=Object.hasOwn(SEVERITY,severity)?severity:'INFO';
  const t=nano(now());
  const record={timeUnixNano:t,observedTimeUnixNano:t,severityNumber:SEVERITY[severityText],severityText,
   body:{stringValue:String(body??'')},attributes:otlpAttributes(filtered(attributes,SPAN_ATTRIBUTE_KEYS))};
  if(span?.traceId&&span?.spanId){record.traceId=span.traceId;record.spanId=span.spanId;}
  return record;
 }
 const postLogs=records=>post('/v1/logs',{resourceLogs:[{resource,scopeLogs:[{scope,logRecords:records}]}]});

 function log(span,options){
  try{
   const record=logRecord(span,options);
   if(record.traceId)bucket(record.traceId).logs.push(record);
   else postLogs([record]);
  }catch{}
 }

 function sendTrace(traceId){
  const entry=traces.get(traceId);
  if(!entry)return;
  const spans=entry.spans,logs=entry.logs;
  entry.spans=[];entry.logs=[];
  traces.delete(traceId);
  if(spans.length)post('/v1/traces',{resourceSpans:[{resource,scopeSpans:[{scope,spans}]}]});
  if(logs.length)postLogs(logs);
 }

 // name+labels -> {name, labels, value} (sum) or {name, labels, count, sum, buckets} (histogram); never reset.
 const series=new Map();
 function count(name,labels={},value=1){
  if(INSTRUMENTS[name]?.type!=='sum'||!Number.isSafeInteger(value)||value<0)return;
  const clean=filtered(labels,METRIC_LABEL_KEYS),key=labelKey(name,clean);
  const entry=series.get(key)??{name,labels:clean,value:0};
  entry.value+=value;series.set(key,entry);
 }
 function observe(name,labels={},value){
  const instrument=INSTRUMENTS[name];
  if(instrument?.type!=='histogram'||!Number.isFinite(value))return;
  const clean=filtered(labels,METRIC_LABEL_KEYS),key=labelKey(name,clean);
  const entry=series.get(key)??{name,labels:clean,count:0,sum:0,buckets:new Array(instrument.bounds.length+1).fill(0)};
  let index=instrument.bounds.findIndex(bound=>value<=bound);
  if(index<0)index=instrument.bounds.length;
  entry.buckets[index]++;entry.count++;entry.sum+=value;series.set(key,entry);
 }
 function flushMetrics(){
  try{
   if(!series.size)return Promise.resolve();
   const timeUnixNano=nano(now());
   const metrics=new Map();
   for(const entry of series.values()){
    const instrument=INSTRUMENTS[entry.name];
    let metric=metrics.get(entry.name);
    if(!metric){
     metric={name:entry.name};
     if(instrument.unit)metric.unit=instrument.unit;
     metric[instrument.type]=instrument.type==='sum'
      ?{aggregationTemporality:2,isMonotonic:true,dataPoints:[]}
      :{aggregationTemporality:2,dataPoints:[]};
     metrics.set(entry.name,metric);
    }
    const point={attributes:otlpAttributes(entry.labels),startTimeUnixNano:startNano,timeUnixNano};
    if(instrument.type==='sum')point.asInt=String(entry.value);
    else Object.assign(point,{count:String(entry.count),sum:entry.sum,bucketCounts:entry.buckets.map(String),explicitBounds:[...instrument.bounds]});
    metric[instrument.type].dataPoints.push(point);
   }
   return settleWithin(post('/v1/metrics',{resourceMetrics:[{resource,scopeMetrics:[{scope,metrics:[...metrics.values()]}]}]}),SETTLE_WAIT_MS);
  }catch{warnOnce();return Promise.resolve();}
 }

 const timer=setInterval(()=>{flushMetrics();},flushIntervalMs);
 timer.unref?.();

 async function shutdown(){
  clearInterval(timer);
  for(const traceId of [...traces.keys()])sendTrace(traceId);
  await flushMetrics();
  if(inflight.size)await settleWithin(Promise.allSettled([...inflight]),SETTLE_WAIT_MS);
 }

 return Object.freeze({enabled:true,startSpan,log,sendTrace,count,observe,flushMetrics,shutdown});
}

export function telemetryFromEnv(env=process.env,overrides={}){
 return createTelemetry({
  endpoint:env.OTEL_EXPORTER_OTLP_ENDPOINT,
  serviceVersion:env.OTEL_SERVICE_VERSION||undefined,
  environment:env.DEPLOYMENT_ENVIRONMENT||undefined,
  ...overrides,
 });
}
