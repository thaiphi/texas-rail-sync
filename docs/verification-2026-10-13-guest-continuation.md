# Guest backend continuation — October 13, 2026

Owner resumed work after the prior pause. This continuation began 19:21:21 UTC; stop/report by 20:21:21 UTC. Supabase Free only; no deployment, cloud writes, billing, permission changes, Git writes or Phi Analytics edits. Local migration text and isolated disposable database tests are permitted; they do not alter hosted permissions.

Paused safely at the final handoff before the deadline. No running consultant assignment, verification process or test-owned container remains. The online app is still incomplete; use the explicit remaining scope below when resuming.

## Independent review and fixes

Fable 5.1/high independently read the local guest backend and issued bounded PASS with two MED findings (`review-2026-10-13-guest-core-fable.md`). The original Opus 5.5/high implementer proposed fixes; Codex integrated them after regression tests failed.

- Interrupted jobs with an existing running record now append a terminal failed event and skipped downstream stages using the monotonic journal clock. Original events remain unchanged; no run is invented before one exists. The safe error remains `STAGE_FAILED`; `evidence.reason` and job `errorCode` preserve `LANE_DEADLINE`.
- Evidence and staged outputs are registered before Storage writes, with existing lease/cap/conflict checks. Whole archives receive a journal reservation before upload. Tracked reservations participate in retention cleanup; cleanup keys refuse new admission while deletion is pending.
- These fixes do not certify remote Storage safety: slow/stale deletion, writes landing after cleanup and orphan reconciliation remain durable-storage gates. An interrupted acquisition marker may still say `running`; the terminal run/job identifies interruption honestly.
- Conservative retry byte charging remains unchanged. Evidence/staged journal reads are service-only internal interfaces; SQL must enforce that boundary.

RED evidence: `tmp/guest-review-red.log`, `guest-review-all-red.log`, `guest-review-archive-red.log`. GREEN: 38/38 guest targeted tests, 273/273 full isolated tests (`tmp/guest-review-green.log`, `guest-review-full.log`). TypeScript, whitespace and tracked raw/artifact/run/integrity-pin preservation passed.

## Actual local Edge evidence

`scripts/probe-guest-edge.mjs` builds a unique local bundle from actual production modules and runs cached Edge v1.77.1 with 256 MB memory, 2,000 ms CPU and 150 s wall limits. Container has no network or published ports; no source fetch or credentials. Two public v2 replay archives match original hashes/bytes exactly. Fixture collection and a 7 MB whitespace-padded fixture reach the production public-archive refusal (`ARCHIVE_INVALID`), preserving fixture classification. Wrong-owner access is refused.

Final evidence: `guest-core-edge-results-2026-10-13.json`, with image ID, source hashes, runtime versions and captured events. Four cases passed. Captured shutdown CPU: 153/100/84/474 ms; captured heap+external memory: 39,842,240/33,860,780/42,441,508/97,922,904 bytes, no recorded memory exceedance. The explicit five-second CPU control was terminated, with 2,008 ms runtime CPU recorded. These are captured values, not peak RSS or hosted guarantees. JSON/fixture padding is a synthetic stress input, not public observation data.

The first probe had incorrect source-name/sidecar mappings; those harness failures were corrected. Production code was not weakened to pass. Local memory adapters were used; actual Storage I/O and durable journal costs remain unrun. No production admission cap is certified by this probe.

## Durable SQL gate

`docs/sql/trrc-guest-journal-DRAFT-not-applied.sql` now contains actual service-only journal functions, authored by Opus and integrated/tested by Codex. It remains outside the migration directory and has never been applied to Portfolio. The local script creates roles only in disposable PostgreSQL17, never hosted. Independent SQL review is saved in `review-2026-10-13-guest-sql-fable.md`.

`scripts/check-guest-postgres.mjs` passed **18/18** checks: SQL load; anonymous/authenticated denial; service-only private-table/helper denial; ownership; idempotency; concurrent claim and lane admission; lease expiry after row-lock wait; numeric/staged-key/timestamp guards; interrupted records equal the Node recorder and validate through `workflowView`; evidence cap; cleanup tombstones; restart persistence; public replay with exact frozen TAR bytes; duplicate-token race; retry backoff/budget; immutable selected evidence; token/evidence expiry. Durable evidence: `guest-postgres-results-2026-10-13.json`. This exercises real SQL via psql and the transport interface, not HTTP PostgREST authentication. Object storage in the service replay was still an in-memory reference.

Initial SQL failures were real and resolved: temporary init-server readiness race in the harness; text collation applied to an integer; stale transaction-time lease accepted after waiting on a lock; fractional bytes, extra staged keys and invalid timestamps mapped incorrectly. RED logs: `tmp/guest-postgres-second.log`, `guest-postgres-expiry-red.log`, `guest-postgres-validation-red.log`. Corrective SQL uses current time after lock acquisition and after potentially blocking key admission, validates run transitions/identity/provenance and guards casts. The SQL run validator does not reproduce the full contents of successful quality/export evidence; the existing Node recorder/export validators remain authoritative. Do not call full SQL contract parity complete.

