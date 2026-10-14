// Browser-local saving of complete, verified, immutable versions. Stores only the exact
// TAR bytes plus pins; every open re-verifies. Saved metadata is never origin proof.
import {buildVersionArchiveFromReader} from './archive-bytes.js';
import {loadVerifiedVersion} from './artifact-integrity.js';
const failure=(code,message)=>Object.assign(Error(message),{code});
const invalid=message=>failure('ARCHIVE_INVALID',message);
const decoder=new TextDecoder('utf-8',{fatal:true}),BLOCK=512,MAX_TAR=80_106_496,MAX_ENTRIES=103;
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
// Always a plain, exactly sized copy: Buffer.slice() would alias the caller's memory.
const ownedBytes=input=>input instanceof ArrayBuffer?new Uint8Array(input.slice(0)):input instanceof Uint8Array?new Uint8Array(input):null;
function octal(header,offset,width){
 const text=String.fromCharCode(...header.subarray(offset,offset+width-1));
 if(!/^[0-7]+$/.test(text)||header[offset+width-1]!==0)throw invalid('Package numeric header field invalid');return parseInt(text,8);
}
export function parseVersionTar(input){
 const bytes=ownedBytes(input);
 if(!bytes||bytes.length<1024||bytes.length>MAX_TAR||bytes.length%BLOCK)throw invalid('Package size or alignment invalid');
 const files=new Map();let offset=0;
 for(;;){
  if(offset+BLOCK>bytes.length)throw invalid('Package ended without end blocks');
  const header=bytes.subarray(offset,offset+BLOCK);
  if(header.every(byte=>byte===0)){if(bytes.length!==offset+2*BLOCK||!bytes.subarray(offset+BLOCK).every(byte=>byte===0))throw invalid('Package end blocks or trailing bytes invalid');return files;}
  if(files.size>=MAX_ENTRIES)throw invalid('Package entry cap exceeded');
  const field=header.subarray(0,100),zero=field.indexOf(0),end=zero<0?100:zero;if(end<1||!field.subarray(end).every(byte=>byte===0))throw invalid('Package entry name invalid');
  let name;try{name=decoder.decode(header.subarray(0,end));}catch{throw invalid('Package entry name invalid');}
  if(!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw invalid('Unsafe package entry path');
  if(header[156]!==48)throw invalid('Only regular package files are accepted');
  if(String.fromCharCode(...header.subarray(257,265))!=='ustar\u000000')throw invalid('Package header format invalid');
  const sum=header.reduce((total,byte,index)=>total+(index>=148&&index<156?32:byte),0);
  if(octal(header,148,7)!==sum||header[155]!==32)throw invalid('Package header checksum invalid');
  const size=octal(header,124,12);if(size>10_000_000)throw invalid('Package file exceeds the byte cap');
  if(files.has(name))throw invalid('Duplicate package entry');
  const start=offset+BLOCK;if(start+size>bytes.length)throw invalid('Package entry exceeds the archive');
  files.set(name,bytes.slice(start,start+size));offset=start+Math.ceil(size/BLOCK)*BLOCK;
 }
}
// Exact canonical rebuild with the shared builder, then the existing integrity loader.
export async function verifyVersionPackage({tarBytes,pins}){
 const bytes=ownedBytes(tarBytes);if(!bytes)throw invalid('Package bytes required');
 const files=parseVersionTar(bytes);
 const rebuilt=await buildVersionArchiveFromReader({pins,read:async name=>{if(!files.has(name))throw invalid('Package file missing: '+name);return files.get(name).slice();}});
 if(rebuilt.length!==bytes.length||!rebuilt.every((byte,index)=>byte===bytes[index]))throw invalid('Package is not the canonical archive for these pins');
 const integrity={...pins,path:`/artifacts/${pins.artifactId}/`};
 const artifact=await loadVerifiedVersion(integrity,async path=>{const name=path.startsWith(integrity.path)?path.slice(integrity.path.length):null;return name&&files.has(name)?{ok:true,arrayBuffer:async()=>files.get(name).slice().buffer}:{ok:false};});
 return {artifact,files,tarBytes:bytes,tarSha256:await hex(bytes)};
}
const DB='trrc-saved-v1',STORE='packages';
function openLibrary(factory=globalThis.indexedDB){return new Promise((resolve,reject)=>{
 if(!factory)return reject(failure('SAVE_UNAVAILABLE','Browser storage is unavailable'));
 const request=factory.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'artifactId'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(failure('SAVE_UNAVAILABLE','Browser storage is unavailable'));request.onblocked=()=>reject(failure('SAVE_UNAVAILABLE','Browser storage is blocked by another tab'));
});}
function readStore(db,mode,action){return new Promise((resolve,reject)=>{const request=action(db.transaction(STORE,mode).objectStore(STORE));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
const storedPins=pins=>({artifactId:pins.artifactId,path:`/artifacts/${pins.artifactId}/`,manifestSha256:pins.manifestSha256,normalizedSha256:pins.normalizedSha256,classification:pins.classification,defaultPinned:Boolean(pins.defaultPinned),...(typeof pins.publicationPinsSha256==='string'?{publicationPinsSha256:pins.publicationPinsSha256}:{}),...(typeof pins.realHistoryStatus==='string'?{realHistoryStatus:pins.realHistoryStatus}:{})});
export async function saveVerifiedPackage({tarBytes,pins},{indexedDB:factory}={}){
 const verified=await verifyVersionPackage({tarBytes,pins});
 const record={artifactId:pins.artifactId,tarBytes:verified.tarBytes.slice().buffer,tarSha256:verified.tarSha256,pins:storedPins(pins),savedAt:new Date().toISOString()};
 const db=await openLibrary(factory);
 try{
  const outcome=await new Promise(resolve=>{let requestError=null;const transaction=db.transaction(STORE,'readwrite'),request=transaction.objectStore(STORE).add(record);
   request.onerror=()=>{requestError=request.error;};transaction.oncomplete=()=>resolve({saved:true});transaction.onabort=()=>resolve({error:requestError??transaction.error});});
  if(outcome.saved)return 'saved';
  if(outcome.error?.name!=='ConstraintError')throw failure('SAVE_FAILED',outcome.error?.name==='QuotaExceededError'?'Browser storage is full; nothing was saved':'Browser storage refused the package; nothing was saved');
  const existing=await readStore(db,'readonly',store=>store.get(pins.artifactId));
  // Re-hash the stored bytes; a stored digest field alone is never proof of identity.
  if(existing?.tarBytes instanceof ArrayBuffer&&existing.tarSha256===record.tarSha256&&await hex(new Uint8Array(existing.tarBytes))===record.tarSha256&&JSON.stringify(existing.pins)===JSON.stringify(record.pins))return 'already_saved';
  throw failure('VERSION_CONFLICT','A different package with this version identity is already saved; nothing was overwritten');
 }finally{db.close();}
}
export async function listSavedPackages({indexedDB:factory}={}){const db=await openLibrary(factory);try{return await readStore(db,'readonly',store=>store.getAll());}finally{db.close();}}
