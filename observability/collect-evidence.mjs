// ZC-05 Task 6: read-only evidence that the fixture collects' traces, logs and metrics reached Grafana otel-lgtm,
// and that the dashboard and alert rule are provisioned. Only GET requests, through Grafana, as the anonymous Viewer.
// ZC-06: also that the alert rule is firing and that the local responder received Grafana's firing webhook
// (the JSON files scripts/alert-receiver.mjs saves in --alerts-dir).
//   node observability/collect-evidence.mjs --in <fixture.json> --out <evidence.json> [--grafana http://127.0.0.1:3000]
//     [--timeout 180] [--alerts-dir tmp/alerts] [--min-failed 1]
// <fixture.json> is the output of `node scripts/collect-fixture.mjs --both --out <file>`. Polls until every check passes
// or the timeout ends, writes the evidence JSON either way and exits 0 (all ok) or 1.
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Datasource UIDs provisioned by grafana/otel-lgtm 0.37.0 (see observability/compose.yaml).
export const UIDS=Object.freeze({tempo:'tempo',loki:'loki',prometheus:'prometheus'});
export const DASHBOARD_UID='explorer-collect';
export const ALERT_UID='explorer-collect-failed';
export const ALERT_TITLE='Explorer collection failed';
export const QUERIES=Object.freeze({
 runs:'rrc_collect_runs_total',
 alertExpr:'sum((rrc_collect_runs_total{outcome="failed"} - rrc_collect_runs_total{outcome="failed"} offset 5m) > 0 or (rrc_collect_runs_total{outcome="failed"} unless rrc_collect_runs_total{outcome="failed"} offset 5m))',
 // otel-lgtm's Loki indexes service.name as the `service_name` label; trace_id is structured metadata.
 logs:traceId=>`{service_name="explorer"} | trace_id="${traceId}"`,
 // Diagnostics only (same query_range endpoint): any stream, to show the real label and metadata names.
 logsSample:'{service_name=~".+"}',
});
const SUCCESS_SPANS=['collect','load','normalize-qc','export'];
const TRACE_ID=/^[0-9a-f]{32}$/;
const MODES=['success','failed'];
const RAW_LIMIT=1200;

const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];
const check=(name,ok,detail)=>({name,ok:!!ok,detail});
const fixtureEntry=(fixture,mode)=>list(fixture).find(entry=>entry?.mode===mode)??null;
const traceIdOf=(fixture,mode)=>{
 const id=fixtureEntry(fixture,mode)?.traceId;
 return typeof id==='string'&&TRACE_ID.test(id)?id:null;
};
const badTraceId=(fixture,mode)=>{
 const entry=fixtureEntry(fixture,mode);
 return entry?`fixture ${mode} traceId is ${JSON.stringify(entry.traceId??null)}, not 32 lowercase hex`:`fixture has no ${mode} entry`;
};

// Every span in a Tempo trace-by-id body. Accepts `batches` (Tempo v1 API) or `resourceSpans` (OTLP JSON),
// optionally wrapped in `trace` (Tempo v2 API), with `scopeSpans` or the older `instrumentationLibrarySpans`.
export function tempoSpans(body){
 if(!isObject(body))return [];
 const root=isObject(body.trace)?body.trace:body;
 const resources=[...list(root.batches),...list(root.resourceSpans)];
 return resources.flatMap(resource=>[...list(resource?.scopeSpans),...list(resource?.instrumentationLibrarySpans)])
  .flatMap(scope=>list(scope?.spans)).filter(isObject);
}
// OTLP status code 2 (ERROR), as a number or the proto enum name.
const isErrorStatus=span=>{const code=span?.status?.code;return code===2||code==='2'||code==='STATUS_CODE_ERROR';};

// Loki query_range: number of log lines across all returned streams.
export function lokiLineCount(body){
 if(!isObject(body)||body.status!=='success')return 0;
 return list(body.data?.result).reduce((sum,stream)=>sum+list(stream?.values).length,0);
}
// Prometheus instant query: [{metric, value:number}] from a vector result.
export function promVector(body){
 if(!isObject(body)||body.status!=='success'||body.data?.resultType!=='vector')return [];
 return list(body.data.result).map(series=>({metric:isObject(series?.metric)?series.metric:{},value:Number(list(series?.value)[1])}))
  .filter(series=>Number.isFinite(series.value));
}
const sumWhere=(series,labels)=>series.filter(({metric})=>Object.entries(labels).every(([key,value])=>metric[key]===value))
 .reduce((sum,{value})=>sum+value,0);

