// E12-lite page links (spec §7): pure. Page numbers come only from citations someone wrote down; nothing is read out of a PDF.
// A citation is tied by SHA-256 to the version's own preserved copy and is never re-pointed to another copy.
import {escapeHtml as escape} from './inspection.js';
import {normalizeWatchAddress} from './watch-list.js';

export const UNAVAILABLE='The cited document is not preserved in this version';
export const fallbackLabel=page=>`opens at page 1; cited page ${page}`;
export const newerNote=(from,to)=>`A newer version exists (changed between ${from} and ${to}). Page numbers may differ.`;

const sameAddress=url=>{try{return normalizeWatchAddress(url);}catch{return null;}};

// The watch list (local only) knows a copy of the cited document with a different hash than the cited one.
function newerCopy({watchList,url,source,formatDate}){
 const address=sameAddress(url);
 if(!address||!Array.isArray(watchList?.documents))return null;
 const doc=watchList.documents.find(item=>sameAddress(item?.url)===address);
 if(!doc?.latest?.sha256||doc.latest.sha256===source.sha256)return null;
 const changes=(doc.history??[]).filter(event=>event?.type==='change');
 const change=changes.find(event=>event.previous_sha256===source.sha256)??changes.at(-1);
 return change?newerNote(formatDate(change.previous_seen_at),formatDate(change.at)):newerNote(formatDate(source.retrieved_at),formatDate(doc.latest.retrieved_at));
}

export function citationLinks({dictionary,sources,hrefFor,pageJump,watchList=null,formatDate=value=>value}={}){
 const citation=dictionary?.units_source;
 if(!citation||!Array.isArray(citation.pdf_pages)||!citation.pdf_pages.length)return [];
 const source=(sources??[]).find(item=>item?.url===citation.url)??null;
 const inline=source?hrefFor(source.raw_file)||null:null;
 const newer=inline?newerCopy({watchList,url:citation.url,source,formatDate}):null;
 return citation.pdf_pages.map(page=>({
  label:`Page ${page}`,page,official:citation.url??null,rawFile:inline?source.raw_file:null,
  href:inline?(pageJump?`${inline}#page=${page}`:inline):null,
  fallbackLabel:inline&&!pageJump?fallbackLabel(page):null,
  newer,unavailable:inline?null:UNAVAILABLE,
 }));
}

// One "Cited pages" line: a link per page to the preserved copy and a separate link to the official page.
function citedLine(citations,sourceLink){
 const pages=citations.map(link=>`<a href="${escape(link.href)}" target="_blank" rel="noopener">${escape(link.label)}${link.fallbackLabel?` <small>(${escape(link.fallbackLabel)})</small>`:''}</a>`).join(', ');
 const newer=citations[0].newer?`<p class="note cited-newer">${escape(citations[0].newer)}</p>`:'';
 return `<p class="cited-pages">Cited pages: ${pages} · ${sourceLink({url:citations[0].official},'Official page')}</p>${newer}`;
}

// The Sources ledger. Without citations it is byte-for-byte the pre-Task-7 template; downloads keep their download attribute.
export function renderSourceCards({sources,citations=[],fileHref,sourceLink,formatTime,formatBytes}){
 const cited=citations.filter(link=>link.href&&link.rawFile);
 const cards=sources.map(source=>{
  const own=cited.filter(link=>link.rawFile===source.raw_file);
  return `<article class="panel padded source-card"><h3>${escape(source.title??source.name)}</h3><p class="note">${escape(source.kind)}</p><p>${sourceLink(source,'Open official source')}</p><p>Retrieved ${escape(formatTime(source.retrieved_at))}</p><a class="button-link" href="${escape(fileHref(source.raw_file))}" download="${escape(source.raw_file.split('/').at(-1))}">View preserved response</a>${own.length?citedLine(own,sourceLink):''}<details><summary>Snapshot identity and checksum</summary><p>${formatBytes(source.bytes)} bytes</p><p>Snapshot ${escape(source.snapshot_id)}</p><p>SHA-256 <code>${escape(source.sha256)}</code></p></details></article>`;
 }).join('');
 const missing=citations.filter(link=>link.unavailable);
 if(!missing.length)return cards;
 return cards+`<article class="panel padded source-card cited-unavailable"><h3>Cited pages</h3><p>Pages ${escape(missing.map(link=>link.page).join(', '))}: ${escape(missing[0].unavailable)}.</p><p>${sourceLink({url:missing[0].official},'Official page')}</p></article>`;
}
