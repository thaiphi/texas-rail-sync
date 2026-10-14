import test from 'node:test';
import assert from 'node:assert/strict';
import * as runs from '../src/runEvents.mjs';
import {workflowView} from '../public/workflow.js';
const options={mode:'offline_replay',pipelineVersion:'rrc-collection-v1',schemaVersion:1,transformationVersion:'rrc-odp-v1.0.0',testFixture:true};
const t0='2026-10-12T18:00:00.000Z',t1='2026-10-12T18:00:01.000Z';
test('recorder accepts an explicit trusted clock without changing default metadata',()=>{
 const run=runs.createRunRecorder({...options,clock:()=>t0});
 assert.equal(run.snapshot().startedAt,t0);run.start('load');assert.equal(run.snapshot().events[0].timestamp,t0);
});
test('resumed recorder retains identity and owns the journal snapshot',()=>{
 assert.equal(typeof runs.resumeRunRecorder,'function');
 const original=runs.createRunRecorder({...options,clock:()=>t0});original.start('load');
 const journal=original.snapshot(),resumed=runs.resumeRunRecorder(journal,{clock:()=>t1});
 journal.events[0].timestamp='1999-01-01T00:00:00Z';journal.provenance.basis='caller mutation';
 resumed.succeed('load',{inputs:[{url:'https://data.texas.gov/resource/givw-z9t4.json',sha256:'a'.repeat(64),count:null}]});
 assert.equal(resumed.snapshot().runId,original.snapshot().runId);
 assert.equal(resumed.snapshot().events[0].timestamp,t0);
 assert.equal(resumed.snapshot().events[1].eventId,`${original.snapshot().runId}:2`);
 assert.equal(resumed.snapshot().events[1].timestamp,t1);
 assert.equal(workflowView(resumed.snapshot()).stages[0].status,'succeeded');
});
test('invalid journal chronology and backward clocks cannot partially advance a run',()=>{
 assert.equal(typeof runs.resumeRunRecorder,'function');
 const initial=runs.createRunRecorder({...options,clock:()=>t0});initial.start('load');
 const corrupt=initial.snapshot();corrupt.events[0].eventId='forged';
 assert.throws(()=>runs.resumeRunRecorder(corrupt),/identity|invalid/i);
 const resumed=runs.resumeRunRecorder(initial.snapshot(),{clock:()=> '2000-01-01T00:00:00.000Z'}),before=resumed.snapshot();
 assert.throws(()=>resumed.succeed('load',{inputs:[{url:'https://data.texas.gov/resource/givw-z9t4.json',sha256:'a'.repeat(64),count:null}]}),/chronology|invalid/i);
 assert.deepEqual(resumed.snapshot(),before);
});
test('noncanonical or asynchronous clocks are refused instead of inventing timestamps',()=>{
 for(const clock of ['not a function',()=> '2026-10-12',async()=>t0])assert.throws(()=>runs.createRunRecorder({...options,clock}),/clock|timestamp/i);
 let calls=0;const run=runs.createRunRecorder({...options,clock:()=>++calls<3?t0:'bad'});run.start('load');
 const before=run.snapshot();assert.throws(()=>run.fail('load',Error('failure')),/clock|timestamp/i);assert.deepEqual(run.snapshot(),before);
});
test('resuming terminal history preserves its failed and skipped states',()=>{
 assert.equal(typeof runs.resumeRunRecorder,'function');
 const run=runs.createRunRecorder(options);run.start('load');run.fail('load',Object.assign(Error('failure'),{code:'SOURCE_INVALID'}));
 const resumed=runs.resumeRunRecorder(run.snapshot());assert.deepEqual(resumed.snapshot(),run.snapshot());
 assert.throws(()=>resumed.start('load'),/finished|transition/i);
 assert.deepEqual(workflowView(resumed.snapshot()).stages.map(stage=>stage.status),['failed','skipped','skipped']);
});
