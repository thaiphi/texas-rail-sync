// Connected local reference server: the existing read-only routes and statics plus
// guest routes over the in-memory journal and object store. Local only, never hosted.
// Existing POST /api/lookup and /api/collect are refused, so this server never writes
// lookups/, collected-sources/, artifacts/ or runs/. Guest state is lost on exit.
import {createServer} from 'node:http';
import {Buffer} from 'node:buffer';
import {Readable} from 'node:stream';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createExplorerServer} from './serve.mjs';
import {acquisitionTargets} from '../src/sources.mjs';
import {createMemoryGuestJournal} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore} from '../src/hosted/evidence-store.mjs';
import {createGuestService,GUEST_EVIDENCE_NAMES} from '../src/hosted/guest-steps.mjs';
import {createGuestHttpHandler} from '../src/hosted/guest-http.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const sidecar=name=>name.replace(/\.[^.]+$/,'')+'.source.json';
const forwarded=['content-type','authorization','idempotency-key','origin'];
// Preserved public v2 packages, read-only, for offline_replay guest jobs.
export async function createPreservedReplaySource(artifactsRoot=resolve(root,'artifacts')){
 const artifactIds=[];
 for(const entry of await readdir(artifactsRoot,{withFileTypes:true})){
  if(!entry.isDirectory()||!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(entry.name))continue;
  try{const pins=JSON.parse(await readFile(resolve(artifactsRoot,entry.name,'version-pins.json')));await readFile(resolve(artifactsRoot,entry.name,'sources','acquisition.json'));if(pins.artifactId===entry.name&&pins.classification==='public_reported')artifactIds.push(entry.name);}catch{}
 }
 artifactIds.sort();
 return Object.freeze({artifactIds:Object.freeze(artifactIds),read:async(artifactId,name)=>{if(!artifactIds.includes(artifactId)||!GUEST_EVIDENCE_NAMES.includes(name))throw Object.assign(Error('Preserved evidence unavailable'),{code:'ENOENT'});return readFile(resolve(artifactsRoot,artifactId,'sources',name));}});
}
// Test-fixture responses from one preserved package's bytes. Every retrieval is
// recorded testFixture:true, so such collections can never become public versions.
export async function createPreservedFixtureFetch(sourcesDir){
 const responses=new Map();
 for(const name of [...acquisitionTargets.map(target=>target.name),'lookup-metadata.json','lookup-inventory.json']){
  const metadata=JSON.parse(await readFile(resolve(sourcesDir,sidecar(name))));
  if(!responses.has(metadata.url))responses.set(metadata.url,await readFile(resolve(sourcesDir,name)));
 }
 return async url=>responses.has(String(url))?new Response(responses.get(String(url)),{status:200}):new Response('No fixture response',{status:404});
}
export async function createGuestLocalServer({mode,fixtureSources=null}={}){
 if(!['fixture','official'].includes(mode))throw Error('Choose --fixture or --official explicitly');
 const explorer=createExplorerServer().listeners('request')[0],preserved=await createPreservedReplaySource(),fixture=mode==='fixture';
 const fixtureFetch=fixture?await createPreservedFixtureFetch(fixtureSources??resolve(root,'artifacts',preserved.artifactIds[0],'sources')):null;
 const store=createMemoryObjectStore();
 const service=createGuestService({journal:createMemoryGuestJournal({listObjects:()=>store.listKeys()}),store,preserved,testFixture:fixture,...(fixture?{fetchImpl:fixtureFetch}:{})});
 const guest=createGuestHttpHandler({service});
 return createServer(async(req,res)=>{
  try{
   const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(path==='/api/guest'||path.startsWith('/api/guest/')){
    const address=req.socket.remoteAddress,port=req.socket.localPort,host=req.headers.host;
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)||![`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`].includes(host)){res.writeHead(403,{'content-type':'text/plain'});res.end('Loopback request required');return;}
    const headers=Object.fromEntries(forwarded.filter(name=>typeof req.headers[name]==='string').map(name=>[name,req.headers[name]]));
    const request=new Request(`http://${host}${req.url}`,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
    const response=await guest(request,path),bytes=Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:bytes);return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'content-type':'text/plain'});res.end('Read-only local guest reference server');return;}
   explorer(req,res);
  }catch{if(!res.headersSent)res.writeHead(500,{'content-type':'text/plain'});res.end('Unavailable');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv.includes('--fixture')?'fixture':process.argv.includes('--official')?'official':null,port=Number(process.argv.slice(2).find(arg=>/^\d+$/.test(arg))??4175);
 const server=await createGuestLocalServer({mode});
 server.listen(port,'127.0.0.1',()=>console.log(`Texas RRC Explorer local guest reference (${mode}, in-memory): http://127.0.0.1:${port}`));
}
