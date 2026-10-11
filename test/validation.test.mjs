import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalize,sha256} from '../src/normalize.mjs';
import {loadSnapshot,buildArtifact,pinnedArtifactId} from '../src/artifact.mjs';
import * as sources from '../src/sources.mjs';
import {workflowView} from '../public/workflow.js';
import {assertQualityReport} from '../public/quality-validation.js';
import {createRunRecorder} from '../src/runEvents.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const inventory=JSON.parse(await readFile(resolve(root,'raw/candidate-inventory.json')));
const monthly=JSON.parse(await readFile(resolve(root,'raw/candidate-monthly.json')));
const parent=inventory[0],child=monthly[0],ids={inventory:'test-inventory',monthly:'test-monthly'};
async function fixtureSnapshot(t,inventoryRows=inventory,monthlyRows=monthly){
 await mkdir(resolve(root,'tmp'),{recursive:true});const dir=await mkdtemp(resolve(root,'tmp/validation-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await cp(resolve(root,'raw'),dir,{recursive:true});
 await writeFile(resolve(dir,'acquisition.json'),JSON.stringify({schemaVersion:1,status:'succeeded',testFixture:true}));
 for(const [name,rows] of [['candidate-inventory',inventoryRows],['candidate-monthly',monthlyRows]]){const body=JSON.stringify(rows);await writeFile(resolve(dir,name+'.json'),body);const path=resolve(dir,name+'.source.json'),metadata=JSON.parse(await readFile(path));await writeFile(path,JSON.stringify({...metadata,sha256:sha256(body),bytes:Buffer.byteLength(body)}));}
 return loadSnapshot(dir);
}
test('duplicate reporting months use exact well identity and canonical year/month, retaining every revision',()=>{
 const rows=[{...child,id:'001',formatted_date:'2024-01-01T00:00:00.000'},{...child,id:'002',formatted_date:'2024-01-01T00:00:00'}];
 const n=normalize([parent],rows,ids);
 assert.equal(n.quality.monthly.quarantined,2);
 assert.equal(n.monthly.length,2);assert.notEqual(n.monthly[0].source_row_key,n.monthly[1].source_row_key);
 assert.ok(n.monthly.every(row=>row.quality_flags.includes('duplicate_or_revision_period')));
 assert.ok(n.quality.dispositions.every(d=>d.reasons.includes('duplicate_or_revision_period')));
 const other={...parent,uic_number:'000000040'};
 const separate=normalize([parent,other],[rows[0],{...rows[1],uic_no:other.uic_number}],ids);
 assert.equal(separate.quality.monthly.quarantined,0,'same month on another original UIC is distinct');
 const different=normalize([parent],[rows[0],{...rows[1],formatted_date:'2024-02-01T00:00:00'}],ids);
 assert.equal(different.quality.monthly.quarantined,0);
});
test('missing or blank report IDs quarantine retained rows without inventing an identifier',()=>{
 for(const id of [undefined,null,'','   ']){
  const n=normalize([parent],[{...child,id}],ids);
  assert.equal(n.quality.monthly.quarantined,1,JSON.stringify(id));
  assert.ok(n.monthly[0].quality_flags.includes('invalid:source_report_id'));
  assert.equal(n.monthly[0].source_report_id,id==null?'':id);
  assert.equal(n.quality.dispositions[0].disposition,'quarantined');
 }
 assert.equal(normalize([parent],[{...child,id:'0007'}],ids).monthly[0].source_report_id,'0007');
});
test('negative permit/depth values and inverted intervals are quarantined and preserved',()=>{
 for(const [field,value,flag] of [['max_liq_inj_pressure','-5','invalid_negative:max_liq_inj_pressure'],['bbl_vol_inj','-10','invalid_negative:bbl_vol_inj'],['top_inj_zone','-1','invalid_negative:top_inj_zone'],['bot_inj_zone','-1','invalid_negative:bot_inj_zone']]){
  const n=normalize([{...parent,[field]:value}],[child],ids);
  assert.equal(n.quality.inventory.quarantined,1,field);assert.ok(n.inventory[0].quality_flags.includes(flag));
 }
 const reversed=normalize([{...parent,top_inj_zone:'3000',bot_inj_zone:'2000'}],[child],ids);
 assert.equal(reversed.quality.inventory.quarantined,1);assert.ok(reversed.inventory[0].quality_flags.includes('inconsistent:top_exceeds_bottom'));
 assert.ok(reversed.quality.inventory_dispositions[0].reasons.includes('inconsistent:top_exceeds_bottom'));
 assert.equal(reversed.inventory[0].permitted_top_depth_ft,3000);assert.equal(reversed.inventory[0].permitted_bottom_depth_ft,2000);
 const zero=normalize([{...parent,max_liq_inj_pressure:'0',bbl_vol_inj:'0',top_inj_zone:'0',bot_inj_zone:'0'}],[child],ids);
 assert.equal(zero.quality.inventory.accepted,1);assert.equal(zero.inventory[0].permit_liquid_volume_limit_bpd,0);
 const missing=normalize([{...parent,max_liq_inj_pressure:null,top_inj_zone:''}],[child],ids);
 assert.equal(missing.inventory[0].permit_liquid_pressure_limit_psi,null);assert.equal(missing.inventory[0].permitted_top_depth_ft,null);assert.equal(missing.quality.inventory.accepted,1);
});
test('declared source predicates and date/UIC bounds quarantine contradictory retained records',()=>{
 const scope=sources.collectionScope;
 for(const [patch,flag] of [[{api_no:'00100001'},'source_scope:api_no_prefix'],[{uic_type_injection:'2'},'source_scope:uic_type_injection'],[{permit_canceled_date:'2020-01-01'},'source_scope:permit_canceled_date'],[{w3_plugged_date:'2020-01-01'},'source_scope:w3_plugged_date']]){
  const n=normalize([{...parent,...patch}],[child],ids,scope);
  assert.equal(n.quality.inventory.quarantined,1,flag);assert.ok(n.inventory[0].quality_flags.includes(flag));
 }
 for(const [patch,flag] of [[{uic_no:'000022085'},'source_scope:uic_no'],[{formatted_date:'2023-12-01T00:00:00.000'},'source_scope:formatted_date']]){
  const n=normalize([parent],[{...child,...patch}],ids,scope);
  assert.equal(n.quality.monthly.quarantined,1,flag);assert.ok(n.monthly[0].quality_flags.includes(flag));assert.ok(n.quality.dispositions[0].reasons.includes(flag));
 }
 assert.equal(normalize(inventory,monthly,ids,scope).quality.monthly.accepted,28);
});
test('workflow rejects missing or non-reconciling quality counts instead of showing successful validation',async()=>{
 let record;
 for(const name of await readdir(resolve(root,'runs'))){const candidate=JSON.parse(await readFile(resolve(root,'runs',name,'record.json')));if(candidate.status==='succeeded'){record=candidate;break;}}
 assert.ok(record);assert.equal(workflowView(record).status,'succeeded');
 const changes=[()=>({}),q=>{delete q.inventory.accepted;return q;},q=>{q.monthly.accepted--;return q;},q=>{q.monthly.quarantined=-1;return q;},q=>{q.parent_join.matched--;return q;},q=>{q.dispositions.pop();return q;},q=>{q.monthly.raw++;return q;},q=>{q.issue_counts={bad:-1};return q;}];
 for(const change of changes){const bad=structuredClone(record);const event=bad.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded');event.evidence.counts=change(event.evidence.counts);assert.throws(()=>workflowView(bad),/quality|count|disposition/i);}
});
test('approved source rebuild remains byte-identical with strict validation',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw'));
 const built=await buildArtifact(snapshot,pinnedArtifactId,normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,sources.collectionScope));
 for(const [name,body] of Object.entries(built.files))assert.equal(sha256(body),sha256(await readFile(resolve(root,'artifacts',pinnedArtifactId,name))),name);
});
test('loaded source-scope contradictions cannot bypass collection checks through direct artifact construction',async t=>{
 for(const [inventoryRows,monthlyRows,flag] of [[[{...parent,api_no:'00100001'}],[child],'source_scope:api_no_prefix'],[[parent],[{...child,formatted_date:'2023-12-01T00:00:00.000'}],'source_scope:formatted_date']]){
  const snapshot=await fixtureSnapshot(t,inventoryRows,monthlyRows);
  const n=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds);
  await assert.rejects(buildArtifact(snapshot,'scope-contradiction',n),error=>{
   assert.equal(error.code,'SOURCE_SCOPE_MISMATCH');assert.equal(error.quality.issue_counts[flag],1);
   const reasons=[...(error.quality.inventory_dispositions??[]),...error.quality.dispositions].flatMap(d=>d.reasons??[]);assert.ok(reasons.includes(flag));return true;
  });
 }
});
test('fixture artifact construction retains quarantined values and reasons after validation',async t=>{
 const snapshot=await fixtureSnapshot(t,[{...parent,max_liq_inj_pressure:'-5',top_inj_zone:'3000',bot_inj_zone:'2000'}],[{...child,id:null}]);
 const n=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 const artifact=await buildArtifact(snapshot,'quarantined-fixture',n);
 assert.equal(artifact.normalized.inventory[0].permit_liquid_pressure_limit_psi,-5);
 assert.equal(artifact.normalized.injectionMonthly[0].source_report_id,'');
 assert.equal(artifact.normalized.qualityReport.inventory.quarantined,1);assert.equal(artifact.normalized.qualityReport.monthly.quarantined,1);
 assert.ok(artifact.normalized.qualityReport.dispositions[0].reasons.includes('invalid:source_report_id'));
 assert.equal(artifact.manifest.provenance.classification,'test_fixture');assert.equal(artifact.manifest.real_history_status,'test_fixture');
 assert.equal(artifact.normalized.dataDictionary.fields.injected_liquid_bbl.status,'synthetic');
});
test('artifact construction rejects forged or missing quality counts against actual rows and loaded sources',async()=>{
 const snapshot=await loadSnapshot(resolve(root,'raw'));
 const n=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 await assert.rejects(buildArtifact(snapshot,'missing-counts',{...n,quality:{}}),error=>error.code==='QUALITY_INVALID');
 const fewer=normalize(snapshot.inventory,snapshot.monthly.slice(1),snapshot.sourceIds,snapshot.scope);
 await assert.rejects(buildArtifact(snapshot,'dropped-source-row',fewer),error=>error.code==='QUALITY_INVALID');
 const bad=structuredClone(n);bad.quality.monthly.accepted--;bad.quality.monthly.quarantined++;bad.quality.dispositions[0].disposition='quarantined';
 await assert.rejects(buildArtifact(snapshot,'forged-dispositions',bad),error=>error.code==='QUALITY_INVALID');
});
test('workflow checks counts against input/output evidence and requires export validation without depending on object key order',async()=>{
 let record;
 for(const name of await readdir(resolve(root,'runs'))){const candidate=JSON.parse(await readFile(resolve(root,'runs',name,'record.json')));if(candidate.status==='succeeded'){record=candidate;break;}}
 assert.ok(record);
 for(const change of [r=>{r.events.find(e=>e.stage==='load'&&e.status==='succeeded').evidence.inputs.find(i=>i.kind==='inventory').count++;},r=>{r.events.find(e=>e.stage==='normalize-qc'&&e.status==='succeeded').evidence.outputs[0].count++;},r=>{delete r.events.find(e=>e.stage==='export'&&e.status==='succeeded').evidence.counts;},r=>{r.events.find(e=>e.stage==='export'&&e.status==='succeeded').evidence.outputs.find(i=>i.path.endsWith('inventory.csv')).count++;}]){const bad=structuredClone(record);change(bad);assert.throws(()=>workflowView(bad),/quality|count/i);}
 const reordered=structuredClone(record),event=reordered.events.find(e=>e.stage==='export'&&e.status==='succeeded');event.evidence.counts=Object.fromEntries(Object.entries(event.evidence.counts).reverse());assert.equal(workflowView(reordered).status,'succeeded');
});
test('all preserved original run records remain inspectable after stronger quality validation',async()=>{
 for(const name of await readdir(resolve(root,'runs'))){const record=JSON.parse(await readFile(resolve(root,'runs',name,'record.json')));assert.equal(workflowView(record).status,record.status,name);}
});

