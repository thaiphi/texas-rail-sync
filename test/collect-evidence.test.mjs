// ZC-05 Task 6: the read-only evidence check over Grafana (Tempo, Loki, Prometheus, alert rules, dashboards).
// Canned responses follow the real API shapes; the live round trip runs in .github/workflows/observability.yml.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkEvidence,collectEvidence,parseArgs,QUERIES} from '../observability/collect-evidence.mjs';

const SUCCESS_TRACE='0af7651916cd43dd8448eb211c80319c';
const FAILED_TRACE='4bf92f3577b34da6a3ce929d0e0e4736';
const fixture=()=>[
 {mode:'success',status:201,traceId:SUCCESS_TRACE,runId:'run-a',outcome:'succeeded',stage:'none',errorCode:'none'},
 {mode:'failed',status:502,traceId:FAILED_TRACE,runId:'run-b',outcome:'failed',stage:'load',errorCode:'HTTP_ERROR'},
];

const span=(name,code=1)=>({traceId:'x',spanId:'y',name,status:{code}});
const resource={attributes:[{key:'service.name',value:{stringValue:'explorer'}}]};
// Tempo /api/traces/<id> (v1): `batches` with `scopeSpans`.
const tempoBatches=spans=>({batches:[{resource,scopeSpans:[{scope:{name:'explorer'},spans}]}]});
// Older Tempo / OTLP JSON: `resourceSpans` with `instrumentationLibrarySpans`, status code as enum string.
const tempoLegacy=spans=>({resourceSpans:[{resource,instrumentationLibrarySpans:[{spans}]}]});

const lokiStreams=lines=>({status:'success',data:{resultType:'streams',
 result:lines.length?[{stream:{service_name:'explorer',trace_id:'x'},values:lines.map((line,i)=>[String(1762400000000000000+i),line])}]:[],
 stats:{}}});
const vector=series=>({status:'success',data:{resultType:'vector',result:series.map(([metric,value])=>({metric,value:[1762400000.123,String(value)]}))}});
const runsMetric=(extra=[])=>vector([
 [{__name__:'rrc_collect_runs_total',job:'explorer',outcome:'succeeded',stage:'none',error_code:'none'},1],
 [{__name__:'rrc_collect_runs_total',job:'explorer',outcome:'failed',stage:'load',error_code:'HTTP_ERROR'},1],
 ...extra]);
const rules=(rule={uid:'explorer-collect-failed',name:'Explorer collection failed'})=>({status:'success',data:{groups:[
 {name:'explorer-collect',file:'Explorer',rules:rule?[{...rule,state:'firing',health:'ok',type:'alerting'}]:[]}]}});
const dashboards=(uid='explorer-collect')=>[{id:1,uid,title:'Explorer collect',type:'dash-db',url:`/d/${uid}/explorer-collect`}];

const inputs=(overrides={})=>({
 fixture:fixture(),
 tempo:{success:tempoBatches([span('collect'),span('load'),span('normalize-qc'),span('export'),span('source.fetch')]),
  failed:tempoBatches([span('collect',2),span('load',2),span('source.fetch',2)])},
 loki:{success:lokiStreams(['stage succeeded','stage succeeded']),failed:lokiStreams(['stage failed'])},
 prometheus:runsMetric(),
 alert:vector([[{},1]]),
 provisioning:{dashboards:dashboards(),rules:rules()},
 ...overrides,
});
const byName=result=>Object.fromEntries(result.checks.map(check=>[check.name,check]));
const failedNames=result=>result.checks.filter(check=>!check.ok).map(check=>check.name);

test('all signals present gives ok:true with every named check',()=>{
 const result=checkEvidence(inputs());
 assert.deepEqual(failedNames(result),[]);
 assert.equal(result.ok,true);
 assert.deepEqual(result.checks.map(check=>check.name),['trace:success','trace:failed','logs:success','logs:failed',
  'metric:succeeded','metric:failed','alert-expr','provisioned:dashboard','provisioned:alert']);
 for(const check of result.checks)assert.equal(typeof check.detail,'string');
});

test('a missing normalize-qc span fails trace:success only',()=>{
 const result=checkEvidence(inputs({tempo:{...inputs().tempo,success:tempoBatches([span('collect'),span('load'),span('export')])}}));
 assert.equal(result.ok,false);
 assert.deepEqual(failedNames(result),['trace:success']);
 assert.match(byName(result)['trace:success'].detail,/normalize-qc/);
});

test('an empty Loki result fails logs:failed',()=>{
 const result=checkEvidence(inputs({loki:{...inputs().loki,failed:lokiStreams([])}}));
 assert.equal(result.ok,false);
 assert.deepEqual(failedNames(result),['logs:failed']);
});

test('a Prometheus vector without the failed series fails metric:failed',()=>{
 const result=checkEvidence(inputs({prometheus:vector([[{__name__:'rrc_collect_runs_total',outcome:'succeeded',stage:'none',error_code:'none'},2]])}));
 assert.equal(result.ok,false);
 assert.deepEqual(failedNames(result),['metric:failed']);
});

