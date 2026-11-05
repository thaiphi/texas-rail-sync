// E12-lite: pure model of the watched official RRC documents list (watch-list.json).
// Shared by the browser and Node: no I/O, no network, no timers, no DOM, no node: imports.
// Every function returns new objects; inputs are never mutated (structured copies are edited).
// Errors carry error.code: WATCH_ADDRESS_INVALID, WATCH_DUPLICATE (+existingId), REQUEST_INVALID,
// WATCH_LIST_INVALID.

export const WATCH_LIST_SCHEMA='rrc-watch-list-v1';
export const KINDS=Object.freeze({manual:'Manual',guidance:'Guidance',form:'Form',announcements:'Announcements'});
export const NAME_MAX=120,NOTE_MAX=2000;
export const ID_PATTERN=/^[0-9a-f]{12}$/,ADDED_VIA=Object.freeze(['seed','owner']);
export const PATH_ROOTS=Object.freeze(['watched-documents/copies/','collected-sources/']);
const EVENT_FIELDS={
 baseline:['at','sha256','path','source'],
 same:['at','sha256','source'],
 change:['id','at','previous_sha256','previous_path','previous_seen_at','sha256','path','markup_only','source','review'],
 failed:['at','reason','http_status','source'],
 damaged:['at','path','expected_sha256','actual_sha256','source'],
 note:['at','change_id','note'],stopped:['at'],rewatched:['at'],edited:['at','name','kind']
};
const RESULT_TYPES=new Set(['baseline','same','change','failed','damaged']);
const LABELS={not_checked:'Not yet checked',unchanged:'Unchanged',changed:'⚠ Changed, not reviewed',changed_markup:'Changed (markup only), not reviewed'};

const fail=(code,message,extra={})=>{throw Object.assign(Error(message),{code},extra);};
const invalid=message=>fail('REQUEST_INVALID',message);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const value=item=>item===undefined?null:item;
const pick=(source,fields)=>Object.fromEntries(fields.map(field=>[field,value(source[field])]));
const byText=(x,y)=>x<y?-1:x>y?1:0;

export function normalizeWatchAddress(input){
 const refuse=()=>fail('WATCH_ADDRESS_INVALID','Only https addresses on rrc.texas.gov (or a subdomain of it), without a username, password or port, can be watched.');
 if(typeof input!=='string'||!input.trim())refuse();
 let url;try{url=new URL(input.trim());}catch{refuse();}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||!(host==='rrc.texas.gov'||host.endsWith('.rrc.texas.gov'))||url.username||url.password||url.port)refuse();
 url.hash='';
 return url.href;
}

export async function documentId(normalizedUrl){
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalizedUrl));
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,12);
}

export const emptyWatchList=()=>({schema:WATCH_LIST_SCHEMA,documents:[]});

const checkName=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>NAME_MAX)invalid(`The name must be 1 to ${NAME_MAX} characters.`);return name.trim();};
const checkKind=kind=>{if(typeof kind!=='string'||!Object.hasOwn(KINDS,kind))invalid('The kind must be Manual, Guidance, Form or Announcements.');return kind;};
const checkNote=(note,{required})=>{if(typeof note!=='string'||note.length>NOTE_MAX||(required&&!note.trim()))invalid(`The note must be ${required?'1':'0'} to ${NOTE_MAX} characters.`);return note;};

// Status: change_state from the change events (and their reviews) or else baseline/same;
// last_result from the newest baseline/same/change/failed/damaged event; watched from doc.watched.
export function deriveStatus(doc){
 const history=doc.history??[],changes=history.filter(ev=>ev.type==='change'),unreviewed=changes.filter(ev=>!ev.review);
 let change_state='not_checked';
 if(unreviewed.length)change_state=unreviewed.some(ev=>!ev.markup_only)?'changed':'changed_markup';
 else if(changes.length)change_state='reviewed';
 else if(history.some(ev=>ev.type==='same'))change_state='unchanged';
 else if(history.some(ev=>ev.type==='baseline'))change_state='watched_since';
 const last=history.findLast(ev=>RESULT_TYPES.has(ev.type));
 const last_result=!last?null:last.type==='failed'?{at:last.at,outcome:'failed',reason:last.reason}:{at:last.at,outcome:last.type==='damaged'?'damaged':'ok'};
 return {change_state,last_result,watched:doc.watched!==false};
}
const withStatus=doc=>({...doc,status:deriveStatus(doc)});

