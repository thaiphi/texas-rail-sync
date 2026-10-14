import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=name=>readFileSync(new URL(`../public/${name}`,import.meta.url),'utf8');
test('collection screens call only the injected api, never fixed legacy URLs',()=>{
 const collection=src('collection.js');
 assert.match(collection,/export function mountCollection\(\{onRun,onVersions,onOpen,onDownload,api\}\)/);
 assert.doesNotMatch(collection,/'\/api\/lookup'|'\/api\/collect'/);
});
test('app selects guest mode only from the hosted shell meta and keeps guest packages out of the public registry',()=>{
 const app=src('app.js');
 assert.match(app,/meta\[name="trrc-mode"\]/);assert.match(app,/guestPackages\.get\(id\)/);
 assert.doesNotMatch(app,/availableVersions\.push\([^)]*guest/i);
});
test('portfolio link is hidden until a published URL is configured',async()=>{
 const {PORTFOLIO_URL}=await import('../public/portfolio-link.js');assert.equal(PORTFOLIO_URL,'');
 assert.match(src('index.html'),/id="portfolio-link"[^>]*hidden/);
});
