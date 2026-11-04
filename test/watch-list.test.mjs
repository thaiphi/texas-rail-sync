import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WATCH_LIST_SCHEMA,KINDS,normalizeWatchAddress,documentId,emptyWatchList,addDocument,stopWatching,rewatch,editDocument,
 applyOutcome,markReviewed,addNote,deriveStatus,statusLabel,sortRows,validateWatchList} from '../public/watch-list.js';

const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;};
const fmt={formatDate:d=>d.slice(0,10)};
const URL_A='https://www.rrc.texas.gov/media/a.pdf',URL_B='https://www.rrc.texas.gov/b/';
const src={type:'check',check_id:'chk-1'};
const latest=(sha,path=`watched-documents/copies/${sha}.pdf`,at='2026-10-10T00:00:00Z')=>({sha256:sha,bytes:10,path,retrieved_at:at,last_modified:null,etag:null,source:src});
const baseList=()=>addDocument(emptyWatchList(),{url:URL_A,name:'Doc A',kind:'manual'},{now:'2026-11-01T00:00:00Z',id:'aaaaaaaaaaaa'});
const newDoc=()=>baseList().documents[0];
const baseline=(doc,sha='a'.repeat(64),at='2026-10-10T00:00:00Z')=>applyOutcome(doc,{type:'baseline',at,sha256:sha,path:`watched-documents/copies/${sha}.pdf`,source:src,latest:latest(sha,undefined,at)});
const same=(doc,at='2026-10-20T00:00:00Z')=>applyOutcome(doc,{type:'same',at,sha256:doc.latest.sha256,source:src});
const change=(doc,sha='b'.repeat(64),extra={})=>applyOutcome(doc,{type:'change',id:extra.id,at:extra.at??'2026-10-29T00:00:00Z',previous_seen_at:'2026-10-20T00:00:00Z',sha256:sha,path:`watched-documents/copies/${sha}.pdf`,markup_only:extra.markup_only??false,source:src,latest:latest(sha,undefined,extra.at??'2026-10-29T00:00:00Z')});
const failed=(doc,reason='HTTP 404',at='2026-11-02T00:00:00Z')=>applyOutcome(doc,{type:'failed',at,reason,http_status:404,source:src});
const damaged=(doc,at='2026-11-02T00:00:00Z')=>applyOutcome(doc,{type:'damaged',at,path:doc.latest.path,expected_sha256:doc.latest.sha256,actual_sha256:'f'.repeat(64),source:src});

test('schema constant and kinds', ()=>{
  assert.equal(WATCH_LIST_SCHEMA,'rrc-watch-list-v1');
  assert.deepEqual({...KINDS},{manual:'Manual',guidance:'Guidance',form:'Form',announcements:'Announcements'});
  assert.ok(Object.isFrozen(KINDS));
  assert.deepEqual(emptyWatchList(),{schema:'rrc-watch-list-v1',documents:[]});
});

test('address rule accepts only https rrc.texas.gov hosts', ()=>{
  assert.equal(normalizeWatchAddress('https://WWW.rrc.texas.gov/a/#x'), 'https://www.rrc.texas.gov/a/');
  assert.equal(normalizeWatchAddress('https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html'), 'https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html');
  assert.equal(normalizeWatchAddress('https://rrc.texas.gov/'), 'https://rrc.texas.gov/');
  for (const bad of ['http://www.rrc.texas.gov/','https://rrc.texas.gov.evil.example/','https://evilrrc.texas.gov/',
    'https://u:p@www.rrc.texas.gov/','https://www.rrc.texas.gov:8443/','ftp://www.rrc.texas.gov/','not a url','',null,42])
    assert.throws(()=>normalizeWatchAddress(bad), err=>err.code==='WATCH_ADDRESS_INVALID'&&typeof err.message==='string'&&err.message.length>0, String(bad));
});

