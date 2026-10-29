import {acquisitionTargets,collectionScope,sourceScopeFlags,targetsForScope,isBounded,testReportOrder} from './sources.mjs';
import {normalizeTests,testsDictionary,testsCsv} from './testReports.mjs';
import {validateSelectionEvidence,sameIdentity} from './lookup.mjs';
import {assertQualityReport} from '../public/quality-validation.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {Buffer} from 'node:buffer';
import {sha256,normalize,csv,inventoryColumns,monthlyColumns} from './normalize.mjs';
export const pinnedArtifactId='rrc-2026-10-09-uic000020838-v1';
// Exact seven responses AND seven retrieval sidecars of SOURCE_PROOF.md's
// pre-instrumentation public sample. URL/row shape alone is not source proof.
const legacyPublicEvidenceSha256='d7ba231188dfcc5afb182933247fbbc648d4eaa22aa12b73b67233c7da8ffc62';
const provenanceFailure=(code,message)=>Object.assign(Error(message),{code});
// A read callback identifies one successful load, including documented shallow
// fixture overrides. None of the returned mutable projections are source proof.
const loadedEvidence=new WeakMap();
export function snapshotProvenance(snapshot){
 const proof=loadedEvidence.get(snapshot?.read);
 if(proof?.provenance.classification==='test_fixture')return structuredClone(proof.provenance);
 if(snapshot?.testFixture===true)return {classification:'test_fixture',basis:'explicit_test_fixture'};
 return structuredClone(proof?.provenance??{classification:'unknown',basis:'source_classification_unavailable'});
}
const copyTests=tests=>({bhp:structuredClone(tests.bhp),srt:structuredClone(tests.srt),rawBhp:Buffer.from(tests.rawBhp),rawSrt:Buffer.from(tests.rawSrt)});
// Test rows exist only in v3 proofs; callers can never add, remove or alter them.
const sameTests=(actual,expected)=>expected===undefined?actual===undefined:Boolean(actual)&&isDeepStrictEqual(Object.keys(actual).sort(),['bhp','rawBhp','rawSrt','srt'])&&isDeepStrictEqual(actual.bhp,expected.bhp)&&isDeepStrictEqual(actual.srt,expected.srt)&&Buffer.isBuffer(actual.rawBhp)&&expected.rawBhp.equals(actual.rawBhp)&&Buffer.isBuffer(actual.rawSrt)&&expected.rawSrt.equals(actual.rawSrt);
const copyBodies=bodies=>Object.fromEntries(Object.entries(bodies).map(([name,body])=>[name,Buffer.from(body)]));
const sameBodies=(actual,expected)=>actual&&isDeepStrictEqual(Object.keys(actual).sort(),Object.keys(expected).sort())&&Object.entries(expected).every(([name,body])=>Buffer.isBuffer(actual[name])&&body.equals(actual[name]));
// Trusted-server reader; an absent object must reject with code ENOENT.
async function readCopy(readBytes,name){
 const body=await readBytes(name);
 if(!(body instanceof Uint8Array))throw Object.assign(Error('Evidence reader must return bytes'),{code:'SOURCE_INVALID'});
 return Buffer.from(body);
}
export async function loadSnapshot(sourceDir){
 return loadSnapshotFromReader(name=>readFile(resolve(sourceDir,name)));
}
export async function loadSnapshotFromReader(readBytes){
 if(typeof readBytes!=='function')throw Object.assign(Error('Evidence reader required'),{code:'SOURCE_INVALID'});
 const cache=new Map();
 const read=async name=>{if(!cache.has(name))cache.set(name,readCopy(readBytes,name));return cache.get(name);};
 let acquisition=null,fixtureEvidence=false;
 try{
 const classificationFiles=['acquisition.json','lookup.json','lookup-inventory.source.json','lookup-metadata.source.json',...acquisitionTargets.map(target=>target.name.replace(/\.[^.]+$/,'')+'.source.json')];
 const classification=await Promise.allSettled(classificationFiles.map(async name=>JSON.parse(await read(name))));
 fixtureEvidence=classification.some(result=>result.status==='fulfilled'&&result.value?.testFixture===true);
 try{acquisition=JSON.parse(await read('acquisition.json'));if(acquisition.status!=='succeeded')throw Object.assign(Error('Source acquisition is incomplete'),{code:'SOURCE_INVALID'});}catch(error){if(error.code!=='ENOENT')throw error;}
 const scope=acquisition?.scope??collectionScope,targets=targetsForScope(scope),dynamic=isBounded(scope),testReports=scope.queryVersion===3;
 if(dynamic){
  const lookupFlags=await Promise.allSettled(['lookup.json','lookup-inventory.source.json','lookup-metadata.source.json'].map(async name=>JSON.parse(await read(name))));
  fixtureEvidence ||= lookupFlags.some(result=>result.status==='fulfilled'&&result.value?.testFixture===true);
 }
 if(dynamic&&(acquisition.schemaVersion!==2||JSON.stringify(acquisition.targets)!==JSON.stringify(targets.map(target=>target.url))))throw provenanceFailure('SOURCE_INVALID','Versioned acquisition scope/targets invalid');
 // Inspect all available classification sidecars before parsing responses.
 // A malformed/missing source cannot erase another sidecar's fixture evidence.
 const sidecars=await Promise.allSettled(targets.map(async target=>JSON.parse(await read(target.name.replace(/\.[^.]+$/,'')+'.source.json'))));
 fixtureEvidence ||= sidecars.some(result=>result.status==='fulfilled'&&result.value?.testFixture===true);
 const sidecarFailure=sidecars.find(result=>result.status==='rejected');if(sidecarFailure)throw sidecarFailure.reason;
 const rawInventory=await read('candidate-inventory.json'),rawMonthly=await read('candidate-monthly.json');
 const inventory=JSON.parse(rawInventory),monthly=JSON.parse(rawMonthly);
 if(!Array.isArray(inventory)||!Array.isArray(monthly)||inventory.length>(dynamic?25:5)||monthly.length>1000)throw Object.assign(Error('Source bounds or row arrays invalid'),{code:'SOURCE_INVALID'});
 if(monthly.length===1000)throw Object.assign(Error('Monthly response reached its row cap; completeness is unproven'),{code:'SOURCE_ROW_LIMIT'});
 const sourceIds={inventory:`givw-z9t4:${sha256(rawInventory).slice(0,16)}`,monthly:`qq2j-f2zm:${sha256(rawMonthly).slice(0,16)}`};
 const sources=[],bodies={},retrievals=[],evidenceHashes=[];
 async function loadSource(name,kind){
  const filename=name.includes('.')?name:name+'.json';
  const metadataName=filename.replace(/\.[^.]+$/,'')+'.source.json';
  const body=await read(filename),metadataBytes=await read(metadataName),retrieval=JSON.parse(metadataBytes);
  retrievals.push(retrieval);fixtureEvidence ||= retrieval.testFixture===true;evidenceHashes.push([filename,sha256(body)],[metadataName,sha256(metadataBytes)]);
  const url=new URL(retrieval.url),expected=new URL(targets.find(target=>target.name===filename).url);
  const query=value=>JSON.stringify([...value.searchParams].sort(([a],[b])=>a.localeCompare(b)));
  if(url.origin!==expected.origin||url.pathname!==expected.pathname||query(url)!==query(expected))throw Object.assign(Error('Source endpoint does not match the fixed collection contract'),{code:'SOURCE_INVALID'});
  if(url.protocol!=='https:'||url.username||url.password||!['data.texas.gov','www.rrc.texas.gov','webapps2.rrc.texas.gov'].includes(url.hostname)||retrieval.http_status!==200||!Number.isFinite(Date.parse(retrieval.retrieved_at)))throw Object.assign(Error('Source metadata invalid'),{code:'SOURCE_INVALID'});
  if(retrieval.sha256&&retrieval.sha256!==sha256(body))throw Object.assign(Error('Source metadata hash mismatch'),{code:'SOURCE_HASH_MISMATCH'});
  const title=kind==='metadata'?JSON.parse(body).name:kind==='documentation'?undefined:JSON.parse(await read(kind+'-metadata.json')).name;
  const source={snapshot_id:sourceIds[kind]??`${name}:${sha256(body).slice(0,16)}`,name,...(title===undefined?{}:{title}),kind,...Object.fromEntries(Object.entries(retrieval).filter(([key])=>['url','retrieved_at','http_status','last_modified','etag','sha256','bytes','testFixture'].includes(key))),sha256:sha256(body),bytes:body.length,raw_file:'sources/'+filename};
  sources.push(source);bodies[source.raw_file]=body;
  if(dynamic)bodies['sources/'+metadataName]=metadataBytes;
 }
 for(const [name,kind] of [['candidate-inventory','inventory'],['candidate-monthly','monthly'],['inventory-metadata','metadata'],['monthly-metadata','metadata'],['uic-manual.pdf','documentation'],['rrc-resources.html','documentation'],['uic-query-help.html','documentation']])await loadSource(name,kind);
 if(dynamic){
  const selection=JSON.parse(await read('selection.json'));
  if(!selection||JSON.stringify(Object.keys(selection).sort())!==JSON.stringify(['lookupId','lookupSha256','ordinal','sourceRecordKey'])||!Number.isSafeInteger(selection.ordinal)||selection.ordinal<1||!/^[a-f0-9]{64}$/i.test(selection.lookupSha256)||!/^[-a-f0-9]{36}$/i.test(selection.lookupId)||!/^lookup:[1-9]\d*$/.test(selection.sourceRecordKey))throw provenanceFailure('SOURCE_INVALID','Persisted selection evidence requires exact identity, ordinal and lookup hash');
  const verified=await validateSelectionEvidence(read,selection);
  if(verified.testFixture!==acquisition.testFixture)throw provenanceFailure('SOURCE_PROVENANCE_CONFLICT','Selection and acquisition classifications disagree');
  if(verified.row.uic_number!==scope.monthlyUic||inventory.length!==1||!sameIdentity(inventory[0],verified.row))throw provenanceFailure('SOURCE_INVALID','Fresh exact-UIC parent is duplicate, missing or selected identity changed');
  for(const name of ['acquisition.json','selection.json','lookup.json','lookup-metadata.json','lookup-metadata.source.json','lookup-inventory.json','lookup-inventory.source.json'])bodies['sources/'+name]=await read(name);
  sources.push({snapshot_id:'lookup:'+verified.lookupSha256.slice(0,16),name:'lookup-inventory',kind:'selection',...JSON.parse(await read('lookup-inventory.source.json')),raw_file:'sources/lookup-inventory.json'});
 }
 // v3 only (RRC-13): exact-UIC BHP/SRT report inventories, appended after the selection.
 let tests;
 if(testReports){
  const rawBhp=await read('candidate-bhp.json'),rawSrt=await read('candidate-srt.json');
  let bhp,srt;try{bhp=JSON.parse(rawBhp);srt=JSON.parse(rawSrt);}catch{throw Object.assign(Error('Test-report response is not JSON'),{code:'SOURCE_INVALID'});}
  if(!Array.isArray(bhp)||!Array.isArray(srt)||bhp.length>scope.testReportLimit||srt.length>scope.testReportLimit)throw Object.assign(Error('Test-report bounds or row arrays invalid'),{code:'SOURCE_INVALID'});
  if(bhp.length===scope.testReportLimit||srt.length===scope.testReportLimit)throw Object.assign(Error('Test-report response reached its row cap; completeness is unproven'),{code:'SOURCE_ROW_LIMIT'});
  sourceIds.bhp=`qxfy-wcfs:${sha256(rawBhp).slice(0,16)}`;sourceIds.srt=`h54t-xnbi:${sha256(rawSrt).slice(0,16)}`;
  for(const [name,kind] of [['candidate-bhp','bhp'],['candidate-srt','srt'],['bhp-metadata','metadata'],['srt-metadata','metadata'],['srt-guidelines.html','documentation'],['bhp-permian-nto.pdf','documentation']])await loadSource(name,kind);
  tests={bhp,srt,rawBhp,rawSrt};
 }
 const flags=[...(acquisition?[acquisition.testFixture]:[]),...retrievals.filter(s=>Object.hasOwn(s,'testFixture')).map(s=>s.testFixture)];
 if(flags.some(flag=>typeof flag!=='boolean'))throw provenanceFailure('SOURCE_PROVENANCE_UNVERIFIED','Source classification is missing or invalid');
 if(flags.includes(true)&&flags.includes(false))throw provenanceFailure('SOURCE_PROVENANCE_CONFLICT','Acquisition and source classifications disagree');
 let provenance={classification:'unknown',basis:'source_classification_unavailable'};
 if(flags.includes(true))provenance={classification:'test_fixture',basis:'recorded_test_fixture'};
 else if([1,2].includes(acquisition?.schemaVersion)&&acquisition.mode==='live_collection'&&acquisition.testFixture===false&&/^[a-f0-9-]{36}$/i.test(acquisition.runId)&&retrievals.every(s=>s.testFixture===false&&typeof s.sha256==='string'&&Number.isSafeInteger(s.bytes)))provenance={classification:'public_reported',basis:dynamic?'recorded_official_acquisition_v2':'recorded_official_acquisition'};
 else if(!acquisition&&sha256(JSON.stringify(evidenceHashes.sort(([a],[b])=>a<b?-1:a>b?1:0)))===legacyPublicEvidenceSha256)provenance={classification:'public_reported',basis:'source_proof_2026_10_09_exact_bytes'};
 const snapshot={read,rawInventory,rawMonthly,inventory,monthly,sourceIds,sources,bodies,provenance,testFixture:provenance.classification==='test_fixture',scope,...(tests?{tests}:{})};
 const files=new Map();
 for(const [name,pending] of cache){try{files.set(name,Buffer.from(await pending));}catch{}}
 loadedEvidence.set(read,{rawInventory:Buffer.from(rawInventory),rawMonthly:Buffer.from(rawMonthly),inventory:JSON.parse(rawInventory),monthly:JSON.parse(rawMonthly),sourceIds:structuredClone(sourceIds),sources:structuredClone(sources),bodies:copyBodies(bodies),provenance:structuredClone(provenance),scope:structuredClone(scope),...(tests?{tests:copyTests(tests)}:{}),read:async name=>{if(!files.has(name))throw provenanceFailure('SOURCE_INVALID','File is absent from the loaded source evidence');return Buffer.from(files.get(name));}});
 return snapshot;
 }catch(error){
  // Failed/incomplete fixture loads are still fixtures, including separate
  // CLI replays whose invocation did not explicitly request fixture mode.
  if(acquisition?.testFixture===true||fixtureEvidence)error.provenance={classification:'test_fixture',basis:'recorded_test_fixture'};
  throw error;
 }
}
export async function buildArtifact(snapshot,artifactId,normalized){
 if(!['public_reported','test_fixture'].includes(snapshot.provenance?.classification))throw provenanceFailure('SOURCE_PROVENANCE_UNVERIFIED','Source classification is unavailable; public export is refused');
 if(snapshot.testFixture!==(snapshot.provenance.classification==='test_fixture'))throw provenanceFailure('SOURCE_PROVENANCE_CONFLICT','Snapshot classification is inconsistent');
 const proof=loadedEvidence.get(snapshot.read);
 if(!proof)throw provenanceFailure('SOURCE_PROVENANCE_UNVERIFIED','Snapshot must originate from verified source loading');
 if(!isDeepStrictEqual(snapshot.provenance,proof.provenance)&&!(snapshot.testFixture&&snapshot.provenance.classification==='test_fixture'))throw provenanceFailure('SOURCE_PROVENANCE_CONFLICT','Snapshot classification contradicts loaded source evidence');
 if(!isDeepStrictEqual(snapshot.inventory,proof.inventory)||!isDeepStrictEqual(snapshot.monthly,proof.monthly)||!isDeepStrictEqual(snapshot.sourceIds,proof.sourceIds)||!isDeepStrictEqual(snapshot.scope,proof.scope)||!isDeepStrictEqual(snapshot.sources,proof.sources)||!Buffer.isBuffer(snapshot.rawInventory)||!proof.rawInventory.equals(snapshot.rawInventory)||!Buffer.isBuffer(snapshot.rawMonthly)||!proof.rawMonthly.equals(snapshot.rawMonthly)||!sameBodies(snapshot.bodies,proof.bodies)||!sameTests(snapshot.tests,proof.tests))throw provenanceFailure('SOURCE_HASH_MISMATCH','Source projections contradict the preserved loaded bytes');
 assertQualityReport(normalized?.quality,{inventory:normalized?.inventory,monthly:normalized?.monthly});
 if(normalized.quality.inventory.raw!==snapshot.inventory.length||normalized.quality.monthly.raw!==snapshot.monthly.length)throw provenanceFailure('QUALITY_INVALID','Quality counts do not reconcile with loaded source rows');
 if(snapshot.inventory.some(row=>sourceScopeFlags('inventory',row,snapshot.scope).length)||snapshot.monthly.some(row=>sourceScopeFlags('monthly',row,snapshot.scope).length))throw Object.assign(Error('Source rows contradict the declared query predicates'),{code:'SOURCE_SCOPE_MISMATCH',quality:normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope).quality});
 const canonical=normalize(proof.inventory,proof.monthly,proof.sourceIds,proof.scope);
 const testRows=proof.tests?normalizeTests(proof.tests,proof.sourceIds,canonical.inventory,proof.scope):null;
 if(testRows&&[...testRows.bhp,...testRows.srt].some(row=>row.quality_flags.some(flag=>flag.startsWith('source_scope:'))))throw Object.assign(Error('Test-report rows contradict the exact-UIC query'),{code:'SOURCE_SCOPE_MISMATCH'});
 if(!isDeepStrictEqual(normalized,canonical))throw provenanceFailure('QUALITY_INVALID','Normalized values, identities or quality evidence contradict preserved source rows');
 // Serialize private copies after validation: awaits below cannot admit caller
 // mutations of normalized values, metadata buffers, or source classifications.
 normalized=canonical;
 snapshot={...proof,sources:structuredClone(proof.sources),bodies:copyBodies(proof.bodies),provenance:structuredClone(snapshot.provenance),testFixture:snapshot.testFixture};
 const {read,sources}=snapshot;
