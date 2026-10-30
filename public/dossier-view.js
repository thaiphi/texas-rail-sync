// RRC-15 read-only dossier (Phase 3b spec §7, ADR 004 §3-4): a table of edges from evidence_relations.json, checked
// against the already verified version before anything is shown. Pure: no network, storage or writes; the subject
// (artifactId, source_record_key) lives only in the route and the caller's module state.
import {escapeHtml as escape} from './inspection.js';
import {datasetRoute} from './navigation.js';
import {presenceSentence} from './wellbore-view.js';
import {ladderEntries,renderLadder} from './depth-ladder.js';

export const dossierCollected=manifest=>Boolean(manifest?.files&&typeof manifest.files==='object'&&Object.hasOwn(manifest.files,'evidence_relations.json'));

export const NOT_COLLECTED='The relation catalogue was not produced for this version. Versions before query version 5 keep their original files unchanged.';
export const CATALOGUE_VERSION='rrc-relations-v1';
export const RELATION_TYPES=Object.freeze(['inventory_to_h10','inventory_to_test_report','inventory_to_wellbore','wellbore_to_casing','wellbore_to_plugging','record_to_source_snapshot']);
const RELATION_KEYS=['relation','from_kind','from_key','to_kind','to_key','dataset','basis','status','reason','candidates','evidence'];
const ROW_KINDS=['inventory_record','h10_row','bhp_row','srt_row','casing_row','plugging_row'];
// Closed (relation, from_kind, to_kind) table (spec §3); any other triple fails the check.
export const ALLOWED_TRIPLES=Object.freeze([
 ['inventory_to_h10','inventory_record','h10_row'],['inventory_to_test_report','inventory_record','bhp_row'],['inventory_to_test_report','inventory_record','srt_row'],
 ['inventory_to_wellbore','inventory_record','wellbore'],['wellbore_to_casing','wellbore','casing_row'],['wellbore_to_plugging','wellbore','plugging_row'],
 ...ROW_KINDS.map(kind=>['record_to_source_snapshot',kind,'source_snapshot'])].map(triple=>Object.freeze(triple)));
const STATUSES={inventory_to_h10:['matched','unmatched','ambiguous'],inventory_to_test_report:['matched','unmatched','ambiguous'],inventory_to_wellbore:['matched','none','ambiguous'],wellbore_to_casing:['matched'],wellbore_to_plugging:['matched'],record_to_source_snapshot:[null]};
const UNATTRIBUTED=['unmatched','ambiguous'];
const TAB_FOR_KIND={inventory_record:'records',h10_row:'records',bhp_row:'tests',srt_row:'tests',wellbore:'wellbore',casing_row:'wellbore',plugging_row:'wellbore',source_snapshot:'sources'};

const shown=value=>value===null||value===undefined||value===''?'none':String(value);
const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const rowsOf=value=>Array.isArray(value)?value:[];

class Unreconciled extends Error{}
const fail=reason=>{throw new Unreconciled(reason);};

