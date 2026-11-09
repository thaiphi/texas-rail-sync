// ZC-06: the local responder's webhook receiver (scripts/alert-receiver.mjs). Real HTTP on an ephemeral port.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAlertReceiver,parseArgs,DEFAULT_TOKEN} from '../scripts/alert-receiver.mjs';

const TOKEN='test-token';
// The shape Grafana's webhook contact point sends (trimmed).
const grafanaPayload=(status='firing')=>({
 receiver:'explorer-responder',status,
 alerts:[{status,labels:{alertname:'Explorer collection failed',service:'explorer',journey:'collect'},
  annotations:{summary:'An Explorer well collection failed',runbook_url:'https://example.test/README.md#on-call'},
  startsAt:'2026-11-09T10:00:00Z',fingerprint:'abc123'}],
 groupLabels:{alertname:'Explorer collection failed'},commonLabels:{alertname:'Explorer collection failed'},
});

async function start(t,options={}){
 const outDir=await mkdtemp(join(tmpdir(),'alerts-'));
 const seen=[];
 const server=createAlertReceiver({token:TOKEN,outDir,log:()=>{},onAlert:(file,body)=>seen.push({file,body}),...options});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 t.after(async()=>{await new Promise(done=>server.close(done));await rm(outDir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(body,headers={})=>fetch(base+'/alerts',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${TOKEN}`,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 return {base,outDir,seen,post};
}

test('a firing alert with the bearer token is saved verbatim and answered 200',async t=>{
 const {outDir,seen,post}=await start(t);
 const response=await post(grafanaPayload('firing'));
 assert.equal(response.status,200);
 const files=await readdir(outDir);
 assert.equal(files.length,1);
 assert.match(files[0],/^\d{8}T\d{6}\d{3}Z-\d{4}-firing\.json$/);
 assert.deepEqual(JSON.parse(await readFile(join(outDir,files[0]),'utf8')),grafanaPayload('firing'));
 await new Promise(done=>setImmediate(done));
 assert.equal(seen.length,1);assert.equal(seen[0].body.status,'firing');
});

test('resolved alerts are saved too, with distinct names',async t=>{
 const {outDir,post}=await start(t);
 assert.equal((await post(grafanaPayload('firing'))).status,200);
 assert.equal((await post(grafanaPayload('resolved'))).status,200);
 const files=(await readdir(outDir)).sort();
 assert.equal(files.length,2);
 assert.ok(files.some(f=>f.endsWith('-firing.json'))&&files.some(f=>f.endsWith('-resolved.json')),files.join());
});

test('the file name never comes from the payload',async t=>{
 const {outDir,post}=await start(t);
 assert.equal((await post({...grafanaPayload(),status:'../../evil'})).status,200);
 const [file]=await readdir(outDir);
 assert.match(file,/-unknown\.json$/);
});

test('missing or wrong token is refused and nothing is saved',async t=>{
 const {outDir,seen,post}=await start(t);
 assert.equal((await post(grafanaPayload(),{authorization:''})).status,401);
 assert.equal((await post(grafanaPayload(),{authorization:'Bearer nope'})).status,401);
 assert.equal((await post(grafanaPayload(),{authorization:`Basic ${TOKEN}`})).status,401);
 assert.deepEqual(await readdir(outDir),[]);assert.equal(seen.length,0);
});

test('invalid JSON is 400, an oversized body is 413, other routes are 404, health is 200',async t=>{
 const {base,outDir,post}=await start(t,{maxBytes:200});
 assert.equal((await post('{not json')).status,400);
 assert.equal((await post({pad:'x'.repeat(500)})).status,413);
 assert.equal((await fetch(base+'/alerts')).status,404);
 assert.equal((await fetch(base+'/other',{method:'POST'})).status,404);
 assert.equal((await fetch(base+'/health')).status,200);
 assert.deepEqual(await readdir(outDir),[]);
});

test('a failing onAlert hook never changes the answer',async t=>{
 const {post}=await start(t,{onAlert:()=>{throw Error('boom');}});
 assert.equal((await post(grafanaPayload())).status,200);
});

test('CLI defaults: loopback, port 8001, tmp/alerts, local token; flags override',()=>{
 const defaults=parseArgs([],{});
 assert.equal(defaults.bind,'127.0.0.1');assert.equal(defaults.port,8001);
 assert.match(defaults.outDir.replace(/\\/g,'/'),/\/tmp\/alerts$/);
 assert.equal(defaults.token,DEFAULT_TOKEN);assert.equal(DEFAULT_TOKEN,'explorer-local-alert-token');
 const custom=parseArgs(['--bind','0.0.0.0','--port','9001','--out','x/y'],{ALERT_WEBHOOK_TOKEN:'own'});
 assert.equal(custom.bind,'0.0.0.0');assert.equal(custom.port,9001);assert.equal(custom.token,'own');
 assert.match(custom.outDir.replace(/\\/g,'/'),/\/x\/y$/);
 assert.throws(()=>parseArgs(['--port','abc'],{}),/--port/);
 assert.throws(()=>parseArgs(['--nope'],{}),/Unknown argument/);
});
