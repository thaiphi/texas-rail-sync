// RRC-13 (Phase 2): pure BHP/SRT normalization, dictionary and v3 scope contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boundedScope,boundedTestScope,targetsForScope,isBounded,versionLabels,sourceScopeFlags} from '../src/sources.mjs';
import {normalizeTests,testColumns,testsDictionary} from '../src/testReports.mjs';
const fixture=name=>readFile(new URL('fixtures/test-reports/'+name,import.meta.url));
const bhpRows=JSON.parse(await fixture('candidate-bhp.json')),srtRows=JSON.parse(await fixture('candidate-srt.json'));
const uic='000020838',scope=boundedTestScope(uic,'2024-01','2026-04');
const sourceIds={bhp:'qxfy-wcfs:0123456789abcdef',srt:'h54t-xnbi:fedcba9876543210'};
const parent=[{source_record_key:'rrc:uic:givw-z9t4:aaaa:1',uic_number:uic}];
const run=({bhp=bhpRows,srt=srtRows}={})=>normalizeTests({bhp,srt},sourceIds,parent,scope);
const flagsOf=(result,kind,index=0)=>result[kind][index].quality_flags;
const dispositionsOf=(result,kind)=>result.quality.dispositions.filter(d=>d.source_row_key.startsWith(`rrc:${kind}:`));
const disposition=(result,kind,index=0)=>dispositionsOf(result,kind)[index].disposition;

