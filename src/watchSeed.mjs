// E12-lite (§3.1): one-off history seed for watched-documents/watch-list.json from the copies already
// committed under collected-sources/. No network; seeded copies are referenced where they sit, never copied
// or modified. Every timestamp comes from the sidecars, so the result does not depend on the clock.
// Errors carry error.code WATCH_SEED_INVALID.
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {emptyWatchList,addDocument,applyOutcome,documentId,normalizeWatchAddress,validateWatchList} from '../public/watch-list.js';
import {htmlToText} from '../public/html-text.js';

// Spec §3.1, in table order. `file` is the collected-sources basename.
export const SEED_DOCUMENTS=Object.freeze([
 {file:'uic-manual',name:'UIC manual (UIA010)',kind:'manual'},
 {file:'rrc-resources',name:'Injection-Storage Resources',kind:'announcements'},
 {file:'uic-query-help',name:'UIC query help',kind:'guidance'},
 {file:'srt-guidelines',name:'Step-rate test guidelines',kind:'guidance'},
 {file:'bhp-permian-nto',name:'BHP monitoring NTO (Permian)',kind:'guidance'},
 {file:'wellbore-wba091',name:'Wellbore database manual (WBA091)',kind:'manual'},
 {file:'form-w2',name:'Form W-2',kind:'form'},
 {file:'form-w3',name:'Form W-3',kind:'form'},
].map(Object.freeze));

const fail=message=>{throw Object.assign(Error(message),{code:'WATCH_SEED_INVALID'});};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const byText=(x,y)=>x<y?-1:x>y?1:0;
const exists=async path=>{try{await access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};

// Every non-fixture copy of one document, verified against its sidecar, oldest first (ties by run id).
async function collectCopies(repoRoot,file){
 const base=resolve(repoRoot,'collected-sources'),copies=[];
 for(const entry of await readdir(base,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const run=entry.name,sidecar=resolve(base,run,`${file}.source.json`);
  let meta;
  try{meta=JSON.parse(await readFile(sidecar,'utf8'));}
  catch(error){if(error.code==='ENOENT')continue;fail(`collected-sources/${run}/${file}.source.json can't be read`);}
  if(meta.testFixture!==false)continue;
  const found=[];
  for(const extension of ['pdf','html'])if(await exists(resolve(base,run,`${file}.${extension}`)))found.push(extension);
  if(found.length!==1)fail(`collected-sources/${run}/${file} needs exactly one .pdf or .html copy beside its sidecar`);
  const path=`collected-sources/${run}/${file}.${found[0]}`,bytes=await readFile(resolve(repoRoot,...path.split('/')));
  if(sha256(bytes)!==meta.sha256||bytes.length!==meta.bytes)fail(`${path} does not match the sha256 and size in its sidecar`);
  if(typeof meta.retrieved_at!=='string'||!meta.retrieved_at)fail(`${path} has no retrieved_at`);
  copies.push({run,path,extension:found[0],bytes,meta});
 }
 if(!copies.length)fail(`no committed copy of ${file} was found`);
 const urls=new Set(copies.map(copy=>copy.meta.url));
 if(urls.size!==1)fail(`the ${file} sidecars disagree on the address`);
 const url=[...urls][0];
 let normalized=null;try{normalized=normalizeWatchAddress(url);}catch{}
 if(normalized!==url)fail(`the ${file} address is outside the watch rule`);
 return copies.sort((x,y)=>byText(x.meta.retrieved_at,y.meta.retrieved_at)||byText(x.run,y.run));
}

const latestOf=copy=>({sha256:copy.meta.sha256,bytes:copy.meta.bytes,path:copy.path,retrieved_at:copy.meta.retrieved_at,
 last_modified:copy.meta.last_modified??null,etag:copy.meta.etag??null,source:{type:'collection',run_id:copy.run}});

export async function buildSeedList({repoRoot,now}={}){
 if(typeof now!=='string'||!now)fail('the seed needs the current time');
 let list=emptyWatchList();
 for(const seed of SEED_DOCUMENTS){
  const copies=await collectCopies(repoRoot,seed.file),url=copies[0].meta.url;
  list=addDocument(list,{url,name:seed.name,kind:seed.kind},{now:copies[0].meta.retrieved_at,id:await documentId(url),via:'seed'});
  let doc=list.documents.at(-1),previous=null;
  for(const copy of copies){
   const at=copy.meta.retrieved_at,source={type:'collection',run_id:copy.run},latest=latestOf(copy);
   if(!previous)doc=applyOutcome(doc,{type:'baseline',at,sha256:copy.meta.sha256,path:copy.path,source,latest});
   else if(previous.meta.sha256===copy.meta.sha256)doc=applyOutcome(doc,{type:'same',at,sha256:copy.meta.sha256,source});
   else{
    const markup_only=previous.extension==='html'&&copy.extension==='html'&&
     JSON.stringify(htmlToText(previous.bytes.toString('utf8')))===JSON.stringify(htmlToText(copy.bytes.toString('utf8')));
    // previous is the last observation of the old hash, since an equal hash only ever advances it.
    doc=applyOutcome(doc,{type:'change',at,previous_seen_at:previous.meta.retrieved_at,sha256:copy.meta.sha256,path:copy.path,markup_only,source,latest});
   }
   previous=copy;
  }
  list={...list,documents:[...list.documents.slice(0,-1),doc]};
 }
 return validateWatchList(list);
}
