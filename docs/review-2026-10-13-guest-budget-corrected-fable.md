**Verdict**
PASS for the bounded local prototype. The corrections from my earlier REVISE are in place and consistent across JS and SQL: the two missing helpers exist (`byte_count` at `docs/sql/trrc-guest-budget-DRAFT-not-applied.sql:12`, `clock_timestamp()` at `:154`), every new job carries a worst-case envelope counted until it is terminal (`:17,:77-81`), processing I/O and the source fetch are reserved before any network call, the proof is capped at 600 s with self-consistency checks and margins, counters survive retention, service journals cannot run unmetered, and the in-memory reference is explicit. No critical issue found. This is not a hosted-readiness claim.

**Verified by inspection**
- Envelope before fetch and enqueue: SQL `reserved_bytes` is generated per kind and `storage_unseen()` adds `greatest(envelope - used - staged - reservations, 0)` for active jobs; the enqueue trigger sees the new row, so admission reserves the worst case before any fetch (`:99-114`). JS `fetchInto` reserves the remaining-evidence envelope plus overhead before `fetchSource` (`src/hosted/guest-steps.mjs:56`), tested at `test/guest-admission.test.mjs:76`.
- Project-wide metadata: both `storage_measure` (`:62-69`) and `measureStorageObjects` (`guest-admission.mjs:23-31`) sum every bucket and fail closed on any unverifiable size; `checkStorage`/`require_storage_room` charge project growth since attestation plus pending plus a 100,000,000 margin against attested room (`guest-admission.mjs:34`, SQL `:94`).
- Proof: exact keys, operator source, ≤600 s, `remaining ≤ limit`, `project + remaining ≤ limit` in JS (`:13-21`) and as table checks in SQL (`:33-35`).
- Processing egress before I/O: `meterStore` reserves on every get, put and delete and refuses reads with no recorded size (`:44-51`); `readVerified` always passes the recorded size (`evidence-store.mjs:26`); all step readers, stagers and the archive reservation use the metered store (`guest-steps.mjs:50,69,89,120,123,128,130,136,191`). Transport `get` caps the body at the recorded size and refuses larger payloads (`guest-transport.mjs:45-55`).
- Downloads: full archive reserved as `download` before the read, three per token per rolling day, monthly 1,000,000,000 including processing, attested remainder with 500,000,000 margin (`guest-admission.mjs:37-42`, SQL `:117-147`); the download read uses the unwrapped store so it is charged exactly once (`guest-steps.mjs:213`).
- Retention: `egress` has no foreign keys and is kept through the previous UTC month; jobs purge only after cleanup released their object rows; tokens only with no jobs (`:148-164`).
- Fail-closed service: `createJournalAdmission.admitJob` is a no-op because the SQL enqueue trigger and `reserve_egress` both require a current proof; `resolveAdmission` refuses service journals without admission and refuses `UNMETERED_LOCAL_REFERENCE` for them (`:69-78`).
- Concurrent shared-read test: the sequential scan at `test/guest-admission.test.mjs:59-67` only matches an I/O against credits logged earlier and requires no leftover credits, so precedence and one-to-one coverage are both enforced despite interleaving. Sound.
- Lock order: egress and budget advisory locks are never nested; budget lock is taken last in AFTER-statement triggers.

**Ranked findings (none blocking)**
1. LOW, conservative over-charge. `meterStore.put` reserves `2*bytes` to cover the transport readback (`guest-admission.mjs:48-49`), and `writeVerified` then performs an explicit metered `get` (`evidence-store.mjs:36`), so each write is charged roughly three times its size. Either drop the factor to one or state the triple charge in the comment. Separately, the transport's conflict-path readback inside `put` (`guest-transport.mjs` fallback `get`) is not reserved; rare and bounded by the 2× credit.
2. LOW. The cleanup absence probe reads with `expectedBytes:0` (`evidence-store.mjs:95`); a surviving non-empty object surfaces as `GUEST_UNAVAILABLE` from `readCapped` rather than `CLEANUP_INCOMPLETE`. Fail-closed either way; map it for clarity.
3. LOW. Download reservations carry no request overhead, unlike processing; add `requestOverheadBytes` for symmetry.

**G2/G3 gaps, stated honestly**
- Physical orphans and late writes: metadata sums and journal-pending keys never prove physical or billed bytes; an upload landing after cleanup is counted only once visible and is never reclaimed; deletes are not fenced against in-flight writes beyond the fail-closed re-read.
- Hosted auth: `sb_secret_` with `apikey` only is unproven for PostgREST RPC and Storage; `postgres` access to `storage.objects` and `pg_database_size` on hosted is unverified.
- Local reference: the ledger and envelope check are in-memory and non-durable; durable per-job envelopes exist only in the unapplied SQL.
- Measured versus billed: whether Supabase bills Edge-to-Storage reads as egress is unknown; the metering is conservative, not authoritative. The attestation workflow itself is manual.

**Skipped coverage**
Full suite result (running), runtime SQL gates (being authored), any execution by me, hosted response shapes, database bloat behavior of `pg_total_relation_size`, and throughput under the global budget lock.

Checkpoint complete; slot released.