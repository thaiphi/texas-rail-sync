// E12-lite Task 7: page links in the Sources tab (spec §7), from the pinned version's own dictionary and manifest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {escapeHtml as escape,formatNumber as fmt} from '../public/inspection.js';
import {sourceUrl} from '../public/presentation.js';
const links=await import('../public/page-links.js').catch(()=>({}));

const root=new URL('../',import.meta.url);
const pinned='rrc-2026-10-09-uic000020838-v1';
const readJson=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const manifest=await readJson(`artifacts/${pinned}/manifest.json`);
const dictionary=await readJson(`artifacts/${pinned}/data_dictionary.json`);
const manual=manifest.sources.find(source=>source.raw_file==='sources/uic-manual.pdf');
const base=`/artifacts/${pinned}/`;
const localHref=raw=>`${base}${raw}`;
const formatDate=value=>String(value).slice(0,10);
const cite=options=>links.citationLinks({dictionary,sources:manifest.sources,hrefFor:localHref,pageJump:true,watchList:null,formatDate,...options});
const NEWER=/^A newer version exists \(changed between (\S+) and (\S+)\)\. Page numbers may differ\.$/;

// The Sources card template exactly as app.js built it before Task 7.
const fileHref=name=>`${base}${name}?download=1`;
const localTime=value=>`T(${value})`;
const sourceLink=(source,label)=>sourceUrl(source?.url)?`<a href="${escape(sourceUrl(source.url))}" target="_blank" rel="noreferrer">${escape(label)} ↗</a>`:'Source URL unavailable';
const renderHelpers={fileHref,sourceLink,formatTime:localTime,formatBytes:fmt};
const before=source=>`<article class="panel padded source-card"><h3>${escape(source.title??source.name)}</h3><p class="note">${escape(source.kind)}</p><p>${sourceLink(source,'Open official source')}</p><p>Retrieved ${escape(localTime(source.retrieved_at))}</p><a class="button-link" href="${escape(fileHref(source.raw_file))}" download="${escape(source.raw_file.split('/').at(-1))}">View preserved response</a><details><summary>Snapshot identity and checksum</summary><p>${fmt(source.bytes)} bytes</p><p>Snapshot ${escape(source.snapshot_id)}</p><p>SHA-256 <code>${escape(source.sha256)}</code></p></details></article>`;

// The watch list as the server returns it, with the manual's latest copy replaced by a newer hash.
const watchListWith=history=>({schema:'rrc-watch-list-v1',documents:[{id:'c0ad60b6acc9',url:manual.url,name:'UIC manual (UIA010)',kind:'manual',watched:true,added_at:'2026-10-10T05:37:34.611Z',added_via:'seed',
 latest:{sha256:'f'.repeat(64),bytes:1,path:'watched-documents/copies/'+'f'.repeat(64)+'.pdf',retrieved_at:'2026-11-02T10:00:00.000Z',last_modified:null,etag:null,source:{type:'check',check_id:'c1'}},history}]});

test('pinned version: three links to the preserved uic-manual.pdf at pages 18, 41, 42', ()=>{
 assert.deepEqual(dictionary.units_source.pdf_pages,[18,41,42]);
 const result=cite();
 assert.deepEqual(result.map(link=>link.page),[18,41,42]);
 assert.deepEqual(result.map(link=>link.href),[18,41,42].map(page=>`${base}sources/uic-manual.pdf#page=${page}`));
 for(const link of result){
  assert.ok(!link.href.includes('download=1'));
  assert.equal(link.label,`Page ${link.page}`);
  assert.equal(link.fallbackLabel,null);assert.equal(link.newer,null);assert.equal(link.unavailable,null);
  assert.equal(link.rawFile,'sources/uic-manual.pdf');assert.equal(link.official,manual.url);
 }
 // A version without a recorded page citation gets no links.
 assert.deepEqual(cite({dictionary:{...dictionary,units_source:undefined}}),[]);
 assert.deepEqual(cite({dictionary:null}),[]);
});

test('blob href (saved/guest) keeps #page', ()=>{
 const result=cite({hrefFor:raw=>raw==='sources/uic-manual.pdf'?'blob:x':null});
 assert.deepEqual(result.map(link=>link.href),['blob:x#page=18','blob:x#page=41','blob:x#page=42']);
});

test('pageJump false → no fragment and the fixed fallback label', ()=>{
 const result=cite({pageJump:false});
 for(const link of result){
  assert.equal(link.href,`${base}sources/uic-manual.pdf`);
  assert.equal(link.fallbackLabel,`opens at page 1; cited page ${link.page}`);
 }
 assert.deepEqual(cite({pageJump:false,hrefFor:()=>'blob:y'}).map(link=>link.href),['blob:y','blob:y','blob:y']);
});

