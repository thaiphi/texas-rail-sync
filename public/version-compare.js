// RRC-16 (Phase 4): read-only comparison of two immutable versions of one UIC.
// Pure: no I/O, no network, no timers, no storage, no DOM. Inputs are never mutated: the module
// reads deep-frozen structured copies and returns a fresh plain object.
//
// Input, per side (both sides already verified by the browser's own loaders): the verified
// normalized.json object (loadVerifiedVersion / loadPinnedArtifact: artifactId, manifest, inventory,
// injectionMonthly, qualityReport, ...) with four added sidecar properties:
//   {...artifact, tests, casing, plugging, relations}
//   tests     : parsed tests.json             (required when manifest.files lists tests.json, else null/absent)
//   casing    : parsed casing.json            (required when manifest.files lists casing.json, else null/absent)
//   plugging  : parsed plugging.json          (required when manifest.files lists plugging.json, else null/absent)
//   relations : parsed evidence_relations.json (required when manifest.files lists it, else null/absent)
// A sidecar listed in the verified manifest but not supplied, or supplied but not listed, is
// refused (fail closed); a comparison never falls back to one side.
//
// Keys are native source identity only (section 3 of the Phase 4 design). Row references
// (source_row_key / source_record_key / source_id) are shown per side and never pair rows.
import {rowDisposition} from './quality-validation.js';

const freezeAll=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))freezeAll(item);}return value;};
const deepFreeze=value=>freezeAll(value);

export const COMPARISON_VERSION='rrc-compare-v1';
export const DATASETS=deepFreeze(['inventory','h10','bhp','srt','casing','plugging','relations']);
export const OUTCOMES=deepFreeze(['same','identity_differs','values_differ','only_in_a','only_in_b','outside_other_scope','multiple_rows']);
export const NOT_COMPARABLE_REASONS=deepFreeze(['not_collected_in_a','not_collected_in_b','not_collected_in_either','not_queried_in_a','not_queried_in_b','not_queried_in_either','different_source_api_id']);
export const ROW_REASONS=deepFreeze({
 outside_window:"outside the other version's reporting window",
 outside_inventory_query:"outside the other version's inventory query",
 key_incomplete:'key incomplete',
 shared_key:'several rows share this key'
});
// error.code==='COMPARE_REFUSED'; error.refusal is the code below; error.reason is its short text.
export const REFUSAL_REASONS=deepFreeze({
 side_incomplete:'a version is missing its artifact ID, manifest, inventory, H-10 rows or quality report',
 same_version:'the same version was selected on both sides',
 different_uic:'the two versions belong to different UICs',
 sidecar_missing:'a file listed in a version manifest was not supplied',
 sidecar_unlisted:"a supplied file is not listed in that version's manifest",
 sidecar_identity:'a supplied file belongs to a different version',
 sidecar_dataset:'a supplied wellbore file names a different dataset'
});

