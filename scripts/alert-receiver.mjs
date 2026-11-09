// ZC-06 (issue #42): the local on-call responder's webhook receiver. Grafana's `explorer-responder` contact point
// (observability/grafana/provisioning/alerting/explorer-alerts.yaml) POSTs each firing and resolved alert to /alerts.
// Each accepted body is saved verbatim as one JSON file; ZC-07 (#43) hangs the responder agent on `onAlert`.
//   node scripts/alert-receiver.mjs [--port 8001] [--bind 127.0.0.1] [--out tmp/alerts]
// The bearer token is ALERT_WEBHOOK_TOKEN (default: the local-only placeholder that observability/compose.yaml also uses).
// Loopback is enough on Docker Desktop; Linux Docker (CI, Codespaces) needs --bind 0.0.0.0 to be reached from the container,
// and then refuses to start with the published default token: set your own ALERT_WEBHOOK_TOKEN for Grafana and the receiver.
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';

export const DEFAULT_TOKEN='explorer-local-alert-token';
const root=fileURLToPath(new URL('..',import.meta.url));
const STATUSES=new Set(['firing','resolved']);
const LOOPBACK=new Set(['127.0.0.1','::1','localhost']);

const send=(response,status,body)=>{
 response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
 response.end(JSON.stringify(body));
};
const sameToken=(header,token)=>{
 const expected=Buffer.from(`Bearer ${token}`),given=Buffer.from(String(header??''));
 return given.length===expected.length&&timingSafeEqual(given,expected);
};
// 20261109T100000123Z: sortable, and safe in Windows file names.
const stamp=date=>date.toISOString().replace(/[-:.]/g,'');

export function createAlertReceiver({token=DEFAULT_TOKEN,outDir=resolve(root,'tmp/alerts'),maxBytes=1_000_000,onAlert=null,log=console.log,now=()=>new Date()}={}){
 let seq=0;
 return createServer((request,response)=>{
  const path=new URL(request.url??'/','http://receiver').pathname;
  if(request.method==='GET'&&path==='/health')return send(response,200,{ok:true});
  if(request.method!=='POST'||path!=='/alerts'){request.resume();return send(response,404,{error:'not found'});}
  if(!sameToken(request.headers.authorization,token)){
   request.resume();log('alert-receiver: refused a request without the bearer token');
   return send(response,401,{error:'unauthorized'});
  }
  const chunks=[];let size=0,tooLarge=false;
  request.on('data',chunk=>{
   if(tooLarge)return;
   size+=chunk.length;
   // Answer at once and stop reading, so an endless body cannot keep the connection busy.
   if(size>maxBytes){tooLarge=true;chunks.length=0;response.setHeader('connection','close');send(response,413,{error:'body too large'});request.unpipe?.();request.pause();return;}
   chunks.push(chunk);
  });
  request.on('end',async()=>{
   if(tooLarge)return;
   let body;
   try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(response,400,{error:'invalid JSON'});}
   const status=STATUSES.has(body?.status)?body.status:'unknown';
   const file=join(outDir,`${stamp(now())}-${String(++seq%10000).padStart(4,'0')}-${status}.json`);
   try{
    await mkdir(outDir,{recursive:true});
    await writeFile(file,JSON.stringify(body,null,1)+'\n');
   }catch(error){
    log(`alert-receiver: could not save the alert: ${error?.code??error?.message}`);
    return send(response,500,{error:'could not save'});
   }
   const names=[...new Set((Array.isArray(body?.alerts)?body.alerts:[]).map(alert=>alert?.labels?.alertname).filter(Boolean))];
   log(`alert-receiver: ${status} ${names.join(', ')||'(no alert names)'} -> ${file}`);
   send(response,200,{ok:true});
   // After answering, so a slow or failing responder never delays or fails Grafana's delivery.
   if(onAlert)setImmediate(()=>{try{Promise.resolve(onAlert(file,body)).catch(error=>log(`alert-receiver: onAlert failed: ${error?.message}`));}
    catch(error){log(`alert-receiver: onAlert failed: ${error?.message}`);}});
  });
 });
}

export function parseArgs(argv,env=process.env){
 const options={port:8001,bind:'127.0.0.1',outDir:resolve(root,'tmp/alerts'),token:env.ALERT_WEBHOOK_TOKEN||DEFAULT_TOKEN};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i],value=argv[i+1];
  const need=()=>{if(value===undefined||value.startsWith('--'))throw Error(`${arg} needs a value`);i++;return value;};
  if(arg==='--port'){const port=Number(need());if(!Number.isInteger(port)||port<0||port>65535)throw Error('--port needs a port number');options.port=port;}
  else if(arg==='--bind')options.bind=need();
  else if(arg==='--out')options.outDir=resolve(need());
  else throw Error(`Unknown argument: ${arg}`);
 }
 if(!LOOPBACK.has(options.bind)&&options.token===DEFAULT_TOKEN)
  throw Error(`--bind ${options.bind} reaches beyond this machine: set your own ALERT_WEBHOOK_TOKEN (for Grafana too) instead of the published default`);
 return options;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const options=parseArgs(process.argv.slice(2));
  const server=createAlertReceiver({token:options.token,outDir:options.outDir});
  server.on('error',error=>{console.error(`alert-receiver: ${error.code??error.message}`);process.exit(1);});
  server.listen(options.port,options.bind,()=>console.log(`alert-receiver: listening on http://${options.bind}:${options.port}/alerts, saving to ${options.outDir}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
 }catch(error){
  console.error(`alert-receiver: ${error.message}`);process.exitCode=1;
 }
}
