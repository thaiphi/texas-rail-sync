// Trusted internal one-source fetch shared by lookup and collection. Targets come only
// from sources.mjs; no filesystem, storage, scheduler or HTTP-route surface exists here.
import {Buffer} from 'node:buffer';
import {sha256} from './normalize.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
// onResponse(status) lets trusted callers record the HTTP status before body checks.
// timeoutMs defaults to 30000 for acquisition/lookup. A throw before any Response (DNS,
// connect, TLS) becomes NETWORK_ERROR with the original as cause; timeouts/aborts pass as-is.
export async function fetchSource(target,{fetchImpl=fetch,testFixture=false,onResponse=null,timeoutMs=30000}={}){
 if(fetchImpl!==fetch&&!testFixture)throw failure('SOURCE_INVALID','Injected responses require fixture mode');
 let response;try{response=await fetchImpl(target.url,{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});}
 catch(error){if(error?.name==='TimeoutError'||error?.name==='AbortError')throw error;throw Object.assign(Error('Official source unreachable',{cause:error}),{code:'NETWORK_ERROR'});}
 onResponse?.(response.status);
 if(!response.ok)throw failure('HTTP_ERROR','Official source request failed');
 if(Number(response.headers.get('content-length'))>10_000_000)throw failure('SOURCE_LIMIT','Source byte cap exceeded');
 const reader=response.body?.getReader();if(!reader)throw failure('SOURCE_INVALID','Source response body unavailable');
 const chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10_000_000){await reader.cancel();throw failure('SOURCE_LIMIT','Source byte cap exceeded');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const body=Buffer.concat(chunks,size),metadata={url:target.url,retrieved_at:new Date().toISOString(),http_status:response.status,last_modified:response.headers.get('last-modified'),etag:response.headers.get('etag'),sha256:sha256(body),bytes:body.length,testFixture};
 return {body,metadata};
}
