import {loadPinnedArtifact,loadVerifiedVersion,loadVerifiedSidecar} from './artifact-integrity.js';
import {renderTestsView,testReportsCollected} from './tests-view.js';
import {renderWellboreView,wellboreCollected} from './wellbore-view.js';
import {renderDossierView,dossierCollected} from './dossier-view.js';
import {mountCollection,createLatestRequest} from './collection.js';
import {clearDatasetEvidence,historyState} from './dataset-state.js';
import {chart,formatNumber as fmt,escapeHtml as escape} from './inspection.js';
import {mountWorkflow} from './workflow-ui.js';
import {facts,filterInventory,dispositionRows,sourceUrl,countText} from './presentation.js';
import {parseRoute,datasetRoute,compareRoute,datasetSummary,localTime,localZone} from './navigation.js';
import {renderCompareView,compareEntry,compareOptions,compareFailure,compareSide,collectedAt,orderSides,ONLY_LISTED} from './compare-view.js';
import {compareVersions} from './version-compare.js';
import {createAnalyticsHandoff} from './analytics-handoff.js';
import {listSavedPackages,saveVerifiedPackage,verifyVersionPackage} from './browser-library.js';
import {createLegacyCollectionApi,createGuestCollectionApi} from './collection-api.js';
import {createGuestClient} from './guest-client.js';
import {PORTFOLIO_URL} from './portfolio-link.js';
import {renderWatchView,renderWatchError,renderDiff,checkBar,textDiffable} from './watch-view.js';
import {htmlToText} from './html-text.js';
import {citationLinks,renderSourceCards} from './page-links.js';
const $=id=>document.getElementById(id);
// Bootstrap failure before the collection controls mount: say so instead of leaving a silent control.
let collectionMounted=false;window.addEventListener('error',()=>{if(!collectionMounted&&$('lookup-submit')?.disabled)$('collection-status').textContent='Collection controls could not start. Reload the page to retry; saved and preserved datasets may still be browsable.';});
let data,base,selected;
let availableVersions=[],requestedVersionId=null,pinnedVersion=null,failedVersionId=null;const versionRequest=createLatestRequest(),registryRequest=createLatestRequest();
let workflow=null,currentRoute=parseRoute(location.hash);const libraryArtifacts=new Map();
let analyticsPins=null,analyticsVersion=null,analyticsTransfer={state:'idle'};
const savedPackages=new Map();let savedView=null;
// Dossier selection is UI state only: the route key plus these module variables; nothing is stored or written.
let dossierIntegrity=null,dossierShown,dossierState=null,dossierFilter='';
// Compare screen (RRC-16): the pair lives only in the route and these variables; nothing is stored or written.
const compareRequest=createLatestRequest();let compareShown=null,compareState=null,compareFilter={dataset:'',outcome:''},registryStatus='pending';
const guestMode=document.querySelector('meta[name="trrc-mode"]')?.getAttribute('content')==='guest';
// Guest datasets: private, verified on open, never listed in the public registry or pinned.
const guestPackages=new Map();
// Watched documents are local only (D7): the guest shell never shows the nav item or the screen.
if(guestMode)document.querySelector('[data-route="watch"]').hidden=true;
if(PORTFOLIO_URL){const link=$('portfolio-link');link.href=PORTFOLIO_URL;link.hidden=false;}
const analyticsActive=()=>['preparing','waiting','receiving','validating','previewed'].includes(analyticsTransfer.state);
const analyticsHandoff=createAnalyticsHandoff({window,onState:event=>{
 analyticsTransfer=event;analyticsVersion=event.artifactId??analyticsVersion;
 const messages={preparing:'Preparing the whole verified version…',waiting:'Waiting for Injection Analytics…',receiving:'Sending the whole version…',validating:'Analytics is checking the package…',previewed:'Package verified. Review the preview in Analytics and confirm to use it for this session.',adopted:'Analytics reports that you confirmed this version for the current session. Default pins and recorded collection evidence are unchanged.',rejected:'Transfer could not complete. Download the complete package instead.',cancelled:'Pending transfer cancelled. Check Analytics for its current session.'};
 $('analytics-status').textContent=messages[event.state]??event.message??'';
 if(event.code&&event.state==='rejected')$('analytics-status').textContent+=' '+String(event.message??event.code).slice(0,300);
 updateAnalyticsControls();
}});
// ADR 005 §5: only query versions the merged Analytics receiver verifies are offered. The legacy pin
// has no query_version. v4 since well-injection-insights b48ce03, v5 since 227ebab; v3 stays local.
const ANALYTICS_QUERY_VERSIONS=Object.freeze([2,4,5]);
const listVersions=versions=>versions.length<2?versions.join(''):`${versions.slice(0,-1).join(', ')} and ${versions.at(-1)}`;
// Fail closed: a manifest without a scope object is never offered.
const localOnlyVersion=manifest=>!manifest?.scope||typeof manifest.scope!=='object'||(manifest.scope.query_version!==undefined&&!ANALYTICS_QUERY_VERSIONS.includes(manifest.scope.query_version));
const localOnlyMessage=manifest=>`Query version ${manifest?.scope?.query_version??'unknown'} is not sent to Analytics. Its receiver accepts query versions ${listVersions(ANALYTICS_QUERY_VERSIONS)} and the original pinned version (ADR 005).`;
function analyticsReady(){return Boolean(data&&!savedView&&!localOnlyVersion(data.manifest)&&analyticsPins?.artifactId===data.artifactId&&currentRoute.screen==='workspace'&&currentRoute.tab==='downloads'&&(!currentRoute.artifactId||currentRoute.artifactId===data.artifactId));}
function updateAnalyticsControls(){
 $('analytics-start').disabled=!analyticsReady()||analyticsActive();$('analytics-cancel').hidden=!analyticsActive();
}
function resetAnalytics(){if(analyticsActive())analyticsHandoff.cancel();analyticsPins=null;analyticsVersion=null;analyticsTransfer={state:'idle'};$('analytics-status').textContent='';$('analytics-scope').textContent='';updateAnalyticsControls();}
$('analytics-start').addEventListener('click',()=>{if(!analyticsReady()||analyticsActive())return;analyticsVersion=data.artifactId;analyticsHandoff.start({artifact:data,pins:analyticsPins});});
$('analytics-cancel').addEventListener('click',()=>analyticsHandoff.cancel());
// Always cancel a pending transfer; keep owned saved-file URLs when the page enters the back/forward cache.
window.addEventListener('pagehide',event=>{analyticsHandoff.cancel();if(!event?.persisted)revokeSavedUrls();});
updateAnalyticsControls();

