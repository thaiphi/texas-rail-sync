import test from 'node:test';
import assert from 'node:assert/strict';
const state=await import('../public/dataset-state.js').catch(()=>({}));
test('changing dataset clears all prior identity, scope, quality and downloadable evidence before verification',()=>{
 assert.equal(typeof state.clearDatasetEvidence,'function','complete evidence reset required');
 const ids=['inventory-count','monthly-count','join-count','inventory-table','well-details','history','record-provenance','downloads','sources','version-details','version-provenance','quarantine','identity','history-label','dataset-scope','filter-count','quality-summary','quality','dictionary','snapshot','well-name','inventory-table-caption','workspace-identity','workspace-period','workspace-version','overview-content','overview-metrics','overview-warning','quality-metrics','quality-checks','source-lineage','quality-download','overview-actions','workspace-run-association'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:'previous verified version'}]));
 state.clearDatasetEvidence({getElementById:id=>nodes[id]});
 for(const id of ids)assert.equal(nodes[id].textContent,'',id);
});
test('zero reports after completed selected-UIC query is distinct from unacquired other parents',()=>{
 assert.equal(typeof state.historyState,'function');
 const artifact={manifest:{scope:{uic_number:'000020838'}},injectionMonthly:[]};
 assert.equal(state.historyState(artifact,{uic_number:'000020838',source_record_key:'one'}),'No reports returned');
 assert.equal(state.historyState(artifact,{uic_number:'000000001',source_record_key:'other'}),'History not acquired');
 artifact.injectionMonthly=[{parent_key:'one'}];assert.equal(state.historyState(artifact,{uic_number:'000020838',source_record_key:'one'}),'1 linked reports');
});
