// ZC-05 Task 4: the no-network fixture collect driver (CI and on-call). Fixture network only; no real RRC call.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readdir} from 'node:fs/promises';
import {createFixtureTelemetry,runFixtureCollects,parseArgs} from '../scripts/collect-fixture.mjs';
const tmp=new URL('../tmp/',import.meta.url);
const listTmp=async()=>{await mkdir(tmp,{recursive:true});return new Set(await readdir(tmp));};

test('runFixtureCollects with both modes',async()=>{
 const calls=[],before=await listTmp();
 const {telemetry,roots}=createFixtureTelemetry({},{endpoint:'http://collector.test:4318',serviceVersion:'test',environment:'test',warn:()=>{},fetchImpl:(url,init)=>{calls.push({url,body:init.body});return Promise.resolve({ok:true,status:200});}});
 const results=await runFixtureCollects({modes:['success','failed'],telemetry,roots});
 await telemetry.shutdown();
 assert.equal(results.length,2);
 const [success,failed]=results;
 assert.equal(success.mode,'success');assert.equal(success.status,201);assert.equal(success.outcome,'succeeded');
 assert.equal(success.stage,'none');assert.equal(success.errorCode,'none');assert.equal(typeof success.runId,'string');
 assert.equal(failed.mode,'failed');assert.equal(failed.status,502);assert.equal(failed.outcome,'failed');
 assert.equal(failed.stage,'load');assert.equal(failed.errorCode,'HTTP_ERROR');assert.equal(typeof failed.runId,'string');
 for(const {traceId} of results)assert.match(traceId,/^[0-9a-f]{32}$/);
 assert.notEqual(success.traceId,failed.traceId);
 assert.ok(calls.some(c=>c.url.endsWith('/v1/traces')&&c.body.includes(failed.traceId)),'the failed trace was exported');
 const after=await listTmp();
 // Other test files create their own tmp/ dirs concurrently; only this driver's prefix counts.
 assert.deepEqual([...after].filter(name=>!before.has(name)&&name.startsWith('collect-fixture-')),[],'no leftover tmp/ directory');
});

test('no endpoint: no-op telemetry still runs and reports outcomes',async()=>{
 const {telemetry,roots}=createFixtureTelemetry({});
 const [result]=await runFixtureCollects({modes:['success'],telemetry,roots});
 await telemetry.shutdown();
 assert.equal(result.outcome,'succeeded');assert.equal(result.traceId,null);
});

// ZC-06: `npm run alert:trigger` passes the endpoint as a flag, because `VAR=x node ...` fails in npm scripts on Windows.
test('parseArgs: modes, --out and --endpoint',()=>{
 assert.deepEqual(parseArgs([]),{modes:['success'],out:null,endpoint:null});
 assert.deepEqual(parseArgs(['--fail','--endpoint','http://127.0.0.1:4318']),{modes:['failed'],out:null,endpoint:'http://127.0.0.1:4318'});
 assert.deepEqual(parseArgs(['--both','--out','f.json']).modes,['success','failed']);
 assert.throws(()=>parseArgs(['--endpoint']),/--endpoint needs a URL/);
 assert.throws(()=>parseArgs(['--endpoint','--fail']),/--endpoint needs a URL/);
});
