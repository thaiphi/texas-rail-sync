// E12-lite (§4): Check now. checkWatchedDocuments is the one function the owner's Check now runs and a
// future scheduler would call unchanged; nothing here starts a timer, retry loop or startup hook.
// Each watched address is re-checked against the address rule, then fetched once, sequentially, through
// fetchSource with appToken:null. Failures keep the last good copy and the change state; a damaged or
// missing latest copy is reported and the fetch is compared against the recorded hash. The list is saved
// once at the end, then the check record is written once.
import {randomUUID} from 'node:crypto';
import {fetchSource} from './sourceFetch.mjs';
import {readWatchList,writeWatchList,saveCopy,readVerifiedCopy,writeCheckRecord} from './watchStore.mjs';
import {normalizeWatchAddress,applyOutcome} from '../public/watch-list.js';
import {htmlToText} from '../public/html-text.js';

export const WATCH_CHECK_SCHEMA='rrc-watch-check-v1';
const BROKEN_COPY=new Set(['WATCH_COPY_DAMAGED','WATCH_COPY_MISSING','WATCH_PATH_INVALID']);
const isPdf=bytes=>Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).subarray(0,5).toString('latin1')==='%PDF-';
// fetch failures nest: NETWORK_ERROR -> TypeError('fetch failed') -> Error('unexpected redirect').
const mentionsRedirect=error=>{for(let cause=error?.cause,depth=0;cause&&depth<5;cause=cause.cause,depth++)if(/redirect/i.test(String(cause.message??'')))return true;return false;};
// saveCopy variants are /^[a-z0-9-]{1,64}$/; a check id (UUID by default) is folded into that alphabet.
const repairVariant=checkId=>`repair-${String(checkId).toLowerCase().replace(/[^a-z0-9-]/g,'-')}`.slice(0,64);
const sameLines=(x,y)=>x.length===y.length&&x.every((line,index)=>line===y[index]);

// A fetch error as the plain reason the table shows (§4).
function failureReason(error,status){
 if(error?.name==='TimeoutError')return 'timeout';
 if(typeof status==='number'&&status>=300&&status<400)return 'redirect refused';
 switch(error?.code){
  case 'NETWORK_ERROR':return mentionsRedirect(error)?'redirect refused':'unreachable';
  case 'HTTP_ERROR':return `HTTP ${status}`;
  case 'SOURCE_THROTTLED':return 'HTTP 429';
  case 'SOURCE_LIMIT':return 'too large';
  case 'SOURCE_INVALID':return 'empty response';
  default:return 'unreachable';
 }
}

