**Verdict**
PASS for the local reference core (ownership, lease fencing, byte caps, publication atomicity, fixture/public classification, hash verification) as a basis for durable implementation. Two MED gaps in the local core should be fixed in the durable design before SQL/Storage work starts. The Supabase transport is draft-only and remains unreviewed for correctness against a real backend. Nothing here approves hosted enablement.

**Confirmed sound (local core)**
- Ownership: every read, claim and enqueue resolves the token hash first and refuses other owners with `NOT_FOUND` (`src/hosted/guest-journal.mjs:28-34`); advance requires the owner's token (`guest-steps.mjs:161`); evidence listing for a collection's parent lookup is only reached after `journal.job` ownership (`guest-steps.mjs:179-181`).
- Fencing: `fenced()` checks fence, lease owner, running state and unexpired lease on every mutation (`guest-journal.mjs:47-51`); a live lease returns status without a second step (`:102`); reclaim after expiry bumps fence and attempt (`:104-105`); stale leases are refused on advance, renew, fail, evidence and publish (tests `guest-journal.test.mjs:34-44`, `guest-steps.test.mjs:76-93`).
- Success only by fenced commit: `publish` requires final step, succeeded terminal run, exact staged set, archive key and consistent result (`:151-166`); the staged publisher's `publish` is explicitly not publication (`evidence-store.mjs:61-72`); a lost lease before C9 never marks success.
- Classification: fixture collections fail at C9 with `ARCHIVE_INVALID` because the production builder refuses fixtures (`guest-steps.mjs:124-128`, test `guest-steps.test.mjs:45-61`); replay jobs keep `offline_replay` and never fetch; the D1 guards are now in `src/exportCore.mjs:122-127,151-152`.
- Hashes and caps: every object read re-hashes and checks byte count (`evidence-store.mjs:23-28`); writes are add-only with readback (`:29-36`); total evidence admission fails closed at 10,000,000 bytes with a pre-fetch check (`guest-journal.mjs:115`, `guest-steps.mjs:49,53`).
- Run clock: journal-anchored monotonic clock from the claim stamp (`guest-journal.mjs:19-23,106-107`) keeps resumed records append-only and chronological.

**Findings**

1. MED, local core, RRC-10. Interrupted jobs never receive a terminal run record. `reap()` sets `interrupted` and `LANE_DEADLINE` but leaves `run` at its intermediate state with `runCommitted:false` (`guest-journal.mjs:46`), so `readRun` refuses (`:169`) and the view reports `runId:null`. Collection history then shows an interrupted job with no inspectable failed-load record, which the design's finalization step promised. Repro: enqueue lookup, claim, advance clock past `laneMs`, enqueue from another token, then `run()` returns `NOT_FOUND`. Fix in the durable design: a maintenance-fenced finalization that appends `load failed` plus skipped stages with `LANE_DEADLINE` and sets `runCommitted`.

2. MED, local core with hosted impact. Objects are stored before the journal admits them. `recordEvidence` and `stageOutputs` call `putObject` first, then the journal (`evidence-store.mjs:38-39,58-59`). A `LEASE_LOST`, `SOURCE_LIMIT` or `EVIDENCE_CONFLICT` reply leaves an unreferenced object, and cleanup only considers journal-referenced keys (`guest-journal.mjs:177-178`), so such objects are never reclaimed. The fetch pre-check (`guest-steps.mjs:53`) narrows but does not close this. Repro: claim, expire the lease, call `recordEvidence`; object persists and `runCleanup` removes 0. Fix: reserve or admit in the journal before the write, or track orphan keys for maintenance.

3. LOW, local core. Retry attempts double-charge the evidence cap because the second attempt's sidecar has a new `retrieved_at` hash (`guest-journal.mjs:113-116`). Conservative, but can refuse a legitimate second attempt near the cap. Charge selected rows only, or document.

4. LOW, boundary note. `evidence({jobId})` and `staged({jobId})` take no token (`guest-journal.mjs:118,126`). Correct for service-only use; the SQL functions must be service-role only (G3).

5. Known incomplete, hosted. `guest-transport.mjs` references RPC functions that do not exist, sends only `apikey` (role resolution unproven), and stubs maintenance (`:32-33`). No migration file exists. Not a fresh defect.

**Highest risks to act on**
- Finding 2 before any Storage-backed implementation, since orphaned objects consume the 1 GB Free budget silently.
- Finding 1 before connecting the browser job view, so interrupted jobs show truthful terminal evidence.
- Durable SQL must reproduce `checkRun` append-only semantics and `checkSelect` non-replacement exactly; these are the properties the in-memory tests rely on.

**Unreviewed paths**
- Supabase transport against real PostgREST or Storage; no migration text exists to review.
- Edge CPU/memory of the guest core; official-source reachability from Edge.
- `scripts/guest-local.mjs --official` real-fetch mode and the real walkthrough evidence.
- All test executions are Main's (264 full); reviewer ran nothing.

Checkpoint complete; slot released.
