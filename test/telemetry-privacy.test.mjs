// ZC-05 Task 3 privacy gate: every exported body (traces, logs, metrics) after a successful collect, a
// failed collect, a lookup and a download carries no well identifier, artifact id, URL/query, header,
// token or free text, and only allowlisted keys. ID and time fields are excluded by key, never scanned,
// so a random hex trace/span ID with a long digit run cannot trip the digit-run rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createExplorerServer} from '../scripts/serve.mjs';
import {createTelemetry} from '../scripts/telemetry.mjs';
import {fixtureNetwork,FIXTURE_LOOKUP,FIXTURE_MONTHS} from '../scripts/fixture-network.mjs';
const root=new URL('../',import.meta.url),rootPath=fileURLToPath(root);
const pinnedId=JSON.parse(await readFile(new URL('public/artifact-integrity.json',root))).artifactId;
const TOKEN='fixture-token-not-real';
const BANNED=['000020838','38910201',TOKEN,'X-App-Token','$where','data.texas.gov/resource',pinnedId];
const ARTIFACT_ID=/rrc-\d{4}-\d{2}-\d{2}-uic/;
const ATTRIBUTE_KEYS=new Set(['run.id','lookup.id','transfer.id','stage','outcome','error.code','source.name','server.address','row.count','test_fixture','app_token_used','http.route','http.response.status_code']);
const LABEL_KEYS=new Set(['stage','outcome','error_code','source_name']);
const ID_KEYS=new Set(['run.id','lookup.id','transfer.id']);
const EXCLUDED_FIELDS=new Set(['traceId','spanId','parentSpanId']);
const excluded=key=>EXCLUDED_FIELDS.has(key)||/UnixNano$/.test(key);
const scalar=value=>value.stringValue??value.intValue??value.boolValue??value.doubleValue;

// Deep copy without trace/span IDs and timestamps: those are excluded by key, not scanned.
const strip=node=>Array.isArray(node)?node.map(strip):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).filter(([key])=>!excluded(key)).map(([key,value])=>[key,strip(value)])):node;

function checkAttributes(list,where,allowedKeys,idKeys){
 for(const {key,value} of list??[]){
  assert.ok(allowedKeys.has(key),`${where}: key ${key} not allowlisted`);
  const text=String(scalar(value));
  assert.ok(!text.includes('?'),`${where}: ${key} carries a query`);
  if(!idKeys.has(key))assert.doesNotMatch(text,/\d{8,}/,`${where}: ${key} carries a long digit run`);
 }
}

test('telemetry bodies carry no identifier, token, URL or unlisted key',async t=>{
 const calls=[];
 const telemetry=createTelemetry({endpoint:'http://collector.test:4318',serviceVersion:'test',environment:'test',warn:()=>{},fetchImpl:(url,init)=>{calls.push({url,text:init.body,body:JSON.parse(init.body)});return Promise.resolve({ok:true});}});
 await mkdir(new URL('tmp/',root),{recursive:true});
 const dir=await mkdtemp(resolve(rootPath,'tmp','telemetry-privacy-'));
 let fail=null;
 const network=url=>fixtureNetwork({fail})(url);
 const servers=[
  createExplorerServer({runRoot:resolve(dir,'runs'),lookupRoot:resolve(dir,'lookups'),sourceRoot:resolve(dir,'sources'),outputRoot:resolve(dir,'artifacts'),fetchImpl:network,testFixture:true,appToken:TOKEN,telemetry}),
  // Download from the repository's published artifacts (read only).
  createExplorerServer({runRoot:resolve(dir,'runs-download'),lookupRoot:resolve(dir,'lookups'),sourceRoot:resolve(dir,'sources'),outputRoot:resolve(rootPath,'artifacts'),fetchImpl:network,testFixture:true,appToken:TOKEN,telemetry}),
 ];
 for(const server of servers)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{for(const server of servers)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${servers[0].address().port}`,downloadBase=`http://127.0.0.1:${servers[1].address().port}`;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});

 const statuses=[];
 for(const mode of [null,'qq2j-f2zm']){
  fail=null;
  const found=await (await post('/api/lookup',FIXTURE_LOOKUP)).json();
  fail=mode;
  const response=await post('/api/collect',{lookupId:found.lookupId,sourceRecordKey:found.candidates[0].sourceRecordKey,...FIXTURE_MONTHS});
  await response.arrayBuffer();statuses.push(response.status);
 }
 const download=await fetch(`${downloadBase}/api/versions/${pinnedId}/download`);await download.arrayBuffer();
 assert.deepEqual(statuses,[201,502]);
 await telemetry.shutdown();

 const kinds=new Set(calls.map(c=>new URL(c.url).pathname));
 assert.deepEqual([...kinds].sort(),['/v1/logs','/v1/metrics','/v1/traces']);
 const spans=calls.filter(c=>c.url.endsWith('/v1/traces')).flatMap(c=>c.body.resourceSpans.flatMap(r=>r.scopeSpans.flatMap(s=>s.spans)));
 for(const name of ['collect','load','normalize-qc','export','source.fetch','lookup','handoff.package'])assert.ok(spans.some(s=>s.name===name),name);

 for(const call of calls){
  const where=new URL(call.url).pathname,text=JSON.stringify(strip(call.body));
  for(const banned of BANNED)assert.ok(!text.includes(banned),`${where}: contains ${banned}`);
  assert.doesNotMatch(text,ARTIFACT_ID,`${where}: contains an artifact id`);
  // The raw wire text as well (IDs/times are hex or digits only, so they cannot hold these strings).
  for(const banned of [TOKEN,'X-App-Token','$where','data.texas.gov/resource',pinnedId])assert.ok(!call.text.includes(banned),`${where}: raw text contains ${banned}`);
  if(call.body.resourceSpans)for(const span of call.body.resourceSpans.flatMap(r=>r.scopeSpans.flatMap(s=>s.spans)))checkAttributes(span.attributes,`span ${span.name}`,ATTRIBUTE_KEYS,ID_KEYS);
  if(call.body.resourceLogs)for(const record of call.body.resourceLogs.flatMap(r=>r.scopeLogs.flatMap(s=>s.logRecords))){
   checkAttributes(record.attributes,`log ${record.body.stringValue}`,ATTRIBUTE_KEYS,ID_KEYS);
   assert.ok(!record.body.stringValue.includes('?'),`log body ${record.body.stringValue}`);
   assert.doesNotMatch(record.body.stringValue,/\d{8,}/);
  }
  if(call.body.resourceMetrics)for(const metric of call.body.resourceMetrics.flatMap(r=>r.scopeMetrics.flatMap(s=>s.metrics)))
   for(const point of (metric.sum??metric.histogram).dataPoints)checkAttributes(point.attributes,`metric ${metric.name}`,LABEL_KEYS,new Set());
 }
});
