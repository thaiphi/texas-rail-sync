import {workflowView} from './workflow.js';
import {escapeHtml as escape} from './inspection.js';
import {facts,countText,stageFacts,stageCount,runMetrics,sourceUrl,artifactDownload} from './presentation.js';
import {localTime,associatedRun} from './navigation.js';
const $=id=>document.getElementById(id);
const modeLabel=mode=>mode==='live_collection'?'Official acquisition':mode==='offline_export'?'Offline export':'Offline replay';
const titles={load:'Load & preserve sources','normalize-qc':'Normalize, link & validate',export:'Versioned dataset export'};
const descriptions={load:'Acquisition or offline verification of preserved source bytes. Retrieval times are distinct from this invocation.', 'normalize-qc':'Parsing, exact UIC parent linkage and quality accounting occur within this implemented stage.',export:'Publish a new immutable version or compare an existing version byte for byte. This does not record consumer acceptance.'};
const icons={load:'▤','normalize-qc':'◇',export:'▥'};
const badge=status=>`<span class="badge ${escape(status)}">${escape(status)}</span>`;
const references=items=>items.length?items.map(item=>{
 const url=sourceUrl(item.url),path=artifactDownload(item.path);
 return `<div class="reference-item"><strong>${escape(item.title??item.name??item.path??item.snapshotId??item.snapshot_id??'Recorded reference')}</strong>${url?`<a href="${escape(url)}" target="_blank" rel="noreferrer">Recorded source ↗</a>`:''}${path?`<a href="${escape(path)}" download>Download preserved output ↓</a>`:''}<p>${escape(item.snapshotId??item.snapshot_id??'Snapshot identity unavailable')}</p><p>Rows: ${countText(item.count)} · Bytes: ${countText(item.bytes)}</p>${item.retrieved_at?`<p>Retrieved ${escape(localTime(item.retrieved_at))}</p>`:''}<code>SHA-256 ${escape(item.sha256??'Unavailable')}</code></div>`;
 }).join(''):'<p class="note">No references recorded for this stage.</p>';
