// ZC-07 (issue #43): the on-call responder (scripts/oncall/responder.mjs) with a fake process starter: never the real claude.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,readdir,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ALERT_NAME,shouldRespond,agentEnv,agentSettings,buildAgentCommand,agentPrompt,createResponder,windowsCommand} from '../../scripts/oncall/responder.mjs';

const WIN=process.platform==='win32';

const payload=(status='firing',alertname=ALERT_NAME)=>({receiver:'explorer-responder',status,
 alerts:[{status,labels:{alertname,service:'explorer',journey:'collect'},startsAt:'2026-11-09T10:00:00Z',fingerprint:'abc123'}]});

// child_process.spawn stand-in: records each call; stdio is ignored; stdin collects the prompt. On Windows the
// responder passes one command string and no args array: spawn(command, options).
function fakeSpawn(){
 const calls=[];
 const spawn=(command,args,options)=>{
  if(!Array.isArray(args)){options=args;args=undefined;}
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stderr=new PassThrough();child.killed=[];
  let prompt='';child.stdin.on('data',chunk=>prompt+=chunk);
  child.kill=signal=>{child.killed.push(signal??'SIGTERM');return true;};
  const call={command,args,options,child,get prompt(){return prompt;}};
  calls.push(call);return child;
 };
 return {spawn,calls};
}

async function setup(t,options={}){
 const base=await mkdtemp(join(tmpdir(),'oncall-responder-'));
 t.after(()=>rm(base,{recursive:true,force:true}));
 const workdir=join(base,'demo'),outRoot=join(base,'out');
 await mkdir(workdir);
 const {spawn,calls}=fakeSpawn(),logs=[];
 let tick=Date.parse('2026-11-09T10:00:00.000Z');
 const respond=createResponder({workdir,outRoot,spawn,log:line=>logs.push(line),now:()=>new Date(tick++),currentBranch:()=>'oncall-demo/20261109T1',...options});
 return {base,workdir,outRoot,respond,calls,logs};
}
const tick=()=>new Promise(done=>setImmediate(done));

test('shouldRespond fires only on a firing collection alert',()=>{
 assert.equal(shouldRespond(payload('firing')),true);
 assert.equal(shouldRespond(payload('resolved')),false);
 assert.equal(shouldRespond(payload('firing','Some other alert')),false);
 assert.equal(shouldRespond({status:'firing',alerts:[{status:'resolved',labels:{alertname:ALERT_NAME}}]}),false);
 assert.equal(shouldRespond(null),false);
 assert.equal(shouldRespond({status:'firing'}),false);
 assert.equal(shouldRespond({status:'firing',alerts:[null]}),false);
});