test('newer copy in the watch list shows the fixed note; same hash shows none; no watch list shows none', async ()=>{
 const change=(id,previous,at,seen)=>({type:'change',id,at,previous_sha256:previous,previous_path:'collected-sources/r/uic-manual.pdf',previous_seen_at:seen,sha256:'e'.repeat(64),path:'watched-documents/copies/x.pdf',markup_only:false,source:{type:'check',check_id:id},review:null});
 const baseline={type:'baseline',at:'2026-10-10T05:37:34.611Z',sha256:manual.sha256,path:'collected-sources/r/uic-manual.pdf',source:{type:'collection',run_id:'r'}};
 // The change whose previous hash is the cited hash supplies the dates, even when a later change exists.
 const matched=cite({watchList:watchListWith([baseline,change('c0ad60b6acc9-c1',manual.sha256,'2026-10-20T00:00:00Z','2026-10-12T00:00:00Z'),change('c0ad60b6acc9-c2','e'.repeat(64),'2026-11-02T00:00:00Z','2026-10-25T00:00:00Z')])});
 for(const link of matched)assert.equal(link.newer,'A newer version exists (changed between 2026-10-12 and 2026-10-20). Page numbers may differ.');
 assert.match(matched[0].newer,NEWER);
 // The link still opens the cited copy: a citation is never re-pointed.
 assert.deepEqual(matched.map(link=>link.href),[18,41,42].map(page=>`${base}sources/uic-manual.pdf#page=${page}`));
 // No change starts from the cited hash: the latest change supplies the dates.
 const latest=cite({watchList:watchListWith([change('c0ad60b6acc9-c1','a'.repeat(64),'2026-10-20T00:00:00Z','2026-10-12T00:00:00Z'),change('c0ad60b6acc9-c2','e'.repeat(64),'2026-11-02T00:00:00Z','2026-10-25T00:00:00Z')])});
 assert.equal(latest[0].newer,'A newer version exists (changed between 2026-10-25 and 2026-11-02). Page numbers may differ.');
 // A newer hash with no recorded change: between the cited copy's retrieval and the newer copy's retrieval.
 const unrecorded=cite({watchList:watchListWith([baseline])});
 assert.equal(unrecorded[0].newer,`A newer version exists (changed between ${formatDate(manual.retrieved_at)} and 2026-11-02). Page numbers may differ.`);
 // Same hash (the committed seeded list today): no note.
 const seeded=await readJson('watched-documents/watch-list.json');
 assert.equal(seeded.documents.find(doc=>doc.id==='c0ad60b6acc9').latest.sha256,manual.sha256);
 for(const link of cite({watchList:seeded}))assert.equal(link.newer,null);
 // No watch list (guest, hosted or the request failed): no note.
 for(const link of cite({watchList:null}))assert.equal(link.newer,null);
 // The URL match uses the address rule: a fragment or upper-case host still matches; another document does not.
 const variant=watchListWith([baseline]);variant.documents[0].url=manual.url.replace('www.rrc.texas.gov','WWW.RRC.TEXAS.GOV')+'#page=3';
 assert.match(cite({watchList:variant})[0].newer,NEWER);
 const other=watchListWith([baseline]);other.documents[0].url='https://www.rrc.texas.gov/media/other.pdf';
 assert.equal(cite({watchList:other})[0].newer,null);
 // A document never fetched (latest null) says nothing.
 const unchecked=watchListWith([]);unchecked.documents[0].latest=null;
 assert.equal(cite({watchList:unchecked})[0].newer,null);
});

test('citation url missing from sources → unavailable, no link', ()=>{
 const sources=manifest.sources.filter(source=>source!==manual);
 const result=cite({sources});
 assert.deepEqual(result.map(link=>link.page),[18,41,42]);
 for(const link of result){
  assert.equal(link.href,null);assert.equal(link.rawFile,null);
  assert.equal(link.unavailable,'The cited document is not preserved in this version');
 }
 // A saved package without the file's bytes is treated the same way.
 for(const link of cite({hrefFor:()=>null}))assert.equal(link.unavailable,'The cited document is not preserved in this version');
 const html=links.renderSourceCards({sources,citations:result,...renderHelpers});
 assert.match(html,/The cited document is not preserved in this version/);
 assert.ok(!/#page=/.test(html));
 assert.ok(html.includes(`href="${escape(manual.url)}"`),'the official page stays reachable');
});

test('Sources downloads and ledger HTML are unchanged apart from the added Cited pages line', ()=>{
 const cards=html=>html.match(/<article class="panel padded source-card">[\s\S]*?<\/article>/g);
 // No citation: byte-for-byte the old ledger.
 assert.equal(links.renderSourceCards({sources:manifest.sources,citations:[],...renderHelpers}),manifest.sources.map(before).join(''));
 // With the citation: only the manual's card gains one line, inserted after the unchanged download link.
 const citations=cite();
 const after=cards(links.renderSourceCards({sources:manifest.sources,citations,...renderHelpers}));
 assert.equal(after.length,manifest.sources.length);
 manifest.sources.forEach((source,index)=>{
  if(source!==manual)return assert.equal(after[index],before(source));
  const old=before(source),cut=old.indexOf('<details>');
  const added=after[index].slice(cut,after[index].length-(old.length-cut));
  assert.equal(after[index],old.slice(0,cut)+added+old.slice(cut));
  assert.match(added,/^<p class="cited-pages">Cited pages: /);
  assert.ok(!added.includes(' download'),'page links never download');
  for(const page of [18,41,42])assert.ok(added.includes(`href="${base}sources/uic-manual.pdf#page=${page}" target="_blank" rel="noopener">Page ${page}</a>`));
  assert.ok(added.includes(`<a href="${escape(manual.url)}" target="_blank" rel="noreferrer">Official page ↗</a>`));
 });
 // The preserved-response link keeps its download behaviour exactly.
 const manualCard=after[manifest.sources.indexOf(manual)];
 assert.ok(manualCard.includes(`<a class="button-link" href="${base}sources/uic-manual.pdf?download=1" download="uic-manual.pdf">View preserved response</a>`));
 // Fallback and newer note render as text, escaped.
 const fallback=links.renderSourceCards({sources:manifest.sources,citations:cite({pageJump:false,watchList:watchListWith([])}),...renderHelpers});
 assert.match(fallback,/>Page 41 <small>\(opens at page 1; cited page 41\)<\/small><\/a>/);
 assert.equal((fallback.match(/A newer version exists/g)??[]).length,1,'the newer note appears once per card');
});
