// E12-lite Task 3: the disk store for watched-documents/ (temp repo roots only).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readWatchList,writeWatchList,saveCopy,readVerifiedCopy,writeCheckRecord} from '../src/watchStore.mjs';
import {emptyWatchList,addDocument,applyOutcome} from '../public/watch-list.js';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tempRoot=async t=>{const dir=await mkdtemp(join(tmpdir(),'trrc-watch-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;};
const codeOf=code=>error=>{assert.equal(error.code,code,error.message);return true;};
const PDF=Buffer.from('%PDF-1.7\nsample pdf bytes\n'),HTML=Buffer.from('<html><p>hello</p></html>');

test('saveCopy is write-once and reuses identical bytes', async t=>{
  const repoRoot=await tempRoot(t);
  const first=await saveCopy({repoRoot},PDF);
  assert.deepEqual(first,{path:`watched-documents/copies/${sha(PDF)}.pdf`,sha256:sha(PDF),reused:false});
  assert.deepEqual(await readFile(join(repoRoot,first.path)),PDF);
  const again=await saveCopy({repoRoot},PDF);
  assert.deepEqual(again,{...first,reused:true});
  const page=await saveCopy({repoRoot},HTML);
  assert.equal(page.path,`watched-documents/copies/${sha(HTML)}.html`);
  // Different bytes under the same name only happen after tampering: refuse and never overwrite.
  const tampered=Buffer.from('%PDF-1.7\ntampered\n');
  await writeFile(join(repoRoot,first.path),tampered);
  await assert.rejects(saveCopy({repoRoot},PDF),codeOf('WATCH_COPY_CONFLICT'));
  assert.deepEqual(await readFile(join(repoRoot,first.path)),tampered);
  await assert.rejects(saveCopy({repoRoot},'not bytes'),codeOf('REQUEST_INVALID'));
});

test('readVerifiedCopy refuses damaged bytes and bad paths', async t=>{
  const repoRoot=await tempRoot(t);
  const saved=await saveCopy({repoRoot},PDF);
  assert.deepEqual(await readVerifiedCopy({repoRoot},saved.path,saved.sha256),PDF);
  const flipped=Buffer.from(PDF);flipped[10]^=1;
  await writeFile(join(repoRoot,saved.path),flipped);
  await assert.rejects(readVerifiedCopy({repoRoot},saved.path,saved.sha256),error=>{
    assert.equal(error.code,'WATCH_COPY_DAMAGED');assert.equal(error.actualSha256,sha(flipped));return true;});
  for(const bad of ['artifacts/x','collected-sources\\a','watched-documents/copies/../../x','watched-documents/watch-list.json','/etc/passwd','collected-sources/./a','collected-sources//a','',null])
    await assert.rejects(readVerifiedCopy({repoRoot},bad,saved.sha256),codeOf('WATCH_PATH_INVALID'),String(bad));
  await assert.rejects(readVerifiedCopy({repoRoot},'watched-documents/copies/missing.pdf',saved.sha256),codeOf('WATCH_COPY_MISSING'));
  await assert.rejects(readVerifiedCopy({repoRoot},saved.path,'nothex'),codeOf('REQUEST_INVALID'));
});

test('readVerifiedCopy refuses a path through a symlink or junction', async t=>{
  const repoRoot=await tempRoot(t),outside=await tempRoot(t);
  await writeFile(join(outside,'x.pdf'),PDF);
  await mkdir(join(repoRoot,'watched-documents','copies'),{recursive:true});
  try{await symlink(outside,join(repoRoot,'watched-documents','copies','link'),'junction');}
  catch(error){t.skip(`cannot create a link here: ${error.code}`);return;}
  await assert.rejects(readVerifiedCopy({repoRoot},'watched-documents/copies/link/x.pdf',sha(PDF)),codeOf('WATCH_PATH_INVALID'));
});

test('writeWatchList is atomic and refuses an invalid list', async t=>{
  const repoRoot=await tempRoot(t);
  await assert.rejects(readWatchList({repoRoot}),codeOf('WATCH_LIST_MISSING'));
  const list=addDocument(emptyWatchList(),{url:'https://www.rrc.texas.gov/media/x/a.pdf',name:'A',kind:'form'},{now:'2026-11-03T00:00:00.000Z',id:'0123456789ab',via:'owner'});
  await writeWatchList({repoRoot},list);
  const file=join(repoRoot,'watched-documents','watch-list.json');
  const before=await readFile(file);
  assert.deepEqual(await readWatchList({repoRoot}),list);
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents')),['watch-list.json'],'no temp file is left behind');
  const bad=structuredClone(list);bad.documents[0].url='http://example.com/';
  await assert.rejects(writeWatchList({repoRoot},bad),codeOf('WATCH_LIST_INVALID'));
  await assert.rejects(writeWatchList({repoRoot},{schema:'rrc-watch-list-v0',documents:[]}),codeOf('WATCH_LIST_INVALID'));
  assert.deepEqual(await readFile(file),before,'the old file is byte-identical');
  await writeFile(file,'{not json');
  await assert.rejects(readWatchList({repoRoot}),codeOf('WATCH_LIST_INVALID'));
  await writeFile(file,JSON.stringify({...list,schema:'other'}));
  await assert.rejects(readWatchList({repoRoot}),codeOf('WATCH_LIST_INVALID'));
});

test('writeCheckRecord writes once under checks/ and refuses bad ids', async t=>{
  const repoRoot=await tempRoot(t);
  const record={check_id:'2026-11-03T10-00-00-000Z-ab12',started_at:'2026-11-03T10:00:00.000Z',results:[]};
  const path=await writeCheckRecord({repoRoot},record);
  assert.equal(path,`watched-documents/checks/${record.check_id}.json`);
  assert.deepEqual(JSON.parse(await readFile(join(repoRoot,path),'utf8')),record);
  await assert.rejects(writeCheckRecord({repoRoot},{...record,results:[1]}),codeOf('WATCH_CHECK_EXISTS'));
  assert.deepEqual(JSON.parse(await readFile(join(repoRoot,path),'utf8')),record,'never overwritten');
  for(const check_id of ['../x','a/b','a\\b','..','',null,'.hidden'])
    await assert.rejects(writeCheckRecord({repoRoot},{...record,check_id}),codeOf('REQUEST_INVALID'),String(check_id));
});

test('stored paths use forward slashes on every platform', async t=>{
  const repoRoot=await tempRoot(t);
  const saved=await saveCopy({repoRoot},PDF);
  assert.ok(!saved.path.includes('\\'));
  assert.match(saved.path,/^watched-documents\/copies\/[0-9a-f]{64}\.pdf$/);
  let list=addDocument(emptyWatchList(),{url:'https://www.rrc.texas.gov/media/x/a.pdf',name:'A',kind:'form'},{now:'2026-11-03T00:00:00.000Z',id:'0123456789ab',via:'owner'});
  const latest={sha256:saved.sha256,bytes:PDF.length,path:saved.path,retrieved_at:'2026-11-03T00:00:00.000Z',last_modified:null,etag:null,source:{type:'check',check_id:'c1'}};
  list={...list,documents:[applyOutcome(list.documents[0],{type:'baseline',at:latest.retrieved_at,sha256:saved.sha256,path:saved.path,source:latest.source,latest})]};
  await writeWatchList({repoRoot},list);
  assert.ok(!(await readFile(join(repoRoot,'watched-documents','watch-list.json'),'utf8')).includes('\\\\'));
  // A list naming a backslash path is refused on write, so it can never be stored.
  const bad=structuredClone(list);bad.documents[0].latest.path=saved.path.replaceAll('/','\\');
  await assert.rejects(writeWatchList({repoRoot},bad),codeOf('WATCH_LIST_INVALID'));
});