test('producer quality validation binds quarantine identities and reasons to the retained rows',async t=>{
 const snapshot=await fixtureSnapshot(t,[{...parent,max_liq_inj_pressure:'-5'}],[{...child,id:null}]);
 const original=normalize(snapshot.inventory,snapshot.monthly,snapshot.sourceIds,snapshot.scope);
 for(const change of [n=>{n.quality.inventory_dispositions[0].source_record_key='unrelated-row';},n=>{n.quality.inventory_dispositions[0].reasons=['unrecorded-reason'];},n=>{n.quality.dispositions[0].reasons=['unrecorded-reason'];},n=>{delete n.quality.inventory_dispositions;}]){
  const bad=structuredClone(original);change(bad);
  await assert.rejects(buildArtifact(snapshot,'forged-quarantine-evidence',bad),error=>error.code==='QUALITY_INVALID');
 }
});

async function successWithReport(change){
 let record;
 for(const name of await readdir(resolve(root,'runs'))){const candidate=JSON.parse(await readFile(resolve(root,'runs',name,'record.json')));if(candidate.status==='succeeded'){record=candidate;break;}}
 assert.ok(record);
 for(const event of record.events)if(event.status==='succeeded'&&['normalize-qc','export'].includes(event.stage))change(event.evidence.counts);
 return record;
}
test('review regression: unmatched joins cannot claim every monthly row was accepted',async()=>{
 const record=await successWithReport(q=>{q.parent_join.matched--;q.parent_join.unmatched++;});
 assert.throws(()=>workflowView(record),/quality|count|disposition/i);
});
test('review regression: monthly quarantine requires actual retained reasons',async()=>{
 for(const reasons of [undefined,[],['missing:vol_liq']]){
  const record=await successWithReport(q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';if(reasons!==undefined)q.dispositions[0].reasons=reasons;q.issue_counts['invalid:source_report_id']=1;});
  assert.throws(()=>workflowView(record),/quality|reason|disposition/i);
 }
});
test('review regression: inventory quarantine requires per-row disposition evidence',async()=>{
 const record=await successWithReport(q=>{q.inventory.accepted--;q.inventory.quarantined++;q.issue_counts['invalid_negative:max_liq_inj_pressure']=1;});
 assert.throws(()=>workflowView(record),/quality|reason|disposition/i);
});
test('review regression: scope violations cannot become successful QC and export',async()=>{
 const record=await successWithReport(q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['source_scope:uic_no'];q.issue_counts['source_scope:uic_no']=1;});
 assert.throws(()=>workflowView(record),/quality|scope|disposition/i);
});
test('review regression: quarantine issue counts must match recorded quarantine reasons',async()=>{
 for(const change of [q=>{q.issue_counts['invalid:source_report_id']=1;},q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['invalid:source_report_id'];},q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['invalid:source_report_id'];q.issue_counts['invalid:source_report_id']=2;}]){
  const record=await successWithReport(change);assert.throws(()=>workflowView(record),/quality|reason|disposition/i);
 }
});
test('review compatibility: missing observations remain accepted and zero issue totals do not invent quarantine',()=>{
 const n=normalize([parent],[{...child,vol_liq:null}],ids,sources.collectionScope);
 n.quality.issue_counts['invalid:source_report_id']=0;
 assert.equal(assertQualityReport(n.quality).monthly.accepted,1);
 assert.ok(n.monthly[0].quality_flags.includes('missing:vol_liq'));
});
test('review compatibility: failed source-scope validation remains inspectable with its actual quarantine reasons',async()=>{
 const good=await successWithReport(()=>{}),n=normalize([parent],[{...child,uic_no:'000022085'}],ids,sources.collectionScope);
 const run=createRunRecorder({mode:'offline_replay',pipelineVersion:'rrc-collection-v1',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0',testFixture:true});
 const loadEvidence=structuredClone(good.events.find(e=>e.stage==='load'&&e.status==='succeeded').evidence);loadEvidence.provenance=run.snapshot().provenance;
 run.start('load');run.succeed('load',loadEvidence);
 run.start('normalize-qc');run.fail('normalize-qc',Object.assign(Error('scope mismatch'),{code:'SOURCE_SCOPE_MISMATCH'}),{counts:n.quality});
 const view=workflowView(run.snapshot());assert.equal(view.status,'failed');assert.equal(view.stages[2].status,'skipped');
 assert.ok(view.stages[1].evidence.counts.dispositions[0].reasons.includes('source_scope:uic_no'));
});
test('review regression: unmatched and ambiguous join totals must match recorded join errors',async()=>{
 for(const change of [q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['invalid:source_report_id'];q.issue_counts['invalid:source_report_id']=1;q.parent_join.matched--;q.parent_join.unmatched++;},q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['unmatched:parent'];q.issue_counts['unmatched:parent']=1;},q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['ambiguous:parent'];q.issue_counts['ambiguous:parent']=1;}]){
  const record=await successWithReport(change);assert.throws(()=>workflowView(record),/quality|join|count/i);
 }
});
test('review regression: verified public history cannot claim monthly quarantine',async()=>{
 const record=await successWithReport(q=>{q.monthly.accepted--;q.monthly.quarantined++;q.dispositions[0].disposition='quarantined';q.dispositions[0].reasons=['invalid:source_report_id'];q.issue_counts['invalid:source_report_id']=1;});
 record.events.find(e=>e.stage==='export'&&e.status==='succeeded').evidence.realHistoryStatus='verified_bounded_linkage';
 assert.throws(()=>workflowView(record),/quality|verified|history/i);
});
test('review regression: verified public history cannot claim inventory quarantine',async()=>{
 const record=await successWithReport(q=>{q.inventory.accepted--;q.inventory.quarantined++;q.inventory_dispositions=Array.from({length:q.inventory.parsed},(_,i)=>({source_record_key:`inventory-${i}`,disposition:i===0?'quarantined':'accepted',...(i===0?{reasons:['invalid_negative:max_liq_inj_pressure']}:{})}));q.issue_counts['invalid_negative:max_liq_inj_pressure']=1;});
 record.events.find(e=>e.stage==='export'&&e.status==='succeeded').evidence.realHistoryStatus='verified_bounded_linkage';
 assert.throws(()=>workflowView(record),/quality|verified|history/i);
});