// One watched document, as one Check now step: the address gate, one fetch, the comparison and its
// copies. Returns the updated document and its results (a damaged copy gives a comparison and a damaged
// result). Exported so the fetch-time address gate is testable on its own; the list is not saved here.
export async function checkDocument(original,{repoRoot,fetchImpl=fetch,testFixture=false,now=()=>new Date().toISOString(),checkId}){
 if(typeof checkId!=='string'||!checkId)throw Object.assign(Error('A check id is required.'),{code:'REQUEST_INVALID'});
 const store={repoRoot},source={type:'check',check_id:checkId};
 let doc=original;
 const results=[],result=fields=>results.push({doc_id:doc.id,url:doc.url,outcome:null,http_status:null,sha256:null,bytes:null,reason:null,...fields});
 const failed=(reason,http_status=null)=>{doc=applyOutcome(doc,{type:'failed',at:now(),reason,http_status,source});result({outcome:'failed',http_status,reason});};
 let status=null,fetched=null;
 let allowed=true;
 try{normalizeWatchAddress(doc.url);}catch{allowed=false;failed('address not allowed');}
 if(allowed){
  try{fetched=await fetchSource({name:doc.id,url:doc.url},{fetchImpl,testFixture,appToken:null,onResponse:value=>{status=value;}});}
  catch(error){failed(failureReason(error,status),status);}
 }
 if(fetched&&fetched.body.length===0){failed('empty response',fetched.metadata.http_status);fetched=null;}
 if(fetched){
  const {body,metadata}=fetched,http_status=metadata.http_status,at=now();
  const ok=outcome=>result({outcome,http_status,sha256:metadata.sha256,bytes:metadata.bytes});
  const latestFor=saved=>({sha256:metadata.sha256,bytes:metadata.bytes,path:saved.path,retrieved_at:metadata.retrieved_at,last_modified:metadata.last_modified,etag:metadata.etag,source});
  const previous=doc.latest;
  if(!previous){
   const saved=await saveCopy(store,body);
   doc=applyOutcome(doc,{type:'baseline',at,sha256:metadata.sha256,path:saved.path,source,latest:latestFor(saved)});ok('baseline');
  }else{
   let oldBytes=null,broken=null;
   try{oldBytes=await readVerifiedCopy(store,previous.path,previous.sha256);}
   catch(error){if(!BROKEN_COPY.has(error?.code))throw error;broken={actual_sha256:error.actualSha256??null};}
   if(metadata.sha256===previous.sha256){
    doc=applyOutcome(doc,{type:'same',at,sha256:metadata.sha256,source});ok('same');
    // The only repair: matching fresh bytes become the latest good copy under copies/; the damaged file stays.
    // The plain name is tried first (seeded collected-sources rows, deleted copies); when the damaged file
    // itself holds copies/<sha256>.<ext>, a write-once copies/<sha256>.repair-<check id>.<ext> is saved instead.
    if(broken){
     let repaired;
     try{repaired=await saveCopy(store,body);}
     catch(error){if(error?.code!=='WATCH_COPY_CONFLICT')throw error;repaired=await saveCopy({...store,variant:repairVariant(checkId)},body);}
     doc=applyOutcome(doc,{type:'repair',latest:latestFor(repaired)});
    }
   }else{
    const saved=await saveCopy(store,body);
    const markup_only=oldBytes!==null&&!isPdf(oldBytes)&&!isPdf(body)&&sameLines(htmlToText(oldBytes.toString('utf8')),htmlToText(body.toString('utf8')));
    const previous_seen_at=doc.history.findLast(ev=>ev.sha256===previous.sha256)?.at??previous.retrieved_at??null;
    doc=applyOutcome(doc,{type:'change',at,previous_seen_at,sha256:metadata.sha256,path:saved.path,markup_only,source,latest:latestFor(saved)});ok('change');
   }
   // Appended after the comparison, so the last check result reads e.g. "Unchanged · saved copy damaged".
   if(broken){
    doc=applyOutcome(doc,{type:'damaged',at,path:previous.path,expected_sha256:previous.sha256,actual_sha256:broken.actual_sha256,source});
    result({outcome:'damaged',http_status,sha256:metadata.sha256,bytes:metadata.bytes,reason:'saved copy damaged'});
   }
  }
 }
 return {doc,results};
}

export async function checkWatchedDocuments({repoRoot,fetchImpl=fetch,testFixture=false,now=()=>new Date().toISOString(),checkId=randomUUID(),onProgress=()=>{}}={}){
 // Refuse a mis-wired injected fetch before anything is read or written (fetchSource has the same rule).
 if(fetchImpl!==fetch&&!testFixture)throw Object.assign(Error('Injected responses require fixture mode'),{code:'SOURCE_INVALID'});
 const store={repoRoot},started_at=now();
 const list=await readWatchList(store),results=[];
 const watched=list.documents.filter(doc=>doc.watched!==false),total=watched.length;
 let done=0;
 for(const original of watched){
  const step=await checkDocument(original,{repoRoot,fetchImpl,testFixture,now,checkId});
  list.documents[list.documents.indexOf(original)]=step.doc;results.push(...step.results);
  onProgress({done:++done,total});
 }
 await writeWatchList(store,list);
 const saved=await readWatchList(store);
 const record={schema:WATCH_CHECK_SCHEMA,check_id:checkId,started_at,ended_at:now(),trigger:'owner',testFixture,results};
 await writeCheckRecord(store,record);
 return {record,list:saved};
}
