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

// The collections the committed watched-documents/watch-list.json was seeded from (2026-10-10..2026-10-30).
// Tests pass these as runIds so a later local collection (a new collected-sources/<uuid>/ folder) does not
// change the seeded list they compare against.
export const SEED_RUN_IDS=Object.freeze([
 '70983258-9751-4e79-bb78-1a1cb7068e14',
 '7aecd619-c19b-48ad-b354-832f5cc0cca0',
 '903b89ff-452c-422c-87cf-ae3e4260b733',
 'a8606089-cd03-4c22-9161-11dd443331a8',
 'b477a317-a6bb-4ab9-b059-ac2e5d61b12d',
 'b7628a71-03fe-4a16-928c-033353e1fce0',
 'b911ce3c-2d6d-430e-bee0-8b3cb8cc7465',
 'd04894d1-5c27-4392-b3f7-42a399c7fbe1',
 'df804201-eb4a-4aa5-8ef2-c550c6a70627',
 'edce4598-1396-49f0-9829-96271fa93249',
 'fbee3ba0-9d68-4572-9331-7a545cbbade7',
]);

const fail=message=>{throw Object.assign(Error(message),{code:'WATCH_SEED_INVALID'});};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const byText=(x,y)=>x<y?-1:x>y?1:0;
const exists=async path=>{try{await access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};

// The collection folders to read: every folder under collected-sources/, or only runIds when given.
async function runFolders(repoRoot,runIds){
 const base=resolve(repoRoot,'collected-sources');
 const all=(await readdir(base,{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
 if(runIds===undefined)return all;
 if(!Array.isArray(runIds)||!runIds.length||runIds.some(run=>typeof run!=='string'||!run))fail('runIds must be a non-empty list of collection folder names');
 for(const run of runIds)if(!all.includes(run))fail(`collected-sources/${run} is not a collection folder`);
 return [...new Set(runIds)];
}

// Every non-fixture copy of one document in the given runs, verified against its sidecar, oldest first (ties by run id).
async function collectCopies(repoRoot,file,runs){
 const base=resolve(repoRoot,'collected-sources'),copies=[];
 for(const run of runs){
  const sidecar=resolve(base,run,`${file}.source.json`);
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

// runIds (optional): only these collected-sources/ folders are read; without it, every folder is.
export async function buildSeedList({repoRoot,now,runIds}={}){
 if(typeof now!=='string'||!now)fail('the seed needs the current time');
 const runs=await runFolders(repoRoot,runIds);
 let list=emptyWatchList();
 for(const seed of SEED_DOCUMENTS){
  const copies=await collectCopies(repoRoot,seed.file,runs),url=copies[0].meta.url;
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

// Owner history the seed cannot rebuild: a row the owner added, a review or note, or any history event that
// did not come from a collected copy (a check outcome, stop, rewatch, edit). Returns a plain reason naming
// the first one found, or null when the list holds only seed history and may be replaced.
export function ownerHistory(list){
 for(const doc of list?.documents??[]){
  const name=`"${doc.name}"`;
  if(doc.added_via!=='seed')return `${name} was added by the owner`;
  for(const ev of doc.history??[]){
   if(ev.type==='note')return `${name} has a note`;
   if(ev.review)return `${name} has a review`;
   if(ev.source?.type!=='collection')return `${name} has a ${ev.source?.type==='check'?'check result':`${ev.type} event`}`;
  }
 }
 return null;
}
