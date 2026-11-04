// E12-lite (§3.1): one-off build step that writes watched-documents/watch-list.json from the copies already
// committed under collected-sources/. No network. Refuses to replace an existing list unless --force is given.
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSeedList} from '../src/watchSeed.mjs';
import {writeWatchList} from '../src/watchStore.mjs';

const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const target=resolve(repoRoot,'watched-documents','watch-list.json');
const force=process.argv.slice(2).includes('--force');

let present=true;
try{await access(target);}catch(error){if(error.code!=='ENOENT')throw error;present=false;}
if(present&&!force){
 console.error('watched-documents/watch-list.json already exists; pass --force to replace it with a fresh seed.');
 process.exit(1);
}
const list=await buildSeedList({repoRoot,now:new Date().toISOString()});
await writeWatchList({repoRoot},list);
for(const doc of list.documents)console.log(`${doc.status.change_state.padEnd(10)} ${String(doc.history.length).padStart(3)} copies  ${doc.name}`);
console.log(`Wrote watched-documents/watch-list.json (${list.documents.length} documents).`);
