# Explorer producer checkpoint — October 11

Owner-authorized bounded coordinated task began01:36:31UTC; fixed deadline02:34:58UTC. Explorer owns only this repository. The exact agreed browser contract is [ADR003](adr/003-local-analytics-browser-handoff.md); Analytics receiver and browser walkthrough are separately owned.

## Implementation

- `public/analytics-handoff.js`: fixed local origins, strict bound-window messages/UUIDs, fresh transfer/receiver binding, whole verified TAR offer, computed package hash, copied transferable bytes, streaming caps, finite-state preview/adoption, timeout/cancellation/closure/generation protection.
- `public/app.js`, `public/index.html`, `public/dataset-state.js`: Downloads action with explicit whole-version scope, cancel/status/file fallback; no transfer under failed/unverified dataset; synchronous cancellation on navigation/version change/download/pagehide. Original pinned version passes full enriched metadata without changing pins.
- `test/analytics-handoff.test.mjs`: transport/security/lifecycle regressions. `test/navigation-redesign.test.mjs`: whole-version selection despite filters, failed verification, browser-cache retry and file fallback. `test/version-race.test.mjs`: mock controller adapter preserves existing race assertion.
- Entry for coordinated real click: **My datasets → Open dataset → Downloads → Use in Injection Analytics**. Exact link for original example: `http://127.0.0.1:4391/#dataset/rrc-2026-10-09-uic000020838-v1/downloads`.

Main owns integration/UI/docs. Original implementer `handoff_producer` Sol/high owns controller/transport tests. Existing independent `example_access_review` Astra/high is read only. No overlapping writes, helper workers, Analytics writes, live acquisition, commits/pushes/deployment or permissions/authentication changes.

## Review repairs and regression evidence

Meaningful RED/GREEN evidence includes missing UI action/failed-version disable, original pin classification metadata, missing offered-package request timeout, bound malformed envelopes, coercible UUID/type arrays, and browser back/forward-cache controller destruction. Independent review reproduced cache restoration and coercible primitive fields; implementers repaired them. Cancellation wording was corrected to avoid guaranteeing a receiver rollback after confirmation. Initial worker absent-module failure was a loader error, not a behavioral regression; it is not presented as meaningful TDD evidence.

Current final gate counts and independent disposition will be appended below. An intermediate combined test failure exposed a nondeterministic20-tick digest wait in the test harness; it is being replaced by completion-based bounded waiting, not ignored or retried without diagnosis.

### Producer verification checkpoint

- `node --test test/analytics-handoff.test.mjs test/navigation-redesign.test.mjs test/dataset-state.test.mjs test/version-race.test.mjs test/inspection.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/version-selection.test.mjs` — **PASS55/55**, including17 transport tests, after the fixed-tick harness was replaced by observed-state promises with five-second real deadlines. Previous53/54 failure is retained above rather than hidden.
- `node --check` on every public JavaScript module — PASS. No TypeScript/lint gate is configured for this dependency-free repo.
- `node tmp/navigation-redesign-2026-10-10/preserve.mjs` — PASS: all166 protected source/artifact/run/pin files and14 consumer evidence/pin files unchanged; matching membership and hashes. Current evidence copied to `tmp/analytics-handoff-2026-10-11/preserved.json`. Consumer evidence was read only; Analytics source work belongs to its own owner.
- Independent Astra/high final production review: PASS45/45 focused tests at that checkpoint; independent post-delivery array-type probe rejects immediately and leaves zero timers/listeners. Independent file fallback/version-switch probe and back-cache retry/neutral cancellation wording inspection pass. Subsequent changes only improve the test wait harness and add one producer regression; production reviewed source is unchanged. No remaining demonstrated producer blocker for the current valid versions.
- Real browser two-window handoff and download lineage are **UNRUN HERE**, intentionally coordinator-owned. Source/tab inventory is evidence of4391 only, not successful integration. Complete archive/full-suite checks are **BLOCKED/UNVERIFIED**, not passes.

Producer implementation is ready for coordinated testing at the entry above. The fixed02:34:58UTC stop remains in force; returning this checkpoint does not reset it or declare feature acceptance.

## Pending acceptance and dependencies

- Coordinator/Analytics owns real browser preview/adoption, cancellation/receiver reload, existing-case preservation and exported lineage evidence. Explorer has deliberately not competed for the other application's browser tab.
- Actual Explorer browser inventory confirms4391; shell HEAD checks for4391/4290 failed with socket-access permission errors. No escalation/alternate denied-access route attempted. Receiver4290 verification remains with Analytics.
- Full suite/archive check remains blocked by sandbox realpath permissions. Independent archive test output: `EPERM: operation not permitted, realpath ...\artifacts\rrc-2026-10-09-uic000020838-v1` at `src/versionArchive.mjs:9`. Full-suite acceptance after these changes is unverified.
- Scope projection for quarantined invalid UIC/date values requires coordinator alignment. Current producer refuses such transfers before opening Analytics and offers file fallback; it does not omit or repair those records. Three current public versions have valid scope.
- Receiver lifecycle enforcement is required for cross-origin navigation after preview; producer binding detects a fresh receiver document/closure but cannot independently inspect arbitrary receiver navigation.
- This checkpoint is not whole-project acceptance, deployment or consumer engineering eligibility.