// Pure check over already-fetched JSON bodies (null when a request failed or did not return JSON).
//   fixture: the collect-fixture array; tempo/loki: {success, failed} bodies; prometheus: the `rrc_collect_runs_total`
//   query body; alert: the alert-expression query body; provisioning: {dashboards: /api/search body, rules: rules body};
//   webhooks: the saved Grafana webhook bodies (null when none could be read); minFailed: failed runs metric:failed needs.
export function checkEvidence({fixture,tempo,loki,prometheus,alert,provisioning,webhooks,minFailed=1}={}){
 const checks=[];
 for(const mode of MODES){
  const traceId=traceIdOf(fixture,mode),name=`trace:${mode}`;
  if(!traceId){checks.push(check(name,false,badTraceId(fixture,mode)));continue;}
  const spans=tempoSpans(tempo?.[mode]),names=new Set(spans.map(span=>span.name));
  if(mode==='success'){
   const missing=SUCCESS_SPANS.filter(spanName=>!names.has(spanName));
   checks.push(check(name,spans.length&&!missing.length,spans.length?(missing.length?`missing spans: ${missing.join(', ')}; got ${[...names].join(', ')}`:`spans: ${[...names].join(', ')}`):`no spans for trace ${traceId}`));
  }else{
   const load=spans.filter(span=>span.name==='load');
   const errored=load.some(isErrorStatus);
   checks.push(check(name,errored,!spans.length?`no spans for trace ${traceId}`:!load.length?`no load span; got ${[...names].join(', ')}`
    :errored?'load span has error status':`load span status ${JSON.stringify(load[0].status??null)}, not error`));
  }
 }
 for(const mode of MODES){
  const traceId=traceIdOf(fixture,mode),name=`logs:${mode}`;
  if(!traceId){checks.push(check(name,false,badTraceId(fixture,mode)));continue;}
  const lines=lokiLineCount(loki?.[mode]);
  checks.push(check(name,lines>=1,`${lines} log line(s) for trace ${traceId}`));
 }
 const runs=promVector(prometheus);
 const succeeded=sumWhere(runs,{outcome:'succeeded'});
 checks.push(check('metric:succeeded',succeeded>=1,`rrc_collect_runs_total{outcome="succeeded"} = ${succeeded} (${runs.length} series)`));
 const failed=sumWhere(runs,{outcome:'failed',stage:'load',error_code:'HTTP_ERROR'});
 checks.push(check('metric:failed',failed>=minFailed,`rrc_collect_runs_total{outcome="failed",stage="load",error_code="HTTP_ERROR"} = ${failed} across ${runs.filter(({metric})=>metric.outcome==='failed').length} series (need ${minFailed})`));
 const alertValues=promVector(alert).map(({value})=>value);
 checks.push(check('alert-expr',alertValues.some(value=>value>0),alertValues.length?`values ${alertValues.join(', ')}`:'empty result'));
 const dashboards=list(provisioning?.dashboards);
 const dashboard=dashboards.find(item=>item?.uid===DASHBOARD_UID);
 checks.push(check('provisioned:dashboard',dashboard,dashboard?`found uid ${DASHBOARD_UID} (${JSON.stringify(dashboard.title??null)}) among ${dashboards.length} dashboard(s)`
  :`${dashboards.length} dashboard(s); none has uid ${DASHBOARD_UID}`));
 const rules=isObject(provisioning?.rules)?list(provisioning.rules.data?.groups).flatMap(group=>list(group?.rules)):[];
 const rule=rules.find(item=>item?.uid===ALERT_UID||item?.name===ALERT_TITLE);
 const ruleQuery=typeof rule?.query==='string'&&rule.query?`; query ${rule.query.length>300?rule.query.slice(0,300)+'...':rule.query}`:'';
 checks.push(check('provisioned:alert',rule,rule?`rule "${rule.name}" state ${rule.state??'unknown'}, health ${rule.health??'unknown'}${ruleQuery}`
  :`${rules.length} rule(s); none is ${ALERT_UID} / "${ALERT_TITLE}"`));
 checks.push(check('alert:firing',rule?.state==='firing',rule?`rule state ${rule.state??'unknown'}`:'rule not found'));
 const bodies=list(webhooks).filter(isObject);
 const firing=bodies.filter(body=>body.status==='firing'&&list(body.alerts).some(item=>item?.status==='firing'&&item?.labels?.alertname===ALERT_TITLE));
 checks.push(check('webhook:received',firing.length>=1,webhooks==null?'no alerts directory could be read'
  :`${bodies.length} webhook(s) saved, ${firing.length} firing "${ALERT_TITLE}"`));
 return {ok:checks.every(item=>item.ok),checks};
}

