// ZC-07 (issue #43): the on-call responder. createResponder() returns the `onAlert(file, body)` hook for
// scripts/alert-receiver.mjs: on a firing "Explorer collection failed" alert it starts headless Claude Code as the
// `on-call-engineer` project subagent in the demo worktree (which must be on an `oncall-demo/*` branch).
// One agent at a time, no queue; a wall-clock timeout kills a stuck agent. Each run writes <outRoot>/<stamp>/:
// alert.json (the triggering body), settings.json (the agent's permission rules) and agent.jsonl (the stream-json log).
// The process starter (and execFile, for the Windows taskkill) is injected, so the unit tests never run the real `claude`.
import {spawn as nodeSpawn,execFileSync,execFile} from 'node:child_process';
import {existsSync,openSync,closeSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

export const ALERT_NAME='Explorer collection failed';
// Same stamp as the receiver: 20261109T100000123Z, sortable and safe in Windows file names.
const stamp=date=>date.toISOString().replace(/[-:.]/g,'');

export function shouldRespond(body){
 return body?.status==='firing'&&Array.isArray(body.alerts)&&body.alerts.some(alert=>alert?.status==='firing'&&alert?.labels?.alertname===ALERT_NAME);
}

// No webhook token (the agent must not be able to fake alerts) and no OTEL_* (its repro collects must not send
// telemetry and re-fire the alert). Auto memory is off (CLAUDE_CODE_DISABLE_AUTO_MEMORY=1, which outranks any
// setting), so the owner's per-repository memory never loads into the agent.
export function agentEnv(env){
 return {...Object.fromEntries(Object.entries(env).filter(([key])=>key!=='ALERT_WEBHOOK_TOKEN'&&!key.startsWith('OTEL_'))),CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1'};
}

// `:*` is a trailing word-boundary wildcard (same as ` *`), so a prefix that ends inside a word (`oncall-fix/`,
// `3000/`, `--force`) uses a bare `*` instead. Read paths starting `./` are relative to the agent's cwd (the demo
// worktree); `//**/` rules are anchored at the filesystem root and match at any depth, so they also cover the main
// checkout around tmp/oncall-demo (../../scripts/oncall and the like). None of them matches the run dir tmp/oncall/<stamp>/.
const ANSWER_KEY=['scripts/oncall/**','test/oncall/**','docs/superpowers/specs/*zc07*','docs/superpowers/plans/*zc07*','docs/evidence/**'];
export function agentSettings(){
 return {autoMemoryEnabled:false,permissions:{
  allow:['Read','Edit','Write','Grep','Glob','Skill(incident-response)','Bash(npm test:*)','Bash(npm ci:*)','Bash(node scripts/collect-fixture.mjs:*)','Bash(node --test test/*)',
   'Bash(git status:*)','Bash(git diff:*)','Bash(git log:*)','Bash(git switch -c oncall-fix/*)','Bash(git add:*)','Bash(git commit:*)',
   'Bash(git push -u origin oncall-fix/*)','Bash(gh pr create:*)','Bash(curl -s http://127.0.0.1:3000/*)'],
  deny:['Bash(gh pr merge:*)','Bash(git push --force*)','Bash(git push -f:*)','Bash(git push origin main:*)','Bash(gh auth:*)',
   // The answer-key tests live outside `npm test`; running them is as revealing as reading them. Bare `node --test`
   // runs every *.test.mjs, test/oncall/ included.
   'Bash(node --test)','Bash(node --test test/oncall*)','Bash(node --test ./test/oncall*)','Bash(npm run test:oncall*)','Bash(*test/oncall*)','Bash(*scripts/oncall*)',
   // History patches hold the spec, the plan and the answer key.
   'Bash(git log -p*)','Bash(git log --patch*)','Bash(git log -u*)','Bash(git log * -p*)','Bash(git log * --patch*)',
   'Read(./.env*)',...ANSWER_KEY.map(path=>`Read(./${path})`),...[...ANSWER_KEY,'.superpowers/**'].map(path=>`Read(//**/${path})`)],
 }};
}

export function buildAgentCommand({settingsFile,runDir,maxTurns}){
 return {command:'claude',args:['-p','--agent','on-call-engineer','--output-format','stream-json','--verbose','--max-turns',String(maxTurns),
  '--permission-mode','acceptEdits','--settings',settingsFile,'--add-dir',runDir]};
}

export function agentPrompt({alertFile,demoBranch,runDir}){
 return `Alert fired. The webhook body is at ${alertFile}. The demo branch is ${demoBranch}: branch your fix from it and open the PR against it. `+
  `Write any report to ${runDir}. Follow the incident-response skill.`;
}

export const windowsCommand=({command,args,settingsFile,runDir})=>[command,...args.map(arg=>arg===settingsFile||arg===runDir?`"${arg}"`:arg)].join(' ');

const gitBranch=workdir=>execFileSync('git',['-C',workdir,'rev-parse','--abbrev-ref','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const WIN=process.platform==='win32';
// With shell:true on Windows (claude is an npm .cmd shim) child.kill() only stops cmd.exe, so kill the whole tree.
const stop=(child,log,runFile)=>{
 if(WIN&&child.pid)runFile('taskkill',['/pid',String(child.pid),'/T','/F'],error=>{if(error)log(`oncall: taskkill of agent pid ${child.pid} failed: ${error.message}`);});
 else child.kill();
};

export function createResponder({workdir,outRoot,spawn=nodeSpawn,log=console.log,now=()=>new Date(),maxTurns=60,timeoutMs=1_200_000,currentBranch=gitBranch,execFile:runFile=execFile}){
 let active=null;
 const refuse=reason=>{log(`oncall: not starting an agent: ${reason}`);return {started:false,reason};};
 return async(file,body)=>{
  if(!shouldRespond(body)){log(`oncall: ignored ${file}: not a firing collection alert`);return {started:false,reason:'not a firing collection alert'};}
  if(active)return refuse('agent already running');
  if(!workdir||!existsSync(workdir))return refuse(`demo worktree ${workdir} does not exist`);
  let branch;
  try{branch=currentBranch(workdir);}catch(error){return refuse(`could not read the branch of ${workdir}: ${error?.message}`);}
  if(!String(branch).startsWith('oncall-demo/'))return refuse(`demo worktree ${workdir} is on ${branch}, not an oncall-demo/ branch`);
  const run={};active=run;
  const release=()=>{clearTimeout(run.timer);if(active===run)active=null;};
  const runDir=resolve(outRoot,stamp(now())),alertFile=join(runDir,'alert.json'),settingsFile=join(runDir,'settings.json');
  let child;
  try{
   await mkdir(runDir,{recursive:true});
   await writeFile(alertFile,JSON.stringify(body,null,1)+'\n');
   await writeFile(settingsFile,JSON.stringify(agentSettings(),null,1)+'\n');
   const {command,args}=buildAgentCommand({settingsFile,runDir,maxTurns});
   const out=openSync(join(runDir,'agent.jsonl'),'w');
   const options={cwd:workdir,env:agentEnv(process.env),stdio:['pipe',out,'pipe'],shell:WIN};
   // On Windows (shell:true) pass ONE command string, not an args array (DEP0190). cmd.exe splits on spaces, so the
   // two path arguments are quoted; every other argument is a fixed constant.
   try{child=WIN?spawn(windowsCommand({command,args,settingsFile,runDir}),options):spawn(command,args,options);}
   finally{closeSync(out);}
  }catch(error){release();return refuse(`could not start the agent: ${error?.code??error?.message}`);}
  const started=now();
  const seconds=()=>((now()-started)/1000).toFixed(1);
  child.on('exit',(code,signal)=>{log(`oncall: agent exited with code ${code??signal} after ${seconds()} s (${runDir})`);release();});
  child.on('error',error=>{log(`oncall: agent failed: ${error?.code??error?.message}`);release();});
  child.stderr?.on('data',chunk=>log(`oncall: agent stderr: ${String(chunk).trimEnd()}`));
  // unref: the receiver's server keeps the process alive, and a pending timer must not hold up anything else.
  run.timer=setTimeout(()=>{log(`oncall: agent timed out after ${timeoutMs} ms, killing it`);try{stop(child,log,runFile);}catch(error){log(`oncall: could not kill the agent: ${error?.message}`);}release();},timeoutMs);
  run.timer.unref?.();
  child.stdin?.on('error',()=>{});
  child.stdin?.end(agentPrompt({alertFile,demoBranch:branch,runDir}));
  log(`oncall: started the on-call agent on ${branch} in ${workdir} -> ${runDir}`);
  return {started:true};
 };
}
