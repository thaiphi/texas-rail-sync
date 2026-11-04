// E12-lite Task 6 (spec §6): pure render of the Watched documents screen — the table, its row details and the Add box.
// No I/O, no DOM, no timers. Every value from the list, the server or decoded page text goes through escapeHtml;
// saved HTML is only ever shown as escaped text lines, never rendered.
import {escapeHtml as escape} from './inspection.js';
import {KINDS,NAME_MAX,NOTE_MAX,statusLabel,sortRows,deriveStatus} from './watch-list.js';
import {lineDiff} from './html-text.js';

const PDF_TEXT='Changed: the file is different. Open both copies to compare.';
const DAMAGED='This saved copy no longer matches its recorded fingerprint';
const RESULT_TYPES=new Set(['baseline','same','change','failed','damaged']);
const OUTCOME_LIMIT=5;

const isPdf=path=>/\.pdf$/i.test(String(path??''));
const copyHref=(docId,sha)=>`/api/watch/copy/${encodeURIComponent(docId)}/${encodeURIComponent(sha)}`;
const shortHash=sha=>String(sha??'').slice(0,12);
const changes=doc=>(doc.history??[]).filter(ev=>ev.type==='change');
const kindLabel=kind=>Object.hasOwn(KINDS,kind)?KINDS[kind]:String(kind??'');

export const checkLabel=running=>running?`Checking… ${running.done} of ${running.total}`:'Check now';

// Counts are over watched documents only: changed = an unreviewed change (text or markup), failed = the last check failed.
export function watchSummary(list,lastCheck,formatDate){
 const watched=(list?.documents??[]).map(deriveStatus).filter(status=>status.watched);
 const changed=watched.filter(status=>status.change_state==='changed'||status.change_state==='changed_markup').length;
 const failed=watched.filter(status=>status.last_result?.outcome==='failed').length;
 const head=lastCheck?.ended_at?`Last check ${formatDate(lastCheck.ended_at)}`:'No Check now run yet';
 return `${head} · ${watched.length} watched · ${changed} changed, not reviewed · ${failed} failed`;
}

// The last check that saw the old copy and the first check that saw the new one.
export function changeDateLabel(ev,formatDate){
 return ev?.previous_seen_at?`Changed between ${formatDate(ev.previous_seen_at)} and ${formatDate(ev.at)}`:`Changed by ${formatDate(ev.at)}`;
}

// Each date names its source; no date is read from inside a document.
export function dateCells(doc,formatDate){
 const cells=[];
 if(doc.latest?.last_modified)cells.push(`Server: ${formatDate(doc.latest.last_modified)}`);
 const change=changes(doc).at(-1);
 if(change)cells.push(changeDateLabel(change,formatDate));
 return cells.length?cells:['—'];
}

function chipClass(doc){
 const status=deriveStatus(doc);
 if(!status.watched)return 'watch-chip muted';
 if(status.change_state==='changed'||status.change_state==='changed_markup')return 'watch-chip attention';
 if(status.last_result&&status.last_result.outcome!=='ok')return 'watch-chip failed';
 return 'watch-chip ok';
}

// formatDateTime (default formatDate) formats the summary's last check time; formatDate formats every other date.
export function checkBar({list,running,lastCheck,lastRun,formatDate,formatDateTime=formatDate}){
 const failedRun=lastRun?.outcome==='failed'?`<p class="notice danger" role="alert">The last check did not complete: ${escape(lastRun.message)}</p>`:'';
 return `<div class="watch-checkbar"><button type="button" id="watch-check" class="primary"${running?' disabled':''}>${escape(checkLabel(running))}</button><p id="watch-summary" class="watch-summary" role="status">${escape(watchSummary(list,lastCheck,formatDateTime))}</p></div>${failedRun}`;
}

const kindOptions=selected=>Object.entries(KINDS).map(([value,label])=>`<option value="${escape(value)}"${value===selected?' selected':''}>${escape(label)}</option>`).join('');

function addBox(add){
 const state=add??{},message=state.message?`<p class="notice danger" role="alert">${escape(state.message)}${state.existingId?` <a href="#watch" data-watch-open="${escape(state.existingId)}">Show the existing row</a>`:''}</p>`:'';
 return `<details class="watch-add"${state.message?' open':''}><summary>Add a document</summary><form class="watch-add-form" data-watch-add><div><label for="watch-add-url">Official RRC address (https://…rrc.texas.gov)</label><input id="watch-add-url" name="url" type="url" required autocomplete="off" value="${escape(state.url??'')}"></div><div><label for="watch-add-name">Name</label><input id="watch-add-name" name="name" type="text" required maxlength="${NAME_MAX}" value="${escape(state.name??'')}"></div><div><label for="watch-add-kind">Kind</label><select id="watch-add-kind" name="kind">${kindOptions(state.kind??'manual')}</select></div><button type="submit">Add to the list</button></form>${message}<p class="note">Adding a document does not fetch it. The first Check now saves its first copy.</p></details>`;
}

