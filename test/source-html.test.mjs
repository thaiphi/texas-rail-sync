import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExplorerServer} from '../scripts/serve.mjs';
test('preserved publisher HTML remains byte-identical and inert for viewing and downloads',async t=>{
 const server=createExplorerServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
 for(const name of ['rrc-resources.html','uic-query-help.html'])for(const download of ['', '?download=1']){
  const path=`/artifacts/rrc-2026-10-09-uic000020838-v1/sources/${name}`,response=await fetch(base+path+download);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/plain\b/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL('../'+path.slice(1),import.meta.url)));
  if(download)assert.equal(response.headers.get('content-disposition'),`attachment; filename="${name}"`);
 }
 const head=await fetch(base+'/artifacts/rrc-2026-10-09-uic000020838-v1/sources/rrc-resources.html',{method:'HEAD'});assert.match(head.headers.get('content-type'),/^text\/plain\b/);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.match((await fetch(base+'/')).headers.get('content-type'),/^text\/html\b/,'application entrypoint retains its intended document type');
});
