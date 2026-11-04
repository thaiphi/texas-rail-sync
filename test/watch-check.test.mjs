// E12-lite Task 4: the Check now run (temp repo roots and injected fetch only; no real network).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkWatchedDocuments,checkDocument} from '../src/watchCheck.mjs';
import {readWatchList,writeWatchList} from '../src/watchStore.mjs';
import {emptyWatchList,addDocument,stopWatching,statusLabel,applyOutcome} from '../public/watch-list.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tempRoot=async t=>{const dir=await mkdtemp(join(tmpdir(),'trrc-watch-check-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;};
const PAGE_URL='https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/';
const PDF_URL='https://www.rrc.texas.gov/media/x/uic-manual.pdf';
const PAGE_ID='aaaaaaaaaaaa',PDF_ID='bbbbbbbbbbbb';
const HTML1=Buffer.from('<html><body><p>Rule 3.9</p><p>Rule 3.46</p></body></html>');
const HTML2=Buffer.from('<html><body><p>Rule 3.9</p><p>Rule 3.46</p><p>Rule 3.15</p></body></html>');
const HTML1_MARKUP=Buffer.from('<html>\n<body class="new"><script>var x=1;</script>\n<p>Rule 3.9</p>\n  <p>Rule 3.46</p></body></html>');
const PDF1=Buffer.from('%PDF-1.7\nfirst manual\n'),PDF2=Buffer.from('%PDF-1.7\nsecond manual\n');
const times=()=>{let n=0;return ()=>`2026-11-03T10:00:${String(n++).padStart(2,'0')}.000Z`;};

async function seedList(repoRoot,{stopPdf=false}={}){
  let list=emptyWatchList();
  list=addDocument(list,{url:PAGE_URL,name:'Injection page',kind:'guidance'},{now:'2026-11-01T00:00:00.000Z',id:PAGE_ID,via:'owner'});
  list=addDocument(list,{url:PDF_URL,name:'UIC manual',kind:'manual'},{now:'2026-11-01T00:00:00.000Z',id:PDF_ID,via:'owner'});
  if(stopPdf)list=stopWatching(list,PDF_ID,{now:'2026-11-02T00:00:00.000Z'});
  await writeWatchList({repoRoot},list);
  return list;
}
// bodies: url -> Buffer | (()=>Response); calls records every request with its init.
const fetchFrom=(bodies,calls=[])=>async(url,init)=>{
  calls.push({url,init});
  const body=bodies[url];
  if(typeof body==='function')return body();
  return new Response(body,{status:200,headers:{'last-modified':'Mon, 02 Nov 2026 00:00:00 GMT',etag:'"e1"'}});
};
const run=(repoRoot,bodies,extra={})=>checkWatchedDocuments({repoRoot,fetchImpl:fetchFrom(bodies,extra.calls),testFixture:true,now:extra.now??times(),checkId:extra.checkId??'check-1',onProgress:extra.onProgress});
const docOf=(list,id)=>list.documents.find(doc=>doc.id===id);
const copies=async repoRoot=>(await readdir(join(repoRoot,'watched-documents','copies')).catch(()=>[])).sort();
const RESULT_KEYS=['bytes','doc_id','http_status','outcome','reason','sha256','url'];

