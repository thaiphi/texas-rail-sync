// Service-only Supabase transport for the guest journal (RPC) and evidence objects
// (private Storage bucket). UNVERIFIED AND NOT MOUNTED: index.ts never constructs it.
// RPC grants, the Storage request shape for sb_secret keys, availability and quotas
// remain G2/G3 gates. JSONB reorders object keys; callers compare order-insensitively.
const fail=(code,message)=>Object.assign(Error(message),{code});
// One plain safe path segment: no slash, dot segment, percent escape, query or fragment.
const bucketPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
// Existing archive maximum; no new raw limit is introduced.
const objectByteLimit=80_106_496;
const sha256Hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
// The 21 journal RPCs plus the 2 budget RPCs defined in the unapplied SQL drafts.
const operations=Object.freeze({issueToken:'issue_token',replay:'replay',enqueue:'enqueue',job:'job',history:'history',claim:'claim',renew:'renew',reserveObject:'reserve_object',recordEvidence:'record_evidence',evidence:'evidence',recordStaged:'record_staged',staged:'staged',advance:'advance',retry:'retry',fail:'fail',publish:'publish',publication:'publication',run:'run',claimMaintenance:'claim_maintenance',cleanupCandidates:'cleanup_candidates',confirmCleanup:'confirm_cleanup',reserveEgress:'reserve_egress',purgeRetainedRows:'purge_retained_rows'});
function originFor(url,secretKey){
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/')throw fail('GUEST_UNAVAILABLE','Supabase endpoint must be an HTTPS origin');
 if(typeof secretKey!=='string'||!secretKey.startsWith('sb_secret_'))throw fail('GUEST_UNAVAILABLE','Server secret key required; publishable credentials are refused');
 return endpoint.origin;
}
async function readCapped(response,limit){
 if(Number(response.headers.get('content-length'))>limit)throw fail('GUEST_UNAVAILABLE','Response exceeds byte cap');
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();
 const parts=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;if(!(value instanceof Uint8Array)||length+value.length>limit){await reader.cancel();throw fail('GUEST_UNAVAILABLE','Response exceeds byte cap or type');}parts.push(value);length+=value.length;}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export function createSupabaseGuestJournal({url,secretKey,fetchImpl=fetch}){
 const origin=originFor(url,secretKey);
 async function rpc(name,args){
  const response=await fetchImpl(`${origin}/rest/v1/rpc/trrc_guest_${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:secretKey,'content-type':'application/json'},body:JSON.stringify({args})});
  let body;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(await readCapped(response,2_000_000));body=text?JSON.parse(text):null;}catch{throw fail('GUEST_UNAVAILABLE','Guest journal response unavailable');}
  if(!response.ok){
   // Journal functions raise 'CODE: message'; anything else stays unavailable.
   const match=typeof body?.message==='string'&&/^([A-Z][A-Z0-9_]{0,63}): (.{1,300})$/.exec(body.message);
   throw match?fail(match[1],match[2]):fail('GUEST_UNAVAILABLE','Guest journal unavailable');
  }
  return body;
 }
 return Object.freeze({kind:'supabase_service',...Object.fromEntries(Object.entries(operations).map(([method,name])=>[method,args=>rpc(name,args??{})]))});
}
export function createSupabaseObjectStore({url,secretKey,bucket='trrc-guest-evidence',fetchImpl=fetch}){
 // Refused before any request; the bucket is never URL-encoded or normalized.
 if(typeof bucket!=='string'||!bucketPattern.test(bucket))throw fail('GUEST_UNAVAILABLE','Storage bucket name invalid');
 const origin=originFor(url,secretKey),headers={apikey:secretKey};
 const objectUrl=key=>{if(typeof key!=='string'||!/^sha256\/[a-f0-9]{64}$/.test(key))throw fail('STORAGE_INVALID','Object key invalid');return `${origin}/storage/v1/object/${bucket}/${key}`;};
 async function get(key,{expectedBytes=null}={}){
  // A recorded size bounds the read: a larger (tampered) payload is refused, never truncated.
  if(expectedBytes!==null&&(!Number.isSafeInteger(expectedBytes)||expectedBytes<0||expectedBytes>objectByteLimit))throw fail('STORAGE_INVALID','Expected object size invalid');
  const response=await fetchImpl(objectUrl(key),{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers});
  if(!response.ok){
   let detail=null;try{detail=JSON.parse(new TextDecoder().decode(await readCapped(response,65536)));}catch{}
   // ENOENT only for a reported missing object; every other failure stays distinct.
   if(response.status===404||(response.status===400&&String(detail?.statusCode)==='404'))throw Object.assign(Error('Object is absent'),{code:'ENOENT'});
   throw fail('STORAGE_UNAVAILABLE','Guest object storage unavailable');
  }
  return readCapped(response,expectedBytes??objectByteLimit);
 }
 return Object.freeze({kind:'supabase_storage',get,
  async put(key,bytes){
   const target=objectUrl(key);
   if(!(bytes instanceof Uint8Array)||bytes.length>objectByteLimit)throw fail('STORAGE_INVALID','Object bytes must be a Uint8Array of up to 80,106,496 bytes');
   // Owned copy before any await: caller mutation cannot change the body or its verification.
   const body=new Uint8Array(bytes);
   if(`sha256/${await sha256Hex(body)}`!==key)throw fail('STORAGE_INVALID','Object bytes do not match their content address');
   const response=await fetchImpl(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...headers,'content-type':'application/octet-stream','x-upsert':'false'},body});
   await response.body?.cancel().catch(()=>{});
   if(response.ok)return 'created';
   // Add-only: an existing content-hash object is accepted only if its bytes match.
   // A failed upload whose readback is missing or unavailable is a service fault, never a
   // conflict; OBJECT_CONFLICT means the stored bytes were read and actually differ.
   let existing;
   try{existing=await get(key,{expectedBytes:body.length});}catch{throw fail('STORAGE_UNAVAILABLE','Guest object write failed and readback is unavailable');}
   if(existing.length===body.length&&existing.every((byte,index)=>byte===body[index]))return 'verified_existing';
   throw fail('OBJECT_CONFLICT','Existing guest object bytes differ');
  },
  // Supported remove route: DELETE /object/<bucket> with exactly one validated key in
  // "prefixes". The key is never a wildcard or prefix; success is an explicit not-found or
  // a 200 JSON array that is empty or names only this key. Callers still GET-verify absence.
  async delete(key){
   objectUrl(key);
   const response=await fetchImpl(`${origin}/storage/v1/object/${bucket}`,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(30000),headers:{...headers,'content-type':'application/json'},body:JSON.stringify({prefixes:[key]})});
   if(response.status===404){await response.body?.cancel().catch(()=>{});return;}
   let removed;try{removed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readCapped(response,65536)));}catch{throw fail('STORAGE_UNAVAILABLE','Guest object deletion failed');}
   if(response.status!==200||!Array.isArray(removed)||removed.length>1||removed.some(entry=>entry?.name!==key))throw fail('STORAGE_UNAVAILABLE','Guest object deletion failed');
  }
 });
}