test('documentId is the first 12 hex of sha256 of the normalized address', async ()=>{
  const url=normalizeWatchAddress(URL_A);
  assert.equal(await documentId(url), createHash('sha256').update(url).digest('hex').slice(0,12));
  assert.match(await documentId(url), /^[0-9a-f]{12}$/);
});

test('addDocument builds a not-yet-checked row', ()=>{
  const list=addDocument(emptyWatchList(),{url:'https://WWW.rrc.texas.gov/media/a.pdf#p=3',name:'  Doc A ',kind:'manual'},{now:'2026-11-01T00:00:00Z',id:'aaaaaaaaaaaa'});
  const doc=list.documents[0];
  assert.deepEqual(doc,{id:'aaaaaaaaaaaa',url:URL_A,name:'Doc A',kind:'manual',watched:true,added_at:'2026-11-01T00:00:00Z',added_via:'owner',latest:null,history:[],status:{change_state:'not_checked',last_result:null,watched:true}});
  const seeded=addDocument(emptyWatchList(),{url:URL_A,name:'A',kind:'form'},{now:'t',id:'aaaaaaaaaaaa',via:'seed'});
  assert.equal(seeded.documents[0].added_via,'seed');
  assert.equal(statusLabel(doc,fmt),'Not yet checked');
});

test('duplicate address is refused and names the existing row', ()=>{
  const list=baseList();
  assert.throws(()=>addDocument(list,{url:'https://WWW.RRC.texas.gov/media/a.pdf#frag',name:'Again',kind:'form'},{now:'t',id:'bbbbbbbbbbbb'}),
    err=>err.code==='WATCH_DUPLICATE'&&err.existingId==='aaaaaaaaaaaa');
  // a stopped row is still on the list
  const stopped={...list,documents:[stopWatching(list,'aaaaaaaaaaaa',{now:'t'}).documents[0]]};
  assert.throws(()=>addDocument(stopped,{url:URL_A,name:'Again',kind:'form'},{now:'t',id:'bbbbbbbbbbbb'}),{code:'WATCH_DUPLICATE',existingId:'aaaaaaaaaaaa'});
  const two=addDocument(list,{url:URL_B,name:'Doc B',kind:'guidance'},{now:'t',id:'bbbbbbbbbbbb'});
  assert.equal(two.documents.length,2);
});

test('name 1-120 chars and a known kind are required', ()=>{
  const list=emptyWatchList();
  for (const input of [{name:'',kind:'manual'},{name:'   ',kind:'manual'},{name:'x'.repeat(121),kind:'manual'},{name:'ok',kind:'memo'},{name:42,kind:'manual'},{name:'ok'}])
    assert.throws(()=>addDocument(list,{url:URL_A,...input},{now:'t',id:'aaaaaaaaaaaa'}),{code:'REQUEST_INVALID'},JSON.stringify(input));
  assert.equal(addDocument(list,{url:URL_A,name:'x'.repeat(120),kind:'announcements'},{now:'t',id:'aaaaaaaaaaaa'}).documents[0].name.length,120);
  assert.throws(()=>addDocument(list,{url:'http://www.rrc.texas.gov/',name:'ok',kind:'manual'},{now:'t',id:'aaaaaaaaaaaa'}),{code:'WATCH_ADDRESS_INVALID'});
});