test('first check saves a baseline; second identical check writes no new copy', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const bodies={[PAGE_URL]:HTML1,[PDF_URL]:PDF1};
  const first=await run(repoRoot,bodies,{checkId:'check-1'});
  assert.equal(first.record.schema,'rrc-watch-check-v1');
  assert.equal(first.record.check_id,'check-1');assert.equal(first.record.trigger,'owner');assert.equal(first.record.testFixture,true);
  assert.ok(first.record.started_at<=first.record.ended_at);
  assert.deepEqual(first.record.results.map(r=>[r.doc_id,r.outcome]),[[PAGE_ID,'baseline'],[PDF_ID,'baseline']]);
  for(const result of first.record.results)assert.deepEqual(Object.keys(result).sort(),RESULT_KEYS);
  assert.deepEqual(first.record.results[0],{doc_id:PAGE_ID,url:PAGE_URL,outcome:'baseline',http_status:200,sha256:sha(HTML1),bytes:HTML1.length,reason:null});
  const page=docOf(first.list,PAGE_ID);
  assert.deepEqual(page.latest,{sha256:sha(HTML1),bytes:HTML1.length,path:`watched-documents/copies/${sha(HTML1)}.html`,retrieved_at:page.latest.retrieved_at,last_modified:'Mon, 02 Nov 2026 00:00:00 GMT',etag:'"e1"',source:{type:'check',check_id:'check-1'}});
  assert.equal(page.status.change_state,'watched_since');
  assert.deepEqual(page.history.at(-1),{type:'baseline',at:page.history.at(-1).at,sha256:sha(HTML1),path:page.latest.path,source:{type:'check',check_id:'check-1'}});
  assert.equal(docOf(first.list,PDF_ID).latest.path,`watched-documents/copies/${sha(PDF1)}.pdf`);
  assert.deepEqual(await readFile(join(repoRoot,page.latest.path)),HTML1);
  // The list on disk is the returned list; the check record is written once.
  assert.deepEqual(await readWatchList({repoRoot}),first.list);
  assert.deepEqual(JSON.parse(await readFile(join(repoRoot,'watched-documents/checks/check-1.json'),'utf8')),first.record);
  const before=await copies(repoRoot);
  const second=await run(repoRoot,bodies,{checkId:'check-2'});
  assert.deepEqual(second.record.results.map(r=>r.outcome),['same','same']);
  assert.deepEqual(await copies(repoRoot),before);
  const again=docOf(second.list,PAGE_ID);
  assert.deepEqual(again.latest,page.latest,'latest keeps pointing at the copy that introduced the hash');
  assert.equal(again.history.at(-1).type,'same');assert.deepEqual(again.history.at(-1).source,{type:'check',check_id:'check-2'});
  assert.equal(again.status.change_state,'unchanged');assert.equal(again.status.last_result.outcome,'ok');
});

test('changed html saves a copy and records the diffable change', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const first=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const baselineAt=docOf(first.list,PAGE_ID).history.at(-1).at;
  const second=await run(repoRoot,{[PAGE_URL]:HTML2,[PDF_URL]:PDF1},{checkId:'check-2',now:()=>'2026-11-04T00:00:00.000Z'});
  assert.deepEqual(second.record.results.map(r=>r.outcome),['change','same']);
  const page=docOf(second.list,PAGE_ID),change=page.history.at(-1);
  assert.equal(change.type,'change');
  assert.equal(change.previous_sha256,sha(HTML1));assert.equal(change.previous_path,`watched-documents/copies/${sha(HTML1)}.html`);
  assert.equal(change.previous_seen_at,baselineAt);
  assert.equal(change.sha256,sha(HTML2));assert.equal(change.path,`watched-documents/copies/${sha(HTML2)}.html`);
  assert.equal(change.markup_only,false);assert.equal(change.review,null);assert.deepEqual(change.source,{type:'check',check_id:'check-2'});
  assert.equal(page.latest.sha256,sha(HTML2));assert.equal(page.latest.path,change.path);
  assert.equal(page.status.change_state,'changed');
  assert.deepEqual(await readFile(join(repoRoot,change.path)),HTML2);
  assert.deepEqual(await readFile(join(repoRoot,change.previous_path)),HTML1);
});

test('markup-only change is flagged markup_only', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const second=await run(repoRoot,{[PAGE_URL]:HTML1_MARKUP,[PDF_URL]:PDF1},{checkId:'check-2'});
  const page=docOf(second.list,PAGE_ID);
  assert.equal(page.history.at(-1).type,'change');assert.equal(page.history.at(-1).markup_only,true);
  assert.equal(page.status.change_state,'changed_markup');
});

test('pdf change is a change with markup_only false', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const second=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF2},{checkId:'check-2'});
  const pdf=docOf(second.list,PDF_ID),change=pdf.history.at(-1);
  assert.equal(change.type,'change');assert.equal(change.markup_only,false);
  assert.equal(change.path,`watched-documents/copies/${sha(PDF2)}.pdf`);
  assert.equal(pdf.status.change_state,'changed');
});

