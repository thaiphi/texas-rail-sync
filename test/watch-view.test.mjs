// E12-lite Task 6: the Watched documents screen (pure render) rendered from the committed seeded list and small fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {htmlToText} from '../public/html-text.js';
import {applyOutcome,markReviewed,addNote,deriveStatus} from '../public/watch-list.js';
const view=await import('../public/watch-view.js').catch(()=>({}));

const root=new URL('../',import.meta.url);
const seeded=async()=>JSON.parse(await readFile(new URL('watched-documents/watch-list.json',root),'utf8'));
const formatDate=value=>new Date(value).toISOString().slice(5,10);
const render=options=>view.renderWatchView({running:null,lastCheck:null,lastRun:null,formatDate,expanded:new Set(),diffs:null,...options});
const resourcesId='80b511129d5a',changeId='80b511129d5a-c1';
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const rowNames=html=>[...html.matchAll(/<tr class="watch-row[^"]*" data-doc="([0-9a-f]{12})"/g)].map(match=>match[1]);
const at=(n,day)=>`2026-11-${String(day).padStart(2,'0')}T1${n}:00:00.000Z`;
function fixtureDoc({id='aaaaaaaaaaaa',name='Fixture',kind='form',path='watched-documents/copies/'+'a'.repeat(64)+'.pdf',url='https://www.rrc.texas.gov/fixture.pdf'}={}){
 const latest={sha256:'a'.repeat(64),bytes:3,path,retrieved_at:at(0,1),last_modified:null,etag:null,source:{type:'check',check_id:'c0'}};
 return {id,url,name,kind,watched:true,added_at:at(0,1),added_via:'owner',latest,history:[{type:'baseline',at:at(0,1),sha256:'a'.repeat(64),path,source:{type:'check',check_id:'c0'}}],status:null};
}
const changed=(doc,ext='pdf')=>applyOutcome(doc,{type:'change',at:at(1,3),previous_seen_at:at(1,2),sha256:'b'.repeat(64),path:`watched-documents/copies/${'b'.repeat(64)}.${ext}`,markup_only:false,source:{type:'check',check_id:'c2'},latest:{sha256:'b'.repeat(64),bytes:4,path:`watched-documents/copies/${'b'.repeat(64)}.${ext}`,retrieved_at:at(1,3),last_modified:null,etag:null,source:{type:'check',check_id:'c2'}}});

test('seeded list renders Injection-Storage Resources first as ⚠ Changed, not reviewed with its date range',async()=>{
 assert.equal(typeof view.renderWatchView,'function');
 const list=await seeded(),html=render({list});
 const rows=rowNames(html);assert.equal(rows.length,8);assert.equal(rows[0],resourcesId);
 const first=html.slice(html.indexOf(`data-doc="${resourcesId}"`),html.indexOf('</tr>',html.indexOf(`data-doc="${resourcesId}"`)));
 assert.match(first,/Injection-Storage Resources/);assert.match(first,/⚠ Changed, not reviewed/);assert.match(first,/Announcements/);
 assert.match(first,/Changed between 10-10 and 10-29/);
 const doc=list.documents.find(item=>item.id===resourcesId);
 assert.equal(view.changeDateLabel(doc.history.find(ev=>ev.type==='change'),formatDate),'Changed between 10-10 and 10-29');
 // Dates are labelled with their source: the server Last-Modified, the change range, or a dash.
 const manual=list.documents.find(item=>item.id==='c0ad60b6acc9');
 assert.deepEqual(view.dateCells(manual,formatDate),['Server: 06-02']);
 assert.deepEqual(view.dateCells(doc,formatDate),['Changed between 10-10 and 10-29']);
 assert.deepEqual(view.dateCells(list.documents.find(item=>item.id==='db7a3929588b'),formatDate),['—']);
 // The official page is linked and the row can be expanded with a real button.
 assert.match(first,/href="https:\/\/www\.rrc\.texas\.gov\/oil-and-gas\/applications-and-permits\/injection-storage-permits\/resources\/"/);
 assert.match(first,/<button[^>]*aria-expanded="false"[^>]*aria-controls="watch-details-80b511129d5a"/);
});

test('summary line counts watched, changed-not-reviewed and failed',async()=>{
 assert.equal(typeof view.watchSummary,'function');
 const list=await seeded();
 assert.match(view.watchSummary(list,null,formatDate),/· 8 watched · 1 changed, not reviewed · 0 failed$/);
 assert.equal(view.watchSummary(list,{check_id:'x',ended_at:'2026-11-03T14:02:00.000Z'},formatDate),'Last check 11-03 · 8 watched · 1 changed, not reviewed · 0 failed');
 // Unwatched documents are not counted; a failed last check is.
 const failed=applyOutcome(fixtureDoc(),{type:'failed',at:at(2,4),reason:'HTTP 404',http_status:404,source:{type:'check',check_id:'c3'}});
 const stopped={...fixtureDoc({id:'bbbbbbbbbbbb',url:'https://www.rrc.texas.gov/b.pdf'}),watched:false};
 assert.equal(view.watchSummary({schema:'rrc-watch-list-v1',documents:[failed,stopped]},null,formatDate).split(' · ').slice(1).join(' · '),'1 watched · 0 changed, not reviewed · 1 failed');
 assert.match(render({list}),new RegExp(`id="watch-summary"[^>]*>${view.watchSummary(list,null,formatDate)}<`));
});

test('html diff marks the §3.15/3.58 lines as added',async()=>{
 const list=await seeded(),doc=list.documents.find(item=>item.id===resourcesId),change=doc.history.find(ev=>ev.type==='change');
 const before=htmlToText(await readFile(new URL(change.previous_path,root),'utf8')),after=htmlToText(await readFile(new URL(change.path,root),'utf8'));
 const html=render({list,expanded:new Set([resourcesId]),diffs:new Map([[changeId,{before,after}]])});
 const added=[...html.matchAll(/<li class="diff-add">([\s\S]*?)<\/li>/g)].map(match=>match[1]);
 assert.ok(added.some(line=>line.includes('Proposed Rule Amendments: §§ 3.15 and 3.58')));
 assert.ok(added.some(line=>line.includes('The proposed amendments to rules §§ 3.15 and 3.58')));
 assert.ok([...html.matchAll(/<li class="diff-del">([\s\S]*?)<\/li>/g)].some(match=>match[1].includes('October 9, 2026')));
 assert.doesNotMatch(html,/Changed: the file is different/);
 // Copy links address the before and after hashes; the diff container is addressable for in-place loading.
 assert.match(html,new RegExp(`href="/api/watch/copy/${resourcesId}/${change.previous_sha256}"`));assert.match(html,new RegExp(`href="/api/watch/copy/${resourcesId}/${change.sha256}"`));
 assert.match(html,new RegExp(`id="watch-diff-${changeId}"`));
 // Not yet loaded, and a damaged copy, both say so instead of a diff.
 assert.match(render({list,expanded:new Set([resourcesId])}),/Loading the text comparison/);
 assert.match(render({list,expanded:new Set([resourcesId]),diffs:new Map([[changeId,{error:'This saved copy no longer matches its recorded fingerprint'}]])}),/This saved copy no longer matches its recorded fingerprint/);
});

test('pdf change shows the fixed text and both copy links, no diff',()=>{
 const doc=changed(fixtureDoc()),html=render({list:{schema:'rrc-watch-list-v1',documents:[doc]},expanded:new Set([doc.id]),diffs:new Map()});
 assert.match(html,/Changed: the file is different\. Open both copies to compare\./);
 assert.match(html,new RegExp(`href="/api/watch/copy/${doc.id}/${'a'.repeat(64)}"`));assert.match(html,new RegExp(`href="/api/watch/copy/${doc.id}/${'b'.repeat(64)}"`));
 assert.doesNotMatch(html,/diff-add|diff-del|Loading the text comparison/);
});

test('failed check on an unreviewed change shows both',()=>{
 const doc=applyOutcome(changed(fixtureDoc()),{type:'failed',at:at(3,5),reason:'HTTP 404',http_status:404,source:{type:'check',check_id:'c4'}});
 const html=render({list:{schema:'rrc-watch-list-v1',documents:[doc]},expanded:new Set([doc.id])});
 assert.match(html,/⚠ Changed, not reviewed · last check failed \(HTTP 404\)/);
 // Details list the last check outcomes newest first, including the failure reason.
 const outcomes=html.slice(html.indexOf('watch-outcomes'));
 assert.ok(outcomes.indexOf('HTTP 404')<outcomes.indexOf('Changed'));
});

test('details list changes newest first, with review, notes and the right review controls',()=>{
 const base=changed(fixtureDoc());
 const second=applyOutcome(base,{type:'change',at:at(4,8),previous_seen_at:at(4,7),sha256:'c'.repeat(64),path:`watched-documents/copies/${'c'.repeat(64)}.pdf`,markup_only:false,source:{type:'check',check_id:'c5'},latest:{sha256:'c'.repeat(64),bytes:5,path:`watched-documents/copies/${'c'.repeat(64)}.pdf`,retrieved_at:at(4,8),last_modified:null,etag:null,source:{type:'check',check_id:'c5'}}});
 let html=render({list:{schema:'rrc-watch-list-v1',documents:[second]},expanded:new Set([second.id])});
 assert.ok(html.indexOf('Changed between 11-07 and 11-08')<html.indexOf('Changed between 11-02 and 11-03'));
 // Mark reviewed sits once, on the newest unreviewed change, with a capped optional note.
 assert.equal((html.match(/data-watch-review=/g)??[]).length,1);assert.match(html,/<textarea[^>]*maxlength="2000"/);
 const reviewed=addNote(markReviewed(second,{note:'Read the new pages',now:at(5,9)}),{changeId:`${second.id}-c1`,note:'Follow-up',now:at(5,10)});
 html=render({list:{schema:'rrc-watch-list-v1',documents:[reviewed]},expanded:new Set([reviewed.id])});
 assert.equal(deriveStatus(reviewed).change_state,'reviewed');assert.match(html,/Reviewed 11-09/);
 assert.doesNotMatch(html,/data-watch-review=/);assert.equal((html.match(/data-watch-note=/g)??[]).length,2);
 assert.match(html,/Read the new pages/);assert.match(html,/Follow-up/);
 // Stop watching, edit and the read-only address.
 assert.match(html,/data-watch-stop="aaaaaaaaaaaa"/);assert.match(html,/To change the address, stop watching and add the new one/);
 assert.match(html,/<input[^>]*name="name"[^>]*maxlength="120"/);assert.match(html,/<option value="form" selected>Form<\/option>/);
});

test('unwatched rows render last with No longer watched',async()=>{
 const list=await seeded();list.documents[0]={...list.documents[0],watched:false};
 const html=render({list:{...list},expanded:new Set([list.documents[0].id])}),rows=rowNames(html);
 assert.equal(rows.at(-1),list.documents[0].id);
 const last=html.slice(html.indexOf(`data-doc="${rows.at(-1)}"`));assert.match(last,/No longer watched/);
 assert.match(last,/data-watch-rewatch="c0ad60b6acc9"/);assert.doesNotMatch(last.slice(0,last.indexOf('</tbody>')),/data-watch-stop=/);
});

test('markup in names, notes and reasons is escaped',()=>{
 const evil='<script>alert("x")</script>';
 let doc=fixtureDoc({name:evil});doc=changed(doc,'html');
 doc=markReviewed(doc,{note:evil,now:at(5,9)});doc=addNote(doc,{changeId:`${doc.id}-c1`,note:evil,now:at(5,10)});
 doc=applyOutcome(doc,{type:'failed',at:at(6,11),reason:evil,http_status:null,source:{type:'check',check_id:'c9'}});
 const diffs=new Map([[`${doc.id}-c1`,{before:[evil],after:['<b>"quoted"</b>']}]]);
 const html=render({list:{schema:'rrc-watch-list-v1',documents:[doc]},expanded:new Set([doc.id]),diffs,lastRun:{checkId:'r',outcome:'failed',code:'REQUEST_FAILED',message:evil},add:{url:evil,name:evil,kind:'form',message:evil,existingId:null}});
 assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/<b>/);assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
 assert.doesNotMatch(render({list:{schema:'rrc-watch-list-v1',documents:[doc]},lastCheck:{check_id:'x',ended_at:at(0,1)},formatDate:()=>evil,expanded:new Set([doc.id])}),/<script>/);
});

