// E12-lite Task 5: /api/watch* routes on the local server (temp repo roots, injected fetch, no real network).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createExplorerServer} from '../scripts/serve.mjs';
import {createGuestLocalServer} from '../scripts/guest-local.mjs';
import {readWatchList,writeWatchList,saveCopy} from '../src/watchStore.mjs';
import {emptyWatchList,addDocument,applyOutcome,documentId,normalizeWatchAddress} from '../public/watch-list.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const PAGE_URL='https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/';
const PDF_URL='https://www.rrc.texas.gov/media/x/uic-manual.pdf';
const PAGE_ID='aaaaaaaaaaaa',PDF_ID='bbbbbbbbbbbb';
const HTML1=Buffer.from('<html><body><p>Rule 3.9</p><script>alert(1)</script></body></html>');
const PDF1=Buffer.from('%PDF-1.7\nfirst manual\n');
const ORIGIN_FORBIDDEN_HOSTS=['https://evil.example'];

const tempRoot=async t=>{const dir=await mkdtemp(join(tmpdir(),'trrc-watch-server-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;};
async function seedList(repoRoot,{baselines=false}={}){
  let list=emptyWatchList();
  list=addDocument(list,{url:PAGE_URL,name:'Injection page',kind:'guidance'},{now:'2026-11-01T00:00:00.000Z',id:PAGE_ID,via:'owner'});
  list=addDocument(list,{url:PDF_URL,name:'UIC manual',kind:'manual'},{now:'2026-11-01T00:00:00.000Z',id:PDF_ID,via:'owner'});
  if(baselines){
    const source={type:'check',check_id:'seed-check'};
    for(const [id,bytes] of [[PAGE_ID,HTML1],[PDF_ID,PDF1]]){
      const saved=await saveCopy({repoRoot},bytes),index=list.documents.findIndex(doc=>doc.id===id);
      list.documents[index]=applyOutcome(list.documents[index],{type:'baseline',at:'2026-11-02T00:00:00.000Z',sha256:saved.sha256,path:saved.path,source,latest:{sha256:saved.sha256,bytes:bytes.length,path:saved.path,retrieved_at:'2026-11-02T00:00:00.000Z',last_modified:null,etag:null,source}});
    }
  }
  await writeWatchList({repoRoot},list);
  return list;
}
// bodies: url -> Buffer; gate: optional promise every fetch waits on first.
const fetchFrom=(bodies,{gate=null,calls=[]}={})=>async url=>{calls.push(String(url));if(gate)await gate;return new Response(bodies[url],{status:200});};
const deferred=()=>{let open;const promise=new Promise(resolve=>{open=resolve;});return {promise,open};};

async function start(t,options){
  const server=createExplorerServer(options);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=path=>fetch(base+path,{signal:AbortSignal.timeout(5000)});
  const post=(path,body,{origin=base,raw}={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin},body:raw??JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  return {base,get,post};
}
const watchServer=(t,repoRoot,extra={})=>start(t,{watchRoot:resolve(repoRoot,'watched-documents'),repoRoot,fetchImpl:fetchFrom(extra.bodies??{[PAGE_URL]:HTML1,[PDF_URL]:PDF1},extra),testFixture:true,runRoot:join(repoRoot,'runs'),lookupRoot:join(repoRoot,'lookups'),sourceRoot:join(repoRoot,'collected-sources'),outputRoot:join(repoRoot,'artifacts')});
const json=async response=>({status:response.status,body:await response.json()});
async function waitIdle(get){
  for(let i=0;i<200;i++){const {body}=await json(await get('/api/watch'));if(body.running===null)return body;await new Promise(resolve=>setTimeout(resolve,25));}
  throw Error('check never finished');
}

test('no watchRoot → /api/watch is 404 (guest-local and default construction)',async t=>{
  const {get,post}=await start(t,{});
  for(const path of ['/api/watch',`/api/watch/copy/${PAGE_ID}/${'0'.repeat(64)}`]){
    const response=await get(path);assert.equal(response.status,404,path);assert.equal(await response.text(),'File not found');
  }
  for(const path of ['/api/watch/check','/api/watch/add','/api/watch/stop']){
    const response=await post(path,{});assert.equal(response.status,404,path);
  }
});

test('createGuestLocalServer exposes no watch route',async t=>{
  const server=await createGuestLocalServer({mode:'official'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/watch`,{signal:AbortSignal.timeout(5000)})).status,404);
  const write=await fetch(`${base}/api/watch/check`,{method:'POST',headers:{'content-type':'application/json',origin:base},body:'{}',signal:AbortSignal.timeout(5000)});
  assert.notEqual(write.status,202);assert.ok(write.status>=400);
});

test('GET /api/watch returns the list and running:null',async t=>{
  const repoRoot=await tempRoot(t);const seeded=await seedList(repoRoot);
  const {get}=await watchServer(t,repoRoot);
  const response=await get('/api/watch');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  assert.deepEqual(Object.keys(body).sort(),['lastCheck','list','running','schemaVersion']);
  assert.equal(body.schemaVersion,1);assert.equal(body.running,null);assert.equal(body.lastCheck,null);
  assert.deepEqual(body.list,seeded);
});

test('check → 202, progress visible while running, list updated after',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const gate=deferred(),calls=[];
  const {get,post}=await watchServer(t,repoRoot,{gate:gate.promise,calls});
  const started=await json(await post('/api/watch/check',{}));
  assert.equal(started.status,202);assert.match(started.body.checkId,/^[0-9a-f-]{36}$/);
  const during=(await json(await get('/api/watch'))).body;
  assert.deepEqual(during.running,{checkId:started.body.checkId,done:0,total:2});
  gate.open();
  const after=await waitIdle(get);
  assert.deepEqual(calls,[PAGE_URL,PDF_URL]);
  assert.deepEqual(after.lastCheck?.check_id,started.body.checkId);assert.equal(typeof after.lastCheck.ended_at,'string');
  assert.deepEqual(after.list.documents.map(doc=>doc.status.change_state),['watched_since','watched_since']);
  assert.deepEqual(after.list,await readWatchList({repoRoot}));
  // lastCheck comes from the check record on disk, so a new instance still reports it.
  const fresh=await watchServer(t,repoRoot);
  assert.deepEqual((await json(await fresh.get('/api/watch'))).body.lastCheck,after.lastCheck);
});

test('second check while running → 409 WATCH_BUSY; add during check → 409',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const gate=deferred();
  const {get,post}=await watchServer(t,repoRoot,{gate:gate.promise});
  assert.equal((await post('/api/watch/check',{})).status,202);
  const again=await json(await post('/api/watch/check',{}));
  assert.equal(again.status,409);assert.equal(again.body.error.code,'WATCH_BUSY');
  const add=await json(await post('/api/watch/add',{url:'https://www.rrc.texas.gov/new.pdf',name:'New',kind:'form'}));
  assert.equal(add.status,409);assert.equal(add.body.error.code,'WATCH_BUSY');
  const stop=await json(await post('/api/watch/stop',{id:PAGE_ID}));
  assert.equal(stop.status,409);assert.equal(stop.body.error.code,'WATCH_BUSY');
  gate.open();await waitIdle(get);
  assert.equal((await post('/api/watch/stop',{id:PAGE_ID})).status,200,'busy clears after the run');
});

test('add: refused hosts → 400 WATCH_ADDRESS_INVALID; duplicate → 409 with existingId; valid → 201 Not yet checked',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const {post}=await watchServer(t,repoRoot);
  for(const url of ['http://www.rrc.texas.gov/a.pdf','https://rrc.texas.gov.evil.com/a.pdf','https://evilrrc.texas.gov/a.pdf','https://user:pw@www.rrc.texas.gov/a.pdf','https://www.rrc.texas.gov:8443/a.pdf','not a url']){
    const refused=await json(await post('/api/watch/add',{url,name:'X',kind:'form'}));
    assert.equal(refused.status,400,url);assert.equal(refused.body.error.code,'WATCH_ADDRESS_INVALID',url);
  }
  const duplicate=await json(await post('/api/watch/add',{url:PDF_URL+'#page=3',name:'Again',kind:'manual'}));
  assert.equal(duplicate.status,409);assert.equal(duplicate.body.error.code,'WATCH_DUPLICATE');assert.equal(duplicate.body.existingId,PDF_ID);
  const url='https://WWW.RRC.TEXAS.GOV/forms/h-10.pdf#x';
  const added=await json(await post('/api/watch/add',{url,name:'  H-10 form ',kind:'form'}));
  assert.equal(added.status,201);
  const normalized=normalizeWatchAddress(url);
  assert.equal(added.body.document.id,await documentId(normalized));
  assert.equal(added.body.document.url,normalized);assert.equal(added.body.document.name,'H-10 form');
  assert.equal(added.body.document.added_via,'owner');assert.equal(added.body.document.status.change_state,'not_checked');
  assert.deepEqual((await readWatchList({repoRoot})).documents.at(-1),added.body.document);
});

test('POST from another origin or non-loopback host → 403 ORIGIN_FORBIDDEN',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const before=await readFile(join(repoRoot,'watched-documents','watch-list.json'));
  const {base,post}=await watchServer(t,repoRoot);
  for(const origin of ORIGIN_FORBIDDEN_HOSTS){
    const refused=await json(await post('/api/watch/stop',{id:PAGE_ID},{origin}));
    assert.equal(refused.status,403);assert.equal(refused.body.error.code,'ORIGIN_FORBIDDEN');
  }
  // A foreign Host header (DNS rebinding) is refused even with a matching Origin.
  const {request}=await import('node:http');
  const port=new URL(base).port;
  const status=await new Promise((done,reject)=>{
    const req=request({host:'127.0.0.1',port,path:'/api/watch/check',method:'POST',headers:{host:`rebind.example:${port}`,origin:`http://rebind.example:${port}`,'content-type':'application/json'}},res=>{res.resume();done(res.statusCode);});
    req.on('error',reject);req.end('{}');
  });
  assert.equal(status,403);
  assert.deepEqual(await readFile(join(repoRoot,'watched-documents','watch-list.json')),before);
});

test('review / note / stop / rewatch / edit round-trip and persist across a new server instance',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot,{baselines:true});
  // Give the page an unreviewed change so review and note have something to act on.
  const HTML2=Buffer.from('<html><body><p>Rule 3.9 amended</p></body></html>');
  const {get,post}=await watchServer(t,repoRoot,{bodies:{[PAGE_URL]:HTML2,[PDF_URL]:PDF1}});
  assert.equal((await post('/api/watch/check',{})).status,202);
  const checked=await waitIdle(get);
  const change=checked.list.documents.find(doc=>doc.id===PAGE_ID).history.findLast(ev=>ev.type==='change');
  assert.ok(change,`the check recorded a change: ${JSON.stringify(checked.list.documents.find(doc=>doc.id===PAGE_ID).history)}`);
  const note=await json(await post('/api/watch/note',{id:PAGE_ID,changeId:change.id,note:'Looks like <script>x</script> "quoted"'}));
  assert.equal(note.status,200,JSON.stringify(note.body));assert.deepEqual(note.body.document.history.at(-1).note,'Looks like <script>x</script> "quoted"');
  const review=await json(await post('/api/watch/review',{id:PAGE_ID,note:'Read it'}));
  assert.equal(review.status,200,JSON.stringify(review.body));assert.equal(review.body.document.status.change_state,'reviewed');
  const stop=await json(await post('/api/watch/stop',{id:PDF_ID}));
  assert.equal(stop.status,200,JSON.stringify(stop.body));assert.equal(stop.body.document.watched,false);
  const stopAgain=await json(await post('/api/watch/stop',{id:PDF_ID}));
  assert.equal(stopAgain.status,400);assert.equal(stopAgain.body.error.code,'REQUEST_INVALID');
  const rewatch=await json(await post('/api/watch/rewatch',{id:PDF_ID}));
  assert.equal(rewatch.status,200,JSON.stringify(rewatch.body));assert.equal(rewatch.body.document.watched,true);
  const edit=await json(await post('/api/watch/edit',{id:PDF_ID,name:'UIC manual (2026)',kind:'guidance'}));
  assert.equal(edit.status,200,JSON.stringify(edit.body));assert.equal(edit.body.document.name,'UIC manual (2026)');assert.equal(edit.body.document.kind,'guidance');
  for(const [path,body] of [['/api/watch/stop',{id:'cccccccccccc'}],['/api/watch/review',{id:'cccccccccccc',note:''}],['/api/watch/note',{id:'cccccccccccc',changeId:'x',note:'n'}],['/api/watch/edit',{id:'cccccccccccc',name:'N'}],['/api/watch/rewatch',{id:'cccccccccccc'}]]){
    const unknown=await json(await post(path,body));
    assert.equal(unknown.status,404,path);assert.equal(unknown.body.error.code,'REQUEST_INVALID',path);
  }
  const fresh=await watchServer(t,repoRoot);
  const {list}=(await json(await fresh.get('/api/watch'))).body;
  const page=list.documents.find(doc=>doc.id===PAGE_ID),pdf=list.documents.find(doc=>doc.id===PDF_ID);
  assert.deepEqual(page,review.body.document);assert.deepEqual(pdf,edit.body.document);
  assert.deepEqual(pdf.history.slice(-3).map(ev=>ev.type),['stopped','rewatched','edited']);
});

test('note 2001 chars → 400; name 121 chars → 400; extra field → 400',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot);
  const before=await readFile(join(repoRoot,'watched-documents','watch-list.json'));
  const {post}=await watchServer(t,repoRoot);
  const cases=[
    ['/api/watch/review',{id:PAGE_ID,note:'n'.repeat(2001)}],
    ['/api/watch/note',{id:PAGE_ID,changeId:'x',note:'n'.repeat(2001)}],
    ['/api/watch/add',{url:'https://www.rrc.texas.gov/x.pdf',name:'n'.repeat(121),kind:'form'}],
    ['/api/watch/edit',{id:PAGE_ID,name:'n'.repeat(121)}],
    ['/api/watch/edit',{id:PAGE_ID,kind:'other'}],
    ['/api/watch/check',{extra:true}],
    ['/api/watch/add',{url:'https://www.rrc.texas.gov/x.pdf',name:'X',kind:'form',id:'dddddddddddd'}],
    ['/api/watch/stop',{id:PAGE_ID,now:'2020-01-01'}],
    ['/api/watch/stop',{}],
  ];
  for(const [path,body] of cases){
    const refused=await json(await post(path,body));
    assert.equal(refused.status,400,`${path} ${JSON.stringify(body).slice(0,60)}`);assert.equal(refused.body.error.code,'REQUEST_INVALID');
  }
  const notJson=await json(await post('/api/watch/stop',null,{raw:'{bad'}));
  assert.equal(notJson.status,400);assert.equal(notJson.body.error.code,'REQUEST_INVALID');
  const unknownRoute=await post('/api/watch/delete',{id:PAGE_ID});
  assert.equal(unknownRoute.status,404);
  assert.deepEqual(await readFile(join(repoRoot,'watched-documents','watch-list.json')),before);
});