test('v3 scope extends v2 with test-report targets only; v2 targets and labels stay unchanged',()=>{
 const v2=boundedScope(uic,'2024-01','2026-04');
 assert.deepEqual(scope,{...v2,queryVersion:3,testReportLimit:1000});assert.ok(Object.isFrozen(scope));
 assert.equal(isBounded(v2),true);assert.equal(isBounded(scope),true);assert.equal(isBounded({}),false);assert.equal(isBounded(null),false);
 assert.deepEqual(versionLabels(scope),{pipelineVersion:'rrc-collection-v3',transformationVersion:'rrc-odp-v2.1.0'});
 assert.deepEqual(versionLabels(v2),{pipelineVersion:'rrc-collection-v2',transformationVersion:'rrc-odp-v2.0.0'});
 assert.deepEqual(versionLabels({}),{pipelineVersion:'rrc-collection-v1',transformationVersion:'rrc-odp-v1.0.0'});
 const targets=targetsForScope(scope),old=targetsForScope(v2);
 assert.equal(old.length,7);assert.equal(targets.length,13);assert.deepEqual(targets.slice(0,7),old);
 assert.deepEqual(targets.slice(7).map(t=>t.name),['bhp-metadata.json','srt-metadata.json','candidate-bhp.json','candidate-srt.json','srt-guidelines.html','bhp-permian-nto.pdf']);
 const bhp=new URL(targets[9].url),srt=new URL(targets[10].url);
 assert.equal(bhp.origin+bhp.pathname,'https://data.texas.gov/resource/qxfy-wcfs.json');
 assert.deepEqual(Object.fromEntries(bhp.searchParams),{'$where':`uic_no='${uic}'`,'$limit':'1000','$order':'report_id,tracking_no,test_sequence_no'});
 assert.deepEqual(Object.fromEntries(srt.searchParams),{'$where':`uic_no='${uic}'`,'$limit':'1000','$order':'report_id,tracking_no'});
 assert.equal(targets[7].url,'https://data.texas.gov/api/views/qxfy-wcfs.json');assert.equal(targets[8].url,'https://data.texas.gov/api/views/h54t-xnbi.json');
 assert.match(targets[11].url,/^https:\/\/www\.rrc\.texas\.gov\/oil-and-gas\/.*step-rate-test-guidelines\/$/);assert.match(targets[12].url,/^https:\/\/www\.rrc\.texas\.gov\/media\/sm5bzzpg\/.*\.pdf$/);
 // A JSON round-trip (acquisition.json) must preserve the exact scope contract.
 assert.deepEqual(targetsForScope(JSON.parse(JSON.stringify(scope))),targets);
 assert.throws(()=>targetsForScope({...scope,testReportLimit:5}),/scope/i);assert.throws(()=>targetsForScope({...v2,queryVersion:3}),/scope/i);
});
test('test-report scope flags check only the exact UIC, with no reporting-window bound',()=>{
 for(const kind of ['bhp','srt']){
  assert.deepEqual(sourceScopeFlags(kind,{uic_no:uic,formatted_date:'1990-01-01T00:00:00'},scope),[]);
  assert.deepEqual(sourceScopeFlags(kind,{uic_no:'000000001'},scope),['source_scope:uic_no']);
 }
 const result=run({srt:[{...srtRows[0],uic_no:'000000001'}]});
 assert.ok(flagsOf(result,'srt').includes('source_scope:uic_no'));assert.equal(disposition(result,'srt'),'quarantined');
});
test('fixture rows normalize one-to-one with keys, verbatim identity and original date text',()=>{
 const result=run();
 assert.deepEqual(Object.keys(result.bhp[0]),testColumns.bhp);assert.deepEqual(Object.keys(result.srt[0]),testColumns.srt);
 assert.equal(result.bhp[0].source_row_key,'rrc:bhp:qxfy-wcfs:0123456789abcdef:1');assert.equal(result.srt[0].source_row_key,'rrc:srt:h54t-xnbi:fedcba9876543210:1');
 assert.equal(result.bhp[0].parent_key,parent[0].source_record_key);assert.equal(result.bhp[0].parent_join_status,'matched');
 assert.equal(result.bhp[1].test_sequence_no,'2');assert.equal(result.bhp[0].source_report_id,'1201');assert.equal(result.bhp[0].report_conducted_date,'2024-03-14');assert.equal(result.bhp[0].report_conducted_date_text,'2024-03-14');
 assert.equal(result.srt[0].satisfactory_test_code,'1');assert.equal(result.srt[0].comments,srtRows[0].comments);assert.equal(result.bhp[0].source_snapshot_id,sourceIds.bhp);
 for(const kind of ['bhp','srt']){const q=result.quality[kind];assert.equal(q.raw,q.parsed);assert.equal(q.parsed,q.accepted+q.quarantined+q.excluded);assert.equal(q.excluded,0);}
 assert.deepEqual(result.quality.bhp,{raw:2,parsed:2,accepted:2,quarantined:0,excluded:0},'a pair differing only in test_sequence_no stays accepted');
});
test('empty BHP/SRT responses are confirmed empty and reconcile 0 = 0 + 0',()=>{
 const result=run({bhp:[],srt:[]});
 assert.deepEqual(result.bhp,[]);assert.deepEqual(result.srt,[]);
 for(const kind of ['bhp','srt'])assert.deepEqual(result.quality[kind],{raw:0,parsed:0,accepted:0,quarantined:0,excluded:0});
 assert.match(result.quality.empty_result_policy,/confirmed_empty/);assert.match(result.quality.empty_result_policy,/not .*no test/i);
});
test('duplicate report identities are quarantined on every occurrence; an empty report_id is invalid',()=>{
 const dup=run({bhp:[bhpRows[0],bhpRows[0],bhpRows[1]],srt:[srtRows[0],{...srtRows[0],test_date:'2023-07-12'},{...srtRows[0],report_id:''}]});
 assert.deepEqual(dup.bhp.map(r=>r.quality_flags.includes('duplicate_report_identity')),[true,true,false]);
 assert.deepEqual(dispositionsOf(dup,'bhp').map(d=>d.disposition),['quarantined','quarantined','accepted']);
 assert.deepEqual(dup.srt.map(r=>r.quality_flags.includes('duplicate_report_identity')),[true,true,false]);
 assert.ok(dup.srt[2].quality_flags.includes('invalid:source_report_id'));assert.equal(dispositionsOf(dup,'srt')[2].disposition,'quarantined');
 assert.deepEqual(dispositionsOf(dup,'srt')[0].reasons,dup.srt[0].quality_flags);
 assert.equal(dup.quality.issue_counts.bhp.duplicate_report_identity,2);assert.equal(dup.quality.dispositions.length,6,'one flat array covers every BHP and SRT row');assert.ok(dup.quality.dispositions.filter(d=>d.disposition==='accepted').every(d=>d.reasons===undefined));assert.match(dup.quality.duplicate_policy,/quarantin/i);
});
test('dates accept only valid YYYY-MM-DD; missing is accepted and the original text is always kept',()=>{
 for(const [value,flag] of [['2024-02-30','parse_failure:test_date'],['2024-13-01','parse_failure:test_date'],['07/11/2023','parse_failure:test_date'],['2023-07-11T00:00:00.000','parse_failure:test_date']]){
  const result=run({srt:[{...srtRows[0],test_date:value}]});
  assert.ok(flagsOf(result,'srt').includes(flag),value);assert.equal(disposition(result,'srt'),'quarantined');assert.equal(result.srt[0].test_date,null);assert.equal(result.srt[0].test_date_text,value);
 }
 const leap=run({bhp:[{...bhpRows[0],report_conducted_date:'2024-02-29'}]});assert.equal(leap.bhp[0].report_conducted_date,'2024-02-29');
 const {report_received_date,...rest}=bhpRows[0];
 for(const missing of [rest,{...bhpRows[0],report_received_date:''}]){
  const result=run({bhp:[missing]});
  assert.ok(flagsOf(result,'bhp').includes('missing:report_received_date'));assert.equal(disposition(result,'bhp'),'accepted');assert.equal(result.bhp[0].report_received_date,null);assert.equal(result.bhp[0].report_received_date_text,'');
 }
});
test('numbers are strict: empty is null, zero stays zero, commas fail; only psia/ft/bpm/bpd negatives are invalid',()=>{
 const result=run({bhp:[{...bhpRows[0],bhp_psia:'',test_depth_ft:'0'}],srt:[{...srtRows[0],isip_psig:'1,234'}]});
 assert.equal(result.bhp[0].bhp_psia,null);assert.ok(flagsOf(result,'bhp').includes('missing:bhp_psia'));assert.equal(result.bhp[0].test_depth_ft,0);assert.equal(disposition(result,'bhp'),'accepted');
 assert.equal(result.srt[0].isip_psig,null);assert.ok(flagsOf(result,'srt').includes('parse_failure:isip_psig'));assert.equal(disposition(result,'srt'),'quarantined');
 const psig=run();assert.equal(psig.srt[0].isip_psig,-35);assert.equal(disposition(psig,'srt'),'accepted','negative psig is reported, never invalid');
 assert.ok(!flagsOf(psig,'srt').some(flag=>flag.startsWith('invalid_negative')));
 const psia=run({bhp:[{...bhpRows[0],bhp_psia:'-1'}]});assert.ok(flagsOf(psia,'bhp').includes('invalid_negative:bhp_psia'));assert.equal(disposition(psia,'bhp'),'quarantined');assert.equal(psia.bhp[0].bhp_psia,-1,'values are never converted');
 for(const field of ['top_perf_ft','bottom_perf_ft','min_inj_rate_bpm','max_inj_rate_bpm','frac_inj_rate_capacity_bpd']){
  const negative=run({srt:[{...srtRows[0],[field]:'-2'}]});assert.ok(flagsOf(negative,'srt').includes('invalid_negative:'+field),field);
 }
 assert.ok(flagsOf(run({bhp:[{...bhpRows[0],test_depth_ft:'-5'}]}),'bhp').includes('invalid_negative:test_depth_ft'));
});
test('consistency flags quarantine top perforation below bottom and minimum rate above maximum',()=>{
 const result=run({srt:[{...srtRows[0],top_perf_ft:'6000',bottom_perf_ft:'5000',min_inj_rate_bpm:'13',max_inj_rate_bpm:'12'}]});
 assert.ok(flagsOf(result,'srt').includes('inconsistent:top_perf_exceeds_bottom'));assert.ok(flagsOf(result,'srt').includes('inconsistent:min_rate_exceeds_max'));assert.equal(disposition(result,'srt'),'quarantined');
});
test('tests dictionary covers every CSV column with field-name units, basis and documented limitations',()=>{
 const dictionary=testsDictionary({testFixture:false});
 assert.deepEqual(dictionary.tables,testColumns);
 for(const column of new Set([...testColumns.bhp,...testColumns.srt])){
  const entry=dictionary.fields[column];assert.ok(entry,column);
  assert.deepEqual(Object.keys(entry).slice(0,4),['units','status','definition','source_field'],column);
  assert.ok(['public reported','calculated'].includes(entry.status),column);assert.match(entry.note,/ODP publishes no column descriptions/,column);assert.ok(entry.basis,column);
 }
 const units=Object.fromEntries(Object.entries(dictionary.fields).map(([name,entry])=>[name,entry.units]));
 assert.match(units.bhp_psia,/^psia/);for(const name of ['isip_psig','formation_frac_press_psig','surface_pressure_firc_psig'])assert.equal(units[name],'psig');
 for(const name of ['test_depth_ft','top_perf_ft','bottom_perf_ft'])assert.equal(units[name],'ft');
 for(const name of ['min_inj_rate_bpm','max_inj_rate_bpm'])assert.match(units[name],/^bbl\/min/);assert.equal(units.frac_inj_rate_capacity_bpd,'bbl/day');
 for(const name of ['gradient_psi_ft','fracture_gradient_psi_ft'])assert.equal(units[name],'psi/ft');
 const f=dictionary.fields;
 assert.match(f.bhp_psia.note,/bhp-permian-nto\.pdf p\.1\) states BHP is reported in PSIG; the ODP field name says psia\. The conflict is unresolved; the value is shown as published and never converted\./);
 assert.match(f.isip_psig.note,/surface.*bottom hole|bottom hole.*surface/i);assert.equal(f.isip_psig.basis,'official_document:srt-guidelines.html');
 assert.match(f.gradient_psi_ft.note,/not the SRT fracture gradient/);
 for(const name of ['surface_pressure_firc_psig','frac_inj_rate_capacity_bpd'])assert.match(f[name].note,/FIRC is not defined in any RRC document found; meaning unverified/);
 assert.match(f.satisfactory_test_code.note,/code meaning undocumented/);assert.equal(f.satisfactory_test_code.source_field,'satisfactory_test');
 for(const name of ['test_sequence_no','tracking_no','source_report_id','comments'])assert.match(f[name].note,/meaning undocumented/,name);
 assert.match(f.test_depth_ft.note,/depth basis unstated/);assert.equal(f.test_depth_ft.basis,'odp_field_name');
 assert.ok(Object.values(f).every(entry=>entry.status!=='public reported'||/^(odp_field_name|official_document:)/.test(entry.basis)));
 assert.ok(!JSON.stringify([dictionary.fields,dictionary.documents]).match(/W-7|fracture injection rate capacity/i),'no uncited document or asserted FIRC expansion');assert.match(dictionary.not_cited,/W-7/);
 const synthetic=testsDictionary({testFixture:true,provenance:{classification:'test_fixture',basis:'recorded_test_fixture'}});
 assert.ok(Object.values(synthetic.fields).every(entry=>entry.status!=='public reported'));assert.equal(synthetic.fields.bhp_psia.status,'synthetic');
});
test('run validation reconciles additive testReports evidence with load input counts',async()=>{
 const {workflowView}=await import('../public/workflow.js');
 const {createRunRecorder}=await import('../src/runEvents.mjs');
 const quality=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/quality_report.json',import.meta.url)));
 const hash='a'.repeat(64),counts=n=>({raw:n,parsed:n,accepted:n,quarantined:0,excluded:0});
 const build=(testReports,bhpCount=2)=>{const r=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v3',schemaVersion:1,transformationVersion:'rrc-odp-v2.1.0',testFixture:true});
  r.start('load');r.succeed('load',{inputs:[{kind:'inventory',url:'u',sha256:hash,count:quality.inventory.raw},{kind:'monthly',url:'u',sha256:hash,count:quality.monthly.raw},{kind:'bhp',url:'u',sha256:hash,count:bhpCount},{kind:'srt',url:'u',sha256:hash,count:0}]});
  r.start('normalize-qc');r.succeed('normalize-qc',{counts:quality,outputs:[{name:'normalized inventory',count:quality.inventory.parsed,sha256:hash},{name:'normalized monthly',count:quality.monthly.parsed,sha256:hash}],...(testReports===undefined?{}:{testReports})});return r.snapshot();};
 assert.doesNotThrow(()=>build({bhp:counts(2),srt:counts(0)}));
 assert.throws(()=>build({bhp:counts(2),srt:counts(0)},3),/test-report/i);
 assert.throws(()=>build(undefined),/test-report/i);
 assert.throws(()=>build({bhp:{...counts(2),accepted:1},srt:counts(0)}),/test-report/i);
 assert.throws(()=>build({bhp:{...counts(2),excluded:1,accepted:1},srt:counts(0)}),/test-report/i);
});
