import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildVersionArchiveFromReader} from '../src/archiveBytes.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=JSON.parse(await readFile(new URL('../public/artifact-integrity.json',import.meta.url)));
const pins={...pinned,classification:'public_reported',defaultPinned:true};
const directory=new URL('../artifacts/'+pins.artifactId+'/',import.meta.url);
const read=name=>readFile(new URL(name,directory));
test('hosted reader produces complete compatible USTAR with exact preserved source bytes',async()=>{
 const tar=await buildVersionArchiveFromReader({read,pins}),files=new Map();
 let offset=0;
 while(tar[offset]){
  const header=tar.slice(offset,offset+512),name=Buffer.from(header.slice(0,100)).toString().split('\0')[0];
  const size=parseInt(Buffer.from(header.slice(124,136)).toString().split('\0')[0],8);
  const checksum=parseInt(Buffer.from(header.slice(148,156)).toString().trim(),8);
  assert.equal(Buffer.from(header.slice(257,263)).toString(),'ustar\0');
  header.fill(32,148,156);assert.equal(header.reduce((sum,byte)=>sum+byte,0),checksum);
  const bytes=tar.slice(offset+512,offset+512+size);assert.equal(hash(bytes),hash(await read(name)));files.set(name,bytes);
  offset+=512+Math.ceil(size/512)*512;
 }
 assert.equal(files.size,13);assert.ok(files.has('sources/uic-manual.pdf'));assert.ok(files.has('inventory.csv'));
 assert.equal(tar.length-offset,1024);assert.ok(tar.slice(offset).every(byte=>byte===0));
});
test('hosted export rejects changed bytes, substituted pins, fixtures and escaping evidence paths',async()=>{
 await assert.rejects(buildVersionArchiveFromReader({read:async name=>name==='inventory.csv'?new Uint8Array([0]):read(name),pins}),/hash|byte/i);
 await assert.rejects(buildVersionArchiveFromReader({read,pins:{...pins,manifestSha256:'0'.repeat(64)}}),/hash/i);
 await assert.rejects(buildVersionArchiveFromReader({read,pins:{...pins,classification:'test_fixture'}}),/provenance|fixture/i);
 const manifest=JSON.parse(await read('manifest.json'));manifest.files['../secret']={sha256:'0'.repeat(64),bytes:1};
 const normalized=JSON.parse(await read('normalized.json'));normalized.manifest=manifest;
 const m=Buffer.from(JSON.stringify(manifest)),n=Buffer.from(JSON.stringify(normalized));let escaped=false;
 await assert.rejects(buildVersionArchiveFromReader({pins:{...pins,manifestSha256:hash(m),normalizedSha256:hash(n)},read:async name=>{if(name==='manifest.json')return m;if(name==='normalized.json')return n;if(name.startsWith('..'))escaped=true;return read(name);}}),/path/i);
 assert.equal(escaped,false);
});
