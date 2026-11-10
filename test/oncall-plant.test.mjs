// ZC-07 (issue #43): the on-call demo's planted bug (scripts/oncall/plant.mjs). Proves the transform is exact and
// that the planted copy really fails a no-network fixture collection, while an unplanted copy still succeeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {plantBug,plantInto,PLANT_TARGET} from '../scripts/oncall/plant.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const run=promisify(execFile);
const count=(text,needle)=>text.split(needle).length-1;
const COPY_PARTS=['src','scripts','public','raw',join('test','fixtures'),'package.json'];

// A throwaway copy under the repo's tmp/ so node_modules (in the repo root) still resolves upward.
async function copyRepo(t){
 await mkdir(join(root,'tmp'),{recursive:true});
 const dir=await mkdtemp(join(root,'tmp','oncall-plant-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const part of COPY_PARTS)await cp(join(root,part),join(dir,part),{recursive:true});
 return dir;
}

async function collect(dir){
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('OTEL_')));
 // A failed collect exits 1 by design; the JSON on stdout is still the result.
 const {stdout}=await run(process.execPath,[join(dir,'scripts','collect-fixture.mjs')],{cwd:dir,env}).catch(error=>error);
 return JSON.parse(stdout);
}

test('plantBug replaces both byte caps',async()=>{
 const source=await readFile(join(root,PLANT_TARGET),'utf8');
 const result=plantBug(source);
 assert.equal(count(result,'10_000_000'),0);
 assert.equal(count(result,'1_000_000'),2);
 assert.equal(result.replaceAll('1_000_000','10_000_000'),source);
});

test('plantBug refuses a drifted target',()=>{
 assert.throws(()=>plantBug('const a=1;'),/src\/sourceFetch\.mjs.*0/);
 assert.throws(()=>plantBug('10_000_000 10_000_000 10_000_000'),/3/);
});

test('the planted bug fails a real fixture collection',async t=>{
 const dir=await copyRepo(t);
 await plantInto(dir);
 const results=await collect(dir);
 assert.equal(results.length,1);
 assert.partialDeepStrictEqual(results[0],{outcome:'failed',stage:'load',errorCode:'SOURCE_LIMIT'});
});

test('the unplanted copy still succeeds',async t=>{
 const dir=await copyRepo(t);
 const results=await collect(dir);
 assert.equal(results.length,1);
 assert.equal(results[0].outcome,'succeeded');
});