test('status follows history', ()=>{
  let doc=newDoc();
  assert.equal(deriveStatus(doc).change_state,'not_checked');
  doc=baseline(doc);
  assert.deepEqual(doc.status,{change_state:'watched_since',last_result:{at:'2026-10-10T00:00:00Z',outcome:'ok'},watched:true});
  assert.equal(statusLabel(doc,fmt),'Watched since 2026-10-10');
  assert.equal(doc.latest.sha256,'a'.repeat(64));
  const unchanged=same(doc);
  assert.equal(unchanged.status.change_state,'unchanged');
  assert.equal(statusLabel(unchanged,fmt),'Unchanged');
  let changed=change(unchanged);
  assert.equal(changed.status.change_state,'changed');
  assert.equal(statusLabel(changed,fmt),'⚠ Changed, not reviewed');
  assert.equal(changed.latest.sha256,'b'.repeat(64));
  const ev=changed.history.at(-1);
  assert.equal(ev.previous_sha256,'a'.repeat(64));
  assert.equal(ev.previous_path,`watched-documents/copies/${'a'.repeat(64)}.pdf`);
  assert.equal(ev.previous_seen_at,'2026-10-20T00:00:00Z');
  assert.equal(ev.review,null);
  assert.equal(typeof ev.id,'string');
  const markup=change(unchanged,'c'.repeat(64),{markup_only:true});
  assert.equal(markup.status.change_state,'changed_markup');
  assert.equal(statusLabel(markup,fmt),'Changed (markup only), not reviewed');
  // a same after an unreviewed change keeps it changed
  assert.equal(same(changed,'2026-10-30T00:00:00Z').status.change_state,'changed');
  const reviewed=markReviewed(changed,{now:'2026-10-31T09:00:00Z'});
  assert.equal(reviewed.status.change_state,'reviewed');
  assert.equal(statusLabel(reviewed,fmt),'Reviewed 2026-10-31');
  assert.equal(same(reviewed,'2026-11-01T00:00:00Z').status.change_state,'reviewed');
  const again=change(reviewed,'d'.repeat(64),{at:'2026-11-02T00:00:00Z'});
  assert.equal(again.status.change_state,'changed');
  // an unreviewed full change outranks a later markup-only one
  assert.equal(change(changed,'e'.repeat(64),{markup_only:true}).status.change_state,'changed');
});

test('applyOutcome refuses outcomes that do not fit the row', ()=>{
  const doc=baseline(newDoc());
  assert.throws(()=>baseline(doc),{code:'REQUEST_INVALID'});
  assert.throws(()=>applyOutcome(newDoc(),{type:'same',at:'t',sha256:'a',source:src}),{code:'REQUEST_INVALID'});
  assert.throws(()=>change(newDoc()),{code:'REQUEST_INVALID'});
  assert.throws(()=>applyOutcome(doc,{type:'mystery',at:'t'}),{code:'REQUEST_INVALID'});
  assert.throws(()=>applyOutcome(doc,{type:'change',at:'t',sha256:'b',path:'p',source:src}),{code:'REQUEST_INVALID'}); // no latest
});

test('change ids are minted when absent and kept when supplied', ()=>{
  const one=change(baseline(newDoc()));
  assert.equal(one.history.at(-1).id,'aaaaaaaaaaaa-c1');
  const two=change(one,'c'.repeat(64));
  assert.equal(two.history.at(-1).id,'aaaaaaaaaaaa-c2');
  assert.equal(change(baseline(newDoc()),'b'.repeat(64),{id:'chg-x'}).history.at(-1).id,'chg-x');
});

test('a failure never replaces the change state', ()=>{
  const doc=failed(change(baseline(newDoc())));
  assert.equal(doc.status.change_state,'changed');
  assert.deepEqual(doc.status.last_result,{at:'2026-11-02T00:00:00Z',outcome:'failed',reason:'HTTP 404'});
  assert.equal(doc.history.at(-1).http_status,404);
  assert.equal(statusLabel(doc,fmt),'⚠ Changed, not reviewed · last check failed (HTTP 404)');
  assert.equal(doc.latest.sha256,'b'.repeat(64));
  const notChecked=failed(newDoc(),'unreachable');
  assert.equal(notChecked.status.change_state,'not_checked');
  assert.equal(statusLabel(notChecked,fmt),'Not yet checked · last check failed (unreachable)');
});

