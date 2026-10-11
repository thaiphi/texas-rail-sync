import test from 'node:test';
import assert from 'node:assert/strict';
import {chart,formatNumber} from '../public/inspection.js';
test('inspection preserves zero versus missing in displayed values and plotted volume marks',()=>{
 assert.equal(formatNumber(null),'Not reported');assert.equal(formatNumber(0),'0');
 const html=chart([{period_start:'2024-01-01',injected_liquid_bbl:null},{period_start:'2024-02-01',injected_liquid_bbl:0},{period_start:'2024-03-01',injected_liquid_bbl:31}]);
 assert.match(html,/2024-01: liquid volume not reported/);assert.match(html,/2024-02: 0 reported bbl/);assert.match(html,/2024-03: 31 reported bbl/);
 assert.equal((html.match(/<rect /g)||[]).length,1,'only a positive reported volume has a bar');assert.match(html,/n\/a/);
});