test('copy route serves pdf inline and html as text/plain nosniff; damaged → 409 with the fixed message',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot,{baselines:true});
  const {get}=await watchServer(t,repoRoot);
  const pdf=await get(`/api/watch/copy/${PDF_ID}/${sha(PDF1)}`);
  assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');
  assert.match(pdf.headers.get('content-disposition'),/^inline/);
  assert.equal(pdf.headers.get('x-content-type-options'),'nosniff');assert.equal(pdf.headers.get('cache-control'),'no-cache');
  assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),PDF1);
  const html=await get(`/api/watch/copy/${PAGE_ID}/${sha(HTML1)}`);
  assert.equal(html.status,200);assert.equal(html.headers.get('content-type'),'text/plain; charset=utf-8');
  assert.equal(html.headers.get('x-content-type-options'),'nosniff');assert.equal(html.headers.get('cache-control'),'no-cache');
  assert.deepEqual(Buffer.from(await html.arrayBuffer()),HTML1);
  for(const path of [`/api/watch/copy/${PAGE_ID}/${sha(PDF1)}`,`/api/watch/copy/cccccccccccc/${sha(HTML1)}`,`/api/watch/copy/${PAGE_ID}/${'f'.repeat(64)}`,`/api/watch/copy/${PAGE_ID}/..%2f..%2fpackage.json`,`/api/watch/copy/${PAGE_ID}`]){
    assert.equal((await get(path)).status,404,path);
  }
  // Damage the saved page copy on disk.
  await writeFile(join(repoRoot,'watched-documents','copies',`${sha(HTML1)}.html`),'tampered');
  const damaged=await json(await get(`/api/watch/copy/${PAGE_ID}/${sha(HTML1)}`));
  assert.equal(damaged.status,409);
  assert.deepEqual(damaged.body,{error:{code:'WATCH_COPY_DAMAGED',message:'This saved copy no longer matches its recorded fingerprint'}});
});

