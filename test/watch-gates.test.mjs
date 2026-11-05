// E12-lite Task 8: scope gates for watched documents (RRC-18; spec §2, §10.7, §10.8).
// Static scans of the repository plus one seed + fixture check run in temp roots; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSeedList,SEED_RUN_IDS} from '../src/watchSeed.mjs';
import {writeWatchList,readWatchList} from '../src/watchStore.mjs';
import {checkWatchedDocuments} from '../src/watchCheck.mjs';
import {emptyWatchList,addDocument} from '../public/watch-list.js';

const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const posix=path=>path.split(sep).join('/');

// The dependency names of package.json at fc8563f (the E12-lite baseline). jsdom is a pre-existing
// devDependency of the app scaffold and stays allowed there only.
const BASELINE_DEPENDENCIES=Object.freeze(['@hookform/resolvers','@radix-ui/react-accordion','@radix-ui/react-alert-dialog','@radix-ui/react-aspect-ratio','@radix-ui/react-avatar','@radix-ui/react-checkbox','@radix-ui/react-collapsible','@radix-ui/react-context-menu','@radix-ui/react-dialog','@radix-ui/react-dropdown-menu','@radix-ui/react-hover-card','@radix-ui/react-label','@radix-ui/react-menubar','@radix-ui/react-navigation-menu','@radix-ui/react-popover','@radix-ui/react-progress','@radix-ui/react-radio-group','@radix-ui/react-scroll-area','@radix-ui/react-select','@radix-ui/react-separator','@radix-ui/react-slider','@radix-ui/react-slot','@radix-ui/react-switch','@radix-ui/react-tabs','@radix-ui/react-toggle','@radix-ui/react-toggle-group','@radix-ui/react-tooltip','@tailwindcss/vite','@tanstack/react-query','@tanstack/react-router','@tanstack/react-start','@tanstack/router-plugin','class-variance-authority','clsx','cmdk','date-fns','embla-carousel-react','input-otp','lucide-react','react','react-day-picker','react-dom','react-hook-form','react-resizable-panels','recharts','sonner','tailwind-merge','tailwindcss','tw-animate-css','vaul','vite-tsconfig-paths','zod']);
const BASELINE_DEV_DEPENDENCIES=Object.freeze(['@eslint/js','@lovable.dev/vite-tanstack-config','@testing-library/jest-dom','@testing-library/react','@types/node','@types/react','@types/react-dom','@vitejs/plugin-react','eslint','eslint-config-prettier','eslint-plugin-prettier','eslint-plugin-react-hooks','eslint-plugin-react-refresh','globals','jsdom','nitro','prettier','typescript','typescript-eslint','vite','vitest']);

const WATCH_MODULES=Object.freeze(['public/watch-list.js','public/html-text.js','public/watch-view.js','public/page-links.js','src/watchStore.mjs','src/watchSeed.mjs','src/watchCheck.mjs','scripts/seed-watch-list.mjs']);
const FORBIDDEN_IMPORT=/pdf|ocr|tesseract|diff|cheerio|jsdom|parse5|htmlparser/i;
const SOURCE_FILE=/\.(?:m?js|cjs|tsx?)$/;