function diffBlock(entry){
 if(!entry)return '<p class="note">Loading the text comparison…</p>';
 if(entry.error)return `<p class="notice danger" role="alert">${escape(entry.error)}</p>`;
 const lines=lineDiff(entry.before??[],entry.after??[]).filter(item=>item.op!=='same');
 if(!lines.length)return '<p class="note">No visible text line differs; only the page markup changed.</p>';
 return `<ol class="watch-diff" aria-label="Text lines added and removed">${lines.map(item=>item.op==='add'?`<li class="diff-add"><span class="visually-hidden">Added: </span>${escape(item.line)}</li>`:`<li class="diff-del"><span class="visually-hidden">Removed: </span>${escape(item.line)}</li>`).join('')}</ol>`;
}

// Only diff blocks are re-rendered in place (by app.js) once both copies load.
export const renderDiff=diffBlock;

function changeItem(doc,ev,{formatDate,diffs,newestUnreviewed,running}){
 const notes=(doc.history??[]).filter(item=>item.type==='note'&&item.change_id===ev.id);
 const links=`<a href="${escape(copyHref(doc.id,ev.previous_sha256))}" target="_blank" rel="noopener">Before copy</a> · <a href="${escape(copyHref(doc.id,ev.sha256))}" target="_blank" rel="noopener">After copy</a>`;
 const body=isPdf(ev.path)?`<p>${escape(PDF_TEXT)}</p>`:`${ev.markup_only?'<p class="note">Markup only: the visible text is the same.</p>':''}<div id="watch-diff-${escape(ev.id)}" class="watch-diff-host">${diffBlock(diffs?.get(ev.id))}</div>`;
 const review=ev.review?`<p class="watch-review"><strong>Reviewed ${escape(formatDate(ev.review.at))}</strong>${ev.review.note?`: ${escape(ev.review.note)}`:''}</p>`:'<p class="watch-review"><strong>Not reviewed</strong></p>';
 const noteList=notes.length?`<ul class="watch-notes">${notes.map(note=>`<li>Note ${escape(formatDate(note.at))}: ${escape(note.note)}</li>`).join('')}</ul>`:'';
 const disabled=running?' disabled':'';
 let form='';
 if(ev.id===newestUnreviewed)form=`<form class="watch-note-form" data-watch-review="${escape(doc.id)}"><label for="watch-review-${escape(ev.id)}">Review note (optional)</label><textarea id="watch-review-${escape(ev.id)}" name="note" maxlength="${NOTE_MAX}" rows="2"></textarea><button type="submit"${disabled}>Mark reviewed</button><p class="note">Marks every unreviewed change up to this one.</p></form>`;
 else if(ev.review)form=`<form class="watch-note-form" data-watch-note="${escape(doc.id)}" data-change="${escape(ev.id)}"><label for="watch-note-${escape(ev.id)}">Add note</label><textarea id="watch-note-${escape(ev.id)}" name="note" maxlength="${NOTE_MAX}" rows="2" required></textarea><button type="submit"${disabled}>Add note</button></form>`;
 return `<li class="watch-change"><h4>${escape(changeDateLabel(ev,formatDate))}</h4><p class="watch-hashes">Old <code title="${escape(ev.previous_sha256)}">${escape(shortHash(ev.previous_sha256))}</code> → new <code title="${escape(ev.sha256)}">${escape(shortHash(ev.sha256))}</code> · ${links}</p>${body}${review}${noteList}${form}</li>`;
}

function outcomeText(ev,formatDate){
 const when=escape(formatDate(ev.at));
 if(ev.type==='baseline')return `${when} — First copy saved`;
 if(ev.type==='same')return `${when} — Unchanged`;
 if(ev.type==='change')return `${when} — Changed${ev.markup_only?' (markup only)':''}`;
 if(ev.type==='failed')return `${when} — Check failed (${escape(ev.reason)})`;
 return `${when} — Saved copy damaged`;
}

