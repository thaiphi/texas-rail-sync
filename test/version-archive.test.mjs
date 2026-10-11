import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const archive=await import('../src/versionArchive.mjs').catch(()=>({}));
const root=new URL('../',import.meta.url),id='rrc-2026-10-09-uic000020838-v1',pins=JSON.parse(await readFile(new URL('public/artifact-integrity.json',root)));
function unpack(bytes){const files={};for(let offset=0;offset<bytes.length&&bytes[offset]!==0;){const header=bytes.subarray(offset,offset+512),name=header.subarray(0,100).toString().split('\0')[0],size=parseInt(header.subarray(124,136).toString().replaceAll('\0','').trim(),8);files[name]=bytes.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;}return files;}
test('whole-version archive contains every original contract and source file with verified bytes',async()=>{
 assert.equal(typeof archive.buildVersionArchive,'function','whole version archive required');
 const bytes=await archive.buildVersionArchive({directory:new URL(`artifacts/${id}/`,root),pins:{...pins,classification:'public_reported',defaultPinned:true}}),files=unpack(bytes);
 assert.equal(Object.keys(files).length,13);for(const [name,body] of Object.entries(files))assert.deepEqual(body,await readFile(new URL(`artifacts/${id}/${name}`,root)),name);
 assert.ok(files['sources/uic-manual.pdf']);assert.ok(files['normalized.json']);assert.ok(files['manifest.json']);
});
test('archive refuses tampered evidence and fixture classification',async t=>{
 assert.equal(typeof archive.buildVersionArchive,'function');await mkdir(new URL('tmp/',root),{recursive:true});const dir=await mkdtemp(new URL('tmp/archive-',root));t.after(()=>rm(dir,{recursive:true,force:true}));await cp(new URL(`artifacts/${id}/`,root),dir,{recursive:true});
 await writeFile(resolve(dir,'sources/uic-manual.pdf'),'tampered');await assert.rejects(archive.buildVersionArchive({directory:dir,pins:{...pins,classification:'public_reported',defaultPinned:true}}),/hash|evidence/i);
 await assert.rejects(archive.buildVersionArchive({directory:dir,pins:{...pins,classification:'test_fixture'}}),/public|fixture/i);
});
