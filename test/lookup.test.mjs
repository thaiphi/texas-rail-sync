import test from 'node:test';
import assert from 'node:assert/strict';
import * as sources from '../src/sources.mjs';
import {normalize} from '../src/normalize.mjs';

test('exact identifier queries preserve leading zeros and reject unsupported forms without truncation',()=>{
 assert.equal(typeof sources.lookupTarget,'function','bounded lookup query builder is required');
 assert.equal(new URL(sources.lookupTarget({kind:'uic',value:'000020838'}).url).searchParams.get('$where'),"uic_number='000020838'");
 assert.equal(new URL(sources.lookupTarget({kind:'api',value:'00123456'}).url).searchParams.get('$where'),"api_no='00123456'");
 for(const request of [{kind:'api',value:'42001234560000'},{kind:'uic',value:20838},{kind:'uic',value:'20838'},{kind:'other',value:'000020838'},{kind:'api',value:"00123456' OR 1=1"}])assert.throws(()=>sources.lookupTarget(request),/identifier|kind|format/i);
});
test('inclusive month scope rejects reversed, invalid and over-36-month ranges',()=>{
 assert.equal(typeof sources.boundedScope,'function','bounded date scope builder is required');
 const scope=sources.boundedScope('000020838','2024-01','2026-12');
 assert.equal(scope.monthlyStart,'2024-01-01T00:00:00');assert.equal(scope.monthlyEndExclusive,'2027-01-01T00:00:00');
 const targets=sources.targetsForScope(scope),monthly=new URL(targets[3].url).searchParams.get('$where');
 assert.equal(monthly,"uic_no='000020838' AND formatted_date >= '2024-01-01T00:00:00' AND formatted_date < '2027-01-01T00:00:00'");
 assert.equal(new URL(targets[2].url).searchParams.get('$where'),"uic_number='000020838'");
 for(const [start,end] of [['2024-01','2027-01'],['2024-13','2025-01'],['2025-02','2025-01']])assert.throws(()=>sources.boundedScope('000020838',start,end),/month|range/i);
 for(const value of [['2024-01'],null,{},202401,true]){assert.throws(()=>sources.boundedScope('000020838',value,'2024-01'),/month|range|string/i);assert.throws(()=>sources.boundedScope('000020838','2024-01',value),/month|range|string/i);}
 assert.deepEqual(sources.sourceScopeFlags('inventory',{uic_number:'000020838'},scope),[]);
 assert.deepEqual(sources.sourceScopeFlags('monthly',{uic_no:'000020838',formatted_date:'2027-01-01T00:00:00'},scope),['source_scope:formatted_date']);
});
test('new scope mismatches remain quarantined source rows',()=>{
 assert.equal(typeof sources.boundedScope,'function');
 const scope=sources.boundedScope('000020838','2024-01','2024-01');
 const result=normalize([{uic_number:'000020838',api_no:'00123456'}],[{uic_no:'000020838',formatted_date:'2024-02-01T00:00:00',id:'1',vol_liq:'0',vol_gas:'0',inj_press_avg:'0',inj_press_max:'0'}],{inventory:'i',monthly:'m'},scope);
 assert.equal(result.monthly.length,1);assert.equal(result.quality.monthly.quarantined,1);assert.ok(result.monthly[0].quality_flags.includes('source_scope:formatted_date'));
});
