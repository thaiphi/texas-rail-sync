**Verdict**
The SQL draft is a faithful mirror of the in-memory journal contract for the paths the local reference exercises: ownership, fencing, lane and session uniqueness, evidence selection, exact-set publication, tombstone admission and maintenance fencing all match `src/hosted/guest-journal.mjs` predicate for predicate. I found no fresh HIGH correctness defect. Three MED items concern validation fidelity and untested SQL paths, not hosted gates. The draft is not deployment-ready: PostgREST role resolution, Storage, retention, budgets and cleanup transport remain unimplemented or unverified, and most time-dependent SQL branches have never executed.

**Fresh findings (ranked)**

1. MED, SQL-only. Interrupted-run construction is unvalidated and unexercised. `trrc_guest.reap()` commits a record built by `interrupt_run` (`docs/sql/trrc-guest-journal-DRAFT-not-applied.sql:242-274`) without the `workflowView` check the memory journal performs (`guest-journal.mjs:56`), and the error message literal at `:255` must equal `safeError`'s output for parity with `test/guest-review.test.mjs:35`. `scripts/check-guest-postgres.mjs` never drives a lane deadline, so the SQL branch has not run. Repro: in the isolated database, `update trrc_guest.jobs set lane_deadline = now() - interval '1 second'` on a claimed replay job that has a running record, enqueue from another token, read `trrc_guest_run`, then run `workflowView` on the result and deep-compare with the memory journal's output for the same input.

2. MED, SQL-only. Numeric validation is looser than the reference. `reserve_object:377`, `record_evidence:388` and `record_staged:414` accept non-integer `bytes` and silently round through `::bigint`, and no per-entry upper bound exists for staged or reserved bytes, whereas the reference requires `Number.isSafeInteger` (`guest-journal.mjs:128,135,145`). Downstream `readVerified` fails closed on a byte-count mismatch, so impact is a confusing `EVIDENCE_TAMPERED` instead of `REQUEST_INVALID`. Repro: `trrc_guest_record_staged` with `bytes: 1.5` succeeds; the memory journal rejects it. Add `b <> trunc(b)` checks as `retry:448` already does, and an 80,106,496 cap on staged and reservation bytes.

3. MED, SQL-only. Constraint and cast failures surface unmapped. `check_run:201` accepts any 36-character hex-dash `runId`, but `publish:485` casts it with `as_uuid` into a NOT NULL column; `publications.archive_bytes` over 80,106,496 (`:100`) and malformed event timestamps (`:213`) raise PostgreSQL errors without the `CODE:` prefix, so the transport reports `GUEST_UNAVAILABLE` (`guest-transport.mjs:27-28`). Fail-closed, but the job then fails with a generic code. Raise explicit `REQUEST_INVALID` or `EXPORT_MISMATCH` before those statements.

LOW: `record_staged` tolerates extra keys per entry (reference requires the exact four, `guest-journal.mjs:145`); `issue_token:296` checks duplicates before taking its advisory lock, so a concurrent same-hash insert becomes an unmapped primary-key error; `publish` does not require that the archive key was reserved (`:478-485`), which would be a cheap consistency check.

**Passed by inspection**
- Service-only boundary: all 21 RPCs are `security definer` with `set search_path = ''`; helpers live in an unexposed schema with execute revoked (`:558`); table and schema privileges revoked from `public`, `anon`, `authenticated` (`:11,:132`); RLS enabled without policies (`:124-131`); grant to `service_role` only (`:566-572`). No `trrc_archive` reference anywhere.
- Fencing: `fenced()` matches job, fence, lease owner, running state and unexpired lease under `for update` (`:186-195`); claim refuses live leases and non-due jobs, bumps fence and attempt exactly like `guest-journal.mjs:115-118` (`:358-362`); maintenance fence mirrors `:202` (`:275-279`).
- Locking order: enqueue serialized by one advisory lock plus partial unique backstops (`:49-50,:310`); per-key advisory locks taken in `collate "C"` order in `record_staged`, `cleanup_candidates` and `confirm_cleanup`; `reap()` uses `skip locked`, so cleanup never waits on worker row locks.
- JSONB key order: `check_run` uses jsonb equality per event (`:208`), the reference uses `isDeepStrictEqual`, and `finalizeArtifactFromReader` compares with `sameJson`; `publicationPinsSha256` hashes staged bytes, not `pins_json`. Append-only, same `runId` and `startedAt`, and monotonic timestamps are enforced (`:203-216`).
- Exact-set publication: `p->'files'` must equal `staged_json` in ordinal order, archive key, run id and result identity must agree, one publication per job (`:478-485`).
- Tombstone admission precedes every write path in both implementations (`:379,:397,:424`; `evidence-store.mjs:43-47,64-67`), and `guest-review.test.mjs:37-59` proves the reference writes nothing when stale and reserves the archive before upload.
- `stampBase` is millisecond-truncated so `monotonicClock` accepts it (`:363-364`).

**Failed**
None observed in the materials read.

**Blocked (hosted gates, documented, not fresh defects)**
PostgREST role resolution with `apikey`-only requests, Storage transport and bucket, cleanup RPC wiring (`guest-transport.mjs:32-33` stubs), token and job retention, global storage and egress budgets, Edge profiling of the guest core.

**Unrun in SQL (executed only against the memory journal)**
Lane reaping and interruption, lease expiry reclaim, retry backoff, evidence cap and selection conflicts, staged-set and publication mismatches, token and evidence expiry, cleanup candidates and confirmation. The isolated check covers apply, grants, ownership, idempotency, one concurrent claim, lane exclusivity, restart persistence and one happy-path replay. Time-based paths can be driven in the isolated database by editing `lane_deadline`, `lease_expires_at` and `tokens.expires_at` as `postgres` before calling the RPCs.

Review complete; slot released.
