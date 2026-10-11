import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {dispositionRows} from '../public/presentation.js';
import {facts,filterInventory,sourceUrl,countText} from '../public/presentation.js';
import {clearDatasetEvidence,historyState} from '../public/dataset-state.js';
import {createLatestRequest} from '../public/collection.js';
import {escapeHtml,formatNumber} from '../public/inspection.js';
const nav=await import('../public/navigation.js').catch(()=>({}));
test('bookmarked dataset routes retain exact version and tab while global routes have no dataset context',()=>{
 assert.equal(typeof nav.parseRoute,'function');
 assert.deepEqual(nav.parseRoute('#dataset/rrc-v2/quality'),{screen:'workspace',artifactId:'rrc-v2',tab:'quality'});
 assert.deepEqual(nav.parseRoute('#history'),{screen:'history'});assert.deepEqual(nav.parseRoute('#datasets'),{screen:'datasets'});
 assert.deepEqual(nav.parseRoute('#exports'),{screen:'workspace',artifactId:null,tab:'downloads'});
 assert.deepEqual(nav.parseRoute('#workflow'),{screen:'find'});
 assert.equal(nav.datasetRoute('rrc-v2','sources'),'#dataset/rrc-v2/sources');
});
test('invalid dataset routes cannot become paths or arbitrary tabs',()=>{
 assert.equal(typeof nav.parseRoute,'function');
 for(const hash of ['#dataset/../records','#dataset/a%2Fb/records','#dataset/v1/not-a-tab'])assert.deepEqual(nav.parseRoute(hash),{screen:'datasets'});
 assert.throws(()=>nav.datasetRoute('../escape','records'),/version|identity/i);
});
test('historical run bookmarks retain a distinct run identity without borrowing dataset identity',()=>{
 assert.deepEqual(nav.parseRoute('#history/c24eb125-53eb-42cb-9d5a-d73c5387ce05'),{screen:'history',runId:'c24eb125-53eb-42cb-9d5a-d73c5387ce05'});assert.deepEqual(nav.parseRoute('#history/../escape'),{screen:'datasets'});
});
test('library summaries use verified source identity and distinguish rows, months and parents',async()=>{
 assert.equal(typeof nav.datasetSummary,'function');const artifact=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url)));
 const summary=nav.datasetSummary(artifact);assert.equal(summary.uic,'000020838');assert.equal(summary.api,'38910201');assert.equal(summary.inventoryRows,5);assert.equal(summary.monthlyRows,28);assert.equal(summary.reportingMonths,28);assert.equal(summary.linkedWells,1);assert.equal(summary.quarantined,0);assert.equal(summary.period,'2024-01 – 2026-04');
});
test('workspace collection details choose only a successful run for that exact artifact',()=>{
 assert.equal(typeof nav.associatedRun,'function');const runs=[{runId:'foreign',artifactId:'b',status:'succeeded'},{runId:'failed',artifactId:'a',status:'failed'},{runId:'own',artifactId:'a',status:'succeeded'}];
 assert.equal(nav.associatedRun('a',runs,'foreign'),'own');assert.equal(nav.associatedRun('missing',runs),null);assert.equal(nav.associatedRun('a',runs,'own'),'own');
});
test('timestamps show explicit local zone across DST without shifting month-only reporting dates',()=>{
 assert.equal(typeof nav.localTime,'function');assert.equal(nav.localTime(null,{timeZone:'America/Chicago'}),'Unavailable');assert.equal(nav.localTime('bad',{timeZone:'America/Chicago'}),'Unavailable');
 assert.match(nav.localTime('2026-01-15T12:00:00Z',{timeZone:'America/Chicago'}),/6:00:00 AM.*CST/);assert.match(nav.localTime('2026-07-15T12:00:00Z',{timeZone:'America/Chicago'}),/7:00:00 AM.*CDT/);assert.equal(nav.localTime('2024-01',{timeZone:'America/Chicago'}),'2024-01');assert.equal(nav.localTime('2024-01-01',{timeZone:'America/Chicago'}),'2024-01-01');
});
test('quality exposes inventory quarantine and unmatched monthly dispositions with retained identities',()=>{
 const artifact={inventory:[{source_record_key:'parent-a',quality_flags:['invalid_negative:bbl_vol_inj']}],injectionMonthly:[{source_row_key:'child-a',parent_key:'',quality_flags:['unmatched:parent']}],qualityReport:{inventory_dispositions:[{source_record_key:'parent-a',disposition:'quarantined',reasons:['invalid_negative:bbl_vol_inj']}],dispositions:[{source_row_key:'child-a',disposition:'quarantined',reasons:['unmatched:parent']}]}};
 const rows=dispositionRows(artifact);assert.equal(rows.length,2);assert.equal(rows.find(row=>row.source_record_key==='parent-a').disposition,'quarantined');assert.deepEqual(rows.find(row=>row.source_row_key==='child-a').reasons,['unmatched:parent']);
});
test('reporting confirmation accepts 36 inclusive months and refuses 37, reversed or invalid inputs',()=>{
 assert.equal(typeof nav.monthWindow,'function');assert.equal(nav.monthWindow('2024-12','2027-11'),36);assert.throws(()=>nav.monthWindow('2024-12','2027-12'),/36/);assert.throws(()=>nav.monthWindow('2024-02','2024-01'),/period|month/i);assert.throws(()=>nav.monthWindow(['2024-01'],'2024-02'),/month/i);
});
async function startUI({hash='#find',failPinned=false,failRegistry=false,verify,workflowSpy}={}){
 const original=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url))),nodes=new Map(),handlers={};
 const downloadLinks=[{handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}}];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(){},removeAttribute(){},appendChild(){},focus(){},querySelectorAll(selector){return id==='downloads'&&selector==='a'?downloadLinks:[];},replaceChildren(){this.textContent='';this.innerHTML='';},insertAdjacentHTML(position,text){this.innerHTML=position==='afterbegin'?text+this.innerHTML:this.innerHTML+text;}});if(id==='version-selection'&&!nodes.get(id).strictValue){const node=nodes.get(id);let selectedValue='';Object.defineProperty(node,'value',{get(){return selectedValue;},set(value){selectedValue=node.innerHTML.includes('value="'+value+'"')?value:'';}});node.strictValue=true;}return nodes.get(id);};
 const pins={artifactId:original.artifactId,path:`/artifacts/${original.artifactId}/`,defaultPinned:true},requested={artifactId:'requested-b',path:'/artifacts/requested-b/'};let hooks;
 const handoff={starts:[],cancelled:0,destroyed:false,state:{state:'idle'},emit(value){this.state=value;this.onState?.(value);},start(value){if(this.destroyed)return false;this.starts.push(value);this.emit({state:'preparing',artifactId:value.artifact.artifactId,message:'Preparing whole version'});return true;},cancel(){this.cancelled++;this.emit({state:'cancelled',message:'Cancelled'});},destroy(){this.destroyed=true;}};
 const next=structuredClone(original);next.artifactId='requested-b';next.manifest.artifact_id='requested-b';
 const auxiliaryLinks=['Export dataset','Inspect version & provenance'].map(label=>({textContent:label,href:'#exports',getAttribute(name){return this[name];}}));
 const env={document:{getElementById:element,querySelector:element,querySelectorAll:selector=>selector==='#dataset-workspace a[href^="#"]'?auxiliaryLinks:[]},window:{addEventListener:(name,handler)=>{handlers[name]=handler;},scrollTo(){},matchMedia:()=>({matches:false})},location:{hash},fetch:async path=>({ok:!((typeof failRegistry==='function'?failRegistry():failRegistry)&&path==='/api/versions'),json:async()=>path==='/artifact-path.json'?{artifact_id:original.artifactId,path:pins.path}:path==='/artifact-integrity.json'?pins:{versions:[pins,requested]}}),loadPinnedArtifact:async()=>{if(failPinned)throw Error('Pinned hash mismatch');return original;},loadVerifiedVersion:async value=>verify?verify(value,next):(value.artifactId===original.artifactId?original:next),mountCollection:options=>{hooks=options;},createLatestRequest,clearDatasetEvidence,historyState,...nav,chart:()=>'',fmt:formatNumber,escape:escapeHtml,mountWorkflow:async()=>({refresh(){},forDataset(){},showHistory(){},clearDataset:message=>workflowSpy?.(message)}),facts,filterInventory,dispositionRows,sourceUrl,countText};
 env.createAnalyticsHandoff=options=>{handoff.onState=options.onState;return handoff;};
 const code=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;await new AsyncFunction(...Object.keys(env),code)(...Object.values(env));return {element,env,route:()=>handlers.hashchange(),pagehide:()=>handlers.pagehide({persisted:true}),hooks,auxiliaryLinks,handoff,downloadLinks};
}