// E12-lite watched documents (spec §6, local only D7): screen state lives only in these variables; the server owns the list.
// Imports from watch-view.js/html-text.js are used only inside functions that run on the #watch route.
// E12-lite page links (spec §7). PAGE_JUMP records, per mode, whether #page=N was proven to open the cited page in every browser checked
// (local: the /artifacts/ route served inline, proven in Chrome 156 and Edge on 2026-11-04; saved: the browser-saved or guest blob URL,
// proven in Chrome only, Edge not checked, so the owner chose the fallback label on 2026-11-05). Unproven modes use the fallback label.
const PAGE_JUMP=Object.freeze({local:true,saved:false});
let sourcesWatchLoad=0;
const watchState={data:null,error:null,expanded:new Set(),diffs:new Map(),pending:new Set(),add:null};let watchPollTimer=null,watchLoad=0;
const watchDate=value=>localTime(value,{hour:undefined,minute:undefined,second:undefined,timeZoneName:undefined});
const watchDateTime=value=>localTime(value,{second:undefined});
const watchJson=async response=>{try{return await response.json();}catch{return null;}};
async function watchFetch(){
 const response=await fetch('/api/watch',{cache:'no-store'}),body=await watchJson(response);
 if(!response.ok||!body?.list)throw Error(body?.error?.message??(response.status===404?'Watched documents are available only in the local Explorer.':`The watch list could not be loaded (HTTP ${response.status}).`));
 return body;
}
async function watchPost(action,body){
 const response=await fetch(`/api/watch/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await watchJson(response);
 if(!response.ok)throw Object.assign(Error(data?.error?.message??`The request did not complete (HTTP ${response.status}).`),{code:data?.error?.code,existingId:data?.existingId??null});
 return data;
}
function stopWatchPoll(){clearTimeout(watchPollTimer);watchPollTimer=null;}
function scheduleWatchPoll(){stopWatchPoll();if(currentRoute.screen==='watch'&&watchState.data?.running)watchPollTimer=setTimeout(pollWatch,1000);}
function setWatchStatus(message,alert=false){const node=$('watch-action-status');if(!node)return;node.innerHTML=alert?`<span class="notice danger" role="alert">${escape(message)}</span>`:escape(message);}
function renderWatch(){
 const host=$('watch-content');
 if(watchState.error||!watchState.data){host.innerHTML=renderWatchError(watchState.error??'The watch list could not be loaded.');return;}
 const {list,running,lastCheck,lastRun}=watchState.data;
 host.innerHTML=renderWatchView({list,running,lastCheck,lastRun,formatDate:watchDate,formatDateTime:watchDateTime,expanded:watchState.expanded,diffs:watchState.diffs,add:watchState.add});
 for(const id of watchState.expanded)void loadWatchDiffs(id);
}
async function showWatch(){
 const ticket=++watchLoad;
 try{watchState.data=await watchFetch();watchState.error=null;}catch(error){watchState.data=null;watchState.error=error.message;}
 if(ticket!==watchLoad||currentRoute.screen!=='watch')return;
 renderWatch();scheduleWatchPoll();
}
// While a check runs only the Check now button and summary change, so a half-typed note or the focus is never lost.
async function pollWatch(){
 watchPollTimer=null;const ticket=++watchLoad;let next;
 try{next=await watchFetch();}catch(error){if(ticket===watchLoad&&currentRoute.screen==='watch'){watchState.error=error.message;renderWatch();}return;}
 if(ticket!==watchLoad||currentRoute.screen!=='watch')return;
 watchState.data=next;
 if(next.running){$('watch-checkbar-host').innerHTML=checkBar({...next,formatDate:watchDate,formatDateTime:watchDateTime});scheduleWatchPoll();return;}
 renderWatch();setWatchStatus(next.lastRun?'The check did not complete.':'Check finished.',Boolean(next.lastRun));
}
// Web-page changes: fetch both verified copies as text and diff them in place; a PDF on either side gets no diff.
async function loadWatchDiffs(docId){
 const doc=watchState.data?.list.documents.find(item=>item.id===docId);if(!doc)return;
 for(const ev of doc.history.filter(item=>item.type==='change'&&textDiffable(item))){
  if(watchState.diffs.has(ev.id)||watchState.pending.has(ev.id))continue;
  watchState.pending.add(ev.id);
  let entry;
  try{
   const [before,after]=await Promise.all([ev.previous_sha256,ev.sha256].map(async sha=>{
    const response=await fetch(`/api/watch/copy/${docId}/${sha}`);
    if(!response.ok){const body=await watchJson(response);throw Error(body?.error?.message??'This saved copy is not available.');}
    return htmlToText(await response.text());
   }));
   entry={before,after};
  }catch(error){entry={error:error.message};}
  watchState.pending.delete(ev.id);watchState.diffs.set(ev.id,entry);
  const host=$(`watch-diff-${ev.id}`);if(host)host.innerHTML=renderDiff(entry);
 }
}
function focusWatchRow(id){const button=document.querySelector(`[data-watch-toggle="${id}"]`);if(button){button.focus();button.scrollIntoView?.({block:'center'});}}
async function runWatchAction(action,body,{done,focusId}={}){
 setWatchStatus('Saving…');
 let result;try{result=await watchPost(action,body);}catch(error){setWatchStatus(error.message,true);return null;}
 await showWatch();if(focusId)focusWatchRow(focusId);if(done)setWatchStatus(done);
 return result;
}
async function startWatchCheck(){
 const button=$('watch-check');if(button)button.disabled=true;
 try{await watchPost('check',{});}catch(error){if(button)button.disabled=false;setWatchStatus(error.message,true);return;}
 await showWatch();setWatchStatus('Check started. Each watched address is fetched once, one at a time.');
}
$('watch-content').addEventListener('click',event=>{
 const target=event.target;if(!target?.closest)return;
 if(target.closest('#watch-check')){void startWatchCheck();return;}
 const toggle=target.closest('[data-watch-toggle]');
 if(toggle){const id=toggle.dataset.watchToggle,open=!watchState.expanded.has(id);if(open)watchState.expanded.add(id);else watchState.expanded.delete(id);toggle.setAttribute('aria-expanded',String(open));const row=$(`watch-details-${id}`);if(row)row.hidden=!open;if(open)void loadWatchDiffs(id);return;}
 const existing=target.closest('[data-watch-open]');
 if(existing){event.preventDefault();const id=existing.dataset.watchOpen;watchState.expanded.add(id);renderWatch();focusWatchRow(id);return;}
 const stop=target.closest('[data-watch-stop]');if(stop){void runWatchAction('stop',{id:stop.dataset.watchStop},{done:'Stopped watching. The row and its history are kept.',focusId:stop.dataset.watchStop});return;}
 const again=target.closest('[data-watch-rewatch]');if(again)void runWatchAction('rewatch',{id:again.dataset.watchRewatch},{done:'Watching again.',focusId:again.dataset.watchRewatch});
});
$('watch-content').addEventListener('submit',event=>{
 const form=event.target;if(!form?.dataset)return;event.preventDefault();
 const field=name=>form.elements.namedItem(name)?.value??'';
 if(form.dataset.watchAdd!==undefined){
  watchState.add={url:field('url'),name:field('name'),kind:field('kind'),message:null,existingId:null};
  void (async()=>{
   try{const {document:doc}=await watchPost('add',{url:watchState.add.url,name:watchState.add.name,kind:watchState.add.kind});watchState.add=null;watchState.expanded.add(doc.id);await showWatch();focusWatchRow(doc.id);setWatchStatus(`Added ${doc.name}. The next Check now saves its first copy.`);}
   catch(error){watchState.add={...watchState.add,message:error.message,existingId:error.code==='WATCH_DUPLICATE'?error.existingId:null};renderWatch();$('watch-add-url')?.focus();}
  })();
  return;
 }
 if(form.dataset.watchReview)void runWatchAction('review',{id:form.dataset.watchReview,note:field('note')},{done:'Marked reviewed.',focusId:form.dataset.watchReview});
 else if(form.dataset.watchNote)void runWatchAction('note',{id:form.dataset.watchNote,changeId:form.dataset.change,note:field('note')},{done:'Note added.',focusId:form.dataset.watchNote});
 else if(form.dataset.watchEdit)void runWatchAction('edit',{id:form.dataset.watchEdit,name:field('name'),kind:field('kind')},{done:'Name and kind saved.',focusId:form.dataset.watchEdit});
});

function route(focus=false){
 currentRoute=parseRoute(location.hash);if(guestMode&&currentRoute.screen==='watch')currentRoute={screen:'find'};const workspace=currentRoute.screen==='workspace',id=currentRoute.artifactId??requestedVersionId??data?.artifactId;
 if(analyticsActive()&&(!workspace||currentRoute.tab!=='downloads'||id!==analyticsVersion))analyticsHandoff.cancel();
 updateAnalyticsControls();updateSaveControl();
 for(const name of ['find','datasets','history','help','watch','compare'])$(name+'-view').hidden=currentRoute.screen!==name;
 $('dataset-workspace').hidden=!workspace;
 $('error').hidden=!workspace||!$('error').textContent;
 for(const [tab,view] of [['overview','overview'],['records','records'],['tests','tests'],['wellbore','wellbore'],['dossier','dossier'],['quality','quality'],['sources','sources'],['downloads','exports'],['collection','collection-details']])$(view+'-view').hidden=!workspace||currentRoute.tab!==tab;
 for(const link of document.querySelectorAll('[data-route]')){if(link.dataset.route===(workspace||currentRoute.screen==='compare'?'datasets':currentRoute.screen))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 for(const link of document.querySelectorAll('[data-tab]')){link.href=id?datasetRoute(id,link.dataset.tab):'#datasets';if(workspace&&link.dataset.tab===currentRoute.tab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 if(workspace&&id)updateWorkspaceLinks(id);
 if(data&&dossierIntegrity&&workspace&&currentRoute.tab==='dossier'&&(!currentRoute.artifactId||currentRoute.artifactId===data.artifactId)&&dossierSubject(data)!==dossierShown)void showDossier(data,dossierIntegrity,savedView);
 const showRun=currentRoute.screen==='history'||(workspace&&currentRoute.tab==='collection');$('workflow-view').hidden=!showRun;
 if(showRun){$(workspace?'workspace-run-host':'history-run-host').appendChild($('workflow-view'));if(workflow){if(workspace)workflow.forDataset(id,data?.artifactId===id?data.manifest:null,availableVersions.find(version=>version.artifactId===id)?.runId);else workflow.showHistory(currentRoute.runId);}}
 if(workspace&&currentRoute.artifactId&&currentRoute.artifactId!==data?.artifactId&&(currentRoute.artifactId!==requestedVersionId||(focus&&currentRoute.artifactId===failedVersionId))&&(availableVersions.length||savedPackages.size||guestPackages.size))void openDataset(currentRoute.artifactId);
 if(currentRoute.screen==='datasets'&&availableVersions.length)void verifyLibrary();
 if(currentRoute.screen==='compare'){if(compareKey(currentRoute)!==compareShown)void showCompare(currentRoute);}else if(compareShown!==null||compareState){compareRequest.invalidate();compareShown=null;compareState=null;$('compare-content').innerHTML='';}
 if(currentRoute.screen==='watch')void showWatch();else{stopWatchPoll();watchLoad++;}
 if(focus){if(currentRoute.screen==='history'&&currentRoute.runId){$('workflow-view').tabIndex=-1;$('workflow-view').focus({preventScroll:true});$('workflow-view').scrollIntoView({block:'start'});}else{$('main').focus({preventScroll:true});window.scrollTo({top:0});}}
}
window.addEventListener('hashchange',()=>route(true));route();
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('main').focus();$('main').scrollIntoView({block:'start'});});
for(const link of document.querySelectorAll('[data-route]'))link.addEventListener('click',()=>{if(link.getAttribute('href')===location.hash)route(true);});
const dl=entries=>entries.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value??'Unavailable')}</dd></div>`).join('');
const sourceLink=(source,label)=>sourceUrl(source?.url)?`<a href="${escape(sourceUrl(source.url))}" target="_blank" rel="noreferrer">${escape(label)} ↗</a>`:'Source URL unavailable';
function updateWorkspaceLinks(id){for(const link of document.querySelectorAll('#dataset-workspace a[href^="#"]')){const destination=parseRoute(link.getAttribute('href'));if(destination.screen==='workspace')link.href=datasetRoute(id,destination.tab,destination.recordKey??null);}}
function showReport(key,reveal=false){
 const report=data.injectionMonthly.find(row=>row.source_row_key===key&&row.parent_key===selected);if(!report)return;
 $('report-facts').innerHTML=facts([['Liquid (reported)',`${fmt(report.injected_liquid_bbl)} bbl`],['Gas (reported)',`${fmt(report.injected_gas_mcf)} MCF`],['Average pressure',`${fmt(report.reported_avg_injection_pressure_psi)} psi`],['Maximum pressure',`${fmt(report.reported_max_injection_pressure_psi)} psi`],['Calendar-day rate',`${fmt(report.calculated_calendar_day_avg_bpd,2)} bbl/day`],['Source report ID',report.source_report_id]]);
 const disposition=data.qualityReport.dispositions.find(row=>row.source_row_key===key)?.disposition??'unavailable';
 $('report-evidence').innerHTML=`<p class="note"><strong>Disposition: ${escape(disposition)}</strong> · ${escape(report.quality_flags.length?report.quality_flags.join(', '):'No recorded quality flags')}<br>Exact original UIC ${escape(report.uic_number)} → parent ${escape(report.parent_key??'unavailable')}<br>Source row ${escape(report.source_row_key)}</p>`;
 for(const button of document.querySelectorAll('[data-report]')){const active=button.dataset.report===key;button.setAttribute('aria-pressed',String(active));button.closest('tr').classList.toggle('selected',active);}
 $('report-selection').value=key;
 $('source-lineage').innerHTML=`<h3>Selected report lineage</h3><p>UIC ${escape(report.uic_number)} → original report ${escape(report.source_report_id)} (${escape(report.period_start.slice(0,7))}) → ${escape(report.source_row_key)}</p><p>Exact parent ${escape(report.parent_key||'Unavailable')} · disposition ${escape(disposition)}</p><p>Source snapshot ${escape(report.source_snapshot_id)}</p><p>${sourceLink(data.manifest.sources.find(source=>source.snapshot_id===report.source_snapshot_id),'Official monthly source')}</p>`;
 if(reveal&&window.matchMedia('(max-width:960px)').matches){$('report-title').tabIndex=-1;$('report-title').focus({preventScroll:true});$('report-title').closest('.report-card').scrollIntoView({block:'start'});}
}
function select(key,reveal=false){
 const record=data.inventory.find(row=>row.source_record_key===key);if(!record)return;selected=key;
 $('source-lineage').replaceChildren();
 const rows=data.injectionMonthly.filter(row=>row.parent_key===key);
 $('well-name').textContent=`UIC ${record.uic_number}`;$('identity').textContent=`${record.lease_name} · Well ${record.well_no_display}`;
 $('history-label').textContent=historyState(data,record);$('history-label').className='badge '+(rows.length?'linked':'unrecorded');
 $('well-details').innerHTML=dl([['Source API',record.api_no],['County',record.county],['Operator number',record.operator_number],['Well number',record.well_no_display],['Permit pressure',`${fmt(record.permit_liquid_pressure_limit_psi)} psi`],['Permit volume',`${fmt(record.permit_liquid_volume_limit_bpd)} bbl/day`],['Permitted interval',`${fmt(record.permitted_top_depth_ft)}–${fmt(record.permitted_bottom_depth_ft)} ft`],['W-14 / date',`${record.w14_number} / ${record.w14_date}`]]);
 if(rows.length){
  $('history').innerHTML=chart(rows)+`<section class="report-card" aria-labelledby="report-title"><h3 id="report-title">Selected monthly report <small>public reported</small></h3><label for="report-selection">Reporting month / source report ID</label><select id="report-selection">${rows.map(row=>`<option value="${escape(row.source_row_key)}">${escape(row.period_start.slice(0,7))} · report ${escape(row.source_report_id)}</option>`).join('')}</select><div id="report-facts"></div><details><summary>Linkage &amp; validation evidence</summary><div id="report-evidence"></div></details><p class="note">Calculated rate = reported liquid barrels ÷ calendar days. Pressure is reported injection psi, not bottom-hole pressure.</p></section><details class="history-fold"><summary>All ${rows.length} monthly reports · inspect table</summary><div class="scroll-table" tabindex="0" role="region" aria-label="Monthly injection history for UIC ${escape(record.uic_number)}"><table><caption>All retained reports. Focus the table and use arrow keys to scroll. Missing is not zero.</caption><thead><tr><th scope="col">Month / inspect</th><th scope="col">Liquid (bbl)</th><th scope="col">Gas (MCF)</th><th scope="col">Avg psi</th><th scope="col">Max psi</th><th scope="col">Calculated bbl/day</th><th scope="col">Report ID</th><th scope="col">Quality flags</th></tr></thead><tbody>${rows.map(row=>`<tr><td><button type="button" data-report="${escape(row.source_row_key)}" aria-label="Inspect report ${escape(row.source_report_id)}" aria-pressed="false">${escape(row.period_start.slice(0,7))}</button></td><td>${fmt(row.injected_liquid_bbl)}</td><td>${fmt(row.injected_gas_mcf)}</td><td>${fmt(row.reported_avg_injection_pressure_psi)}</td><td>${fmt(row.reported_max_injection_pressure_psi)}</td><td>${fmt(row.calculated_calendar_day_avg_bpd,2)}</td><td>${escape(row.source_report_id)}</td><td>${escape(row.quality_flags.join(', ')||'No flags')}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('report-selection').addEventListener('change',event=>showReport(event.target.value));
  for(const button of document.querySelectorAll('[data-report]'))button.addEventListener('click',()=>showReport(button.dataset.report,true));
  showReport(rows[0].source_row_key);
 }else $('history').innerHTML=record.uic_number===data.manifest.scope.uic_number?`<div class="empty"><h3>No reports returned for this period</h3><p>The completed bounded query covered UIC ${escape(record.uic_number)}, ${escape(data.manifest.scope.start)}${data.manifest.scope.end?' through '+escape(data.manifest.scope.end):' onward'}. This does not indicate zero injection.</p></div>`:`<div class="empty"><h3>No history acquired for this inventory record</h3><p>This version queried monthly history for UIC ${escape(data.manifest.scope.uic_number)} only. An empty view does not indicate zero injection or a missing report.</p></div>`;
 const source=data.manifest.sources.find(item=>item.snapshot_id===record.source_snapshot_id),monthlySource=rows.length?data.manifest.sources.find(item=>item.snapshot_id===rows[0].source_snapshot_id):null;
 $('record-provenance').innerHTML=`<section class="record-source"><h3>Source &amp; provenance</h3><p>${sourceLink(source,'Inventory source')}${monthlySource?' · '+sourceLink(monthlySource,'Monthly source'):''}</p><p>Snapshot ${escape(record.source_snapshot_id)} · API retained as ${record.api_no.length} source characters.</p><details><summary>Record identity, flags &amp; source hash</summary><p>Record key ${escape(record.source_record_key)}</p><p>Quality flags: ${escape(record.quality_flags.join(', ')||'No recorded flags')}</p><p>SHA-256 <code>${escape(source?.sha256??'Unavailable')}</code></p><p>${escape(record.county_basis)}</p><p>Permit values are regulatory constraints, not sustainable capacity. Current operating status is not inferred.</p></details><nav><a class="button-link" href="${datasetRoute(data.artifactId,'sources')}">View source ledger</a><a class="button-link" href="${escape(datasetRoute(data.artifactId,'dossier',record.source_record_key))}">Open dossier</a><a class="button-link primary" href="${escape(fileHref('injection_monthly.csv'))}" download="injection_monthly.csv">↓ Whole-snapshot CSV</a></nav></section>`;
 for(const button of $('inventory-table').querySelectorAll('button')){const active=button.dataset.key===key;button.setAttribute('aria-pressed',String(active));button.closest('tr').classList.toggle('selected',active);}
 if(reveal&&window.matchMedia('(max-width:960px)').matches){$('well-name').tabIndex=-1;$('well-name').focus({preventScroll:true});$('well-name').closest('.record').scrollIntoView({block:'start'});}
}
function filter(){
 if(!data)return;
 const rows=filterInventory(data,{term:$('search').value,county:$('county').value,operator:$('operator').value});
 if(!rows.some(row=>row.source_record_key===selected)){
  $('source-lineage').replaceChildren();
  selected=null;$('well-name').textContent=rows.length?'Select a visible record':'No matching records';$('identity').textContent='';$('history-label').textContent='No selection';$('history-label').className='badge';$('well-details').replaceChildren();$('record-provenance').replaceChildren();$('history').innerHTML='<div class="empty"><h3>No record selected</h3><p>Choose a visible inventory row, or clear the filters. Details from a hidden record are not shown.</p></div>';
 }
 $('inventory-table-caption').textContent='Acquired inventory · source identifiers preserved';
 $('inventory-table').innerHTML=rows.length?rows.map(row=>{const count=data.injectionMonthly.filter(month=>month.parent_key===row.source_record_key).length;return `<tr class="${row.source_record_key===selected?'selected':''}"><td><button type="button" data-key="${escape(row.source_record_key)}" aria-label="Inspect UIC ${escape(row.uic_number)}" aria-pressed="${row.source_record_key===selected}">${escape(row.uic_number)}</button></td><td>${escape(row.county)}</td><td>${escape(row.operator_number)}</td><td><span class="badge ${count?'linked':'unrecorded'}">${escape(historyState(data,row))}</span></td><td>${escape(row.api_no)}</td><td>${fmt(row.permit_liquid_volume_limit_bpd)}</td><td>${fmt(row.permit_liquid_pressure_limit_psi)}</td><td>${escape(row.quality_flags.join(', ')||'No flags')}</td></tr>`;}).join(''):'<tr><td colspan="8" class="empty-row">No acquired records match these filters. Clear filters to see the full inventory.</td></tr>';
 for(const button of $('inventory-table').querySelectorAll('button'))button.addEventListener('click',()=>select(button.dataset.key,true));
 $('filter-count').textContent=`Showing ${rows.length} of ${data.inventory.length} records`;
}
function renderExports(integrity){
 const manifest=data.manifest;
 analyticsPins=integrity;
 const inventoryUics=[...new Set(data.inventory.map(row=>row.uic_number))],historyUics=[...new Set(data.injectionMonthly.map(row=>row.uic_number))],months=data.injectionMonthly.map(row=>row.period_start).sort();
 $('analytics-scope').textContent=`Whole version ${data.artifactId}: ${inventoryUics.length} inventory UICs, ${historyUics.length} history UICs, ${data.injectionMonthly.length} monthly rows${months.length?`, reporting ${months[0].slice(0,7)} – ${months.at(-1).slice(0,7)}`:', reporting coverage unavailable'}. Filters and the selected well do not narrow this transfer.`;
 updateAnalyticsControls();if(localOnlyVersion(manifest))$('analytics-status').textContent=localOnlyMessage(manifest);
 $('version-details').innerHTML=facts([['Record class','Public reported — verified version pins'],['History readiness',manifest.real_history_status],['Inventory / monthly',`${data.inventory.length} / ${data.injectionMonthly.length}`],['Query period',`${manifest.scope.start} – ${manifest.scope.end??'no upper bound recorded'}`],['Schema',manifest.schema_version],['Transformation',manifest.transformation_version]]);
 $('version-provenance').innerHTML=facts([['Artifact ID',data.artifactId],['Retrieved (local)',localTime(manifest.sources[0]?.retrieved_at)],['Manifest SHA-256',integrity.manifestSha256],['Payload SHA-256',integrity.normalizedSha256],['Consumer handoff','Acknowledgement unrecorded']]);
 const descriptions={'inventory.csv':`${data.inventory.length} inventory records`,'injection_monthly.csv':`${data.injectionMonthly.length} retained monthly rows`,'manifest.json':'Source URLs, versions and hashes','quality_report.json':'Dispositions, counts and quality evidence','data_dictionary.json':'Field definitions, units and formulas','normalized.json':'Complete typed artifact for Analytics'};
 const testDescriptions={'tests.json':'BHP/SRT test-report rows, scope and quality','tests_bhp.csv':'Retained BHP test-report rows','tests_srt.csv':'Retained SRT test-report rows','tests_dictionary.json':'Test-report columns, units, basis and notes','casing.json':'Casing rows, exact-API link, scope and quality','casing.csv':'Retained casing filing rows','plugging.json':'Plugging rows, exact-API link, scope and quality','plugging.csv':'Retained plugging filing rows','wellbore_dictionary.json':'Casing/plugging columns, units, basis and notes','evidence_relations.json':'Typed relations between this version\'s records and source files (ADR 004 §3)'};
 $('downloads').innerHTML=[...Object.entries(descriptions),...Object.entries(testDescriptions).filter(([name])=>Object.hasOwn(manifest.files,name))].map(([name,description])=>`<a href="${escape(fileHref(name))}" download="${name}">↓ ${name}<small>${escape(description)}${manifest.files[name]?' · '+fmt(manifest.files[name].bytes)+' bytes':''}</small></a>`).join('');
 $('downloads').insertAdjacentHTML('afterbegin',`<a href="${escape(tarHref())}" download="${escape(data.artifactId)}.tar">↓ Complete version · TAR archive<small>All contract files, original sources, selection evidence and publication pins, verified before download.</small></a>`);
 const evidenceFiles=Object.keys(manifest.files).filter(name=>name.startsWith('sources/'));
 if(evidenceFiles.length)$('downloads').innerHTML+=`<details><summary>Whole-version source and selection evidence · ${evidenceFiles.length} files</summary><p class="note">Keep these files under sources/ together with all six contract downloads. Available lookup, selection, acquisition and retrieval sidecars permit independent offline replay.</p>${evidenceFiles.map(name=>`<a href="${escape(fileHref(name))}" download="${escape(name.split('/').at(-1))}">↓ ${escape(name)}</a>`).join('')}${Number.isInteger(manifest.scope.query_version)&&manifest.scope.query_version>=2?`<a href="${escape(fileHref('version-pins.json'))}" download="version-pins.json">↓ Publication pins</a>`:''}</details>`;
 for(const link of $('downloads').querySelectorAll('a'))link.addEventListener('click',()=>{if(analyticsActive())analyticsHandoff.cancel();});
 renderSources();loadSourcesWatch();
 const quality=data.qualityReport;
 $('quality-summary').textContent=`Monthly rows: ${countText(quality.monthly.raw)} raw = ${countText(quality.monthly.accepted)} accepted + ${countText(quality.monthly.quarantined)} quarantined + ${countText(quality.monthly.excluded)} excluded. Quarantine reasons stay with the retained rows.`;
 const issues=dispositionRows(data);
 $('quarantine').innerHTML=issues.length?`<div class="scroll-table" tabindex="0" role="region" aria-label="Quarantined and excluded source rows"><table><thead><tr><th>Source row</th><th>Disposition</th><th>Recorded reasons</th><th>Inspect</th></tr></thead><tbody>${issues.map(row=>`<tr><td>${escape(row.source_record_key??row.source_row_key)}</td><td>${escape(row.disposition)}</td><td>${escape(row.reasons.join(', ')||'Reason unavailable')}</td><td><button type="button" data-issue="${escape(row.source_record_key??row.source_row_key)}">View record / evidence</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="notice">No inventory or monthly rows are quarantined or excluded in this version. Accepted does not establish engineering readiness.</p>';
 for(const button of $('quarantine').querySelectorAll('[data-issue]'))button.addEventListener('click',()=>inspectIssue(button.dataset.issue));
 $('quality-metrics').innerHTML=[['Inventory accepted',quality.inventory.accepted],['Monthly accepted',quality.monthly.accepted],['Quarantined (all rows)',quality.inventory.quarantined+quality.monthly.quarantined],['Excluded (all rows)',quality.inventory.excluded+quality.monthly.excluded]].map(([label,count])=>`<div><strong>${countText(count)}</strong><small>${escape(label)}</small></div>`).join('');
 $('quality-checks').innerHTML=facts([['Inventory reconciliation',`${quality.inventory.raw} raw = ${quality.inventory.accepted} accepted + ${quality.inventory.quarantined} quarantined + ${quality.inventory.excluded} excluded`],['Matched / unmatched / ambiguous',`${quality.parent_join.matched} / ${quality.parent_join.unmatched} / ${quality.parent_join.ambiguous}`],['Checks','Original identity, parsing, negatives, pressure consistency, duplicate reports, exact parent linkage and declared source scope'],['Revision policy',quality.revision_policy]])+`<pre>${escape(JSON.stringify(quality.issue_counts,null,2))}</pre>`;
 $('quality-download').textContent='Download quality report (JSON)';$('quality-download').href=fileHref('quality_report.json');
 $('quality').textContent=JSON.stringify(quality,null,2);$('dictionary').textContent=JSON.stringify(data.dataDictionary,null,2);
}
// Tests tab: sidecars are verified against the already verified manifest before any row is shown.
const testsRequest=createLatestRequest();
async function showTests(artifact,integrity,view){
 const ticket=testsRequest.begin(),target=$('tests-content');
 try{
  if(!testReportsCollected(artifact.manifest)){target.innerHTML=renderTestsView({status:'not_collected'});return;}
  target.innerHTML=renderTestsView({status:'loading'});
  const path=`/artifacts/${artifact.artifactId}/`,fetchImpl=view?async request=>{const url=view.urls.get(request.slice(path.length));return url?fetch(url):{ok:false};}:fetch;
  const json=async name=>JSON.parse(new TextDecoder().decode(await loadVerifiedSidecar(artifact,{...integrity,path},name,fetchImpl)));
  const [tests,dictionary]=await Promise.all([json('tests.json'),json('tests_dictionary.json')]);
  if(tests?.artifactId!==artifact.artifactId)throw Error('tests.json version identity mismatch');
  if(testsRequest.isCurrent(ticket))target.innerHTML=renderTestsView({status:'loaded',tests,dictionary});
 }catch(error){if(testsRequest.isCurrent(ticket))target.innerHTML=`<p class="notice danger" role="alert">Test reports unavailable: ${escape(error?.message??error)}. No test-report rows are shown for this version.</p>`;}
}
// Wellbore tab: casing/plugging sidecars and their dictionary are verified the same way before any row is shown.
const wellboreRequest=createLatestRequest();
async function showWellbore(artifact,integrity,view){
 const ticket=wellboreRequest.begin(),target=$('wellbore-content');
 try{
  if(!wellboreCollected(artifact.manifest)){target.innerHTML=renderWellboreView({status:'not_collected'});return;}
  target.innerHTML=renderWellboreView({status:'loading'});
  const path=`/artifacts/${artifact.artifactId}/`,fetchImpl=view?async request=>{const url=view.urls.get(request.slice(path.length));return url?fetch(url):{ok:false};}:fetch;
  const json=async name=>JSON.parse(new TextDecoder().decode(await loadVerifiedSidecar(artifact,{...integrity,path},name,fetchImpl)));
  const [casing,plugging,dictionary]=await Promise.all([json('casing.json'),json('plugging.json'),json('wellbore_dictionary.json')]);
  for(const [doc,dataset] of [[casing,'casing'],[plugging,'plugging']]){if(doc?.artifactId!==artifact.artifactId)throw Error(`${dataset}.json version identity mismatch`);if(doc?.dataset!==dataset)throw Error(`${dataset}.json dataset mismatch`);}
  if(wellboreRequest.isCurrent(ticket))target.innerHTML=renderWellboreView({status:'loaded',casing,plugging,dictionary});
 }catch(error){if(wellboreRequest.isCurrent(ticket))target.innerHTML=renderWellboreView({status:'error',message:String(error?.message??error)});}
}
// Dossier tab: evidence_relations.json and every file it is checked against are verified before any relation is shown.
const dossierRequest=createLatestRequest();
const defaultSubject=artifact=>artifact.inventory.find(row=>row.uic_number===artifact.manifest.scope.uic_number)?.source_record_key??null;
function dossierSubject(artifact){const own=currentRoute.screen==='workspace'&&currentRoute.tab==='dossier'&&(!currentRoute.artifactId||currentRoute.artifactId===artifact.artifactId);return own&&currentRoute.recordKey?currentRoute.recordKey:defaultSubject(artifact);}
function renderDossier(){
 $('dossier-content').innerHTML=renderDossierView({...dossierState,filter:dossierFilter});
 const control=$('dossier-relation-filter');control?.addEventListener?.('change',()=>{dossierFilter=control.value;renderDossier();$('dossier-relation-filter')?.focus?.();});
}
async function showDossier(artifact,integrity,view){
 const ticket=dossierRequest.begin(),target=$('dossier-content'),subjectKey=dossierSubject(artifact);dossierIntegrity=integrity;dossierShown=subjectKey;dossierState=null;dossierFilter='';
 try{
  if(!dossierCollected(artifact.manifest)){target.innerHTML=renderDossierView({status:'not_collected'});return;}
  if(subjectKey===null){target.innerHTML=renderDossierView({status:'no_subject',artifactId:artifact.artifactId});return;}
  if(!artifact.inventory.some(row=>row.source_record_key===subjectKey)){target.innerHTML=renderDossierView({status:'unknown_key',artifactId:artifact.artifactId});return;}
  target.innerHTML=renderDossierView({status:'loading'});
  const path=`/artifacts/${artifact.artifactId}/`,fetchImpl=view?async request=>{const url=view.urls.get(request.slice(path.length));return url?fetch(url):{ok:false};}:fetch;
  const json=async name=>JSON.parse(new TextDecoder().decode(await loadVerifiedSidecar(artifact,{...integrity,path},name,fetchImpl)));
  const [catalogue,tests,casing,plugging,testsDictionary,wellboreDictionary]=await Promise.all(['evidence_relations.json','tests.json','casing.json','plugging.json','tests_dictionary.json','wellbore_dictionary.json'].map(json));
  for(const [doc,name] of [[catalogue,'evidence_relations.json'],[tests,'tests.json'],[casing,'casing.json'],[plugging,'plugging.json']])if(doc?.artifactId!==artifact.artifactId)throw Error(`${name} version identity mismatch`);
  for(const [doc,dataset] of [[casing,'casing'],[plugging,'plugging']])if(doc?.dataset!==dataset)throw Error(`${dataset}.json dataset mismatch`);
  if(!dossierRequest.isCurrent(ticket))return;
  dossierState={status:'loaded',artifact,subjectKey,catalogue,tests,casing,plugging,testsDictionary,wellboreDictionary};renderDossier();
 }catch(error){if(dossierRequest.isCurrent(ticket))target.innerHTML=renderDossierView({status:'error',message:String(error?.message??error)});}
}
// Compare screen (spec §7.2): both sides are server-listed versions verified by the same loaders as the workspace;
// sidecars are verified against each side's manifest; any failure shows no rows (fail closed).
function compareKey(target){return [target.a,target.b].sort().join('\n');}
function renderCompare(){
 $('compare-content').innerHTML=renderCompareView(compareState?.status==='loaded'?{...compareState,filter:compareFilter}:compareState);
 for(const [id,field] of [['compare-filter-dataset','dataset'],['compare-filter-outcome','outcome']]){const control=$(id);control?.addEventListener?.('change',()=>{compareFilter={...compareFilter,[field]:control.value};renderCompare();$(id)?.focus?.();});}
}
async function showCompare(target){
 const ticket=compareRequest.begin(),show=state=>{if(!compareRequest.isCurrent(ticket))return false;compareState=state;renderCompare();return true;};
 compareFilter={dataset:'',outcome:''};
 if(registryStatus==='pending'){compareShown=null;show({status:'loading'});return;}
 compareShown=compareKey(target);show({status:'loading'});
 try{
  if(registryStatus==='failed')throw Error('the version registry is unavailable');
  const pins=[target.a,target.b].map(id=>availableVersions.find(version=>version.artifactId===id));
  if(pins.some(item=>!item)){show({status:'refused',reason:ONLY_LISTED});return;}
  const artifacts=await Promise.all(pins.map(async item=>{const artifact=libraryArtifacts.get(item.artifactId)??await loadVerifiedVersion(item);libraryArtifacts.set(item.artifactId,artifact);return artifact;}));
  const uics=artifacts.map(artifact=>artifact?.manifest?.scope?.uic_number);
  if(uics[0]!==uics[1]){show({status:'refused',reason:`the two versions belong to different UICs (${uics[0]} and ${uics[1]})`});return;}
  const sides=await Promise.all(artifacts.map(async(artifact,index)=>{
   const integrity={...pins[index],path:`/artifacts/${artifact.artifactId}/`},files=artifact.manifest?.files??{};
   const json=async name=>Object.hasOwn(files,name)?JSON.parse(new TextDecoder().decode(await loadVerifiedSidecar(artifact,integrity,name,fetch))):null;
   const [tests,casing,plugging,relations]=await Promise.all(['tests.json','casing.json','plugging.json','evidence_relations.json'].map(json));
   for(const [doc,name] of [[tests,'tests.json'],[casing,'casing.json'],[plugging,'plugging.json'],[relations,'evidence_relations.json']])if(doc!==null&&doc?.artifactId!==artifact.artifactId)throw Error(`${name} version identity mismatch`);
   for(const [doc,dataset] of [[casing,'casing'],[plugging,'plugging']])if(doc!==null&&doc?.dataset!==dataset)throw Error(`${dataset}.json dataset mismatch`);
   return {artifactId:artifact.artifactId,collected_at:collectedAt(artifact.manifest),side:compareSide(artifact,{tests,casing,plugging,relations})};
  }));
  if(!compareRequest.isCurrent(ticket))return;
  // OD-5: A is the earlier candidate-monthly collection; the route is rewritten to that order without a new history entry.
  const [first,second]=orderSides(sides[0],sides[1]);
  if(first.artifactId!==target.a){const canonical=compareRoute(first.artifactId,second.artifactId);history.replaceState(history.state??null,'',canonical);currentRoute=parseRoute(canonical);}
  let result;try{result=compareVersions(first.side,second.side);}catch(error){show(compareFailure(error));return;}
  if(show({status:'loaded',result})){const title=$('compare-title');title.tabIndex=-1;title.focus?.({preventScroll:true});}
 }catch(error){show({status:'error',message:String(error?.message??error)});}
}
// Version-picker entry (spec §7.1, OD-4): only other server-listed, verified versions of the same UIC are offered.
function updateCompareEntry(){
 const id=data?.artifactId,entry=id?compareEntry({artifactId:id,versions:availableVersions,verified:libraryArtifacts,listed:!savedView&&Boolean(livePinsFor(id)),pending:libraryLoading.size}):{uic:null,candidates:[],note:null};
 const select=$('compare-selection'),previous=select.value;
 $('compare-uic').textContent=entry.uic??'';select.innerHTML=compareOptions(entry.candidates);select.value=entry.candidates.includes(previous)?previous:entry.candidates[0]??'';
 $('compare-controls').hidden=!entry.candidates.length;$('compare-none').textContent=entry.note??'';$('compare-none').hidden=!entry.note;updateCompareLink();
}
function updateCompareLink(){const id=data?.artifactId,other=$('compare-selection').value;$('compare-open').href=id&&other&&other!==id?compareRoute(id,other):'#datasets';}
let manifest=null;
function displayDataset(artifact,integrity){
 data=artifact;requestedVersionId=artifact.artifactId;base=integrity.path??`/artifacts/${data.artifactId}/`;$('error').textContent='';$('error').hidden=true;
 $('snapshot').textContent=data.artifactId;$('inventory-count').textContent=data.inventory.length;$('monthly-count').textContent=data.injectionMonthly.length;$('join-count').textContent=new Set(data.injectionMonthly.filter(row=>row.parent_key).map(row=>row.uic_number)).size;
 $('dataset-scope').textContent=`${data.inventory.length} inventory record${data.inventory.length===1?'':'s'}. Monthly query: UIC ${data.manifest.scope.uic_number}, ${data.manifest.scope.start}${data.manifest.scope.end?' through '+data.manifest.scope.end:' onward'}. ${data.manifest.real_history_status}.`;
 for(const [id,field,label] of [['operator','operator_number','operators'],['county','county','counties']]){$(id).innerHTML=`<option value="">All acquired ${label}</option>`+[...new Set(data.inventory.map(row=>row[field]))].sort().map(value=>`<option value="${escape(value)}">${escape(value)}</option>`).join('');}
 $('search').value='';for(const id of ['search','county','operator','clear-filters'])$(id).disabled=false;
 const summary=datasetSummary(data);$('workspace-identity').textContent=`${summary.name}${summary.well?' · Well '+summary.well:''}`;$('workspace-period').textContent=`UIC ${summary.uic} · Source API ${summary.api} · Reporting coverage ${summary.period}`;$('workspace-version').textContent=data.artifactId;
 $('overview-metrics').innerHTML=[['Inventory rows',summary.inventoryRows],['Linked UICs',summary.linkedWells],['Monthly report rows',summary.monthlyRows],['Distinct reporting months',summary.reportingMonths]].map(([label,count])=>`<div><strong>${countText(count)}</strong><small>${escape(label)}</small></div>`).join('');
 $('overview-warning').innerHTML=summary.quarantined?`<p class="notice warning">${summary.quarantined} retained rows need review. <a href="${datasetRoute(data.artifactId,'quality')}">Review affected records</a></p>`:'<p class="notice">No recorded quarantine issues. Acceptance checks do not establish engineering readiness, compliance or safe conditions.</p>';
 $('overview-content').innerHTML=`<section class="panel padded"><h3>What this dataset contains</h3><p>Well inventory with original UIC/API/operator identifiers and available permit attributes.</p><p>Monthly reported liquid and gas volumes, separate average/maximum injection pressures and calculated calendar-day rates.</p><p>Preserved public sources, quality dispositions, field dictionary and immutable version evidence.</p></section><section class="panel padded"><h3>Coverage and limitations</h3><p>Monthly query: ${escape(summary.queryPeriod)} for UIC ${escape(summary.uic)}.</p><p>${escape(data.manifest.limitations.join(' '))}</p><p>Retrieved ${escape(localTime(summary.retrievedAt))}. Retrieval is separate from reporting coverage.</p></section>`;
 $('overview-actions').innerHTML=[['records','Explore records'],['dossier','Open dossier'],['downloads','Prepare download'],['collection','View collection details']].map(([tab,label])=>`<a class="button-link ${tab==='records'?'primary':''}" href="${escape(datasetRoute(data.artifactId,tab,tab==='dossier'?defaultSubject(data):null))}">${label}</a>`).join('');
 selected=data.inventory.find(row=>row.uic_number===data.manifest.scope.uic_number)?.source_record_key??data.inventory[0]?.source_record_key;filter();if(selected)select(selected);renderExports(integrity);void showTests(data,integrity,savedView);void showWellbore(data,integrity,savedView);void showDossier(data,integrity,savedView);
 updateWorkspaceLinks(data.artifactId);
 renderLibrary();route();
}
function renderLibrary(){
 const example=pinnedVersion&&libraryArtifacts.get(pinnedVersion.artifactId);
 for(const id of ['find-example','library-example']){
  $(id).hidden=!example;
  $(id).innerHTML=example?`<h2>Explore the original example</h2><p>Preserved public records: ${example.inventory.length} inventory rows and ${example.injectionMonthly.length} monthly reports. Monthly history covers UIC ${escape(example.manifest.scope.uic_number)} only; other inventory rows have no acquired history.</p><a class="button-link" href="${datasetRoute(example.artifactId,'records')}">Open example dataset</a><p class="note">Browse the existing evidence without running a collection or changing the default pin.</p>`:'';
 }
 const query=$('dataset-search').value.trim().toLowerCase();
 const rows=availableVersions.filter(pins=>{const artifact=libraryArtifacts.get(pins.artifactId),summary=artifact&&datasetSummary(artifact);return !query||[pins.artifactId,summary?.uic,summary?.api,summary?.name].some(value=>String(value??'').toLowerCase().includes(query));});
 $('dataset-library').innerHTML=rows.length?`<div class="scroll-table" tabindex="0" aria-label="Preserved dataset versions"><table><thead><tr><th>Dataset</th><th>Reporting coverage</th><th>Quality</th><th>Version</th><th>Open</th></tr></thead><tbody>${rows.map(pins=>{const artifact=libraryArtifacts.get(pins.artifactId),summary=artifact&&datasetSummary(artifact);return `<tr><td><strong>${escape(summary?.name??'Metadata not verified yet')}</strong><small>${summary?`Monthly scope UIC ${escape(summary.uic)} · API ${escape(summary.api)} · ${summary.inventoryRows} inventory rows · ${summary.monthlyRows} monthly report rows (${summary.reportingMonths} distinct months)`:'Verify this version to inspect source identity.'}</small></td><td>${escape(summary?.period??'Unavailable')}</td><td>${summary?`${summary.quarantined} quarantined rows`:'Unavailable'}</td><td><code>${escape(pins.artifactId)}</code><small>${pins.defaultPinned?'Default pinned':''}${data?.artifactId===pins.artifactId?' · Opened':''}</small></td><td><button type="button" class="primary" data-open-version="${escape(pins.artifactId)}">Open dataset</button></td></tr>`;}).join('')}</tbody></table></div>`:'<p class="empty">No preserved datasets match this search.</p>';
 $('dataset-library').insertAdjacentHTML('beforeend',savedLibraryHtml());
 for(const button of $('dataset-library').querySelectorAll('[data-open-version]'))button.addEventListener('click',()=>{location.hash=datasetRoute(button.dataset.openVersion,'overview');});
 updateCompareEntry();
 $('library-default').textContent=`Default pinned: ${availableVersions.find(version=>version.defaultPinned)?.artifactId??'Unavailable'}. ${data?'Opened: '+data.artifactId+'. ':''}Opening a dataset does not change the default pin.`;
}
const libraryLoading=new Set();
async function verifyLibrary(){
 await Promise.all(availableVersions.map(async pins=>{
  if(libraryArtifacts.has(pins.artifactId)||libraryLoading.has(pins.artifactId))return;libraryLoading.add(pins.artifactId);
  try{libraryArtifacts.set(pins.artifactId,await loadVerifiedVersion(pins));}catch{}finally{libraryLoading.delete(pins.artifactId);}
 }));renderLibrary();
}
function updateVersionSelection(){
 const requested=requestedVersionId??data?.artifactId??availableVersions.find(version=>version.defaultPinned)?.artifactId??'';
 const savedOnly=[...savedPackages.keys()].filter(id=>!availableVersions.some(version=>version.artifactId===id));
 $('version-selection').innerHTML=availableVersions.map(version=>`<option value="${escape(version.artifactId)}">${escape(version.artifactId)}${version.defaultPinned?' · default pinned':''}</option>`).join('')+savedOnly.map(id=>`<option value="${escape(id)}">${escape(id)} · saved in this browser · origin not re-verified</option>`).join('')+(requested&&!availableVersions.some(version=>version.artifactId===requested)&&!savedOnly.includes(requested)?`<option value="${escape(requested)}">${escape(requested)} · requested evidence unavailable in registry</option>`:'');$('version-selection').value=requested;$('version-selection').disabled=false;
}
async function refreshVersions(){
 const ticket=registryRequest.begin();
 try{const response=await fetch('/api/versions');const type=response.headers?.get?.('content-type')??'unavailable';if(!response.ok||!type.includes('application/json'))console.warn('Dataset registry response could not be verified',{status:response.status,contentType:type});if(!response.ok)throw Error('Version registry unavailable');const registry=await response.json();if(!registryRequest.isCurrent(ticket))return;availableVersions=registry.versions;registryStatus='ready';if(currentRoute.screen==='compare'&&compareShown===null)void showCompare(currentRoute);
 updateVersionSelection();
 $('library-status').textContent=`${availableVersions.length} preserved public versions. Source identity is shown only after version verification.`;renderLibrary();void verifyLibrary();
 }catch{if(!registryRequest.isCurrent(ticket))return;if(registryStatus==='pending'){registryStatus='failed';if(currentRoute.screen==='compare'&&compareShown===null)void showCompare(currentRoute);}console.warn('Dataset registry request failed; unverified versions remain unavailable.');$('library-status').textContent=availableVersions.length?'Version registry unavailable. Previously verified versions remain available below; additional versions cannot be listed. Reload to retry.':'Version registry unavailable. Retry by reloading; no verified versions are available.';renderLibrary();updateVersionSelection();$('version-selection').disabled=!availableVersions.length&&!savedPackages.size;}
}
async function openDataset(id){
 resetAnalytics();revokeSavedUrls();
 failedVersionId=null;requestedVersionId=id;$('version-selection').value=id;const ticket=versionRequest.begin(),guest=guestPackages.get(id),pins=guest?null:availableVersions.find(version=>version.artifactId===id),saved=pins||guest?null:savedPackages.get(id);
 updateWorkspaceLinks(id);
 data=null;selected=null;testsRequest.invalidate();wellboreRequest.invalidate();dossierRequest.invalidate();dossierShown=undefined;dossierState=null;clearDatasetEvidence(document);$('error').textContent='';$('error').hidden=true;$('well-name').textContent='Verifying selected version…';$('snapshot').textContent='Verifying…';$('workspace-identity').textContent='Verifying selected dataset…';$('workspace-version').textContent=id;for(const control of ['search','county','operator','clear-filters'])$(control).disabled=true;
 if(workflow&&currentRoute.tab==='collection')workflow.clearDataset('Verifying dataset; associated run evidence is unavailable.');
 try{if(!pins&&!saved&&!guest)throw Error('Requested publication pins unavailable');if(guest){const opened=await openSavedDataset(guest);if(!versionRequest.isCurrent(ticket)||requestedVersionId!==id){for(const url of opened.urls.values())URL.revokeObjectURL(url);URL.revokeObjectURL(opened.tarUrl);return;}savedView=opened;displayDataset(opened.artifact,{...guest.pins,path:`/artifacts/${id}/`});markGuestView();return;}if(saved){const opened=await openSavedDataset(saved);if(!versionRequest.isCurrent(ticket)||requestedVersionId!==id){for(const url of opened.urls.values())URL.revokeObjectURL(url);URL.revokeObjectURL(opened.tarUrl);return;}savedView=opened;displayDataset(opened.artifact,{...saved.pins,path:`/artifacts/${id}/`});markSavedView();return;}const artifact=await loadVerifiedVersion(pins);if(!versionRequest.isCurrent(ticket)||requestedVersionId!==pins.artifactId||$('version-selection').value!==requestedVersionId)return;libraryArtifacts.set(id,artifact);displayDataset(artifact,pins);}catch(error){if(!versionRequest.isCurrent(ticket))return;failedVersionId=id;$('error').hidden=currentRoute.screen!=='workspace';$('error').textContent=`Selected version unavailable: ${error.message}. Records and downloads are unavailable until verification succeeds.`;$('well-name').textContent='Dataset unavailable';$('snapshot').textContent='Unavailable';$('workspace-identity').textContent='Dataset unavailable';if(workflow&&currentRoute.screen==='workspace'&&currentRoute.tab==='collection')workflow.clearDataset('Dataset verification failed; associated run evidence is unavailable.');}
}
function inspectIssue(key){
 const inventory=data.inventory.find(row=>row.source_record_key===key),monthly=data.injectionMonthly.find(row=>row.source_row_key===key),parent=inventory??data.inventory.find(row=>row.source_record_key===monthly?.parent_key);
 if(parent){$('search').value='';$('county').value='';$('operator').value='';filter();select(parent.source_record_key);if(monthly)showReport(monthly.source_row_key);location.hash=datasetRoute(data.artifactId,'records');}
 else {$('source-lineage').innerHTML=`<h3>Affected monthly record: parent unavailable</h3><p>Source row ${escape(key)}</p><p>${escape(monthly?.quality_flags.join(', ')??'Retained disposition; normalized row unavailable')}</p><p>${sourceLink(data.manifest.sources.find(source=>source.kind==='monthly'),'Official monthly source')} · <a href="${escape(fileHref('sources/candidate-monthly.json'))}" download>Retained raw monthly response</a></p><pre>${escape(JSON.stringify(monthly??data.qualityReport.dispositions.find(row=>row.source_row_key===key),null,2))}</pre>`;location.hash=datasetRoute(data.artifactId,'sources');}
}
for(const id of ['county','operator'])$(id).addEventListener('change',filter);
$('search').addEventListener('input',filter);$('clear-filters').addEventListener('click',()=>{$('search').value='';$('county').value='';$('operator').value='';filter();});
$('dataset-search').addEventListener('input',renderLibrary);
$('compare-selection').addEventListener('change',updateCompareLink);
$('version-selection').addEventListener('change',async()=>{const id=$('version-selection').value;location.hash=datasetRoute(id,currentRoute.screen==='workspace'?currentRoute.tab:'overview');await openDataset(id);});
$('timezone-caption').textContent='Times shown in '+localZone();
await loadSavedLibrary();
try{
 const pointer=await fetch('/artifact-path.json').then(response=>{if(!response.ok)throw Error('Artifact pointer unavailable');return response.json();});base=pointer.path;
 const pinned=await loadPinnedArtifact(pointer);manifest=pinned.manifest;libraryArtifacts.set(pinned.artifactId,pinned);
 const integrity=await fetch('/artifact-integrity.json').then(response=>{if(!response.ok)throw Error('Integrity pin unavailable');return response.json();});
 pinnedVersion={...integrity,path:pointer.path,classification:'public_reported',defaultPinned:true};availableVersions=[pinnedVersion];
 if(!currentRoute.artifactId||currentRoute.artifactId===pinned.artifactId)displayDataset(pinned,pinnedVersion);
}catch(error){
 clearDatasetEvidence(document);$('error').hidden=false;$('error').textContent=`Could not load the pinned artifact: ${error.message}. Dataset counts, records and downloads remain unavailable.`;
 $('snapshot').textContent='Unavailable';$('version-selection').disabled=true;$('well-name').textContent='Dataset unavailable';for(const id of ['search','county','operator','clear-filters'])$(id).disabled=true;
}
await refreshVersions();
workflow=await mountWorkflow(manifest);
const collectionApi=guestMode?createGuestCollectionApi({client:createGuestClient(),onGuestPackage:({artifactId,tarBytes,pins})=>{guestPackages.set(artifactId,{artifactId,tarBytes,pins});}}):createLegacyCollectionApi();
mountCollection({api:collectionApi,onRun:()=>workflow.refresh(),onVersions:guestMode?async()=>{}:refreshVersions,onOpen:id=>{location.hash=datasetRoute(id,'overview');},onDownload:id=>{location.hash=datasetRoute(id,'downloads');}});
collectionMounted=true;
if(currentRoute.artifactId&&currentRoute.artifactId!==data?.artifactId)await openDataset(currentRoute.artifactId);
route();
function inlineHref(name){return savedView?savedView.urls.get(name)??null:`${base}${name}`;}
function sourceCitations(watchList){return citationLinks({dictionary:data.dataDictionary,sources:data.manifest.sources,hrefFor:inlineHref,pageJump:savedView?PAGE_JUMP.saved:PAGE_JUMP.local,watchList,formatDate:watchDate});}
function renderSources(citations=sourceCitations(null)){$('sources').innerHTML=renderSourceCards({sources:data.manifest.sources,citations,fileHref,sourceLink,formatTime:localTime,formatBytes:fmt});}
// The newer-copy note uses the local watch list only (D7): never fetched in guest mode; a failed or stale read shows no note.
function loadSourcesWatch(){
 if(guestMode||!sourceCitations(null).some(link=>link.href))return;
 const shown=data,ticket=++sourcesWatchLoad;
 // A plain GET (the server answers no-store), like every other request made while a dataset opens.
 fetch('/api/watch').then(watchJson).then(body=>{if(ticket!==sourcesWatchLoad||data!==shown||!body?.list)return;const citations=sourceCitations(body.list);if(citations.some(link=>link.newer))renderSources(citations);},()=>{});
}
// Browser-saved versions: exact TAR + pins only; re-verified on every open. "Verified now"
// comes only from the live server path; saved copies never enable trusted Analytics transfer.
function revokeSavedUrls(){if(!savedView)return;for(const url of savedView.urls.values())URL.revokeObjectURL(url);URL.revokeObjectURL(savedView.tarUrl);savedView=null;}
function fileHref(name){return savedView?savedView.urls.get(name)??'#':`${base}${name}?download=1`;}
function tarHref(){return savedView?savedView.tarUrl:`/api/versions/${encodeURIComponent(data.artifactId)}/download`;}
function blobType(name){return /\.html?$/i.test(name)?'text/plain; charset=utf-8':name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.pdf')?'application/pdf':'application/octet-stream';}
function livePinsFor(id){return availableVersions.find(version=>version.artifactId===id)??null;}
function samePins(left,right){return ['artifactId','manifestSha256','normalizedSha256','classification','publicationPinsSha256'].every(key=>(left?.[key]??null)===(right?.[key]??null))&&Boolean(left?.defaultPinned)===Boolean(right?.defaultPinned);}
function updateSaveControl(){const button=$('save-browser');if(button)button.disabled=!data||Boolean(savedView)||!livePinsFor(data.artifactId);}
async function loadSavedLibrary(){try{for(const record of await listSavedPackages())savedPackages.set(record.artifactId,record);}catch{$('save-status').textContent='Browser-saved datasets are unavailable in this browser.';}}
function savedLibraryHtml(){
 if(!savedPackages.size)return '';
 return `<h3>Saved in this browser</h3><p class="note">Browsers may clear saved data; keep a downloaded backup. A saved copy counts as verified now only when the server lists the same version.</p><ul class="export-history-list">${[...savedPackages.values()].map(record=>{
  const live=livePinsFor(record.artifactId),conflict=Boolean(live)&&!samePins(live,record.pins),legacy=!live&&record.pins.defaultPinned;
  const status=live?(conflict?'Differs from the server listing; the server version opens and this copy stays backup-only':'Server listing matches; opens the verified server version'):legacy?'Original-example copy; opens from saved bytes with origin not re-verified; its stored legacy flag is not live proof; Analytics transfer disabled':'Origin not re-verified now; integrity checked on open; Analytics transfer disabled';
  return `<li><div><code>${escape(record.artifactId)}</code> <span class="badge">Saved in this browser</span><small>${escape(status)} · saved ${escape(localTime(record.savedAt))}</small></div>${conflict?'':`<button type="button" data-open-version="${escape(record.artifactId)}">Open dataset</button>`}<button type="button" data-saved-backup="${escape(record.artifactId)}">Download exact backup</button></li>`;
 }).join('')}</ul>`;
}
async function openSavedDataset(record){
 // A stored legacy (default-pin-era) flag only selects the legacy self-consistency rules;
 // it is never live proof, a default-pin badge or origin trust.
 const verified=await verifyVersionPackage({tarBytes:record.tarBytes,pins:record.pins});
 return {artifact:verified.artifact,urls:new Map([...verified.files].map(([name,body])=>[name,URL.createObjectURL(new Blob([body],{type:blobType(name)}))])),tarUrl:URL.createObjectURL(new Blob([verified.tarBytes],{type:'application/x-tar'}))};
}
function markGuestView(){
 resetAnalytics();$('analytics-status').textContent='Analytics transfer is unavailable for private guest datasets. Download the complete archive instead.';
 const recordClass=$('version-details').querySelector('dd');if(recordClass)recordClass.textContent='Guest dataset — private to this tab, expires; integrity verified on open';
 $('workspace-version').textContent=`${data.artifactId} · Guest dataset — private, expires`;const button=$('save-browser');if(button)button.disabled=true;
}
function markSavedView(){
 resetAnalytics();$('analytics-status').textContent='Analytics transfer is disabled: this browser-saved copy cannot be re-verified against the server now. Download the exact backup instead.';
 const recordClass=$('version-details').querySelector('dd');if(recordClass)recordClass.textContent='Saved in this browser — origin not re-verified now; integrity self-consistent only';
 $('workspace-version').textContent=`${data.artifactId} · Saved in this browser · origin not re-verified now${savedPackages.get(data.artifactId)?.pins.defaultPinned?' · stored legacy-format flag, not live proof':''}`;updateSaveControl();
}
$('save-browser').addEventListener('click',async()=>{
 const pins=data&&!savedView?livePinsFor(data.artifactId):null,button=$('save-browser');
 if(!pins){$('save-status').textContent='Only a version listed and verified by the server can be saved.';return;}
 button.disabled=true;$('save-status').textContent='Saving the complete verified version in this browser…';
 try{
  const response=await fetch(`/api/versions/${encodeURIComponent(pins.artifactId)}/download`);if(!response.ok)throw Error('Complete package unavailable');
  const outcome=await saveVerifiedPackage({tarBytes:await response.arrayBuffer(),pins});
  for(const record of await listSavedPackages())savedPackages.set(record.artifactId,record);
  $('save-status').textContent=outcome==='already_saved'?'Already saved in this browser with identical bytes.':'Saved in this browser. Browsers may clear saved data; keep a downloaded backup.';renderLibrary();
 }catch(error){$('save-status').textContent=`Not saved: ${error.message}`;}finally{updateSaveControl();}
});
$('dataset-library').addEventListener('click',event=>{
 const id=event.target?.closest?.('[data-saved-backup]')?.dataset.savedBackup,record=id&&savedPackages.get(id);if(!record)return;
 const url=URL.createObjectURL(new Blob([record.tarBytes],{type:'application/x-tar'})),link=document.createElement('a');link.href=url;link.download=`${record.artifactId}.tar`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
});