for(const [name,respond,reason,httpStatus] of [
  ['404',()=>new Response('x',{status:404}),'HTTP 404',404],
  ['429',()=>new Response('x',{status:429}),'HTTP 429',429],
  ['empty',()=>new Response(new Uint8Array(0),{status:200}),'empty response',200],
  ['network',()=>{throw new TypeError('fetch failed');},'unreachable',null],
  ['oversize',()=>new Response('x',{status:200,headers:{'content-length':'10000001'}}),'too large',200],
  ['redirect status',()=>new Response(null,{status:301,headers:{location:'https://example.com/'}}),'redirect refused',301],
  ['redirect refusal',()=>{throw new TypeError('fetch failed',{cause:new Error('unexpected redirect')});},'redirect refused',null],
])test(`failure (${name}) keeps last good copy and change state`, async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  // An unreviewed change must stay visible through a failure.
  const changed=await run(repoRoot,{[PAGE_URL]:HTML2,[PDF_URL]:PDF1},{checkId:'check-2'});
  const before=docOf(changed.list,PAGE_ID),beforeCopies=await copies(repoRoot);
  const {record,list}=await run(repoRoot,{[PAGE_URL]:respond,[PDF_URL]:PDF1},{checkId:'check-3'});
  assert.deepEqual(record.results[0],{doc_id:PAGE_ID,url:PAGE_URL,outcome:'failed',http_status:httpStatus,sha256:null,bytes:null,reason});
  assert.equal(record.results[1].outcome,'same');
  const page=docOf(list,PAGE_ID);
  assert.deepEqual(page.latest,before.latest);
  assert.deepEqual(await readFile(join(repoRoot,page.latest.path)),HTML2);
  assert.deepEqual(await copies(repoRoot),beforeCopies);
  assert.equal(page.status.change_state,before.status.change_state);assert.equal(page.status.change_state,'changed');
  assert.deepEqual(page.history.at(-1),{type:'failed',at:page.history.at(-1).at,reason,http_status:httpStatus,source:{type:'check',check_id:'check-3'}});
  assert.equal(page.status.last_result.outcome,'failed');assert.equal(page.status.last_result.reason,reason);
  assert.equal(statusLabel(page),`⚠ Changed, not reviewed · last check failed (${reason})`);
});

test('timeout is reported as timeout', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const {record,list}=await run(repoRoot,{[PAGE_URL]:()=>Promise.reject(new DOMException('The operation timed out.','TimeoutError')),[PDF_URL]:PDF1});
  assert.deepEqual(record.results[0],{doc_id:PAGE_ID,url:PAGE_URL,outcome:'failed',http_status:null,sha256:null,bytes:null,reason:'timeout'});
  const page=docOf(list,PAGE_ID);
  assert.equal(page.latest,null);assert.equal(page.status.change_state,'not_checked');assert.equal(page.status.last_result.reason,'timeout');
  assert.equal(record.results[1].outcome,'baseline');
});

test('hand-edited non-RRC address is refused at fetch time and never fetched', async t=>{
  const repoRoot=await tempRoot(t);const list=await seedList(repoRoot);
  // The file is edited by hand: the list is refused as a whole, nothing is fetched and the file is left as it is.
  const edited=structuredClone(list);edited.documents[1].url='https://rrc.texas.gov.evil.example/media/x/uic-manual.pdf';
  const file=join(repoRoot,'watched-documents','watch-list.json');
  await writeFile(file,JSON.stringify(edited,null,2));
  const before=await readFile(file),calls=[];
  await assert.rejects(run(repoRoot,{[PAGE_URL]:HTML1},{calls}),error=>{assert.equal(error.code,'WATCH_LIST_INVALID');return true;});
  assert.equal(calls.length,0);
  assert.deepEqual(await readFile(file),before);
  assert.deepEqual(await copies(repoRoot),[]);
  await assert.rejects(readdir(join(repoRoot,'watched-documents','checks')),{code:'ENOENT'});
});

// A seeded row: its latest copy sits under collected-sources/ (never written by the check).
async function seedCollected(repoRoot,bytes){
  const path='collected-sources/run-1/injection-page.html',source={type:'collection',run_id:'run-1'};
  await mkdir(join(repoRoot,'collected-sources','run-1'),{recursive:true});
  await writeFile(join(repoRoot,path),bytes);
  let list=emptyWatchList();
  list=addDocument(list,{url:PAGE_URL,name:'Injection page',kind:'guidance'},{now:'2026-10-10T00:00:00.000Z',id:PAGE_ID,via:'seed'});
  list.documents[0]=applyOutcome(list.documents[0],{type:'baseline',at:'2026-10-10T00:00:00.000Z',sha256:sha(bytes),path,source,
    latest:{sha256:sha(bytes),bytes:bytes.length,path,retrieved_at:'2026-10-10T00:00:00.000Z',last_modified:null,etag:null,source}});
  await writeWatchList({repoRoot},list);
  return list.documents[0].latest;
}