test('agentEnv strips the webhook token and OTEL variables and turns off auto memory',()=>{
 assert.deepEqual(agentEnv({ALERT_WEBHOOK_TOKEN:'x',OTEL_EXPORTER_OTLP_ENDPOINT:'y',OTEL_SERVICE_NAME:'z',GH_TOKEN:'g',PATH:'p'}),{GH_TOKEN:'g',PATH:'p',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1'});
 // `0` would force auto memory on, so an inherited value must not survive.
 assert.equal(agentEnv({CLAUDE_CODE_DISABLE_AUTO_MEMORY:'0'}).CLAUDE_CODE_DISABLE_AUTO_MEMORY,'1');
});

test('buildAgentCommand returns the exact claude arguments',()=>{
 assert.deepEqual(buildAgentCommand({settingsFile:'/r/settings.json',runDir:'/r',maxTurns:60}),{command:'claude',
  args:['-p','--agent','on-call-engineer','--output-format','stream-json','--verbose','--max-turns','60','--permission-mode','acceptEdits','--settings','/r/settings.json','--add-dir','/r']});
});

test('agentPrompt names the alert file, the demo branch and the run dir',()=>{
 const prompt=agentPrompt({alertFile:'/r/alert.json',demoBranch:'oncall-demo/x',runDir:'/r'});
 for(const value of ['/r/alert.json','oncall-demo/x','/r','Follow the incident-response skill'])assert.ok(prompt.includes(value),value);
});

test('agentSettings denies merge, force push and the answer key',()=>{
 const settings=agentSettings(),{permissions:{allow,deny}}=settings;
 for(const rule of ['Bash(gh pr merge:*)','Read(./scripts/oncall/**)','Bash(git push --force*)','Bash(git push origin main:*)','Read(./.env*)','Read(./docs/evidence/**)',
  'Read(./test/oncall/**)','Bash(node --test)','Bash(node --test test/oncall*)','Bash(node --test ./test/oncall*)','Bash(npm run test:oncall*)','Bash(*test/oncall*)','Bash(*scripts/oncall*)'])assert.ok(deny.includes(rule),rule);
 assert.equal(deny.some(rule=>rule.includes('test/oncall-')),false);
 assert.equal(settings.autoMemoryEnabled,false);
 assert.ok(allow.includes('Skill(incident-response)'));
 assert.equal(allow.some(rule=>rule.includes('merge')),false);
 // `:*` needs a word boundary, so prefixes ending mid-word must use a bare `*` or they would never match.
 assert.equal([...allow,...deny].some(rule=>/[/-]:\*\)$/.test(rule)),false);
 assert.ok(allow.includes('Bash(git switch -c oncall-fix/*)'));
 assert.ok(allow.includes('Bash(git push -u origin oncall-fix/*)'));
});

test('agentSettings denies history patches',()=>{
 const {permissions:{deny}}=agentSettings();
 for(const rule of ['Bash(git log -p*)','Bash(git log --patch*)','Bash(git log -u*)','Bash(git log * -p*)','Bash(git log * --patch*)'])assert.ok(deny.includes(rule),rule);
});

test('agentSettings denies the answer key at any depth, but not the run dir',()=>{
 const {permissions:{deny}}=agentSettings();
 for(const path of ['scripts/oncall/**','test/oncall/**','.superpowers/**','docs/evidence/**','docs/superpowers/specs/*zc07*','docs/superpowers/plans/*zc07*'])
  assert.ok(deny.includes(`Read(//**/${path})`),path);
 // The agent reads alert.json and writes report.md in tmp/oncall/<stamp>/.
 assert.equal(deny.some(rule=>/tmp\/oncall|\(\/\/\*\*\/oncall/.test(rule)),false);
});

test('windowsCommand joins one command string with the two paths quoted',()=>{
 const settingsFile='C:\\r dir\\settings.json',runDir='C:\\r dir';
 const {command,args}=buildAgentCommand({settingsFile,runDir,maxTurns:60});
 assert.equal(windowsCommand({command,args,settingsFile,runDir}),
  `claude -p --agent on-call-engineer --output-format stream-json --verbose --max-turns 60 --permission-mode acceptEdits --settings "${settingsFile}" --add-dir "${runDir}"`);
});

test('a firing alert starts one agent in the demo worktree',async t=>{
 const {workdir,outRoot,respond,calls}=await setup(t);
 process.env.ALERT_WEBHOOK_TOKEN='secret-for-test';process.env.OTEL_SERVICE_NAME='explorer-test';
 t.after(()=>{delete process.env.ALERT_WEBHOOK_TOKEN;delete process.env.OTEL_SERVICE_NAME;});
 assert.deepEqual(await respond('/alerts/a.json',payload('firing')),{started:true});
 assert.equal(calls.length,1);
 const [call]=calls;
 if(WIN){
  // One command string and no args array (DEP0190), with the two path arguments quoted.
  assert.equal(call.args,undefined);
  assert.match(call.command,/^claude -p --agent on-call-engineer /);
 }else{
  assert.equal(call.command,'claude');
  assert.ok(call.args.includes('on-call-engineer'));
 }
 assert.equal(call.options.cwd,workdir);
 assert.equal(call.options.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY,'1');
 assert.equal('ALERT_WEBHOOK_TOKEN' in call.options.env,false);
 assert.equal('OTEL_SERVICE_NAME' in call.options.env,false);
 assert.equal(call.options.shell,process.platform==='win32');
 assert.equal(typeof call.options.stdio[1],'number');
 const [runName]=await readdir(outRoot);
 assert.match(runName,/^\d{8}T\d{6}\d{3}Z$/);
 const runDir=join(outRoot,runName);
 await tick();
 assert.ok(call.prompt.includes(join(runDir,'alert.json')));
 assert.ok(call.prompt.includes('oncall-demo/20261109T1'));
 assert.deepEqual(JSON.parse(await readFile(join(runDir,'alert.json'),'utf8')),payload('firing'));
 assert.deepEqual(JSON.parse(await readFile(join(runDir,'settings.json'),'utf8')),agentSettings());
 if(WIN)assert.ok(call.command.includes(`--settings "${join(runDir,'settings.json')}" --add-dir "${runDir}"`),call.command);
 assert.ok(existsSync(join(runDir,'agent.jsonl')));
 call.child.emit('exit',0,null);
});

test('resolved alert starts nothing',async t=>{
 const {respond,calls,outRoot}=await setup(t);
 assert.deepEqual(await respond('/alerts/r.json',payload('resolved')),{started:false,reason:'not a firing collection alert'});
 assert.equal(calls.length,0);assert.equal(existsSync(outRoot),false);
});

test('second firing while running is ignored, and accepted again after exit',async t=>{
 const {respond,calls,logs}=await setup(t);
 assert.equal((await respond('/a/1.json',payload())).started,true);
 assert.deepEqual(await respond('/a/2.json',payload()),{started:false,reason:'agent already running'});
 assert.ok(logs.some(line=>line.includes('agent already running')));
 calls[0].child.emit('exit',0,null);
 assert.equal((await respond('/a/3.json',payload())).started,true);
 assert.equal(calls.length,2);
 assert.ok(logs.some(line=>/exited with code 0 after/.test(line)));
 calls[1].child.emit('exit',0,null);
});

test('spawn error releases the lock',async t=>{
 const {respond,calls}=await setup(t);
 assert.equal((await respond('/a/1.json',payload())).started,true);
 calls[0].child.emit('error',Object.assign(new Error('spawn claude ENOENT'),{code:'ENOENT'}));
 assert.equal((await respond('/a/2.json',payload())).started,true);
 calls[1].child.emit('exit',0,null);
});

test('a synchronous spawn throw is refused and releases the lock',async t=>{
 let fail=true;const {spawn,calls}=fakeSpawn();
 const {respond}=await setup(t,{spawn:(...args)=>{if(fail){fail=false;throw Object.assign(new Error('boom'),{code:'EACCES'});}return spawn(...args);}});
 const first=await respond('/a/1.json',payload());
 assert.equal(first.started,false);assert.match(first.reason,/EACCES/);
 assert.equal((await respond('/a/2.json',payload())).started,true);
 calls[0].child.emit('exit',0,null);
});

test('timeout kills the agent and releases the lock',async t=>{
 const {respond,calls,logs}=await setup(t,{timeoutMs:20});
 assert.equal((await respond('/a/1.json',payload())).started,true);
 await new Promise(done=>setTimeout(done,60));
 assert.equal(calls[0].child.killed.length,1);
 assert.ok(logs.some(line=>line.includes('timed out')));
 assert.equal((await respond('/a/2.json',payload())).started,true);
 // The killed agent's late exit must not release the new agent's lock.
 calls[0].child.emit('exit',null,'SIGTERM');
 assert.deepEqual(await respond('/a/3.json',payload()),{started:false,reason:'agent already running'});
 calls[1].child.emit('exit',0,null);
});

test('on Windows a failed taskkill is logged',{skip:!WIN&&'taskkill runs only on Windows'},async t=>{
 const killed=[];
 const execFile=(file,args,done)=>{killed.push([file,...args]);done(Object.assign(new Error('access denied'),{code:5}));};
 const {spawn,calls}=fakeSpawn();
 const {respond,logs}=await setup(t,{timeoutMs:20,execFile,spawn:(...args)=>{const child=spawn(...args);child.pid=4242;return child;}});
 assert.equal((await respond('/a/1.json',payload())).started,true);
 await new Promise(done=>setTimeout(done,60));
 assert.deepEqual(killed,[['taskkill','/pid','4242','/T','/F']]);
 assert.ok(logs.some(line=>/taskkill of agent pid 4242 failed: access denied/.test(line)),logs.join('\n'));
 calls[0].child.emit('exit',null,'SIGTERM');
});

test('missing worktree or wrong branch refuses',async t=>{
 const {base,outRoot,calls}=await setup(t);
 const {spawn,calls:more}=fakeSpawn();
 const missing=createResponder({workdir:join(base,'nope'),outRoot,spawn,log:()=>{},currentBranch:()=>'oncall-demo/x'});
 const gone=await missing('/a/1.json',payload());
 assert.equal(gone.started,false);assert.match(gone.reason,/does not exist/);
 const onMain=createResponder({workdir:base,outRoot,spawn,log:()=>{},currentBranch:()=>'main'});
 const wrong=await onMain('/a/2.json',payload());
 assert.equal(wrong.started,false);assert.match(wrong.reason,/oncall-demo\//);
 assert.equal(calls.length+more.length,0);
});