test('the failed series must be stage=load and error_code=HTTP_ERROR',()=>{
 const wrong=vector([[{outcome:'succeeded',stage:'none',error_code:'none'},1],[{outcome:'failed',stage:'export',error_code:'HTTP_ERROR'},1]]);
 assert.deepEqual(failedNames(checkEvidence(inputs({prometheus:wrong}))),['metric:failed']);
});

test('trace:failed needs a load span with error status; legacy Tempo shape and enum status are read',()=>{
 const ok=checkEvidence(inputs({tempo:{success:tempoLegacy([span('collect'),span('load'),span('normalize-qc'),span('export')]),
  failed:tempoLegacy([span('collect','STATUS_CODE_ERROR'),span('load','STATUS_CODE_ERROR')])}}));
 assert.deepEqual(failedNames(ok),[]);
 const unset=checkEvidence(inputs({tempo:{...inputs().tempo,failed:tempoBatches([span('collect',2),span('load',1)])}}));
 assert.deepEqual(failedNames(unset),['trace:failed']);
 // Tempo v2 wraps the OTLP body in `trace`.
 const v2=checkEvidence(inputs({tempo:{...inputs().tempo,failed:{trace:{resourceSpans:[{resource,scopeSpans:[{spans:[span('load',2)]}]}]}}}}));
 assert.deepEqual(failedNames(v2),[]);
});

test('a null or malformed traceId fails that mode\'s trace and logs checks, never skips them',()=>{
 const nullFixture=fixture();nullFixture[1].traceId=null;
 assert.deepEqual(failedNames(checkEvidence(inputs({fixture:nullFixture}))),['trace:failed','logs:failed']);
 const badFixture=fixture();badFixture[0].traceId='ABC';
 assert.deepEqual(failedNames(checkEvidence(inputs({fixture:badFixture}))),['trace:success','logs:success']);
 assert.deepEqual(failedNames(checkEvidence(inputs({fixture:[fixture()[0]]}))),['trace:failed','logs:failed']);
});

test('missing or error responses fail their checks instead of throwing',()=>{
 const result=checkEvidence({fixture:fixture(),tempo:{success:null,failed:'not json'},loki:{},prometheus:{status:'error',error:'bad'},
  alert:vector([]),provisioning:{dashboards:null,rules:{status:'success',data:{groups:[]}}}});
 assert.equal(result.ok,false);
 assert.deepEqual(failedNames(result),['trace:success','trace:failed','logs:success','logs:failed','metric:succeeded','metric:failed',
  'alert-expr','provisioned:dashboard','provisioned:alert']);
 assert.equal(checkEvidence({}).ok,false);
});

test('alert-expr needs a value above zero; provisioned checks match uid or title',()=>{
 assert.deepEqual(failedNames(checkEvidence(inputs({alert:vector([[{},0]])}))),['alert-expr']);
 const missingDashboard=checkEvidence(inputs({provisioning:{dashboards:dashboards('other'),rules:rules()}}));
 assert.deepEqual(failedNames(missingDashboard),['provisioned:dashboard']);
 assert.equal(byName(missingDashboard)['provisioned:dashboard'].detail,'1 dashboard(s); none has uid explorer-collect');
 const found=byName(checkEvidence(inputs()));
 assert.equal(found['provisioned:dashboard'].detail,'found uid explorer-collect ("Explorer collect") among 1 dashboard(s)');
 assert.equal(found['provisioned:alert'].detail,'rule "Explorer collection failed" state firing, health ok');
 const withQuery=byName(checkEvidence(inputs({provisioning:{dashboards:dashboards(),rules:rules({uid:'explorer-collect-failed',name:'Explorer collection failed',query:'sum(x) > 0'})}})));
 assert.equal(withQuery['provisioned:alert'].detail,'rule "Explorer collection failed" state firing, health ok; query sum(x) > 0');
 assert.deepEqual(failedNames(checkEvidence(inputs({provisioning:{dashboards:dashboards(),rules:rules(null)}}))),['provisioned:alert']);
 // Older rule payloads have no uid; the title is enough.
 assert.deepEqual(failedNames(checkEvidence(inputs({provisioning:{dashboards:dashboards(),rules:rules({name:'Explorer collection failed'})}}))),[]);
});

