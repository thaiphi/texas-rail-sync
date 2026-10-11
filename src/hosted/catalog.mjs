import {workflowView} from '../../public/workflow.js';
import {archiveSha256} from './archive-store.mjs';
const artifactPattern=/^[a-z0-9][a-z0-9._-]{0,127}$/i,runPattern=/^[a-f0-9-]{36}$/i,hashPattern=/^[a-f0-9]{64}$/i;
const unavailable=()=>Object.assign(Error('Archived catalog evidence unavailable'),{code:'CATALOG_INVALID'});
const decode=new TextDecoder('utf-8',{fatal:true});

// These read-only methods carry no selected run/version state. Publication and
// run history remain independent, as in the local server's existing API.
export function createHostedCatalog({store}={}){
 if(!store||typeof store.read!=='function'||typeof store.list!=='function')throw unavailable();
 const readJson=async path=>JSON.parse(decode.decode(await store.read(path)));
 function runEntries(){return [...new Set(store.list('runs/').map(path=>path.slice(5).split('/')[0]))].sort();}
 async function readRun(id){
  if(typeof id!=='string'||!runPattern.test(id))throw unavailable();
  const record=await readJson(`runs/${id}/record.json`);workflowView(record);
  if(record.testFixture||record.runId!==id)throw unavailable();
  return record;
 }
 async function listRuns(){
  const runs=[];let unavailableRecords=0;
  for(const id of runEntries())try{
   const record=await readRun(id);
   runs.push({runId:record.runId,startedAt:record.startedAt,endedAt:record.endedAt,mode:record.mode,status:record.status,testFixture:false,artifactId:record.events.find(event=>event.stage==='export'&&event.status==='succeeded')?.evidence.artifactId??null});
  }catch{unavailableRecords++;}
  runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.runId.localeCompare(a.runId));
  return {schemaVersion:1,runs,unavailableRecords};
 }
 async function verifyPins(pins,defaultPinned){
  if(!pins||!artifactPattern.test(pins.artifactId)||typeof pins.artifactId!=='string'||!hashPattern.test(pins.manifestSha256)||typeof pins.manifestSha256!=='string'||!hashPattern.test(pins.normalizedSha256)||typeof pins.normalizedSha256!=='string'||pins.path!==`/artifacts/${pins.artifactId}/`||pins.classification!=='public_reported')throw unavailable();
  const prefix=`artifacts/${pins.artifactId}/`,manifestBytes=await store.read(prefix+'manifest.json'),normalizedBytes=await store.read(prefix+'normalized.json');
  if(await archiveSha256(manifestBytes)!==pins.manifestSha256||await archiveSha256(normalizedBytes)!==pins.normalizedSha256)throw unavailable();
  const manifest=JSON.parse(decode.decode(manifestBytes)),normalized=JSON.parse(decode.decode(normalizedBytes));
  if(manifest.artifact_id!==pins.artifactId||normalized.artifactId!==pins.artifactId||JSON.stringify(normalized.manifest)!==JSON.stringify(manifest)||manifest.testFixture===true||(manifest.provenance&&manifest.provenance.classification!=='public_reported')||(!defaultPinned&&manifest.provenance?.classification!=='public_reported'))throw unavailable();
 }
 async function listVersions(){
  const original=await readJson('public/artifact-integrity.json'),pathPin=await readJson('public/artifact-path.json');
  if(pathPin.artifact_id!==original.artifactId||pathPin.path!==`/artifacts/${original.artifactId}/`||(original.classification!==undefined&&original.classification!=='public_reported'))throw unavailable();
  const pinned={...original,path:pathPin.path,classification:'public_reported',realHistoryStatus:'verified_bounded_linkage',defaultPinned:true};
  await verifyPins(pinned,true);
  const versions=[pinned],seen=new Set([pinned.artifactId]);
  for(const id of runEntries())try{
   const record=await readRun(id);if(record.status!=='succeeded'||record.provenance?.classification!=='public_reported')continue;
   const evidence=record.events.find(event=>event.stage==='export'&&event.status==='succeeded')?.evidence,artifactId=evidence?.artifactId;
   if(typeof artifactId!=='string'||!artifactPattern.test(artifactId)||seen.has(artifactId))continue;
   const output=evidence.outputs.find(item=>item.path.endsWith(`/${artifactId}/version-pins.json`));if(!output)continue;
   const bytes=await store.read(`artifacts/${artifactId}/version-pins.json`);if(await archiveSha256(bytes)!==output.sha256)continue;
   const pins=JSON.parse(decode.decode(bytes));if(pins.artifactId!==artifactId)continue;
   await verifyPins(pins,false);
   versions.push({...pins,publicationPinsSha256:output.sha256,runId:record.runId,startedAt:record.startedAt,defaultPinned:false});seen.add(artifactId);
  }catch{/* Match local catalog: unavailable/fixture evidence is not published. */}
  return versions;
 }
 return Object.freeze({readRun,listRuns,listVersions});
}
