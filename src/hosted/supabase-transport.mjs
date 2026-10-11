// Server-only transport. Never import a configured instance into browser code.
const fail=message=>Object.assign(Error(message),{code:'HOSTED_STORE_UNAVAILABLE'});
const hashPattern=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
export function createSupabaseArchiveTransport({url,secretKey,snapshotId,fetchImpl=fetch}){
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/')throw fail('Supabase endpoint must be an HTTPS origin');
 if(typeof secretKey!=='string'||!secretKey.startsWith('sb_secret_'))throw fail('Server secret key required; publishable credentials are refused');
 if(typeof snapshotId!=='string'||!/^trrc-[a-f0-9]{64}$/.test(snapshotId))throw fail('Independently pinned snapshot identity required');
 async function rpc(name,args,limit){
  const response=await fetchImpl(endpoint.origin+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:secretKey,'content-type':'application/json'},body:JSON.stringify(args)});
  if(!response.ok)throw fail('Supabase archive service unavailable');
  if(Number(response.headers.get('content-length'))>limit)throw fail('Supabase response exceeds byte cap');
  const reader=response.body?.getReader();if(!reader)throw fail('Supabase response unavailable');
  const parts=[];let length=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;if(!(value instanceof Uint8Array)||length+value.length>limit){await reader.cancel();throw fail('Supabase response exceeds byte cap or type');}parts.push(value);length+=value.length;}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw fail('Supabase response unavailable');}
 }
 return Object.freeze({
  async loadSnapshot(){
   const result=await rpc('trrc_archive_snapshot',{requested_snapshot_id:snapshotId},1_000_000);
   if(result?.snapshot_id!==snapshotId||typeof result.verified_at!=='string'||!Number.isFinite(Date.parse(result.verified_at))||!Array.isArray(result.manifest))throw fail('Verified pinned snapshot unavailable');
   // Postgres JSONB changes object-key order. Rebuild the original manifest's
   // fixed key order before comparing its content-derived independent pin.
   const canonical=result.manifest.map(item=>({path:item.path,sha256:item.sha256,byteCount:item.byteCount,chunkHashes:item.chunkHashes,chunkCount:item.chunkCount}));
   if('trrc-'+await hash(JSON.stringify(canonical))!==snapshotId)throw fail('Archive manifest does not match the independent pin');
   return {manifest:canonical,verifiedAt:result.verified_at,snapshotId};
  },
  async readChunk(sha256){
   if(typeof sha256!=='string'||!hashPattern.test(sha256))throw fail('Invalid chunk hash');
   const result=await rpc('trrc_archive_chunk',{requested_snapshot_id:snapshotId,requested_hash:sha256},50000);
   if(result?.sha256!==sha256)throw fail('Chunk identity unavailable');
   if(typeof result.base64!=='string'||result.base64.length>43692||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.base64))throw fail('Chunk encoding invalid');
   return Uint8Array.from(atob(result.base64),character=>character.charCodeAt(0));
  }
 });
}