test('damaged copy is a last result, and repair re-points latest', ()=>{
  const doc=damaged(same(baseline(newDoc())));
  assert.equal(doc.status.change_state,'unchanged');
  assert.equal(doc.status.last_result.outcome,'damaged');
  assert.equal(statusLabel(doc,fmt),'Unchanged · saved copy damaged');
  // the model reports the last result-bearing event: a same appended after damaged reads ok
  assert.equal(same(doc,'2026-11-03T00:00:00Z').status.last_result.outcome,'ok');
  const fresh=latest('a'.repeat(64),`watched-documents/copies/${'a'.repeat(64)}.pdf`,'2026-11-02T00:00:00Z');
  const repaired=applyOutcome(doc,{type:'repair',latest:{...fresh,source:{type:'check',check_id:'chk-2'}}});
  assert.equal(repaired.latest.source.check_id,'chk-2');
  assert.equal(repaired.history.length,doc.history.length);
  assert.throws(()=>applyOutcome(doc,{type:'repair'}),{code:'REQUEST_INVALID'});
});

test('markReviewed covers every unreviewed change up to the newest with the same review', ()=>{
  const doc=change(change(baseline(newDoc())),'c'.repeat(64),{at:'2026-10-30T00:00:00Z'});
  const reviewed=markReviewed(doc,{note:'checked p.12',now:'2026-10-31T00:00:00Z'});
  const changes=reviewed.history.filter(ev=>ev.type==='change');
  assert.equal(changes.length,2);
  for (const ev of changes) assert.deepEqual(ev.review,{at:'2026-10-31T00:00:00Z',note:'checked p.12'});
  // a later review leaves earlier reviews untouched
  const later=markReviewed(change(reviewed,'d'.repeat(64)),{now:'2026-11-02T00:00:00Z'});
  const reviews=later.history.filter(ev=>ev.type==='change').map(ev=>ev.review);
  assert.deepEqual(reviews,[{at:'2026-10-31T00:00:00Z',note:'checked p.12'},{at:'2026-10-31T00:00:00Z',note:'checked p.12'},{at:'2026-11-02T00:00:00Z',note:''}]);
  assert.throws(()=>markReviewed(reviewed,{now:'t'}),{code:'REQUEST_INVALID'});
  assert.throws(()=>markReviewed(doc,{note:'x'.repeat(2001),now:'t'}),{code:'REQUEST_INVALID'});
  assert.equal(markReviewed(doc,{note:'x'.repeat(2000),now:'t'}).history.at(-1).review.note.length,2000);
});

test('addNote appends a note event and never edits a review', ()=>{
  const reviewed=markReviewed(change(baseline(newDoc())),{note:'first',now:'2026-10-31T00:00:00Z'});
  const changeId=reviewed.history.find(ev=>ev.type==='change').id;
  const noted=addNote(reviewed,{changeId,note:'printed date 2026-09',now:'2026-11-01T00:00:00Z'});
  assert.deepEqual(noted.history.at(-1),{type:'note',at:'2026-11-01T00:00:00Z',change_id:changeId,note:'printed date 2026-09'});
  assert.deepEqual(noted.history.find(ev=>ev.type==='change').review,{at:'2026-10-31T00:00:00Z',note:'first'});
  assert.equal(noted.status.change_state,'reviewed');
  assert.throws(()=>addNote(reviewed,{changeId:'nope',note:'x',now:'t'}),{code:'REQUEST_INVALID'});
  assert.throws(()=>addNote(reviewed,{changeId,note:'',now:'t'}),{code:'REQUEST_INVALID'});
  assert.throws(()=>addNote(reviewed,{changeId,note:'x'.repeat(2001),now:'t'}),{code:'REQUEST_INVALID'});
});

