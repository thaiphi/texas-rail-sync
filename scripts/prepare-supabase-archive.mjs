// Creates a local transfer snapshot only; never collects, exports, or repins data.
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const destination=resolve(root,'tmp/supabase-archive-2026-10-11');
const files=[];
async function add(path){const bytes=await readFile(resolve(root,path));files.push({path,sha256:hash(bytes),byteCount:bytes.length,bytes});}
async function walk(path){for(const entry of await readdir(resolve(root,path),{withFileTypes:true})){const child=path+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Refusing symbolic link: '+child);if(entry.isDirectory())await walk(child);else if(entry.isFile())await add(child);else throw Error('Unsupported file: '+child);}}
for(const path of ['artifacts','runs','raw','collected-sources','lookups'])await walk(path);
for(const path of ['public/artifact-path.json','public/artifact-integrity.json'])await add(path);
files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
await mkdir(destination,{recursive:true});
const batches=[],seen=new Set();let batch=[],size=0;
function flush(){if(batch.length)batches.push(batch);batch=[];size=0;}
for(const file of files){file.chunkHashes=[];for(let offset=0;offset<file.bytes.length;offset+=32768){
 const bytes=file.bytes.subarray(offset,offset+32768),sha256=hash(bytes);file.chunkHashes.push(sha256);if(seen.has(sha256))continue;seen.add(sha256);if(size+bytes.length>32768)flush();batch.push({sha256,base64:bytes.toString('base64')});size+=bytes.length;
}}
flush();
const manifest=files.map(({bytes,...entry})=>({...entry,chunkCount:Math.ceil(bytes.length/32768)}));
const snapshotId='trrc-'+hash(Buffer.from(JSON.stringify(manifest)));
await writeFile(resolve(destination,'manifest.json'),JSON.stringify({snapshotId,files:manifest,batches:batches.length},null,2)+'\n');
for(let index=0;index<batches.length;index++)await writeFile(resolve(destination,'batch-'+index+'.json'),JSON.stringify(batches[index]));
console.log(JSON.stringify({snapshotId,files:manifest,batches:batches.length,byteCount:files.reduce((sum,file)=>sum+file.byteCount,0)}));