// Static `import … from '…'`, side-effect `import '…'`, `export … from '…'`, dynamic `import('…')` and `require('…')`.
const SPECIFIER=/\bfrom\s*(['"])([^'"]+)\1|\bimport\s*(['"])([^'"]+)\3|\bimport\s*\(\s*(['"])([^'"]+)\5\s*\)|\brequire\s*\(\s*(['"])([^'"]+)\7\s*\)/g;
const specifiersOf=text=>[...text.matchAll(SPECIFIER)].map(m=>m[2]??m[4]??m[6]??m[8]);

async function sourceFiles(dir){
  const out=[];
  for(const entry of await readdir(join(repoRoot,dir),{recursive:true,withFileTypes:true})){
    if(entry.isFile()&&SOURCE_FILE.test(entry.name))out.push(join(entry.parentPath??entry.path,entry.name));
  }
  return out;
}

test('no new dependency and no PDF/OCR/diff/HTML-parser import', async()=>{
  const pkg=JSON.parse(await readFile(join(repoRoot,'package.json'),'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies??{}).sort(),[...BASELINE_DEPENDENCIES]);
  assert.deepEqual(Object.keys(pkg.devDependencies??{}).sort(),[...BASELINE_DEV_DEPENDENCIES]);
  assert.equal(pkg.optionalDependencies,undefined);assert.equal(pkg.peerDependencies,undefined);
  const files=[...await sourceFiles('src'),...await sourceFiles('public'),...await sourceFiles('scripts')];
  assert.ok(files.length>50,'the scan reads the real source trees');
  const hits=[];
  for(const file of files)for(const spec of specifiersOf(await readFile(file,'utf8')))if(FORBIDDEN_IMPORT.test(spec))hits.push(`${posix(relative(repoRoot,file))}: ${spec}`);
  assert.deepEqual(hits,[]);
});

test('watch modules import nothing outside node: builtins and repo-relative files', async()=>{
  for(const module of WATCH_MODULES){
    const file=join(repoRoot,module),specs=specifiersOf(await readFile(file,'utf8'));
    assert.ok(module==='public/watch-list.js'||module==='public/html-text.js'||specs.length>0,`${module} has imports to check`);
    for(const spec of specs){
      if(spec.startsWith('node:'))continue;
      assert.ok(spec.startsWith('./')||spec.startsWith('../'),`${module} imports ${spec}`);
      const target=resolve(dirname(file),spec);
      assert.ok(target.startsWith(repoRoot),`${module} imports ${spec} from outside the repository`);
      assert.ok(!posix(relative(repoRoot,target)).split('/').includes('node_modules'),`${module} imports ${spec} from node_modules`);
      await access(target);
    }
  }
});

test('no scheduler: watch modules contain no setInterval/cron/schtasks', async()=>{
  const withTimeout=[];
  for(const module of WATCH_MODULES){
    const text=await readFile(join(repoRoot,module),'utf8');
    assert.doesNotMatch(text,/\bsetInterval\b|\bcron\b|\bschtasks\b|\bsetImmediate\b/i,module);
    if(/\bsetTimeout\b/.test(text))withTimeout.push(module);
  }
  // The only timer is watchStore's `pause`: a bounded local retry (5 tries, 50 ms apart) of a rename that a
  // Windows scanner holds. It never touches the network. app.js's 1000 ms status polling is outside these modules.
  assert.deepEqual(withTimeout,['src/watchStore.mjs']);
  const store=await readFile(join(repoRoot,'src/watchStore.mjs'),'utf8');
  assert.equal(store.match(/\bsetTimeout\b/g).length,1);
  assert.match(store,/const pause=ms=>new Promise\(done=>setTimeout\(done,ms\)\);/);
});

async function hashTree(dir){
  const out={};
  for(const entry of await readdir(join(repoRoot,dir),{recursive:true,withFileTypes:true})){
    if(!entry.isFile())continue;
    const full=join(entry.parentPath??entry.path,entry.name);
    out[posix(relative(repoRoot,full))]=sha(await readFile(full));
  }
  return out;
}
const manifest=async()=>({artifacts:await hashTree('artifacts'),'collected-sources':await hashTree('collected-sources'),
  'watched-documents/watch-list.json':sha(await readFile(join(repoRoot,'watched-documents','watch-list.json')))});

test('artifacts/ and collected-sources/ hashes unchanged by a seed and a fixture check', async t=>{
  const before=await manifest();
  assert.ok(Object.keys(before.artifacts).length>0&&Object.keys(before['collected-sources']).length>0);
  const realFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('the gate run must make no network request');};
  t.after(()=>{globalThis.fetch=realFetch;});

  // Seed: reads the real collected-sources, writes only to a temp root.
  const seedRoot=await mkdtemp(join(tmpdir(),'trrc-watch-gates-seed-'));t.after(()=>rm(seedRoot,{recursive:true,force:true}));
  const seeded=await buildSeedList({repoRoot,now:'2026-11-04T00:00:00.000Z',runIds:SEED_RUN_IDS});
  assert.equal(seeded.documents.length,8);
  await writeWatchList({repoRoot:seedRoot},seeded);
  assert.deepEqual(await readWatchList({repoRoot:seedRoot}),seeded);

  // Fixture check: injected fetch against a temp root.
  const checkRoot=await mkdtemp(join(tmpdir(),'trrc-watch-gates-check-'));t.after(()=>rm(checkRoot,{recursive:true,force:true}));
  const PAGE='https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/';
  const PDF='https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf';
  let list=emptyWatchList();
  list=addDocument(list,{url:PAGE,name:'Injection-Storage Resources',kind:'announcements'},{now:'2026-11-04T00:00:00.000Z',id:'aaaaaaaaaaaa',via:'owner'});
  list=addDocument(list,{url:PDF,name:'UIC manual (UIA010)',kind:'manual'},{now:'2026-11-04T00:00:00.000Z',id:'bbbbbbbbbbbb',via:'owner'});
  await writeWatchList({repoRoot:checkRoot},list);
  const bodies={[PAGE]:Buffer.from('<html><body><p>Rule 3.15</p></body></html>'),[PDF]:Buffer.from('%PDF-1.7\nfixture\n')};
  const fetchImpl=async url=>new Response(bodies[url],{status:200});
  const {record}=await checkWatchedDocuments({repoRoot:checkRoot,fetchImpl,testFixture:true,checkId:'gate-check',now:()=>'2026-11-04T00:00:01.000Z'});
  assert.deepEqual(record.results.map(r=>r.outcome),['baseline','baseline']);

  assert.deepEqual(await manifest(),before);
});