test('Analytics action hands off the complete verified version despite filters and cancels on navigation',async()=>{
 const ui=await startUI({hash:'#dataset/rrc-2026-10-09-uic000020838-v1/downloads'});
 assert.equal(typeof ui.element('analytics-start').handlers.click,'function','verified dataset must expose producer action');
 ui.element('search').value='000022085';ui.element('search').handlers.input();ui.element('analytics-start').handlers.click();
 assert.equal(ui.handoff.starts.length,1);assert.equal(ui.handoff.starts[0].artifact.inventory.length,5);assert.equal(ui.handoff.starts[0].artifact.injectionMonthly.length,28);assert.equal(ui.handoff.starts[0].pins.artifactId,'rrc-2026-10-09-uic000020838-v1');assert.equal(ui.handoff.starts[0].pins.classification,'public_reported');assert.equal(ui.handoff.starts[0].pins.defaultPinned,true);assert.equal(ui.element('analytics-start').disabled,true);assert.equal(ui.element('analytics-cancel').hidden,false);
 ui.handoff.emit({state:'previewed',message:'Waiting for confirmation'});assert.match(ui.element('analytics-status').textContent,/confirm/);assert.doesNotMatch(ui.element('version-provenance').innerHTML,/adopted/);
 ui.env.location.hash='#history';ui.route();assert.equal(ui.handoff.cancelled,1);
});

