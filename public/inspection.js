export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatNumber=(n,d=0)=>n===null?'Not reported':Number(n).toLocaleString('en-US',{maximumFractionDigits:d});
export function chart(rows){
 const w=900,h=225,left=62,right=15,top=20,bottom=35,observedMax=Math.max(1,...rows.map(r=>r.injected_liquid_bbl??0)),scale=10**Math.floor(Math.log10(observedMax)),max=Math.ceil(observedMax/scale)*scale,dx=(w-left-right)/rows.length;
 const marks=rows.map((row,i)=>{
  const x=left+i*dx+3,month=escapeHtml(row.period_start.slice(0,7)),value=row.injected_liquid_bbl;
  if(value===null)return `<text x="${x}" y="${top+12}" fill="#53677c" font-size="10"><title>${month}: liquid volume not reported</title>n/a</text>`;
  const title=`${month}: ${formatNumber(value)} reported bbl`;
  if(value===0)return `<line x1="${x}" x2="${x+Math.max(2,dx-6)}" y1="${h-bottom}" y2="${h-bottom}" stroke="#267fb8" stroke-width="2"><title>${title}</title></line>`;
  const height=value/max*(h-top-bottom);return `<rect x="${x}" y="${h-bottom-height}" width="${Math.max(2,dx-6)}" height="${height}" fill="#267fb8"><title>${title}</title></rect>`;
 }).join('');
 const labels=rows.map((row,i)=>i%6===0?`<text x="${left+i*dx}" y="${h-10}" fill="#53677c" font-size="12">${escapeHtml(row.period_start.slice(0,7))}</text>`:'').join('');
 const grid=Array.from({length:5},(_,index)=>{const value=max*index/4,y=h-bottom-index/4*(h-top-bottom);return `<line x1="${left}" x2="${w-right}" y1="${y}" y2="${y}" stroke="#e2eaf1"/><text x="${left-8}" y="${y+4}" text-anchor="end" fill="#53677c" font-size="12">${formatNumber(value)}</text>`;}).join('');
 return `<div class="chart"><strong>Reported monthly liquid volume <small>(bbl)</small></strong><svg role="img" aria-label="Monthly liquid injection volume in barrels; values are available in the table below" viewBox="0 0 ${w} ${h}">${grid}${marks}${labels}</svg><p class="note">Reported monthly barrels. Missing volume has no bar; reported zero is marked at the baseline. No daily measurements are created.</p></div>`;
}