// Contract columns, as published (src/normalize.mjs inventoryColumns/monthlyColumns,
// src/testReports.mjs testColumns, src/wellbore.mjs wellboreColumns). The test asserts equality.
const wellboreCommon=['source_row_key','source_api_id','wellbore_link_status','source_id','api_no','record_sequence','on_top_record'];
export const CONTRACT_COLUMNS=deepFreeze({
 inventory:['source_record_key','uic_number','api_no','operator_number','district_code','lease_number','lease_name','well_no_display','county','county_basis','injection_type_code','permit_liquid_pressure_limit_psi','permit_liquid_volume_limit_bpd','permitted_top_depth_ft','permitted_bottom_depth_ft','w14_number','w14_date','permit_canceled_date','plugged_date','source_snapshot_id','quality_flags'],
 h10:['source_row_key','parent_key','parent_join_status','uic_number','source_report_id','reporting_year','reporting_month','period_start','injected_liquid_bbl','injected_gas_mcf','reported_avg_injection_pressure_psi','reported_max_injection_pressure_psi','calendar_days','calculated_calendar_day_avg_bpd','most_recent_record','source_snapshot_id','quality_flags'],
 bhp:['source_row_key','parent_key','parent_join_status','uic_number','source_report_id','tracking_no','test_sequence_no','report_conducted_date','report_conducted_date_text','report_received_date','report_received_date_text','bhp_psia','test_depth_ft','gradient_psi_ft','tested_formation','source_snapshot_id','quality_flags'],
 srt:['source_row_key','parent_key','parent_join_status','uic_number','source_report_id','tracking_no','srt_received_date','srt_received_date_text','test_date','test_date_text','satisfactory_test_code','top_perf_ft','bottom_perf_ft','formation_tested','min_inj_rate_bpm','max_inj_rate_bpm','isip_psig','formation_frac_press_psig','frac_inj_rate_capacity_bpd','surface_pressure_firc_psig','fracture_gradient_psi_ft','comments','source_snapshot_id','quality_flags'],
 casing:[...wellboreCommon,'completion_date','completion_date_text','csg_size','hole_size','csg_depth','toc','multi_stg_depth','cmt_sacks','total_depth_g1w2','depth_reference','depth_reference_code','source_snapshot_id','quality_flags'],
 plugging:[...wellboreCommon,'w3_date','w3_date_text','plug_top_depth','plug_bottom_depth','plug_cmt_sacks','total_depth_w3','depth_reference','depth_reference_code','source_snapshot_id','quality_flags']
});
// Comparison keys: native identity (OD-1: H-10 is UIC + reporting month; report ID is an identity field).
export const COMPARISON_KEYS=deepFreeze({
 inventory:['uic_number'],
 h10:['uic_number','period_start'],
 bhp:['source_report_id','tracking_no','test_sequence_no'],
 srt:['source_report_id','tracking_no'],
 casing:['source_id'],
 plugging:['source_id'],
 relations:['relation','status']
});
export const IDENTITY_FIELDS=deepFreeze({inventory:[],h10:['source_report_id'],bhp:[],srt:[],casing:[],plugging:[],relations:[]});
// Version-local columns: shown only as row references, never compared and never a key.
export const NEVER_COMPARED=deepFreeze({
 inventory:['source_record_key','source_snapshot_id'],
 h10:['source_row_key','parent_key','source_snapshot_id'],
 bhp:['source_row_key','parent_key','source_snapshot_id'],
 srt:['source_row_key','parent_key','source_snapshot_id'],
 casing:['source_row_key','source_snapshot_id'],
 plugging:['source_row_key','source_snapshot_id'],
 relations:[]
});
const ROW_REF={inventory:'source_record_key',h10:'source_row_key',bhp:'source_row_key',srt:'source_row_key',casing:'source_id',plugging:'source_id'};
export const COMPARED_FIELDS=deepFreeze(Object.fromEntries(Object.entries(CONTRACT_COLUMNS).map(([dataset,columns])=>[dataset,columns.filter(column=>column!=='quality_flags'&&!COMPARISON_KEYS[dataset].includes(column)&&!IDENTITY_FIELDS[dataset].includes(column)&&!NEVER_COMPARED[dataset].includes(column))])));
export const SOURCE_CLASSES=deepFreeze({inventory:'data',monthly:'data',bhp:'data',srt:'data',wellbore_inventory:'data',casing:'data',plugging:'data',selection:'selection',metadata:'metadata',documentation:'documentation'});

const refuse=refusal=>{throw Object.assign(Error(`Comparison refused: ${REFUSAL_REASONS[refusal]}`),{code:'COMPARE_REFUSED',refusal,reason:REFUSAL_REASONS[refusal]});};
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Verbatim equality: Object.is on primitives, element by element on arrays, key by key on objects.
function same(left,right){
 if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>same(item,right[index]));
 if(isObject(left)||isObject(right)){if(!isObject(left)||!isObject(right))return false;const keys=Object.keys(left).sort(),other=Object.keys(right).sort();return same(keys,other)&&keys.every(key=>same(left[key],right[key]));}
 return Object.is(left,right);
}
const compareTuple=(left,right)=>{for(let index=0;index<Math.max(left.length,right.length);index++){if(index>=left.length)return -1;if(index>=right.length)return 1;const x=String(left[index]),y=String(right[index]);if(x<y)return -1;if(x>y)return 1;}return 0;};
const byString=(x,y)=>x<y?-1:x>y?1:0;
const value=item=>item===undefined?null:item;
const month=text=>typeof text==='string'&&/^\d{4}-\d{2}/.test(text)?text.slice(0,7):null;
const bounded=manifest=>Number.isInteger(manifest?.scope?.query_version)&&manifest.scope.query_version>=2;
const listed=(manifest,name)=>isObject(manifest?.files)&&Object.hasOwn(manifest.files,name);