Fable's numeric-rounding inference was not observed in execution: fractional text-to-bigint casts actually raised uncoded PostgreSQL errors. The correction produces `REQUEST_INVALID` before either cast. Interrupted-run tests were previously unrun, not falsely counted as independently reproduced defects.

## Storage transport review and final gates

`guest-transport.mjs` now maps all 21 SQL RPCs, including maintenance. Constructor refuses unsafe bucket segments. Uploads are bounded, copied before awaits, and checked against their content-address before requests. Empty bytes remain valid recorded evidence; Main deliberately declined the proposal's minimum-one-byte restriction. Safe simple/mixed-case bucket identifiers remain supported. Bad constructor config uses the existing `GUEST_UNAVAILABLE` family.

Independent bounded review: `review-2026-10-13-guest-transport-fable.md`. Its MED was reproduced: unavailable upload/readback appeared as a fabricated conflict. Now only actually different existing bytes yield `OBJECT_CONFLICT`; unavailable/missing readback yields `STORAGE_UNAVAILABLE`. Exact existing bytes still support idempotency. RED Node and Edge logs: `tmp/guest-transport-classification-red.log`, `guest-transport-edge-red.log`. Main applied original Opus's fix and verified it; no newly issued reviewer verdict after that fix is claimed.

- **Passed:** final full direct-Node suite **280/280**, zero skipped/failed (`tmp/guest-continuation-release-full.log`); 18 SQL gates; seven transport unit tests included in the full suite; final actual local Edge five positive cases plus expected CPU termination control; TypeScript; whitespace; tracked raw/artifact/run/pin preservation.
- **Failed during development, resolved:** regression and SQL/harness failures described above. Final executed checks have no failure.
- **Blocked acceptance:** actual hosted PostgREST/`sb_secret` and Storage integration, hosted source reachability/profiling remain unverified under no deployment or cloud-write authorization. Guest release is not accepted.
- **Unrun/incomplete:** real Storage writes/late-write-safe sweeping/deletion fencing; global storage/DB/egress and remaining invocation budgets; job/token retention purges; browser guest API wiring; hosted guest walkthrough/consumer import. Browser tests were not rerun in this continuation because no UI file changed; prior browser evidence is separate in `verification-2026-10-13-connected-release.md`.

Final Edge evidence: `guest-core-edge-final-results-2026-10-13.json`, with final module hashes and image ID. Two public replays retain exact archive bytes, fixtures remain refused, and controlled transport checks prove owned bytes/hash refusal/empty evidence/service-error classification in Edge. Captured CPU 149/94/89/488/14 ms; captured heap+external memory 46,631,118/33,879,020/41,478,348/133,027,433/16,618,990 bytes. No memory exceedance recorded; CPU negative control enforced. Not peak RSS or hosted/Storage I/O certification.

Read-only Portfolio check through its existing MCP connection: active healthy PostgreSQL17 project, organization Free, database 12,629,683 bytes, zero `storage.objects` and zero unverifiable size metadata rows, no `trrc_guest` schema. These values do not establish platform egress/invocation allowance or orphan reconciliation. No project, bucket, grant or data was changed.

Deferred LOW notes: retry evidence conservatively charged twice; service-only evidence/staged methods require the SQL boundary; oversized download uses generic unavailable code normalized by callers; delete's 400-with-404 body is not handled; bucket absence resembles missing evidence. Remote deletion/upload races and full successful-run evidence validation remain larger release gaps, not deferred polish.

## Files and handoff

Requirement mapping: RRC-05 (versioned Analytics export) is preserved through frozen TAR-byte comparisons; consumer import remains unrun here. RRC-09 (read-only collection map) receives truthful terminal records but no graph/UI change or new browser acceptance is claimed. RRC-10 (actual run/status/error/output provenance) receives interruption, fencing, reservation and error-classification fixes with local executable evidence; hosted acceptance remains open.

Implementation changed this continuation: `src/hosted/guest-journal.mjs`, `evidence-store.mjs`, `guest-steps.mjs`, `guest-transport.mjs`; `test/guest-journal.test.mjs`, `guest-evidence.test.mjs`, new `guest-review.test.mjs`, new `guest-transport.test.mjs`; new `scripts/check-guest-postgres.mjs`, `scripts/probe-guest-edge.mjs`; new SQL draft and review/evidence/checkpoint docs. Other earlier uncommitted edits were preserved. No browser/UI, data/pin, Analytics, hosted entrypoint or hosting-bridge change in this continuation.

Backup assignments used original Opus5.5/high for read-only implementation proposals, Fable5.1/high for independent bounded reviews, and Codex for integration and executable gates. All consultant processes closed and all test-owned containers/volumes removed. Nothing committed, pushed or deployed.

Next: finish the local Storage/budget/orphan/retention design and adapter tests; validate actual local Storage/PostgREST integration before browser guest wiring. Keep production admission disabled. Later hosted apply/deploy/permission changes require separate authorization and reviewed concrete changes. Preserve the pin SHA-256 `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727` and current exports. This checkpoint is a bounded validation/backend advance, not a finished online app.

Hosted guest admission remains disabled. Browser guest wiring, storage/egress/headroom budgets, late-write-safe orphan cleanup, hosted official-source reachability and final durable backend review remain incomplete. No hosted acceptance is claimed.