// Resolution tables, one per kind; a key is only ever resolved against the table its kind names (OD-3).
function tables(state){
 const {artifact,tests,casing,plugging}=state,manifest=artifact?.manifest;
 const index=(rows,field)=>{const map=new Map();for(const row of rowsOf(rows))if(typeof row?.[field]==='string'&&!map.has(row[field]))map.set(row[field],row);return map;};
 const wellbore=new Map();for(const [dataset,doc] of [['casing',casing],['plugging',plugging]])if(typeof doc?.link?.source_api_id==='string')wellbore.set(doc.link.source_api_id,(wellbore.get(doc.link.source_api_id)??[]).concat(dataset));
 const snapshots=new Map();for(const source of rowsOf(manifest?.sources))if(typeof source?.snapshot_id==='string')snapshots.set(source.snapshot_id,(snapshots.get(source.snapshot_id)??[]).concat(source));
 return {inventory_record:index(artifact?.inventory,'source_record_key'),h10_row:index(artifact?.injectionMonthly,'source_row_key'),bhp_row:index(tests?.bhp,'source_row_key'),srt_row:index(tests?.srt,'source_row_key'),
  casing_row:index(casing?.rows,'source_row_key'),plugging_row:index(plugging?.rows,'source_row_key'),wellbore,source_snapshot:snapshots};
}
function nullAllowed(relation,side){
 if(side==='from')return ['inventory_to_h10','inventory_to_test_report'].includes(relation.relation)&&relation.status!=='matched';
 return relation.relation==='inventory_to_wellbore'&&relation.status==='none'&&relation.reason==='api_missing_or_invalid';
}
function checkRelation(relation,position,state,lookup){
 const where=`relation ${position+1}`;
 if(!isObject(relation))fail(`${where} is not an object`);
 const keys=Object.keys(relation);if(keys.length!==RELATION_KEYS.length||RELATION_KEYS.some(key=>!keys.includes(key)))fail(`${where} does not carry exactly the ${RELATION_KEYS.length} relation fields`);
 if(!RELATION_TYPES.includes(relation.relation))fail(`${where} has relation type ${shown(relation.relation)} outside ${CATALOGUE_VERSION}`);
 if(!ALLOWED_TRIPLES.some(([name,from,to])=>name===relation.relation&&from===relation.from_kind&&to===relation.to_kind))fail(`${where} (${relation.relation}, ${shown(relation.from_kind)} → ${shown(relation.to_kind)}) is not a permitted relation`);
 if(!STATUSES[relation.relation].includes(relation.status))fail(`${where} status ${shown(relation.status)} is outside the ${relation.relation} vocabulary`);
 if(!Array.isArray(relation.candidates))fail(`${where} candidates is not a list`);
 for(const side of ['from','to']){
  const kind=relation[`${side}_kind`],key=relation[`${side}_key`];
  if(key===null){if(!nullAllowed(relation,side))fail(`${where} ${side}_key is missing`);continue;}
  if(typeof key!=='string'||!lookup[kind].has(key))fail(`${where} ${side}_key ${shown(key)} does not resolve to a ${kind} of this version`);
 }
 const evidence=relation.evidence,files=state.artifact.manifest.files;
 if(!Array.isArray(evidence)||!evidence.length)fail(`${where} lists no evidence file`);
 for(const item of evidence){
  if(!isObject(item)||typeof item.file!=='string'||!item.file.startsWith('sources/')||item.file.split('/').includes('..'))fail(`${where} evidence is not a sources/ file`);
  if(!Object.hasOwn(files,item.file)||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256)||files[item.file]?.sha256!==item.sha256)fail(`${where} evidence ${item.file} does not match the verified manifest SHA-256`);
 }
 // Cross-checks against the verified rows: the catalogue may not contradict the files it describes.
 const from=relation.from_key===null?null:lookup[relation.from_kind].get(relation.from_key),to=relation.to_key===null?null:lookup[relation.to_kind].get(relation.to_key);
 if(relation.relation==='inventory_to_h10'||relation.relation==='inventory_to_test_report'){
  if(to?.parent_join_status!==relation.status||(to?.parent_key??null)!==relation.from_key)fail(`${where} does not repeat the row's parent_join_status and parent_key`);
 }else if(relation.relation==='inventory_to_wellbore'){
  const doc=relation.dataset==='casing'?state.casing:relation.dataset==='plugging'?state.plugging:null,link=doc?.link;
  if(!link||link.status!==relation.status||(link.reason??null)!==relation.reason||link.inventory_source_record_key!==relation.from_key||(link.source_api_id??null)!==relation.to_key)fail(`${where} does not repeat the ${shown(relation.dataset)} wellbore link`);
 }else if(relation.relation==='wellbore_to_casing'||relation.relation==='wellbore_to_plugging'){
  if(to?.source_api_id!==relation.from_key)fail(`${where} row source_api_id differs from the wellbore key`);
 }else{
  const sources=lookup.source_snapshot.get(relation.to_key)??[];
  if(evidence.length!==1||!sources.some(source=>source.raw_file===evidence[0].file)||from?.source_snapshot_id!==relation.to_key)fail(`${where} snapshot ${shown(relation.to_key)} does not match the record's source file`);
 }
}
function checkCounts(catalogue){
 const counts=catalogue.counts;if(!isObject(counts))fail('counts is missing');
 for(const name of Object.keys(counts))if(!RELATION_TYPES.includes(name))fail(`counts lists unknown relation ${name}`);
 for(const name of RELATION_TYPES){
  const edges=catalogue.relations.filter(relation=>relation.relation===name),stated=counts[name];
  if(stated===undefined){if(edges.length)fail(`counts omits ${name}`);continue;}
  if(!isObject(stated)||stated.total!==edges.length)fail(`counts.${name}.total does not equal a recount of relations`);
  const recount={};for(const edge of edges)if(edge.status!==null)recount[edge.status]=(recount[edge.status]??0)+1;
  const by=isObject(stated.by_status)?stated.by_status:fail(`counts.${name}.by_status is missing`);
  // A null status cannot be a JSON key: accept {} or {"null":n} for null-status relations, strict for the rest.
  const nulls=edges.filter(edge=>edge.status===null).length;
  for(const [status,n] of Object.entries(by)){if(n===0)continue;if(status==='null'&&n===nulls&&nulls)continue;if(recount[status]!==n)fail(`counts.${name}.by_status.${status} does not equal a recount`);}
  for(const [status,n] of Object.entries(recount))if(by[status]!==n)fail(`counts.${name}.by_status.${status} does not equal a recount`);
 }
}

