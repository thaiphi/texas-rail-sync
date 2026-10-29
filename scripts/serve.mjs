import {createServer} from 'node:http';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,extname,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {workflowView} from '../public/workflow.js';
import {performLookup,loadSelection} from '../src/lookup.mjs';
// Local /api/collect always produces query v4 (owner, 2026-10-29: v3 is no longer produced); the
// request schema is unchanged. The selected inventory row's own api_no keys the wellbore queries.
import {boundedWellboreScope} from '../src/sources.mjs';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {sha256} from '../src/normalize.mjs';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {buildVersionArchive} from '../src/versionArchive.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.pdf':'application/pdf'};
export function createExplorerServer({runRoot=resolve(root,'runs'),lookupRoot=resolve(root,'lookups'),sourceRoot=resolve(root,'collected-sources'),outputRoot=resolve(root,'artifacts'),fetchImpl=fetch,testFixture=false,appToken=null}={}){
 let collecting=false,lookingUp=false;
 const apiError=(status,code,message)=>Object.assign(Error(message),{status,code});
 const send=(res,status,data,head=false)=>{const bytes=Buffer.from(JSON.stringify(data));res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':bytes.length,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(head?undefined:bytes);};
 async function readBody(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw apiError(415,'REQUEST_INVALID','JSON request required');
  if(Number(req.headers['content-length'])>8192)throw apiError(413,'REQUEST_LIMIT','Request exceeds 8192 bytes');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw apiError(413,'REQUEST_LIMIT','Request exceeds 8192 bytes');chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw apiError(400,'REQUEST_INVALID','Invalid JSON request');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw apiError(400,'REQUEST_INVALID','Request object required');return body;
 }
 function guardWrite(req){
  const address=req.socket.remoteAddress,port=req.socket.localPort,host=req.headers.host;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)||![`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`].includes(host)||req.headers.origin!==`http://${host}`)throw apiError(403,'ORIGIN_FORBIDDEN','Same-origin loopback request required');
 }
 async function readRun(id){
  if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid run');
  const directory=resolve(runRoot,id),path=resolve(directory,'record.json');
  if((await lstat(directory)).isSymbolicLink()||(await lstat(path)).isSymbolicLink())throw Error('Invalid run path');
  const record=JSON.parse(await readFile(path));workflowView(record);if(record.testFixture||record.runId!==id)throw Error('Unavailable run');return record;
 }
 async function listVersions(){
  const pinned=JSON.parse(await readFile(resolve(root,'public/artifact-integrity.json'))),versions=[{...pinned,path:`/artifacts/${pinned.artifactId}/`,classification:'public_reported',realHistoryStatus:'verified_bounded_linkage',defaultPinned:true}],seen=new Set([pinned.artifactId]);
  let entries=[];try{entries=await readdir(runRoot,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const entry of entries){try{
   const record=await readRun(entry.name);if(record.status!=='succeeded'||record.provenance?.classification!=='public_reported')continue;
   const evidence=record.events.find(event=>event.stage==='export'&&event.status==='succeeded')?.evidence,id=evidence?.artifactId;if(!id||seen.has(id)||!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id))continue;
   const output=evidence.outputs.find(item=>item.path.endsWith(`/${id}/version-pins.json`));if(!output)continue;
   const bytes=await readFile(resolve(outputRoot,id,'version-pins.json'));if(sha256(bytes)!==output.sha256)continue;
   const pins=JSON.parse(bytes);if(pins.artifactId!==id||pins.classification!=='public_reported'||pins.path!==`/artifacts/${id}/`)continue;
   versions.push({...pins,publicationPinsSha256:output.sha256,runId:record.runId,startedAt:record.startedAt,defaultPinned:false});seen.add(id);
  }catch{}}
  return versions;
 }
 return createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);
   if(req.method==='POST'&&['/api/lookup','/api/collect'].includes(path)){
    try{
     guardWrite(req);const body=await readBody(req);
     if(path==='/api/lookup'){
      if(lookingUp)throw apiError(409,'LOOKUP_BUSY','One lookup is already active');lookingUp=true;
      try{const result=await performLookup({request:body,lookupRoot,fetchImpl,testFixture,appToken});send(res,200,result);}finally{lookingUp=false;}return;
     }
     if(Object.keys(body).some(key=>!['lookupId','sourceRecordKey','startMonth','endMonth'].includes(key)))throw apiError(400,'REQUEST_INVALID','Unsupported collection request field');
     if(collecting)throw apiError(409,'COLLECTION_BUSY','One collection is already active');collecting=true;
     try{
      const selection=await loadSelection({lookupRoot,lookupId:body.lookupId,sourceRecordKey:body.sourceRecordKey}),scope=boundedWellboreScope(selection.row.uic_number,body.startMonth,body.endMonth,selection.row.api_no);
      await mkdir(sourceRoot,{recursive:true});const id=randomUUID(),artifactId=`rrc-${new Date().toISOString().slice(0,10)}-uic${scope.monthlyUic}-${id}`;
      const result=await collectPublicSnapshot({sourceDir:resolve(sourceRoot,id),artifactId,outputRoot,runRoot,scope,selection,fetchImpl,testFixture,appToken});
      const pins=JSON.parse(result.files['version-pins.json']);send(res,201,{artifactId,version:pins,run:result.record,scope:result.manifest.scope,realHistoryStatus:result.manifest.real_history_status});
     }finally{collecting=false;}return;
    }catch(error){
     const status=error.status??(error.record?502:error.code==='HTTP_ERROR'?502:error.code==='SOURCE_THROTTLED'?503:400),allowed=['SOURCE_INVALID','SOURCE_SCOPE_MISMATCH','SOURCE_PROVENANCE_CONFLICT','SOURCE_HASH_MISMATCH','HTTP_ERROR','SOURCE_THROTTLED','SOURCE_LIMIT','SOURCE_ROW_LIMIT','REQUEST_INVALID','REQUEST_LIMIT','ORIGIN_FORBIDDEN','LOOKUP_BUSY','COLLECTION_BUSY'];
     const recognized=allowed.includes(error.code);send(res,status,{error:{code:recognized?error.code:'REQUEST_FAILED',message:error.record?'Collection did not complete; inspect retained run evidence.':recognized?error.message:'Requested source evidence is unavailable or invalid.'},...(error.record?{run:error.record}: {})});return;
    }
   }
   if(!['GET','HEAD'].includes(req.method))throw Error('Forbidden');
   if(path==='/api/versions'){
    send(res,200,{schemaVersion:1,versions:await listVersions()},req.method==='HEAD');return;
   }
   const archiveRoute=/^\/api\/versions\/([a-z0-9][a-z0-9._-]{0,127})\/download$/i.exec(path);
   if(archiveRoute){
    const id=archiveRoute[1],pins=(await listVersions()).find(version=>version.artifactId===id);if(!pins)throw Error('Unavailable public version');
    const bytes=await buildVersionArchive({directory:resolve(outputRoot,id),pins});res.writeHead(200,{'content-type':'application/x-tar','content-length':bytes.length,'content-disposition':`attachment; filename="${id}.tar"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);return;
   }
   if(path.startsWith('/api/')&&path!=='/api/runs'&&!path.startsWith('/api/runs/'))throw Error('Unavailable API route');
   let bytes,headers;
   if(path==='/api/runs'||path.startsWith('/api/runs/')){
    let data;
    if(path==='/api/runs'){
     const runs=[];let unavailableRecords=0,entries=[];
     try{entries=await readdir(runRoot,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
     for(const entry of entries){if(!entry.isDirectory()){unavailableRecords++;continue;}try{const record=await readRun(entry.name);runs.push({runId:record.runId,startedAt:record.startedAt,endedAt:record.endedAt,mode:record.mode,status:record.status,testFixture:false,artifactId:record.events.find(e=>e.stage==='export'&&e.status==='succeeded')?.evidence.artifactId??null});}catch{unavailableRecords++;}}
     runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.runId.localeCompare(a.runId));data={schemaVersion:1,runs,unavailableRecords};
    }else data=await readRun(path.slice('/api/runs/'.length));
    bytes=Buffer.from(JSON.stringify(data));headers={'content-type':'application/json; charset=utf-8'};
   }else{
    const isArtifact=path.startsWith('/artifacts/'),routeRoot=isArtifact?outputRoot:resolve(root,'public');
    const relative=isArtifact?path.slice('/artifacts/'.length):path==='/'?'index.html':path.slice(1),target=resolve(routeRoot,relative);
    if(!target.startsWith(routeRoot+sep))throw Error('Forbidden');
    const resolvedTarget=await realpath(target),resolvedRoot=await realpath(routeRoot);
    if(!resolvedTarget.startsWith(resolvedRoot+sep))throw Error('Forbidden');
    const extension=extname(target).toLowerCase();
    bytes=await readFile(target);headers={'content-type':isArtifact&&['.html','.htm'].includes(extension)?'text/plain; charset=utf-8':types[extension]??'application/octet-stream'};
    if(isArtifact&&url.searchParams.get('download')==='1')headers['content-disposition']=`attachment; filename="${basename(target).replace(/["\r\n]/g,'_')}"`;
   }
   Object.assign(headers,{'content-length':bytes.length,'cache-control':'no-cache','x-content-type-options':'nosniff'});
   res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('File not found');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const port=Number(process.argv[2]??process.env.PORT??4174);createExplorerServer({appToken:process.env.TRRC_SOCRATA_APP_TOKEN?.trim()||null}).listen(port,'127.0.0.1',()=>console.log(`Texas RRC Explorer: http://127.0.0.1:${port}`));}