test('collectEvidence uses GET only, no auth header, the allowed Grafana paths, and polls until ok',async()=>{
 const calls=[];let round=0;
 const answers=url=>{
  const path=new URL(url).pathname+'?'+new URL(url).searchParams.toString();
  if(path.includes('/uid/tempo/api/traces/'+SUCCESS_TRACE))return inputs().tempo.success;
  if(path.includes('/uid/tempo/api/traces/'+FAILED_TRACE))return round<2?null:inputs().tempo.failed;
  if(path.includes('/uid/loki/loki/api/v1/query_range'))return new URL(url).searchParams.get('query').includes(FAILED_TRACE)?inputs().loki.failed:inputs().loki.success;
  if(path.includes('/uid/prometheus/api/v1/query?')&&new URL(url).searchParams.get('query')==='rrc_collect_runs_total')return runsMetric();
  if(path.includes('/uid/prometheus/api/v1/query?'))return vector([[{},1]]);
  if(path.startsWith('/api/prometheus/grafana/api/v1/rules'))return rules();
  if(path.startsWith('/api/search'))return dashboards();
  return null;
 };
 const fetchImpl=async(url,init={})=>{
  calls.push({url,init});
  if(url.includes(FAILED_TRACE)&&url.includes('/api/traces/'))round++;
  const body=answers(url);
  return {status:body?200:404,ok:!!body,text:async()=>body?JSON.stringify(body):'trace not found'};
 };
 const evidence=await collectEvidence({fixture:fixture(),grafana:'http://127.0.0.1:3000',timeoutMs:5000,intervalMs:1,fetchImpl,log:()=>{}});
 assert.equal(evidence.ok,true,JSON.stringify(evidence.checks));
 assert.equal(evidence.attempts,2);
 for(const {url,init} of calls){
  assert.ok(url.startsWith('http://127.0.0.1:3000/'),url);
  assert.equal(init.method??'GET','GET');
  assert.equal(init.body,undefined);
  assert.ok(!Object.keys(init.headers??{}).some(key=>key.toLowerCase()==='authorization'));
 }
 const paths=new Set(calls.map(({url})=>new URL(url).pathname));
 assert.deepEqual([...paths].sort(),[
  '/api/datasources/proxy/uid/loki/loki/api/v1/query_range',
  '/api/datasources/proxy/uid/prometheus/api/v1/query',
  `/api/datasources/proxy/uid/tempo/api/traces/${FAILED_TRACE}`,
  `/api/datasources/proxy/uid/tempo/api/traces/${SUCCESS_TRACE}`,
  '/api/prometheus/grafana/api/v1/rules',
  '/api/search',
 ].sort());
 const lokiQueries=calls.filter(({url})=>url.includes('query_range')).map(({url})=>new URL(url).searchParams.get('query'));
 assert.ok(lokiQueries.includes(`{service_name="explorer"} | trace_id="${SUCCESS_TRACE}"`));
 const promQueries=calls.filter(({url})=>url.includes('/uid/prometheus/')).map(({url})=>new URL(url).searchParams.get('query'));
 assert.ok(promQueries.includes(QUERIES.alertExpr));
 assert.ok(promQueries.includes('rrc_collect_runs_total'));
 assert.equal(evidence.diagnostics,undefined,'no diagnostics when every check passes');
});

test('collectEvidence times out with ok:false, keeps checks and gathers diagnostics',async()=>{
 const calls=[];
 const fetchImpl=async url=>{calls.push(url);
  if(url.includes('/label/__name__/values'))return {status:200,ok:true,text:async()=>JSON.stringify({status:'success',data:['rrc_collect_runs_total','target_info']})};
  return {status:404,ok:false,text:async()=>'x'.repeat(5000)};};
 const evidence=await collectEvidence({fixture:fixture(),grafana:'http://127.0.0.1:3000',timeoutMs:20,intervalMs:5,fetchImpl,log:()=>{}});
 assert.equal(evidence.ok,false);
 assert.ok(evidence.attempts>=1);
 assert.equal(evidence.checks.length,9);
 assert.deepEqual(evidence.diagnostics.metricNames.body.data,['rrc_collect_runs_total','target_info']);
 const raw=Object.values(evidence.diagnostics.firstResponses);
 assert.ok(raw.length>0);
 for(const entry of raw)assert.ok(entry.text.length<=1200,'raw bodies are trimmed');
});

test('parseArgs reads --in, --out, --grafana and --timeout',()=>{
 assert.deepEqual(parseArgs(['--in','a.json','--out','b.json']),{in:'a.json',out:'b.json',grafana:'http://127.0.0.1:3000',timeoutMs:90000});
 assert.deepEqual(parseArgs(['--in','a','--out','b','--grafana','http://g:3000/','--timeout','30']),{in:'a',out:'b',grafana:'http://g:3000',timeoutMs:30000});
 assert.throws(()=>parseArgs(['--out','b']),/--in/);
 assert.throws(()=>parseArgs(['--in','a','--bogus']),/Unknown/);
});

test('alert-expr queries exactly the provisioned rule expression (no stale copy)',()=>{
 const rule=readFileSync(new URL('../observability/grafana/provisioning/alerting/explorer-alerts.yaml',import.meta.url),'utf8');
 const exprs=[...rule.matchAll(/^\s*expr:\s*'([^']*)'\s*$/gm)].map(match=>match[1]);
 assert.deepEqual(exprs,[QUERIES.alertExpr]);
});

test('the evidence CLI source never writes: no POST, no remote write, no auth header',()=>{
 const source=readFileSync(new URL('../observability/collect-evidence.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/method\s*:\s*['"]POST['"]/i);
 assert.doesNotMatch(source,/\/api\/v1\/write/);
 assert.doesNotMatch(source,/\/api\/v1\/provisioning/);
 assert.doesNotMatch(source,/authorization/i);
});