test('damaged latest copy: reported, compared against recorded hash, damaged file untouched, matching fetch repairs', async t=>{
  const repoRoot=await tempRoot(t);
  const original=await seedCollected(repoRoot,HTML1),damagedPath=join(repoRoot,original.path);
  const tampered=Buffer.from('<html><p>tampered</p></html>');
  await writeFile(damagedPath,tampered);
  const second=await run(repoRoot,{[PAGE_URL]:HTML1},{checkId:'check-2'});
  // Two results for the damaged document: its comparison against the recorded hash, then the damage.
  assert.deepEqual(second.record.results.map(r=>r.outcome),['same','damaged']);
  assert.equal(second.record.results[1].reason,'saved copy damaged');
  const page=docOf(second.list,PAGE_ID),[same,damaged]=page.history.slice(-2);
  assert.equal(same.type,'same');assert.equal(same.sha256,original.sha256);
  assert.deepEqual(damaged,{type:'damaged',at:damaged.at,path:original.path,expected_sha256:original.sha256,actual_sha256:sha(tampered),source:{type:'check',check_id:'check-2'}});
  assert.equal(page.status.change_state,'unchanged');assert.equal(page.status.last_result.outcome,'damaged');
  assert.equal(statusLabel(page),'Unchanged · saved copy damaged');
  // The damaged file is never overwritten; the repaired latest points at a fresh copy under copies/.
  assert.deepEqual(await readFile(damagedPath),tampered);
  assert.equal(page.latest.path,`watched-documents/copies/${sha(HTML1)}.html`);
  assert.equal(page.latest.sha256,original.sha256);assert.deepEqual(page.latest.source,{type:'check',check_id:'check-2'});
  assert.deepEqual(await readFile(join(repoRoot,page.latest.path)),HTML1);
  // A fresh check against the repaired copy is plain Unchanged.
  const third=await run(repoRoot,{[PAGE_URL]:HTML1},{checkId:'check-3'});
  assert.deepEqual(third.record.results.map(r=>r.outcome),['same']);
  assert.equal(statusLabel(docOf(third.list,PAGE_ID)),'Unchanged');
});

test('damaged copy under copies/ is repaired to a repair-<check id> copy; its taken name is never overwritten', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const first=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const original=docOf(first.list,PAGE_ID).latest,tampered=Buffer.from('<html><p>tampered</p></html>');
  await writeFile(join(repoRoot,original.path),tampered);
  const second=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-2'});
  assert.deepEqual(second.record.results.map(r=>r.outcome),['same','damaged','same']);
  const page=docOf(second.list,PAGE_ID);
  assert.equal(statusLabel(page),'Unchanged · saved copy damaged');
  assert.equal(page.latest.path,`watched-documents/copies/${sha(HTML1)}.repair-check-2.html`);
  assert.equal(page.latest.sha256,original.sha256);assert.deepEqual(page.latest.source,{type:'check',check_id:'check-2'});
  assert.deepEqual(await readFile(join(repoRoot,page.latest.path)),HTML1);
  assert.deepEqual(await readFile(join(repoRoot,original.path)),tampered);
  assert.deepEqual(await readWatchList({repoRoot}),second.list);
  // The next check is a clean Unchanged against the repaired copy.
  const third=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-3'});
  assert.deepEqual(third.record.results.map(r=>r.outcome),['same','same']);
  const after=docOf(third.list,PAGE_ID);
  assert.deepEqual(after.status.last_result,{at:after.history.at(-1).at,outcome:'ok'});
  assert.equal(statusLabel(after),'Unchanged');
  assert.equal(after.latest.path,page.latest.path);
  assert.deepEqual(await readFile(join(repoRoot,original.path)),tampered);
});

