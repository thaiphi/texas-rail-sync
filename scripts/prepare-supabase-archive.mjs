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
// D7: test-report (query_version 3) versions are local-only. Skip each such version, its raw collected-sources folder and
// every run that records a v3 pipeline or exports one; each skip is logged to stderr.
const skipped=new Set();
async function localOnly(path){
 const [top,name]=path.split('/');
 try{
  if(top==='artifacts')return JSON.parse(await readFile(resolve(root,path,'manifest.json'))).scope?.query_version===3;
  // Raw source folders of v3 collections (including failed ones) carry BHP/SRT bytes.
  if(top==='collected-sources')return (JSON.parse(await readFile(resolve(root,path,'acquisition.json'))).targets??[]).some(url=>/\/(?:qxfy-wcfs|h54t-xnbi)\.json/.test(url));
  if(top==='runs'){const record=JSON.parse(await readFile(resolve(root,path,'record.json')));const id=record.events?.find(event=>event.stage==='export'&&event.status==='succeeded')?.evidence?.artifactId;return record.pipelineVersion==='rrc-collection-v3'||Boolean(id&&v3Versions.has(id));}
 }catch(error){
  if(error.code!=='ENOENT')throw error;
  // Fail closed: a version, run or source folder without its evidence file (e.g. a crashed
  // staging folder) cannot be shown not to be v3, so it is not transferred.
  if(['artifacts','runs','collected-sources'].includes(top))return true;
 }
 return false;
}
const v3Versions=new Set();
async function walk(path){for(const entry of await readdir(resolve(root,path),{withFileTypes:true})){const child=path+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Refusing symbolic link: '+child);if(entry.isDirectory()){if(child.split('/').length===2&&await localOnly(child)){skipped.add(child);if(child.startsWith('artifacts/'))v3Versions.add(entry.name);console.error(JSON.stringify({event:'skipped_local_only_test_report_version',path:child}));continue;}await walk(child);}else if(entry.isFile())await add(child);else throw Error('Unsupported file: '+child);}}
// artifacts first, so runs can be matched to skipped v3 version IDs.
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