const SIDECARS=[['tests','tests.json',null],['casing','casing.json','casing'],['plugging','plugging.json','plugging'],['relations','evidence_relations.json',null]];
function checkSide(side){
 const artifact=side?.artifact;
 if(!isObject(artifact)||typeof artifact.artifactId!=='string'||!artifact.artifactId||!isObject(artifact.manifest)||!Array.isArray(artifact.inventory)||!Array.isArray(artifact.injectionMonthly)||!isObject(artifact.qualityReport))refuse('side_incomplete');
 if(typeof artifact.manifest.scope?.uic_number!=='string')refuse('side_incomplete');
 for(const [property,file,dataset] of SIDECARS){
  const doc=side[property]??null,isListed=listed(artifact.manifest,file);
  if(isListed&&doc===null)refuse('sidecar_missing');
  if(!isListed&&doc!==null)refuse('sidecar_unlisted');
  if(doc===null)continue;
  if(!isObject(doc)||doc.artifactId!==artifact.artifactId)refuse('sidecar_identity');
  if(dataset&&doc.dataset!==dataset)refuse('sidecar_dataset');
 }
}

const sideInfo=artifact=>{
 const manifest=artifact.manifest,monthly=(manifest.sources??[]).find(source=>source?.name==='candidate-monthly');
 return {artifact_id:artifact.artifactId,query_version:Number.isInteger(manifest.scope.query_version)?manifest.scope.query_version:null,transformation_version:value(manifest.transformation_version),window:{start:value(manifest.scope.start),end:value(manifest.scope.end)},collected_at:value(monthly?.retrieved_at)};
};

// Rows and per-side metadata of one dataset, or null when that side did not collect it.
function datasetSide(side,dataset){
 const artifact=side.artifact;
 if(dataset==='inventory')return {rows:artifact.inventory,quality:artifact.qualityReport.inventory,parentJoin:null,issues:null};
 if(dataset==='h10')return {rows:artifact.injectionMonthly,quality:artifact.qualityReport.monthly,parentJoin:artifact.qualityReport.parent_join,issues:null};
 if(dataset==='bhp'||dataset==='srt'){const tests=side.tests??null;if(!tests)return null;return {rows:tests[dataset]??[],quality:tests.quality?.[dataset],parentJoin:tests.quality?.parent_join?.[dataset]??null,issues:tests.quality?.issue_counts?.[dataset]??{},scope:tests.scope};}
 if(dataset==='casing'||dataset==='plugging'){const doc=side[dataset]??null;if(!doc)return null;return {rows:doc.rows??[],quality:doc.quality?.counts,parentJoin:null,issues:doc.quality?.issue_counts??{},scope:doc.scope,link:doc.link};}
 const doc=side.relations??null;return doc?{doc}:null;
}

function comparability(dataset,a,b){
 if(!a||!b)return !a&&!b?'not_collected_in_either':!a?'not_collected_in_a':'not_collected_in_b';
 if(dataset==='casing'||dataset==='plugging'){
  const qa=a.scope?.status==='not_queried',qb=b.scope?.status==='not_queried';
  if(qa||qb)return qa&&qb?'not_queried_in_either':qa?'not_queried_in_a':'not_queried_in_b';
  if(a.link?.source_api_id!==b.link?.source_api_id)return 'different_source_api_id';
 }
 return null;
}