test('stopWatching keeps history; rewatch restores; edit changes name/kind only', ()=>{
  const list={...baseList()};
  list.documents=[baseline(list.documents[0])];
  const stopped=stopWatching(list,'aaaaaaaaaaaa',{now:'2026-11-02T00:00:00Z'});
  const doc=stopped.documents[0];
  assert.equal(doc.watched,false);
  assert.deepEqual(doc.history.at(-1),{type:'stopped',at:'2026-11-02T00:00:00Z'});
  assert.equal(doc.history.length,2);
  assert.equal(doc.latest.sha256,'a'.repeat(64));
  assert.equal(doc.status.watched,false);
  assert.equal(doc.status.change_state,'watched_since');
  assert.equal(statusLabel(doc,fmt),'No longer watched');
  assert.throws(()=>stopWatching(stopped,'aaaaaaaaaaaa',{now:'t'}),{code:'REQUEST_INVALID'});
  const back=rewatch(stopped,'aaaaaaaaaaaa',{now:'2026-11-03T00:00:00Z'}).documents[0];
  assert.equal(back.watched,true);
  assert.deepEqual(back.history.at(-1),{type:'rewatched',at:'2026-11-03T00:00:00Z'});
  assert.equal(statusLabel(back,fmt),'Watched since 2026-10-10');
  assert.throws(()=>rewatch(list,'aaaaaaaaaaaa',{now:'t'}),{code:'REQUEST_INVALID'});
  const edited=editDocument(list,'aaaaaaaaaaaa',{name:'New name',kind:'form',url:'https://www.rrc.texas.gov/other.pdf'},{now:'2026-11-03T00:00:00Z'}).documents[0];
  assert.equal(edited.name,'New name');assert.equal(edited.kind,'form');assert.equal(edited.url,URL_A);
  assert.deepEqual(edited.history.at(-1),{type:'edited',at:'2026-11-03T00:00:00Z',name:'New name',kind:'form'});
  const nameOnly=editDocument(list,'aaaaaaaaaaaa',{name:'Only name'},{now:'t'}).documents[0];
  assert.equal(nameOnly.kind,'manual');
  assert.throws(()=>editDocument(list,'aaaaaaaaaaaa',{kind:'memo'},{now:'t'}),{code:'REQUEST_INVALID'});
  assert.throws(()=>editDocument(list,'aaaaaaaaaaaa',{name:''},{now:'t'}),{code:'REQUEST_INVALID'});
  for (const fn of [stopWatching,rewatch]) assert.throws(()=>fn(list,'zzzzzzzzzzzz',{now:'t'}),{code:'REQUEST_INVALID'});
  assert.throws(()=>editDocument(list,'zzzzzzzzzzzz',{name:'x'},{now:'t'}),{code:'REQUEST_INVALID'});
});

test('sortRows: changed-not-reviewed, then damaged, then failed, then by name; unwatched last', ()=>{
  const make=(id,name,fn)=>{const doc={...newDoc(),id,name,url:`https://www.rrc.texas.gov/${id}`};return fn?fn(doc):doc;};
  const docs=[
    make('000000000001','Zeta'),
    make('000000000002','Alpha unwatched',doc=>({...doc,watched:false,history:[{type:'stopped',at:'t'}]})),
    make('000000000003','Mid failed',doc=>failed(baseline(doc))),
    make('000000000004','Yak damaged',doc=>damaged(baseline(doc))),
    make('000000000005','Xray changed',doc=>change(baseline(doc))),
    make('000000000006','Beta'),
    make('000000000007','Wolf markup',doc=>change(baseline(doc),'c'.repeat(64),{markup_only:true})),
    make('000000000008','Able reviewed',doc=>markReviewed(change(baseline(doc)),{now:'t'})),
  ];
  assert.deepEqual(sortRows(docs).map(doc=>doc.name),['Wolf markup','Xray changed','Yak damaged','Mid failed','Able reviewed','Beta','Zeta','Alpha unwatched']);
  assert.notEqual(sortRows(docs),docs);
});