test('Check now shows progress and is disabled while running',async()=>{
 const list=await seeded();
 const idle=render({list});assert.match(idle,/<button[^>]*id="watch-check"(?![^>]*disabled)[^>]*>Check now<\/button>/);
 const busy=render({list,running:{checkId:'r1',done:3,total:8}});
 assert.match(busy,/<button[^>]*id="watch-check"[^>]*disabled[^>]*>Checking… 3 of 8<\/button>/);
 assert.equal(view.checkLabel({checkId:'r1',done:3,total:8}),'Checking… 3 of 8');assert.equal(view.checkLabel(null),'Check now');
 // A failed run is never shown as a finished check.
 assert.match(render({list,lastRun:{checkId:'r0',outcome:'failed',code:'REQUEST_FAILED',message:'The check did not complete.'}}),/role="alert"[^>]*>The last check did not complete: The check did not complete\.</);
 assert.doesNotMatch(idle,/The last check did not complete/);
});

test('the Add box is collapsed, keeps typed values and links a duplicate to the existing row',async()=>{
 const list=await seeded(),idle=render({list});
 assert.match(idle,/<details class="watch-add"><summary>Add a document<\/summary>/);
 const refused=render({list,add:{url:'https://www.rrc.texas.gov/x',name:'X',kind:'guidance',message:'This address is already on the list as "Form W-2".',existingId:'68a9f0857cbe'}});
 assert.match(refused,/<details class="watch-add" open>/);assert.match(refused,/value="https:\/\/www\.rrc\.texas\.gov\/x"/);assert.match(refused,/<option value="guidance" selected>/);
 assert.match(refused,/role="alert"[^>]*>This address is already on the list as &quot;Form W-2&quot;\./);
 assert.match(refused,/<a href="#watch" data-watch-open="68a9f0857cbe">/);
});

test('a list that cannot be read shows the server message and no table',()=>{
 assert.equal(typeof view.renderWatchError,'function');
 const html=view.renderWatchError("The watch list file can't be read: unknown schema \"x\".");
 assert.match(html,/role="alert"/);assert.match(html,/The watch list file can&#39;t be read/);assert.doesNotMatch(html,/<table/);
});

test('the screen is wired: nav link, view section and guest-mode hiding',async()=>{
 const index=await readFile(new URL('public/index.html',root),'utf8'),app=await readFile(new URL('public/app.js',root),'utf8');
 assert.match(index,/<a href="#history" data-route="history">[^]*?<\/a><a href="#watch" data-route="watch"><span aria-hidden="true">◎<\/span> Watched documents<\/a>/);
 assert.match(index,/<section id="watch-view" class="view" aria-labelledby="watch-title" hidden>/);
 assert.match(app,/if\(guestMode\)[^\n]*data-route="watch"/);
});
