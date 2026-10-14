**Summary**
D1 retention and verification is implemented correctly where it applies: `verifiedAcquisition` (`src/exportCore.mjs:23-36`) binds every journal request and output to the freshly loaded sources by name, URL, HTTP status, sha256 of the loaded bytes, byte length and path, requires exactly one of each per fetched source, excludes the selection source, and returns an owned copy. Prepare clones the supplied evidence before its first await (`:127`), records it only on the load-succeeded event (`:86`), and finalize re-verifies the journal copy against re-read bytes before the exact-equality check (`:150-151`). Artifact bytes are unaffected: v1/v2 files and all three frozen TARs match in Node tests and in the separate Edge prepare/finalize workers. The four new tests were meaningfully RED then GREEN. Verdict for the bounded scope: **REVISE (narrow)**. Two evidence-omission paths that the brief asked me to judge are real and each needs a one-line guard plus a test. Everything else in scope passes.

**Files touched**
None.

**Needs judgment**

MED, required before hosted C8/C9 wiring:
- **B1 Fresh or not-yet-started live prepare accepts no evidence.** `:123` sets `resumedLive` only when a recorder is at `running/pending/pending`. A call with no recorder and `mode:'live_collection'`, or a live recorder still at `pending/pending/pending`, passes `:126` with `acquisitionEvidence:null` and records a `live_collection` load-succeeded event with no requests or outputs. The UI then labels that run "Official acquisition" without request evidence (RRC-10). Fix: derive the live flag from `recorder.snapshot().mode` when a recorder exists, else from `mode`, and require evidence whenever it is live. Test: both cases reject with `SOURCE_INVALID` and an unchanged record. Not covered by `test/export-continuation.test.mjs:119-128`, which only tests resumed-live-missing and offline-with-evidence.
- **B2 Finalize accepts a live journal whose acquisition keys were removed.** `:150` verifies acquisition only if `requests` or `outputs` is present. Deleting both keys from a `live_collection` journal's load event makes `acquired` empty and `:151` compares the stripped event against itself, so finalize commits. This is the sibling of the tampered-hash case already defended at `:129-134` of the test file. Fix: at `:150` require both keys present iff `journal.mode==='live_collection'`, else `SOURCE_PROVENANCE_CONFLICT`. Test: strip both keys, expect `succeeded/succeeded/failed` and zero commits.

Verified, no finding:
- Hash and count binding: output `sha256` and `bytes` compare to `source.sha256` and `source.bytes`, which `artifact.mjs:72` computes from the loaded body, not the sidecar. `httpStatus` binds to the sidecar status the loader already requires to be 200 (`artifact.mjs:69`). `count` must be null, matching `acquisition.mjs:50`.
- Paths: outputs match only through `inputPath`, so a hosted C1–C7 writer must record `${sourceReference}/${name}` exactly or finalize fails closed. State this in the C1–C7 contract.
- Failure ordering: evidence failure at `:86` lands on the load stage with `failed/skipped/skipped` and prior awaits already done; finalize failures land on export with prior successes retained (tests `:126`, `:132`, `:138`).
- Defensive copies: `:127` clone precedes the `:129` await; `verifiedAcquisition` clones again; returned records are snapshots (test `:112-118`).
- Extra, duplicate, missing, failed-status, wrong-URL and selection-kind requests all fail closed via `!source`, `requested.has`, or size equality. A request with only one of the two keys fails shape validation with `SOURCE_INVALID`.
- Request order is not enforced. Harmless because membership and count are exact.

LOW:
- The Edge continuation probe runs `offline_replay` only (`tmp/guest-edge-2026-10-12/probe-handler.ts:28-31`), so the live-evidence path is Node-tested only. Fine for now; note it in the results doc scope line.
- `structuredClone` at `:127` throws an uncoded `DataCloneError` on non-cloneable input without `error.record`. Fails closed; cosmetic.

**Gates**
- Read (actual): `src/exportCore.mjs`, `src/acquisition.mjs`, `src/artifact.mjs`, `src/runEvents.mjs`, `src/sources.mjs`, `test/export-continuation.test.mjs`, both docs JSON, red/green/full logs, browser log, probe handler and driver.
- Executable: UNRUN by reviewer. Main's logs show red 10/14 with the four D1 tests failing on absent `requests` and a missing rejection, then green 14/14; full suite 218/218 in an isolated workspace (tail only); Edge prepare/finalize 3/3 with same run, five prior events preserved and frozen TAR hashes matched; runtime shutdowns all `EarlyDrop`, memory `exceeded:false`; browser 21/21 with v1 TAR and default pin unchanged.
- Scope limits unchanged: local Edge and in-memory publisher only, no Storage/SQL/ownership/auth, no hosted queue, no guest acceptance, no deployment or paid action.

Bounded review complete; slot released.
