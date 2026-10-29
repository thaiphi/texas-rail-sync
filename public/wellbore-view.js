// RRC-14 Wellbore tab: pure renderers for the additive casing/plugging sidecars (Phase 3 spec §4.4, §5, §8).
// The link panel is the inspector (OD-8). Values are shown exactly as published: no charts, derived values,
// ordering by sequence or date, "latest" selection, permit-depth or w3_plugged_date comparison, or depth ladder.
import {escapeHtml as escape} from './inspection.js';

export const wellboreCollected=manifest=>Boolean(manifest?.files&&typeof manifest.files==='object'&&Object.hasOwn(manifest.files,'casing.json'));

const NOT_COLLECTED='Casing and plugging records were not collected for this version.';
// Section 4.4 fixed presence sentences: they state only whether source rows were returned.
export const PRESENCE={
 casing_no_source_rows:'No casing rows were returned by the exact-API query; this does not show that no casing exists.',
 plugging_no_source_rows:'No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged.',
 api_missing_or_invalid:'The selected inventory row has no eight-digit API number, so no casing or plugging query was made.',
 ambiguous:'Several inventory permits carry this API number. These rows belong to the reported API and are attributed to no single UIC.',
 matched:'The source API string equals the selected inventory row\'s API string. An eight-digit API cannot distinguish sidetracks or recompletions.'
};
const CODE_NOTE='meaning undocumented in ODP metadata';
// Displayed columns in sidecar order; a date shows its original `_text` column, never a reformatted value.
const TABLES=[
 {key:'casing',title:'Casing records (Form G-1/W-2 filings)',columns:['source_id','api_no','record_sequence','on_top_record','wellbore_link_status','completion_date_text','csg_size','hole_size','csg_depth','toc','multi_stg_depth','cmt_sacks','total_depth_g1w2','depth_reference','depth_reference_code']},
 {key:'plugging',title:'Plugging records (Form W-3 filings)',columns:['source_id','api_no','record_sequence','on_top_record','wellbore_link_status','w3_date_text','plug_top_depth','plug_bottom_depth','plug_cmt_sacks','total_depth_w3','depth_reference','depth_reference_code']}
];
const CANDIDATE_COLUMNS=['candidate_key','uic_number','api_no','operator_number','district_code','lease_number','lease_name','well_no_display','w14_number'];
const shown=value=>value===null||value===undefined||value===''?'Not reported':String(value);
const count=value=>Number.isSafeInteger(value)&&value>=0?String(value):'Unavailable';
// `on_top_record` is set only where the source sets it: absent/null is "not set", never false.
const onTop=value=>value===true?'true':value===false?'false':'not set';
// Flat `fields` map as in tests_dictionary.json; a per-table object under `tables[dataset]` is also read.
const fieldEntry=(dictionary,dataset,column)=>{const table=dictionary?.tables?.[dataset],fields=dictionary?.fields;
 if(table&&typeof table==='object'&&!Array.isArray(table)&&Object.hasOwn(table,column))return table[column];
 return fields&&typeof fields==='object'&&Object.hasOwn(fields,column)?fields[column]:null;};
const header=(dictionary,dataset,column)=>{const units=fieldEntry(dictionary,dataset,column)?.units;
 return `<th scope="col">${escape(column)} <small>(${escape(units?String(units):'units unavailable')}${column==='depth_reference_code'?'; '+CODE_NOTE:''})</small></th>`;};

