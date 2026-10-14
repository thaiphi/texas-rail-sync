# Local Storage and admission continuation — 2026-10-13

Started 21:42:43 UTC; hard stop 22:42:43 UTC (17:42:43 CDT). Supabase Free only. No hosted apply, deployment, permission changes, commits or pushes. Phi Analytics was not edited. This is a bounded local verification record, not release acceptance.

## Backup workflow

Codex owns file edits, integration and gates. Opus 5.5/high supplies read-only implementation proposals; Fable 5.1/high independently reviews; Haiku 5.5/xhigh maps the browser call sites. At most two external assignments run concurrently. Browser integration remains gated on backend verification.

## Native local Storage gate

`scripts/check-guest-storage.mjs` runs the cached Storage API v1.37.7 and PostgreSQL 17.6.1.143 on a unique internal Docker network with no host ports. It replays preserved public source bytes; it does not collect from RRC. The harness uses a disposable local JWT at a test gateway and real SQL through psql. Consequently it does **not** establish hosted secret-key gateway behavior, PostgREST role resolution, or hosted Free-plan capacity.

Two startup failures were diagnosed without changing permissions: the cached PostgreSQL image already owns the Storage schema as `supabase_admin`, and its installed roles conflict with rerunning Storage role installation. The harness uses that existing bootstrap identity and `DB_INSTALL_ROLES=false`. It grants no extra permissions to force a pass.

The first complete replay passed seven checks, including a byte-identical preserved public archive, then failed deletion. The production adapter used an unsupported per-object DELETE route. It now uses the supported bucket deletion endpoint with one validated full content-address key and verifies the returned names. Cleanup still reads the object to prove absence before releasing references.

Deletion regression: `test/guest-transport.test.mjs` failed before the fix (`tmp/storage-delete-red.log`) and passed 8/8 afterward (`tmp/storage-delete-green.log`). The repeat native gate passed all 8 checks: health, private bucket creation, add-only exact-byte writes/readback, anonymous access refusal, persistence after restart, zero-versus-missing evidence, SQL-plus-Storage exact archive replay, and deletion verified by a subsequent read with idempotent missing deletion. Results: [native evidence](guest-storage-native-results-2026-10-13.json). All owned containers and the internal network were removed by the harness. Per-step wall times include launching curl containers and must not be interpreted as Edge CPU or actual request latency.

The preserved replay TAR is 1,393,664 bytes, SHA-256 `69a9378185df7a1ecd8fe357d7d984eaf1b6258f4cc0b402c5f679f133f605f8`. It is byte-identical to the existing whole-version archive builder output.

## Admission review

Fable returned REVISE on the initial proposal: [initial review](review-2026-10-13-guest-budget-fable.md). Main integrated the corrected proposal and preserved the original review. The [corrected review](review-2026-10-13-guest-budget-corrected-fable.md) and [final follow-up](review-2026-10-13-guest-budget-final-fable.md) passed the bounded local prototype, with hosted gaps explicitly open.

The new `src/hosted/guest-admission.mjs` and budget SQL draft require a private operator attestation no older than 600 seconds. They count all project Storage metadata, provisional headroom margins, active job envelopes, and processing plus downloads in the monthly ledger. Storage reads carry recorded byte limits; unknown sizes are refused before I/O. Failed reads and retries retain their charges. Service journals require explicit admission; the existing in-memory reference remains explicitly unmetered unless a meter is supplied. The draft stays outside `supabase/migrations`; no hosted apply occurred.

Main found two further accounting gaps and added RED/GREEN regressions: subsequent source fetches must reserve the full unchanged 10 MB network cap even when journal room is smaller, and downloads must reserve archive bytes plus 65,536 bytes of request overhead. Neither correction changes the archive, source fetch cap, calculations, quality reasons or data contracts.

The 100 MB collection/replay and 20 MB lookup envelopes and the headroom margins are provisional local controls, not a certified worst-case capacity model or billing guarantee. A local operator attestation is not proof of hosted billing headroom. Hosted admission stays disabled.

## Current verification evidence

