import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const base='http://127.0.0.1:4187';
const artifact='artifacts/rrc-2026-10-09-uic000020838-v1/';
test('routes confine decoded paths and deliver exact pinned attachments',async t=>{
 const server=spawn(process.execPath,['scripts/serve.mjs','4187'],{cwd:new URL('../',import.meta.url),stdio:['ignore','pipe','pipe']});
 t.after(()=>server.kill());
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
 for(const path of ['/artifacts/%2e%2e%5cpackage.json?download=1','/%2e%2e%5cpackage.json','/artifacts/%2e%2e%2fpackage.json?download=1','/%2e%2e%2fpackage.json','/artifacts/%2e%2e%5cpublic%5cindex.html?download=1','/%2e%2e%5cartifacts%5crrc-2026-10-09-uic000020838-v1%5cmanifest.json']){
  const denied=await fetch(base+path,{signal:AbortSignal.timeout(5000)});
  assert.equal(denied.status,404,`decoded traversal must stay inside its selected route root: ${path}`);
  assert.equal(denied.headers.get('content-disposition'),null);
 }
 for(const name of ['inventory.csv','injection_monthly.csv','manifest.json','normalized.json','sources/uic-manual.pdf']){
  const response=await fetch(`${base}/${artifact}${name}?download=1`,{signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-disposition'),`attachment; filename="${name.split('/').at(-1)}"`);
  const bytes=Buffer.from(await response.arrayBuffer()),pinned=await readFile(new URL(`../${artifact}${name}`,import.meta.url));
  assert.deepEqual(bytes,pinned);
  assert.equal(Number(response.headers.get('content-length')),pinned.length);
 }
 const json=await fetch(`${base}/${artifact}normalized.json`,{signal:AbortSignal.timeout(5000)});
 assert.equal(json.headers.get('content-disposition'),null,'ordinary browser artifact fetch stays JSON');
 assert.equal((await json.json()).injectionMonthly.length,28);
 const head=await fetch(`${base}/${artifact}injection_monthly.csv?download=1`,{method:'HEAD',signal:AbortSignal.timeout(5000)});
 assert.equal(head.headers.get('content-disposition'),'attachment; filename="injection_monthly.csv"');
 assert.equal((await head.arrayBuffer()).byteLength,0);
});
