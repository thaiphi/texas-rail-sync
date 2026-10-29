// RRC-13 Tests tab: pure renderers for the additive BHP/SRT sidecars (Phase 2 spec §5, §8).
// Values are shown exactly as published: no charts, derived values, conversions or permit comparisons.
import {escapeHtml as escape} from './inspection.js';

export const testReportsCollected=manifest=>Boolean(manifest?.files&&typeof manifest.files==='object'&&Object.hasOwn(manifest.files,'tests.json'));

const NOT_COLLECTED='Test reports were not collected for this version.';
const EMPTY='No rows were returned by the exact-UIC query; this does not show that no test was conducted.';
// Displayed columns; a date shows its original `_text` column, never a reformatted value.
const TABLES=[
 {key:'bhp',title:'Bottom-hole pressure (BHP) test reports',columns:['source_report_id','tracking_no','test_sequence_no','report_conducted_date_text','report_received_date_text','bhp_psia','test_depth_ft','gradient_psi_ft','tested_formation']},
 {key:'srt',title:'Step-rate test (SRT) reports',columns:['source_report_id','tracking_no','srt_received_date_text','test_date_text','satisfactory_test_code','top_perf_ft','bottom_perf_ft','formation_tested','min_inj_rate_bpm','max_inj_rate_bpm','isip_psig','formation_frac_press_psig','frac_inj_rate_capacity_bpd','surface_pressure_firc_psig','fracture_gradient_psi_ft','comments']}
];
const shown=value=>value===null||value===undefined||value===''?'Not reported':String(value);
const count=value=>Number.isSafeInteger(value)&&value>=0?String(value):'Unavailable';
const fieldEntry=(dictionary,column)=>{const fields=dictionary?.fields;return fields&&typeof fields==='object'&&Object.hasOwn(fields,column)?fields[column]:null;};
const header=(dictionary,column)=>{const units=fieldEntry(dictionary,column)?.units;return `<th scope="col">${escape(column)} <small>(${escape(units?String(units):'units unavailable')})</small></th>`;};

function dictionaryList(dictionary,columns){
 const items=['source_row_key',...columns].map(column=>{const item=fieldEntry(dictionary,column);if(!item)return `<div><dt>${escape(column)}</dt><dd>No dictionary entry; units unavailable.</dd></div>`;
  return `<div><dt>${escape(column)}</dt><dd>${escape(shown(item.units))} · ${escape(shown(item.status))} · basis ${escape(shown(item.basis))}${item.source_field?` · source field ${escape(item.source_field)}`:''}<br>${escape(shown(item.definition))}${item.note?`<br><strong>Note:</strong> ${escape(item.note)}`:''}</dd></div>`;}).join('');
 return `<details class="tests-dictionary"><summary>Column definitions, units and notes</summary><dl class="facts">${items}</dl></details>`;
}
function table(table,tests,dictionary){
 const rows=Array.isArray(tests[table.key])?tests[table.key]:[],quality=tests.quality?.[table.key],scope=tests.scope??{};
 const dispositions=new Map((Array.isArray(tests.quality?.dispositions)?tests.quality.dispositions:[]).map(item=>[item?.source_row_key,item]));
 const reconciliation=`<p class="note">${count(quality?.raw)} raw = ${count(quality?.accepted)} accepted + ${count(quality?.quarantined)} quarantined + ${count(quality?.excluded)} excluded · query status ${escape(shown(scope[`${table.key}_status`]))} · ${escape(count(scope[`${table.key}_returned`]))} rows returned</p>`;
 const heading=`<h3>${escape(table.title)} <small class="badge">public reported</small></h3>`;
 if(!rows.length)return `<section class="panel padded tests-table">${heading}${reconciliation}<div class="empty"><p>${escape(EMPTY)}</p></div>${dictionaryList(dictionary,table.columns)}</section>`;
 const body=rows.map(row=>{const record=dispositions.get(row.source_row_key),disposition=record?.disposition??'Unavailable',reasons=record?.reasons??row.quality_flags??[];
  return `<tr class="${disposition==='quarantined'?'quarantined':''}"><th scope="row">${escape(row.source_row_key)}</th><td>${escape(disposition)}</td><td>${escape(Array.isArray(reasons)&&reasons.length?reasons.join(', '):'No recorded reasons')}</td>${table.columns.map(column=>`<td>${escape(shown(row[column]))}</td>`).join('')}</tr>`;}).join('');
 return `<section class="panel padded tests-table">${heading}${reconciliation}<div class="scroll-table" tabindex="0" role="region" aria-label="${escape(table.title)}"><table><caption>One retained source row per reported test. Dates are original source text. Missing is not zero; values are not converted.</caption><thead><tr>${header(dictionary,'source_row_key')}<th scope="col">Disposition</th><th scope="col">Recorded reasons</th>${table.columns.map(column=>header(dictionary,column)).join('')}</tr></thead><tbody>${body}</tbody></table></div>${dictionaryList(dictionary,table.columns)}</section>`;
}
export function renderTestsView(state){
 if(state?.status==='not_collected')return `<div class="empty"><h3>Not collected</h3><p>${escape(NOT_COLLECTED)}</p></div>`;
 if(state?.status==='loading')return '<p class="notice" role="status">Verifying test-report files against this version…</p>';
 if(state?.status!=='loaded')return `<p class="notice danger" role="alert">Test reports unavailable: ${escape(state?.message??'unknown error')}. No test-report rows are shown for this version.</p>`;
 const {tests,dictionary}=state,scope=tests?.scope??{};
 return `<p class="scope-note"><strong>Exact UIC ${escape(shown(scope.uic_number))}</strong><span>${escape(shown(scope.window))} · cap ${escape(count(scope.test_report_limit))} rows per dataset · order ${escape(shown(scope.order))}</span></p>${TABLES.map(item=>table(item,tests??{},dictionary)).join('')}`;
}
