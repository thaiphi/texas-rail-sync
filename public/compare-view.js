// RRC-16 read-only compare screen (Phase 4 spec §7): pure renderers over the compareVersions result (spec §6).
// No network, storage or writes; the pair lives only in the route and the caller's module state. The page
// describes differences between two preserved versions and never judges either one (spec §7.3 fixed wording).
import {escapeHtml as escape} from './inspection.js';
import {datasetRoute,localTime} from './navigation.js';

export const OUTCOMES=Object.freeze(['same','identity_differs','values_differ','only_in_a','only_in_b','outside_other_scope','multiple_rows']);
export const OUTCOME_LABELS=Object.freeze({same:'Same values',identity_differs:'Same values, different report identity',values_differ:'Values differ',only_in_a:'Only in A',only_in_b:'Only in B',outside_other_scope:'Outside the other version\'s scope',multiple_rows:'Several rows share this key (not row-matched)',not_comparable:'Not comparable'});
export const DATASET_LABELS=Object.freeze({inventory:'Inventory',h10:'H-10 monthly reports',bhp:'BHP test reports',srt:'SRT test reports',casing:'Casing filing records',plugging:'Plugging filing records',relations:'Relation catalogue counts'});
export const REASON_TEXT=Object.freeze({not_collected_in_a:'not collected in A',not_collected_in_b:'not collected in B',not_collected_in_either:'not collected in either version',not_queried_in_a:'not queried in A',not_queried_in_b:'not queried in B',not_queried_in_either:'not queried in either version',different_source_api_id:'the two versions queried different source API numbers'});
export const FIXED_SENTENCE='This page describes differences between two preserved versions. It does not say which is correct.';
export const CALCULATED_SENTENCE='Calculated columns follow each version\'s own transformation version.';
export const ONLY_LISTED='Only preserved versions listed by this server can be compared.';
export const noOtherVersion=uic=>`No other preserved version of UIC ${uic}.`;

