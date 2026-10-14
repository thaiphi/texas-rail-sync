// Shared archive contract for filesystem and remote, verified byte readers.
const failure=message=>Object.assign(Error(message),{code:'ARCHIVE_INVALID'});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export async function buildVersionArchiveFromReader({read:sourceRead,pins}){
 if(pins?.classification!=='public_reported')throw failure('Whole-version archive requires public provenance; fixtures refused');
 if(!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(pins.artifactId))throw failure('Invalid version identity');
 let total=0;
 async function read(name){
  if(typeof name!=='string'||name.length>100||!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw failure('Unsafe archive evidence path');
  const body=await sourceRead(name);
  if(!(body instanceof Uint8Array)||body.length>10_000_000||total+body.length>80_000_000)throw failure('Archive evidence byte cap or type invalid');
  total+=body.length;return new Uint8Array(body);
 }
 const manifestBytes=await read('manifest.json'),normalizedBytes=await read('normalized.json');
 if(await hash(manifestBytes)!==pins.manifestSha256||await hash(normalizedBytes)!==pins.normalizedSha256)throw failure('Version publication hash mismatch');
 const manifest=JSON.parse(decoder.decode(manifestBytes)),normalized=JSON.parse(decoder.decode(normalizedBytes));
 if(manifest.artifact_id!==pins.artifactId||normalized.artifactId!==pins.artifactId||JSON.stringify(normalized.manifest)!==JSON.stringify(manifest)||manifest.testFixture===true||manifest.provenance?.classification==='test_fixture'||(!pins.defaultPinned&&manifest.provenance?.classification!=='public_reported'))throw failure('Version identity or public provenance invalid');
 const expected=new Map(Object.entries(manifest.files??{}));
 for(const source of manifest.sources??[]){const previous=expected.get(source.raw_file);if(previous&&previous.sha256!==source.sha256)throw failure('Source hash inventories conflict');expected.set(source.raw_file,{sha256:source.sha256,bytes:source.bytes});}
 if(expected.size>100)throw failure('Archive file cap exceeded');
 const files=new Map([['manifest.json',manifestBytes],['normalized.json',normalizedBytes]]);
 for(const [name,entry] of expected){const body=await read(name);if(await hash(body)!==entry.sha256||body.length!==entry.bytes)throw failure('Archive evidence hash or byte count mismatch');files.set(name,body);}
 if(!pins.defaultPinned){const body=await read('version-pins.json');if(!pins.publicationPinsSha256||await hash(body)!==pins.publicationPinsSha256)throw failure('Publication pins evidence hash mismatch');files.set('version-pins.json',body);}
 const chunks=[];let length=1024;
 for(const [name,body] of [...files].sort(([a],[b])=>a.localeCompare(b))){
  const header=new Uint8Array(512),octal=(value,width)=>value.toString(8).padStart(width-1,'0')+'\0',write=(text,offset)=>header.set(encoder.encode(text),offset);
  write(name,0);write(octal(0o644,8),100);write(octal(0,8),108);write(octal(0,8),116);write(octal(body.length,12),124);write(octal(0,12),136);header.fill(32,148,156);header[156]=48;write('ustar\0',257);write('00',263);write(octal(header.reduce((sum,byte)=>sum+byte,0),7)+' ',148);
  const padding=new Uint8Array((512-body.length%512)%512);chunks.push(header,body,padding);length+=512+body.length+padding.length;
 }
 const archive=new Uint8Array(length);let offset=0;for(const chunk of chunks){archive.set(chunk,offset);offset+=chunk.length;}return archive;
}
