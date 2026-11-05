import {createServer} from 'node:http';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,extname,sep,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {workflowView} from '../public/workflow.js';
import {performLookup,loadSelection} from '../src/lookup.mjs';
// Local /api/collect always produces query v5 (Phase 3b OD-1: the v4 targets plus the relation
// catalogue; v3 and v4 are no longer produced); the request schema is unchanged. The selected
// inventory row's own api_no keys the wellbore queries.
import {boundedRelationScope} from '../src/sources.mjs';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {sha256} from '../src/normalize.mjs';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
// ZC-02: optional Postgres index of runs and versions (DATABASE_URL); files stay authoritative.
import {connectRunIndex} from '../src/runIndex.mjs';
import {mkdir} from 'node:fs/promises';
import {buildVersionArchive} from '../src/versionArchive.mjs';
// E12-lite watched official RRC documents (local only, D7): routes exist only when watchRoot is given.
import {readWatchList,writeWatchList,readVerifiedCopy} from '../src/watchStore.mjs';
import {checkWatchedDocuments} from '../src/watchCheck.mjs';
import {normalizeWatchAddress,documentId,addDocument,stopWatching,rewatch,editDocument,markReviewed,addNote,ID_PATTERN} from '../public/watch-list.js';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
// Write routes accept only these peer addresses. The default is loopback; a container passes its network gateway
// explicitly (TRRC_TRUSTED_REMOTE_ADDRESSES) and must publish its port on the host's loopback only (docker-compose.yml).
export const LOOPBACK=Object.freeze(['127.0.0.1','::1','::ffff:127.0.0.1']);
export function trustedAddressList(value){
 const list=String(value??'').split(',').map(item=>item.trim()).filter(Boolean);
 if(!list.length)return LOOPBACK;
 for(const item of list)if(!isIP(item))throw Error(`TRRC_TRUSTED_REMOTE_ADDRESSES: not an IP address: ${item}`);
 return Object.freeze([...new Set([...LOOPBACK,...list])]);
}
const plainAddress=address=>String(address??'').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i,'');
export const isSameOriginWrite=({address,port,host,origin,trusted=LOOPBACK})=>trusted.some(item=>plainAddress(item)===plainAddress(address))&&[`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`].includes(host)&&origin===`http://${host}`;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.pdf':'application/pdf'};
export function createExplorerServer({runRoot=resolve(root,'runs'),lookupRoot=resolve(root,'lookups'),sourceRoot=resolve(root,'collected-sources'),outputRoot=resolve(root,'artifacts'),fetchImpl=fetch,testFixture=false,appToken=null,watchRoot=null,repoRoot=root,trustedAddresses=LOOPBACK,runIndex=null,onCheckError=()=>{},watchRenameFile}={}){
 // watchRoot switches the /api/watch* routes on; the store resolves watched-documents/ under repoRoot.
 if(watchRoot!==null&&resolve(watchRoot)!==resolve(repoRoot,'watched-documents'))throw Error('watchRoot must be <repoRoot>/watched-documents');
 let collecting=false,lookingUp=false,watchBusy=false,running=null,lastRun=null;
 // Codes whose own message may reach the client; anything else is reported with a generic message.
 const ALLOWED_CODES=['SOURCE_INVALID','SOURCE_SCOPE_MISMATCH','SOURCE_PROVENANCE_CONFLICT','SOURCE_HASH_MISMATCH','HTTP_ERROR','SOURCE_THROTTLED','SOURCE_LIMIT','SOURCE_ROW_LIMIT','REQUEST_INVALID','REQUEST_LIMIT','ORIGIN_FORBIDDEN','LOOKUP_BUSY','COLLECTION_BUSY','WATCH_ADDRESS_INVALID','WATCH_DUPLICATE','WATCH_BUSY','WATCH_LIST_INVALID','WATCH_LIST_MISSING','WATCH_LIST_BUSY','WATCH_CHECK_EXISTS'];
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
  if(!isSameOriginWrite({address:req.socket.remoteAddress,port:req.socket.localPort,host:req.headers.host,origin:req.headers.origin,trusted:trustedAddresses})){
   // Only with a configured address list (containers): makes a gateway mismatch visible. Peer address only, never headers.
   if(trustedAddresses!==LOOPBACK)console.warn(`write refused from peer ${req.socket.remoteAddress}`);
   throw apiError(403,'ORIGIN_FORBIDDEN','Same-origin loopback request required');
  }
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
 async function listRuns(){
  const runs=[];let unavailableRecords=0,entries=[];
  try{entries=await readdir(runRoot,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const entry of entries){if(!entry.isDirectory()){unavailableRecords++;continue;}try{const record=await readRun(entry.name);runs.push({runId:record.runId,startedAt:record.startedAt,endedAt:record.endedAt,mode:record.mode,status:record.status,testFixture:false,artifactId:record.events.find(e=>e.stage==='export'&&e.status==='succeeded')?.evidence.artifactId??null});}catch{unavailableRecords++;}}
  runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.runId.localeCompare(a.runId));return {runs,unavailableRecords};
 }
 // Refreshes the optional Postgres index from the files; an index failure never fails a request.
 async function refreshIndex(){
  if(!runIndex)return;
  try{await runIndex.sync({runs:(await listRuns()).runs,versions:await listVersions()});}catch(error){console.error(`run index: ${error.code??'SYNC_FAILED'}`);}
 }
 // One watch write or check at a time; the list is re-read from disk on every request, never cached.
 const WATCH_FIELDS={check:[],add:['url','name','kind'],stop:['id'],rewatch:['id'],edit:['id','name','kind'],review:['id','note'],note:['id','changeId','note']};
 const WATCH_STATUS={WATCH_LIST_INVALID:500,WATCH_LIST_MISSING:500,WATCH_ADDRESS_INVALID:400,WATCH_DUPLICATE:409,WATCH_BUSY:409,WATCH_LIST_BUSY:503,WATCH_COPY_DAMAGED:409,WATCH_CHECK_EXISTS:409};
 // watchRenameFile is the store's held-file test seam (writeWatchList); undefined uses fs rename.
 const watchStore={repoRoot,...(watchRenameFile?{renameFile:watchRenameFile}:{})};
 async function lastCheck(){
  let names=[];try{names=await readdir(resolve(repoRoot,'watched-documents','checks'));}catch(error){if(error.code!=='ENOENT')throw error;}
  let latest=null;
  for(const name of names){if(!name.endsWith('.json'))continue;try{
   const record=JSON.parse(await readFile(resolve(repoRoot,'watched-documents','checks',name),'utf8'));
   if(typeof record?.check_id==='string'&&typeof record.ended_at==='string'&&(!latest||record.ended_at>latest.ended_at))latest={check_id:record.check_id,ended_at:record.ended_at};
  }catch{}}
  return latest;
 }
 // The store retries a held watch-list.json and then throws WATCH_LIST_BUSY (503 through WATCH_STATUS).
 const saveList=list=>writeWatchList(watchStore,list);
 // A failed run is kept until a later run succeeds, so the screen never reads a failed check as finished.
 const failedRun=(checkId,error)=>{
  const known=ALLOWED_CODES.includes(error?.code);
  return {checkId,outcome:'failed',code:known?error.code:'REQUEST_FAILED',message:known?String(error.message):'The check did not complete.'};
 };
 async function watchPost(action,body,res){
  if(!Object.hasOwn(WATCH_FIELDS,action))throw apiError(404,'REQUEST_INVALID','Unknown watch action');
  if(Object.keys(body).some(key=>!WATCH_FIELDS[action].includes(key)))throw apiError(400,'REQUEST_INVALID','Unsupported watch request field');
  if(action!=='check'&&action!=='add'&&(typeof body.id!=='string'||!ID_PATTERN.test(body.id)))throw apiError(400,'REQUEST_INVALID','A document id is required');
  if(watchBusy)throw apiError(409,'WATCH_BUSY','A check or another change is already running');
  watchBusy=true;let handedOff=false;
  try{
   const list=await readWatchList(watchStore),now=new Date().toISOString();
   if(action==='check'){
    const checkId=randomUUID();running={checkId,done:0,total:list.documents.filter(doc=>doc.watched!==false).length};
    handedOff=true;
    checkWatchedDocuments({repoRoot,fetchImpl,testFixture,checkId,renameFile:watchRenameFile,onProgress:({done,total})=>{running={checkId,done,total};}})
     .then(()=>{lastRun=null;},error=>{lastRun=failedRun(checkId,error);try{onCheckError(error);}catch{}})
     .finally(()=>{running=null;watchBusy=false;});
    send(res,202,{checkId});return;
   }
   if(action==='add'){
    const id=await documentId(normalizeWatchAddress(body.url)),next=addDocument(list,body,{now,id,via:'owner'});
    await saveList(next);send(res,201,{document:next.documents.find(doc=>doc.id===id)});return;
   }
   const index=list.documents.findIndex(doc=>doc.id===body.id);
   if(index<0)throw apiError(404,'REQUEST_INVALID','No document on the list has this id');
   let next;
   if(action==='stop')next=stopWatching(list,body.id,{now});
   else if(action==='rewatch')next=rewatch(list,body.id,{now});
   else if(action==='edit')next=editDocument(list,body.id,{name:body.name,kind:body.kind},{now});
   else{
    const doc=action==='review'?markReviewed(list.documents[index],{note:body.note,now}):addNote(list.documents[index],{changeId:body.changeId,note:body.note,now});
    next={...list,documents:list.documents.map((item,position)=>position===index?doc:item)};
   }
   await saveList(next);send(res,200,{document:next.documents[index]});
  }finally{if(!handedOff)watchBusy=false;}
 }
 // The copy for a hash: the latest record first (a repair names a fresh file there), then history newest first.
 async function watchCopy(docId,hash,req,res){
  const doc=(await readWatchList(watchStore)).documents.find(item=>item.id===docId);if(!doc)throw Error('Unknown document');
  const paths=[];
  if(doc.latest?.sha256===hash)paths.push(doc.latest.path);
  for(const ev of [...doc.history].reverse()){if(ev.sha256===hash&&ev.path)paths.push(ev.path);if(ev.type==='change'&&ev.previous_sha256===hash&&ev.previous_path)paths.push(ev.previous_path);}
  let damaged=false;
  for(const path of new Set(paths)){
   let bytes;
   try{bytes=await readVerifiedCopy(watchStore,path,hash);}
   catch(error){if(error.code==='WATCH_COPY_DAMAGED'){damaged=true;continue;}if(['WATCH_COPY_MISSING','WATCH_PATH_INVALID'].includes(error.code))continue;throw error;}
   const pdf=extname(path).toLowerCase()==='.pdf';
   res.writeHead(200,{'content-type':pdf?'application/pdf':'text/plain; charset=utf-8',...(pdf?{'content-disposition':`inline; filename="${hash}.pdf"`}:{}),'content-length':bytes.length,'cache-control':'no-cache','x-content-type-options':'nosniff'});
   res.end(req.method==='HEAD'?undefined:bytes);return;
  }
  if(damaged)throw apiError(409,'WATCH_COPY_DAMAGED','This saved copy no longer matches its recorded fingerprint');
  throw Error('Unknown copy');
 }
  const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);
   const watchAction=watchRoot!==null&&req.method==='POST'?/^\/api\/watch\/([a-z]+)$/.exec(path)?.[1]:undefined;
   if(req.method==='POST'&&(['/api/lookup','/api/collect'].includes(path)||watchAction)){
    try{
     guardWrite(req);const body=await readBody(req);
     if(watchAction){await watchPost(watchAction,body,res);return;}
     if(path==='/api/lookup'){
      if(lookingUp)throw apiError(409,'LOOKUP_BUSY','One lookup is already active');lookingUp=true;
      try{const result=await performLookup({request:body,lookupRoot,fetchImpl,testFixture,appToken});send(res,200,result);}finally{lookingUp=false;}return;
     }
     if(Object.keys(body).some(key=>!['lookupId','sourceRecordKey','startMonth','endMonth'].includes(key)))throw apiError(400,'REQUEST_INVALID','Unsupported collection request field');
     if(collecting)throw apiError(409,'COLLECTION_BUSY','One collection is already active');collecting=true;
     try{
      const selection=await loadSelection({lookupRoot,lookupId:body.lookupId,sourceRecordKey:body.sourceRecordKey}),scope=boundedRelationScope(selection.row.uic_number,body.startMonth,body.endMonth,selection.row.api_no);
      await mkdir(sourceRoot,{recursive:true});const id=randomUUID(),artifactId=`rrc-${new Date().toISOString().slice(0,10)}-uic${scope.monthlyUic}-${id}`;
      const result=await collectPublicSnapshot({sourceDir:resolve(sourceRoot,id),artifactId,outputRoot,runRoot,scope,selection,fetchImpl,testFixture,appToken});
      const pins=JSON.parse(result.files['version-pins.json']);send(res,201,{artifactId,version:pins,run:result.record,scope:result.manifest.scope,realHistoryStatus:result.manifest.real_history_status});
     }finally{collecting=false;void refreshIndex();}return;
    }catch(error){
     const status=error.status??WATCH_STATUS[error.code]??(error.record?502:error.code==='HTTP_ERROR'?502:error.code==='SOURCE_THROTTLED'?503:400),allowed=ALLOWED_CODES;
     const recognized=allowed.includes(error.code);send(res,status,{error:{code:recognized?error.code:'REQUEST_FAILED',message:error.record?'Collection did not complete; inspect retained run evidence.':recognized?error.message:'Requested source evidence is unavailable or invalid.'},...(error.record?{run:error.record}: {}),...(error.code==='WATCH_DUPLICATE'&&typeof error.existingId==='string'?{existingId:error.existingId}:{})});return;
    }
   }
   if(!['GET','HEAD'].includes(req.method))throw Error('Forbidden');
   if(path==='/api/health'){
    send(res,200,{schemaVersion:1,status:'ok',database:runIndex?await runIndex.status():{status:'off'}},req.method==='HEAD');return;
   }
   if(path==='/api/versions'){
    send(res,200,{schemaVersion:1,versions:await listVersions()},req.method==='HEAD');return;
   }
   const archiveRoute=/^\/api\/versions\/([a-z0-9][a-z0-9._-]{0,127})\/download$/i.exec(path);
   if(archiveRoute){
    const id=archiveRoute[1],pins=(await listVersions()).find(version=>version.artifactId===id);if(!pins)throw Error('Unavailable public version');
    const bytes=await buildVersionArchive({directory:resolve(outputRoot,id),pins});res.writeHead(200,{'content-type':'application/x-tar','content-length':bytes.length,'content-disposition':`attachment; filename="${id}.tar"`,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);return;
   }
   if(watchRoot!==null&&(path==='/api/watch'||path.startsWith('/api/watch/'))){
    const copyRoute=/^\/api\/watch\/copy\/([0-9a-f]{12})\/([0-9a-f]{64})$/.exec(path);
    if(path!=='/api/watch'&&!copyRoute)throw Error('Unavailable API route');
    try{
     if(copyRoute){await watchCopy(copyRoute[1],copyRoute[2],req,res);return;}
     const list=await readWatchList(watchStore);
     send(res,200,{schemaVersion:1,list,running:running&&{...running},lastCheck:await lastCheck(),lastRun:lastRun&&{...lastRun}},req.method==='HEAD');return;
    }catch(error){
     if(['WATCH_LIST_INVALID','WATCH_LIST_MISSING','WATCH_COPY_DAMAGED'].includes(error.code)){send(res,WATCH_STATUS[error.code],{error:{code:error.code,message:error.message}},req.method==='HEAD');return;}
     throw error;
    }
   }
   if(path.startsWith('/api/')&&path!=='/api/runs'&&!path.startsWith('/api/runs/'))throw Error('Unavailable API route');
   let bytes,headers;
   if(path==='/api/runs'||path.startsWith('/api/runs/')){
    let data;
    if(path==='/api/runs'){
     data={schemaVersion:1,...await listRuns()};
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
 server.refreshIndex=refreshIndex;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const port=Number(process.argv[2]??process.env.PORT??4174),host=process.env.TRRC_LISTEN_HOST?.trim()||'127.0.0.1';
 const runIndex=process.env.DATABASE_URL?await connectRunIndex({connectionString:process.env.DATABASE_URL}):null;
 const server=createExplorerServer({appToken:process.env.TRRC_SOCRATA_APP_TOKEN?.trim()||null,watchRoot:resolve(root,'watched-documents'),repoRoot:root,trustedAddresses:trustedAddressList(process.env.TRRC_TRUSTED_REMOTE_ADDRESSES),runIndex});
 if(!['127.0.0.1','::1','localhost'].includes(host))console.warn(`Listening on ${host}: publish this port on the host's loopback only (see docker-compose.yml).`);
 server.listen(port,host,()=>{console.log(`Texas RRC Explorer: http://127.0.0.1:${port}${host==='127.0.0.1'?'':` (listening on ${host})`}${runIndex?' · run index: Postgres':''}`);server.refreshIndex();});
}