// Disposition lookups by kind: quality_report (inventory, H-10), tests.json, casing.json / plugging.json.
function dispositions(state){
 const quality=state.artifact.qualityReport??{},map=new Map(),put=(lane,item)=>{if(typeof (item?.source_row_key??item?.source_record_key)==='string')map.set(`${lane}\u0000${item.source_row_key??item.source_record_key}`,item);};
 for(const item of rowsOf(quality.dispositions))put('h10',item);
 const inventory=rowsOf(quality.inventory_dispositions);
 if(inventory.length)for(const item of inventory)put('inventory',item);
 // Without inventory_dispositions every inventory row is accepted exactly when the quality counts say so.
 else if(quality.inventory?.quarantined===0&&quality.inventory?.excluded===0&&quality.inventory?.accepted===state.artifact.inventory?.length)for(const row of rowsOf(state.artifact.inventory))map.set(`inventory\u0000${row.source_record_key}`,{disposition:'accepted'});
 for(const item of rowsOf(state.tests?.quality?.dispositions)){const lane=state.tests?.bhp?.some(row=>row.source_row_key===item?.source_row_key)?'bhp':'srt';put(lane,item);}
 for(const lane of ['casing','plugging'])for(const item of rowsOf(state[lane]?.quality?.dispositions))put(lane,item);
 return map;
}

