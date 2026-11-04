// E12-lite Task 3: the one-off history seed (reads the real committed collected-sources; writes only to temp dirs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEED_DOCUMENTS,buildSeedList,ownerHistory} from '../src/watchSeed.mjs';
import {writeWatchList,readWatchList} from '../src/watchStore.mjs';
import {documentId,validateWatchList,addDocument,markReviewed,addNote,applyOutcome,stopWatching} from '../public/watch-list.js';

const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const NOW='2026-11-03T00:00:00.000Z';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tempRoot=async t=>{const dir=await mkdtemp(join(tmpdir(),'trrc-watch-seed-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;};

// Spec §3.1, verbatim.
const SPEC_3_1=[
  ['UIC manual (UIA010)','manual','https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf'],
  ['Injection-Storage Resources','announcements','https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/'],
  ['UIC query help','guidance','https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html'],
  ['Step-rate test guidelines','guidance','https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/'],
  ['BHP monitoring NTO (Permian)','guidance','https://www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf'],
  ['Wellbore database manual (WBA091)','manual','https://www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf'],
  ['Form W-2','form','https://www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf'],
  ['Form W-3','form','https://www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf'],
];
const COPY_COUNTS={'uic-manual':11,'rrc-resources':11,'uic-query-help':11,'srt-guidelines':9,'bhp-permian-nto':9,'form-w2':6,'form-w3':6,'wellbore-wba091':6};

// Copies the seed documents' files of the given runs into a temp repo root (b7628a71 holds all eight).
async function copyRuns(root,runs){
  for(const run of runs){
    const from=join(repoRoot,'collected-sources',run),to=join(root,'collected-sources',run);
    await mkdir(to,{recursive:true});
    for(const name of await readdir(from))if(SEED_DOCUMENTS.some(d=>name.startsWith(`${d.file}.`)))await copyFile(join(from,name),join(to,name));
  }
}
const FULL_RUN='b7628a71-03fe-4a16-928c-033353e1fce0';

async function hashTree(dir){
  const out={};
  for(const entry of await readdir(dir,{recursive:true,withFileTypes:true})){
    if(!entry.isFile())continue;
    const full=join(entry.parentPath??entry.path,entry.name);
    out[full]=sha(await readFile(full));
  }
  return out;
}

test('seed reproduces the missed rrc-resources change with no network', async t=>{
  const realFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('the seed must make no network request');};
  t.after(()=>{globalThis.fetch=realFetch;});
  const list=await buildSeedList({repoRoot,now:NOW});
  assert.deepEqual(validateWatchList(list),list);
  assert.equal(list.documents.length, 8);
  const res = list.documents.find(d=>d.url.endsWith('/injection-storage-permits/resources/'));
  assert.equal(res.status.change_state, 'changed');
  const change = res.history.find(e=>e.type==='change');
  assert.equal(change.previous_sha256.slice(0,8), 'd8173dcf'); assert.equal(change.sha256.slice(0,8), '237547a1');
  assert.equal(change.previous_seen_at.slice(0,10), '2026-10-10'); assert.equal(change.at.slice(0,10), '2026-10-29');
  assert.equal(change.markup_only, false);
  assert.equal(change.previous_seen_at,'2026-10-10T12:35:23.686Z','the last observation of the old hash');
  assert.deepEqual(change.source,{type:'collection',run_id:'a8606089-cd03-4c22-9161-11dd443331a8'});
  assert.equal(change.previous_path,'collected-sources/7aecd619-c19b-48ad-b354-832f5cc0cca0/rrc-resources.html','the saved copy of the old hash');
  assert.equal(change.path,'collected-sources/a8606089-cd03-4c22-9161-11dd443331a8/rrc-resources.html');
  assert.equal(change.review,null);
  assert.equal(res.history.filter(e=>e.type==='change').length,1);
  for (const d of list.documents.filter(d=>d!==res)) assert.equal(d.status.change_state, 'unchanged', d.name);
});

test('seed rows match spec §3.1 and replay every committed copy in order', async ()=>{
  const list=await buildSeedList({repoRoot,now:NOW});
  assert.deepEqual(list.documents.map(d=>[d.name,d.kind,d.url]),SPEC_3_1);
  assert.deepEqual(SEED_DOCUMENTS.map(d=>[d.name,d.kind]),SPEC_3_1.map(([name,kind])=>[name,kind]));
  assert.ok(Object.isFrozen(SEED_DOCUMENTS));
  for(const [index,doc] of list.documents.entries()){
    const file=SEED_DOCUMENTS[index].file;
    assert.equal(doc.id,await documentId(doc.url));
    assert.equal(doc.added_via,'seed');assert.equal(doc.watched,true);
    assert.equal(doc.history.length,COPY_COUNTS[file],file);
    assert.equal(doc.history[0].type,'baseline');
    assert.equal(doc.added_at,doc.history[0].at,'added when the first copy was retrieved');
    const times=doc.history.map(e=>e.at);
    assert.deepEqual(times,[...times].sort(),`${file} history is oldest first`);
    for(const ev of doc.history){
      assert.equal(ev.source.type,'collection');
      for(const field of ['path','previous_path'])if(ev[field])assert.match(ev[field],new RegExp(`^collected-sources/[0-9a-f-]{36}/${file}\\.(pdf|html)$`));
    }
    const last=doc.history.at(-1);
    // latest is the copy that introduced the current hash; later identical copies are checks, not new copies.
    const introduced=doc.history.findLast(e=>e.type==='baseline'||e.type==='change');
    assert.equal(doc.latest.sha256,last.sha256);
    assert.equal(doc.latest.path,introduced.path);
    assert.equal(doc.latest.retrieved_at,introduced.at);
    assert.deepEqual(doc.latest.source,introduced.source);
    assert.deepEqual(Object.keys(doc.latest).sort(),['bytes','etag','last_modified','path','retrieved_at','sha256','source']);
    assert.equal(doc.latest.bytes,(await readFile(join(repoRoot,doc.latest.path))).length);
    assert.deepEqual(doc.status.last_result,{at:last.at,outcome:'ok'});
  }
});

test('seed never writes into collected-sources or artifacts', async t=>{
  const before={c:await hashTree(join(repoRoot,'collected-sources')),a:await hashTree(join(repoRoot,'artifacts'))};
  const out=await tempRoot(t);
  const list=await buildSeedList({repoRoot,now:NOW});
  await writeWatchList({repoRoot:out},list);
  assert.deepEqual(await readWatchList({repoRoot:out}),list);
  const after={c:await hashTree(join(repoRoot,'collected-sources')),a:await hashTree(join(repoRoot,'artifacts'))};
  assert.deepEqual(after,before);
});

test('seed refuses a sidecar whose bytes do not match', async t=>{
  const root=await tempRoot(t);
  await copyRuns(root,[FULL_RUN]);
  const seeded=await buildSeedList({repoRoot:root,now:NOW});
  for(const d of seeded.documents)assert.equal(d.status.change_state,'watched_since',`${d.name}: one copy reads Watched since`);
  const page=join(root,'collected-sources',FULL_RUN,'rrc-resources.html'),bytes=await readFile(page);bytes[100]^=1;
  await writeFile(page,bytes);
  await assert.rejects(buildSeedList({repoRoot:root,now:NOW}),error=>{assert.equal(error.code,'WATCH_SEED_INVALID');assert.match(error.message,/rrc-resources/);return true;});
});

test('seed refuses sidecars that disagree on the address', async t=>{
  const root=await tempRoot(t);
  await copyRuns(root,['df804201-eb4a-4aa5-8ef2-c550c6a70627',FULL_RUN]);
  await buildSeedList({repoRoot:root,now:NOW});
  const sidecar=join(root,'collected-sources','df804201-eb4a-4aa5-8ef2-c550c6a70627','uic-manual.source.json');
  const meta=JSON.parse(await readFile(sidecar,'utf8'));
  await writeFile(sidecar,JSON.stringify({...meta,url:'https://www.rrc.texas.gov/media/other/uic_manual.pdf'}));
  await assert.rejects(buildSeedList({repoRoot:root,now:NOW}),error=>{assert.equal(error.code,'WATCH_SEED_INVALID');assert.match(error.message,/uic-manual/);return true;});
});

// watch-list.json is live data: every Check now, review, note, edit, stop or rewatch appends to it. What must stay
// true is that the seed is still inside it: the same seeded rows, each history starting with the seed's history.
test('committed watch-list.json is valid and still starts with a fresh seed (owner history only appended)', async ()=>{
  const committed=JSON.parse(await readFile(join(repoRoot,'watched-documents','watch-list.json'),'utf8'));
  assert.doesNotThrow(()=>validateWatchList(committed));
  const fresh=await buildSeedList({repoRoot,now:NOW});
  // A review fills a seeded change's review field in place; every other field of a seeded event never changes.
  const withoutReview=ev=>{const {review,...rest}=ev;return rest;};
  for(const seed of fresh.documents){
    const doc=committed.documents.find(item=>item.id===seed.id);
    assert.ok(doc,`seeded document ${seed.id} is in the committed list`);
    // An edit event may rename or re-kind a row; the latest edit wins, otherwise the seed's name and kind hold.
    const edit=doc.history.filter(ev=>ev.type==='edited').at(-1);
    assert.deepEqual({id:doc.id,url:doc.url,name:doc.name,kind:doc.kind,added_at:doc.added_at,added_via:doc.added_via},
      {id:seed.id,url:seed.url,name:edit?.name??seed.name,kind:edit?.kind??seed.kind,added_at:seed.added_at,added_via:seed.added_via});
    assert.ok(doc.history.length>=seed.history.length,`${seed.id} keeps its seed history`);
    assert.deepEqual(doc.history.slice(0,seed.history.length).map(withoutReview),seed.history.map(withoutReview),`${seed.id} history begins with the seed history`);
    for(const ev of doc.history.slice(seed.history.length))
      assert.ok(['note','edited','stopped','rewatched'].includes(ev.type)||(ev.source&&ev.source.type!=='collection'),`${seed.id}: an appended ${ev.type} event is owner history, not a collection`);
  }
});

// Final-review fix 5: seed-watch-list --force must never replace a list that holds owner history.
test('ownerHistory is null for a fresh seed and names the first owner history it finds on built lists', async ()=>{
  const seeded=await buildSeedList({repoRoot,now:NOW});
  assert.equal(ownerHistory(seeded),null,'a pure seed may be replaced with --force');
  const res=seeded.documents.find(d=>d.history.some(e=>e.type==='change'));
  const change=res.history.find(e=>e.type==='change');
  const swap=doc=>({...seeded,documents:seeded.documents.map(d=>d.id===doc.id?doc:d)});
  const reviewed=swap(markReviewed(res,{note:'',now:NOW}));
  assert.match(ownerHistory(reviewed),/review/);
  const noted=swap(addNote(markReviewed(res,{note:'ok',now:NOW}),{changeId:change.id,note:'n',now:NOW}));
  assert.ok(ownerHistory(noted));
  const checked=swap(applyOutcome(res,{type:'failed',at:NOW,reason:'timeout',http_status:null,source:{type:'check',check_id:'c1'}}));
  assert.match(ownerHistory(checked),/check/);
  assert.ok(ownerHistory(stopWatching(seeded,res.id,{now:NOW})),'a stop event has no collection source');
  const added=addDocument(seeded,{url:'https://www.rrc.texas.gov/media/x/new.pdf',name:'New',kind:'form'},{now:NOW,id:'cccccccccccc',via:'owner'});
  assert.match(ownerHistory(added),/added/);
});

test('seed-watch-list --force refuses a list with owner history and leaves it byte-identical', async t=>{
  const {spawnSync}=await import('node:child_process');
  const root=await tempRoot(t);
  // A minimal copy of the repo layout the script resolves from its own location.
  for(const file of ['scripts/seed-watch-list.mjs','src/watchSeed.mjs','src/watchStore.mjs','public/watch-list.js','public/html-text.js']){
    await mkdir(join(root,file,'..'),{recursive:true});await copyFile(join(repoRoot,file),join(root,file));
  }
  await copyFile(join(repoRoot,'package.json'),join(root,'package.json'));
  await copyRuns(root,[FULL_RUN]);
  const seeded=await buildSeedList({repoRoot:root,now:NOW});
  const run=()=>spawnSync(process.execPath,[join(root,'scripts','seed-watch-list.mjs'),'--force'],{encoding:'utf8'});
  await writeWatchList({repoRoot:root},seeded);
  const pure=run();
  assert.equal(pure.status,0,pure.stderr);
  const res=seeded.documents.find(d=>d.id===seeded.documents[1].id);
  const owned={...seeded,documents:seeded.documents.map(d=>d.id===res.id?applyOutcome(d,{type:'failed',at:NOW,reason:'timeout',http_status:null,source:{type:'check',check_id:'c1'}}):d)};
  await writeWatchList({repoRoot:root},owned);
  const file=join(root,'watched-documents','watch-list.json'),before=await readFile(file);
  const refused=run();
  assert.equal(refused.status,1);
  assert.match(refused.stderr,/owner history/);
  assert.doesNotMatch(refused.stderr,/at .*\.mjs:\d+/,'a plain message, no stack trace');
  assert.deepEqual(await readFile(file),before);
});
