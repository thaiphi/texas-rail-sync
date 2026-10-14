// Actual cached Storage API + PostgreSQL integration, isolated local fixtures only.
// Test-only gateway translation adds a disposable JWT; this DOES NOT prove hosted
// sb_secret gateway authentication. No production JWT fallback is added anywhere.
import {readFile,writeFile,mkdtemp,readdir} from 'node:fs/promises';
import {spawnSync,spawn} from 'node:child_process';
import {randomUUID,createHmac} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createSupabaseObjectStore,createSupabaseGuestJournal} from '../src/hosted/guest-transport.mjs';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
import {runOrphanSweep} from '../src/hosted/evidence-store.mjs';
import {createJournalAdmission} from '../src/hosted/guest-admission.mjs';
import {buildVersionArchive} from '../src/versionArchive.mjs';
import {sha256} from '../src/normalize.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=await mkdtemp(resolve(root,'tmp/storage-native-'));
const docker='C:/Program Files/Docker/Docker/resources/bin/docker.exe',suffix=randomUUID(),network='trrc-storage-'+suffix,db=network+'-db',storage=network+'-api',http=network+'-http';
const secret='trrc-disposable-local-jwt-secret-never-hosted',password='trrc-local-test-only';
const jwt=role=>{const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');return `${header}.${payload}.${createHmac('sha256',secret).update(header+'.'+payload).digest('base64url')}`;};
const serviceJwt=jwt('service_role'),anonJwt=jwt('anon'),key='sb_secret_local_test_not_a_credential';
const report={scope:'Actual local Storage v1.37.7 and PostgreSQL17; fixture JWT gateway translation, NOT hosted sb_secret auth',checks:[],failures:[],journalRpcErrors:[],requests:0};
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function command(args,input=null){const result=spawnSync(docker,args,{input,encoding:null,maxBuffer:100_000_000});if(result.status!==0)throw Error(result.stderr?.toString()||result.stdout?.toString()||'Docker failed');return result.stdout;}
// Existing local Storage bootstrap owner; hosted migration-owner access is unverified.
function sql(query,role=null){return command(['exec','-i',db,'psql','-U','supabase_admin','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],(role?`SET ROLE ${role};\n`:'')+query+'\n').toString().trim();}
let counter=0;
async function request(path,{method='GET',headers={},body=null,timeout=35}={}){
 // Reuse one isolated curl helper: container creation per read was adding artificial
 // wall time to fenced steps. No production lease or byte limit is relaxed.
 const args=['exec',http,'curl','--silent','--show-error','--include','--max-time',String(timeout),'--header','Expect:','--request',method];
 for(const [name,value] of Object.entries(headers))args.push('--header',`${name}: ${value}`);
 if(body!==null){const file=`request-${++counter}.bin`;await writeFile(resolve(dir,file),typeof body==='string'?body:new Uint8Array(body));args.push('--data-binary',`@/probe/${file}`);}
 const raw=command([...args,`http://storage:5000${path}`]),split=raw.indexOf('\r\n\r\n');if(split<0)throw Error('Response headers unavailable');
 const head=raw.subarray(0,split).toString(),status=Number(/^HTTP\/\S+ (\d+)/.exec(head)?.[1]),pairs=head.split('\r\n').slice(1).flatMap(line=>{const index=line.indexOf(':');return index<0?[]:[[line.slice(0,index),line.slice(index+1).trim()]];});
 report.requests++;return new Response([204,205,304].includes(status)?null:new Uint8Array(raw.subarray(split+4)),{status,headers:pairs});
}
const store=createSupabaseObjectStore({url:'https://local-test.supabase.co',secretKey:key,fetchImpl:async(url,init)=>{
 assert.equal(init.headers.apikey,key);assert.equal(init.redirect,'error');
 return request(new URL(url).pathname.replace(/^\/storage\/v1/,''),{...init,headers:{...init.headers,authorization:`Bearer ${serviceJwt}`}});
}});
const journal=createSupabaseGuestJournal({url:'https://local-test.supabase.co',secretKey:key,fetchImpl:async(url,init)=>{
 const name=new URL(url).pathname.split('/').at(-1);assert.match(name,/^trrc_guest_[a-z_]+$/);
 try{const value=sql(`SELECT public.${name}(${literal(init.body)}::jsonb->'args');`,'service_role');return Response.json(value?JSON.parse(value):null);}
 catch(error){const message=error.message.replace(/^ERROR:\s*/,'').split('\n')[0];report.journalRpcErrors.push({rpc:name,message});return Response.json({message},{status:400});}
}});
async function gate(label,fn){try{await fn();report.checks.push({label,result:'PASS'});console.log('PASS '+label);}catch(error){report.failures.push({label,message:error.message});throw error;}}
let startedDb=false,startedStorage=false,startedNetwork=false,startedHttp=false;
try{
 command(['network','create','--internal',network]);startedNetwork=true;
 command(['run','--pull=never','-d','--name',http,'--network',network,'--mount',`type=bind,source=${dir},target=/probe,readonly`,'--entrypoint','sh','curlimages/curl:latest','-c','sleep 3600']);startedHttp=true;
 command(['run','--pull=never','-d','--name',db,'--network',network,'--network-alias','db','--memory','768m','-e',`POSTGRES_PASSWORD=${password}`,'public.ecr.aws/supabase/postgres:17.6.1.143']);startedDb=true;
 for(let i=0;i<60;i++){try{command(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch(error){if(i===59)throw error;await new Promise(r=>setTimeout(r,300));}}
 sql("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
 sql(await readFile(resolve(root,'docs/sql/trrc-guest-journal-DRAFT-not-applied.sql'),'utf8'));
 // Supabase's cached PG image pre-creates Storage owned by supabase_admin. Use
 // that existing bootstrap identity, not grants/ownership changes to force a pass.
 const env={DATABASE_URL:`postgres://supabase_admin:${password}@db:5432/postgres`,DATABASE_POOL_URL:`postgres://supabase_admin:${password}@db:5432/postgres`,PGRST_JWT_SECRET:secret,AUTH_JWT_SECRET:secret,ANON_KEY:anonJwt,SERVICE_KEY:serviceJwt,TENANT_ID:'trrc-local',REGION:'local',GLOBAL_S3_BUCKET:'trrc-local',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',SERVER_PORT:'5000',FILE_SIZE_LIMIT:'80106496',UPLOAD_FILE_SIZE_LIMIT:'80106496',DB_INSTALL_ROLES:'false',ENABLE_IMAGE_TRANSFORMATION:'false'};
 command(['run','--pull=never','-d','--name',storage,'--network',network,'--network-alias','storage','--memory','512m',...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),'public.ecr.aws/supabase/storage-api:v1.37.7']);startedStorage=true;
 await gate('actual cached Storage API becomes healthy',async()=>{for(let i=0;i<40;i++){if(command(['inspect','--format','{{.State.Running}}',storage]).toString().trim()!=='true')throw Error('Storage stopped during startup; inspect owned runtime log');try{if((await request('/status',{timeout:2})).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Storage readiness unavailable; inspect owned runtime log');});
 await gate('private test bucket is created only in disposable service',async()=>{const response=await request('/bucket',{method:'POST',headers:{authorization:`Bearer ${serviceJwt}`,'content-type':'application/json'},body:JSON.stringify({id:'trrc-guest-evidence',name:'trrc-guest-evidence',public:false,file_size_limit:80106496})});assert.equal(response.ok,true,await response.text());});
 const body=new TextEncoder().encode('real local Storage evidence'),objectKey=`sha256/${sha256(body)}`;
 await gate('actual add-only upload, binary readback and existing-byte verification',async()=>{assert.equal(await store.put(objectKey,body),'created');assert.deepEqual(new Uint8Array(await store.get(objectKey)),body);assert.equal(await store.put(objectKey,body),'verified_existing');});
 await gate('private evidence cannot be read anonymously or through a bare fake apikey',async()=>{for(const headers of [{},{apikey:key},{authorization:`Bearer ${anonJwt}`}])assert.equal((await request(`/object/trrc-guest-evidence/${objectKey}`,{headers})).ok,false);});
 await gate('Storage restart retains exact object bytes',async()=>{command(['restart','--time','5',storage]);for(let i=0;i<30;i++){try{if((await request('/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}assert.deepEqual(new Uint8Array(await store.get(objectKey)),body);});
 await gate('empty recorded evidence is distinct from an absent object',async()=>{const empty=new Uint8Array(),emptyKey=`sha256/${sha256(empty)}`;await store.put(emptyKey,empty);assert.equal((await store.get(emptyKey)).length,0);await assert.rejects(store.get(`sha256/${'f'.repeat(64)}`),e=>e.code==='ENOENT');});
 await gate('real SQL plus real Storage publishes the exact preserved public archive',async()=>{
  sql(await readFile(resolve(root,'docs/sql/trrc-guest-budget-DRAFT-not-applied.sql'),'utf8'));
  // Ops draft loads after the budget draft, as the migration and the Postgres gate order them.
  sql(await readFile(resolve(root,'docs/sql/trrc-guest-ops-DRAFT-not-applied.sql'),'utf8'));
  // Private disposable fixture attestation; these numbers do not attest hosted room.
  sql("INSERT INTO trrc_guest.platform_proofs(source,attested_at,expires_at,storage_limit_bytes,storage_remaining_bytes,project_storage_bytes,database_limit_bytes,database_remaining_bytes,project_database_bytes,egress_limit_bytes,egress_remaining_bytes) VALUES ('operator_attested',clock_timestamp(),clock_timestamp()+interval '590 seconds',1000000000,900000000,(select project_bytes from trrc_guest.storage_measure()),1000000000,500000000,pg_database_size(current_database()),5000000000,4000000000);");
  const id=(await readdir(resolve(root,'artifacts'))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
  const service=createGuestService({journal,store,admission:createJournalAdmission(journal),preserved:{artifactIds:[id],read:(artifactId,file)=>readFile(resolve(root,'artifacts',artifactId,'sources',file))}}),{token}=await service.issueSession();
  let {job}=await service.enqueueReplay({token,idemKey:'actual-storage-replay-01',request:{artifactId:id}});
  const steps=[];for(let i=0;i<3;i++){const begin=Date.now();job=await service.advance({token,jobId:job.jobId});steps.push({state:job.state,wallMs:Date.now()-begin});}
  assert.equal(job.state,'succeeded',JSON.stringify(job));const archive=await service.archive({token,jobId:job.jobId});
  const pinsBytes=await readFile(resolve(root,'artifacts',id,'version-pins.json')),frozen=await buildVersionArchive({directory:resolve(root,'artifacts',id),pins:{...JSON.parse(pinsBytes),publicationPinsSha256:sha256(pinsBytes),defaultPinned:false}});
  assert.deepEqual(Buffer.from(archive.bytes),frozen);report.replay={artifactId:id,mode:'offline_replay',steps,archiveBytes:archive.bytes.length,archiveSha256:sha256(archive.bytes)};
 });
 await gate('actual deletion is verified and missing deletion is idempotent',async()=>{await store.delete(objectKey);await assert.rejects(store.get(objectKey),e=>e.code==='ENOENT');await store.delete(objectKey);});
 await gate('orphan sweep deletes an aged unreferenced object through the real Storage API and verifies absence',async()=>{
  const orphan=new Uint8Array([7,7,7]),orphanKey=`sha256/${sha256(orphan)}`;assert.equal(await store.put(orphanKey,orphan),'created');
  // Age only this disposable fixture row past the one-hour rule; Storage itself sets created_at.
  assert.equal(sql(`UPDATE storage.objects SET created_at = now() - interval '2 hours' WHERE bucket_id = 'trrc-guest-evidence' AND name = ${literal(orphanKey)} RETURNING name;`),orphanKey);
  assert.deepEqual(await runOrphanSweep({journal,store}),{removed:1});
  await assert.rejects(store.get(orphanKey),e=>e.code==='ENOENT');
  assert.equal(sql(`SELECT count(*) FROM storage.objects WHERE name = ${literal(orphanKey)};`),'0');
  report.orphanSweep={key:orphanKey,removed:1,absentAfter:true};
 });
 report.storageMetadata=JSON.parse(sql("SELECT json_build_object('objects',count(*),'bytes',coalesce(sum((metadata->>'size')::numeric),0)) FROM storage.objects;"));
 report.budgetLedger=JSON.parse(sql("SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT kind,count(*) AS reservations,sum(bytes) AS bytes FROM trrc_guest.egress GROUP BY kind ORDER BY kind) t;"));
}catch(error){report.error=error.message;console.log('FAIL '+error.message);process.exitCode=1;}
finally{
 if(startedStorage){try{await writeFile(resolve(dir,'storage.log'),command(['logs',storage]));}catch{}command(['rm','-f','-v',storage]);}
 if(startedHttp)command(['rm','-f','-v',http]);if(startedDb)command(['rm','-f','-v',db]);if(startedNetwork)command(['network','rm',network]);
 await writeFile(resolve(dir,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({evidence:resolve(dir,'results.json'),passed:report.checks.length,failed:report.failures.length,error:report.error??null}));
}