// Section 7.4 item 3: related + unattributed must equal the quality raw count with the same accepted/quarantined split.
function groups(state,catalogue,subject,attributedApi,disposition){
 const quality=state.artifact.qualityReport??{},tests=state.tests?.quality??{};
 const specs=[
  {label:'H-10',lane:'h10',edges:catalogue.relations.filter(edge=>edge.relation==='inventory_to_h10'),related:edge=>edge.from_key===subject,counts:quality.monthly},
  {label:'BHP',lane:'bhp',edges:catalogue.relations.filter(edge=>edge.relation==='inventory_to_test_report'&&edge.to_kind==='bhp_row'),related:edge=>edge.from_key===subject,counts:tests.bhp},
  {label:'SRT',lane:'srt',edges:catalogue.relations.filter(edge=>edge.relation==='inventory_to_test_report'&&edge.to_kind==='srt_row'),related:edge=>edge.from_key===subject,counts:tests.srt},
  {label:'Casing',lane:'casing',edges:catalogue.relations.filter(edge=>edge.relation==='wellbore_to_casing'),related:edge=>attributedApi.casing!==null&&edge.from_key===attributedApi.casing,counts:state.casing?.quality?.counts},
  {label:'Plugging',lane:'plugging',edges:catalogue.relations.filter(edge=>edge.relation==='wellbore_to_plugging'),related:edge=>attributedApi.plugging!==null&&edge.from_key===attributedApi.plugging,counts:state.plugging?.quality?.counts}];
 return specs.map(spec=>{
  const counts=spec.counts;if(!isObject(counts)||!['raw','accepted','quarantined','excluded'].every(key=>Number.isSafeInteger(counts[key])))fail(`${spec.label} quality counts are unavailable`);
  const split=edges=>{let accepted=0,quarantined=0;for(const edge of edges){const value=disposition.get(`${spec.lane}\u0000${edge.to_key}`)?.disposition;if(value==='accepted')accepted++;else if(value==='quarantined')quarantined++;}return {accepted,quarantined};};
  const related=spec.edges.filter(spec.related),unattributed=spec.edges.filter(edge=>!spec.related(edge)),all=split(spec.edges),mine=split(related);
  if(spec.edges.length!==counts.raw)fail(`${spec.label} has ${spec.edges.length} related and unattributed rows but the quality report lists ${counts.raw} raw`);
  if(all.accepted!==counts.accepted||all.quarantined!==counts.quarantined)fail(`${spec.label} accepted/quarantined split differs from the quality report`);
  return {label:spec.label,text:`${spec.label}: ${related.length} related rows = ${mine.accepted} accepted + ${mine.quarantined} quarantined (quality report: ${counts.raw} raw = ${counts.accepted} accepted + ${counts.quarantined} quarantined + ${counts.excluded} excluded). Not attributed to this record: ${unattributed.length}.`};
 });
}

// Pure consistency check (spec §7.3). Returns {ok:true, ...derived} or {ok:false, reason}; never throws.
export function reconcileDossier(state){
 try{
  const {artifact,catalogue}=state??{};
  if(!isObject(artifact?.manifest?.files))fail('the verified manifest is unavailable');
  if(!isObject(catalogue))fail('evidence_relations.json is not an object');
  if(catalogue.schemaVersion!==1)fail('schemaVersion is not 1');
  if(catalogue.artifactId!==artifact.artifactId)fail('artifactId names another version');
  if(catalogue.catalogue_version!==CATALOGUE_VERSION)fail(`catalogue_version is not ${CATALOGUE_VERSION}`);
  if(!Array.isArray(catalogue.relation_types)||catalogue.relation_types.length!==RELATION_TYPES.length||catalogue.relation_types.some((name,index)=>name!==RELATION_TYPES[index]))fail('relation_types is not the closed rrc-relations-v1 list');
  if(!Array.isArray(catalogue.relations))fail('relations is not a list');
  for(const [name,doc] of [['tests.json',state.tests],['casing.json',state.casing],['plugging.json',state.plugging]])if(!isObject(doc)||doc.artifactId!==artifact.artifactId)fail(`${name} is unavailable or names another version`);
  const lookup=tables(state);
  catalogue.relations.forEach((relation,position)=>checkRelation(relation,position,state,lookup));
  checkCounts(catalogue);
  const subject=state.subjectKey,record=lookup.inventory_record.get(subject);
  if(!record)return {ok:true,unknown:true};
  const links=catalogue.relations.filter(edge=>edge.relation==='inventory_to_wellbore'&&edge.from_key===subject);
  const attributedApi={casing:null,plugging:null},ambiguousApi={casing:null,plugging:null};
  for(const edge of links){if(edge.status==='matched')attributedApi[edge.dataset]=edge.to_key;if(edge.status==='ambiguous')ambiguousApi[edge.dataset]=edge.to_key;}
  const disposition=dispositions(state);
  return {ok:true,record,links,attributedApi,ambiguousApi,disposition,groups:groups(state,catalogue,subject,attributedApi,disposition)};
 }catch(error){
  if(error instanceof Unreconciled)return {ok:false,reason:error.message};
  return {ok:false,reason:`unreadable relation catalogue (${String(error?.message??error)})`};
 }
}

