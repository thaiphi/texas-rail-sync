// E12-lite (§8): the only code that touches watched-documents/ on disk.
// watch-list.json is validated on every read and write and written atomically (temp file, then rename);
// copies/<sha256>[.<variant>].<pdf|html> are written once and never overwritten; checks/<check_id>.json are written once.
// Seeded copies are read where they sit under collected-sources/ and never written.
// Write-once files are first written in full to a unique temp file in watched-documents/.partial/ (outside
// every stored-path root, so no stored path can name one), then hard-linked to the final name (atomic; fails
// with EEXIST instead of replacing, NTFS included). A crash or full disk mid-write never leaves a truncated
// file under the final name. Removing the temp file afterwards is best-effort: on Windows a scanner may hold it
// (EPERM/EBUSY), and a leftover .partial file is harmless because no stored path can name one.
// Errors carry error.code: WATCH_LIST_MISSING, WATCH_LIST_INVALID, WATCH_COPY_CONFLICT, WATCH_PATH_INVALID,
// WATCH_COPY_MISSING, WATCH_COPY_DAMAGED (+actualSha256), WATCH_CHECK_EXISTS, WATCH_LIST_BUSY, REQUEST_INVALID.
import {readFile,writeFile,rename,mkdir,lstat,rm,link} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {validateWatchList,isStoredPath} from '../public/watch-list.js';

const LIST_FILE='watch-list.json',COPIES='copies',CHECKS='checks',PARTIAL='.partial';
const SHA256=/^[0-9a-f]{64}$/,VARIANT=/^[a-z0-9-]{1,64}$/,CHECK_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const fail=(code,message,extra={})=>{throw Object.assign(Error(message),{code},extra);};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const watchRoot=repoRoot=>resolve(repoRoot,'watched-documents');
const listFile=repoRoot=>resolve(watchRoot(repoRoot),LIST_FILE);

// Claims the final name with complete bytes; false when the name already exists (it is never replaced).
// writeTemp and removeTemp are test seams for a failed write and a held temp file; they default to fs.
async function writeOnce(repoRoot,path,data,writeTemp=writeFile,removeTemp=rm){
 const final=resolve(repoRoot,...path.split('/')),partialDir=resolve(watchRoot(repoRoot),PARTIAL);
 await mkdir(resolve(final,'..'),{recursive:true});await mkdir(partialDir,{recursive:true});
 const temp=resolve(partialDir,`${randomUUID()}.partial`);
 try{
  await writeTemp(temp,data,{flag:'wx'});
  try{await link(temp,final);return true;}
  catch(error){if(error.code==='EEXIST')return false;throw error;}
 }finally{try{await removeTemp(temp,{force:true});}catch{}}
}

export async function readWatchList({repoRoot}){
 let text;
 try{text=await readFile(listFile(repoRoot),'utf8');}
 catch(error){if(error.code==='ENOENT')fail('WATCH_LIST_MISSING','There is no watch list file yet.');throw error;}
 let parsed;
 try{parsed=JSON.parse(text);}catch{fail('WATCH_LIST_INVALID',"The watch list file can't be read: it is not valid JSON.");}
 return validateWatchList(parsed);
}

// On Windows a scanner or indexer can hold watch-list.json for a moment, so the rename fails with
// EPERM/EBUSY/EACCES. It is tried up to RENAME_ATTEMPTS times, RENAME_DELAY_MS apart, then refused as
// WATCH_LIST_BUSY. This is a local file retry only; nothing here touches the network.
const RENAME_ATTEMPTS=5,RENAME_DELAY_MS=50,HELD=new Set(['EPERM','EBUSY','EACCES']);
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function renameHeld(renameFile,from,to){
 for(let attempt=1;;attempt++){
  try{return await renameFile(from,to);}
  catch(error){
   if(!HELD.has(error?.code))throw error;
   if(attempt>=RENAME_ATTEMPTS)fail('WATCH_LIST_BUSY','The watch list file is in use; try again.');
   await pause(RENAME_DELAY_MS);
  }
 }
}

// Validates before touching the disk, so an invalid list never replaces the file.
// renameFile is a test seam for simulating a held file; it defaults to fs rename.
export async function writeWatchList({repoRoot,renameFile=rename},list){
 const valid=validateWatchList(list),target=listFile(repoRoot),temp=`${target}.tmp`;
 await mkdir(watchRoot(repoRoot),{recursive:true});
 try{await writeFile(temp,JSON.stringify(valid,null,2)+'\n');await renameHeld(renameFile,temp,target);}
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

// variant (optional, /^[a-z0-9-]{1,64}$/) names a second write-once copy of the same bytes,
// copies/<sha256>.<variant>.<ext>; the check uses it to repair when a damaged file holds the plain name.
export async function saveCopy({repoRoot,writeTemp,removeTemp,variant},bytes){
 if(!(bytes instanceof Uint8Array))fail('REQUEST_INVALID','A copy must be bytes.');
 if(variant!==undefined&&(typeof variant!=='string'||!VARIANT.test(variant)))fail('REQUEST_INVALID','A copy variant must be 1 to 64 lower-case letters, digits or dashes.');
 const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),hash=sha256(data);
 const extension=data.subarray(0,5).toString('latin1')==='%PDF-'?'pdf':'html';
 const path=`watched-documents/${COPIES}/${hash}.${variant===undefined?'':`${variant}.`}${extension}`;
 if(await writeOnce(repoRoot,path,data,writeTemp,removeTemp))return {path,sha256:hash,reused:false};
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

const checkPath=id=>{
 if(typeof id!=='string'||!CHECK_ID.test(id)||id.includes('..'))fail('REQUEST_INVALID','A check id must be letters, digits, dot, dash or underscore.');
 return `watched-documents/${CHECKS}/${id}.json`;
};

// Lets a check refuse a taken id before it fetches anything; writeCheckRecord still refuses at write time.
export async function checkRecordExists({repoRoot},id){
 const path=checkPath(id);
 try{await lstat(resolve(repoRoot,...path.split('/')));return true;}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
}

export async function writeCheckRecord({repoRoot,writeTemp,removeTemp},record){
 const id=record?.check_id,path=checkPath(id);
 if(!await writeOnce(repoRoot,path,JSON.stringify(record,null,2)+'\n',writeTemp,removeTemp))fail('WATCH_CHECK_EXISTS',`The check record ${id} already exists.`);
 return path;
}