function coverage(dataset,data,artifact){
 if(!data)return null;
 const manifest=artifact.manifest,base={query_version:Number.isInteger(manifest.scope.query_version)?manifest.scope.query_version:null,transformation_version:value(manifest.transformation_version)};
 if(dataset==='relations'){const doc=data.doc,counts={};for(const relation of Object.keys(doc.counts??{}).sort(byString))counts[relation]={total:value(doc.counts[relation]?.total),by_status:{...(doc.counts[relation]?.by_status??{})}};return {...base,catalogue_version:value(doc.catalogue_version),relation_count:Array.isArray(doc.relations)?doc.relations.length:null,counts};}
 const out={...base,row_count:data.rows.length};
 if(dataset==='h10'){const periods=[...new Set(data.rows.map(row=>row.period_start).filter(period=>typeof period==='string'&&period))].sort(byString);Object.assign(out,{distinct_months:periods.length,first_period:periods[0]??null,last_period:periods.at(-1)??null,window:{start:value(manifest.scope.start),end:value(manifest.scope.end)}});}
 if(dataset==='bhp'||dataset==='srt')out.status=value(data.scope?.[`${dataset}_status`]);
 if(dataset==='casing'||dataset==='plugging')Object.assign(out,{scope_status:value(data.scope?.status),source_api_id:value(data.link?.source_api_id),link_status:value(data.link?.status),link_reason:value(data.link?.reason),wellbore_row_count:value(data.link?.wellbore_row_count),candidate_count:Array.isArray(data.link?.candidates)?data.link.candidates.length:null});
 return out;
}
const qualityCounts=counts=>counts?{raw:value(counts.raw),parsed:value(counts.parsed),accepted:value(counts.accepted),quarantined:value(counts.quarantined),excluded:value(counts.excluded)}:null;
const joinCounts=join=>join?{matched:value(join.matched),unmatched:value(join.unmatched),ambiguous:value(join.ambiguous)}:null;
// inventory/H-10: the producer's qualityReport.issue_counts is one map across both datasets, so
// per-dataset counts are taken from each row's quality_flags (the validator proves them equal).
function issueMap(dataset,data){
 if(!data)return null;
 if(data.issues)return data.issues;
 const out={};for(const row of data.rows)for(const flag of row.quality_flags??[])out[flag]=(out[flag]??0)+1;return out;
}

// Grouping and outcomes.
function keyOf(dataset,row){
 if(dataset==='h10'&&!row.period_start)return {parts:['uic_number','source_report_id'],tuple:[row.uic_number,row.source_report_id],complete:true,windowed:false,space:'report'};
 const parts=COMPARISON_KEYS[dataset],tuple=parts.map(part=>row[part]);
 const complete=dataset==='inventory'||dataset==='h10'?true:dataset==='bhp'||dataset==='srt'?typeof row.source_report_id==='string'&&row.source_report_id.trim()!=='':typeof row.source_id==='string'&&row.source_id.trim()!=='';
 return {parts,tuple,complete,windowed:dataset==='h10',space:'key'};
}
const keyObject=(parts,tuple)=>Object.fromEntries(parts.map((part,index)=>[part,value(tuple[index])]));
const ref=(dataset,row)=>value(row[ROW_REF[dataset]]);
const sortedRefs=rows=>rows.map(item=>item.ref).sort((x,y)=>byString(String(x),String(y)));

function outsideOther(dataset,row,key,otherArtifact,uic){
 if(dataset==='h10'&&key.windowed){
  const period=month(row.period_start),start=month(otherArtifact.manifest.scope.start),end=month(otherArtifact.manifest.scope.end);
  if(period&&((start&&period<start)||(end&&period>end)))return ROW_REASONS.outside_window;
 }
 if(dataset==='inventory'&&row.uic_number!==uic&&bounded(otherArtifact.manifest))return ROW_REASONS.outside_inventory_query;
 return null;
}

function pairRow(dataset,keyParts,keyTuple,left,right){
 const fields=[];
 for(const field of IDENTITY_FIELDS[dataset])if(!same(left.row[field],right.row[field]))fields.push({field,identity:true,a:value(left.row[field]),b:value(right.row[field])});
 const identityOnly=fields.length>0;let valuesDiffer=false;
 for(const field of COMPARED_FIELDS[dataset])if(!same(left.row[field],right.row[field])){valuesDiffer=true;fields.push({field,identity:false,a:value(left.row[field]),b:value(right.row[field])});}
 const order=CONTRACT_COLUMNS[dataset];fields.sort((x,y)=>order.indexOf(x.field)-order.indexOf(y.field));
 return {outcome:valuesDiffer?'values_differ':identityOnly?'identity_differs':'same',key:keyObject(keyParts,keyTuple),a:[left.ref],b:[right.ref],fields,flags:{a:[...(left.row.quality_flags??[])],b:[...(right.row.quality_flags??[])]},disposition:{a:rowDisposition(left.row),b:rowDisposition(right.row)},reason:null};
}
const singleRow=(dataset,outcome,keyParts,keyTuple,item,side,reason)=>({outcome,key:keyObject(keyParts,keyTuple),a:side==='a'?[item.ref]:[],b:side==='b'?[item.ref]:[],fields:[],flags:{a:side==='a'?[...(item.row.quality_flags??[])]:null,b:side==='b'?[...(item.row.quality_flags??[])]:null},disposition:{a:side==='a'?rowDisposition(item.row):null,b:side==='b'?rowDisposition(item.row):null},reason});
const groupRow=(outcome,keyParts,keyTuple,left,right,reason)=>({outcome,key:keyObject(keyParts,keyTuple),a:sortedRefs(left),b:sortedRefs(right),fields:[],flags:null,disposition:null,reason});

