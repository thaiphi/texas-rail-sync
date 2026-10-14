// Web-standard guest routes. Mounted only by explicit composition: scripts/guest-local.mjs
// or a future reviewed hosted change. supabase/functions/trrc-explorer/index.ts never
// supplies a guest handler. GET is read-only; only same-origin POST advance executes.
const statuses=Object.freeze({REQUEST_INVALID:400,SOURCE_INVALID:400,TOKEN_INVALID:401,TOKEN_EXPIRED:401,ORIGIN_FORBIDDEN:403,NOT_FOUND:404,REPLAY_UNAVAILABLE:404,METHOD_NOT_ALLOWED:405,IDEMPOTENCY_CONFLICT:409,LANE_BUSY:409,TOKEN_BUSY:409,LOOKUP_UNAVAILABLE:409,SOURCE_HASH_MISMATCH:409,SOURCE_PROVENANCE_CONFLICT:409,SOURCE_SCOPE_MISMATCH:409,EVIDENCE_EXPIRED:410,REQUEST_LIMIT:413,UNSUPPORTED_MEDIA:415,QUOTA_EXCEEDED:429,TOKEN_QUOTA:429});
const routeError=(code,message)=>Object.assign(Error(message),{code});
function json(status,data){const body=new TextEncoder().encode(JSON.stringify(data));return new Response(body,{status,headers:{'content-type':'application/json; charset=utf-8','content-length':String(body.byteLength),'cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function readJson(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))throw routeError('UNSUPPORTED_MEDIA','JSON request required');
 if(Number(request.headers.get('content-length'))>8192)throw routeError('REQUEST_LIMIT','Request exceeds 8192 bytes');
 const reader=request.body?.getReader(),parts=[];let length=0;
 if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();throw routeError('REQUEST_LIMIT','Request exceeds 8192 bytes');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw routeError('REQUEST_INVALID','Invalid JSON request');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw routeError('REQUEST_INVALID','Request object required');
 return body;
}
// Opaque token only in Authorization: Guest; never in URLs, logs or responses.
function guestToken(request){const match=/^Guest ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');if(!match)throw routeError('TOKEN_INVALID','Guest token required');return match[1];}
function idempotencyKey(request){const value=request.headers.get('idempotency-key');if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(value))throw routeError('REQUEST_INVALID','Idempotency-Key header required');return value;}
function sameOrigin(request){if(request.headers.get('origin')!==new URL(request.url).origin)throw routeError('ORIGIN_FORBIDDEN','Same-origin request required');}
const enqueueRoutes=Object.freeze({'/api/guest/lookups':'enqueueLookup','/api/guest/collections':'enqueueCollection','/api/guest/replays':'enqueueReplay'});
export function createGuestHttpHandler({service}={}){
 if(typeof service?.advance!=='function')throw Error('Guest service required');
 return async function handle(request,path=new URL(request.url).pathname){
  if(path!=='/api/guest'&&!path.startsWith('/api/guest/'))return null;
  try{
   const route=/^\/api\/guest\/jobs\/([a-f0-9-]{36})(\/advance|\/archive|\/runs\/([a-f0-9-]{36}))?$/i.exec(path),jobId=route?.[1].toLowerCase();
   if(request.method==='POST'){
    sameOrigin(request);
    if(path==='/api/guest/session'){await readJson(request);return json(201,await service.issueSession());}
    if(enqueueRoutes[path]){const token=guestToken(request),idemKey=idempotencyKey(request),body=await readJson(request),{job,replayed}=await service[enqueueRoutes[path]]({token,idemKey,request:body});return json(replayed?200:202,{job,replayed});}
    if(route?.[2]==='/advance'){const token=guestToken(request);await readJson(request);return json(200,{job:await service.advance({token,jobId})});}
    throw routeError('NOT_FOUND','Guest route unavailable');
   }
   if(request.method!=='GET')throw routeError('METHOD_NOT_ALLOWED','Guest reads use GET; advancing uses POST');
   const token=guestToken(request);
   if(path==='/api/guest/history')return json(200,{schemaVersion:1,jobs:await service.history({token})});
   if(route&&!route[2])return json(200,{job:await service.job({token,jobId})});
   if(route?.[3])return json(200,await service.run({token,jobId,runId:route[3].toLowerCase()}));
   if(route?.[2]==='/archive'){const {artifactId,bytes}=await service.archive({token,jobId});return new Response(bytes,{status:200,headers:{'content-type':'application/x-tar','content-length':String(bytes.length),'content-disposition':`attachment; filename="${artifactId}.tar"`,'cache-control':'no-store','x-content-type-options':'nosniff'}});}
   throw routeError('NOT_FOUND','Guest route unavailable');
  }catch(error){
   const status=statuses[error?.code];
   if(status)return json(status,{error:{code:error.code,message:error.message}});
   return json(503,{error:{code:'GUEST_UNAVAILABLE',message:'Guest evidence could not be processed; inspect job status.'}});
  }
 };
}
