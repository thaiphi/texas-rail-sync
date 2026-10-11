import {createSupabaseArchiveTransport} from './supabase-transport.mjs';
import {createArchiveStore} from './archive-store.mjs';
import {createHostedCatalog} from './catalog.mjs';
import {createHostedExplorerHandler} from './http.mjs';

// Independent migration pin: caller input and environment cannot repoint reads.
export const HOSTED_SNAPSHOT_ID='trrc-d6678bd4e24e4d4cd0e224c39c98aa8af9ce543dbd61545c6fa155eeefef6186';
// The hosted gateway removes /functions/v1; direct requests retain it.
const routePrefixes=['/functions/v1/trrc-explorer','/trrc-explorer'];
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const unavailable=()=>Error('Hosted configuration unavailable');
function origin(getEnv){
 const value=getEnv('SUPABASE_URL');if(typeof value!=='string')throw unavailable();
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw unavailable();
 return url.origin;
}
function defaultKey(getEnv,name,prefix){
 const value=getEnv(name);if(typeof value!=='string'||value.length>16384)throw unavailable();
 const keys=JSON.parse(value);
 if(!keys||typeof keys!=='object'||Array.isArray(keys)||typeof keys.default!=='string'||!keys.default.startsWith(prefix)||keys.default.length>4096)throw unavailable();
 return keys.default;
}
function errorResponse(code,message,status,head=false){
 const body=JSON.stringify({error:{code,message}});
 return new Response(head?null:body,{status,headers:{'content-type':'application/json; charset=utf-8','content-length':String(new TextEncoder().encode(body).byteLength),'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
async function authUser(response){
 if(!response.ok||Number(response.headers.get('content-length'))>65536)throw unavailable();
 const reader=response.body?.getReader();if(!reader)throw unavailable();
 const parts=[];let length=0;
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;if(!(value instanceof Uint8Array)||length+value.length>65536){await reader.cancel();throw unavailable();}parts.push(value);length+=value.length;}
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

/** One instance per Edge isolate. createTransport is an optional test seam; the
 * production entrypoint supplies only server environment access. No chunk cache
 * or user/session cache is retained, and a failed initialization can be retried.
 */
export function createHostedEdgeHandler({getEnv,fetchImpl=fetch,createTransport=createSupabaseArchiveTransport}={}){
 if(typeof getEnv!=='function'||typeof fetchImpl!=='function'||typeof createTransport!=='function')throw unavailable();
 let initialization=null;
 function readHandler(){
  if(!initialization)initialization=Promise.resolve().then(async()=>{
   const url=origin(getEnv),secretKey=defaultKey(getEnv,'SUPABASE_SECRET_KEYS','sb_secret_');
   const transport=createTransport({url,secretKey,snapshotId:HOSTED_SNAPSHOT_ID,fetchImpl}),snapshot=await transport.loadSnapshot();
   if(snapshot.snapshotId!==HOSTED_SNAPSHOT_ID)throw unavailable();
   const store=createArchiveStore({manifest:snapshot.manifest,verifiedAt:snapshot.verifiedAt,readChunk:hash=>transport.readChunk(hash)});
   return createHostedExplorerHandler({store,catalog:createHostedCatalog({store}),authorize:request=>['GET','HEAD'].includes(request.method)});
  }).catch(error=>{initialization=null;throw error;});
  return initialization;
 }
 async function signedIn(request){
  const bearer=request.headers.get('authorization');
  if(typeof bearer!=='string'||bearer.length>8192||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(bearer))return false;
  try{
   const url=origin(getEnv),publishableKey=defaultKey(getEnv,'SUPABASE_PUBLISHABLE_KEYS','sb_publishable_');
   const response=await fetchImpl(url+'/auth/v1/user',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:publishableKey,authorization:bearer}});
   const user=await authUser(response);
   return typeof user?.id==='string'&&uuid.test(user.id)&&user.role==='authenticated'&&user.is_anonymous===false;
  }catch{return false;}
 }
 return async request=>{
  const head=request.method==='HEAD';
  try{
   const url=new URL(request.url);
   const routePrefix=routePrefixes.find(prefix=>url.pathname===prefix||url.pathname.startsWith(prefix+'/'));
   if(routePrefix)url.pathname=url.pathname.slice(routePrefix.length)||'/';
   let path;try{path=decodeURIComponent(url.pathname);}catch{return errorResponse('NOT_FOUND','Evidence unavailable.',404,head);}
   if(request.method==='POST'&&['/api/lookup','/api/collect'].includes(path)){
    if(!await signedIn(request))return errorResponse('AUTH_REQUIRED','Sign in with an authorized account.',401);
    return errorResponse('HOSTED_COLLECTION_UNAVAILABLE','Hosted collection is not enabled. Existing local collection remains available.',503);
   }
   if(!['GET','HEAD'].includes(request.method))return errorResponse('METHOD_NOT_ALLOWED','Read-only endpoint.',405);
   const handler=await readHandler();
   return await handler(new Request(url,{method:request.method,headers:request.headers}));
  }catch{return errorResponse('EVIDENCE_UNAVAILABLE','Verified evidence could not be loaded.',503,head);}
 };
}
