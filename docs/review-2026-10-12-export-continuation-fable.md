No further reads are needed; `pipeline.mjs`, `artifact.mjs` and `workflow.js` are unchanged from the prior round and remain in context.

**Summary**
The C8/C9 seam is sound for its bounded scope: `prepareArtifactFromReader` runs the identical load/QC/build/pin path and stops with export `running`, no publish, no save (`exportCore.mjs:77-79,104-111`); `finalizeArtifactFromReader` refuses any journal not at `succeeded/succeeded/running`, re-reads source bytes to recreate the private brand, binds the journal's load and QC evidence to freshly computed values, verifies every staged byte before commit, then commits from core-owned copies with readback and a single same-run export event (`:116-146`). `resumeRunRecorder` is strict (12-key set, UUID, `workflowView`, owned clone) and the canonical clock fails atomically on bad or backward time (`runEvents.mjs:8-12,19-27,44-50`). Bounded verdict: **PASS** with MED test additions and one MED design-shape note. Reviewer executable UNRUN; G0 adapter only — no hosted queue/Storage/guest acceptance.

**Files touched**
None.

**Needs judgment**

Verified (no finding):
- Brand/auth contract: finalize never trusts a serialized snapshot or client file; `loadSnapshotFromReader` at `:125` is the only brand source; `:127-128` require replayed provenance ≡ journal provenance, so `testFixture` cannot flip a public journal and vice versa.
- Journal binding: `:129` exact-equals the load-succeeded evidence (artifactId, sourceReference, provenance, inputs incl. sha256/count); `:132` exact-equals QC counts/outputs hashes (forged hash test `export-continuation.test.mjs:46-53`).
- Staged verification before commit (`:135-138`), publish from copies, readback, one export event, same `runId` (`:31-40`; test `:30-37`). Corrupt/missing staged → `EXPORT_MISMATCH`, prior successes retained, zero commits (`:38-45`).
- Record callbacks receive `structuredClone` (`:87,89,142,144`); fixtures never saved (`:87,89` guards + `saveRun`).
- M1 closed: `checkReference` rejects `..`/empty segments (`:20`). M2 closed by export-reader additions (reviewed last round).
- Clock: non-canonical/async clocks refused; backward time leaves the record unchanged (`run-resume.test.mjs:23-36`); terminal journals resume read-only (`:37-43`).

MED
- D1 (design shape, not this code's defect): prepare's load-succeeded evidence is `{artifactId,sourceReference,provenance,inputs}` (`:47,57,70`). The hosted C0–C7 acquisition steps have no slot to record per-request `requests`/`outputs` evidence as `acquisition.mjs:41-54` does for local live collection, and finalize's exact-equality at `:129` would reject any extra keys. Either prepare accepts an owned `acquisitionEvidence` object merged into the load event (and finalize compares it against the journal), or the spec states hosted records omit request-level evidence (RRC-10 disclosure).
- T1 Missing test: finalize with source bytes changed since prepare (e.g., altered `candidate-monthly.json`) → `SOURCE_HASH_MISMATCH` at `:129`, zero commits — the core "re-read, never repair" claim is untested.
- T2 Missing test: finalize on a fresh or terminal journal → `RUN_STATE_INVALID` (`:121`), no `readStaged`/`publish` calls.
- T3 Missing test: prepare with a recorder already at `running/pending/pending` (C0 handoff, `startLoad=false`, `:107`) producing the same five-event record and bytes.
- T4 Missing test: v2 prepare→finalize round trip (version-pins.json among staged bytes; `:24-26`).

LOW
- `:119` accepts any duck-typed recorder; a trusted caller could pass a non-`resumeRunRecorder` object. Optional hardening: brand recorders from `createRunRecorder`/`resumeRunRecorder` in a WeakSet and require it here.
- Extra staged objects are neither checked nor published (`:135` iterates `expected` only); state in the publisher contract comment that `publish` must emit exactly the supplied set.
- finalize `publish` throwing (not just `readStaged`) → export `failed` with prior successes is untested.

Open (outside scope): Edge continuation run, Storage/SQL publisher, quotas/admission/runtime caps, 57 MB memory bound, hosted `node:` behaviour.

**Gates**
- Read (actual): `src/exportCore.mjs`, `src/runEvents.mjs`, `test/export-continuation.test.mjs`, `test/run-resume.test.mjs`; `pipeline.mjs`, `artifact.mjs`, `workflow.js`, `acquisition.mjs`, prior export/reader tests from context.
- Executable: UNRUN by reviewer; Main's 17 targeted PASS, earlier 196 full PASS, local one-call export/TAR matches and 25 MB fixture are Main's results, latest full run pending. No deploy, cloud, Git, permission or paid action; no agents.

Bounded review complete; slot released.