test('failed dataset verification disables Analytics action and removes prior transfer scope',async()=>{
 const ui=await startUI({hash:'#dataset/rrc-2026-10-09-uic000020838-v1/downloads',verify:async()=>{throw Error('Hash mismatch');}});
 ui.env.location.hash='#dataset/requested-b/downloads';ui.route();await new Promise(setImmediate);
 assert.equal(ui.element('analytics-start').disabled,true);assert.equal(ui.element('analytics-scope').textContent,'');ui.element('analytics-start').handlers.click();assert.equal(ui.handoff.starts.length,0);
});

test('back-forward cached Explorer cancels the old transfer and can start a fresh one',async()=>{
 const ui=await startUI({hash:'#dataset/rrc-2026-10-09-uic000020838-v1/downloads'});
 ui.element('analytics-start').handlers.click();ui.pagehide();
 assert.equal(ui.handoff.destroyed,false,'restorable page must not permanently destroy its controller');assert.equal(ui.handoff.cancelled,1);
 ui.element('analytics-start').handlers.click();assert.equal(ui.handoff.starts.length,2);
});

test('portable download cancels a pending Analytics transfer without promising receiver rollback',async()=>{
 const ui=await startUI({hash:'#dataset/rrc-2026-10-09-uic000020838-v1/downloads'});
 ui.element('analytics-start').handlers.click();ui.element('analytics-start').handlers.click();assert.equal(ui.handoff.starts.length,1);
 ui.downloadLinks[0].handlers.click();assert.equal(ui.handoff.cancelled,1);assert.equal(ui.element('analytics-start').disabled,false);assert.match(ui.element('analytics-status').textContent,/Check Analytics/);assert.doesNotMatch(ui.element('analytics-status').textContent,/case is unchanged/);
});
test('a failed version can recover without leaving an old integrity error under verified data',async()=>{
 let fail=true;const ui=await startUI({hash:'#dataset/requested-b/overview',verify:async(pins,next)=>{if(fail)throw Error('Selected hash mismatch');return next;}});assert.equal(ui.element('error').hidden,false);assert.equal(ui.element('overview-content').textContent,'');
 fail=false;ui.element('version-selection').value='requested-b';await ui.element('version-selection').handlers.change();assert.equal(ui.element('snapshot').textContent,'requested-b');assert.equal(ui.element('error').hidden,true);
});
test('global find remains available after a pinned failure and opening a different verified version recovers',async()=>{
 const ui=await startUI({failPinned:true});assert.equal(ui.element('find-view').hidden,false);assert.equal(ui.element('dataset-workspace').hidden,true);assert.equal(ui.element('error').hidden,true);
 ui.element('version-selection').value='requested-b';await ui.element('version-selection').handlers.change();ui.route();assert.equal(ui.element('snapshot').textContent,'requested-b');assert.equal(ui.element('dataset-workspace').hidden,false);assert.equal(ui.env.location.hash,'#dataset/requested-b/overview');
});
test('URL restoration verifies the bookmarked version and global back navigation hides its workspace',async()=>{
 const verified=[];const ui=await startUI({hash:'#dataset/requested-b/sources',verify:async(pins,next)=>{verified.push(pins.artifactId);return next;}});assert.equal(verified[0],'requested-b');assert.equal(ui.element('snapshot').textContent,'requested-b');assert.equal(ui.element('sources-view').hidden,false);
 ui.env.location.hash='#history';ui.route();assert.equal(ui.element('dataset-workspace').hidden,true);assert.equal(ui.element('history-view').hidden,false);assert.equal(ui.element('snapshot').textContent,'requested-b');
});
test('quality download retains its accessible label after a dataset evidence reset',async()=>{
 const ui=await startUI({hash:'#dataset/requested-b/quality'});assert.equal(ui.element('quality-download').textContent,'Download quality report (JSON)');assert.equal(ui.element('quality-download').href,'/artifacts/requested-b/quality_report.json?download=1');
});
test('filtering out a selected well clears contextual report lineage as well as record details',async()=>{
 const ui=await startUI({hash:'#records'});assert.match(ui.element('source-lineage').innerHTML,/Selected report lineage/);ui.element('search').value='does-not-exist';ui.element('search').handlers.input();assert.equal(ui.element('source-lineage').textContent,'');assert.equal(ui.element('source-lineage').innerHTML,'');
});
test('background collection completion refreshes history without changing the explicitly bookmarked run',async t=>{
 const root=new URL('../',import.meta.url),records=[];for(const id of await readdir(new URL('runs/',root))){const record=JSON.parse(await readFile(new URL(`runs/${id}/record.json`,root)));if(!record.testFixture&&record.status==='succeeded')records.push(record);}const [a,b]=records;assert.ok(a&&b);
 const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch},nodes=new Map();
 const element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,value:'',disabled:false,addEventListener(){},replaceChildren(){this.innerHTML='';this.textContent='';},querySelectorAll(){return [];},setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(id);};
 globalThis.document={getElementById:element,querySelectorAll:()=>[]};globalThis.window={matchMedia:()=>({matches:false})};globalThis.location={hash:'#history/'+a.runId};globalThis.fetch=async path=>({ok:true,json:async()=>path==='/api/runs'?{runs:records.map(record=>({runId:record.runId,status:record.status,startedAt:record.startedAt,mode:record.mode,artifactId:record.events.find(event=>event.stage==='export'&&event.status==='succeeded')?.evidence.artifactId})),unavailableRecords:0}:records.find(record=>path==='/api/runs/'+record.runId)});
 t.after(()=>{if(element('run-download').href)URL.revokeObjectURL(element('run-download').href);Object.assign(globalThis,previous);});
 const {mountWorkflow}=await import('../public/workflow-ui.js'),workflow=await mountWorkflow(null);workflow.showHistory(a.runId);await new Promise(setImmediate);assert.match(element('run-metadata').textContent,new RegExp(a.runId));
 await workflow.refresh(b.runId);assert.equal(element('run-selection').value,a.runId);assert.match(element('run-metadata').textContent,new RegExp(a.runId));assert.equal(location.hash,'#history/'+a.runId);
});

