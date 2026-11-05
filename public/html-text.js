// E12-lite (§5): plain text of a saved web page and a line diff between two such texts.
// Pure: no I/O, no network, no timers, no storage, no DOM, no parser library. Shared by browser and Node.
// The text is a derived view for comparison only; the saved bytes stay the evidence and are never rendered.

// <script>/<style> bodies and comments in one left-to-right pass, so neither hides inside the other; unclosed runs to the end.
const HIDDEN=/<!--[\s\S]*?(?:-->|$)|<(script|style)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
const BLOCK=/<\/?(?:p|div|br|li|tr|h[1-6]|section|article|header|footer|table|ul|ol|td|th)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
// Only real tags (a letter after < or </), declarations and processing instructions; a bare "1 < 2" stays text.
const TAG=/<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>|<[!?][^>]*>/g;
const NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const codePoint=(text,n)=>Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):text;
// One pass, so "&amp;lt;" becomes "&lt;" and is not decoded twice; unknown entities stay as written.
const decode=text=>text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,(all,dec,hex,name)=>
 dec!==undefined?codePoint(all,Number(dec)):hex!==undefined?codePoint(all,parseInt(hex,16)):Object.hasOwn(NAMED,name)?NAMED[name]:all);

// Source line breaks are ordinary whitespace (a re-wrapped page is markup-only); only block tags start lines.
export function htmlToText(html){
 // Entities are decoded per line, so a decoded &#10; is whitespace inside its line and never starts a line.
 const text=String(html??'').replace(HIDDEN,'').replace(/\s+/g,' ').replace(BLOCK,'\n').replace(TAG,'');
 return text.split('\n').map(line=>decode(line).replace(/\s+/g,' ').trim()).filter(Boolean);
}

export const LINE_DIFF_LIMIT=5000;

// Longest-common-subsequence line diff. Common head and tail are matched first; the middle uses an
// O(n·m) table. Beyond LINE_DIFF_LIMIT lines on either side it gives every old line as deleted, then every new line as added.
export function lineDiff(before,after){
 const a=[...before],b=[...after];
 if(a.length>LINE_DIFF_LIMIT||b.length>LINE_DIFF_LIMIT)return [...a.map(line=>({op:'del',line})),...b.map(line=>({op:'add',line}))];
 let head=0;while(head<a.length&&head<b.length&&a[head]===b[head])head++;
 let tail=0;while(tail<a.length-head&&tail<b.length-head&&a[a.length-1-tail]===b[b.length-1-tail])tail++;
 const x=a.slice(head,a.length-tail),y=b.slice(head,b.length-tail),n=x.length,m=y.length,w=m+1;
 // lcs[i*w+j] = LCS length of x[i..] and y[j..]; lengths never exceed 5000, so 16 bits suffice.
 const lcs=new Uint16Array((n+1)*w);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)lcs[i*w+j]=x[i]===y[j]?lcs[(i+1)*w+j+1]+1:Math.max(lcs[(i+1)*w+j],lcs[i*w+j+1]);
 const out=a.slice(0,head).map(line=>({op:'same',line}));
 let i=0,j=0;
 while(i<n&&j<m){
  if(x[i]===y[j]){out.push({op:'same',line:x[i]});i++;j++;}
  else if(lcs[(i+1)*w+j]>=lcs[i*w+j+1])out.push({op:'del',line:x[i++]});
  else out.push({op:'add',line:y[j++]});
 }
 while(i<n)out.push({op:'del',line:x[i++]});
 while(j<m)out.push({op:'add',line:y[j++]});
 for(const line of a.slice(a.length-tail))out.push({op:'same',line});
 return out;
}
