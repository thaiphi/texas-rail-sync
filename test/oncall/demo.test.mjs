// ZC-07 (issue #43): the on-call demo's break/reset commands (scripts/oncall/demo.mjs). Git and npm are injected
// fakes, so nothing here touches the real repository, the network or origin.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {breakDemo,resetDemo} from '../../scripts/oncall/demo.mjs';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const NOW=new Date('2026-11-09T10:00:00.123Z');
const STAMP='20261109T100000123Z';
const BRANCH=`oncall-demo/${STAMP}`;
const count=(text,needle)=>text.split(needle).length-1;

async function setup(t){
 const repoRoot=await mkdtemp(join(tmpdir(),'oncall-demo-'));
 t.after(()=>rm(repoRoot,{recursive:true,force:true}));
 const workdir=join(repoRoot,'tmp','oncall-demo');
 const source=await readFile(join(root,'src','sourceFetch.mjs'),'utf8');
 const calls=[];
 const git=async(args,opts={})=>{
  calls.push({tool:'git',args,cwd:opts.cwd});
  if(args[0]==='worktree'&&args[1]==='add'){await mkdir(join(workdir,'src'),{recursive:true});await writeFile(join(workdir,'src','sourceFetch.mjs'),source);}
 };
 const npm=async(args,opts={})=>{calls.push({tool:'npm',args,cwd:opts.cwd});};
 return {repoRoot,workdir,calls,git,npm};
}

test('breakDemo runs the steps in order and plants the bug',async t=>{
 const {repoRoot,workdir,calls,git,npm}=await setup(t);
 const result=await breakDemo({repoRoot,git,npm,now:()=>NOW,log:()=>{}});
 assert.deepEqual(result,{branch:BRANCH,workdir});
 assert.deepEqual(calls.map(call=>[call.tool,...call.args]),[
  ['git','fetch','origin','main'],
  ['git','worktree','add','-b',BRANCH,workdir,'origin/main'],
  ['git','-C',workdir,'commit','-am','Tighten source download cap'],
  ['git','-C',workdir,'push','-u','origin',BRANCH],
  ['npm','ci','--no-audit','--no-fund'],
 ]);
 assert.equal(calls[0].cwd,repoRoot);assert.equal(calls[1].cwd,repoRoot);
 assert.equal(calls[4].cwd,workdir);
 const planted=await readFile(join(workdir,'src','sourceFetch.mjs'),'utf8');
 assert.equal(count(planted,'1_000_000'),2);assert.equal(count(planted,'10_000_000'),0);
});

test('breakDemo --no-push skips the push',async t=>{
 const {repoRoot,calls,git,npm}=await setup(t);
 await breakDemo({repoRoot,git,npm,now:()=>NOW,push:false,log:()=>{}});
 assert.ok(!calls.some(call=>call.args.includes('push')),JSON.stringify(calls));
 assert.deepEqual(calls.at(-1).args,['ci','--no-audit','--no-fund']);
});

test('breakDemo refuses when tmp/oncall-demo exists',async t=>{
 const {repoRoot,workdir,calls,git,npm}=await setup(t);
 await mkdir(workdir,{recursive:true});
 await assert.rejects(breakDemo({repoRoot,git,npm,now:()=>NOW,log:()=>{}}),/oncall-demo/);
 assert.deepEqual(calls,[]);
});

test('breakDemo failing part-way rethrows and hints at oncall:reset',async t=>{
 const {repoRoot,git,npm}=await setup(t);
 const lines=[];
 const failingNpm=async(...args)=>{await npm(...args);throw Error('npm ci failed');};
 await assert.rejects(breakDemo({repoRoot,git,npm:failingNpm,now:()=>NOW,log:line=>lines.push(line)}),/npm ci failed/);
 assert.ok(lines.some(line=>line.includes('npm run oncall:reset')),lines.join('\n'));
});

test('resetDemo with no worktree does not throw',async t=>{
 const {repoRoot,calls,git}=await setup(t);
 const lines=[];
 await resetDemo({repoRoot,git,log:line=>lines.push(line)});
 assert.ok(lines.some(line=>/nothing to reset/.test(line)),lines.join('\n'));
 assert.ok(!calls.some(call=>call.args[1]==='remove'),JSON.stringify(calls));
});

test('resetDemo removes the worktree and prunes',async t=>{
 const {repoRoot,workdir,calls,git}=await setup(t);
 await mkdir(workdir,{recursive:true});
 await resetDemo({repoRoot,git,log:()=>{}});
 assert.deepEqual(calls.map(call=>call.args),[['worktree','remove','--force',workdir],['worktree','prune']]);
 assert.ok(calls.every(call=>call.cwd===repoRoot));
});