test('unverified dataset cannot reopen a recorded successful run and history remains reachable',async t=>{
 const original=JSON.parse(await readFile(new URL('../artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json',import.meta.url))),records=[];
 for(const id of await readdir(new URL('../runs/',import.meta.url))){const record=JSON.parse(await readFile(new URL(`../runs/${id}/record.json`,import.meta.url)));if(!record.testFixture&&record.status==='succeeded'&&record.events.some(event=>event.stage==='export'&&event.evidence?.artifactId===original.artifactId))records.push(record);}
 const record=records[0];assert.ok(record);const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch},nodes=new Map();
 const element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,value:'',disabled:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},replaceChildren(){this.innerHTML='';this.textContent='';},querySelectorAll(){return [];},setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(id);};
 globalThis.document={getElementById:element,querySelectorAll:()=>[]};globalThis.window={matchMedia:()=>({matches:false})};globalThis.location={hash:'#history'};globalThis.fetch=async path=>({ok:true,json:async()=>path==='/api/runs'?{runs:[{runId:record.runId,status:record.status,startedAt:record.startedAt,mode:record.mode,artifactId:original.artifactId}],unavailableRecords:0}:record});
 t.after(()=>{if(element('run-download').href)URL.revokeObjectURL(element('run-download').href);Object.assign(globalThis,previous);});
 const {mountWorkflow}=await import('../public/workflow-ui.js'),workflow=await mountWorkflow(original.manifest);
 workflow.forDataset(original.artifactId,null);assert.equal(element('run-selection').disabled,true);
 element('run-selection').value=record.runId;element('run-selection').handlers.change();await new Promise(setImmediate);assert.equal(element('run-download').hidden,true);assert.equal(element('workflow-nodes').innerHTML,'');assert.doesNotMatch(element('run-metadata').textContent,new RegExp(record.runId));
 workflow.forDataset(original.artifactId,original.manifest,record.runId);await new Promise(setImmediate);assert.equal(element('run-download').hidden,false);
 workflow.clearDataset('Dataset verification failed');element('run-selection').value=record.runId;element('run-selection').handlers.change();await new Promise(setImmediate);assert.equal(element('run-download').hidden,true);
 workflow.showHistory(record.runId);await new Promise(setImmediate);assert.equal(element('run-selection').disabled,false);assert.equal(element('run-download').hidden,false);
});

