import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {workflowView} from '../public/workflow.js';
import {countText,stageFacts,runMetrics,filterInventory,dispositionRows,artifactDownload,sourceUrl,facts} from '../public/presentation.js';
const read=path=>readFile(new URL(path,import.meta.url),'utf8').then(JSON.parse);
const artifact=await read('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json');

test('historical and partial runs never borrow counts or timestamps from the pinned artifact',()=>{
 const historical=workflowView(null,artifact.manifest);
 assert.ok(runMetrics(historical).every(([,value])=>value==null));
 assert.equal(stageFacts(historical,historical.stages[0]).startedAt,null);
 assert.equal(countText(null),'Unavailable');assert.equal(countText(undefined),'Unavailable');assert.equal(countText(0),'0');
 const partial={...historical,stages:[{id:'load',evidence:{inputs:[{count:5}]}},{id:'normalize-qc',evidence:null},{id:'export',evidence:null}]};
 assert.deepEqual(runMetrics(partial).map(([,value])=>value),[undefined,undefined,undefined,1]);
});
test('stage inspector takes input/output and timing only from the selected stage',()=>{
 const view={events:[{stage:'load',status:'running',timestamp:'2026-10-09T10:00:00Z'},{stage:'load',status:'succeeded',timestamp:'2026-10-09T10:00:01Z'},{stage:'export',status:'skipped',timestamp:'2026-10-09T10:00:03Z'}]};
 const load=stageFacts(view,{id:'load',evidence:{inputs:[{count:0}],outputs:[]}});
 assert.equal(load.startedAt,'2026-10-09T10:00:00Z');assert.equal(load.endedAt,'2026-10-09T10:00:01Z');assert.equal(load.inputs[0].count,0);
 const skipped=stageFacts(view,{id:'export',evidence:null});assert.equal(skipped.startedAt,null);assert.equal(skipped.endedAt,'2026-10-09T10:00:03Z');assert.deepEqual(skipped.outputs,[]);
});
test('filters combine original identifiers, county and operator without changing the dataset',()=>{
 const before=JSON.stringify(artifact);
 assert.equal(filterInventory(artifact,{term:' 000020838 ',county:'Reeves',operator:'103834'}).length,1);
 assert.equal(filterInventory(artifact,{term:'trees'}).length,1);
 assert.equal(filterInventory(artifact,{term:'000020838',operator:'101988'}).length,0);
 assert.equal(filterInventory(artifact,{county:'not acquired'}).length,0);
 assert.equal(filterInventory(artifact,{}).length,5);assert.equal(JSON.stringify(artifact),before);
});
test('quarantine presentation retains every disposition and its recorded reasons',()=>{
 const fixture={injectionMonthly:[{source_row_key:'a',quality_flags:['duplicate_period','negative_quantity']}],qualityReport:{dispositions:[{source_row_key:'a',disposition:'quarantined'},{source_row_key:'b',disposition:'excluded',reasons:['source_scope']},{source_row_key:'c',disposition:'accepted'}]}};
 assert.deepEqual(dispositionRows(fixture),[{source_row_key:'a',disposition:'quarantined',reasons:['duplicate_period','negative_quantity']},{source_row_key:'b',disposition:'excluded',reasons:['source_scope']}]);
 assert.deepEqual(dispositionRows(artifact),[]);
 fixture.qualityReport.dispositions[0].reasons=['source_scope','duplicate_period'];
 assert.deepEqual(dispositionRows(fixture)[0].reasons,['duplicate_period','negative_quantity','source_scope'],'keep disposition reasons as well as row flags without duplicating them');
});
test('source and output links refuse unsafe schemes, traversal and foreign files; evidence is escaped',()=>{
 assert.equal(sourceUrl('javascript:alert(1)'),null);assert.equal(sourceUrl('https://data.texas.gov/a'),'https://data.texas.gov/a');
 for(const path of ['../secrets','artifacts/../manifest.json','artifacts/v1/../manifest.json','https://example.com/x','artifacts/v1/sources/../../x'])assert.equal(artifactDownload(path),null,path);
 assert.equal(artifactDownload('artifacts/v1/sources/monthly.json'),'/artifacts/v1/sources/monthly.json?download=1');
 assert.match(facts([['<img>','<script>']]),/&lt;script&gt;/);
});
