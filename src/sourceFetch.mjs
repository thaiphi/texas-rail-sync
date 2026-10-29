// Trusted internal one-source fetch shared by lookup and collection. Targets come only
// from sources.mjs; no filesystem, storage, scheduler or HTTP-route surface exists here.
import {Buffer} from 'node:buffer';
import {sha256} from './normalize.mjs';
const failure=(code,message)=>Object.assign(Error(message),{code});
// onResponse(status) lets trusted callers record the HTTP status before body checks.
// timeoutMs defaults to 30000 for acquisition/lookup. A throw before any Response (DNS,
// connect, TLS, or a refused redirect) becomes NETWORK_ERROR with the original as cause; timeouts/aborts pass as-is.
// appToken is an optional Socrata app token supplied by local callers (never read from the
// environment here: this module is bundled into the hosted runtime). It is sent only as the
// X-App-Token header and only to the exact https://data.texas.gov origin; the URL is never changed
// and the value never enters metadata or errors. HTTP 429 throws SOURCE_THROTTLED with
// retryAfterMs; fetchSource itself never waits.
const SOCRATA_ORIGIN='https://data.texas.gov';
export const THROTTLE_RETRY_CAP_MS=60_000;
export function parseRetryAfter(value){
 if(typeof value!=='string')return null;const text=value.trim();if(!text)return null;
 if(/^\d+$/.test(text)){const ms=Number(text)*1000;return Number.isSafeInteger(ms)?ms:null;}
 // All three HTTP-date forms (IMF-fixdate, RFC 850, asctime) begin with a day name.
 if(!/^[A-Za-z]{3}/.test(text))return null;
 const at=Date.parse(text);return Number.isFinite(at)?Math.max(0,at-Date.now()):null;
}
const sendsToken=(target,appToken)=>{if(typeof appToken!=='string'||!appToken)return false;try{return new URL(target.url).origin===SOCRATA_ORIGIN;}catch{return false;}};
export async function fetchSource(target,{fetchImpl=fetch,testFixture=false,onResponse=null,timeoutMs=30000,appToken=null}={}){
 if(fetchImpl!==fetch&&!testFixture)throw failure('SOURCE_INVALID','Injected responses require fixture mode');
 const tokenUsed=sendsToken(target,appToken),init={signal:AbortSignal.timeout(timeoutMs),redirect:'error',...(tokenUsed?{headers:{'X-App-Token':appToken}}:{})};
 let response;try{response=await fetchImpl(target.url,init);}
 catch(error){if(error?.name==='TimeoutError'||error?.name==='AbortError')throw error;throw Object.assign(Error('Official source unreachable',{cause:error}),{code:'NETWORK_ERROR'});}
 onResponse?.(response.status);
 if(response.status===429)throw Object.assign(failure('SOURCE_THROTTLED','Official source throttled the request'),{retryAfterMs:parseRetryAfter(response.headers.get('retry-after'))});
 if(!response.ok)throw failure('HTTP_ERROR','Official source request failed');
 if(Number(response.headers.get('content-length'))>10_000_000)throw failure('SOURCE_LIMIT','Source byte cap exceeded');
 const reader=response.body?.getReader();if(!reader)throw failure('SOURCE_INVALID','Source response body unavailable');
 const chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10_000_000){await reader.cancel();throw failure('SOURCE_LIMIT','Source byte cap exceeded');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const body=Buffer.concat(chunks,size),metadata={url:target.url,retrieved_at:new Date().toISOString(),http_status:response.status,last_modified:response.headers.get('last-modified'),etag:response.headers.get('etag'),sha256:sha256(body),bytes:body.length,testFixture,app_token_used:tokenUsed};
 return {body,metadata};
}
// Opt-in for local callers only (the hosted guest path keeps its own journal backoff):
// on SOURCE_THROTTLED, wait the advertised Retry-After once and retry once. A missing,
// unparseable or over-cap Retry-After rethrows without waiting. wait is injectable for tests.
const sleep=ms=>new Promise(resolveWait=>setTimeout(resolveWait,ms));
export async function fetchSourceWithThrottleRetry(target,{wait=sleep,...options}={}){
 try{return await fetchSource(target,options);}
 catch(error){
  if(error?.code!=='SOURCE_THROTTLED'||typeof error.retryAfterMs!=='number'||error.retryAfterMs>THROTTLE_RETRY_CAP_MS)throw error;
  await wait(error.retryAfterMs);return fetchSource(target,options);
 }
}