export function statusLabel(doc,{formatDate=date=>date}={}){
 const status=deriveStatus(doc);
 if(!status.watched)return 'No longer watched';
 let label=LABELS[status.change_state];
 if(status.change_state==='watched_since')label=`Watched since ${formatDate(doc.history.find(ev=>ev.type==='baseline').at)}`;
 if(status.change_state==='reviewed')label=`Reviewed ${formatDate(doc.history.findLast(ev=>ev.type==='change').review.at)}`;
 const result=status.last_result;
 if(result?.outcome==='failed')label+=` · last check failed (${result.reason})`;
 if(result?.outcome==='damaged')label+=' · saved copy damaged';
 return label;
}

export function addDocument(list,{url,name,kind}={},{now,id,via='owner'}={}){
 const normalized=normalizeWatchAddress(url),cleanName=checkName(name);checkKind(kind);
 const existing=list.documents.find(doc=>doc.url===normalized);
 if(existing)fail('WATCH_DUPLICATE',`This address is already on the list as "${existing.name}".`,{existingId:existing.id});
 if(typeof id!=='string'||!ID_PATTERN.test(id))invalid('A document id must be 12 lower-case hex characters.');
 if(!ADDED_VIA.includes(via))invalid('A document is added by the seed or the owner.');
 if(typeof now!=='string'||!now)invalid('The time a document is added is required.');
 if(list.documents.some(doc=>doc.id===id))fail('WATCH_DUPLICATE','This document id is already on the list.',{existingId:id});
 const doc=withStatus({id,url:normalized,name:cleanName,kind,watched:true,added_at:now,added_via:via,latest:null,history:[]});
 return {...structuredClone(list),documents:[...structuredClone(list.documents),doc]};
}

function updateDocument(list,id,change){
 const copy=structuredClone(list),index=copy.documents.findIndex(doc=>doc.id===id);
 if(index<0)invalid('No document on the list has this id.');
 copy.documents[index]=withStatus(change(copy.documents[index]));
 return copy;
}
export const stopWatching=(list,id,{now}={})=>updateDocument(list,id,doc=>{
 if(doc.watched===false)invalid('This document is already not watched.');
 return {...doc,watched:false,history:[...doc.history,{type:'stopped',at:now}]};
});
export const rewatch=(list,id,{now}={})=>updateDocument(list,id,doc=>{
 if(doc.watched!==false)invalid('This document is already watched.');
 return {...doc,watched:true,history:[...doc.history,{type:'rewatched',at:now}]};
});
// The address is never editable: stop watching it and add the new one instead.
export const editDocument=(list,id,{name,kind}={},{now}={})=>updateDocument(list,id,doc=>{
 const next={name:name===undefined?doc.name:checkName(name),kind:kind===undefined?doc.kind:checkKind(kind)};
 return {...doc,...next,history:[...doc.history,{type:'edited',at:now,...next}]};
});

// outcome: {type:'baseline'|'same'|'change'|'failed'|'damaged', ...event fields, latest?} or {type:'repair', latest}.
// baseline and change carry the new latest copy; previous_sha256/previous_path come from doc.latest;
// a change id is minted as `<doc id>-c<n>` when the caller gives none; review always starts null.
export function applyOutcome(doc,outcome){
 const copy=structuredClone(doc),type=outcome?.type,newLatest=outcome?.latest;
 const checkLatest=()=>{if(!isObject(newLatest)||!isStoredPath(newLatest.path))invalid('A new copy needs its latest record, stored under watched-documents/copies/ or collected-sources/.');};
 if(type==='repair'){checkLatest();return withStatus({...copy,latest:structuredClone(newLatest)});}
 if(!RESULT_TYPES.has(type))invalid('Unknown check outcome.');
 if(type==='baseline'&&copy.latest)invalid('This document already has a first copy.');
 if((type==='same'||type==='change'||type==='damaged')&&!copy.latest)invalid('This document has no saved copy yet.');
 if(type==='baseline'||type==='change')checkLatest();
 if((type==='baseline'||type==='change'||type==='damaged')&&!isStoredPath(outcome.path))invalid('A copy path must be stored under watched-documents/copies/ or collected-sources/.');
 if(type==='failed'&&(typeof outcome.reason!=='string'||!outcome.reason))invalid('A failed check needs a reason.');
 let event={type,...pick(structuredClone(outcome),EVENT_FIELDS[type])};
 if(type==='change'){
  const count=copy.history.filter(ev=>ev.type==='change').length;
  event={...event,id:event.id??`${copy.id}-c${count+1}`,previous_sha256:copy.latest.sha256,previous_path:copy.latest.path,markup_only:event.markup_only===true,review:null};
 }
 return withStatus({...copy,latest:type==='baseline'||type==='change'?structuredClone(newLatest):copy.latest,history:[...copy.history,event]});
}

