import {resolve} from 'node:path';
import {exportArtifact,repositoryRoot} from '../src/pipeline.mjs';
const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing ${flag} value`);return args[i+1];};
const flags=new Set(['--offline-replay','--source-dir','--artifact-id','--output-root','--expected-manifest-sha256']);
for(let i=0;i<args.length;i++){if(!flags.has(args[i]))throw Error('Unknown export argument');if(args[i]!=='--offline-replay')i++;}
const sourceDir=value('--source-dir'),artifactId=value('--artifact-id'),outputRoot=value('--output-root'),pin=value('--expected-manifest-sha256');
if(pin&&!/^[a-f0-9]{64}$/i.test(pin))throw Error('Expected a 64-character SHA256 pin');
try{
 const result=await exportArtifact({...(sourceDir?{sourceDir:resolve(repositoryRoot,sourceDir)}:{}),...(artifactId?{artifactId}:{}),...(outputRoot?{outputRoot:resolve(repositoryRoot,outputRoot)}:{}),expectedManifestSha256:pin,mode:artifactId&&!args.includes('--offline-replay')?'offline_export':'offline_replay'});
 console.log(JSON.stringify(result.record));
}catch(error){if(!error.record)throw error;console.log(JSON.stringify(error.record));if(error.record.status==='succeeded')console.error('Export completed, but its run record could not be saved. Invocation failed.');process.exitCode=1;}