test('the fetch-time address gate fails a document outside the rule without fetching it', async t=>{
  const repoRoot=await tempRoot(t);const list=await seedList(repoRoot);
  for(const url of ['http://www.rrc.texas.gov/x','https://rrc.texas.gov.evil.example/x','https://evilrrc.texas.gov/x','https://user@www.rrc.texas.gov/x','https://www.rrc.texas.gov:8443/x']){
    const calls=[],doc={...docOf(list,PAGE_ID),url};
    const {doc:after,results}=await checkDocument(doc,{repoRoot,fetchImpl:fetchFrom({},calls),testFixture:true,now:()=>'2026-11-03T12:00:00.000Z',checkId:'check-1'});
    assert.equal(calls.length,0,url);
    assert.deepEqual(results,[{doc_id:PAGE_ID,url,outcome:'failed',http_status:null,sha256:null,bytes:null,reason:'address not allowed'}]);
    assert.deepEqual(after.history.at(-1),{type:'failed',at:'2026-11-03T12:00:00.000Z',reason:'address not allowed',http_status:null,source:{type:'check',check_id:'check-1'}});
    assert.equal(after.status.last_result.reason,'address not allowed');assert.equal(after.latest,null);
  }
  assert.deepEqual(await copies(repoRoot),[]);
});

test('A to B to A with copy A tampered: the change saves a repair-<check id> copy and the run carries on', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  await run(repoRoot,{[PAGE_URL]:HTML2,[PDF_URL]:PDF1},{checkId:'check-2'});
  const copyA=join(repoRoot,`watched-documents/copies/${sha(HTML1)}.html`),tampered=Buffer.from('<html><p>tampered</p></html>');
  await writeFile(copyA,tampered);
  const third=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-3'});
  assert.deepEqual(third.record.results.map(r=>[r.doc_id,r.outcome]),[[PAGE_ID,'change'],[PDF_ID,'same']]);
  const page=docOf(third.list,PAGE_ID),change=page.history.at(-1);
  assert.equal(change.type,'change');assert.equal(change.previous_sha256,sha(HTML2));
  assert.equal(change.path,`watched-documents/copies/${sha(HTML1)}.repair-check-3.html`);
  assert.equal(page.latest.path,change.path);assert.equal(page.latest.sha256,sha(HTML1));
  assert.deepEqual(await readFile(join(repoRoot,change.path)),HTML1);
  assert.deepEqual(await readFile(copyA),tampered,'the damaged file is untouched');
  assert.equal(docOf(third.list,PDF_ID).status.last_result.outcome,'ok');
  assert.deepEqual(await readWatchList({repoRoot}),third.list);
  assert.deepEqual(JSON.parse(await readFile(join(repoRoot,'watched-documents/checks/check-3.json'),'utf8')),third.record);
});

test('a new row whose first copy collides with the damaged copy of another row saves a repair-<check id> baseline', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const first=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const damagedPdf=join(repoRoot,docOf(first.list,PDF_ID).latest.path),tampered=Buffer.from('%PDF-1.7\ntampered\n');
  await writeFile(damagedPdf,tampered);
  const NEW_URL='https://www.rrc.texas.gov/media/y/copy-of-manual.pdf',NEW_ID='cccccccccccc';
  await writeWatchList({repoRoot},addDocument(first.list,{url:NEW_URL,name:'Manual copy',kind:'manual'},{now:'2026-11-03T00:00:00.000Z',id:NEW_ID,via:'owner'}));
  const second=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF2,[NEW_URL]:PDF1},{checkId:'check-2'});
  assert.deepEqual(second.record.results.map(r=>[r.doc_id,r.outcome]),[[PAGE_ID,'same'],[PDF_ID,'change'],[PDF_ID,'damaged'],[NEW_ID,'baseline']]);
  const added=docOf(second.list,NEW_ID);
  assert.equal(added.latest.path,`watched-documents/copies/${sha(PDF1)}.repair-check-2.pdf`);
  assert.equal(added.history.at(-1).path,added.latest.path);assert.equal(added.status.change_state,'watched_since');
  assert.deepEqual(await readFile(join(repoRoot,added.latest.path)),PDF1);
  assert.deepEqual(await readFile(damagedPdf),tampered,'the damaged file is untouched');
  assert.deepEqual(await readWatchList({repoRoot}),second.list);
});

test('a check id already used is refused before any fetch or write', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const file=join(repoRoot,'watched-documents','watch-list.json'),before=await readFile(file),beforeCopies=await copies(repoRoot),calls=[];
  await assert.rejects(run(repoRoot,{[PAGE_URL]:HTML2,[PDF_URL]:PDF2},{checkId:'check-1',calls}),error=>{assert.equal(error.code,'WATCH_CHECK_EXISTS');return true;});
  assert.equal(calls.length,0);
  assert.deepEqual(await readFile(file),before);
  assert.deepEqual(await copies(repoRoot),beforeCopies);
});