const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];
// JSON-faithful cell text: null, "", 0, "1" and 1 stay distinguishable (spec §3 verbatim comparison).
const literal=value=>value===undefined?'not present':typeof value==='string'?JSON.stringify(value):JSON.stringify(value)??String(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const marker=(a,b)=>same(a,b)?'Equal':'Differs';
const month=value=>typeof value==='string'&&/^\d{4}-\d{2}/.test(value)?value.slice(0,7):literal(value);
const datasetLabel=name=>DATASET_LABELS[name]??String(name);
export const reasonText=reason=>REASON_TEXT[reason]??String(reason??'reason not stated');
const region=(label,caption,head,body)=>`<div class="scroll-table" tabindex="0" role="region" aria-label="${escape(label)}"><table><caption>${caption}</caption><thead><tr>${head.map(cell=>`<th scope="col">${escape(cell)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

// candidate-monthly.retrieved_at is the side's collection time (spec §6, OD-5); every committed version has it.
export function collectedAt(manifest){
 const value=list(manifest?.sources).find(source=>source?.name==='candidate-monthly')?.retrieved_at;
 if(typeof value!=='string'||!value)throw Error('candidate-monthly retrieval time unavailable');
 return value;
}
// OD-5: A is the earlier collection; ties fall back to artifact ID (code-unit order).
export function orderSides(x,y){
 const ta=Date.parse(x.collected_at),tb=Date.parse(y.collected_at);
 const before=Number.isFinite(ta)&&Number.isFinite(tb)&&ta!==tb?ta<tb:x.artifactId<y.artifactId;
 return before?[x,y]:[y,x];
}
// One verified side for compareVersions: the verified normalized artifact plus each verified sidecar it lists.
export function compareSide(artifact,sidecars={}){
 return {...artifact,tests:sidecars.tests??null,casing:sidecars.casing??null,plugging:sidecars.plugging??null,relations:sidecars.relations??null};
}
// compareVersions throws COMPARE_REFUSED for an incomparable pair (spec §4); any other failure is a verification error.
export function compareFailure(error){
 const message=String(error?.message??error??'unknown failure');
 if(error?.code==='COMPARE_REFUSED'||error?.name==='COMPARE_REFUSED'||/COMPARE_REFUSED/.test(message))return {status:'refused',reason:String(error?.reason??message.replace(/^\s*COMPARE_REFUSED\s*[:\-]?\s*/,''))||'pair not comparable'};
 return {status:'error',message};
}
// Version-picker entry (spec §7.1): only server-listed versions with the same verified UIC are offered (OD-4).
export function compareEntry({artifactId,versions=[],verified=new Map(),listed=true,pending=0}){
 if(!listed)return {uic:null,candidates:[],note:ONLY_LISTED};
 const uic=verified.get(artifactId)?.manifest?.scope?.uic_number??null;
 if(uic===null)return {uic:null,candidates:[],note:'Comparison is offered once this version is verified.'};
 const candidates=versions.map(version=>version?.artifactId).filter(id=>id&&id!==artifactId&&verified.get(id)?.manifest?.scope?.uic_number===uic);
 return {uic,candidates,note:candidates.length?null:pending?`Verifying other preserved versions of UIC ${uic}…`:noOtherVersion(uic)};
}
export const compareOptions=candidates=>candidates.map(id=>`<option value="${escape(id)}">${escape(id)}</option>`).join('');

function windowText(window){
 if(!isObject(window))return 'Not stated';
 return window.end===null||window.end===undefined?`from ${month(window.start)}, no end stated`:`${month(window.start)} – ${month(window.end)}`;
}
function header(result){
 const {a,b}=result.sides??{},side=(item,role)=>`<code>${escape(item?.artifact_id??'Unavailable')}</code><br><small>${role}</small>`;
 const link=item=>{try{return `<a href="${escape(datasetRoute(item?.artifact_id,'overview'))}">Open this version</a>`;}catch{return 'Version link unavailable';}};
 const time=item=>typeof item?.collected_at==='string'?`<time datetime="${escape(item.collected_at)}">${escape(item.collected_at)}</time><br><small>${escape(localTime(item.collected_at))}</small>`:'Unavailable';
 const query=item=>item?.query_version===null||item?.query_version===undefined?'v1 shape, no query version':escape(String(item.query_version));
 const rows=[['Version',side(a,'A · collected earlier'),side(b,'B · collected later')],['Version pages',link(a),link(b)],['Collected (candidate-monthly retrieved_at)',time(a),time(b)],['Query version',query(a),query(b)],['Transformation version',escape(literal(a?.transformation_version)),escape(literal(b?.transformation_version))],['H-10 reporting window',escape(windowText(a?.window)),escape(windowText(b?.window))]];
 return `<p class="scope-note"><strong>UIC ${escape(result.uic_number??'Unavailable')}</strong><span>${escape(FIXED_SENTENCE)}</span></p>`+
  region('Compared versions','A is the version collected earlier, B the version collected later. '+escape(CALCULATED_SENTENCE),['Fact','A','B'],rows.map(([label,x,y])=>`<tr><th scope="row">${escape(label)}</th><td>${x}</td><td>${y}</td></tr>`).join(''))+
  `<p class="note">Rows are matched by native source identity (the key columns listed per dataset), never by row position. Row references (source_row_key, source_record_key) are each version's own and are not compared. If the source issues a new key for the same record, it reads as Only in A plus Only in B.</p>`;
}
function summary(result){
 const body=list(result.datasets).map(item=>`<tr><th scope="row">${escape(datasetLabel(item.dataset))}</th>${item.comparable?OUTCOMES.map(outcome=>`<td>${escape(String(item.counts?.[outcome]??0))}</td>`).join(''):`<td colspan="${OUTCOMES.length}">${escape(OUTCOME_LABELS.not_comparable)}: ${escape(reasonText(item.reason))}</td>`}</tr>`).join('');
 return `<section class="panel compare-block" aria-labelledby="compare-summary-title"><h2 id="compare-summary-title">Summary by dataset</h2>`+region('Outcome counts by dataset','Rows per outcome for each dataset. A dataset not collected or not queried in a version is not comparable; it is never counted as missing.',['Dataset',...OUTCOMES.map(outcome=>OUTCOME_LABELS[outcome])],body)+'</section>';
}
function pairRows(label,a,b){
 const keys=[...new Set([...Object.keys(isObject(a)?a:{}),...Object.keys(isObject(b)?b:{})])];
 return keys.map(key=>`<tr><th scope="row">${escape(label?label+' · '+key:key)}</th><td>${escape(isObject(a)?literal(a[key]):'Not collected')}</td><td>${escape(isObject(b)?literal(b[key]):'Not collected')}</td><td>${isObject(a)&&isObject(b)?marker(a[key],b[key]):'Stated in one version only'}</td></tr>`).join('');
}
function coverage(item){
 const body=pairRows('',item.coverage?.a,item.coverage?.b);
 return region(`${datasetLabel(item.dataset)} coverage, A and B`,`${escape(datasetLabel(item.dataset))} coverage. Each value is shown as published in that version.`,['Coverage item','A','B','A and B'],body||'<tr><td colspan="4">No coverage values stated.</td></tr>');
}
function quality(item){
 const q=item.quality;if(!isObject(q))return '<p class="note">No quality counts stated for this dataset.</p>';
 const counts=['raw','parsed','accepted','quarantined','excluded'].map(key=>`<tr><th scope="row">${key}</th><td>${escape(literal(q.a?.[key]))}</td><td>${escape(literal(q.b?.[key]))}</td><td>${marker(q.a?.[key],q.b?.[key])}</td></tr>`).join('');
 const join=isObject(q.parent_join)?(isObject(q.parent_join.a)||isObject(q.parent_join.b)?pairRows('parent_join',q.parent_join.a,q.parent_join.b):`<tr><th scope="row">parent_join</th><td>${escape(literal(q.parent_join.a))}</td><td>${escape(literal(q.parent_join.b))}</td><td>${marker(q.parent_join.a,q.parent_join.b)}</td></tr>`):'';
 const issues=list(q.issue_counts).map(issue=>`<tr><th scope="row">issue · ${escape(String(issue?.flag))}</th><td>${escape(literal(issue?.a))}</td><td>${escape(literal(issue?.b))}</td><td>${marker(issue?.a,issue?.b)}</td></tr>`).join('');
 return region(`${datasetLabel(item.dataset)} quality counts, A and B`,`${escape(datasetLabel(item.dataset))} quality counts and recorded issue counts. A flag absent from a version's quality report is shown as 0. Paired rows with a different disposition or quality_flags list: ${escape(literal(q.paired_rows_with_qc_change))}.`,['Quality item','A','B','A and B'],counts+join+issues);
}
const keyText=key=>isObject(key)?Object.entries(key).map(([field,value])=>`${field} = ${literal(value)}`).join(' · '):literal(key);
const refs=items=>list(items).length?list(items).map(item=>`<code>${escape(String(item))}</code>`).join('<br>'):'None';
function rowHtml(row){
 const fields=list(row.fields).length?`<ul class="compare-fields">${list(row.fields).map(field=>`<li><code>${escape(String(field?.field))}</code>${field?.identity?' <small>(identity)</small>':''}: ${escape(literal(field?.a))} → ${escape(literal(field?.b))}</li>`).join('')}</ul>`:'None';
 const sideValue=(value,role)=>value===null||value===undefined?`no row in ${role}`:literal(value);
 const flags=isObject(row.flags)?`A ${escape(sideValue(row.flags.a,'A'))}<br>B ${escape(sideValue(row.flags.b,'B'))}${row.flags.a!==null&&row.flags.b!==null&&!same(row.flags.a,row.flags.b)?'<br><small>quality_flags differ</small>':''}`:'Not applicable';
 const disposition=side=>isObject(row.disposition)?escape(sideValue(row.disposition[side],side.toUpperCase())):'Not applicable';
 return `<tr data-outcome="${escape(String(row.outcome))}"><td>${escape(OUTCOME_LABELS[row.outcome]??String(row.outcome))}${row.reason?`<br><small>${escape(String(row.reason))}</small>`:''}</td><th scope="row">${escape(keyText(row.key))}</th><td>${refs(row.a)}</td><td>${refs(row.b)}</td><td>${fields}</td><td>${disposition('a')}</td><td>${disposition('b')}</td><td>${flags}</td></tr>`;
}
const ROW_HEAD=['Outcome','Key','A row reference','B row reference','Differing fields (A → B)','A disposition','B disposition','quality_flags (A, B)'];
function rowTables(item,outcome){
 const rows=list(item.rows).filter(row=>!outcome||row.outcome===outcome),label=datasetLabel(item.dataset),sameRows=rows.filter(row=>row.outcome==='same'),other=rows.filter(row=>row.outcome!=='same');
 const keyNote=`Key: ${list(item.key).join(' + ')||'not stated'}${list(item.identity_fields).length?`; identity fields compared and listed separately: ${list(item.identity_fields).join(', ')}`:''}.`;
 if(!list(item.rows).length)return `<p class="note">${escape(keyNote)} Neither version has rows for this dataset.</p>`;
 if(!rows.length)return `<p class="note">${escape(keyNote)} No rows match the outcome filter.</p>`;
 const main=other.length?region(`${label} rows that are not the same`,`${escape(label)}: rows by outcome. ${escape(keyNote)} Values are shown as published; null, empty text and 0 stay distinct.`,ROW_HEAD,other.map(rowHtml).join('')):'';
 const folded=sameRows.length?`<details class="compare-same"${outcome==='same'?' open':''}><summary>${escape(OUTCOME_LABELS.same)}: ${sameRows.length} row${sameRows.length===1?'':'s'}</summary>${region(`${label} rows with the same values`,`${escape(label)}: rows with the same values in A and B. ${escape(keyNote)}`,ROW_HEAD,sameRows.map(rowHtml).join(''))}</details>`:'';
 return main+folded;
}
function datasetSection(item,outcome){
 const label=datasetLabel(item.dataset),id=`compare-dataset-${String(item.dataset).replace(/[^a-z0-9_-]/gi,'')}`;
 const body=item.comparable?rowTables(item,outcome):`<p class="notice">${escape(OUTCOME_LABELS.not_comparable)}: ${escape(reasonText(item.reason))}. No rows of this dataset are listed, and neither version is described as missing them.</p>`;
 return `<section class="panel compare-block" aria-labelledby="${id}"><h3 id="${id}">${escape(label)}</h3>${coverage(item)}${quality(item)}${body}</section>`;
}
function sourceSide(side){
 return isObject(side)?`SHA-256 <code class="compare-hash">${escape(String(side.sha256??'Unavailable'))}</code><br>${escape(literal(side.bytes))} bytes`:'';
}
function sources(result,ids){
 const notIn=role=>`Not collected in ${role} (${ids[role]})`;
 const body=list(result.sources).map(source=>{
  const a=isObject(source.a)?source.a:null,b=isObject(source.b)?source.b:null;
  const bytes=!a?notIn('A'):!b?notIn('B'):source.bytes_equal===true?'Same bytes':source.bytes_equal===false?'Different bytes':'Not stated';
  const fast=a&&b&&source.bytes_equal===true&&String(source.class??'').split('|').includes('data')?'<br><small>Same response bytes; row references are identical.</small>':'';
  const pair=field=>a&&b?`A ${escape(literal(a[field]))}<br>B ${escape(literal(b[field]))}${field==='url'?`<br><small>${marker(a.url,b.url)}</small>`:''}`:`${a?'A':'B'} ${escape(literal((a??b)?.[field]))}`;
  return `<tr><th scope="row">${escape(String(source.name))}</th><td>${escape(literal(source.kind))}</td><td>${escape(literal(source.class))}</td><td>${escape(bytes)}${fast}</td><td>${a?sourceSide(a):escape(notIn('A'))}</td><td>${b?sourceSide(b):escape(notIn('B'))}</td>${['url','retrieved_at','etag','last_modified','http_status'].map(field=>`<td>${pair(field)}</td>`).join('')}</tr>`;}).join('');
 const revisions=pairRows('',result.source_revisions?.a,result.source_revisions?.b);
 return `<section class="panel compare-block" aria-labelledby="compare-sources-title"><h2 id="compare-sources-title">Source snapshots</h2>`+
  region('Source snapshots, A and B','One row per source name in either version. Response bytes are compared by SHA-256; URL, retrieval time, ETag, Last-Modified and HTTP status are listed for both versions and never decide an outcome.',['Source','Kind','Class','Response bytes','A SHA-256 and size','B SHA-256 and size','URL','retrieved_at','ETag','Last-Modified','HTTP status'],body||'<tr><td colspan="11">No sources stated.</td></tr>')+
  region('Source revisions, A and B','Source revision values from each manifest (source_revisions), shown as published.',['Revision item','A','B','A and B'],revisions||'<tr><td colspan="4">No source revisions stated.</td></tr>')+'</section>';
}
function filters(result,filter){
 const datasets=list(result.datasets).map(item=>item.dataset);
 return `<div class="filters compare-filters"><div><label for="compare-filter-dataset">Dataset</label><select id="compare-filter-dataset"><option value="">All datasets</option>${datasets.map(name=>`<option value="${escape(name)}"${filter.dataset===name?' selected':''}>${escape(datasetLabel(name))}</option>`).join('')}</select></div><div><label for="compare-filter-outcome">Outcome</label><select id="compare-filter-outcome"><option value="">All outcomes</option>${OUTCOMES.map(outcome=>`<option value="${outcome}"${filter.outcome===outcome?' selected':''}>${escape(OUTCOME_LABELS[outcome])}</option>`).join('')}</select></div></div>`;
}
export function renderCompareView(state){
 if(state?.status==='loading')return '<p class="notice" role="status">Verifying both versions before comparing…</p>';
 if(state?.status==='refused')return `<p class="notice danger" role="alert">Comparison refused: ${escape(String(state.reason??'pair not comparable').replace(/\.$/,''))}. No rows are shown.</p>`;
 if(state?.status!=='loaded'||!isObject(state.result))return `<p class="notice danger" role="alert">Comparison unavailable: ${escape(state?.message??'unknown failure')}. No differences are shown.</p>`;
 const result=state.result,filter={dataset:state.filter?.dataset??'',outcome:state.filter?.outcome??''};
 const ids={A:result.sides?.a?.artifact_id??'A',B:result.sides?.b?.artifact_id??'B'};
 const shownSets=list(result.datasets).filter(item=>!filter.dataset||item.dataset===filter.dataset);
 const total=list(result.datasets).reduce((sum,item)=>sum+(item.comparable?list(item.rows).length:0),0);
 const visible=shownSets.reduce((sum,item)=>sum+(item.comparable?list(item.rows).filter(row=>!filter.outcome||row.outcome===filter.outcome).length:0),0);
 return header(result)+summary(result)+
  `<section class="panel compare-block" aria-labelledby="compare-rows-title"><h2 id="compare-rows-title">Datasets and rows</h2><p class="note">Filters change only which rows this page shows. They do not change either version or the comparison. This page offers no file of the comparison; each version's own files stay on that version's pages.</p>${filters(result,filter)}<p id="compare-filter-count" class="note" role="status" aria-live="polite">Showing ${visible} of ${total} compared rows.</p></section>`+
  shownSets.map(item=>datasetSection(item,filter.outcome)).join('')+sources(result,ids);
}
