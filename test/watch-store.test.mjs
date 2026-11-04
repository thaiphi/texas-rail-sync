// E12-lite Task 3: the disk store for watched-documents/ (temp repo roots only).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readWatchList,writeWatchList,saveCopy,readVerifiedCopy,writeCheckRecord,checkRecordExists} from '../src/watchStore.mjs';
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

test('saveCopy with a variant writes a second write-once copy beside a taken plain name', async t=>{
  const repoRoot=await tempRoot(t);
  const plain=await saveCopy({repoRoot},HTML),tampered=Buffer.from('<html><p>tampered</p></html>');
  await writeFile(join(repoRoot,plain.path),tampered);
  const repaired=await saveCopy({repoRoot,variant:'repair-check-2'},HTML);
  assert.deepEqual(repaired,{path:`watched-documents/copies/${sha(HTML)}.repair-check-2.html`,sha256:sha(HTML),reused:false});
  assert.deepEqual(await readFile(join(repoRoot,repaired.path)),HTML);
  assert.deepEqual(await readFile(join(repoRoot,plain.path)),tampered,'the plain name is never overwritten');
  assert.deepEqual(await saveCopy({repoRoot,variant:'repair-check-2'},HTML),{...repaired,reused:true});
  assert.deepEqual(await readVerifiedCopy({repoRoot},repaired.path,sha(HTML)),HTML);
  const pdf=await saveCopy({repoRoot,variant:'repair-1'},PDF);
  assert.equal(pdf.path,`watched-documents/copies/${sha(PDF)}.repair-1.pdf`);
  // Different bytes under a taken variant name: refuse and never overwrite.
  await writeFile(join(repoRoot,pdf.path),tampered);
  await assert.rejects(saveCopy({repoRoot,variant:'repair-1'},PDF),codeOf('WATCH_COPY_CONFLICT'));
  assert.deepEqual(await readFile(join(repoRoot,pdf.path)),tampered);
  for(const variant of ['','Repair','a.b','../x','a/b','a\b','x'.repeat(65),7,null])
    await assert.rejects(saveCopy({repoRoot,variant},HTML),codeOf('REQUEST_INVALID'),String(variant));
  // A repaired latest at the variant path is a valid stored path for the list.
  let list=addDocument(emptyWatchList(),{url:'https://www.rrc.texas.gov/media/x/a.html',name:'A',kind:'guidance'},{now:'2026-11-03T00:00:00.000Z',id:'0123456789ab',via:'owner'});
  const src={type:'check',check_id:'check-1'},latest=path=>({sha256:sha(HTML),bytes:HTML.length,path,retrieved_at:'2026-11-03T00:00:00.000Z',last_modified:null,etag:null,source:src});
  list.documents[0]=applyOutcome(list.documents[0],{type:'baseline',at:'2026-11-03T00:00:00.000Z',sha256:sha(HTML),path:plain.path,source:src,latest:latest(plain.path)});
  list.documents[0]=applyOutcome(list.documents[0],{type:'repair',latest:latest(repaired.path)});
  await writeWatchList({repoRoot},list);
  assert.equal((await readWatchList({repoRoot})).documents[0].latest.path,repaired.path);
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

test('checkRecordExists answers for a written record and refuses bad ids', async t=>{
  const repoRoot=await tempRoot(t);
  assert.equal(await checkRecordExists({repoRoot},'check-1'),false);
  await writeCheckRecord({repoRoot},{check_id:'check-1'});
  assert.equal(await checkRecordExists({repoRoot},'check-1'),true);
  for(const id of ['../x','a/b','',null])await assert.rejects(checkRecordExists({repoRoot},id),codeOf('REQUEST_INVALID'),String(id));
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

// A writer that leaves half the bytes on disk and then fails, like a crash or a full disk.
const failingWriter=async(path,data,options)=>{const bytes=Buffer.from(data);await writeFile(path,bytes.subarray(0,Math.floor(bytes.length/2)),options);throw Object.assign(Error('no space left on device'),{code:'ENOSPC'});};
const exists=async path=>{try{await readFile(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};

test('a failed copy write leaves no final file and the next identical save succeeds', async t=>{
  const repoRoot=await tempRoot(t),final=join(repoRoot,'watched-documents','copies',`${sha(PDF)}.pdf`);
  await assert.rejects(saveCopy({repoRoot,writeTemp:failingWriter},PDF),codeOf('ENOSPC'));
  assert.equal(await exists(final),false,'no truncated file under the final name');
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents','.partial')),[],'the temp file is removed on failure');
  const saved=await saveCopy({repoRoot},PDF);
  assert.equal(saved.reused,false);
  assert.deepEqual(await readVerifiedCopy({repoRoot},saved.path,saved.sha256),PDF);
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents','.partial')),[],'the temp file is removed on success');
  assert.deepEqual(await saveCopy({repoRoot},PDF),{...saved,reused:true});
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents','copies')),[`${sha(PDF)}.pdf`],'only final names in copies/');
});

test('a failed check record write leaves no record and the same id can be written', async t=>{
  const repoRoot=await tempRoot(t),record={check_id:'c-1',results:[]};
  await assert.rejects(writeCheckRecord({repoRoot,writeTemp:failingWriter},record),codeOf('ENOSPC'));
  assert.equal(await exists(join(repoRoot,'watched-documents','checks','c-1.json')),false);
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents','.partial')),[]);
  const path=await writeCheckRecord({repoRoot},record);
  assert.deepEqual(JSON.parse(await readFile(join(repoRoot,path),'utf8')),record);
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents','.partial')),[]);
});

test('a stale temp file is never accepted as a stored copy', async t=>{
  const repoRoot=await tempRoot(t);
  await mkdir(join(repoRoot,'watched-documents','.partial'),{recursive:true});
  await writeFile(join(repoRoot,'watched-documents','.partial','stale.partial'),PDF.subarray(0,5));
  await assert.rejects(readVerifiedCopy({repoRoot},'watched-documents/.partial/stale.partial',sha(PDF)),codeOf('WATCH_PATH_INVALID'));
  const saved=await saveCopy({repoRoot},PDF);
  assert.equal(saved.reused,false,'a stale temp does not block the save');
  const list=addDocument(emptyWatchList(),{url:'https://www.rrc.texas.gov/media/x/a.pdf',name:'A',kind:'form'},{now:'2026-11-03T00:00:00.000Z',id:'0123456789ab',via:'owner'});
  const latest={sha256:saved.sha256,bytes:PDF.length,path:'watched-documents/.partial/stale.partial',retrieved_at:'2026-11-03T00:00:00.000Z',last_modified:null,etag:null,source:{type:'check',check_id:'c1'}};
  assert.throws(()=>applyOutcome(list.documents[0],{type:'baseline',at:latest.retrieved_at,sha256:saved.sha256,path:latest.path,source:latest.source,latest}),codeOf('REQUEST_INVALID'));
  const bad=structuredClone(list);bad.documents[0].latest=latest;
  await assert.rejects(writeWatchList({repoRoot},bad),codeOf('WATCH_LIST_INVALID'));
});

// Task 5 fix: on Windows a scanner or indexer can hold watch-list.json for a moment, so rename fails with
// EPERM/EBUSY/EACCES. writeWatchList tries the rename up to 5 times, 50 ms apart, then throws WATCH_LIST_BUSY.
const lockError=code=>Object.assign(Error(`${code}: operation not permitted, rename`),{code});
test('writeWatchList retries a held rename and then succeeds', async t=>{
  const repoRoot=await tempRoot(t);
  const first=addDocument(emptyWatchList(),{url:'https://www.rrc.texas.gov/media/x/a.pdf',name:'A',kind:'form'},{now:'2026-11-03T00:00:00.000Z',id:'0123456789ab',via:'owner'});
  await writeWatchList({repoRoot},first);
  const next=addDocument(first,{url:'https://www.rrc.texas.gov/media/x/b.pdf',name:'B',kind:'form'},{now:'2026-11-03T00:00:01.000Z',id:'0123456789ac',via:'owner'});
  const {rename}=await import('node:fs/promises');
  let attempts=0;
  const flaky=async(from,to)=>{attempts++;if(attempts<=2)throw lockError(attempts===1?'EPERM':'EBUSY');return rename(from,to);};
  await writeWatchList({repoRoot,renameFile:flaky},next);
  assert.equal(attempts,3);
  assert.deepEqual(await readWatchList({repoRoot}),next);
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents')),['watch-list.json'],'no temp file is left behind');
});

test('writeWatchList gives up after 5 held renames with WATCH_LIST_BUSY and leaves the old file', async t=>{
  const repoRoot=await tempRoot(t);
  const list=addDocument(emptyWatchList(),{url:'https://www.rrc.texas.gov/media/x/a.pdf',name:'A',kind:'form'},{now:'2026-11-03T00:00:00.000Z',id:'0123456789ab',via:'owner'});
  await writeWatchList({repoRoot},list);
  const file=join(repoRoot,'watched-documents','watch-list.json'),before=await readFile(file);
  let attempts=0;const started=Date.now();
  const held=async()=>{attempts++;throw lockError('EACCES');};
  await assert.rejects(writeWatchList({repoRoot,renameFile:held},emptyWatchList()),codeOf('WATCH_LIST_BUSY'));
  assert.equal(attempts,5);
  assert.ok(Date.now()-started>=150,'attempts are spaced about 50 ms apart');
  assert.deepEqual(await readFile(file),before,'the old file is byte-identical');
  assert.deepEqual(await readdir(join(repoRoot,'watched-documents')),['watch-list.json'],'no temp file is left behind');
  // Any other rename error is not retried.
  attempts=0;
  const broken=async()=>{attempts++;throw lockError('ENOSPC');};
  await assert.rejects(writeWatchList({repoRoot,renameFile:broken},emptyWatchList()),codeOf('ENOSPC'));
  assert.equal(attempts,1);
});

// Final-review fix 6: on Windows a scanner can hold the .partial temp file after the hard link succeeded.
// Removing it is best-effort, so a write that succeeded is never reported as failed.
test('a temp file that cannot be removed after a successful link does not fail the write', async t=>{
  const repoRoot=await tempRoot(t);
  let removes=0;
  const heldRemover=async()=>{removes++;throw lockError('EBUSY');};
  const saved=await saveCopy({repoRoot,removeTemp:heldRemover},PDF);
  assert.equal(saved.reused,false);
  assert.deepEqual(await readVerifiedCopy({repoRoot},saved.path,saved.sha256),PDF);
  const path=await writeCheckRecord({repoRoot,removeTemp:async()=>{removes++;throw lockError('EPERM');}},{check_id:'c-held',results:[]});
  assert.deepEqual(JSON.parse(await readFile(join(repoRoot,path),'utf8')),{check_id:'c-held',results:[]});
  assert.equal(removes,2,'the remover was tried once per write');
  // A failed write still reports its own error, not the remover's.
  await assert.rejects(saveCopy({repoRoot,writeTemp:failingWriter,removeTemp:heldRemover},HTML),codeOf('ENOSPC'));
});