// One review covers every unreviewed change up to the newest; reviews are never edited.
export function markReviewed(doc,{note='',now}={}){
 checkNote(note,{required:false});
 const copy=structuredClone(doc);
 if(!copy.history.some(ev=>ev.type==='change'&&!ev.review))invalid('There is no unreviewed change to mark.');
 copy.history=copy.history.map(ev=>ev.type==='change'&&!ev.review?{...ev,review:{at:now,note}}:ev);
 return withStatus(copy);
}
export function addNote(doc,{changeId,note,now}={}){
 checkNote(note,{required:true});
 const copy=structuredClone(doc);
 if(!copy.history.some(ev=>ev.type==='change'&&ev.id===changeId))invalid('No change on this document has this id.');
 return withStatus({...copy,history:[...copy.history,{type:'note',at:now,change_id:changeId,note}]});
}

// Attention order: changed (not reviewed), saved copy damaged, check failed, the rest; by name; unwatched last.
export function sortRows(docs){
 const rank=doc=>{const status=deriveStatus(doc);if(!status.watched)return 4;if(status.change_state==='changed'||status.change_state==='changed_markup')return 0;if(status.last_result?.outcome==='damaged')return 1;if(status.last_result?.outcome==='failed')return 2;return 3;};
 return structuredClone(docs).map(doc=>({doc,rank:rank(doc),name:String(doc.name).toLowerCase()})).sort((x,y)=>x.rank-y.rank||byText(x.name,y.name)||byText(String(x.doc.id),String(y.doc.id))).map(item=>item.doc);
}

// Stored paths: repo-relative, forward slashes, under one of PATH_ROOTS, no empty, '.' or '..' segment.
export const isStoredPath=path=>typeof path==='string'&&!path.includes('\\')&&PATH_ROOTS.some(root=>path.startsWith(root))&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
const PATH_FIELDS={baseline:['path'],change:['path','previous_path'],damaged:['path']};

export function validateWatchList(input){
 const refuse=detail=>fail('WATCH_LIST_INVALID',`The watch list file can't be read: ${detail}.`);
 if(!isObject(input))refuse('it is not an object');
 if(input.schema!==WATCH_LIST_SCHEMA)refuse(`unknown schema ${JSON.stringify(input.schema??null)}`);
 if(!Array.isArray(input.documents))refuse('documents is not a list');
 const copy=structuredClone(input),ids=new Set(),urls=new Set();
 copy.documents=copy.documents.map((doc,index)=>{
  const where=`document ${index+1}`;
  if(!isObject(doc))refuse(`${where} is not an object`);
  if(typeof doc.id!=='string'||!ID_PATTERN.test(doc.id))refuse(`${where} has a bad id`);
  let url=null;try{url=normalizeWatchAddress(doc.url);}catch{}
  if(url===null||url!==doc.url)refuse(`${where} has an address outside the watch rule`);
  if(ids.has(doc.id)||urls.has(doc.url))refuse(`${where} repeats an id or address`);
  ids.add(doc.id);urls.add(doc.url);
  try{if(checkName(doc.name)!==doc.name)throw Error();checkKind(doc.kind);}catch{refuse(`${where} has a bad name or kind`);}
  if(typeof doc.watched!=='boolean')refuse(`${where} has a bad watched flag`);
  if(doc.latest!==null&&!(isObject(doc.latest)&&isStoredPath(doc.latest.path)))refuse(`${where} has a bad latest copy`);
  if(!Array.isArray(doc.history))refuse(`${where} has no history list`);
  for(const ev of doc.history){
   if(!isObject(ev)||!Object.hasOwn(EVENT_FIELDS,ev.type))refuse(`${where} has an unknown history entry`);
   for(const field of PATH_FIELDS[ev.type]??[])if(!isStoredPath(ev[field]))refuse(`${where} has a path outside the allowed folders`);
  }
  return withStatus(doc);
 });
 return copy;
}
