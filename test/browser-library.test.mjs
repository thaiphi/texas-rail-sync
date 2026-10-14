import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildVersionArchive} from '../src/versionArchive.mjs';
import {buildVersionArchiveFromReader as serverBuilder} from '../src/archiveBytes.mjs';
const library=await import('../public/browser-library.js').catch(()=>({}));
const shared=await import('../public/archive-bytes.js').catch(()=>({}));
const root=new URL('../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function versions(){
 const integrity=JSON.parse(await readFile(new URL('public/artifact-integrity.json',root))),list=[{...integrity,path:`/artifacts/${integrity.artifactId}/`,classification:'public_reported',defaultPinned:true}];
 for(const name of await readdir(new URL('artifacts/',root))){if(name===integrity.artifactId)continue;let bytes;try{bytes=await readFile(new URL(`artifacts/${name}/version-pins.json`,root));}catch{continue;}list.push({...JSON.parse(bytes),defaultPinned:false,publicationPinsSha256:sha(bytes)});}
 return Promise.all(list.map(async pins=>({pins,tar:await buildVersionArchive({directory:new URL(`artifacts/${pins.artifactId}/`,root),pins})})));
}
const refused=error=>error.code==='ARCHIVE_INVALID'||/provenance|fixture|hash|identity/i.test(error.message);
function entry(name,body){
 const header=new Uint8Array(512),encoder=new TextEncoder(),octal=(value,width)=>value.toString(8).padStart(width-1,'0')+'\0',write=(text,offset)=>header.set(encoder.encode(text),offset);
 write(name,0);write(octal(0o644,8),100);write(octal(0,8),108);write(octal(0,8),116);write(octal(body.length,12),124);write(octal(0,12),136);header.fill(32,148,156);header[156]=48;write('ustar\0',257);write('00',263);write(octal(header.reduce((sum,byte)=>sum+byte,0),7)+' ',148);
 return Buffer.concat([header,body,new Uint8Array((512-body.length%512)%512)]);
}
test('browser library and shared archive builder modules exist; server re-exports the browser builder',()=>{
 for(const name of ['parseVersionTar','verifyVersionPackage','saveVerifiedPackage','listSavedPackages'])assert.equal(typeof library[name],'function',name);
 assert.equal(serverBuilder,shared.buildVersionArchiveFromReader);
});
test('all preserved versions round-trip byte-identically through the strict parser and canonical rebuild',async()=>{
 const all=await versions();assert.ok(all.length>=3);
 for(const {pins,tar} of all){const verified=await library.verifyVersionPackage({tarBytes:tar,pins});
  assert.equal(verified.tarSha256,sha(tar));assert.equal(verified.artifact.artifactId,pins.artifactId);assert.ok(verified.files.has('manifest.json'));assert.deepEqual(Buffer.from(verified.tarBytes),Buffer.from(tar));}
});
test('changed, truncated, trailing, duplicate, unsafe, link, oversize and wrong-pin packages are refused',async()=>{
 const all=await versions(),{pins,tar}=all.find(item=>!item.pins.defaultPinned),other=all.find(item=>item.pins.artifactId!==pins.artifactId);
 const cases=[];
 const flipped=Buffer.from(tar);flipped[600]^=1;cases.push(flipped);
 cases.push(Buffer.concat([tar,new Uint8Array(512)]),Buffer.from(tar).subarray(0,tar.length-512));
 const checksum=Buffer.from(tar);checksum[148]=checksum[148]===48?49:48;cases.push(checksum);
 const link=Buffer.from(tar);link[156]=50;cases.push(link);
 const first=Buffer.from(tar).subarray(0,512+Math.ceil(parseInt(Buffer.from(tar).subarray(124,135).toString(),8)/512)*512);cases.push(Buffer.concat([first,Buffer.from(tar)]));
 cases.push(Buffer.concat([entry('../escape.json',Buffer.from('{}')),new Uint8Array(1024)]),new Uint8Array(80_106_496+512));
 for(const bytes of cases)await assert.rejects(library.verifyVersionPackage({tarBytes:bytes,pins}),refused);
 await assert.rejects(library.verifyVersionPackage({tarBytes:tar,pins:other.pins}),refused);
 await assert.rejects(library.verifyVersionPackage({tarBytes:tar,pins:{...pins,classification:'test_fixture'}}),refused);
});
test('verification owns its bytes: caller and returned buffers cannot alter stored package bytes',async()=>{
 const {pins,tar}=(await versions()).find(item=>!item.pins.defaultPinned),input=new Uint8Array(tar);
 const pending=library.verifyVersionPackage({tarBytes:input,pins});input.fill(0);
 const verified=await pending;assert.equal(verified.tarSha256,sha(tar));
 verified.files.get('manifest.json').fill(0);const again=await library.verifyVersionPackage({tarBytes:verified.tarBytes,pins});assert.equal(again.tarSha256,sha(tar));
});
test('Node Buffer views over larger backing memory verify and stay owned after the source changes',async()=>{
 const {pins,tar}=(await versions()).find(item=>!item.pins.defaultPinned);
 const backing=Buffer.concat([Buffer.alloc(512,7),Buffer.from(tar),Buffer.alloc(512,9)]),view=backing.subarray(512,512+tar.length);
 const pending=library.verifyVersionPackage({tarBytes:view,pins});backing.fill(0);
 const verified=await pending;assert.equal(verified.tarSha256,sha(tar));assert.equal(verified.tarBytes.buffer.byteLength,tar.length);
 const manifest=verified.files.get('manifest.json');assert.equal(manifest.buffer.byteLength,manifest.length);
 for(const {pins:other,tar:bytes} of await versions())assert.equal((await library.verifyVersionPackage({tarBytes:Buffer.from(bytes),pins:other})).tarSha256,sha(bytes));
});
test('exact 100-character entry names accepted by the builder parse, while links and duplicates are refused',()=>{
 const name='a'.repeat(95)+'.json',body=Buffer.from('{}'),tar=Buffer.concat([entry(name,body),new Uint8Array(1024)]);
 const files=library.parseVersionTar(tar);assert.deepEqual([...files.keys()],[name]);assert.deepEqual(Buffer.from(files.get(name)),body);
 const link=Buffer.from(tar);link[156]=50;assert.throws(()=>library.parseVersionTar(link),refused);
 assert.throws(()=>library.parseVersionTar(Buffer.concat([entry(name,body),entry(name,body),new Uint8Array(1024)])),refused);
 // A 101-character input cannot be represented in this fixed 100-byte name field:
 // the test encoder's mode write replaces its last character. Test an actual
 // invalid boundary path instead of expecting rejection of valid encoded bytes.
 assert.throws(()=>library.parseVersionTar(Buffer.concat([entry('a'.repeat(99)+'/',body),new Uint8Array(1024)])),refused);
});
test('saving without browser storage fails closed before any write',async()=>{
 const {pins,tar}=(await versions()).find(item=>!item.pins.defaultPinned);
 await assert.rejects(library.saveVerifiedPackage({tarBytes:tar,pins},{indexedDB:null}),error=>error.code==='SAVE_UNAVAILABLE');
});
