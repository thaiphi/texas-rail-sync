// Guest budget admission (provisional, approved design §5). Platform allowance comes only
// from an operator-attested proof supplied by trusted server construction, never from a
// guest request; missing, inconsistent or expired proof refuses. Durable enforcement is
// docs/sql/trrc-guest-budget-DRAFT-not-applied.sql; the ledger here is a local reference.
// Margins are provisional; metadata sums never prove physical or billed bytes.
import {randomUUID} from 'node:crypto';
const failure=(code,message)=>Object.assign(Error(message),{code});
const unverified=message=>failure('BUDGET_UNVERIFIED',message);
export const GUEST_BUDGETS=Object.freeze({storageBytes:250_000_000,databaseBytes:50_000_000,monthlyEgressBytes:1_000_000_000,downloadsPerTokenPerDay:3,proofMaxAgeMs:600_000,storageMarginBytes:100_000_000,egressMarginBytes:500_000_000,collectionReservationBytes:100_000_000,lookupReservationBytes:20_000_000,objectBytes:80_106_496,requestOverheadBytes:65_536,guestBucket:'trrc-guest-evidence'});
const proofKeys=JSON.stringify(['attestedAt','databaseLimitBytes','databaseRemainingBytes','egressLimitBytes','egressRemainingBytes','expiresAt','projectDatabaseBytes','projectStorageBytes','source','storageLimitBytes','storageRemainingBytes']);
const isBytes=value=>Number.isSafeInteger(value)&&value>=0;
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&new Date(value).toISOString()===value?Date.parse(value):NaN;
export function validatePlatformProof(proof,nowMs,budgets=GUEST_BUDGETS){
 if(!proof||typeof proof!=='object'||Array.isArray(proof)||JSON.stringify(Object.keys(proof).sort())!==proofKeys||proof.source!=='operator_attested')throw unverified('No attested platform allowance; admission refused');
 const attested=instant(proof.attestedAt),expires=instant(proof.expiresAt);
 if(!Number.isFinite(attested)||!Number.isFinite(expires)||!Number.isFinite(nowMs)||attested>nowMs||expires<=nowMs||expires<=attested||expires-attested>budgets.proofMaxAgeMs)throw unverified('Attested platform allowance is missing, future-dated or expired');
 for(const kind of ['storage','database','egress'])if(!isBytes(proof[kind+'LimitBytes'])||!isBytes(proof[kind+'RemainingBytes'])||proof[kind+'RemainingBytes']>proof[kind+'LimitBytes'])throw unverified('Attested allowance is inconsistent');
 // Measured project usage may not exceed what the platform reports as used.
 for(const kind of ['Storage','Database'])if(!isBytes(proof['project'+kind+'Bytes'])||proof['project'+kind+'Bytes']+proof[kind.toLowerCase()+'RemainingBytes']>proof[kind.toLowerCase()+'LimitBytes'])throw unverified('Attested allowance is inconsistent');
 return Object.freeze({...proof,attestedMs:attested});
}
// storage.objects rows across ALL buckets: {bucketId, name, metadata:{size}}.
export function measureStorageObjects(rows,budgets=GUEST_BUDGETS){
 if(!Array.isArray(rows))throw unverified('Storage measurement unavailable');
 const seen=new Set();let projectBytes=0,guestBytes=0;
 for(const row of rows){const id=JSON.stringify([row?.bucketId,row?.name]);
  if(typeof row?.bucketId!=='string'||typeof row?.name!=='string'||seen.has(id)||!isBytes(row?.metadata?.size))throw unverified('Storage size metadata is missing, duplicated or invalid');
  seen.add(id);projectBytes+=row.metadata.size;if(row.bucketId===budgets.guestBucket)guestBytes+=row.metadata.size;
  if(!Number.isSafeInteger(projectBytes))throw unverified('Storage measurement overflow');}
 return {projectBytes,guestBytes};
}
export function checkStorage({proof,guestBytes,projectBytes,pendingBytes=0,addBytes=0,budgets=GUEST_BUDGETS}){
 if(![guestBytes,projectBytes,pendingBytes,addBytes].every(isBytes))throw unverified('Storage usage is not a verified byte count');
 if(guestBytes+pendingBytes+addBytes>budgets.storageBytes||Math.max(0,projectBytes-proof.projectStorageBytes)+pendingBytes+addBytes+budgets.storageMarginBytes>proof.storageRemainingBytes)throw failure('STORAGE_QUOTA','Guest storage budget or attested platform room with margin would be exceeded; nothing was evicted');
}
const processingLimit=budgets=>2*budgets.objectBytes+budgets.requestOverheadBytes;
export function checkEgress({proof,ledger,kind,tokenHash=null,bytes,nowMs,budgets=GUEST_BUDGETS}){
 if(!['download','processing'].includes(kind)||!isBytes(bytes)||bytes>(kind==='download'?budgets.objectBytes+budgets.requestOverheadBytes:processingLimit(budgets)))throw failure('REQUEST_INVALID','Egress reservation invalid');
 if(kind==='download'&&ledger.filter(row=>row.kind==='download'&&row.tokenHash===tokenHash&&row.at>nowMs-86_400_000).length>=budgets.downloadsPerTokenPerDay)throw failure('DOWNLOAD_QUOTA','Archive download limit reached for this session');
 const day=new Date(nowMs),monthStart=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),1),sum=rows=>rows.reduce((total,row)=>total+row.bytes,0);
 if(sum(ledger.filter(row=>row.at>=monthStart))+bytes>budgets.monthlyEgressBytes||sum(ledger.filter(row=>row.at>=proof.attestedMs))+bytes+budgets.egressMarginBytes>proof.egressRemainingBytes)throw failure('EGRESS_QUOTA','Guest egress budget or attested allowance with margin would be exceeded');
}
// Every Storage request reserves processing egress first; reads need a recorded size.
export function meterStore(store,reserve,budgets=GUEST_BUDGETS){
 const overhead=budgets.requestOverheadBytes;
 return Object.freeze({...store,
  async get(key,options={}){const expected=options?.expectedBytes;if(!isBytes(expected)||expected>budgets.objectBytes)throw unverified('Object read size is unknown; refused before I/O');await reserve(expected+overhead);return store.get(key,{expectedBytes:expected});},
  // Upload plus at most one add-only verification readback inside the transport.
  async put(key,bytes){if(!(bytes instanceof Uint8Array)||bytes.length>budgets.objectBytes)throw failure('STORAGE_INVALID','Object bytes invalid');await reserve(2*bytes.length+overhead);return store.put(key,bytes);},
  async delete(key){await reserve(overhead);return store.delete(key);}});
}
const envelope=(kind,budgets)=>kind==='lookup'?budgets.lookupReservationBytes:budgets.collectionReservationBytes;
// Local reference only: proof, measured storage plus this job's envelope at admission, and
// an in-memory egress ledger. Durable per-job reservations exist only in SQL.
export function createLocalReferenceAdmission({attest,measureStorage=null,clock=Date.now,budgets=GUEST_BUDGETS}={}){
 if(typeof attest!=='function'||(measureStorage!==null&&typeof measureStorage!=='function'))throw failure('GUEST_UNAVAILABLE','A trusted platform attestation source is required');
 const ledger=[],current=async()=>{const supplied=await attest(),nowMs=clock();return {nowMs,proof:validatePlatformProof(supplied,nowMs,budgets)};};
 const admission={kind:'local_reference_metered',
  async admitJob(kind){const {proof}=await current();if(measureStorage)checkStorage({proof,...measureStorageObjects(await measureStorage(),budgets),addBytes:envelope(kind,budgets),budgets});},
  async reserveEgress({kind,tokenHash=null,jobId=null,bytes}={}){
   const {nowMs,proof}=await current();checkEgress({proof,ledger,kind,tokenHash,bytes,nowMs,budgets});
   const row={reservationId:randomUUID(),kind,tokenHash,jobId,bytes,at:nowMs};ledger.push(row);
   return {reservationId:row.reservationId,kind,bytes,reservedAt:new Date(nowMs).toISOString()};},
  wrapStore:store=>meterStore(store,bytes=>admission.reserveEgress({kind:'processing',bytes}),budgets)};
 return Object.freeze(admission);
}
// Durable service journal: Storage/database budgets and job envelopes are SQL triggers;
// egress reserves through the service-only RPC before every request.
export function createJournalAdmission(journal){
 if(typeof journal?.reserveEgress!=='function')throw failure('GUEST_UNAVAILABLE','Service journal budget admission unavailable');
 return Object.freeze({kind:'journal_metered',async admitJob(){},reserveEgress:args=>journal.reserveEgress(args),wrapStore:store=>meterStore(store,bytes=>journal.reserveEgress({kind:'processing',bytes}))});
}
export const UNMETERED_LOCAL_REFERENCE=Object.freeze({kind:'unmetered_local_reference',async admitJob(){},async reserveEgress(){return null;},wrapStore:store=>store});
export function resolveAdmission(journal,admission){
 if(admission===null||admission===undefined){if(journal?.kind==='local_reference')return UNMETERED_LOCAL_REFERENCE;throw failure('GUEST_UNAVAILABLE','Service journals require explicit budget admission');}
 if(typeof admission?.admitJob!=='function'||typeof admission?.reserveEgress!=='function'||typeof admission?.wrapStore!=='function'||(admission.kind==='unmetered_local_reference'&&journal?.kind!=='local_reference'))throw failure('GUEST_UNAVAILABLE','Guest admission invalid for this journal');
 return admission;
}