function compareRows(dataset,a,b,artifacts,uic){
 const groups=new Map();
 for(const [sideName,data] of [['a',a],['b',b]])for(const row of data.rows){
  const key=keyOf(dataset,row),id=JSON.stringify([key.space,key.complete,key.tuple]);
  if(!groups.has(id))groups.set(id,{key,a:[],b:[]});
  groups.get(id)[sideName].push({row,ref:ref(dataset,row)});
 }
 const out=[];
 for(const {key,a:left,b:right} of groups.values()){
  const entries=[];
  if(!key.complete){entries.push([1,[],groupRow('multiple_rows',key.parts,key.tuple,left,right,ROW_REASONS.key_incomplete)]);}
  else if(left.length&&right.length){
   if(left.length===1&&right.length===1)entries.push([0,[],pairRow(dataset,key.parts,key.tuple,left[0],right[0])]);
   else{
    // Several rows share the key: pair only by the full tuple (key + identity fields) when that
    // tuple is unique on both sides; never by position. Everything else stays unmatched.
    const identity=IDENTITY_FIELDS[dataset],tupleOf=item=>JSON.stringify(identity.map(field=>value(item.row[field]))),count=(list,tuple)=>list.filter(item=>tupleOf(item)===tuple).length;
    const restA=[],restB=[];
    if(identity.length){
     for(const item of left){const tuple=tupleOf(item);if(count(left,tuple)===1&&count(right,tuple)===1){const other=right.find(candidate=>tupleOf(candidate)===tuple);entries.push([0,identity.map(field=>value(item.row[field])),pairRow(dataset,key.parts,key.tuple,item,other)]);}else restA.push(item);}
     for(const item of right){const tuple=tupleOf(item);if(!(count(left,tuple)===1&&count(right,tuple)===1))restB.push(item);}
    }else{restA.push(...left);restB.push(...right);}
    if(restA.length||restB.length)entries.push([1,[],groupRow('multiple_rows',key.parts,key.tuple,restA,restB,ROW_REASONS.shared_key)]);
   }
  }else{
   const sideName=left.length?'a':'b',items=left.length?left:right,other=artifacts[sideName==='a'?'b':'a'];
   const reason=outsideOther(dataset,items[0].row,key,other,uic);
   if(reason)entries.push([0,[],items.length===1?singleRow(dataset,'outside_other_scope',key.parts,key.tuple,items[0],sideName,reason):groupRow('outside_other_scope',key.parts,key.tuple,sideName==='a'?items:[],sideName==='b'?items:[],reason)]);
   else if(items.length===1)entries.push([0,[],singleRow(dataset,`only_in_${sideName}`,key.parts,key.tuple,items[0],sideName,null)]);
   else entries.push([1,[],groupRow('multiple_rows',key.parts,key.tuple,sideName==='a'?items:[],sideName==='b'?items:[],ROW_REASONS.shared_key)]);
  }
  for(const [rank,identity,row] of entries)out.push({sort:[...key.tuple.map(item=>value(item)??''),...identity.map(item=>item??''),rank,JSON.stringify([key.space,key.complete,key.tuple])],row});
 }
 out.sort((x,y)=>compareTuple(x.sort,y.sort));
 return out.map(item=>item.row);
}

function compareRelations(a,b){
 const pairs=new Map(),read=(doc,sideName)=>{for(const [relation,entry] of Object.entries(doc.counts??{}))for(const [status,count] of Object.entries(entry?.by_status??{})){const id=JSON.stringify([relation,status]);if(!pairs.has(id))pairs.set(id,{relation,status,a:null,b:null});pairs.get(id)[sideName]=count;}};
 read(a.doc,'a');read(b.doc,'b');
 return [...pairs.values()].sort((x,y)=>compareTuple([x.relation,x.status],[y.relation,y.status])).map(item=>{
  const outcome=item.a===null?'only_in_b':item.b===null?'only_in_a':same(item.a,item.b)?'same':'values_differ';
  return {outcome,key:{relation:item.relation,status:item.status},a:[],b:[],fields:outcome==='same'?[]:[{field:'count',identity:false,a:item.a,b:item.b}],flags:null,disposition:null,reason:null};
 });
}

