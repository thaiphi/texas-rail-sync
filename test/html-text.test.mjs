// E12-lite Task 2: pure HTML-to-text and line diff, checked against the committed rrc-resources copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {htmlToText,lineDiff} from '../public/html-text.js';

const root=new URL('../',import.meta.url);
const fixture=async prefix=>{const dirs=(await readdir(new URL('collected-sources/',root))).filter(name=>name.startsWith(prefix));assert.equal(dirs.length,1,`one collected-sources folder starts ${prefix}`);return readFile(new URL(`collected-sources/${dirs[0]}/rrc-resources.html`,root),'utf8');};

test('htmlToText drops script, style and comments and splits on block tags', ()=>{
  assert.deepEqual(htmlToText('<p>A &amp; B</p><script>x()</script><style>p{}</style><!-- c --><div>C&nbsp;D<br>E</div>'),
    ['A & B','C D','E']);
});

test('htmlToText decodes &lt; &gt; &quot; &#39; &#NNN; &#xHH; and collapses whitespace', ()=>{
  assert.deepEqual(htmlToText('<p>  1 &lt; 2 &gt; 0\n\t&quot;q&quot; it&#39;s &#167;&#x41;&#X42;  </p>'),['1 < 2 > 0 "q" it\'s §AB']);
  assert.deepEqual(htmlToText('<h2 class="x">Title</h2>\n<ul><li>one</li><li> two </li></ul><table><tr><td>a</td><th>b</th></tr></table>'),['Title','one','two','a','b']);
  assert.deepEqual(htmlToText('<SCRIPT type="t">if(a<b){}</SCRIPT><Style>x</Style>X<!--\nmulti\n-->Y<BR/>Z'),['XY','Z']);
  assert.deepEqual(htmlToText('&amp;lt; stays &amp;lt; and &bogus; stays'),['&lt; stays &lt; and &bogus; stays']);
  assert.deepEqual(htmlToText('<p>wrapped\nsource &#10;line</p>'),['wrapped source line'],'source and encoded newlines are whitespace');
  assert.deepEqual(htmlToText('&lt;p&gt;shown&lt;/p&gt;'),['<p>shown</p>'],'encoded tags are text');
  assert.deepEqual(htmlToText(''),[]);
  assert.deepEqual(htmlToText('<p> </p><div>&nbsp;</div>'),[]);
});

test('real rrc-resources change shows the §3.15/3.58 lines as added', async ()=>{
  const oldHtml=await fixture('7aecd619'),newHtml=await fixture('a8606089');
  const diff=lineDiff(htmlToText(oldHtml),htmlToText(newHtml));
  const added=diff.filter(d=>d.op==='add').map(d=>d.line).join('\n');
  assert.match(added, /3\.15 and 3\.58/); assert.match(added, /Senate Bill 1150/); assert.match(added, /November 13, 2026/);
  assert.ok(diff.some(d=>d.op==='same'),'unchanged page text is kept as same lines');
  assert.doesNotMatch(added,/<\/?[a-z][^>]*>/i,'no tags survive in added text');
  assert.doesNotMatch(diff.map(d=>d.line).join('\n'),/<script|<style|<!--/i);
});

test('markup-only change yields identical text', ()=>{
  assert.deepEqual(htmlToText('<p class="a">X</p>'),htmlToText('<p class="b">X</p>'));
  assert.deepEqual(htmlToText('<p class="a">X</p>'),['X']);
});

test('lineDiff is minimal on insert/delete and keeps order', ()=>{
  assert.deepEqual(lineDiff([],[]),[]);
  assert.deepEqual(lineDiff(['a','b'],['a','b']),[{op:'same',line:'a'},{op:'same',line:'b'}]);
  assert.deepEqual(lineDiff(['a','c'],['a','b','c']),[{op:'same',line:'a'},{op:'add',line:'b'},{op:'same',line:'c'}]);
  assert.deepEqual(lineDiff(['a','b','c'],['a','c']),[{op:'same',line:'a'},{op:'del',line:'b'},{op:'same',line:'c'}]);
  assert.deepEqual(lineDiff([],['x']),[{op:'add',line:'x'}]);
  assert.deepEqual(lineDiff(['x'],[]),[{op:'del',line:'x'}]);
  const d=lineDiff(['a','b','c','d'],['a','x','c','d','e']);
  assert.equal(d.filter(e=>e.op==='same').length,3);
  assert.deepEqual(d.filter(e=>e.op!=='add').map(e=>e.line),['a','b','c','d'],'before order kept');
  assert.deepEqual(d.filter(e=>e.op!=='del').map(e=>e.line),['a','x','c','d','e'],'after order kept');
  const before=['a','b'],after=['b','c'];lineDiff(before,after);
  assert.deepEqual(before,['a','b']);assert.deepEqual(after,['b','c']);
});

test('lineDiff beyond 5000 lines on a side returns all deletions then all additions', ()=>{
  const big=Array.from({length:5001},(_,i)=>`l${i}`);
  const d=lineDiff(big,['l0']);
  assert.equal(d.length,5002);
  assert.deepEqual(d.slice(0,5001),big.map(line=>({op:'del',line})));
  assert.deepEqual(d[5001],{op:'add',line:'l0'});
  const at=Array.from({length:5000},(_,i)=>`l${i}`);
  assert.equal(lineDiff(at,at).every(e=>e.op==='same'),true,'5000 lines still diffed');
});
