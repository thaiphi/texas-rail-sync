import {escapeHtml as escape} from './inspection.js';
import {localTime,monthWindow} from './navigation.js';
export function createLatestRequest(){let revision=0;return {begin:()=>++revision,isCurrent:ticket=>ticket===revision,invalidate:()=>++revision};}
export function mountCollection({onRun,onVersions,onOpen,onDownload}){
 const $=id=>document.getElementById(id),latest=createLatestRequest();let lookup=null,selected=null,busy=false;
 $('collect-form').hidden=true;
 const status=message=>{$('collection-status').textContent=message;};
 const step=phase=>{for(const item of $('request-steps').querySelectorAll('[data-step]')){if(item.dataset.step===phase)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');}};
 const reset=()=>{latest.invalidate();lookup=null;selected=null;$('lookup-candidates').replaceChildren();$('collect-submit').disabled=true;$('collect-form').hidden=true;$('collection-result').hidden=true;$('collection-result').replaceChildren();step('find');};
 const post=async(path,body)=>{const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();return {response,result};};
 for(const id of ['lookup-kind','lookup-value'])$(id).addEventListener('input',()=>{reset();status('Identifier changed. Look up again before selecting a candidate.');});
 for(const id of ['start-month','end-month'])$(id).addEventListener('input',()=>{if(busy)return;$('collection-result').hidden=true;$('collection-result').replaceChildren();step(selected?'confirm':'find');status('Reporting period changed. Confirm the inclusive bounds before collecting.');});
 $('lookup-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;reset();const ticket=latest.begin(),kind=$('lookup-kind').value,value=$('lookup-value').value;
  if(!(kind==='uic'?/^\d{9}$/:/^\d{8}$/).test(value)){status(kind==='uic'?'Enter exactly nine UIC digits; preserve leading zeros.':'Enter exactly eight source API digits. Longer API formats are unsupported.');return;}
  busy=true;$('lookup-submit').disabled=true;status('Requesting bounded official inventory candidates…');
  try{
   const {response,result}=await post('/api/lookup',{kind:$('lookup-kind').value,value:$('lookup-value').value});if(!latest.isCurrent(ticket))return;
   if(!response.ok)throw Error(result.error?.message??'Lookup failed');lookup=result;
   if(result.status==='empty'){status('No inventory candidates returned for this exact identifier.');return;}
   step('confirm');
   status(result.status==='cap_reached'?'Candidate cap reached (25). Selection is blocked because completeness is unproven.':`${result.candidates.length} candidate${result.candidates.length===1?'':'s'} returned. Choose one explicitly. ${result.testFixture?'Test fixture response — not public evidence.':''}`);
   $('lookup-candidates').innerHTML=`<fieldset><legend>Choose the source inventory record</legend>${result.candidates.map(row=>`<label class="candidate-choice"><input type="radio" name="candidate" value="${escape(row.sourceRecordKey)}" ${row.selectable?'':'disabled'}><span><strong>UIC ${escape(row.uic_number)} · API ${escape(row.api_no)}</strong><small>${escape(row.lease_name)} · well ${escape(row.well_no_display)} · operator ${escape(row.operator_number)}${row.reason?' · '+escape(row.reason):''}</small></span></label>`).join('')}</fieldset><details><summary>Lookup evidence</summary><p>Lookup ${escape(result.lookupId)}</p><p>SHA-256 <code>${escape(result.sha256)}</code></p><a href="${escape(result.queryUrl)}" target="_blank" rel="noreferrer">Official exact-identifier query ↗</a></details>`;
   for(const radio of $('lookup-candidates').querySelectorAll('input'))radio.addEventListener('change',()=>{if(busy)return;selected=radio.value;$('collection-result').hidden=true;$('collection-result').replaceChildren();step('confirm');$('collect-submit').disabled=false;$('collect-form').hidden=false;const candidate=lookup.candidates.find(row=>row.sourceRecordKey===selected);status(`Confirm UIC ${candidate.uic_number}, source API ${candidate.api_no}, ${candidate.lease_name}, well ${candidate.well_no_display}. Choose the inclusive reporting period before collecting.`);});
   $('lookup-candidates').querySelectorAll('.candidate-choice').forEach((label,index)=>{
    const row=result.candidates[index],details=document.createElement('small'),value=field=>row[field]===undefined||row[field]===null||row[field]===''?'not supplied':row[field];
    details.textContent=`County basis: source API prefix ${row.api_no.slice(0,3)||'unavailable'}; county name not independently verified. Permit limits: ${value('bbl_vol_inj')} bbl/day, ${value('max_liq_inj_pressure')} psi. Interval: ${value('top_inj_zone')}–${value('bot_inj_zone')} ft. Source injection type: ${value('uic_type_injection')}; cancellation date: ${value('permit_canceled_date')}; plugged date: ${value('w3_plugged_date')}. Current operating status is not inferred.`;label.querySelector('span').append(details);
   });
   const retrieval=document.createElement('p');retrieval.textContent=`Retrieved (local): ${localTime(result.retrievedAt)}. Source rows updated (local): ${localTime(result.sourceRowsUpdatedAt==null?null:result.sourceRowsUpdatedAt*1000)}. Retrieval does not establish current operating status.`; $('lookup-candidates').querySelector('details').append(retrieval);
  }catch(error){if(latest.isCurrent(ticket))status(`Lookup failed: ${error.message}`);}finally{busy=false;$('lookup-submit').disabled=false;}
 });
 $('collect-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!lookup||!selected)return;
  try{monthWindow($('start-month').value,$('end-month').value);}catch(error){status(error.message);return;}
  const submitted={lookupId:lookup.lookupId,sourceRecordKey:selected,startMonth:$('start-month').value,endMonth:$('end-month').value},candidate=lookup.candidates.find(row=>row.sourceRecordKey===selected),radios=[...$('lookup-candidates').querySelectorAll('input')].map(radio=>[radio,radio.disabled]);for(const [radio] of radios)radio.disabled=true;
  busy=true;$('collection-result').hidden=true;step('collect');$('collect-submit').disabled=true;$('lookup-submit').disabled=true;for(const id of ['lookup-kind','lookup-value','start-month','end-month'])$(id).disabled=true;
  status(`Collecting UIC ${candidate.uic_number}, ${submitted.startMonth} through ${submitted.endMonth}. Waiting for the recorded completion; live sub-stage events are unavailable. Official source preservation may take several minutes.`);
  try{
   const {response,result}=await post('/api/collect',submitted);
   if(result.run)await onRun?.(result.run);
   if(!response.ok){const code=result.run?.events.find(event=>event.status==='failed')?.error?.code??result.error?.code;throw Error(`${code??'Failed'}: ${result.error?.message??'Collection failed'}`);}
   await onVersions();step('review');status(`Collection completed: ${result.artifactId}. ${result.scope.monthly_returned===0?'No reports returned for this period. ':''}${result.realHistoryStatus==='verified_bounded_linkage'?'Verified bounded linkage.':'Incomplete linkage; inspect quality and provenance.'}`);
   $('collection-result').hidden=false;$('collection-result').innerHTML=`<h2>Review the collected dataset</h2><p>${escape(result.artifactId)}</p><p>${result.scope.monthly_returned} retained monthly report rows. ${result.scope.monthly_returned===0?'No reports returned does not mean zero injection.':'Review the acquired records and their evidence before use.'}</p><div class="context-actions"><button type="button" id="open-collected" class="primary">Open this dataset</button><button type="button" id="download-collected">Prepare download</button></div><p class="note">Opening does not change the default pin or import data into Analytics.</p>`;
   $('open-collected').addEventListener('click',()=>onOpen?.(result.artifactId));$('download-collected').addEventListener('click',()=>{step('download');onDownload?.(result.artifactId);});
  }catch(error){step('confirm');status(`Collection unavailable: ${error.message}. Partial source evidence and any recorded failure remain inspectable in Collection history.`);}finally{busy=false;for(const [radio,disabled] of radios)radio.disabled=disabled;$('lookup-submit').disabled=false;$('collect-submit').disabled=!selected;for(const id of ['lookup-kind','lookup-value','start-month','end-month'])$(id).disabled=false;}
 });
 // Enabled only after every handler above is registered (initial HTML keeps it disabled).
 $('lookup-submit').disabled=false;
}