test('damaged latest copy with a different fetch is a change against the recorded hash, never markup-only', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const first=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const original=docOf(first.list,PAGE_ID).latest;
  await writeFile(join(repoRoot,original.path),HTML1_MARKUP);
  const second=await run(repoRoot,{[PAGE_URL]:HTML1_MARKUP,[PDF_URL]:PDF1},{checkId:'check-2'});
  const page=docOf(second.list,PAGE_ID),[change,damaged]=page.history.slice(-2);
  assert.equal(change.type,'change');assert.equal(change.previous_sha256,original.sha256);assert.equal(change.previous_path,original.path);
  assert.equal(change.markup_only,false);
  assert.equal(damaged.type,'damaged');assert.equal(damaged.path,original.path);assert.equal(damaged.actual_sha256,sha(HTML1_MARKUP));
  assert.equal(page.latest.sha256,sha(HTML1_MARKUP));
});

test('missing latest copy is reported as damaged with no actual fingerprint', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const first=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-1'});
  const original=docOf(first.list,PAGE_ID).latest;
  await rm(join(repoRoot,original.path));
  const second=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{checkId:'check-2'});
  const page=docOf(second.list,PAGE_ID),damaged=page.history.at(-1);
  assert.equal(damaged.type,'damaged');assert.equal(damaged.actual_sha256,null);assert.equal(damaged.expected_sha256,original.sha256);
  // The same bytes come back under their content address, so the repaired copy reuses the same name.
  assert.deepEqual(await readFile(join(repoRoot,page.latest.path)),HTML1);
});

test('interrupted run: copy already on disk is reused and the list saves', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const path=`watched-documents/copies/${sha(HTML1)}.html`;
  await mkdir(join(repoRoot,'watched-documents','copies'),{recursive:true});
  await writeFile(join(repoRoot,path),HTML1);
  const {record,list}=await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1});
  assert.deepEqual(record.results.map(r=>r.outcome),['baseline','baseline']);
  assert.equal(docOf(list,PAGE_ID).latest.path,path);
  assert.deepEqual(await readWatchList({repoRoot}),list);
});

test('onProgress reports done/total for each document', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const progress=[];
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{onProgress:p=>progress.push(p)});
  assert.deepEqual(progress,[{done:1,total:2},{done:2,total:2}]);
});

test('documents no longer watched are left out of the check', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot,{stopPdf:true});
  const calls=[],progress=[];
  const {record,list}=await checkWatchedDocuments({repoRoot,fetchImpl:fetchFrom({[PAGE_URL]:HTML1,[PDF_URL]:PDF1},calls),testFixture:true,now:times(),checkId:'check-1',onProgress:p=>progress.push(p)});
  assert.deepEqual(calls.map(call=>call.url),[PAGE_URL]);
  assert.deepEqual(record.results.map(r=>r.doc_id),[PAGE_ID]);
  assert.deepEqual(progress,[{done:1,total:1}]);
  assert.equal(docOf(list,PDF_ID).latest,null);assert.equal(docOf(list,PDF_ID).history.at(-1).type,'stopped');
});

test('check never sends an app token and fetches each address exactly once', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const calls=[];
  await run(repoRoot,{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},{calls});
  assert.deepEqual(calls.map(call=>call.url),[PAGE_URL,PDF_URL]);
  for(const {init} of calls){
    assert.equal(init.redirect,'error');
    assert.equal(init.headers,undefined);
    assert.ok(!JSON.stringify(init).includes('X-App-Token'));
  }
});

test('the check refuses injected fetch outside fixture mode before any request or write', async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const file=join(repoRoot,'watched-documents','watch-list.json'),before=await readFile(file),calls=[];
  await assert.rejects(checkWatchedDocuments({repoRoot,fetchImpl:fetchFrom({[PAGE_URL]:HTML1,[PDF_URL]:PDF1},calls),now:times(),checkId:'check-1'}),error=>{assert.equal(error.code,'SOURCE_INVALID');return true;});
  assert.equal(calls.length,0);
  assert.deepEqual(await readFile(file),before);
  await assert.rejects(readdir(join(repoRoot,'watched-documents','checks')),{code:'ENOENT'});
});
