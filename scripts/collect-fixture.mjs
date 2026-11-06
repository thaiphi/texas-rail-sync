// ZC-05: no-network fixture collect driver for CI and the on-call agent. Each mode runs one lookup and
// one collect against an in-process Explorer server (127.0.0.1:0) on the canned fixture network, so the
// collect produces real telemetry (one trace, logs, metrics) without any RRC call. Runs from a repo
// checkout only: the fixture network reads raw/ and test/fixtures/.
//   node scripts/collect-fixture.mjs [--fail | --both] [--out <file>]
// Telemetry is a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set; then traceId is null in the output.
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createExplorerServer} from './serve.mjs';
import {telemetryFromEnv} from './telemetry.mjs';
import {fixtureNetwork,FIXTURE_LOOKUP,FIXTURE_MONTHS} from './fixture-network.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const MODES=Object.freeze({success:{fail:null,expected:'succeeded'},failed:{fail:'qq2j-f2zm',expected:'failed'}});

// Telemetry plus the list of ended root spans, so the driver can map a collect's run id to its trace id.
export function createFixtureTelemetry(env=process.env,overrides={}){
 const roots=[];
 const telemetry=telemetryFromEnv(env,{...overrides,onRootEnd:end=>{roots.push(end);}});
 return {telemetry,roots};
}

async function runOne(mode,{telemetry,roots,workDir}){
 const config=MODES[mode];
 if(!config)throw Error(`Unknown fixture mode: ${mode}`);
 await mkdir(workDir,{recursive:true});
 // collectPublicSnapshot requires sourceDir inside the repository, hence a temp dir under repo tmp/.
 const dir=await mkdtemp(resolve(workDir,'collect-fixture-'));
 const server=createExplorerServer({runRoot:resolve(dir,'runs'),lookupRoot:resolve(dir,'lookups'),sourceRoot:resolve(dir,'sources'),outputRoot:resolve(dir,'artifacts'),fetchImpl:fixtureNetwork({fail:config.fail}),testFixture:true,telemetry});
 try{
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
  const lookupResponse=await post('/api/lookup',FIXTURE_LOOKUP),lookup=await lookupResponse.json();
  if(lookupResponse.status!==200)throw Error(`Fixture lookup failed: HTTP ${lookupResponse.status} ${lookup.error?.code??''}`.trim());
  const firstRoot=roots.length;
  const response=await post('/api/collect',{lookupId:lookup.lookupId,sourceRecordKey:lookup.candidates[0].sourceRecordKey,...FIXTURE_MONTHS});
  const body=await response.json(),runId=body.run?.runId??null;
  const failedEvent=body.run?.events?.find(event=>event.status==='failed');
  const outcome=response.status===201?'succeeded':runId?'failed':'rejected';
  const stage=outcome==='succeeded'?'none':failedEvent?.stage??'request';
  const errorCode=outcome==='succeeded'?'none':failedEvent?.error?.code??body.error?.code??'REQUEST_FAILED';
  // The collect root ends synchronously after the response is written, before its body is read here.
  const collectRoots=roots.slice(firstRoot).filter(end=>end.name==='collect');
  const rootEnd=collectRoots.find(end=>runId&&end.attributes?.['run.id']===runId)??collectRoots.at(-1);
  return {mode,status:response.status,traceId:rootEnd?.traceId??null,runId,outcome,stage,errorCode};
 }finally{
  await new Promise(done=>server.close(()=>done()));
  await rm(dir,{recursive:true,force:true});
 }
}

// modes: 'success' and/or 'failed'. telemetry/roots: from createFixtureTelemetry (built from process.env
// and shut down here when omitted). workDir: parent of each mode's temp dir (default repo tmp/).
export async function runFixtureCollects({modes=['success'],telemetry,roots,workDir=resolve(root,'tmp')}={}){
 const own=telemetry?null:createFixtureTelemetry();
 const t=telemetry??own.telemetry,seen=roots??own?.roots??[];
 try{
  const results=[];
  for(const mode of modes)results.push(await runOne(mode,{telemetry:t,roots:seen,workDir}));
  return results;
 }finally{if(own)await own.telemetry.shutdown();}
}

export function parseArgs(argv){
 let modes=['success'],out=null;
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--fail')modes=['failed'];
  else if(arg==='--both')modes=['success','failed'];
  else if(arg==='--out'){out=argv[++i];if(!out)throw Error('--out needs a file path');}
  else throw Error(`Unknown argument: ${arg}`);
 }
 return {modes,out};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const {telemetry,roots}=createFixtureTelemetry();
 try{
  const {modes,out}=parseArgs(process.argv.slice(2));
  const results=await runFixtureCollects({modes,telemetry,roots});
  const json=JSON.stringify(results,null,1);
  console.log(json);
  if(out)await writeFile(out,json+'\n');
  process.exitCode=results.every(result=>result.outcome===MODES[result.mode].expected)?0:1;
 }catch(error){
  console.error(`collect-fixture: ${error.message}`);process.exitCode=1;
 }finally{
  await telemetry.shutdown();
 }
}
