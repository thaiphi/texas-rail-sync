import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {randomUUID} from 'node:crypto';
import {sha256} from '../src/normalize.mjs';
import {createMemoryGuestJournal,GUEST_LIMITS} from '../src/hosted/guest-journal.mjs';
import {createMemoryObjectStore,createStagedPublisher,createVerifiedEvidenceReader,objectKeyFor,putObject,putReservedObject,recordEvidence,runCleanup,stageOutputs} from '../src/hosted/evidence-store.mjs';
async function claimed(){
 let now=Date.parse('2026-10-13T05:00:00.000Z');const objects=new Map(),store=createMemoryObjectStore({objects}),journal=createMemoryGuestJournal({clock:()=>now}),tokenHash=sha256(randomUUID());
 await journal.issueToken({tokenHash});
 const {job}=await journal.enqueue({tokenHash,idemKey:'evidence-test-0001',kind:'lookup',requestDigest:sha256('x'),request:{kind:'uic',value:'000020838'},testFixture:true});
 const {lease}=await journal.claim({tokenHash,jobId:job.jobId,leaseOwner:randomUUID()});
 return {objects,store,journal,tokenHash,job,lease,tick:ms=>{now+=ms;}};
}
test('the verified reader serves only selected journal entries, re-hashes every read and returns owned copies',async()=>{
 const state=await claimed(),body=Buffer.from('{"rowsUpdatedAt":1}');
 const entry=await recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:body});
 await assert.rejects((await createVerifiedEvidenceReader({...state,jobId:state.job.jobId})).read('lookup-metadata.json'),error=>error.code==='ENOENT');
 await state.journal.advance({lease:state.lease,data:{},select:'L1-a1'});
 const reader=await createVerifiedEvidenceReader({...state,jobId:state.job.jobId});
 const copy=await reader.read('lookup-metadata.json');assert.deepEqual(copy,body);copy.fill(0);assert.deepEqual(await reader.read('lookup-metadata.json'),body);
 await assert.rejects(reader.read('lookup.json'),error=>error.code==='ENOENT');
 state.objects.set(entry.objectKey,new Uint8Array(Buffer.from('{"rowsUpdatedAt":2}')));
 await assert.rejects(reader.read('lookup-metadata.json'),error=>error.code==='EVIDENCE_TAMPERED');
 state.objects.delete(entry.objectKey);
 await assert.rejects(reader.read('lookup-metadata.json'),error=>error.code==='ENOENT');
 await assert.rejects(reader.requireAll(['lookup-metadata.json']),error=>error.code==='EVIDENCE_UNAVAILABLE');
});
test('object writes are add-only and verified by readback before any journal reference',async()=>{
 const store=createMemoryObjectStore(),bytes=Buffer.from('abc'),entry=await putObject(store,bytes);
 assert.equal(entry.objectKey,objectKeyFor(sha256(bytes)));
 assert.equal(await store.put(entry.objectKey,new Uint8Array(bytes)),'verified_existing');
 await assert.rejects(store.put(entry.objectKey,new Uint8Array(Buffer.from('abd'))),error=>error.code==='OBJECT_CONFLICT');
 const lying={put:async()=>'created',get:async()=>new Uint8Array(Buffer.from('xyz')),delete:async()=>{}};
 await assert.rejects(putObject(lying,bytes),error=>error.code==='STORAGE_INVALID');
 const absent={put:async()=>'created',get:async()=>{throw Object.assign(Error('gone'),{code:'ENOENT'});},delete:async()=>{}};
 await assert.rejects(putObject(absent,bytes),error=>error.code==='STORAGE_INVALID');
});
test('the staged publisher requires the exact expected set and never repairs staged bytes',async()=>{
 const state=await claimed(),files={'manifest.json':'{"a":1}\n','normalized.json':'{"b":2}\n'},entries=await stageOutputs({...state,files});
 await assert.rejects(stageOutputs({...state,files:{...files,'manifest.json':'{"a":3}\n'}}),error=>error.code==='EXPORT_MISMATCH');
 let builds=0;const publisher=await createStagedPublisher({...state,jobId:state.job.jobId,buildArchive:async()=>{builds++;return new Uint8Array([1]);}});
 await assert.rejects(publisher.publish({'manifest.json':files['manifest.json']},'id'),error=>error.code==='EXPORT_MISMATCH');
 await assert.rejects(publisher.publish({...files,'extra.json':'{}'},'id'),error=>error.code==='EXPORT_MISMATCH');
 await assert.rejects(publisher.readPublished('id','manifest.json'),error=>error.code==='ENOENT');
 const key=entries.find(entry=>entry.name==='normalized.json').objectKey,corrupt=new Uint8Array(Buffer.from('{"b":9}\n'));state.objects.set(key,corrupt);
 await assert.rejects(publisher.publish(files,'id'),error=>error.code==='EVIDENCE_TAMPERED');
 assert.equal(builds,0);assert.equal(state.objects.get(key),corrupt);
});
test('cleanup removes only expired, unreferenced guest objects under a maintenance fence',async()=>{
 const state=await claimed(),shared=Buffer.from('shared'),own=Buffer.from('own');
 const a=await recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:shared});
 const b=await recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.source.json',bytes:own});
 await state.journal.fail({lease:state.lease,errorCode:'HTTP_ERROR',select:'L1-a1'});
 const other=sha256(randomUUID());await state.journal.issueToken({tokenHash:other});
 const {job}=await state.journal.enqueue({tokenHash:other,idemKey:'evidence-test-0002',kind:'lookup',requestDigest:sha256('y'),request:{kind:'uic',value:'000020838'},testFixture:true});
 const live=await state.journal.claim({tokenHash:other,jobId:job.jobId,leaseOwner:randomUUID()});
 await recordEvidence({...state,lease:live.lease,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:shared});
 assert.equal((await runCleanup(state)).removed,0);
 state.tick(GUEST_LIMITS.lookupRetentionMs);
 assert.equal((await runCleanup(state)).removed,1);
 assert.equal(state.objects.has(b.objectKey),false);assert.equal(state.objects.has(a.objectKey),true);
 const stale=await state.journal.claimMaintenance({leaseOwner:randomUUID()});state.tick(GUEST_LIMITS.leaseMs);
 await assert.rejects(state.journal.confirmCleanup({lease:stale,keys:[]}),error=>error.code==='LEASE_LOST');
});
test('an expired lease cannot create untracked evidence or staged objects',async()=>{
 const state=await claimed();state.tick(GUEST_LIMITS.leaseMs+1);
 await assert.rejects(recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:Buffer.from('late')}),error=>error.code==='LEASE_LOST');
 await assert.rejects(stageOutputs({...state,files:{'manifest.json':'late'}}),error=>error.code==='LEASE_LOST');
 await assert.rejects(putReservedObject({...state,bytes:Buffer.from('late archive')}),error=>error.code==='LEASE_LOST');
 assert.equal(state.objects.size,0);
});
test('source-cap and conflict refusals leave no untracked object',async()=>{
 const state=await claimed();
 await recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:Buffer.from('first')});
 await assert.rejects(recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:Buffer.from('second')}),error=>error.code==='EVIDENCE_CONFLICT');
 await assert.rejects(recordEvidence({...state,attemptId:'L1-a1',path:'lookup-metadata.source.json',bytes:Buffer.alloc(10_000_000)}),error=>error.code==='SOURCE_LIMIT');
 assert.deepEqual([...state.objects.keys()],[objectKeyFor(sha256(Buffer.from('first')))]);
});
test('reserved uploads are tracked and cleaned; keys being deleted refuse new admission until cleanup confirms',async()=>{
 const state=await claimed(),archive=await putReservedObject({...state,bytes:Buffer.from('archive')});
 await state.journal.fail({lease:state.lease,errorCode:'HTTP_ERROR'});
 state.tick(GUEST_LIMITS.lookupRetentionMs);
 const other=sha256(randomUUID());await state.journal.issueToken({tokenHash:other});
 const {job}=await state.journal.enqueue({tokenHash:other,idemKey:'evidence-test-0003',kind:'lookup',requestDigest:sha256('z'),request:{kind:'uic',value:'000020838'},testFixture:true});
 const live=await state.journal.claim({tokenHash:other,jobId:job.jobId,leaseOwner:randomUUID()});
 const maintenance=await state.journal.claimMaintenance({leaseOwner:randomUUID()});
 assert.deepEqual(await state.journal.cleanupCandidates({lease:maintenance}),[archive.objectKey]);
 await assert.rejects(recordEvidence({...state,lease:live.lease,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:Buffer.from('archive')}),error=>error.code==='OBJECT_BUSY');
 await state.store.delete(archive.objectKey);
 assert.equal((await state.journal.confirmCleanup({lease:maintenance,keys:[archive.objectKey]})).removed,1);
 await recordEvidence({...state,lease:live.lease,attemptId:'L1-a1',path:'lookup-metadata.json',bytes:Buffer.from('archive')});
 assert.equal(state.objects.has(archive.objectKey),true);
});
