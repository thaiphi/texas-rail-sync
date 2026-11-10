// ZC-07 (issue #43): the on-call demo's break and reset commands. It never runs Claude.
//   node scripts/oncall/demo.mjs break [--no-push]   worktree tmp/oncall-demo on new branch oncall-demo/<stamp> from
//                                                    origin/main, plant the bug, commit, push (unless --no-push), npm ci
//   node scripts/oncall/demo.mjs reset               remove the demo worktree; remote demo/fix branches stay as evidence
// git and npm are injected runners, so the unit tests never touch the real repository or origin.
import {execFileSync,execSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {plantInto,PLANT_COMMIT_MESSAGE} from './plant.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
// Same stamp as the receiver and responder: 20261109T100000123Z, sortable and safe in branch and file names.
const stamp=date=>date.toISOString().replace(/[-:.]/g,'');
const demoDir=repoRoot=>join(repoRoot,'tmp','oncall-demo');

const runGit=(args,{cwd}={})=>{execFileSync('git',args,{cwd,stdio:'inherit'});};
// npm is npm.cmd on Windows, which only starts through a shell; the arguments are fixed constants.
const runNpm=(args,{cwd}={})=>{
 if(process.platform==='win32')execSync(['npm',...args].join(' '),{cwd,stdio:'inherit'});
 else execFileSync('npm',args,{cwd,stdio:'inherit'});
};

export async function breakDemo({repoRoot=root,git=runGit,npm=runNpm,now=()=>new Date(),push=true,log=console.log}={}){
 const workdir=demoDir(repoRoot),branch=`oncall-demo/${stamp(now())}`;
 if(existsSync(workdir))throw Error(`${workdir} already exists: run "npm run oncall:reset" first`);
 await git(['fetch','origin','main'],{cwd:repoRoot});
 await git(['worktree','add','-b',branch,workdir,'origin/main'],{cwd:repoRoot});
 await plantInto(workdir);
 await git(['-C',workdir,'commit','-am',PLANT_COMMIT_MESSAGE],{cwd:repoRoot});
 if(push)await git(['-C',workdir,'push','-u','origin',branch],{cwd:repoRoot});
 else log('oncall-demo: --no-push, the branch stays local');
 await npm(['ci','--no-audit','--no-fund'],{cwd:workdir});
 log(`oncall-demo: broken demo ready in ${workdir} on ${branch}`);
 return {branch,workdir};
}

export async function resetDemo({repoRoot=root,git=runGit,log=console.log}={}){
 const workdir=demoDir(repoRoot);
 if(!existsSync(workdir)){
  // A stale registration (directory deleted by hand) would block the next break, so prune anyway.
  await git(['worktree','prune'],{cwd:repoRoot});
  return log(`oncall-demo: nothing to reset (${workdir} does not exist)`);
 }
 await git(['worktree','remove','--force',workdir],{cwd:repoRoot});
 await git(['worktree','prune'],{cwd:repoRoot});
 log(`oncall-demo: removed ${workdir}; remote oncall-demo/* and oncall-fix/* branches are kept`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [command,...rest]=process.argv.slice(2);
 try{
  const unknown=rest.filter(arg=>!(command==='break'&&arg==='--no-push'));
  if(unknown.length)throw Error(`Unknown argument: ${unknown[0]}`);
  if(command==='break')await breakDemo({push:!rest.includes('--no-push')});
  else if(command==='reset')await resetDemo();
  else throw Error('usage: node scripts/oncall/demo.mjs break [--no-push] | reset');
 }catch(error){
  console.error(`oncall-demo: ${error.message}`);process.exitCode=1;
 }
}