test('copy route prefers the repaired latest copy over a damaged history path',async t=>{
  const repoRoot=await tempRoot(t);await seedList(repoRoot,{baselines:true});
  await writeFile(join(repoRoot,'watched-documents','copies',`${sha(HTML1)}.html`),'tampered');
  const {get,post}=await watchServer(t,repoRoot);
  assert.equal((await post('/api/watch/check',{})).status,202);
  const after=await waitIdle(get);
  const page=after.list.documents.find(doc=>doc.id===PAGE_ID);
  assert.match(page.latest.path,/\.repair-[0-9a-f-]+\.html$/);
  const copy=await get(`/api/watch/copy/${PAGE_ID}/${sha(HTML1)}`);
  assert.equal(copy.status,200);assert.deepEqual(Buffer.from(await copy.arrayBuffer()),HTML1);
});

test('corrupt or unknown-schema list → GET 500 WATCH_LIST_INVALID and POSTs leave the file byte-identical',async t=>{
  for(const content of ['{not json',JSON.stringify({schema:'rrc-watch-list-v9',documents:[]}),JSON.stringify({schema:'rrc-watch-list-v1',documents:[{id:'aaaaaaaaaaaa',url:'https://evil.example/x',name:'X',kind:'form',watched:true,latest:null,history:[]}]})]){
    const repoRoot=await tempRoot(t);
    await mkdir(join(repoRoot,'watched-documents'),{recursive:true});
    const file=join(repoRoot,'watched-documents','watch-list.json');await writeFile(file,content);
    const calls=[];
    const {get,post}=await watchServer(t,repoRoot,{calls});
    const read=await json(await get('/api/watch'));
    assert.equal(read.status,500);assert.equal(read.body.error.code,'WATCH_LIST_INVALID');assert.match(read.body.error.message,/can't be read/);
    for(const [path,body] of [['/api/watch/check',{}],['/api/watch/add',{url:'https://www.rrc.texas.gov/x.pdf',name:'X',kind:'form'}],['/api/watch/stop',{id:PAGE_ID}],['/api/watch/rewatch',{id:PAGE_ID}],['/api/watch/edit',{id:PAGE_ID,name:'Y'}],['/api/watch/review',{id:PAGE_ID,note:''}],['/api/watch/note',{id:PAGE_ID,changeId:'x',note:'n'}]]){
      const refused=await json(await post(path,body));
      assert.equal(refused.status,500,path);assert.equal(refused.body.error.code,'WATCH_LIST_INVALID',path);
    }
    assert.equal((await get(`/api/watch/copy/${PAGE_ID}/${sha(HTML1)}`)).status,500);
    assert.equal(await readFile(file,'utf8'),content);
    assert.deepEqual(calls,[],'no fetch is made against an unreadable list');
  }
});

test('missing list → GET 500 WATCH_LIST_MISSING and POSTs never create one',async t=>{
  const repoRoot=await tempRoot(t);
  const {get,post}=await watchServer(t,repoRoot);
  const read=await json(await get('/api/watch'));
  assert.equal(read.status,500);assert.equal(read.body.error.code,'WATCH_LIST_MISSING');
  const add=await json(await post('/api/watch/add',{url:'https://www.rrc.texas.gov/x.pdf',name:'X',kind:'form'}));
  assert.equal(add.status,500);assert.equal(add.body.error.code,'WATCH_LIST_MISSING');
  await assert.rejects(readFile(join(repoRoot,'watched-documents','watch-list.json')),{code:'ENOENT'});
});
