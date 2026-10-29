import {resolve} from 'node:path';
import {collectPublicSnapshot} from '../src/acquisition.mjs';
import {repositoryRoot} from '../src/pipeline.mjs';
const [source,artifactId,...extra]=process.argv.slice(2);
if(!source||!artifactId||extra.length)throw Error('Supply NEW inputs and artifact ID: node scripts/acquire.mjs raw-refresh-YYYYMMDD rrc-YYYY-MM-DD-uic000020838-v2');
// Optional local Socrata app token; sent only as a data.texas.gov header, never recorded.
const appToken=process.env.SOCRATA_APP_TOKEN?.trim()||null;
try{const result=await collectPublicSnapshot({sourceDir:resolve(repositoryRoot,source),artifactId,appToken});console.log(JSON.stringify(result.record));}
catch(error){if(!error.record)throw error;console.log(JSON.stringify(error.record));if(error.record.status==='succeeded')console.error('Export completed, but its run record could not be saved. Invocation failed.');process.exitCode=1;}