export function presenceSentence(dataset,link){
 if(link?.status==='matched')return PRESENCE.matched;
 if(link?.status==='ambiguous')return PRESENCE.ambiguous;
 if(link?.status==='none'&&link.reason==='api_missing_or_invalid')return PRESENCE.api_missing_or_invalid;
 if(link?.status==='none'&&link.reason==='no_source_rows')return PRESENCE[`${dataset}_no_source_rows`]??null;
 return null;
}
function query(label,item){
 if(!item||typeof item!=='object')return `<div><dt>${escape(label)}</dt><dd>No query was made.</dd></div>`;
 return `<div><dt>${escape(label)}</dt><dd><code>${escape(shown(item.url))}</code><br>SHA-256 <code>${escape(shown(item.sha256))}</code> · ${escape(count(item.rows))} rows</dd></div>`;
}
function candidates(link){
 const rows=Array.isArray(link?.candidates)?link.candidates:[];
 if(link?.status!=='ambiguous'||!rows.length)return '';
 return `<div class="scroll-table" tabindex="0" role="region" aria-label="Inventory permits carrying API ${escape(shown(link.source_api_id))}"><table><caption>Inventory permits returned by the exact-API inventory query, in source order. The selected row is marked; the wellbore rows are attributed to no single UIC.</caption><thead><tr><th scope="col">Selected</th>${CANDIDATE_COLUMNS.map(column=>`<th scope="col">${escape(column)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="${row?.selected===true?'selected':''}"><td>${row?.selected===true?'Selected inventory row':'Other permit'}</td>${CANDIDATE_COLUMNS.map(column=>`<td>${escape(shown(row?.[column]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function linkPanel(dataset,doc){
 const link=doc?.link??{},sentence=presenceSentence(dataset,link);
 return `<section class="wellbore-link" aria-label="${escape(dataset)} wellbore link"><h4>Wellbore link <small>inspector</small></h4><dl class="facts">${[['Source API',link.source_api_id],['Basis',link.basis],['Status',link.status],['Reason',link.reason??'none'],['Inventory record',link.inventory_source_record_key],['Wellbore rows',count(link.wellbore_row_count)]].map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(shown(value))}</dd></div>`).join('')}${query('Inventory-by-API query',link.inventory_query)}${query('Wellbore query',link.wellbore_query)}</dl><p class="notice">${escape(sentence??'Link status unavailable; no presence statement is made.')}</p>${candidates(link)}</section>`;
}
function dictionaryList(dictionary,dataset,columns){
 const items=['source_row_key',...columns].map(column=>{const item=fieldEntry(dictionary,dataset,column);if(!item)return `<div><dt>${escape(column)}</dt><dd>No dictionary entry; units unavailable.</dd></div>`;
  return `<div><dt>${escape(column)}</dt><dd>${escape(shown(item.units))} · ${escape(shown(item.status))} · basis ${escape(shown(item.basis))}${item.source_field?` · source field ${escape(item.source_field)}`:''}<br>${escape(shown(item.definition))}${item.note?`<br><strong>Note:</strong> ${escape(item.note)}`:''}</dd></div>`;}).join('');
 return `<details class="tests-dictionary"><summary>Column definitions, units and notes</summary><dl class="facts">${items}</dl></details>`;
}
function table(table,doc,dictionary){
 const rows=Array.isArray(doc?.rows)?doc.rows:[],quality=doc?.quality,counts=quality?.counts,scope=doc?.scope??{};
 const dispositions=new Map((Array.isArray(quality?.dispositions)?quality.dispositions:[]).map(item=>[item?.source_row_key,item]));
 const reconciliation=`<p class="note">${count(counts?.raw)} raw = ${count(counts?.accepted)} accepted + ${count(counts?.quarantined)} quarantined + ${count(counts?.excluded)} excluded · query status ${escape(shown(scope.status))} · ${escape(count(scope.returned))} rows returned · order ${escape(shown(scope.order))}</p>`;
 const heading=`<h3>${escape(table.title)} <small class="badge">public reported</small></h3>`,panel=linkPanel(table.key,doc);
 if(!rows.length)return `<section class="panel padded tests-table">${heading}${reconciliation}${panel}${dictionaryList(dictionary,table.key,table.columns)}</section>`;
 const body=rows.map(row=>{const record=dispositions.get(row.source_row_key),disposition=record?.disposition??'Unavailable',reasons=record?.reasons??row.quality_flags??[];
  return `<tr class="${disposition==='quarantined'?'quarantined':''}"><th scope="row">${escape(row.source_row_key)}</th><td>${escape(disposition)}</td><td>${escape(Array.isArray(reasons)&&reasons.length?reasons.join(', '):'No recorded reasons')}</td>${table.columns.map(column=>`<td>${escape(column==='on_top_record'?onTop(row[column]):shown(row[column]))}</td>`).join('')}</tr>`;}).join('');
 return `<section class="panel padded tests-table">${heading}${reconciliation}${panel}<div class="scroll-table" tabindex="0" role="region" aria-label="${escape(table.title)}"><table><caption>One retained source row per line, in source order (record_sequence, id). record_sequence is a filing sequence shared by several rows, not a row key. Dates are original source text. Missing is not zero; values are not converted. on_top_record is "not set" where the source omits it. depth_reference_code is shown verbatim; ${CODE_NOTE}.</caption><thead><tr>${header(dictionary,table.key,'source_row_key')}<th scope="col">Disposition</th><th scope="col">Recorded reasons</th>${table.columns.map(column=>header(dictionary,table.key,column)).join('')}</tr></thead><tbody>${body}</tbody></table></div>${dictionaryList(dictionary,table.key,table.columns)}</section>`;
}
export function renderWellboreView(state){
 if(state?.status==='not_collected')return `<div class="empty"><h3>Not collected</h3><p>${escape(NOT_COLLECTED)}</p></div>`;
 if(state?.status==='loading')return '<p class="notice" role="status">Verifying casing and plugging files against this version…</p>';
 if(state?.status!=='loaded')return `<p class="notice danger" role="alert">Casing and plugging records unavailable: ${escape(state?.message??'unknown error')}. No casing or plugging rows are shown for this version.</p>`;
 const {casing,plugging,dictionary}=state,scope=casing?.scope??{};
 return `<p class="scope-note"><strong>Exact API ${escape(shown(scope.source_api_id))}</strong><span>${escape(shown(scope.window))} · cap ${escape(count(scope.wellbore_limit))} rows per dataset · inventory-by-API cap ${escape(count(scope.wellbore_inventory_limit))}</span></p>${TABLES.map(item=>table(item,item.key==='casing'?casing:plugging,dictionary)).join('')}`;
}
