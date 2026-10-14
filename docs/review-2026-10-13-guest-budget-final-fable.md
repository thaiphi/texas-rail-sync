**Verdict**
PASS for the bounded local prototype. Both corrections are implemented consistently and no blocking defect was found.

**Verified by inspection**
- Source pre-charge at full cap: every fetch reserves exactly 10,000,000 plus 65,536 bytes before the network, independent of remaining journal room (`src/hosted/guest-steps.mjs:57`), which matches the unchanged shared cap in `src/sourceFetch.mjs:12,14` where a response can stream up to 10,000,000 bytes before the job-level refusal at `guest-steps.mjs:60`. The test asserts the same reservation precedes each fetch (`test/guest-admission.test.mjs:79`).
- Download overhead: JS caps download reservations at 80,172,032 and reserves `archive.bytes + 65,536` (`guest-admission.mjs:38`, `guest-steps.mjs:214`); SQL enforces the same cap on download rows and requires the reservation to equal `archive_bytes + 65536` (`docs/sql/trrc-guest-budget-DRAFT-not-applied.sql:46,129`); the combined ceiling of 160,278,528 is unchanged (`:44,:121`). Test `:69` pins the JS behavior. The archive read still verifies against the recorded size, so export bytes are untouched.
- NULL replay handling: both private fixture gateways convert an empty psql result into JSON `null` (`scripts/check-guest-postgres.mjs:38`, `scripts/check-guest-storage.mjs:40`), so `replay` and `claimMaintenance` round-trip as the transport expects.
- Bootstrap identity: both harnesses run psql as the image's existing `supabase_admin` and create only the three NOLOGIN roles; no Storage grants or ownership changes (`check-guest-postgres.mjs:28-30,50`, `check-guest-storage.mjs:24,51-53`).
- Stub versus vendor Storage: the SQL-only harness creates a plain `storage.objects` stub and says so (`check-guest-postgres.mjs:54-55`), using it to drive `BUDGET_UNVERIFIED` and `STORAGE_QUOTA` (`:199-205`); the native gate reads the vendor-managed table. Scope strings in both reports distinguish them.
- Attestation: the fixture allowances in `check-guest-storage.mjs:64` and `scripts/probe-guest-edge.mjs:71-73` are labeled disposable and do not attest hosted room.
- Edge probe: network disabled, memory adapters only, includes the admission code path, expects fixture collections to fail with `ARCHIVE_INVALID` and replays to match frozen archive hashes; CPU-control termination is required for a pass.

**Minor, non-blocking**
- `checkEgress` does not require a string `tokenHash` for `kind:'download'` (`guest-admission.mjs:38-39`); a null token would match null-token rows in the per-session count. SQL already enforces NOT NULL for downloads. One-line guard suggested.

**Unverified coverage**
Final disposable SQL rerun after the overhead edit, the native Storage and Edge runs now underway, and all test executions are Main's. Hosted `sb_secret` authorization, `storage.objects` access on hosted, physical orphans and late writes, and billed-egress semantics remain open gates; none are claimed here. Hosted guest admission stays disabled.

Checkpoint complete; slot released.