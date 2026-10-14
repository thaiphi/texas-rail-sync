# Acquisition-evidence continuation checkpoint

Owner resumed work after the prior safe pause. This bounded session began October 12 at 22:45:31 UTC (17:45 CDT); its one-hour ceiling is 23:45:31 UTC. Supabase Free only. No cloud write, deployment, billing, permission, Git or live acquisition action is authorized in this checkpoint. Phi Analytics remains untouched.

## Assignment ledger

- Main: integration, tests, local Edge harness, browser and documentation. No Git writes.
- Opus 5.5/high: original implementer, read-only proposal limited to `src/exportCore.mjs` and `test/export-continuation.test.mjs`. Completed and CLI exited. Main applied tests first, then the proposed implementation.
- Fable 5.1/high: original independent reviewer, read-only D1/core/test/evidence review. Completed with narrow REVISE findings B1/B2, then CLI exited. Original Opus proposed the fixes; Main reproduced both failures, applied the guards and ran final gates. No later reviewer PASS is claimed.
- At most two external assignments, no overlapping writers. Nexus is solely the already-trusted CLI startup directory; no Nexus implementation inspected or changed.

## Checks so far

- Four D1 tests reproduced missing acquisition-evidence behavior before implementation (10 pass, 4 fail). Final targeted continuation suite: 14/14 pass. Explicit v2 altered-source hash refusal passed as an additional regression check; it was not described as a new red test.
- Full isolated direct-Node suite after initial D1: 218/218 pass. After review fixes: **220/220 pass**, zero failures/skips (`tmp/acquisition-final-full.log`). Final continuation suite: **16/16 pass** (`tmp/acquisition-omission-green.log`).
- Direct TypeScript compiler, `git diff --check`, and tracked preserved `raw`, `artifacts`, `runs`, and integrity-pin diff checks: exit 0.
- Existing browser walkthrough: 21/21 pass (`tmp/browser-continuation.log`, screenshots under `screenshots-2026-10-12-backup/`). Ephemeral local read-only server, Chrome via installed Playwright, desktop 1440×1000 and narrow width 390. No private profile, sign-in, live collection or cloud verification.
- Actual cached Edge production modules, no Buffer shim: prepare and finalize ran in separate force-created user workers with a JSON-roundtrip test handoff for all three preserved versions. Same run identity/prior five events retained, one final event, exact files/TARs. Saved in `guest-edge-continuation-results-2026-10-12.json` and `guest-edge-continuation-runtime-2026-10-12.json`.
- Updated D1 path also ran in separate actual workers after final review fixes: replayed the seven preserved public source request/output references, verified and retained all seven across finalization, same exact exports for three versions. This is evidence replay, not new live acquisition. Results: `guest-edge-acquisition-continuation-results-2026-10-12.json`; runtime: `guest-edge-acquisition-continuation-runtime-2026-10-12.json`. Six worker shutdown CPU times were 108/70/100/71/119/67 ms, captured total memory 24.6–44.3 MB, no limit exceedance. These are captured shutdown values, not peak RSS or hosted guarantees.

## Scope and remaining gates

`prepareArtifactFromReader` now requires trusted internal acquisition evidence for every live collection, copies it before awaits, and checks requests/outputs against loaded source URLs/status/hash/size/path. Supplied recorder mode takes precedence over the argument. Missing evidence fails before reads or record mutation. Finalize reconstructs the source brand, requires both acquisition arrays for a live journal and neither for an offline journal, then revalidates evidence before commit. Offline exports retain their existing shape and bytes. Future C1–C7 writers must record output references exactly as `${sourceReference}/${name}`; this verified path is an internal server contract, never client authorization.

Independent review: `review-2026-10-12-acquisition-continuation-fable.md`. B1 fresh live preparation without evidence and B2 stripped live-journal acquisition keys both reproduced missing rejections before guards, then passed after guards (`tmp/acquisition-omission-red.log`, `tmp/acquisition-omission-green.log`). Partial live arrays and offline arrays are also refused, preserving prior successes and zero commits. This closes the bounded code findings through RED→GREEN and full gates; it does not turn the review's REVISE into a newly issued reviewer PASS. The review's low note about offline-only Edge probes describes the evidence available when that review began; the separately saved final live-evidence probes above supersede it. Deferred low: non-cloneable trusted input raises uncoded DataCloneError; it fails closed before mutation.

Separate-isolate local tests do not establish HTTP journal ownership, fencing, Storage/SQL transactionality, actual source-fetch parity, hosted compatibility or production memory headroom. Guest job service, quota/retention enforcement and browser saving remain unimplemented. Hosted profiling is unrun under the no-deployment constraint. No production admission threshold is selected.

## Final gate classification and handoff

- **Passed:** 220 full tests, 16 continuation tests, TypeScript, whitespace, tracked source/artifact/run/pin preservation, 21 existing browser checks, separate-isolate offline and acquisition-evidence continuation on three versions, exact TAR/file comparisons.
- **Failed during development, resolved:** four initial D1 tests and both review omission tests. No final executable failure remains in the checks run.
- **Blocked acceptance:** hosted feasibility remains unverified under the no-deployment constraint; complete guest implementation is gated on that evidence and real acquisition/Storage/SQL adapter parity.
- **Unrun:** hosted source fetch/abort/redirect/stream parity, Storage publisher and owned/fenced SQL journals, guest quotas/retention/admission cap, guest browser saving/recovery, receiver import and hosted CPU/memory profiling. No guest-release acceptance.

Pins remain SHA-256 `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`. Prior untracked runs remain preserved; tracked-data diff does not assert that the entire working tree was initially clean. Only source changes in this session: `src/exportCore.mjs`, `test/export-continuation.test.mjs`. Probe harness edits stayed in ignored `tmp/`; evidence/review/checkpoint documents were added. Test-owned container `trrc-edge-continuation-20261012` stopped and removed. All Claude assignments closed. No commits/pushes/deployment or permission/billing changes.

Next smallest step: extract a bounded one-source acquisition reader/step adapter using existing stream/abort/redirect and fixture rules, verify deterministic Node-versus-Edge parity, then profile verified Storage I/O and journal integration before implementing guest endpoints. Do not apply migrations or deploy to manufacture a passed gate.
