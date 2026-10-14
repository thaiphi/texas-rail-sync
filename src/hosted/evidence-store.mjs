// Journal-backed guest evidence and staged outputs over a content-addressed object
// store. Readers serve only journal-recorded entries, re-hash every read and return
// owned copies. ENOENT means absent only; every other failure stays distinct.
import {Buffer} from 'node:buffer';
import {randomUUID} from 'node:crypto';
import {sha256} from '../normalize.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
const missing=message=>Object.assign(Error(message),{code:'ENOENT'});
const keyPattern=/^sha256\/[a-f0-9]{64}$/;
export const objectKeyFor=hash=>`sha256/${hash}`;
// Local reference store for explicit local servers and tests only; never hosted.
export function createMemoryObjectStore({objects=new Map()}={}){
 const check=key=>{if(typeof key!=='string'||!keyPattern.test(key))throw failure('STORAGE_INVALID','Object key invalid');};
 return Object.freeze({kind:'local_reference',
  async put(key,bytes){check(key);if(!(bytes instanceof Uint8Array))throw failure('STORAGE_INVALID','Object bytes required');
   // Add-only: an existing object is accepted only when its bytes are identical.
   if(objects.has(key)){if(!Buffer.from(objects.get(key)).equals(Buffer.from(bytes)))throw failure('OBJECT_CONFLICT','Existing object bytes differ');return 'verified_existing';}
   objects.set(key,new Uint8Array(bytes));return 'created';},
  async get(key){check(key);if(!objects.has(key))throw missing('Object is absent');return new Uint8Array(objects.get(key));},
  async delete(key){check(key);objects.delete(key);}
 });
}
async function readVerified(store,entry){
 let body;
 // The recorded size bounds and meters the read; the memory store ignores the option.
 try{body=await store.get(entry.objectKey,{expectedBytes:entry.bytes});}catch(error){if(error?.code==='ENOENT')throw missing('Evidence object is absent');throw failure(error?.code==='EGRESS_QUOTA'||error?.code==='BUDGET_UNVERIFIED'?error.code:'EVIDENCE_UNAVAILABLE','Evidence object could not be read');}
 if(!(body instanceof Uint8Array)||entry.objectKey!==objectKeyFor(entry.sha256)||body.length!==entry.bytes||sha256(body)!==entry.sha256)throw failure('EVIDENCE_TAMPERED','Evidence object failed journal hash or byte verification');
 return Buffer.from(body);
}
function describe(bytes){
 if(!(bytes instanceof Uint8Array))throw failure('STORAGE_INVALID','Object bytes required');
 const body=Buffer.from(bytes),hash=sha256(body);return {body,entry:{sha256:hash,bytes:body.length,objectKey:objectKeyFor(hash)}};
}
// The write is never trusted: read back and verify before the bytes are used.
async function writeVerified(store,body,entry){
 await store.put(entry.objectKey,new Uint8Array(body));
 try{await readVerified(store,entry);}catch{throw failure('STORAGE_INVALID','Stored object readback failed verification');}
 return entry;
}
// Unreserved write: only for callers whose journal already tracks the key.
export async function putObject(store,bytes){const {body,entry}=describe(bytes);return writeVerified(store,body,entry);}
// Journal admission (fence, cap, conflict, cleanup tombstone) always precedes the storage
// write, so a refused or stale worker never creates an untracked object.
export async function putReservedObject({journal,store,lease,bytes}){const {body,entry}=describe(bytes);await journal.reserveObject({lease,...entry});return writeVerified(store,body,entry);}
export async function recordEvidence({journal,store,lease,attemptId,path,bytes}){
 const {body,entry}=describe(bytes);
 await journal.recordEvidence({lease,attemptId,path,...entry});
 await writeVerified(store,body,entry);
 return {path,attemptId,...entry};
}
export async function createVerifiedEvidenceReader({journal,store,jobId,pending=[]}){
 const entries=new Map((await journal.evidence({jobId})).map(entry=>[entry.path,Object.freeze({...entry})]));
 // Entries recorded under the caller's current lease (the succeeded marker) override
 // the selected set until the fenced step commit selects them.
 for(const entry of pending)entries.set(entry.path,Object.freeze({...entry}));
 const read=async name=>{const entry=entries.get(name);if(!entry)throw missing('Evidence is absent from the journal');return readVerified(store,entry);};
 // Live preparation and finalization require the complete expected set; ENOENT stays
 // reserved for optional markers in the shared loader contract.
 async function requireAll(names){
  if(entries.size!==names.length||names.some(name=>!entries.has(name)))throw failure('EVIDENCE_UNAVAILABLE','Guest evidence set differs from the expected set');
  for(const name of names)try{await read(name);}catch(error){throw failure(error?.code==='ENOENT'?'EVIDENCE_UNAVAILABLE':error?.code??'EVIDENCE_UNAVAILABLE','Required guest evidence is missing or failed verification');}
 }
 return Object.freeze({read,requireAll});
}
export async function stageOutputs({journal,store,lease,files}){
 const prepared=Object.keys(files).sort().map(name=>({name,...describe(Buffer.from(files[name]))})),entries=prepared.map(({name,entry})=>({name,...entry}));
 await journal.recordStaged({lease,entries});
 for(const {body,entry} of prepared)await writeVerified(store,body,entry);
 return entries;
}
// publish() verifies the exact expected set against staged readback and builds the
// archive. It is not publication: only the fenced journal commit publishes.
export async function createStagedPublisher({journal,store,jobId,buildArchive}){
 const entries=await journal.staged({jobId}),byName=new Map(entries.map(entry=>[entry.name,entry]));
 let pending=null;
 const readStaged=async(_artifactId,name)=>{const entry=byName.get(name);if(!entry)throw missing('Staged output is absent');return readVerified(store,entry);};
 return Object.freeze({entries:()=>structuredClone(entries),readStaged,
  async publish(files,artifactId){
   const names=Object.keys(files).sort();
   if(JSON.stringify(names)!==JSON.stringify([...byName.keys()].sort()))throw failure('EXPORT_MISMATCH','Staged set differs from the expected output set');
   for(const name of names)if(!(await readStaged(artifactId,name)).equals(Buffer.from(files[name])))throw failure('EXPORT_MISMATCH','Staged output differs from expected bytes');
   pending={artifactId,archive:await buildArchive(name=>readStaged(artifactId,name))};return 'published_new_version';
  },
  async readPublished(artifactId,name){if(pending?.artifactId!==artifactId)throw missing('Output has no pending publication');return readStaged(artifactId,name);},
  pending:()=>pending});
}
export async function readPublishedArchive({store,publication}){
 try{return await readVerified(store,publication.archive);}catch{throw failure('EVIDENCE_UNAVAILABLE','Published archive is missing or failed verification');}
}
// Bounded journal-owned cleanup under a maintenance fence; never touches trrc_archive.
export async function runCleanup({journal,store}){
 const lease=await journal.claimMaintenance({leaseOwner:randomUUID()});if(!lease)return {removed:0,skipped:true};
 const keys=await journal.cleanupCandidates({lease});
 // Absence probe: any returned body (even empty) means the object remains.
 for(const key of keys){await store.delete(key);try{await store.get(key,{expectedBytes:0});throw failure('CLEANUP_INCOMPLETE','Object remains after deletion');}catch(error){if(error?.code!=='ENOENT')throw error;}}
 return journal.confirmCleanup({lease,keys});
}
