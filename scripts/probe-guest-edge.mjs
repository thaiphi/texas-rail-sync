// Local-only cached Edge probe. No hosted calls, credentials, or source collection.
// Writes a self-contained bundle/results into a unique tmp directory. Docker is
// network-isolated, has no published ports and is removed in finally.
import {readFile,writeFile,mkdir,readdir,cp,mkdtemp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildVersionArchive} from '../src/versionArchive.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const docker='C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const image='public.ecr.aws/supabase/edge-runtime:v1.77.1';
const dir=await mkdtemp(resolve(root,'tmp/guest-core-edge-'));
const name='trrc-guest-core-'+dir.split(/[\\/]/).at(-1).toLowerCase();
const hash=b=>createHash('sha256').update(b).digest('hex');
function run(args){const result=spawnSync(docker,args,{encoding:'utf8',maxBuffer:10_000_000});if(result.status!==0)throw Error(result.stderr||result.stdout);return result.stdout;}
const packages=[];
for(const id of (await readdir(resolve(root,'artifacts'))).sort()){
 if(!id.startsWith('rrc-2026-10-10-'))continue;
 const pinsBytes=await readFile(resolve(root,'artifacts',id,'version-pins.json'));
 const pins={...JSON.parse(pinsBytes),publicationPinsSha256:hash(pinsBytes),defaultPinned:false};
 const files={};for(const file of await readdir(resolve(root,'artifacts',id,'sources')))files[file]=(await readFile(resolve(root,'artifacts',id,'sources',file))).toString('base64');
 const archive=await buildVersionArchive({directory:resolve(root,'artifacts',id),pins});
 packages.push({id,files,archiveBytes:archive.length,archiveSha256:hash(archive)});
}
if(packages.length!==2)throw Error('Expected exactly the two preserved public v2 versions');
await mkdir(resolve(dir,'worker/lib'),{recursive:true});await mkdir(resolve(dir,'main'));await mkdir(resolve(dir,'events'));
await cp(resolve(root,'src'),resolve(dir,'worker/lib/src'),{recursive:true});
await cp(resolve(root,'public'),resolve(dir,'worker/lib/public'),{recursive:true});
await writeFile(resolve(dir,'worker/data.mjs'),`export default ${JSON.stringify(packages)};\n`);
await writeFile(resolve(dir,'worker/deno.json'),' {"nodeModulesDir":"manual","compilerOptions":{"types":[]}}\n');
const worker=String.raw`
import packages from './data.mjs';
import {Buffer} from 'node:buffer';
import {createMemoryGuestJournal} from './lib/src/hosted/guest-journal.mjs';
import {createMemoryObjectStore} from './lib/src/hosted/evidence-store.mjs';
import {createGuestService} from './lib/src/hosted/guest-steps.mjs';
import {createLocalReferenceAdmission} from './lib/src/hosted/guest-admission.mjs';
import {createSupabaseObjectStore} from './lib/src/hosted/guest-transport.mjs';
import {sha256} from './lib/src/normalize.mjs';
const decode=b=>new Uint8Array(Buffer.from(b,'base64'));
Deno.serve(async request=>{
 const {caseName,index=0}=await request.json(),data=packages[index],started=performance.now();
 const report={caseName,index,scope:'local memory adapters; no Storage/SQL or hosted reachability',runtime:Deno.version,bufferGlobal:typeof globalThis.Buffer,steps:[],ok:false};
 const samples=[];const sample=label=>samples.push({label,...(typeof Deno.memoryUsage==='function'?Deno.memoryUsage():{})});
 sample('start');
 try{
  if(caseName==='cpu-control'){const stop=performance.now()+5000;while(performance.now()<stop){};throw Error('CPU supervisor failed to terminate control');}
  if(caseName==='transport'){
   const original=new TextEncoder().encode('controlled object transport'),expected=original.slice(),key='sha256/'+sha256(expected),objects=new Map();
   const store=createSupabaseObjectStore({url:'https://local-test.supabase.co',secretKey:'sb_secret_local_test_not_a_credential',fetchImpl:async(url,init)=>{
    if(init.method==='POST'){objects.set(url,new Uint8Array(init.body));return new Response(null,{status:201});}
    return objects.has(url)?new Response(objects.get(url)):new Response(null,{status:404});
   }});
   const upload=store.put(key,original);original.fill(0);await upload;
   const actual=await store.get(key);const empty=new Uint8Array();await store.put('sha256/'+sha256(empty),empty);
   let substitutionRefused=false;try{await store.put('sha256/'+('a'.repeat(64)),expected);}catch(error){substitutionRefused=error.code==='STORAGE_INVALID';}
   const unavailable=createSupabaseObjectStore({url:'https://local-test.supabase.co',secretKey:'sb_secret_local_test_not_a_credential',fetchImpl:async()=>new Response(null,{status:503})});
   let serviceFailure=false;try{await unavailable.put(key,expected);}catch(error){serviceFailure=error.code==='STORAGE_UNAVAILABLE';}
   report.ok=sha256(actual)===sha256(expected)&&substitutionRefused&&serviceFailure;report.controlledTransportOnly=true;sample('transport-end');report.memorySamples=samples;report.workerWallMs=+(performance.now()-started).toFixed(2);return Response.json(report);
  }
  let calls=0;const files=new Map(Object.entries(data.files).map(([k,v])=>[k,decode(v)]));
  const fixture=caseName.startsWith('fixture');
  if(caseName==='fixture-padded'){
   const target=[...files.keys()].find(k=>k==='candidate-monthly.json');
   if(!target)throw Error('Monthly source name not found');
   files.set(target,Buffer.concat([Buffer.from(files.get(target)),Buffer.alloc(7_000_000,32)]));
  }
  const responses=new Map();for(const [key,value] of files){if(!key.endsWith('.source.json'))continue;const meta=JSON.parse(Buffer.from(value));const prefix=key.slice(0,-'.source.json'.length);const bodyName=[...files.keys()].find(name=>!name.endsWith('.source.json')&&name.replace(/\.[^.]+$/,'')===prefix);if(bodyName&&!responses.has(meta.url))responses.set(meta.url,files.get(bodyName));}
  const journal=createMemoryGuestJournal(),store=createMemoryObjectStore();
  // Disposable test-only allowance, not hosted capacity evidence. Include the new
  // metering/proof code in CPU and memory measurements without external I/O.
  const at=Date.now(),admission=createLocalReferenceAdmission({attest:async()=>({source:'operator_attested',attestedAt:new Date(at).toISOString(),expiresAt:new Date(at+590_000).toISOString(),storageLimitBytes:1_000_000_000,storageRemainingBytes:900_000_000,projectStorageBytes:50_000_000,databaseLimitBytes:500_000_000,databaseRemainingBytes:480_000_000,projectDatabaseBytes:15_000_000,egressLimitBytes:5_000_000_000,egressRemainingBytes:4_000_000_000})});
  const service=createGuestService({journal,store,admission,preserved:{artifactIds:[data.id],read:async(id,name)=>{if(id!==data.id||!files.has(name))throw Object.assign(Error('Absent'),{code:'ENOENT'});return files.get(name).slice();}},...(fixture?{testFixture:true,fetchImpl:async url=>{calls++;return responses.has(String(url))?new Response(responses.get(String(url))):new Response('Absent',{status:404});}}:{})});
  const {token}=await service.issueSession();
  const other=await service.issueSession();
  let job;
  if(fixture){
   job=(await service.enqueueLookup({token,idemKey:'probe-lookup-00000001',request:{kind:'uic',value:'000020838'}})).job;
   for(let i=0;i<3;i++)job=await service.advance({token,jobId:job.jobId});
   if(job.state!=='succeeded')throw Error('Lookup failed '+JSON.stringify(job));
   job=(await service.enqueueCollection({token,idemKey:'probe-collection-0001',request:{lookupJobId:job.jobId,sourceRecordKey:'lookup:1',startMonth:'2024-01',endMonth:'2026-04'}})).job;
  }else job=(await service.enqueueReplay({token,idemKey:'probe-replay-00000001',request:{artifactId:data.id}})).job;
  let ownerRefused=false;try{await service.job({token:other.token,jobId:job.jobId});}catch(error){ownerRefused=error.code==='NOT_FOUND';}
  for(let i=0;i<12&&!['succeeded','failed','interrupted'].includes(job.state);i++){
   const stamp=performance.now(),step=job.stepName;job=await service.advance({token,jobId:job.jobId});
   report.steps.push({step,state:job.state,errorCode:job.errorCode,wallMs:+(performance.now()-stamp).toFixed(2)});sample(step);
  }
  report.ownerRefused=ownerRefused;report.fetchCalls=calls;report.state=job.state;report.errorCode=job.errorCode;
  if(fixture){report.ok=ownerRefused&&job.state==='failed'&&job.errorCode==='ARCHIVE_INVALID';report.testFixture=job.testFixture;}
  else{
   const archive=await service.archive({token,jobId:job.jobId}),run=await service.run({token,jobId:job.jobId,runId:job.runId});
   report.archiveBytes=archive.bytes.length;report.archiveSha256=sha256(archive.bytes);report.mode=run.mode;
   report.ok=ownerRefused&&job.state==='succeeded'&&run.mode==='offline_replay'&&report.archiveBytes===data.archiveBytes&&report.archiveSha256===data.archiveSha256;
  }
 }catch(error){report.failure={name:error.name,code:error.code??null,message:error.message};}
 sample('end');report.memorySamples=samples;report.workerWallMs=+(performance.now()-started).toFixed(2);return Response.json(report);
});
`;
await writeFile(resolve(dir,'worker/index.js'),worker);
await writeFile(resolve(dir,'events/index.ts'),'const events = new globalThis.EventManager(); for await (const data of events) if (data) console.log(JSON.stringify(data));\n');
await writeFile(resolve(dir,'main/index.ts'),`Deno.serve(async req=>{if(new URL(req.url).pathname==='/health')return Response.json({ready:true});try{const worker=await EdgeRuntime.userWorkers.create({servicePath:'/probe/worker',memoryLimitMb:256,workerTimeoutMs:150000,cpuTimeSoftLimitMs:2000,cpuTimeHardLimitMs:2000,noModuleCache:true,forceCreate:true,netAccessDisabled:true,envVars:[]});return await worker.fetch(req);}catch(error){return Response.json({ok:false,terminated:true,message:String(error.message)},{status:500});}});\n`);
const results=[];let logs='';
try{
 run(['run','--pull=never','-d','--name',name,'--network','none','--memory','768m','--mount',`type=bind,source=${dir},target=/probe,readonly`,image,'start','--main-service','/probe/main','--event-worker','/probe/events','--policy','oneshot']);
 const request=(payload,health=false)=>{
  if(payload!==null)spawnSync(process.execPath,['-e',`require('fs').writeFileSync(process.argv[1],process.argv[2])`,resolve(dir,'request.json'),JSON.stringify(payload)]);
  const args=['run','--pull=never','--rm','--network',`container:${name}`,'--mount',`type=bind,source=${dir},target=/probe,readonly`,'curlimages/curl:latest','--silent','--show-error','--max-time','35'];
  if(!health)args.push('--request','POST','--header','Content-Type: application/json','--data-binary','@/probe/request.json');
  return JSON.parse(run([...args,`http://127.0.0.1:9000/${health?'health':'probe'}`]));
 };
 for(let i=0;i<10;i++){try{if(request(null,true).ready)break;}catch(error){if(i===9)throw error;await new Promise(r=>setTimeout(r,300));}}
 for(const payload of [{caseName:'replay',index:0},{caseName:'replay',index:1},{caseName:'fixture',index:0},{caseName:'fixture-padded',index:0},{caseName:'transport'},{caseName:'cpu-control'}]){
  const result={...request(payload),caseName:payload.caseName};results.push(result);console.log(JSON.stringify({caseName:payload.caseName,index:payload.index??0,ok:result.ok,failure:result.failure??null,terminated:result.terminated??false}));
 }
}finally{
 try{run(['stop','--time','5',name]);logs=run(['logs',name]);}finally{run(['rm',name]);}
 await writeFile(resolve(dir,'runtime.log'),logs);
 const events=logs.split(/\r?\n/).flatMap(line=>{try{const value=JSON.parse(line);return value.event_type?[value]:[];}catch{return [];}});
 const sourceHashes={};for(const file of ['src/hosted/guest-journal.mjs','src/hosted/guest-admission.mjs','src/hosted/evidence-store.mjs','src/hosted/guest-steps.mjs','src/hosted/guest-transport.mjs','src/exportCore.mjs','public/archive-bytes.js'])sourceHashes[file]=hash(await readFile(resolve(dir,'worker/lib',file)));
 const cpuControlEnforced=Boolean(results.find(value=>value.caseName==='cpu-control')?.terminated&&events.some(event=>event.event.cpu_time_used>=2000));
 const report={scope:'Local cached Edge guest reference adapters, not hosted/durable/Storage I/O',image,imageId:run(['image','inspect','--format','{{.Id}}',image]).trim(),sourceHashes,limits:{cpuHardMs:2000,memoryMb:256,wallMs:150000},cpuControlEnforced,packages:packages.map(({files,...rest})=>rest),results,events};
 await writeFile(resolve(dir,'results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({evidence:resolve(dir,'results.json'),runtimeEvents:events.length}));
 if(!cpuControlEnforced)process.exitCode=1;
}
if(results.filter(value=>value.caseName!=='cpu-control').some(value=>!value.ok)||!results.find(value=>value.caseName==='cpu-control')?.terminated)process.exitCode=1;
