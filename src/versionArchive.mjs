import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './normalize.mjs';
const failure=message=>Object.assign(Error(message),{code:'ARCHIVE_INVALID'});
export async function buildVersionArchive({directory,pins}){
 if(pins?.classification!=='public_reported')throw failure('Whole-version archive requires public provenance; fixtures refused');
 if(!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(pins.artifactId))throw failure('Invalid version identity');
 directory=resolve(directory instanceof URL?fileURLToPath(directory):directory);if((await lstat(directory)).isSymbolicLink())throw failure('Linked version directory refused');const root=await realpath(directory);
 let total=0;
 async function read(name){
  if(typeof name!=='string'||name.length>100||!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw failure('Unsafe archive evidence path');
  let current=directory;for(const part of name.split('/')){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())throw failure('Linked archive evidence refused');}
  if(!(await realpath(current)).startsWith(root+sep))throw failure('Archive evidence escapes version');
  const info=await lstat(current);if(!info.isFile()||info.size>10_000_000||total+info.size>80_000_000)throw failure('Archive evidence byte cap exceeded');
  const body=await readFile(current);total+=body.length;return body;
 }
 const manifestBytes=await read('manifest.json'),normalizedBytes=await read('normalized.json');
 if(sha256(manifestBytes)!==pins.manifestSha256||sha256(normalizedBytes)!==pins.normalizedSha256)throw failure('Version publication hash mismatch');
 const manifest=JSON.parse(manifestBytes),normalized=JSON.parse(normalizedBytes);
 if(manifest.artifact_id!==pins.artifactId||normalized.artifactId!==pins.artifactId||JSON.stringify(normalized.manifest)!==JSON.stringify(manifest)||manifest.testFixture===true||manifest.provenance?.classification==='test_fixture'||(!pins.defaultPinned&&manifest.provenance?.classification!=='public_reported'))throw failure('Version identity or public provenance invalid');
 const expected=new Map(Object.entries(manifest.files??{}).map(([name,entry])=>[name,entry]));
 for(const source of manifest.sources??[]){const previous=expected.get(source.raw_file);if(previous&&previous.sha256!==source.sha256)throw failure('Source hash inventories conflict');expected.set(source.raw_file,{sha256:source.sha256,bytes:source.bytes});}
 if(expected.size>100)throw failure('Archive file cap exceeded');const files={'manifest.json':manifestBytes,'normalized.json':normalizedBytes};
 for(const [name,entry] of expected){const body=await read(name);if(sha256(body)!==entry.sha256||body.length!==entry.bytes)throw failure('Archive evidence hash or byte count mismatch');files[name]=body;}
 if(!pins.defaultPinned){const body=await read('version-pins.json');if(!pins.publicationPinsSha256||sha256(body)!==pins.publicationPinsSha256)throw failure('Publication pins evidence hash mismatch');files['version-pins.json']=body;}
 const chunks=[];for(const [name,body] of Object.entries(files).sort(([a],[b])=>a.localeCompare(b))){
  const header=Buffer.alloc(512),octal=(value,width)=>value.toString(8).padStart(width-1,'0')+'\0';header.write(name,0,100,'utf8');header.write(octal(0o644,8),100);header.write(octal(0,8),108);header.write(octal(0,8),116);header.write(octal(body.length,12),124);header.write(octal(0,12),136);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257);header.write('00',263);header.write(octal(header.reduce((sum,value)=>sum+value,0),7)+' ',148);chunks.push(header,body,Buffer.alloc((512-body.length%512)%512));
 }
 chunks.push(Buffer.alloc(1024));return Buffer.concat(chunks);
}
