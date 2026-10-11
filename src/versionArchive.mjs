import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildVersionArchiveFromReader} from './archiveBytes.mjs';
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
 return Buffer.from(await buildVersionArchiveFromReader({read,pins}));
}
