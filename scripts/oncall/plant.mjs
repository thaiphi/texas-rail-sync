// ZC-07 (issue #43): the on-call demo's planted bug. THIS FILE IS THE DEMO'S ANSWER KEY: the on-call agent is
// forbidden to read it. It lowers both source byte caps in src/sourceFetch.mjs from 10_000_000 to 1_000_000, so a
// real source (the ~1.08 MB UIC manual) trips SOURCE_LIMIT at the load stage and the ZC-06 alert fires.
// It refuses to plant unless the target still holds exactly two caps, so a drifted target fails loudly.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const PLANT_TARGET='src/sourceFetch.mjs';
export const PLANT_COMMIT_MESSAGE='Tighten source download cap';
const CAP='10_000_000',PLANTED='1_000_000';

export function plantBug(source){
 const found=source.split(CAP).length-1;
 if(found!==2)throw Error(`${PLANT_TARGET}: expected exactly 2 occurrences of ${CAP}, found ${found}`);
 return source.replaceAll(CAP,PLANTED);
}

export async function plantInto(dir){
 const file=join(dir,...PLANT_TARGET.split('/'));
 await writeFile(file,plantBug(await readFile(file,'utf8')));
}
