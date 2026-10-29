// This fixed public endpoint contains no browser/server credential.
const backend='https://phxiqnsebqaalvkanljb.supabase.co/functions/v1/trrc-explorer';
const guestGet=/^\/api\/guest\/(?:history|jobs\/[a-f0-9-]{36}(?:\/archive|\/runs\/[a-f0-9-]{36})?)$/,guestPost=/^\/api\/guest\/(?:session|lookups|collections|jobs\/[a-f0-9-]{36}\/advance)$/;
const evidencePath=path=>guestGet.test(path)||guestPost.test(path)||/^\/api\/(?:versions(?:\/[a-z0-9._-]+\/download)?|runs(?:\/[a-f0-9-]{36})?|lookup|collect)$/i.test(path)||/^\/artifacts\/[a-z0-9._-]+\/[a-z0-9_./-]+$/i.test(path)||['/artifact-path.json','/artifact-integrity.json'].includes(path);
export function createHostingBridge({html,fetchImpl=fetch}){
 if(typeof html!=='string')throw Error('Existing Explorer shell required');
 const error=(status,code,message)=>Response.json({error:{code,message}},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 return async request=>{
  const url=new URL(request.url),head=request.method==='HEAD';
  if(url.pathname==='/'&&['GET','HEAD'].includes(request.method))return new Response(head?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(!evidencePath(url.pathname))return null;
  if(!['GET','HEAD','POST'].includes(request.method))return error(405,'METHOD_NOT_ALLOWED','Unsupported request.');
  if(request.method==='POST'&&!['/api/lookup','/api/collect'].includes(url.pathname)&&!guestPost.test(url.pathname))return error(405,'METHOD_NOT_ALLOWED','Read-only endpoint.');
  if(request.method!=='POST'&&guestPost.test(url.pathname))return error(405,'METHOD_NOT_ALLOWED','Guest actions use POST.');
  try{
   const headers=new Headers();headers.set('accept','application/json, application/octet-stream');headers.set('accept-encoding','identity');
   // Guest credentials and keys cross only to guest routes; Bearer stays on legacy POSTs.
   if(guestGet.test(url.pathname)||guestPost.test(url.pathname)){const auth=request.headers.get('authorization');if(auth&&/^Guest [A-Za-z0-9_-]{43}$/.test(auth))headers.set('authorization',auth);const key=request.headers.get('idempotency-key');if(key&&/^[A-Za-z0-9_-]{16,128}$/.test(key))headers.set('idempotency-key',key);}
   let body;
   if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)return error(403,'ORIGIN_FORBIDDEN','Same-origin request required.');
    headers.set('origin',url.origin);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return error(415,'REQUEST_INVALID','JSON request required.');
    // Bound input before forwarding; no cookies or arbitrary headers cross origins.
    const reader=request.body?.getReader(),parts=[];let size=0;
    if(reader){try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>8192){await reader.cancel();return error(413,'REQUEST_LIMIT','Request too large.');}parts.push(item.value);}}finally{reader.releaseLock();}}
    body=new Uint8Array(size);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
    headers.set('content-type','application/json');const authorization=request.headers.get('authorization');if(authorization&&!guestPost.test(url.pathname)&&!/^Guest /i.test(authorization))headers.set('authorization',authorization);
   }
   // Workers throws on redirect:'error' before sending (the published-site 503), so redirects are caught manually and refused.
   const upstream=await fetchImpl(backend+url.pathname+url.search,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(120000)});
   if(upstream.type==='opaqueredirect'||(upstream.status>=300&&upstream.status<400)){await upstream.body?.cancel();return error(502,'BACKEND_REDIRECT_REFUSED','Saved datasets are temporarily unavailable. Please retry.');}
   // Streamed upstream.body is decoded (undici keeps the header; on the published Workers site Supabase answered gzip-encoded), so content-encoding is never forwarded.
   const resultHeaders=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff'});
   for(const name of ['content-type','content-disposition']){const value=upstream.headers.get(name);if(value)resultHeaders.set(name,value);}
   // An encoded HEAD length is the compressed size, so it is forwarded only for identity bodies.
   const length=upstream.headers.get('content-length'),encoding=upstream.headers.get('content-encoding');if(head&&/^\d+$/.test(length??'')&&(!encoding||/^identity$/i.test(encoding)))resultHeaders.set('content-length',length);
   return new Response(head?null:upstream.body,{status:upstream.status,headers:resultHeaders});
  }catch(failure){console.error(JSON.stringify({event:'bridge_upstream_failed',name:String(failure?.name??'Error')}));return error(503,'BACKEND_FETCH_FAILED','Saved datasets are temporarily unavailable. Please retry.');}
 };
}