const emptyCounts=()=>Object.fromEntries(OUTCOMES.map(outcome=>[outcome,0]));
function compareDataset(dataset,sides,uic){
 const a=datasetSide(sides.a,dataset),b=datasetSide(sides.b,dataset),reason=comparability(dataset,a,b),comparable=reason===null;
 const artifacts={a:sides.a.artifact,b:sides.b.artifact};
 const rows=!comparable?[]:dataset==='relations'?compareRelations(a,b):compareRows(dataset,a,b,artifacts,uic);
 const counts=emptyCounts();for(const row of rows)counts[row.outcome]++;
 // Relations carry no row-level QC: the quality object keeps the section 6 shape with null sides.
 let quality={a:null,b:null,parent_join:null,issue_counts:[],paired_rows_with_qc_change:0};
 if(dataset!=='relations'){
  const ia=issueMap(dataset,a),ib=issueMap(dataset,b),flags=[...new Set([...Object.keys(ia??{}),...Object.keys(ib??{})])].sort(byString);
  const paired=rows.filter(row=>row.flags&&row.flags.a!==null&&row.flags.b!==null);
  quality={a:qualityCounts(a?.quality),b:qualityCounts(b?.quality),
   parent_join:['h10','bhp','srt'].includes(dataset)?{a:joinCounts(a?.parentJoin),b:joinCounts(b?.parentJoin)}:null,
   issue_counts:flags.map(flag=>({flag,a:ia?ia[flag]??0:null,b:ib?ib[flag]??0:null})),
   paired_rows_with_qc_change:paired.filter(row=>!same(row.flags.a,row.flags.b)||row.disposition.a!==row.disposition.b).length};
 }
 return {dataset,comparable,reason,key:[...COMPARISON_KEYS[dataset]],identity_fields:[...IDENTITY_FIELDS[dataset]],coverage:{a:coverage(dataset,a,artifacts.a),b:coverage(dataset,b,artifacts.b)},quality,counts,rows};
}

const sourceSide=source=>source?{sha256:value(source.sha256),bytes:value(source.bytes),url:value(source.url),retrieved_at:value(source.retrieved_at),etag:value(source.etag),last_modified:value(source.last_modified),http_status:value(source.http_status)}:null;
function compareSources(ma,mb){
 const names=new Map();
 for(const [sideName,manifest] of [['a',ma],['b',mb]])for(const source of manifest.sources??[]){if(!names.has(source.name))names.set(source.name,{a:null,b:null});names.get(source.name)[sideName]=source;}
 return [...names.keys()].sort(byString).map(name=>{
  const {a,b}=names.get(name),kinds=[...new Set([a?.kind,b?.kind].filter(kind=>typeof kind==='string'))].sort(byString),kind=kinds.length?kinds.join('|'):null;
  const classes=[...new Set(kinds.map(item=>SOURCE_CLASSES[item]??'other'))].sort(byString);
  return {name,kind,class:classes.length?classes.join('|'):null,a:sourceSide(a),b:sourceSide(b),bytes_equal:a&&b?a.sha256===b.sha256&&a.bytes===b.bytes:null};
 });
}

export function compareVersions(inputA,inputB){
 // Structured copies, deep-frozen: the caller's objects are never touched.
 const copy=side=>{const {tests=null,casing=null,plugging=null,relations=null,...artifact}=side;return deepFreeze(structuredClone({artifact,tests,casing,plugging,relations}));};
 if(!isObject(inputA)||!isObject(inputB))refuse('side_incomplete');
 const sides={a:copy(inputA),b:copy(inputB)};
 checkSide(sides.a);checkSide(sides.b);
 if(sides.a.artifact.artifactId===sides.b.artifact.artifactId)refuse('same_version');
 const uic=sides.a.artifact.manifest.scope.uic_number;
 if(uic!==sides.b.artifact.manifest.scope.uic_number)refuse('different_uic');
 const result={schemaVersion:1,comparison_version:COMPARISON_VERSION,uic_number:uic,
  sides:{a:sideInfo(sides.a.artifact),b:sideInfo(sides.b.artifact)},
  datasets:DATASETS.map(dataset=>compareDataset(dataset,sides,uic)),
  sources:compareSources(sides.a.artifact.manifest,sides.b.artifact.manifest),
  source_revisions:{a:sides.a.artifact.manifest.source_revisions??null,b:sides.b.artifact.manifest.source_revisions??null}};
 return structuredClone(result);
}