test('auxiliary workspace links follow the requested version when publication verification fails',async()=>{
 const ui=await startUI({hash:'#records'});const old=ui.element('snapshot').textContent;for(const link of ui.auxiliaryLinks)assert.equal(link.href,nav.datasetRoute(old,'downloads'));
 ui.env.location.hash='#dataset/rrc-not-available/records';ui.route();await new Promise(setImmediate);assert.equal(ui.element('snapshot').textContent,'Unavailable');for(const link of ui.auxiliaryLinks)assert.equal(link.href,'#dataset/rrc-not-available/downloads',link.textContent);
});

test('verified original example remains discoverable when the version registry fails',async()=>{
 const ui=await startUI({hash:'#datasets',failRegistry:true});
 assert.match(ui.element('dataset-library').innerHTML,/rrc-2026-10-09-uic000020838-v1/);
 assert.match(ui.element('dataset-library').innerHTML,/5 inventory rows/);
 assert.match(ui.element('dataset-library').innerHTML,/28 monthly report rows/);
 assert.match(ui.element('library-example').innerHTML,/Open example dataset/);
 assert.match(ui.element('library-example').innerHTML,/#dataset\/rrc-2026-10-09-uic000020838-v1\/records/);
 assert.match(ui.element('library-status').textContent,/registry unavailable/i);
 assert.equal(ui.element('dataset-workspace').hidden,true);
});
test('an example with failed integrity never receives a shortcut or fabricated library row',async()=>{
 const ui=await startUI({hash:'#datasets',failRegistry:true,failPinned:true});
 assert.equal(ui.element('library-example').innerHTML,'');
 assert.doesNotMatch(ui.element('dataset-library').innerHTML,/5 inventory rows/);
});

test('original example opens from another dataset after a registry outage with native select value rules',async()=>{
 let fail=false;const ui=await startUI({hash:'#dataset/requested-b/records',failRegistry:()=>fail});
 assert.equal(ui.element('snapshot').textContent,'requested-b');
 fail=true;await ui.hooks.onVersions();
 ui.env.location.hash='#dataset/rrc-2026-10-09-uic000020838-v1/records';ui.route();await new Promise(setImmediate);
 assert.equal(ui.element('snapshot').textContent,'rrc-2026-10-09-uic000020838-v1');
 assert.equal(ui.element('inventory-count').textContent,5);assert.equal(ui.element('monthly-count').textContent,28);
 assert.equal(ui.element('version-selection').value,'rrc-2026-10-09-uic000020838-v1');
});

test('returning to the failed dataset through navigation retries verification and restores only verified evidence',async()=>{
 let fail=true,attempts=0;const ui=await startUI({hash:'#dataset/requested-b/records',verify:async(pins,next)=>{attempts++;if(fail)throw Error('Selected hash mismatch');return next;}});
 const initialAttempts=attempts;assert.ok(initialAttempts>0);assert.equal(ui.element('snapshot').textContent,'Unavailable');assert.equal(ui.element('search').disabled,true);
 ui.env.location.hash='#datasets';ui.route();fail=false;ui.env.location.hash='#dataset/requested-b/records';ui.route();await new Promise(setImmediate);
 assert.ok(attempts>initialAttempts);assert.equal(ui.element('snapshot').textContent,'requested-b');assert.equal(ui.element('error').hidden,true);assert.equal(ui.element('search').disabled,false);
});
test('navigation does not repeat an in-flight verification',async()=>{
 const pending=[];let defer=false;const ui=await startUI({verify:async(pins,next)=>defer?new Promise(resolve=>pending.push(()=>resolve(next))):next});await new Promise(setImmediate);defer=true;
 ui.env.location.hash='#dataset/requested-b/records';ui.route();ui.env.location.hash='#dataset/requested-b/sources';ui.route();
 assert.equal(pending.length,1);pending[0]();await new Promise(setImmediate);assert.equal(ui.element('snapshot').textContent,'requested-b');
});

test('late dataset verification failure cannot erase the historical run or expose a workspace error globally',async()=>{
 let rejectPending,defer=false;const clears=[];const ui=await startUI({workflowSpy:message=>clears.push(message),verify:async(pins,next)=>defer?new Promise((resolve,reject)=>{rejectPending=reject;}):next});await new Promise(setImmediate);defer=true;
 ui.env.location.hash='#dataset/requested-b/collection';ui.route();const before=clears.length;
 ui.env.location.hash='#history';ui.route();rejectPending(Error('Selected hash mismatch'));await new Promise(setImmediate);
 assert.equal(ui.element('history-view').hidden,false);assert.equal(ui.element('dataset-workspace').hidden,true);assert.equal(ui.element('error').hidden,true);assert.equal(clears.length,before);
});