function keyCell(artifactId,kind,key){
 if(key===null)return `<span class="note">${escape(kind)}</span><br>none`;
 const tab=TAB_FOR_KIND[kind],label=`<code>${escape(key)}</code>`;
 const href=tab?datasetRoute(artifactId,tab):null;
 return `<span class="note">${escape(kind)}</span><br>${href?`<a href="${escape(href)}" aria-label="Open the ${escape(tab)} tab for ${escape(kind)} ${escape(key)}">${label}</a>`:label}`;
}
const evidenceCell=evidence=>rowsOf(evidence).map(item=>`${escape(item.file)}<br>SHA-256 <code>${escape(item.sha256)}</code>`).join('<br>');
const EDGE_HEAD='<thead><tr><th scope="col">Relation</th><th scope="col">From (kind / key)</th><th scope="col">To (kind / key)</th><th scope="col">Dataset</th><th scope="col">Basis</th><th scope="col">Status</th><th scope="col">Reason</th><th scope="col">Evidence (file and full SHA-256)</th><th scope="col">Candidates</th></tr></thead>';
function edgeTable(edges,{artifactId,label,caption}){
 const body=edges.map(edge=>`<tr><th scope="row">${escape(edge.relation)}</th><td>${keyCell(artifactId,edge.from_kind,edge.from_key)}</td><td>${keyCell(artifactId,edge.to_kind,edge.to_key)}</td><td>${escape(shown(edge.dataset))}</td><td>${escape(shown(edge.basis))}</td><td>${escape(edge.status===null?'not applicable':edge.status)}</td><td>${escape(shown(edge.reason))}</td><td>${evidenceCell(edge.evidence)}</td><td>${edge.candidates.length}</td></tr>`).join('');
 return `<div class="scroll-table" tabindex="0" role="region" aria-label="${escape(label)}"><table><caption>${escape(caption)}</caption>${EDGE_HEAD}<tbody>${body||'<tr><td colspan="9">No relations of the selected type.</td></tr>'}</tbody></table></div>`;
}
// Candidates are listed as published; only inventory rows of this version are links (spec §7.2). No name matching.
function candidateTable(edge,{artifactId,inventoryKeys},index){
 const rows=edge.candidates.map(candidate=>{
  const key=typeof candidate==='string'?candidate:candidate?.candidate_key,keyText=`<code>${escape(shown(key))}</code>`;
  const link=typeof key==='string'&&inventoryKeys.has(key)?`<a href="${escape(datasetRoute(artifactId,'dossier',key))}">${keyText}</a>`:keyText;
  const marked=typeof candidate==='string'?'Inventory candidate':candidate?.selected===true?'Selected inventory row':'Other permit';
  return `<tr class="${candidate?.selected===true?'selected':''}"><th scope="row">${link}</th><td>${escape(marked)}</td><td>${escape(typeof candidate==='string'?'—':shown(candidate?.uic_number))}</td><td>${escape(typeof candidate==='string'?'—':shown(candidate?.api_no))}</td></tr>`;}).join('');
 return `<div class="scroll-table" tabindex="0" role="region" aria-label="Candidates for ${escape(edge.relation)} ${index+1}"><table><caption>All ${edge.candidates.length} candidates of ${escape(edge.relation)} (${escape(edge.status)}${edge.reason?', '+escape(edge.reason):''}) in published order; none is chosen for this record.</caption><thead><tr><th scope="col">Candidate key</th><th scope="col">Marked</th><th scope="col">UIC</th><th scope="col">API</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
const filterControl=filter=>`<div class="dossier-filter"><label for="dossier-relation-filter">Show relation type</label><select id="dossier-relation-filter"><option value="">All relation types</option>${RELATION_TYPES.map(name=>`<option value="${name}"${filter===name?' selected':''}>${name}</option>`).join('')}</select></div>`;

export function renderDossierView(state){
 if(state?.status==='not_collected')return `<div class="empty"><h3>Not collected</h3><p>${escape(NOT_COLLECTED)}</p></div>`;
 if(state?.status==='loading')return '<p class="notice" role="status">Verifying the relation catalogue and related files against this version…</p>';
 if(state?.status==='unknown_key')return `<p class="notice warning" role="alert">This record is not part of version ${escape(shown(state.artifactId))}.</p>`;
 if(state?.status==='no_subject')return `<p class="notice warning" role="alert">No inventory row of version ${escape(shown(state.artifactId))} carries its scope UIC. Open a record from the Records tab to choose a subject.</p>`;
 if(state?.status!=='loaded')return `<p class="notice danger" role="alert">Dossier unavailable: ${escape(state?.message??'unknown error')}. No dossier is shown for this version.</p>`;
 const check=reconcileDossier(state);
 if(!check.ok)return `<p class="notice danger" role="alert">Relation catalogue does not reconcile with this version: ${escape(check.reason)}. No dossier is shown.</p>`;
 const {artifact,catalogue,subjectKey}=state;
 if(check.unknown)return renderDossierView({status:'unknown_key',artifactId:artifact.artifactId});
 const {record,links,attributedApi,ambiguousApi,disposition}=check,artifactId=artifact.artifactId,filter=RELATION_TYPES.includes(state.filter)?state.filter:'';
 const inventoryKeys=new Set(rowsOf(artifact.inventory).map(row=>row.source_record_key)),context={artifactId,inventoryKeys};
 const relations=catalogue.relations,pick=edges=>filter?edges.filter(edge=>edge.relation===filter):edges;
 const underAmbiguous=edge=>(edge.relation==='wellbore_to_casing'&&ambiguousApi.casing!==null&&edge.from_key===ambiguousApi.casing)||(edge.relation==='wellbore_to_plugging'&&ambiguousApi.plugging!==null&&edge.from_key===ambiguousApi.plugging);
 const main=relations.filter(edge=>(edge.from_kind==='inventory_record'&&edge.from_key===subjectKey&&!UNATTRIBUTED.includes(edge.status))||(edge.relation==='wellbore_to_casing'&&attributedApi.casing!==null&&edge.from_key===attributedApi.casing)||(edge.relation==='wellbore_to_plugging'&&attributedApi.plugging!==null&&edge.from_key===attributedApi.plugging));
 const notAttributed=relations.filter(edge=>UNATTRIBUTED.includes(edge.status)||underAmbiguous(edge));
 const records=new Set([`inventory_record\u0000${subjectKey}`,...main.filter(edge=>ROW_KINDS.includes(edge.to_kind)&&edge.to_key!==null).map(edge=>`${edge.to_kind}\u0000${edge.to_key}`)]);
 const snapshots=relations.filter(edge=>edge.relation==='record_to_source_snapshot'&&records.has(`${edge.from_kind}\u0000${edge.from_key}`));
 const identity=[['Version (artifact ID)',artifactId],['source_record_key',record.source_record_key],['UIC',record.uic_number],['API (verbatim)',record.api_no],['Lease',record.lease_name],['Well number',record.well_no_display],['Operator number',record.operator_number],['Relation catalogue',catalogue.catalogue_version]];
 const linkList=links.length?`<ul class="dossier-links">${links.map(edge=>`<li><strong>${escape(edge.dataset)}</strong>: ${escape(edge.status)}${edge.reason?' · '+escape(edge.reason):''} · API ${escape(shown(edge.to_key))}. ${escape(presenceSentence(edge.dataset,{status:edge.status,reason:edge.reason})??'Link status unavailable; no presence statement is made.')}</li>`).join('')}</ul>`:'<p class="note">No inventory-to-wellbore relation starts at this record.</p>';
 const unattributedHtml=notAttributed.length?`${edgeTable(pick(notAttributed),{...context,label:'Relations not attributed to this record',caption:'Relations whose status is unmatched or ambiguous, and wellbore rows under an ambiguous link. They are listed with all candidates and never folded into this record.'})}${pick(notAttributed).filter(edge=>edge.candidates.length).map((edge,index)=>candidateTable(edge,context,index)).join('')}`:'<p class="note">No unmatched or ambiguous relations in this version.</p>';
 const related=kind=>new Set(main.filter(edge=>edge.to_kind===kind).map(edge=>edge.to_key));
 const ladder=renderLadder(ladderEntries({inventory:record,dataDictionary:artifact.dataDictionary,testsDictionary:state.testsDictionary,wellboreDictionary:state.wellboreDictionary,dispositions:disposition,
  bhp:rowsOf(state.tests?.bhp).filter(row=>related('bhp_row').has(row.source_row_key)),srt:rowsOf(state.tests?.srt).filter(row=>related('srt_row').has(row.source_row_key)),
  casing:attributedApi.casing!==null?{rows:rowsOf(state.casing?.rows).filter(row=>related('casing_row').has(row.source_row_key)),attributed:true}:ambiguousApi.casing!==null?{rows:rowsOf(state.casing?.rows).filter(row=>row.source_api_id===ambiguousApi.casing),attributed:false}:{rows:[],attributed:true},
  plugging:attributedApi.plugging!==null?{rows:rowsOf(state.plugging?.rows).filter(row=>related('plugging_row').has(row.source_row_key)),attributed:true}:ambiguousApi.plugging!==null?{rows:rowsOf(state.plugging?.rows).filter(row=>row.source_api_id===ambiguousApi.plugging),attributed:false}:{rows:[],attributed:true}}));
 return `<section class="panel padded dossier-identity" aria-labelledby="dossier-subject"><h3 id="dossier-subject">Record ${escape(record.source_record_key)} <small class="badge">public reported</small></h3><dl class="facts">${identity.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(shown(value))}</dd></div>`).join('')}</dl><p class="note">Relations assert exact string equality of source keys only. A matched wellbore link does not establish one physical wellbore.</p>${linkList}</section>`+
  `<section class="panel padded dossier-groups" aria-labelledby="dossier-groups-title"><h3 id="dossier-groups-title">Related rows by dataset</h3><ul>${check.groups.map(group=>`<li>${escape(group.text)}</li>`).join('')}</ul></section>`+
  `<section class="panel padded dossier-edges" aria-labelledby="dossier-edges-title"><h3 id="dossier-edges-title">Relations of this record</h3>${filterControl(filter)}${edgeTable(pick(main),{...context,label:`Relations of record ${record.source_record_key}`,caption:'Every relation starting at this record, and every wellbore row relation from its matched API, in catalogue order. Key links open the tab that shows the record.'})}<details><summary>Source file of each related record (record_to_source_snapshot, ${snapshots.length})</summary>${edgeTable(pick(snapshots),{...context,label:'Source file relations of the related records',caption:'The one preserved source file each related record was parsed from, with its full SHA-256.'})}</details></section>`+
  `<section class="panel padded dossier-unattributed" aria-labelledby="dossier-unattributed-title"><h3 id="dossier-unattributed-title">Not attributed</h3>${unattributedHtml}</section>`+
  `<section class="panel padded dossier-ladder">${ladder}</section>`;
}
