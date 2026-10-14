// Isolated local PostgreSQL contract gate. Never connects to hosted Supabase.
// Uses cached PG17, no published ports/network; service_role exists only in this
// disposable database. The RPC adapter below exercises SQL through psql, not
// PostgREST/Storage authentication. It does not certify hosted transport.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createSupabaseGuestJournal} from '../src/hosted/guest-transport.mjs';
import {createMemoryObjectStore} from '../src/hosted/evidence-store.mjs';
import {createGuestService} from '../src/hosted/guest-steps.mjs';
import {createJournalAdmission} from '../src/hosted/guest-admission.mjs';
import {sha256} from '../src/normalize.mjs';
import {createRunRecorder,resumeRunRecorder} from '../src/runEvents.mjs';
import {monotonicClock} from '../src/hosted/guest-journal.mjs';
import {workflowView} from '../public/workflow.js';
import {buildVersionArchive} from '../src/versionArchive.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const migration=await readFile(resolve(root,'docs/sql/trrc-guest-journal-DRAFT-not-applied.sql'),'utf8');
const docker='C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const name='trrc-sql-'+randomUUID(),report={scope:'ephemeral PostgreSQL17 RPC contract; not hosted PostgREST, grants, Storage or quotas',checks:[],failed:[],sqlErrors:[]};
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
function command(args){const result=spawnSync(docker,args,{encoding:'utf8',maxBuffer:8_000_000});if(result.status!==0)throw Error(result.stderr||result.stdout);return result.stdout;}
async function sql(text,role=null){
 return new Promise((resolve,reject)=>{
  // Existing image bootstrap identity owns Storage; no grants or ownership changes.
  // This does not prove the hosted migration owner's permissions.
  const child=spawn(docker,['exec','-i',name,'psql','-U','supabase_admin','-d','postgres','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);
  child.on('close',code=>code===0?resolve(stdout.trim()):reject(Error(stderr.trim())));
  child.stdin.end((role?`SET ROLE ${role};\n`:'')+text+'\n');
 });
}
const journal=createSupabaseGuestJournal({url:'https://local-test.supabase.co',secretKey:'sb_secret_local_test_not_a_credential',fetchImpl:async(url,init)=>{
 const operation=new URL(url).pathname.split('/').at(-1);assert.match(operation,/^trrc_guest_[a-z_]+$/);
 try{const value=await sql(`SELECT public.${operation}(${literal(init.body)}::jsonb->'args');`,'service_role');return Response.json(value?JSON.parse(value):null);}
 catch(error){report.sqlErrors.push({operation,message:error.message.slice(0,800)});return Response.json({message:error.message.replace(/^ERROR:\s*/,'').split('\n')[0]},{status:400});}
}});
async function gate(label,fn){try{await fn();report.checks.push({label,result:'PASS'});console.log('PASS '+label);}catch(error){report.failed.push({label,result:'FAIL',message:error.message});console.log('FAIL '+label+': '+error.message);throw error;}}
const tokenHash=sha256(randomUUID()),otherHash=sha256(randomUUID()),digest=sha256('request');
const request={tokenHash,idemKey:'postgres-lookup-00001',kind:'lookup',requestDigest:digest,request:{kind:'uic',value:'000020838'},testFixture:false};
 let original,published;
try{
 command(['run','--pull=never','-d','--name',name,'--network','none','--memory','768m','-e','POSTGRES_PASSWORD=trrc-local-test-only','public.ecr.aws/supabase/postgres:17.6.1.143']);
 // The image briefly starts a socket-only init server, then replaces it. Require
 // TCP readiness inside the network-isolated container to avoid testing that server.
 for(let i=0;i<60;i++){try{command(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch(error){if(i===59)throw error;await new Promise(r=>setTimeout(r,400));}}
 await sql("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
 await gate('unapplied SQL draft loads in isolated PostgreSQL17',()=>sql(migration));
 await gate('budget draft loads with existing local Storage metadata and a private fixture attestation',async()=>{
  // This SQL-only gate has no Storage service; the empty metadata table is an explicit
  // local stub. The native Storage gate uses the actual vendor-managed table instead.
  await sql('CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE IF NOT EXISTS storage.objects (bucket_id text,name text,metadata jsonb);');
  await sql(await readFile(resolve(root,'docs/sql/trrc-guest-budget-DRAFT-not-applied.sql'),'utf8'));
  // Disposable-test allowance only, never a claim about hosted usage or billing.
  await sql("INSERT INTO trrc_guest.platform_proofs(source,attested_at,expires_at,storage_limit_bytes,storage_remaining_bytes,project_storage_bytes,database_limit_bytes,database_remaining_bytes,project_database_bytes,egress_limit_bytes,egress_remaining_bytes) VALUES ('operator_attested',clock_timestamp(),clock_timestamp()+interval '590 seconds',1000000000,900000000,(select project_bytes from trrc_guest.storage_measure()),1000000000,500000000,pg_database_size(current_database()),5000000000,4000000000);");
 });
 // The local stub gains Storage's object age (defaulted, so three-value inserts still work);
 // the ops draft then loads after the budget draft, as the migration orders them.
 await sql('ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();');
 await sql(await readFile(resolve(root,'docs/sql/trrc-guest-ops-DRAFT-not-applied.sql'),'utf8'));
 await gate('anonymous and authenticated callers cannot issue guest tokens',async()=>{for(const role of ['anon','authenticated'])await assert.rejects(sql(`SELECT public.trrc_guest_issue_token('{"tokenHash":"${tokenHash}"}'::jsonb);`,role),/permission denied/);});
 await gate('service role creates tokens and persists owned jobs',async()=>{await journal.issueToken({tokenHash});await journal.issueToken({tokenHash:otherHash});original=(await journal.enqueue(request)).job;assert.equal(original.state,'queued');assert.equal((await journal.job({tokenHash,jobId:original.jobId})).jobId,original.jobId);});
 await gate('idempotent retries reuse jobs and changed requests are refused',async()=>{assert.equal((await journal.enqueue(request)).replayed,true);await assert.rejects(journal.enqueue({...request,requestDigest:sha256('changed')}),e=>e.code==='IDEMPOTENCY_CONFLICT');});
 await gate('another token cannot read or claim the job',async()=>{for(const fn of [()=>journal.job({tokenHash:otherHash,jobId:original.jobId}),()=>journal.claim({tokenHash:otherHash,jobId:original.jobId,leaseOwner:randomUUID()})])await assert.rejects(fn(),e=>e.code==='NOT_FOUND');});
 await gate('concurrent claim executes one fenced lease',async()=>{const claims=await Promise.all([1,2].map(()=>journal.claim({tokenHash,jobId:original.jobId,leaseOwner:randomUUID()})));assert.equal(claims.filter(c=>c.lease).length,1);const lease=claims.find(c=>c.lease).lease;await assert.rejects(journal.advance({lease:{...lease,fence:lease.fence+1},data:{}}),e=>e.code==='LEASE_LOST');await journal.fail({lease,errorCode:'HTTP_ERROR'});});
 await gate('numeric bytes, staged keys and invalid run timestamps fail with contract errors',async()=>{
  const {job}=await journal.enqueue({...request,idemKey:'postgres-validation-001'});
  const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
  const entry={sha256:digest,bytes:1.5,objectKey:`sha256/${digest}`},errors=[];
  const badRun=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v2',schemaVersion:1,transformationVersion:'rrc-odp-v2.0.0',clock:monotonicClock(lease.stampBase)}).snapshot();badRun.startedAt='not-a-timestamp';
  for(const [label,fn,code] of [
   ['reservation',()=>journal.reserveObject({lease,...entry}),'REQUEST_INVALID'],
   ['evidence',()=>journal.recordEvidence({lease,attemptId:'L1-a1',path:'lookup-metadata.json',...entry}),'REQUEST_INVALID'],
   ['staged',()=>journal.recordStaged({lease,entries:[{name:'manifest.json',...entry}]}),'REQUEST_INVALID'],
   ['staged extra keys',()=>journal.recordStaged({lease,entries:[{name:'manifest.json',sha256:digest,bytes:1,objectKey:`sha256/${digest}`,extra:true}]}),'REQUEST_INVALID'],
   ['run timestamp',()=>journal.advance({lease,data:{},run:badRun}),'RUN_STATE_INVALID']
  ])try{await assert.rejects(fn(),e=>e.code===code);}catch(error){errors.push(label+': '+error.message);}
  await journal.fail({lease,errorCode:'HTTP_ERROR'});assert.deepEqual(errors,[]);
 });
 await gate('lease expiry is rechecked after waiting for a row lock',async()=>{
  const {job}=await journal.enqueue({...request,idemKey:'postgres-lock-expiry-01'});
  const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
  await sql(`UPDATE trrc_guest.jobs SET lease_expires_at=clock_timestamp()+interval '2 seconds' WHERE job_id=${literal(job.jobId)}::uuid;`);
  const holding=sql(`SET application_name='trrc-lock-regression'; BEGIN; SELECT job_id FROM trrc_guest.jobs WHERE job_id=${literal(job.jobId)}::uuid FOR UPDATE; SELECT pg_sleep(3); COMMIT;`);
  try{
   let ready=false;for(let i=0;i<20;i++){if(await sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='trrc-lock-regression' AND query LIKE 'SELECT pg_sleep%');")==='t'){ready=true;break;}await new Promise(r=>setTimeout(r,25));}
   assert.equal(ready,true,'lock holder not observed');
   assert.equal(await sql(`SELECT lease_expires_at>clock_timestamp() FROM trrc_guest.jobs WHERE job_id=${literal(job.jobId)}::uuid;`),'t','test must start before lease expiry');
   await assert.rejects(journal.advance({lease,data:{}}),e=>e.code==='LEASE_LOST');
  }finally{await holding;}
  await sql(`UPDATE trrc_guest.jobs SET lane_deadline=clock_timestamp()-interval '1 second' WHERE job_id=${literal(job.jobId)}::uuid;`);
 });
 await gate('one global lookup lane admits only one concurrent request',async()=>{
  const queued=await Promise.allSettled([tokenHash,otherHash].map((hash,i)=>journal.enqueue({...request,tokenHash:hash,idemKey:`postgres-concurrent-000${i}`})));
  assert.equal(queued.filter(r=>r.status==='fulfilled').length,1);assert.equal(queued.find(r=>r.status==='rejected').reason.code,'LANE_BUSY');
  const winner=queued.find(r=>r.status==='fulfilled').value.job,hash=queued[0].status==='fulfilled'?tokenHash:otherHash;
  const {lease}=await journal.claim({tokenHash:hash,jobId:winner.jobId,leaseOwner:randomUUID()});await journal.fail({lease,errorCode:'HTTP_ERROR'});
 });
 await gate('interrupted SQL run is owned, append-only and accepted by workflowView',async()=>{
  const {job}=await journal.enqueue({...request,kind:'replay',idemKey:'postgres-interruption-01',request:{artifactId:'preserved-public'}});
  const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
  const recorder=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v2',schemaVersion:1,transformationVersion:'rrc-odp-v2.0.0',clock:monotonicClock(lease.stampBase)});recorder.start('load');const previous=recorder.snapshot();
  await journal.advance({lease,data:{},run:previous});
  await sql(`UPDATE trrc_guest.jobs SET lane_deadline=clock_timestamp()-interval '1 second' WHERE job_id=${literal(job.jobId)}::uuid;`);
  const next=(await journal.enqueue({...request,tokenHash:otherHash,kind:'replay',idemKey:'postgres-after-interrupt',request:{artifactId:'preserved-public'}})).job;
  const view=await journal.job({tokenHash,jobId:job.jobId});assert.equal(view.state,'interrupted');assert.equal(view.runId,previous.runId);
  const run=await journal.run({tokenHash,jobId:job.jobId,runId:previous.runId});assert.deepEqual(run.events.slice(0,previous.events.length),previous.events);
  assert.deepEqual(workflowView(run).stages.map(s=>s.status),['failed','skipped','skipped']);assert.equal(run.events[1].evidence.reason,'LANE_DEADLINE');
  const expected=resumeRunRecorder(previous,{clock:monotonicClock(run.events[1].timestamp)});
  expected.fail('load',Object.assign(Error('Lane deadline passed before the next step'),{code:'LANE_DEADLINE'}),run.events[1].evidence);
  assert.deepEqual(run,expected.snapshot());
  const held=await journal.claim({tokenHash:otherHash,jobId:next.jobId,leaseOwner:randomUUID()});await journal.fail({lease:held.lease,errorCode:'HTTP_ERROR'});
 });
 await gate('SQL evidence cap and cleanup tombstones preserve journal references',async()=>{
  const {job}=await journal.enqueue({...request,idemKey:'postgres-cap-cleanup-01'});
  const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
  const entry={sha256:'a'.repeat(64),bytes:10_000_000,objectKey:`sha256/${'a'.repeat(64)}`};
  await journal.recordEvidence({lease,attemptId:'L1-a1',path:'lookup-metadata.json',...entry});
  await assert.rejects(journal.recordEvidence({lease,attemptId:'L1-a1',path:'lookup-metadata.source.json',sha256:digest,bytes:1,objectKey:`sha256/${digest}`}),e=>e.code==='SOURCE_LIMIT');
  await journal.fail({lease,errorCode:'HTTP_ERROR'});
  await sql(`UPDATE trrc_guest.jobs SET terminal_at=clock_timestamp()-interval '25 hours' WHERE job_id=${literal(job.jobId)}::uuid;`);
  const maintenance=await journal.claimMaintenance({leaseOwner:randomUUID()}),keys=await journal.cleanupCandidates({lease:maintenance});assert.deepEqual(keys,[entry.objectKey]);
  const next=(await journal.enqueue({...request,idemKey:'postgres-tombstone-01'})).job,held=await journal.claim({tokenHash,jobId:next.jobId,leaseOwner:randomUUID()});
  await assert.rejects(journal.reserveObject({lease:held.lease,...entry}),e=>e.code==='OBJECT_BUSY');
  assert.deepEqual(await journal.confirmCleanup({lease:maintenance,keys}),{removed:1});
  await journal.fail({lease:held.lease,errorCode:'HTTP_ERROR'});
 });
 await gate('restart preserves token ownership and job identity',async()=>{command(['restart','--time','5',name]);for(let i=0;i<20;i++){try{command(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch(error){if(i===19)throw error;await new Promise(r=>setTimeout(r,300));}}assert.equal((await journal.job({tokenHash,jobId:original.jobId})).state,'failed');});
 await gate('all guest service steps replay a public version through durable SQL',async()=>{
  const id=(await readdir(resolve(root,'artifacts'))).find(name=>name.startsWith('rrc-2026-10-10-uic000020838-'));
  const service=createGuestService({journal,store:createMemoryObjectStore(),admission:createJournalAdmission(journal),preserved:{artifactIds:[id],read:(artifactId,name)=>readFile(resolve(root,'artifacts',artifactId,'sources',name))}});
  const {token}=await service.issueSession();let {job}=await service.enqueueReplay({token,idemKey:'postgres-public-replay-01',request:{artifactId:id}});
  for(let i=0;i<3;i++)job=await service.advance({token,jobId:job.jobId});
  assert.equal(job.state,'succeeded',JSON.stringify(job));assert.equal(job.result.mode,'offline_replay');
  const run=await service.run({token,jobId:job.jobId,runId:job.runId});assert.equal(run.status,'succeeded');assert.equal(run.mode,'offline_replay');
  const archive=await service.archive({token,jobId:job.jobId});assert.equal(sha256(archive.bytes),job.result.archiveSha256);
  const pinsBytes=await readFile(resolve(root,'artifacts',id,'version-pins.json'));
  const frozen=await buildVersionArchive({directory:resolve(root,'artifacts',id),pins:{...JSON.parse(pinsBytes),publicationPinsSha256:sha256(pinsBytes),defaultPinned:false}});
  assert.deepEqual(Buffer.from(archive.bytes),frozen);
  published={tokenHash:sha256(token),jobId:job.jobId,runId:job.runId,archiveBytes:job.result.archiveBytes};
 });
 await gate('private journal tables and helpers remain inaccessible to the service caller',async()=>{
  await assert.rejects(sql('SELECT count(*) FROM trrc_guest.jobs;','service_role'),/permission denied/);
  await assert.rejects(sql("SELECT trrc_guest.owner('"+tokenHash+"');",'service_role'),/permission denied/);
 });
 await gate('concurrent duplicate token issuance yields a contract error',async()=>{
  const hash=sha256(randomUUID()),results=await Promise.allSettled([1,2].map(()=>journal.issueToken({tokenHash:hash})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'REQUEST_INVALID');
 });
 await gate('retry backoff, attempt budget and read-only polling stay coherent',async()=>{
  const hash=sha256(randomUUID());await journal.issueToken({tokenHash:hash});
  const {job}=await journal.enqueue({...request,tokenHash:hash,idemKey:'postgres-retry-budget-01'});
  const first=await journal.claim({tokenHash:hash,jobId:job.jobId,leaseOwner:randomUUID()});
  const waiting=await journal.retry({lease:first.lease,data:{},backoffMs:30_000});assert.equal(waiting.state,'retry_wait');assert.equal(waiting.due,false);
  assert.deepEqual(await journal.job({tokenHash:hash,jobId:job.jobId}),waiting);
  assert.equal((await journal.claim({tokenHash:hash,jobId:job.jobId,leaseOwner:randomUUID()})).lease,null);
  await sql(`UPDATE trrc_guest.jobs SET next_step_at=clock_timestamp()-interval '1 second' WHERE job_id=${literal(job.jobId)}::uuid;`);
  const second=await journal.claim({tokenHash:hash,jobId:job.jobId,leaseOwner:randomUUID()});assert.ok(second.lease.fence>first.lease.fence);
  await assert.rejects(journal.renew({lease:first.lease}),e=>e.code==='LEASE_LOST');
  await assert.rejects(journal.retry({lease:second.lease,data:{},backoffMs:30_000}),e=>e.code==='RUN_STATE_INVALID');
  await journal.fail({lease:second.lease,errorCode:'HTTP_ERROR'});
 });
 await gate('selected source evidence cannot be replaced by another step',async()=>{
  const hash=sha256(randomUUID());await journal.issueToken({tokenHash:hash});
  const {job}=await journal.enqueue({...request,tokenHash:hash,idemKey:'postgres-selection-001'});
  let held=await journal.claim({tokenHash:hash,jobId:job.jobId,leaseOwner:randomUUID()});
  const entry={sha256:digest,bytes:1,objectKey:`sha256/${digest}`};
  await journal.recordEvidence({lease:held.lease,attemptId:'L1-a1',path:'lookup-metadata.json',...entry});
  await journal.advance({lease:held.lease,data:{},select:'L1-a1'});
  held=await journal.claim({tokenHash:hash,jobId:job.jobId,leaseOwner:randomUUID()});
  const changed=sha256('changed');await journal.recordEvidence({lease:held.lease,attemptId:'L2-a1',path:'lookup-metadata.json',sha256:changed,bytes:1,objectKey:`sha256/${changed}`});
  await assert.rejects(journal.advance({lease:held.lease,data:{},select:'L2-a1'}),e=>e.code==='EVIDENCE_CONFLICT');
  assert.equal((await journal.evidence({jobId:job.jobId}))[0].sha256,digest);
  await journal.fail({lease:held.lease,errorCode:'HTTP_ERROR'});
 });
 await gate('token and evidence expiry remain unavailable without changing preserved exports',async()=>{
  // Download quota includes request overhead, while processing never consumes a
  // download slot. These reservations perform no object read in this SQL-only gate.
  await journal.reserveEgress({kind:'processing',bytes:65536});
  for(let i=0;i<2;i++)await journal.reserveEgress({...published,kind:'download',bytes:published.archiveBytes+65536});
  await assert.rejects(journal.reserveEgress({...published,kind:'download',bytes:published.archiveBytes+65536}),e=>e.code==='DOWNLOAD_QUOTA');
  await assert.rejects(journal.reserveEgress({...published,kind:'download',bytes:published.archiveBytes}),e=>e.code==='REQUEST_INVALID');
  const hash=sha256(randomUUID());await journal.issueToken({tokenHash:hash});
  await sql(`UPDATE trrc_guest.tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=${literal(hash)};`);
  await assert.rejects(journal.history({tokenHash:hash}),e=>e.code==='TOKEN_EXPIRED');
  await sql(`UPDATE trrc_guest.jobs SET terminal_at=clock_timestamp()-interval '8 days' WHERE job_id=${literal(published.jobId)}::uuid;`);
  assert.equal((await journal.job(published)).state,'expired');
  await assert.rejects(journal.publication(published),e=>e.code==='EVIDENCE_EXPIRED');
  await assert.rejects(journal.run(published),e=>e.code==='EVIDENCE_EXPIRED');
 });
 await gate('expired proof refuses enqueue with no new job row; the service cannot attest capacity',async()=>{
  await sql("UPDATE trrc_guest.platform_proofs SET expires_at=clock_timestamp()-interval '1 second';");
  const before=await sql('SELECT count(*) FROM trrc_guest.jobs;');
  await assert.rejects(journal.enqueue({...request,idemKey:'budget-expired-proof-01'}),e=>e.code==='BUDGET_UNVERIFIED');
  assert.equal(await sql('SELECT count(*) FROM trrc_guest.jobs;'),before);
  await assert.rejects(sql("INSERT INTO trrc_guest.platform_proofs(source) VALUES ('operator_attested');",'service_role'),/permission denied/);
  await sql("UPDATE trrc_guest.platform_proofs SET expires_at=attested_at+interval '590 seconds';");
 });
 await gate('metadata in other buckets and the worst-case envelope fail closed before enqueue',async()=>{
  await sql("INSERT INTO storage.objects VALUES ('other','budget-invalid-size','{\"size\":\"invalid\"}'::jsonb);");
  await assert.rejects(journal.enqueue({...request,idemKey:'budget-invalid-size-001'}),e=>e.code==='BUDGET_UNVERIFIED');
  await sql("DELETE FROM storage.objects WHERE name='budget-invalid-size'; INSERT INTO storage.objects VALUES ('trrc-guest-evidence','budget-existing','{\"size\":200000000}'::jsonb);");
  const before=await sql('SELECT count(*) FROM trrc_guest.jobs;');
  await assert.rejects(journal.enqueue({...request,kind:'replay',request:{artifactId:'preserved-public'},idemKey:'budget-reserved-room-01'}),e=>e.code==='STORAGE_QUOTA');
  assert.equal(await sql('SELECT count(*) FROM trrc_guest.jobs;'),before);
  await sql("DELETE FROM storage.objects WHERE name='budget-existing';");
 });
 await gate('processing egress shares the monthly budget and failed reservations add no ledger row',async()=>{
  await sql("INSERT INTO trrc_guest.egress(kind,bytes,reserved_at) SELECT 'processing',150000000,clock_timestamp() FROM generate_series(1,6);");
  const before=await sql('SELECT count(*) FROM trrc_guest.egress;');
  await assert.rejects(journal.reserveEgress({kind:'processing',bytes:100000001}),e=>e.code==='EGRESS_QUOTA');
  assert.equal(await sql('SELECT count(*) FROM trrc_guest.egress;'),before);
 });
 await gate('automatic statement admits within Free-plan room',async()=>{
  // Called directly as the owner; the hosted DO block schedules it only where pg_cron exists.
  report.pgCronInstalled=await sql("SELECT exists(SELECT 1 FROM pg_extension WHERE extname='pg_cron');")==='t';
  await sql('SELECT trrc_guest.attest_platform();');
  assert.equal(await sql("SELECT attested_by,storage_limit_bytes,egress_remaining_bytes<=3000000000,expires_at-attested_at=interval '600 seconds' FROM trrc_guest.platform_proofs ORDER BY attested_at DESC,recorded_at DESC LIMIT 1;"),'pg_cron:trrc_guest_attest|1000000000|t|t');
  await assert.rejects(sql('SELECT trrc_guest.attest_platform();','service_role'),/permission denied/);
  const {job}=await journal.enqueue({...request,idemKey:'ops-automatic-statement-01'});assert.equal(job.state,'queued');
  const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});await journal.fail({lease,errorCode:'HTTP_ERROR'});
 });
 await gate('expired automatic statement refuses admission',async()=>{
  await sql("UPDATE trrc_guest.platform_proofs SET attested_at=attested_at-interval '20 minutes',expires_at=expires_at-interval '20 minutes';");
  assert.equal(await sql('SELECT attested_by FROM trrc_guest.platform_proofs ORDER BY attested_at DESC,recorded_at DESC LIMIT 1;'),'pg_cron:trrc_guest_attest');
  const before=await sql('SELECT count(*) FROM trrc_guest.jobs;');
  await assert.rejects(journal.enqueue({...request,idemKey:'ops-expired-statement-01'}),e=>e.code==='BUDGET_UNVERIFIED');
  assert.equal(await sql('SELECT count(*) FROM trrc_guest.jobs;'),before);
 });
 await gate('orphan sweep removes only old unreferenced guest objects',async()=>{
  await sql('SELECT trrc_guest.attest_platform();');
  const key=text=>`sha256/${sha256(text)}`,old=key('ops-orphan-old'),fresh=key('ops-orphan-fresh'),stale=key('ops-orphan-stale-tombstone'),kept=`sha256/${digest}`,keys=[old,fresh,stale,kept].map(literal).join(',');
  assert.equal(await sql(`SELECT trrc_guest.referenced(${literal(kept)});`),'t');
  // A stale tombstone: its holder deleted the object but died before confirming.
  await sql(`INSERT INTO storage.objects(bucket_id,name,metadata,created_at) VALUES ('trrc-guest-evidence',${literal(old)},'{"size":3}',now()-interval '2 hours'),('trrc-guest-evidence',${literal(fresh)},'{"size":3}',now()),('trrc-guest-evidence',${literal(kept)},'{"size":1}',now()-interval '2 hours'); INSERT INTO trrc_guest.tombstones(object_key) VALUES (${literal(stale)});`);
  const maintenance=await journal.claimMaintenance({leaseOwner:randomUUID()}),selected=await journal.orphanCandidates({lease:maintenance});
  assert.deepEqual(selected,[old,stale].sort());
  assert.equal(await sql(`SELECT string_agg(object_key,',' ORDER BY object_key COLLATE "C") FROM trrc_guest.tombstones WHERE object_key IN (${keys});`),[old,stale].sort().join(','));
  const {job}=await journal.enqueue({...request,idemKey:'ops-orphan-busy-0001'}),held=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
  await assert.rejects(journal.reserveObject({lease:held.lease,sha256:old.slice(7),bytes:3,objectKey:old}),e=>e.code==='OBJECT_BUSY');
  await journal.fail({lease:held.lease,errorCode:'HTTP_ERROR'});
  assert.deepEqual(await journal.confirmOrphans({lease:maintenance,keys:selected}),{removed:2});
  assert.equal(await sql(`SELECT count(*) FROM trrc_guest.tombstones WHERE object_key IN (${keys});`),'0');
  await sql(`DELETE FROM storage.objects WHERE name IN (${keys});`);
  // confirm_orphans released the lease, so the next sweep can claim it.
  const next=await journal.claimMaintenance({leaseOwner:randomUUID()});assert.ok(next?.fence>maintenance.fence);
  assert.deepEqual(await journal.confirmOrphans({lease:next,keys:[]}),{removed:0});
 });
 await gate('cleanup waits one hour after terminal',async()=>{
  // Retention (24 h lookup, 7 d otherwise) always exceeds one hour, so the hour rule is
  // isolated by zero retention inside a rolled-back transaction; nothing persists.
  const job=literal(published.jobId)+'::uuid',archive=literal(await sql(`SELECT archive_object_key FROM trrc_guest.publications WHERE job_id=${job};`));
  const seen=await sql(`BEGIN;
CREATE OR REPLACE FUNCTION trrc_guest.expires_at(j trrc_guest.jobs) RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$ select j.terminal_at $$;
UPDATE trrc_guest.jobs SET terminal_at=now()-interval '30 minutes' WHERE job_id=${job};
SELECT ${archive} IN (SELECT trrc_guest.candidates());
UPDATE trrc_guest.jobs SET terminal_at=now()-interval '2 hours' WHERE job_id=${job};
SELECT ${archive} IN (SELECT trrc_guest.candidates());
ROLLBACK;`);
  assert.deepEqual(seen.split('\n'),['f','t']);
  assert.equal(await sql(`SELECT trrc_guest.expires_at(j)-j.terminal_at FROM trrc_guest.jobs j WHERE job_id=${job};`),'7 days');
 });
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
 try{command(['rm','-f','-v',name]);}catch(error){report.cleanupError=error.message;process.exitCode=1;}
 await mkdir(resolve(root,'tmp'),{recursive:true});await writeFile(resolve(root,'tmp/guest-postgres-results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.checks.length,failed:report.failed.length,error:report.error??null}));
}