const trim=text=>text.length>RAW_LIMIT?text.slice(0,RAW_LIMIT-20)+`... [${text.length} chars]`:text;

// One read-only GET through Grafana. Never throws: returns {status, body (JSON or null), text}.
async function getJson(fetchImpl,grafana,path,params){
 const url=new URL(grafana+path);
 for(const [key,value] of Object.entries(params??{}))url.searchParams.set(key,value);
 try{
  const response=await fetchImpl(url.href,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
  const text=await response.text();
  let body=null;
  if(response.status>=200&&response.status<300){try{body=JSON.parse(text);}catch{body=null;}}
  return {url:url.pathname+url.search,status:response.status,body,text};
 }catch(error){
  return {url:url.pathname+url.search,status:0,body:null,text:`request error: ${error?.name??'Error'}: ${error?.message??error}`};
 }
}

const proxy=uid=>`/api/datasources/proxy/uid/${uid}`;
async function fetchAll(fetchImpl,grafana,fixture,now=Date.now()){
 const ns=ms=>(BigInt(Math.round(ms))*1_000_000n).toString();
 const window={start:ns(now-3600_000),end:ns(now+60_000),limit:'100',direction:'backward'};
 const requests={};
 for(const mode of MODES){
  const traceId=traceIdOf(fixture,mode);
  if(!traceId)continue;
  requests[`tempo:${mode}`]=[`${proxy(UIDS.tempo)}/api/traces/${traceId}`];
  requests[`loki:${mode}`]=[`${proxy(UIDS.loki)}/loki/api/v1/query_range`,{query:QUERIES.logs(traceId),...window}];
 }
 requests.prometheus=[`${proxy(UIDS.prometheus)}/api/v1/query`,{query:QUERIES.runs}];
 requests.alert=[`${proxy(UIDS.prometheus)}/api/v1/query`,{query:QUERIES.alertExpr}];
 requests.rules=['/api/prometheus/grafana/api/v1/rules'];
 requests.dashboards=['/api/search',{type:'dash-db',query:''}];
 const entries=await Promise.all(Object.entries(requests).map(async([key,[path,params]])=>[key,await getJson(fetchImpl,grafana,path,params)]));
 return Object.fromEntries(entries);
}
// Every *.json file the receiver saved at or after sinceMs, parsed (unparseable files are skipped); null if the folder
// cannot be read. sinceMs keeps a firing file from an earlier local demo from passing for this run.
export async function readAlertsDir(dir,sinceMs=0){
 try{
  const names=(await readdir(dir)).filter(name=>name.endsWith('.json')).sort();
  const bodies=await Promise.all(names.map(async name=>{
   try{const file=join(dir,name);if((await stat(file)).mtimeMs<sinceMs)return null;return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}));
  return bodies.filter(Boolean);
 }catch{return null;}
}
const toInputs=(fixture,responses,webhooks,minFailed)=>({
 webhooks,minFailed,
 fixture,
 tempo:{success:responses['tempo:success']?.body??null,failed:responses['tempo:failed']?.body??null},
 loki:{success:responses['loki:success']?.body??null,failed:responses['loki:failed']?.body??null},
 prometheus:responses.prometheus?.body??null,
 alert:responses.alert?.body??null,
 provisioning:{dashboards:responses.dashboards?.body??null,rules:responses.rules?.body??null},
});
const rawOf=responses=>Object.fromEntries(Object.entries(responses).map(([key,{url,status,text}])=>[key,{url,status,text:trim(text)}]));

// Polls every intervalMs until every check passes or timeoutMs elapses. On failure it adds diagnostics:
// the metric names Prometheus ingested, a sample of any Loki stream, and the first and last raw bodies (trimmed).
export async function collectEvidence({fixture,grafana='http://127.0.0.1:3000',timeoutMs=180000,intervalMs=3000,fetchImpl=fetch,log=console.log,
 alertsDir='tmp/alerts',alertsSinceMs=0,readAlerts=()=>readAlertsDir(alertsDir,alertsSinceMs),minFailed=1}){
 grafana=String(grafana).replace(/\/+$/,'');
 const started=Date.now();
 let attempts=0,first=null,last=null,result=null,webhooks=null;
 for(;;){
  attempts++;
  [last,webhooks]=await Promise.all([fetchAll(fetchImpl,grafana,fixture),readAlerts()]);
  first??=last;
  result=checkEvidence(toInputs(fixture,last,webhooks,minFailed));
  const failing=result.checks.filter(item=>!item.ok).map(item=>item.name);
  log(`attempt ${attempts}: ${failing.length?`waiting for ${failing.join(', ')}`:'all checks pass'}`);
  if(result.ok||Date.now()-started+intervalMs>timeoutMs)break;
  await new Promise(done=>setTimeout(done,intervalMs));
 }
 const evidence={generatedAt:new Date().toISOString(),grafana,ok:result.ok,attempts,elapsedMs:Date.now()-started,checks:result.checks,fixture,webhooks};
 if(!result.ok){
  const [metricNames,logsSample]=await Promise.all([
   getJson(fetchImpl,grafana,`${proxy(UIDS.prometheus)}/api/v1/label/__name__/values`),
   getJson(fetchImpl,grafana,`${proxy(UIDS.loki)}/loki/api/v1/query_range`,{query:QUERIES.logsSample,limit:'5',
    start:(BigInt(Date.now()-3600_000)*1_000_000n).toString()}),
  ]);
  evidence.diagnostics={
   metricNames:{status:metricNames.status,body:metricNames.body,text:metricNames.body?undefined:trim(metricNames.text)},
   logsSample:{status:logsSample.status,text:trim(logsSample.text)},
   firstResponses:rawOf(first),
   lastResponses:rawOf(last),
  };
 }
 return evidence;
}

export function parseArgs(argv){
 const options={in:null,out:null,grafana:'http://127.0.0.1:3000',timeoutMs:180000,alertsDir:'tmp/alerts',minFailed:1};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i],value=argv[i+1];
  const need=()=>{if(value===undefined||value.startsWith('--'))throw Error(`${arg} needs a value`);i++;return value;};
  if(arg==='--in')options.in=need();
  else if(arg==='--out')options.out=need();
  else if(arg==='--grafana')options.grafana=need().replace(/\/+$/,'');
  else if(arg==='--timeout'){const seconds=Number(need());if(!(seconds>0))throw Error('--timeout needs a positive number of seconds');options.timeoutMs=seconds*1000;}
  else if(arg==='--alerts-dir')options.alertsDir=need();
  else if(arg==='--min-failed'){const count=Number(need());if(!Number.isInteger(count)||count<1)throw Error('--min-failed needs a whole number of at least 1');options.minFailed=count;}
  else throw Error(`Unknown argument: ${arg}`);
 }
 if(!options.in)throw Error('--in <fixture.json> is required');
 if(!options.out)throw Error('--out <evidence.json> is required');
 return options;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const options=parseArgs(process.argv.slice(2));
  const fixture=JSON.parse(await readFile(options.in,'utf8'));
  // The fixture file is written after its collects, and the alert needs at least 40 s more to fire, so a webhook
  // saved more than 10 s before that file belongs to an earlier run.
  const alertsSinceMs=(await stat(options.in)).mtimeMs-10_000;
  const evidence=await collectEvidence({fixture,grafana:options.grafana,timeoutMs:options.timeoutMs,alertsDir:options.alertsDir,alertsSinceMs,minFailed:options.minFailed});
  await writeFile(options.out,JSON.stringify(evidence,null,1)+'\n');
  for(const item of evidence.checks)console.log(`${item.ok?'ok  ':'FAIL'} ${item.name}: ${item.detail}`);
  if(evidence.diagnostics)console.log('diagnostics:\n'+JSON.stringify(evidence.diagnostics,null,1));
  process.exitCode=evidence.ok?0:1;
 }catch(error){
  console.error(`collect-evidence: ${error.message}`);process.exitCode=1;
 }
}
