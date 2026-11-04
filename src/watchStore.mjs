// E12-lite (§8): the only code that touches watched-documents/ on disk.
// watch-list.json is validated on every read and write and written atomically (temp file, then rename);
// copies/<sha256>.<pdf|html> are written once and never overwritten; checks/<check_id>.json are written once.
// Seeded copies are read where they sit under collected-sources/ and never written.
// Errors carry error.code: WATCH_LIST_MISSING, WATCH_LIST_INVALID, WATCH_COPY_CONFLICT, WATCH_PATH_INVALID,
// WATCH_COPY_MISSING, WATCH_COPY_DAMAGED (+actualSha256), WATCH_CHECK_EXISTS, REQUEST_INVALID.
import {readFile,writeFile,rename,mkdir,lstat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {validateWatchList,isStoredPath} from '../public/watch-list.js';

const LIST_FILE='watch-list.json',COPIES='copies',CHECKS='checks';
const SHA256=/^[0-9a-f]{64}$/,CHECK_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const fail=(code,message,extra={})=>{throw Object.assign(Error(message),{code},extra);};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const watchRoot=repoRoot=>resolve(repoRoot,'watched-documents');
const listFile=repoRoot=>resolve(watchRoot(repoRoot),LIST_FILE);

export async function readWatchList({repoRoot}){
 let text;
 try{text=await readFile(listFile(repoRoot),'utf8');}
 catch(error){if(error.code==='ENOENT')fail('WATCH_LIST_MISSING','There is no watch list file yet.');throw error;}
 let parsed;
 try{parsed=JSON.parse(text);}catch{fail('WATCH_LIST_INVALID',"The watch list file can't be read: it is not valid JSON.");}
 return validateWatchList(parsed);
}

// Validates before touching the disk, so an invalid list never replaces the file.
export async function writeWatchList({repoRoot},list){
 const valid=validateWatchList(list),target=listFile(repoRoot),temp=`${target}.tmp`;
 await mkdir(watchRoot(repoRoot),{recursive:true});
 try{await writeFile(temp,JSON.stringify(valid,null,2)+'\n');await rename(temp,target);}
 catch(error){await rm(temp,{force:true});throw error;}
}

// Refuses a stored path that is not repo-relative under the allowed roots, or that passes through a link.
async function verifiedLocation(repoRoot,path){
 if(!isStoredPath(path))fail('WATCH_PATH_INVALID','A saved copy path must be under watched-documents/copies/ or collected-sources/.');
 const root=resolve(repoRoot),full=resolve(root,...path.split('/'));
 if(!full.startsWith(root+sep))fail('WATCH_PATH_INVALID','A saved copy path must stay inside the repository.');
 let current=root;
 for(const part of path.split('/')){
  current=resolve(current,part);
  let info;
  try{info=await lstat(current);}
  catch(error){if(error.code==='ENOENT')fail('WATCH_COPY_MISSING',`The saved copy ${path} is missing.`);throw error;}
  if(info.isSymbolicLink())fail('WATCH_PATH_INVALID','A saved copy path must not pass through a link.');
 }
 return full;
}

export async function saveCopy({repoRoot},bytes){
 if(!(bytes instanceof Uint8Array))fail('REQUEST_INVALID','A copy must be bytes.');
 const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),hash=sha256(data);
 const extension=data.subarray(0,5).toString('latin1')==='%PDF-'?'pdf':'html';
 const path=`watched-documents/${COPIES}/${hash}.${extension}`;
 await mkdir(resolve(watchRoot(repoRoot),COPIES),{recursive:true});
 try{await writeFile(resolve(repoRoot,...path.split('/')),data,{flag:'wx'});return {path,sha256:hash,reused:false};}
 catch(error){if(error.code!=='EEXIST')throw error;}
 const existing=await readFile(await verifiedLocation(repoRoot,path));
 if(sha256(existing)!==hash)fail('WATCH_COPY_CONFLICT',`The saved copy ${path} already exists with different bytes; it is never overwritten.`);
 return {path,sha256:hash,reused:true};
}

export async function readVerifiedCopy({repoRoot},path,expectedSha256){
 const full=await verifiedLocation(repoRoot,path);
 if(typeof expectedSha256!=='string'||!SHA256.test(expectedSha256))fail('REQUEST_INVALID','An expected fingerprint must be 64 lower-case hex characters.');
 const bytes=await readFile(full),actualSha256=sha256(bytes);
 if(actualSha256!==expectedSha256)fail('WATCH_COPY_DAMAGED','This saved copy no longer matches its recorded fingerprint',{actualSha256});
 return bytes;
}

export async function writeCheckRecord({repoRoot},record){
 const id=record?.check_id;
 if(typeof id!=='string'||!CHECK_ID.test(id)||id.includes('..'))fail('REQUEST_INVALID','A check id must be letters, digits, dot, dash or underscore.');
 const path=`watched-documents/${CHECKS}/${id}.json`;
 await mkdir(resolve(watchRoot(repoRoot),CHECKS),{recursive:true});
 try{await writeFile(resolve(repoRoot,...path.split('/')),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
 catch(error){if(error.code==='EEXIST')fail('WATCH_CHECK_EXISTS',`The check record ${id} already exists.`);throw error;}
 return path;
}