function qualityEvidence(counts){
 if(!counts||!Object.keys(counts).length)return '<p class="note">Validation counts unavailable. No result is inferred from run status.</p>';
 return facts([['Inventory raw / accepted',`${countText(counts.inventory?.raw)} / ${countText(counts.inventory?.accepted)}`],['Monthly raw / accepted',`${countText(counts.monthly?.raw)} / ${countText(counts.monthly?.accepted)}`],['Monthly quarantined',countText(counts.monthly?.quarantined)],['Monthly excluded',countText(counts.monthly?.excluded)],['Matched / unmatched',`${countText(counts.parent_join?.matched)} / ${countText(counts.parent_join?.unmatched)}`],['Ambiguous parents',countText(counts.parent_join?.ambiguous)]])+`<pre>${escape(JSON.stringify(counts.issue_counts??'Issue counts unavailable',null,2))}</pre>`;
}
export async function mountWorkflow(manifest){
 const selector=$('run-selection');let view=workflowView(null,manifest),selected='load',revision=0,downloadUrl=null,context='history',datasetId=null,datasetVerified=false,historyRuns=[],associationKey=null,historySelected='historical';
 const tabs=[...document.querySelectorAll('.inspector-tabs [role=tab]')];
 function activateTab(tab,focus=false){for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;$('panel-'+item.dataset.panel).hidden=!active;}if(focus)tab.focus();}
 for(const tab of tabs){tab.addEventListener('click',()=>activateTab(tab));tab.addEventListener('keydown',event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();activateTab(tabs[index],true);});}
 function inspect(id,reveal=false){
  selected=id;const node=view.stages.find(stage=>stage.id===id),detail=stageFacts(view,node);
  for(const button of $('workflow-nodes').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.stage===id));
  $('node-title').textContent=titles[id];$('node-state').textContent=node.status;$('node-state').className='badge '+node.status;
  $('node-description').textContent=descriptions[id];$('node-error').hidden=!node.error;$('node-error').textContent=node.error?`${node.error.code}: ${node.error.message}`:'';
  $('node-facts').innerHTML=facts([['Stage',node.label],['Started (local)',localTime(detail.startedAt)],['Ended (local)',localTime(detail.endedAt)],['Stage ID',node.stageId],['Operation',node.evidence?.operation]]);
  $('node-inputs').innerHTML=references(detail.inputs);$('node-outputs').innerHTML=references(detail.outputs);
  $('node-validation').innerHTML=detail.counts?qualityEvidence(detail.counts):node.evidence?.expectedManifestSha256?facts([['Expected manifest',node.evidence.expectedManifestSha256],['Recorded manifest',node.evidence.actualManifestSha256]]):'<p class="note">No separate validation evidence recorded. Available reference hashes are shown above.</p>';
  $('node-evidence').textContent=node.evidence?JSON.stringify(node.evidence,null,2):'No execution evidence recorded for this stage.';
  $('node-downloads').replaceChildren();
  if(reveal&&window.matchMedia('(max-width:960px)').matches){$('node-title').tabIndex=-1;$('node-title').focus({preventScroll:true});$('node-title').closest('.node-detail').scrollIntoView({block:'start'});}
 }
 function clearRun(message){
  for(const id of ['workflow-nodes','consumer-boundary','run-counts','node-facts','node-inputs','node-outputs','node-validation','node-downloads','run-events'])$(id).replaceChildren();
  for(const id of ['node-description','node-error','node-evidence','run-metadata'])$(id).textContent='';
  $('node-error').hidden=true;$('run-download').hidden=true;$('node-title').textContent=message;$('node-state').textContent='Unavailable';$('node-state').className='badge';$('run-label').textContent=message;$('run-status').textContent=message.startsWith('Loading')?'Loading…':'Unavailable';$('run-status').className='badge unrecorded';
  if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
 }
 function render(record){
  $('run-label').textContent=view.label;$('run-status').textContent=view.status;$('run-status').className='badge '+view.status;
  $('run-metadata').textContent=view.runId?`Run ${view.runId} · Started ${localTime(view.startedAt)} · Ended ${localTime(view.endedAt)} · Pipeline ${view.versions.pipeline} · Schema ${view.versions.schema} · Transformation ${view.versions.transformation}`:'No associated execution events recorded. Retrieval metadata cannot reconstruct a successful run.';
  $('workflow-nodes').innerHTML=view.stages.map(node=>`<li class="workflow-node"><button type="button" data-stage="${node.id}" aria-label="${escape(titles[node.id])}: ${escape(node.status)}" aria-pressed="${node.id===selected}"><span class="node-icon" aria-hidden="true">${icons[node.id]}</span><strong class="node-name">${titles[node.id]}</strong>${badge(node.status)}<span class="node-count">${escape(stageCount(node))}</span></button></li>`).join('');
  for(const button of $('workflow-nodes').querySelectorAll('button'))button.addEventListener('click',()=>inspect(button.dataset.stage,true));
  $('consumer-boundary').innerHTML='<strong>↗ External Analytics consumer</strong><span>Acknowledgement unrecorded · outside this pipeline</span>';
  $('run-counts').innerHTML=runMetrics(view).map(([label,count])=>`<div><span class="metric-label">${escape(label)}</span><strong>${count===undefined||count===null?'—':countText(count)}</strong><small>${count===undefined||count===null?'Evidence unavailable':'Recorded in selected run'}</small></div>`).join('');
  $('run-events').innerHTML=view.events.length?`<div class="scroll-table" tabindex="0" role="region" aria-label="Chronological collection events"><table><caption>Recorded event order · local timezone shown; raw record retains UTC</caption><thead><tr><th scope="col">Time</th><th scope="col">Stage</th><th scope="col">Status</th><th scope="col">Evidence / error</th></tr></thead><tbody>${view.events.map(event=>`<tr><td>${escape(localTime(event.timestamp))}</td><td>${escape(titles[event.stage])}</td><td>${badge(event.status)}</td><td class="event-message">${escape(event.error?`${event.error.code}: ${event.error.message}`:event.evidence?stageCount({id:event.stage,evidence:event.evidence}):event.status==='skipped'?'Not executed after an earlier failure':'Stage started')}<span class="event-id">${escape(event.eventId)}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h3>Execution events unavailable</h3><p>No associated run record is selected. Preserved source evidence remains separate.</p></div>';
  if(record){downloadUrl=URL.createObjectURL(new Blob([JSON.stringify({...record,events:view.events},null,2)],{type:'application/json'}));$('run-download').href=downloadUrl;$('run-download').download=`run-${view.runId}.json`;$('run-download').hidden=false;}
  inspect(selected);
 }
 async function choose(){
  if(context==='dataset'&&!datasetVerified)return;
  const ticket=++revision,id=selector.value;$('run-error').hidden=true;clearRun('Loading selected run…');
  try{
   const record=id==='historical'?null:await fetch('/api/runs/'+encodeURIComponent(id)).then(response=>{if(!response.ok)throw Error('Recorded invocation unavailable');return response.json();});
   if(ticket!==revision)return;
   if(context==='dataset'&&record&&(record.status!=='succeeded'||record.events.find(event=>event.stage==='export'&&event.status==='succeeded')?.evidence?.artifactId!==datasetId))throw Error('Run belongs to a different dataset');
   view=workflowView(record,manifest);render(record);
  }catch{
   if(ticket!==revision)return;clearRun('Run evidence unavailable');$('run-error').hidden=false;$('run-error').textContent='The selected run is unavailable or invalid. Choose another invocation or the historical artifact. No previous run evidence is displayed.';
  }
 }
 selector.addEventListener('change',()=>{if(context==='history'){historySelected=selector.value;location.hash=historySelected==='historical'?'history':'history/'+encodeURIComponent(historySelected);}void choose();});render(null);
 function options(){selector.innerHTML='<option value="historical">No invocation selected — execution unrecorded</option>'+historyRuns.map(run=>`<option value="${escape(run.runId)}">${escape(localTime(run.startedAt))} — ${escape(modeLabel(run.mode))} — ${escape(run.status)}</option>`).join('');}
 function clearDataset(message){datasetVerified=false;associationKey=null;revision++;selector.disabled=true;selector.innerHTML='<option value="historical">Dataset evidence unavailable</option>';selector.value='historical';clearRun('Dataset run evidence unavailable');$('workspace-run-association').textContent=message;}
 function forDataset(id,verifiedManifest,preferred=null){
  if(!id||!verifiedManifest){context='dataset';datasetId=id;clearDataset('Dataset evidence must verify before an associated run can be inspected.');return;}
  const runId=associatedRun(id,historyRuns,preferred),key=id+':'+(runId??'historical');if(context==='dataset'&&associationKey===key)return;
  context='dataset';datasetId=id;datasetVerified=true;manifest=verifiedManifest;associationKey=key;selector.disabled=true;selector.innerHTML=runId?`<option value="${escape(runId)}">Associated invocation ${escape(runId)}</option>`:'<option value="historical">No associated run record</option>';selector.value=runId??'historical';$('workspace-run-association').textContent=runId?`Associated dataset ${id} · run ${runId}. This is recorded execution, not the current collection request.`:`No successful run record is associated with dataset ${id}. Source retrieval evidence cannot establish historical stage success.`;void choose();
 }
 function showHistory(runId=null){if(context==='history'&&(!runId||runId===historySelected))return;context='history';datasetId=null;associationKey=null;selector.disabled=false;options();if(runId){historySelected=runId;if(!historyRuns.some(run=>run.runId===runId))selector.insertAdjacentHTML('beforeend',`<option value="${escape(runId)}">Requested invocation ${escape(runId)}</option>`);}selector.value=runId??(historyRuns.some(run=>run.runId===historySelected)?historySelected:'historical');void choose();}
 // ZC-02: the optional Postgres run index (container setup). Absent or unreachable, the line stays hidden; files stay authoritative.
 async function showIndex(){
  const line=$('history-index');if(!line)return;
  try{const health=await fetch('/api/health').then(response=>response.ok?response.json():null),db=health?.database;
   if(db?.status==='ok'||db?.status==='degraded'){line.textContent=`Run index (Postgres): ${db.runs} runs and ${db.versions} dataset versions indexed${db.indexedAt?` at ${localTime(db.indexedAt)}`:''}${db.status==='degraded'?' · last refresh failed, showing the previous index':''}. The files remain the record.`;line.hidden=false;}
   else line.hidden=true;
  }catch{line.hidden=true;}
 }
 async function refresh(){try{
  const history=await fetch('/api/runs').then(response=>{if(!response.ok)throw Error('Run history unavailable');return response.json();});
  void showIndex();
  historyRuns=history.runs;if(context==='history'){options();selector.value=historyRuns.some(run=>run.runId===historySelected)?historySelected:'historical';}
  $('run-history-note').textContent=`${history.runs.length} recorded invocations. ${history.unavailableRecords?`${history.unavailableRecords} invalid or unavailable records excluded. `:''}Marked fixtures excluded. Record browsing stays on the explicitly selected dataset version.`;
  $('export-history').innerHTML=history.runs.length?`<ul class="export-history-list">${history.runs.map(run=>`<li><div>${escape(localTime(run.startedAt))} ${badge(run.status)}<small>${escape(modeLabel(run.mode))} · ${escape(run.artifactId??'No completed export')}</small></div><button type="button" data-run="${escape(run.runId)}" aria-label="Inspect run ${escape(run.runId)}">Inspect run</button></li>`).join('')}</ul>`:'<p class="note">No instrumented invocations available.</p>';
  for(const button of $('export-history').querySelectorAll('button'))button.addEventListener('click',()=>{showHistory(button.dataset.run);location.hash='history/'+encodeURIComponent(button.dataset.run);$('workflow-view').tabIndex=-1;$('workflow-view').focus({preventScroll:true});$('workflow-view').scrollIntoView({block:'start'});});
 }catch{$('run-history-note').textContent='Recorded history is unavailable. Historical source evidence remains inspectable; execution events stay unrecorded.';$('export-history').innerHTML='<p class="notice warning">Run history unavailable. The independently pinned dataset is unchanged.</p>';}
 }
 await refresh();return {refresh,forDataset,showHistory,clearDataset};
}

