// The caller supplies an authenticated, server-side transport. This module has no
// credentials, database client, filesystem access, or network side effects.
export const ARCHIVE_CHUNK_BYTES=32768;
export const ARCHIVE_LIMITS=Object.freeze({files:10000,fileBytes:64*1024*1024,totalBytes:512*1024*1024,totalChunks:32768,pathLength:1024});
const hashPattern=/^[a-f0-9]{64}$/;
const invalid=message=>Object.assign(Error(message),{code:'ARCHIVE_INVALID'});
const missing=()=>Object.assign(Error('Archive file unavailable'),{code:'ARCHIVE_NOT_FOUND'});

function safePath(path){
 if(typeof path!=='string'||!path||path.length>ARCHIVE_LIMITS.pathLength||path.split('/').some(part=>!part||part==='.'||part==='..'||!/^[a-zA-Z0-9_.-]+$/.test(part)))throw invalid('Unsafe archive path');
 return path;
}
function copyBytes(value,expectedLength){
 if(!(value instanceof Uint8Array)&&!(value instanceof ArrayBuffer))throw invalid('Archive transport must return exact bytes');
 if(value.byteLength!==expectedLength)throw invalid('Archive transport byte count mismatch');
 if(value instanceof Uint8Array)return Uint8Array.from(value);
 return new Uint8Array(value.slice(0));
}
export async function archiveSha256(bytes){
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Validate and privately retain one verified snapshot's complete file manifest.
 * Supply exactly one transport: readChunk(sha256) or readFile(path). Both return
 * Uint8Array/ArrayBuffer; decoding bytea/base64 belongs to the injected transport.
 */
export function createArchiveStore({manifest,verifiedAt,readChunk,readFile}={}){
 if(typeof verifiedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(verifiedAt)||!Number.isFinite(Date.parse(verifiedAt)))throw invalid('Verified archive snapshot required');
 if((typeof readChunk==='function')===(typeof readFile==='function')||(readChunk!==undefined&&typeof readChunk!=='function')||(readFile!==undefined&&typeof readFile!=='function'))throw invalid('Exactly one archive byte transport required');
 if(!Array.isArray(manifest)||!manifest.length||manifest.length>ARCHIVE_LIMITS.files)throw invalid('Invalid archive file inventory');
 const files=new Map(),folded=new Set();let totalBytes=0,totalChunks=0;
 for(const entry of manifest){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw invalid('Invalid archive manifest entry');
  const path=safePath(entry.path),fold=path.toLowerCase();
  if(folded.has(fold))throw invalid('Duplicate archive path');
  if(!hashPattern.test(entry.sha256)||typeof entry.sha256!=='string'||!Number.isSafeInteger(entry.byteCount)||entry.byteCount<0||entry.byteCount>ARCHIVE_LIMITS.fileBytes||!Number.isSafeInteger(entry.chunkCount)||entry.chunkCount!==Math.ceil(entry.byteCount/ARCHIVE_CHUNK_BYTES)||!Array.isArray(entry.chunkHashes)||entry.chunkHashes.length!==entry.chunkCount||entry.chunkHashes.some(hash=>typeof hash!=='string'||!hashPattern.test(hash)))throw invalid('Invalid archive hashes or byte counts');
  totalBytes+=entry.byteCount;totalChunks+=entry.chunkCount;
  if(totalBytes>ARCHIVE_LIMITS.totalBytes||totalChunks>ARCHIVE_LIMITS.totalChunks)throw invalid('Archive snapshot cap exceeded');
  folded.add(fold);files.set(path,Object.freeze({path,sha256:entry.sha256,byteCount:entry.byteCount,chunkHashes:Object.freeze([...entry.chunkHashes])}));
 }
 for(const path of folded){const parts=path.split('/');parts.pop();while(parts.length){if(folded.has(parts.join('/')))throw invalid('Archive file/directory path conflict');parts.pop();}}
 const paths=Object.freeze([...files.keys()].sort());
 async function read(path){
  safePath(path);const entry=files.get(path);if(!entry)throw missing();
  let bytes;
  if(readFile){
   bytes=copyBytes(await readFile(path),entry.byteCount);
   for(const [index,hash] of entry.chunkHashes.entries())if(await archiveSha256(bytes.subarray(index*ARCHIVE_CHUNK_BYTES,(index+1)*ARCHIVE_CHUNK_BYTES))!==hash)throw invalid('Archive ordered chunk hash mismatch');
  }else{
   bytes=new Uint8Array(entry.byteCount);
   for(const [index,hash] of entry.chunkHashes.entries()){
    const offset=index*ARCHIVE_CHUNK_BYTES,chunk=copyBytes(await readChunk(hash),Math.min(ARCHIVE_CHUNK_BYTES,entry.byteCount-offset));
    if(await archiveSha256(chunk)!==hash)throw invalid('Archive chunk hash mismatch');
    bytes.set(chunk,offset);
   }
  }
  if(await archiveSha256(bytes)!==entry.sha256)throw invalid('Archive file hash mismatch');
  return bytes;
 }
 function list(prefix=''){
  if(prefix!=='')safePath(prefix.endsWith('/')?prefix.slice(0,-1):prefix);
  return paths.filter(path=>path.startsWith(prefix));
 }
 return Object.freeze({read,list,has:path=>{safePath(path);return files.has(path);}});
}