function details(doc,{formatDate,diffs,running}){
 const list=changes(doc),newestUnreviewed=list.filter(ev=>!ev.review).at(-1)?.id??null,watched=doc.watched!==false,disabled=running?' disabled':'';
 const history=list.length?`<ol class="watch-changes">${[...list].reverse().map(ev=>changeItem(doc,ev,{formatDate,diffs,newestUnreviewed,running})).join('')}</ol>`:'<p class="note">No change recorded.</p>';
 const outcomes=(doc.history??[]).filter(ev=>RESULT_TYPES.has(ev.type)).slice(-OUTCOME_LIMIT).reverse();
 const outcomeList=outcomes.length?`<ol class="watch-outcomes">${outcomes.map(ev=>`<li>${outcomeText(ev,formatDate)}</li>`).join('')}</ol>`:'<p class="note watch-outcomes">Not checked yet.</p>';
 const toggle=watched?`<button type="button" data-watch-stop="${escape(doc.id)}"${disabled}>Stop watching</button>`:`<button type="button" data-watch-rewatch="${escape(doc.id)}"${disabled}>Watch again</button>`;
 const edit=`<form class="watch-edit-form" data-watch-edit="${escape(doc.id)}"><div><label for="watch-edit-name-${escape(doc.id)}">Name</label><input id="watch-edit-name-${escape(doc.id)}" name="name" type="text" required maxlength="${NAME_MAX}" value="${escape(doc.name)}"></div><div><label for="watch-edit-kind-${escape(doc.id)}">Kind</label><select id="watch-edit-kind-${escape(doc.id)}" name="kind">${kindOptions(doc.kind)}</select></div><button type="submit"${disabled}>Save name and kind</button></form>`;
 return `<div class="watch-details-body"><p class="watch-address">Address: <a href="${escape(doc.url)}" target="_blank" rel="noopener noreferrer">${escape(doc.url)}</a><br><small>To change the address, stop watching and add the new one</small></p><h3>Change history</h3>${history}<h3>Last check outcomes</h3>${outcomeList}<h3>Manage</h3>${edit}<p class="watch-manage">${toggle}</p></div>`;
}

function row(doc,{formatDate,expanded,diffs,running}){
 const open=expanded?.has(doc.id)===true,last=deriveStatus(doc).last_result;
 const cells=dateCells(doc,formatDate).map(cell=>`<span>${escape(cell)}</span>`).join('');
 return `<tr class="watch-row${doc.watched===false?' unwatched':''}" data-doc="${escape(doc.id)}"><td data-label="Document"><a href="${escape(doc.url)}" target="_blank" rel="noopener noreferrer">${escape(doc.name)} <span aria-hidden="true">↗</span><span class="visually-hidden"> (official page, opens in a new tab)</span></a><br><button type="button" class="text-button watch-toggle" aria-expanded="${open}" aria-controls="watch-details-${escape(doc.id)}" data-watch-toggle="${escape(doc.id)}">Details<span class="visually-hidden"> for ${escape(doc.name)}</span></button></td><td data-label="Kind">${escape(kindLabel(doc.kind))}</td><td data-label="Status"><span class="${chipClass(doc)}">${escape(statusLabel(doc,{formatDate}))}</span></td><td data-label="Dates" class="watch-dates">${cells}</td><td data-label="Last checked">${escape(last?formatDate(last.at):'—')}</td></tr>`
  +`<tr class="watch-details" id="watch-details-${escape(doc.id)}"${open?'':' hidden'}><td colspan="5">${details(doc,{formatDate,diffs,running})}</td></tr>`;
}

export function renderWatchView({list,running=null,lastCheck=null,lastRun=null,formatDate,formatDateTime=formatDate,expanded=new Set(),diffs=null,add=null}){
 const rows=sortRows(list?.documents??[]).map(doc=>row(doc,{formatDate,expanded,diffs,running})).join('');
 const table=rows?`<div class="watch-table-wrap"><table class="watch-table"><caption class="visually-hidden">Watched official RRC documents, rows needing attention first</caption><thead><tr><th scope="col">Document</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Dates</th><th scope="col">Last checked</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="notice">No documents are on the watch list yet.</p>';
 return `<div id="watch-checkbar-host">${checkBar({list,running,lastCheck,lastRun,formatDate,formatDateTime})}</div>${addBox(add)}<p id="watch-action-status" class="watch-action-status" role="status" aria-live="polite"></p>${table}`;
}

export const renderWatchError=message=>`<p class="notice danger" role="alert">${escape(message)}</p>`;
export {DAMAGED as DAMAGED_MESSAGE};
