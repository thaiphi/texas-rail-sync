**Verdict**
REVISE. The proposal places enforcement in the right layer (SQL triggers inside the journal transaction, attestation never from a guest, downloads reserved before any read, idempotent replays exempt) and its retention rules keep reference and quota rows. It misses two design requirements from §5 and cannot load as written.

**Corrections, ranked**

1. Draft cannot load. `trrc_guest.byte_count` (proposal lines 262, 307) and `trrc_guest.maintenance_clock` (line 333) are referenced but defined in neither SQL draft. Define `byte_count(jsonb) returns bigint` returning null unless the value is a non-negative integer, and use `clock_timestamp()` at line 333. Add a harness gate that loads both drafts in order.

2. No worst-case reservation before fetch (design §5 lines 108 and 114). The statement triggers at lines 299-302 measure only after an evidence row is inserted, which is after the official fetch has already consumed source bandwidth, CPU and memory, and enqueue (line 302) checks current usage without reserving anything. Two collections admitted at 240,000,000 bytes both proceed and then fail mid-job. Smallest fix: add `jobs.reserved_bytes` set at enqueue (100,000,000 for collection and replay, 20,000,000 for lookup, provisional), include `greatest(reserved_bytes - recorded bytes, 0)` for non-terminal jobs in `storage_usage()` (line 259), and let `job_budget_trigger` refuse when usage plus the new reservation exceeds 250,000,000 or attested room. The per-insert triggers stay as the backstop; the JS `fetchInto` pre-check needs no change because room was taken at enqueue.

3. Processing egress is unmetered (design §5 line 118; proposal admits it at line 382). C8 reads all 21 evidence objects, C9 reads them again plus every staged object, L3 reads four, and the archive is read on download. Per job that is several times the archive size, so the 1,000,000,000 monthly and attested egress sums undercount. Smallest fix: generalize `trrc_guest_reserve_download` (line 305) into `reserve_egress(kind, bytes)` with `kind in ('download','processing')`; downloads keep the three-per-day count, both kinds count toward month and since-attestation sums. In JS, call `meter.reserveEgress` before `createVerifiedEvidenceReader` in `lookupInspect`, `processStep` and `commitStep` with bytes summed from the journal's selected evidence rows, plus staged rows and archive bytes at C9. Fail closed with `EGRESS_QUOTA` before any read.

4. Proof window and other-usage drift. A 24-hour attestation (lines 233, 120) with no margin lets non-guest Storage, database and egress growth, and other-project usage on the same allowance, consume the attested remainder unnoticed. Keep the mechanism but tighten the table check to 12 hours and subtract a provisional headroom (for example 100,000,000 Storage bytes and 500,000,000 egress bytes) in `require_storage_room` (line 282) and `reserve_download` (line 321). Document that attested values must be the platform-reported remaining figures, not journal sums, and that metadata sums never prove physical or billed bytes.

5. LOW. A proof that expires mid-job makes the next evidence insert raise `BUDGET_UNVERIFIED`, which `retryable()` does not cover, so the job fails terminally. Acceptable as fail-closed; if the owner prefers, treat it as one `retry_wait` on fetch steps only.

**Verified by inspection**
- Lock order is acyclic: enqueue lock, then job row, then key locks in `collate "C"` order, then the budget lock taken last in AFTER-statement triggers (line 276); cleanup never takes the budget lock. The egress lock (line 315) is taken without a job row lock.
- Missing, malformed, future-dated or expired proof refuses admission in both SQL (`current_proof`, line 250) and JS (`validatePlatformProof`, line 117); proof rows are insertable by the database owner only (lines 246-248).
- Storage measurement fails closed on any non-integer size (line 264) and adds journal-admitted keys not yet visible (lines 265-269); duplicate keys are deduplicated by `max(bytes)`.
- Downloads: reservation must equal the published archive size (line 314), is charged before any read including failed reads (JS line 202), and ranges are never served.
- Retention: jobs purge only after cleanup released every object row (lines 334-336), tokens only with no remaining jobs, download accounting kept through the previous UTC month, so rolling-day, monthly and since-attestation sums stay intact.
- Service journals cannot run unmetered (`resolveAdmission`, line 166); the in-memory reference stays explicitly unmetered so existing local tests are unchanged.

**Local prototype versus hosted readiness**
The JS ledger and optional `measureStorage` are a local reference; Storage is checked at enqueue only there. Hosted readiness additionally requires: the SQL drafts applied to an isolated database with a `storage.objects` stub, confirmation that the definer owner can read `storage.objects.metadata.size` on Supabase, the attestation workflow, and real `sb_secret` Storage and RPC authorization. The JWT fixture gateway does not prove the latter. Hosted guest admission stays disabled; no source limits, fixtures, pins or export contracts change.

Checkpoint complete; slot released.