- **Passed:** final isolated full Node suite **291/291**, log `tmp/storage-admission-final-suite.log`; targeted admission/transport **18/18**. RED logs remain for deletion, second-source-fetch envelope and download overhead. TypeScript and whitespace passed; final preservation check is recorded at handoff.
- **Passed:** final disposable SQL gate **22/22**, including byte-identical archive replay, ownership, fencing, row-lock lease expiry, cleanup references, expired-proof refusal, quota rollback, malformed metadata outside the guest bucket, combined monthly processing egress, download overhead and per-session download limit. [SQL evidence](guest-postgres-budget-results-2026-10-13.json). This uses a plainly labeled empty Storage metadata stub and the existing image bootstrap identity; it is not PostgREST or hosted owner-permission evidence.
- **Passed:** five positive local Edge cases plus intentional CPU-control termination. The final admission-aware probe recorded CPU 221/106/119/625/17 ms; maximum sampled heap plus external memory was about 126.6 MB in the padded fixture case. [Edge evidence](guest-admission-edge-results-2026-10-13.json). These are samples, not measured peak memory; Storage/RPC I/O and hosted source reachability were not profiled here.
- **Failed, diagnosed:** the SQL-only test initially lacked a Storage metadata table; the existing `postgres` role could not create one in the Storage schema. The harness now uses the existing `supabase_admin` identity without adding grants. A fixture gateway also incorrectly parsed SQL NULL as JSON; it now returns JSON `null`. These are harness corrections, not claims that hosted `postgres` access works.
- **Failed, corrected:** two admission-aware native replays with per-request curl container creation exceeded a fenced lease and remained running, so publication was refused. The harness now reuses one private curl helper; production lease and size limits are unchanged. [Independent helper review](review-2026-10-13-storage-helper-fable.md) passed. The final admission-aware repeat passed **8/8** using actual vendor Storage and SQL: [metered native evidence](guest-storage-metered-results-2026-10-13.json). The exact TAR remained 1,393,664 bytes with the same SHA-256. Its private ledger recorded 297 processing reservations totaling 42,334,930 bytes and one 1,459,200-byte download reservation including overhead. Measured step wall times 36.1/86.4/108.8 seconds include Docker exec overhead and do not certify hosted latency or CPU.
- **Blocked:** hosted secret-key gateway authorization, actual platform allowances, hosted migration-owner access, and a release-grade physical-orphan/late-write strategy. No hosted changes are authorized.
- **Unrun:** guest browser integration and a fresh end-to-end guest browser walkthrough; hosted SQL/Storage/auth/CPU/egress checks. Previous UI checks do not certify the new guest flow.

## Files changed in this continuation

Implementation: `src/hosted/guest-admission.mjs`, `guest-steps.mjs`, `guest-transport.mjs`, `evidence-store.mjs`; `docs/sql/trrc-guest-budget-DRAFT-not-applied.sql`.

Verification: `test/guest-admission.test.mjs`, `test/guest-transport.test.mjs`; `scripts/check-guest-storage.mjs`, `scripts/check-guest-postgres.mjs`, `scripts/probe-guest-edge.mjs`; this checkpoint, the admission/native/Edge evidence files, three independent admission/Storage reviews, the browser investigation and latest fallback pointer. Earlier unrelated uncommitted work remains intact.

RRC-05, RRC-09 and RRC-10 receive bounded evidence/export/run-preservation support. These requirements and the overall application are not accepted as complete.

## Handoff

Final TypeScript, JavaScript syntax, `git diff --check`, and preservation checks passed. `git diff --quiet -- raw artifacts runs public/artifact-integrity.json` returned zero. Default-pin SHA-256 remains `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`. All consultant sessions exited; Docker checks found no remaining test-owned Storage, PostgreSQL, Edge containers or Storage networks. No commits, pushes or deployments occurred.

Next: design and implement the explicit guest browser mode, token/reload behavior, async lookup/confirmation/advance/result handoff, guest history and verified browser-library insertion against the existing handlers. Use the Haiku matrix, preserve legacy local collection and default pins, and have Fable review the browser contract before wiring it. Give quota/unavailable states accurate presentation; `guest-http.mjs` does not yet have dedicated status mappings for the new budget codes. Browser acceptance and hosted release gates remain open. Do not enable hosted admission merely because these local tests pass.

Minor review follow-ups remain: the standalone local `checkEgress` helper does not validate a non-null download token hash (the service supplies a validated hash and SQL enforces the download owner); cleanup failure can surface as a capped-read error rather than `CLEANUP_INCOMPLETE`; the provisional metering intentionally overcharges successful writes to cover a possible internal readback. None of the independent reviews treated these as a bounded-prototype acceptance blocker. Physical-orphan/late-write safety remains a release blocker, not a minor follow-up.

## Browser mapping

[Haiku browser investigation](investigation-2026-10-13-guest-browser-haiku.md) confirms that the current browser still calls the legacy lookup/collect endpoints. Guest request bodies, asynchronous status handling, result handoff and private saved versions need explicit integration; the existing default pin and public registry must remain separate. No browser guest integration is claimed in this continuation.

## Remaining release gaps

Hosted secret-key authentication and PostgREST behavior; authoritative Free-plan allowance/headroom; bounded processing and download accounting; late-write fencing and orphan cleanup; guest browser integration and fresh end-to-end browser verification. Existing local Edge measurements are not hosted peak-memory or Storage-I/O measurements. No full application acceptance is claimed.
