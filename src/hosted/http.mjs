import {buildVersionArchiveFromReader} from '../archiveBytes.mjs';
const types={json:'application/json; charset=utf-8',csv:'text/csv; charset=utf-8',pdf:'application/pdf',html:'text/plain; charset=utf-8',htm:'text/plain; charset=utf-8'};
const versionPattern=/^[a-z0-9][a-z0-9._-]{0,127}$/i,runPattern=/^[a-f0-9-]{36}$/i;
const safePath=path=>path.length<=1024&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'&&/^[a-z0-9_.-]+$/i.test(part));
// Framework-independent server handler. Authentication is injected explicitly;
// this constructor never assumes that possession of a URL authorizes access.
export function createHostedExplorerHandler({store,catalog,authorize}){
 if(typeof authorize!=='function')throw Error('Explicit hosted authorization required');
 const response=(body,status,type,head=false,extra={})=>{
  const bytes=typeof body==='string'?new TextEncoder().encode(body):body;
  return new Response(head?null:bytes,{status,headers:{'content-type':type,'content-length':String(bytes.byteLength),'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
 };
 const json=(body,status=200,head=false)=>response(JSON.stringify(body),status,types.json,head);
 return async request=>{
  const head=request.method==='HEAD';
  try{
   if(await authorize(request)!==true)return json({error:{code:'AUTH_REQUIRED',message:'Sign in with an authorized account.'}},401,head);
   const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname);}catch{return json({error:{code:'NOT_FOUND',message:'Evidence unavailable.'}},404,head);}
   if(request.method==='POST'&&['/api/lookup','/api/collect'].includes(path))return json({error:{code:'HOSTED_COLLECTION_UNAVAILABLE',message:'Hosted collection is not enabled. Existing local collection remains available.'}},503);
   if(!['GET','HEAD'].includes(request.method))return json({error:{code:'METHOD_NOT_ALLOWED',message:'Read-only endpoint.'}},405);
   if(path==='/api/versions')return json({schemaVersion:1,versions:await catalog.listVersions()},200,head);
   if(path==='/api/runs')return json(await catalog.listRuns(),200,head);
   const runRoute=/^\/api\/runs\/([^/]+)$/.exec(path);
   if(runRoute&&runPattern.test(runRoute[1]))return json(await catalog.readRun(runRoute[1]),200,head);
   if(['/artifact-path.json','/artifact-integrity.json'].includes(path))return response(await store.read('public'+path),200,types.json,head);
   const archiveRoute=/^\/api\/versions\/([^/]+)\/download$/.exec(path),fileRoute=/^\/artifacts\/([^/]+)\/(.+)$/.exec(path);
   const artifactId=archiveRoute?.[1]??fileRoute?.[1];
   if(artifactId&&versionPattern.test(artifactId)){
    const pins=(await catalog.listVersions()).find(version=>version.artifactId===artifactId);
    if(pins){
     if(archiveRoute){
      const bytes=await buildVersionArchiveFromReader({pins,read:name=>store.read(`artifacts/${artifactId}/${name}`)});
      return response(bytes,200,'application/x-tar',head,{'content-disposition':`attachment; filename="${artifactId}.tar"`});
     }
     const name=fileRoute[2];
     if(safePath(name)){
      const bytes=await store.read(`artifacts/${artifactId}/${name}`),headers={};
      if(url.searchParams.get('download')==='1')headers['content-disposition']=`attachment; filename="${name.split('/').at(-1)}"`;
      return response(bytes,200,types[name.split('.').at(-1).toLowerCase()]??'application/octet-stream',head,headers);
     }
    }
   }
   return json({error:{code:'NOT_FOUND',message:'Evidence unavailable.'}},404,head);
  }catch(error){
   const missing=error?.code==='ARCHIVE_NOT_FOUND';
   return json({error:{code:missing?'NOT_FOUND':'EVIDENCE_UNAVAILABLE',message:missing?'Evidence unavailable.':'Verified evidence could not be loaded.'}},missing?404:503,head);
  }
 };
}