test('validateWatchList refuses unknown schema, bad paths and rule-breaking addresses', ()=>{
  const good={...baseList()};
  good.documents=[change(baseline(good.documents[0]))];
  const valid=validateWatchList(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(valid,good);
  // stale stored status is recomputed, not refused
  const stale=structuredClone(good);stale.documents[0].status={change_state:'unchanged',last_result:null,watched:true};
  assert.equal(validateWatchList(stale).documents[0].status.change_state,'changed');
  // seeded paths under collected-sources/ are allowed
  const seeded=structuredClone(good);seeded.documents[0].history[0].path='collected-sources/run-1/a.pdf';
  assert.equal(validateWatchList(seeded).documents[0].history[0].path,'collected-sources/run-1/a.pdf');
  const breakers=[
    v=>{v.schema='rrc-watch-list-v2';},
    v=>{delete v.schema;},
    v=>{v.documents='x';},
    v=>{v.documents[0].latest.path='artifacts/x.pdf';},
    v=>{v.documents[0].latest.path='watched-documents/copies/../x';},
    v=>{v.documents[0].latest.path='watched-documents\\copies\\x.pdf';},
    v=>{v.documents[0].history[0].path='watched-documents/copies/a\\b.pdf';},
    v=>{v.documents[0].history[1].previous_path='/etc/passwd';},
    v=>{v.documents[0].history[1].path='collected-sources//x';},
    v=>{v.documents[0].url='http://www.rrc.texas.gov/media/a.pdf';},
    v=>{v.documents[0].url='https://WWW.rrc.texas.gov/media/a.pdf';},
    v=>{v.documents[0].id='NOT-AN-ID';},
    v=>{v.documents[0].kind='memo';},
    v=>{v.documents[0].name='';},
    v=>{v.documents[0].watched='yes';},
    v=>{v.documents[0].history.push({type:'mystery',at:'t'});},
    v=>{v.documents[0].history='x';},
    v=>{v.documents.push(structuredClone(v.documents[0]));},
    v=>{const dup=structuredClone(v.documents[0]);dup.id='bbbbbbbbbbbb';v.documents.push(dup);},
  ];
  for (const [index,breakIt] of breakers.entries()) {
    const value=structuredClone(good);breakIt(value);
    assert.throws(()=>validateWatchList(value),err=>err.code==='WATCH_LIST_INVALID'&&typeof err.message==='string',`breaker ${index}`);
  }
  for (const value of [null,'x',[],42]) assert.throws(()=>validateWatchList(value),{code:'WATCH_LIST_INVALID'});
});

test('functions never mutate their inputs', ()=>{
  const list=deepFreeze(structuredClone(baseList()));
  const added=addDocument(list,{url:URL_B,name:'B',kind:'form'},{now:'t',id:'bbbbbbbbbbbb'});
  assert.equal(list.documents.length,1);assert.equal(added.documents.length,2);
  const doc=deepFreeze(structuredClone(list.documents[0]));
  const based=deepFreeze(baseline(doc));
  const changed=deepFreeze(change(same(based)));
  const reviewed=deepFreeze(markReviewed(changed,{note:'n',now:'t'}));
  addNote(reviewed,{changeId:reviewed.history.find(ev=>ev.type==='change').id,note:'n2',now:'t'});
  failed(changed);damaged(changed);
  applyOutcome(deepFreeze(damaged(changed)),{type:'repair',latest:latest('b'.repeat(64))});
  const withDoc=deepFreeze({...list,documents:[reviewed]});
  const stopped=deepFreeze(stopWatching(withDoc,'aaaaaaaaaaaa',{now:'t'}));
  rewatch(stopped,'aaaaaaaaaaaa',{now:'t'});
  editDocument(withDoc,'aaaaaaaaaaaa',{name:'x'},{now:'t'});
  deriveStatus(reviewed);statusLabel(reviewed,fmt);
  sortRows(deepFreeze([reviewed,changed,doc]));
  validateWatchList(withDoc);
  assert.equal(doc.history.length,0);
});
