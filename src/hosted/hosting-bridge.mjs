// This fixed public endpoint contains no browser/server credential.
const backend='https://phxiqnsebqaalvkanljb.supabase.co/functions/v1/trrc-explorer';
const evidencePath=path=>/^\/api\/(?:versions(?:\/[a-z0-9._-]+\/download)?|runs(?:\/[a-f0-9-]{36})?|lookup|collect)$/i.test(path)||/^\/artifacts\/[a-z0-9._-]+\/[a-z0-9_./-]+$/i.test(path)||['/artifact-path.json','/artifact-integrity.json'].includes(path);
export function createHostingBridge({html,fetchImpl=fetch}){
 if(typeof html!=='string')throw Error('Existing Explorer shell required');
 const error=(status,code,message)=>Response.json({error:{code,message}},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 return async request=>{
  const url=new URL(request.url),head=request.method==='HEAD';
  if(url.pathname==='/'&&['GET','HEAD'].includes(request.method))return new Response(head?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(!evidencePath(url.pathname))return null;
  if(!['GET','HEAD','POST'].includes(request.method))return error(405,'METHOD_NOT_ALLOWED','Unsupported request.');
  if(request.method==='POST'&&!['/api/lookup','/api/collect'].includes(url.pathname))return error(405,'METHOD_NOT_ALLOWED','Read-only endpoint.');
  try{
   const headers=new Headers();headers.set('accept','application/json, application/octet-stream');headers.set('accept-encoding','identity');
   let body;
   if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)return error(403,'ORIGIN_FORBIDDEN','Same-origin request required.');
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return error(415,'REQUEST_INVALID','JSON request required.');
    // Bound input before forwarding; no cookies or arbitrary headers cross origins.
    const reader=request.body?.getReader(),parts=[];let size=0;
    if(reader){try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>8192){await reader.cancel();return error(413,'REQUEST_LIMIT','Request too large.');}parts.push(item.value);}}finally{reader.releaseLock();}}
    body=new Uint8Array(size);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
    headers.set('content-type','application/json');const authorization=request.headers.get('authorization');if(authorization)headers.set('authorization',authorization);
   }
   const upstream=await fetchImpl(backend+url.pathname+url.search,{method:request.method,headers,body,redirect:'error',signal:AbortSignal.timeout(120000)});
   if(upstream.headers.get('content-encoding')&&!/^identity$/i.test(upstream.headers.get('content-encoding'))){await upstream.body?.cancel();return error(503,'BACKEND_UNAVAILABLE','Saved datasets are temporarily unavailable. Please retry.');}
   const resultHeaders=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff'});
   for(const name of ['content-type','content-disposition']){const value=upstream.headers.get(name);if(value)resultHeaders.set(name,value);}
   const length=upstream.headers.get('content-length');if(head&&/^\d+$/.test(length??''))resultHeaders.set('content-length',length);
   return new Response(head?null:upstream.body,{status:upstream.status,headers:resultHeaders});
  }catch{return error(503,'BACKEND_UNAVAILABLE','Saved datasets are temporarily unavailable. Please retry.');}
 };
}