const unitSource='https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf';
const dictionary={schema_version:1,row_grain:{inventory:'one retained official source inventory row',injection_monthly:'one retained official source monthly row, including conflicts/revisions'},missing_value:'CSV empty cell / JSON null for absent numbers. Zero remains zero. String identifier absence is empty string.',pressure_basis:'Reported injection pressure, psi as named by RRC manual pp.40–41 (PDF pp.41–42). No datum conversion, BHP, reservoir pressure, or injectivity claim.',annulus:'Not available in ODP dataset qq2j-f2zm; no annulus columns are generated.',revision_policy:normalized.quality.revision_policy,units_source:{url:unitSource,pdf_pages:[18,41,42],note:'Official UIC manual defines liquid barrels, gas MCF, monthly average/maximum psi; public UIC query help names permit limits PSI and BBLS/day.'},fields:{}};
const definitions={source_record_key:['string','calculated','Snapshot plus 1-based raw inventory ordinal; never shortened API'],source_row_key:['string','calculated','Snapshot plus 1-based raw monthly ordinal; preserves duplicate source IDs'],parent_key:['string','calculated','Unique UIC inventory source_record_key if and only if exact string UIC matches one retained parent'],parent_join_status:['enum','calculated','matched / unmatched / ambiguous'],uic_number:['string','public reported','Original nine-character UIC parent/control ID; preserves leading zeros'],api_no:['string','public reported','Original API_NO exactly as source supplies it (eight digits here); never used as join key'],source_report_id:['string','public reported','Original ODP monthly id, retained without assuming global uniqueness'],reporting_year:['year','calculated','Year extracted from source formatted_date'],reporting_month:['month','calculated','Month extracted from source formatted_date'],period_start:['date','calculated','Calendar month start from formatted_date; not a daily observation'],injected_liquid_bbl:['bbl/month','public reported','ODP vol_liq, monthly total liquid volume'],injected_gas_mcf:['MCF/month','public reported','ODP vol_gas, monthly total gas volume'],reported_avg_injection_pressure_psi:['psi','public reported','ODP inj_press_avg; separate reported average injection pressure'],reported_max_injection_pressure_psi:['psi','public reported','ODP inj_press_max; separate reported maximum injection pressure'],calendar_days:['days','calculated','Actual Gregorian days in reporting month'],calculated_calendar_day_avg_bpd:['bbl/day','calculated','injected_liquid_bbl / calendar_days; not measured daily operating rate or operating-day rate'],most_recent_record:['source code','public reported','Original ODP flag; meaning not documented by metadata, no revision-selection inference'],permit_liquid_pressure_limit_psi:['psi','public reported','ODP max_liq_inj_pressure; regulatory authorized maximum, not sustainable capacity'],permit_liquid_volume_limit_bpd:['bbl/day','public reported','ODP bbl_vol_inj; authorized maximum liquid volume, not sustainable capacity'],permitted_top_depth_ft:['ft','public reported','ODP top_inj_zone; permitted injection interval top'],permitted_bottom_depth_ft:['ft','public reported','ODP bot_inj_zone; permitted injection interval bottom'],county:['name','calculated','Reeves from source API county prefix 389; metadata not independently geocoded'],county_basis:['text','calculated','Explicit origin of county label'],quality_flags:['list','calculated','Pipe-delimited issues; issues may overlap'],source_snapshot_id:['string','calculated','Dataset ID plus raw response SHA256 prefix']};
for(const col of [...new Set([...inventoryColumns,...monthlyColumns])]){const [units,status,definition]=definitions[col]??['string','public reported',`Original source ${col}; identifier values preserved as strings`];dictionary.fields[col]={units,status,definition};}
if(snapshot.testFixture){
 dictionary.provenance={...snapshot.provenance};
 dictionary.row_grain={inventory:'one retained test fixture inventory row',injection_monthly:'one retained test fixture monthly row, including conflicts/revisions'};
 for(const field of Object.values(dictionary.fields))if(field.status==='public reported')field.status='synthetic';
}
const files={'inventory.csv':csv(normalized.inventory,inventoryColumns),'injection_monthly.csv':csv(normalized.monthly,monthlyColumns),'quality_report.json':JSON.stringify(normalized.quality,null,2)+'\n','data_dictionary.json':JSON.stringify(dictionary,null,2)+'\n'};
const inventoryMetadata=JSON.parse(await read('inventory-metadata.json')),monthlyMetadata=JSON.parse(await read('monthly-metadata.json'));
const manifest={artifact_id:artifactId,schema_version:1,transformation_version:'rrc-odp-v1.0.0',real_history_status:normalized.monthly.length&&normalized.quality.inventory.accepted===normalized.inventory.length&&normalized.quality.monthly.accepted===normalized.monthly.length&&normalized.quality.parent_join.matched===normalized.monthly.length?'verified_bounded_linkage':'incomplete',scope:{uic_number:'000020838',start:'2024-01-01',inventory_limit:5,monthly_limit:1000,monthly_returned:normalized.monthly.length,pagination:'Response below cap; bounded query not statewide extract'},source_revisions:{inventory_rows_updated_at:inventoryMetadata.rowsUpdatedAt,monthly_rows_updated_at:monthlyMetadata.rowsUpdatedAt},sources,documentation:[{url:'https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/',purpose:'Official RRC identifies ODP datasets and row grain'},{url:unitSource,purpose:'Official H-10 units and source field definitions'},{url:'https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html',purpose:'Permit constraints PSI and BBLS/day'}],files:Object.fromEntries(Object.entries(files).map(([name,body])=>[name,{sha256:sha256(body),bytes:Buffer.byteLength(body)}])),limitations:['Only one UIC monthly history acquired; five bounded inventory candidates.','ODP supplies no annulus pressure or original H-10 document revision ID.','Source reports are not independently validated measurements.','Current status, sustainable capacity and BHP are not inferred.']};
const normalizedPayload={schemaVersion:1,artifactId,inventory:normalized.inventory,injectionMonthly:normalized.monthly,qualityReport:normalized.quality,dataDictionary:dictionary};
if(isBounded(snapshot.scope)){
 const scope=snapshot.scope,[year,month]=scope.endMonth.split('-').map(Number);
 manifest.transformation_version='rrc-odp-v2.0.0';
 manifest.scope={query_version:2,uic_number:scope.monthlyUic,start:scope.startMonth+'-01',end:`${scope.endMonth}-${new Date(Date.UTC(year,month,0)).getUTCDate()}`,inventory_limit:25,inventory_returned:normalized.inventory.length,monthly_limit:1000,monthly_returned:normalized.monthly.length,pagination:'Complete bounded response below cap; no statewide coverage'};
 manifest.selection=JSON.parse(await read('selection.json'));
 manifest.limitations[0]='One explicitly selected UIC with an inclusive bounded reporting period; exact-UIC inventory revalidated against preserved lookup identity.';
 dictionary.fields.county.definition='Reeves only for source API county prefix 389; other county codes are labeled without inferring an unverified county name.';
 for(const [name,body] of Object.entries(snapshot.bodies))manifest.files[name]={sha256:sha256(body),bytes:Buffer.byteLength(body)};
 // Dictionary changed above; update the contract file and its inventory.
 files['data_dictionary.json']=JSON.stringify(dictionary,null,2)+'\n';manifest.files['data_dictionary.json']={sha256:sha256(files['data_dictionary.json']),bytes:Buffer.byteLength(files['data_dictionary.json'])};
}
// v3 additive sidecars (D10): appended after every sources/ entry; the six v1 files,
// data_dictionary.json and the normalized payload are untouched.
if(testRows){
 const scope=snapshot.scope,status=rows=>rows.length?'returned_below_cap':'confirmed_empty';
 manifest.transformation_version='rrc-odp-v2.1.0';manifest.scope.query_version=3;manifest.scope.test_report_limit=scope.testReportLimit;
 manifest.limitations.push('BHP/SRT test-report sidecars are exact-UIC report inventories not limited to the reporting period: one row per source record (the source does not document how many rows one test produces), without test documents or pressure series; psia and psig are kept as labelled and never converted.');
 const tests={schemaVersion:1,artifactId,scope:{query_version:3,uic_number:scope.monthlyUic,test_report_limit:scope.testReportLimit,order:`BHP ${testReportOrder.bhp}; SRT ${testReportOrder.srt}`,bhp_returned:testRows.bhp.length,srt_returned:testRows.srt.length,bhp_status:status(testRows.bhp),srt_status:status(testRows.srt),window:'exact uic_no; not limited to reporting period'},bhp:testRows.bhp,srt:testRows.srt,quality:testRows.quality};
 const sidecars={'tests.json':JSON.stringify(tests,null,2)+'\n','tests_bhp.csv':testsCsv(testRows.bhp,'bhp'),'tests_srt.csv':testsCsv(testRows.srt,'srt'),'tests_dictionary.json':JSON.stringify(testsDictionary({testFixture:snapshot.testFixture,provenance:snapshot.provenance}),null,2)+'\n'};
 for(const [name,body] of Object.entries(sidecars)){files[name]=body;manifest.files[name]={sha256:sha256(body),bytes:Buffer.byteLength(body)};}
}
// Preserve the approved legacy version's bytes; all other versions carry
// explicit classification in the immutable consumer manifest.
if(snapshot.provenance.basis!=='source_proof_2026_10_09_exact_bytes'||artifactId!==pinnedArtifactId){manifest.provenance={...snapshot.provenance};manifest.testFixture=snapshot.testFixture;}
if(snapshot.testFixture){manifest.real_history_status='test_fixture';manifest.limitations.unshift('Test fixture / synthetic source responses; not public acquisition evidence.');}
manifest.normalized_payload_sha256=sha256(JSON.stringify(normalizedPayload));
manifest.normalized_payload_hash_method='SHA256 of UTF-8 JSON.stringify({schemaVersion,artifactId,inventory,injectionMonthly,qualityReport,dataDictionary}), in this key order, excluding manifest to avoid circularity';
files['normalized.json']=JSON.stringify({...normalizedPayload,manifest},null,2)+'\n';

 return {files:{...snapshot.bodies,...files,'manifest.json':JSON.stringify(manifest,null,2)+'\n'},manifest,normalized:{...normalizedPayload,manifest}};
}

