// Phase 6 (RRC-17, E06; D10; ADR 005): the producer half of evidence package v2. Every preserved
// version is packed with the same builder the download and the Analytics transfer use, then
// checked only from the members of that TAR: what a receiver sees is what is tested. Committed
// bytes are read only; nothing under artifacts/ is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildVersionArchive} from '../src/versionArchive.mjs';
import {parseVersionTar} from '../public/browser-library.js';
import {buildRelations} from '../src/relations.mjs';
const root=new URL('../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const decoder=new TextDecoder('utf-8',{fatal:true});
const V1_NORMALIZED_KEYS=['artifactId','dataDictionary','injectionMonthly','inventory','manifest','qualityReport','schemaVersion'];
const TRANSFORMATION={2:'rrc-odp-v2.0.0',3:'rrc-odp-v2.1.0',4:'rrc-odp-v2.2.0',5:'rrc-odp-v2.3.0'};
const MAX_TAR=80_106_496,MAX_DECLARED=100;
// The same discovery as the browser library test: the pinned legacy version plus every
// directory with version-pins.json. Names are discovered, never typed.
async function packages(){
 const integrity=JSON.parse(await readFile(new URL('public/artifact-integrity.json',root)));
 const list=[{pins:{...integrity,path:`/artifacts/${integrity.artifactId}/`,classification:'public_reported',defaultPinned:true},legacy:true}];
 for(const name of await readdir(new URL('artifacts/',root))){
  if(name===integrity.artifactId)continue;let bytes;
  try{bytes=await readFile(new URL(`artifacts/${name}/version-pins.json`,root));}catch{continue;}
  list.push({pins:{...JSON.parse(bytes),defaultPinned:false,publicationPinsSha256:sha(bytes)},legacy:false});
 }
 return Promise.all(list.map(async ({pins,legacy})=>{
  const tar=await buildVersionArchive({directory:new URL(`artifacts/${pins.artifactId}/`,root),pins});
  const files=parseVersionTar(tar),json=name=>JSON.parse(decoder.decode(files.get(name)));
  return {pins:{...pins,legacy},tar,files,json,manifest:json('manifest.json'),qv:json('manifest.json').scope?.query_version??1};
 }));
}
const all=await packages();
const byQv=qv=>all.filter(p=>p.qv===qv);

test('every package keeps the v1 contract: schema_version 1 and the seven normalized keys',()=>{
 assert.ok(all.length>=12);
 for(const {pins,manifest,json} of all){
  assert.equal(manifest.schema_version,1,pins.artifactId);
  const normalized=json('normalized.json');
  assert.deepEqual(Object.keys(normalized).sort(),V1_NORMALIZED_KEYS,pins.artifactId);
  assert.equal(normalized.schemaVersion,1,pins.artifactId);
  assert.equal(normalized.artifactId,manifest.artifact_id,pins.artifactId);
 }
});

test('every TAR member is declared, and every declared file is present with its hash and byte count',()=>{
 for(const {pins,tar,files,manifest} of all){
  const declared=new Map();
  for(const [name,entry] of [...Object.entries(manifest.files),...manifest.sources.map(s=>[s.raw_file,s])]){
   if(declared.has(name))assert.deepEqual(declared.get(name),{sha256:entry.sha256,bytes:entry.bytes},`${pins.artifactId} ${name} conflicting inventory`);
   declared.set(name,{sha256:entry.sha256,bytes:entry.bytes});
  }
  assert.ok(declared.size<=MAX_DECLARED,`${pins.artifactId} declares ${declared.size} files`);
  assert.ok(tar.length<=MAX_TAR,pins.artifactId);
  const allowed=new Set(['manifest.json','normalized.json',...declared.keys(),...(pins.legacy?[]:['version-pins.json'])]);
  assert.deepEqual([...files.keys()].sort(),[...allowed].sort(),`${pins.artifactId} members`);
  for(const [name,{sha256,bytes}] of declared){
   assert.equal(files.get(name).length,bytes,`${pins.artifactId} ${name} bytes`);
   assert.equal(sha(files.get(name)),sha256,`${pins.artifactId} ${name} sha256`);
  }
 }
});

test('query versions 3 to 5 carry their transformation version and their true query version in every sidecar',()=>{
 for(const qv of [3,4,5])assert.ok(byQv(qv).length,`no committed query version ${qv} package`);
 for(const {pins,qv,manifest,json} of all.filter(p=>p.qv>=2)){
  assert.equal(manifest.transformation_version,TRANSFORMATION[qv],pins.artifactId);
  assert.equal(json('sources/acquisition.json').scope.queryVersion,qv,pins.artifactId);
  if(qv>=3)assert.equal(json('tests.json').scope.query_version,qv,pins.artifactId);
  if(qv>=4)for(const name of ['casing.json','plugging.json'])assert.equal(json(name).scope.query_version,qv,`${pins.artifactId} ${name}`);
  if(qv>=5)assert.equal(json('evidence_relations.json').scope.query_version,qv,pins.artifactId);
  assert.equal(qv>=5,Object.hasOwn(manifest.files,'evidence_relations.json'),pins.artifactId);
 }
});

test('v5 differs from v4 only by the closed delta the receiver contract names',()=>{
 const v5=byQv(5),v4=byQv(4);
 assert.ok(v5.length&&v4.length);
 const shape=p=>{const acquisition=p.json('sources/acquisition.json');return {
  files:Object.keys(p.manifest.files),scope:Object.keys(p.manifest.scope),acquisitionScope:Object.keys(acquisition.scope),
  targets:acquisition.targets.length,sources:p.manifest.sources.map(s=>s.name),limitations:p.manifest.limitations,manifestKeys:Object.keys(p.manifest)};};
 for(const b of v5){
  const after=shape(b);
  for(const a of v4){
   const before=shape(a);
   assert.deepEqual(after.files,[...before.files,'evidence_relations.json'],b.pins.artifactId);
   assert.deepEqual(after.scope,before.scope);
   assert.deepEqual(after.acquisitionScope,before.acquisitionScope);
   assert.equal(after.targets,before.targets);
   assert.deepEqual(after.sources,before.sources);
   assert.deepEqual(after.manifestKeys,before.manifestKeys);
   assert.deepEqual(after.limitations.slice(0,-1),before.limitations);
   assert.match(after.limitations.at(-1),/^evidence_relations\.json lists typed relations derived at export/);
  }
 }
});

test('evidence_relations.json is re-derived byte for byte from the package members alone',()=>{
 const v5=byQv(5);assert.ok(v5.length);
 for(const {pins,files,manifest,json} of v5){
  const normalized=json('normalized.json'),tests=json('tests.json'),casing=json('casing.json'),plugging=json('plugging.json');
  const doc=buildRelations({artifactId:manifest.artifact_id,scope:json('sources/acquisition.json').scope,
   inventory:normalized.inventory,monthly:normalized.injectionMonthly,testRows:{bhp:tests.bhp,srt:tests.srt},
   wellboreRows:{casing:{link:casing.link,rows:casing.rows},plugging:{link:plugging.link,rows:plugging.rows}},sources:manifest.sources});
  const body=new TextEncoder().encode(JSON.stringify(doc,null,2)+'\n');
  assert.deepEqual(body,files.get('evidence_relations.json'),pins.artifactId);
  assert.equal(sha(body),manifest.files['evidence_relations.json'].sha256,pins.artifactId);
 }
});

test('the re-derivation fails closed on a relation file that contradicts the members',()=>{
 const [{files,manifest,json}]=byQv(5);
 const casing=json('casing.json'),tampered={...casing,rows:casing.rows.slice(1)};
 const normalized=json('normalized.json'),tests=json('tests.json'),plugging=json('plugging.json');
 const body=JSON.stringify(buildRelations({artifactId:manifest.artifact_id,scope:json('sources/acquisition.json').scope,
  inventory:normalized.inventory,monthly:normalized.injectionMonthly,testRows:{bhp:tests.bhp,srt:tests.srt},
  wellboreRows:{casing:{link:tampered.link,rows:tampered.rows},plugging:{link:plugging.link,rows:plugging.rows}},sources:manifest.sources}),null,2)+'\n';
 assert.notEqual(sha(new TextEncoder().encode(body)),sha(files.get('evidence_relations.json')));
});
