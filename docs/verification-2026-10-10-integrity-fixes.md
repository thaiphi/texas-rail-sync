# Three integrity findings — October 10, 2026

Status: PASS for the three confirmed findings, independently reviewed at frozen source hashes. Completed early at 11:50 UTC. This is a repair round, not authorization for additional product features or whole-project acceptance. Started 11:34:45 UTC (06:34:45 CDT); report/stop deadline remained 12:34:45 UTC. Previous round completed before this request; its timebox was not restarted while running.

## Reproduction and root causes

Both the original implementer and independent reviewer ran the six supplied adversarial cases in `tmp/independent-validation-review/adversarial.test.mjs`. Host execution reproduced exactly three failures and three passing controls:

- Fixture replay with a wrong manifest pin: pin validation precedes source classification, allowing a fixture failure into actual history.
- Successful normalization with omitted output evidence: `workflowView` checks output counts only when optional entries exist, and does not require their hashes.
- Direct `buildArtifact` substitution: counts and QC reconcile, but supplied identities, observations and derived values are not bound to the loaded source evidence.

The malformed acquisition-marker fixture control already passes and remains required. Independent before log: `tmp/integrity-independent-review/before-host.log`. Its sandbox run passed two and failed four because Windows realpath blocked fixture setup; those environmental failures are not defect reproduction or passing evidence. Standard automatically reviewed host execution is permitted; no filesystem/security permissions are changed.

## Ownership and scope

Owning verified Git root: `C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer`. Applicable requirements RRC-03/04/05/09/10 from `docs/requirements.md`. Main retains coordination, contract/integration checks and documentation. Original implementer `/root/bounded_lookup_implementation`, GPT-6.1 Sol/high, owns `src/artifact.mjs`, `src/pipeline.mjs`, `public/workflow.js` and focused regressions; existing tests may receive truthful fixture-evidence adaptations. Independent `/root/independent_validation_review`, GPT-6 Astra/high, writes only its review report and isolated scratch. No worker helpers, source edits by reviewer or overlapping writer paths. Agent status checked before both reactivations; at most two active subagents.

No UI redesign, new acquisition, replacement dataset, Analytics adoption, original source/history writes, commits, pushes, deployment or permission changes. Source fixtures retain classification and quarantine reasons. Direct Node only; no npm/npx, Vitest or Python.

## Preservation baseline

Before implementation, Main recorded every current raw/artifact/run/lookup/collection file, both browser pins and seven UI assets: **118 protected files**, plus **14 consumer artifact/pin files**. Their complete file membership and hashes are in `tmp/integrity-fix-2026-10-10/baseline.json`. Code/test hashes separately identify the allowed change set. The final check must preserve both original and newly collected versions, current history, source evidence and UI, not just the old pinned sample.

Repeatable Main gates: `node tmp/integrity-fix-2026-10-10/gates.mjs suite` (complete production suite in a faithful isolated copy, all module syntax and final hashes), and `node tmp/integrity-fix-2026-10-10/gates.mjs preserve` (every protected/consumer hash and protected membership). Logs/results stay under that new task directory, preserving previous verification evidence.

## Final checks and disposition

The original implementer froze production source before independent final review. Main and the independent reviewer each ran fresh faithful copies. All 41 current source/test JavaScript files, including the new regression file, match the reviewed hashes. Independent verdict: **PASS**, no remaining scoped finding. See [the review](review-2026-10-10-integrity-fixes.md), including its preserved before-fix failures and final coverage limits.

### Changed files and behavior

| File | Change |
|---|---|
| `src/artifact.mjs:15` | Private copied source evidence and authoritative provenance; direct construction validates all source projections and canonical normalized values, then serializes private copies across awaits. Fixture promotion and simultaneous source/value substitution reject. |
| `src/pipeline.mjs:53` | Source classification precedes parameter, manifest and pin failures. Fixtures stay excluded from actual history; a provided completed load remains truthfully recorded on later failure. |
| `public/workflow.js:47` | Requires exactly the two named normalization outputs, valid SHA256 syntax and counts matching QC. Missing, malformed, duplicate, unknown and extra output evidence rejects. |
| `test/integrity-defects.test.mjs` | Fourteen new regression tests covering the three findings and related early-failure, mutation and byte-compatibility cases. |
| `test/run-events.test.mjs` | Two handwritten successful empty-output fixtures now carry the actual SHA256 of `JSON.stringify([])` and zero counts. |

Documentation changes: this packet, the independent review, README.md, GATES.md and SPEC.md. Task-local scripts/logs/snapshots are under `tmp/integrity-fix-2026-10-10/`, `tmp/integrity-defects-2026-10-10/` and `tmp/integrity-independent-review/`.

### Actual gates

| Command / action | Result |
|---|---|
| Supplied unchanged adversarial reproduction before fixes | Expected FAIL: 3/6 pass; the three requested findings fail. |
| Independent expanded probes before fixes | Expected FAIL: 8/41 pass, including parent groups. Assertions retained unchanged. |
| `node tmp/integrity-fix-2026-10-10/gates.mjs suite` | PASS **103/103** production tests and **21/21** runtime module syntax checks; `full-suite.log`, `final-code-hashes.json`. |
| Independent `node --test tmp/independent-validation-review/adversarial.test.mjs test/integrity-independent.test.mjs` in frozen copy | PASS **47/47** unchanged probes; `final-adversarial.log`. |
| Independent full production suite in frozen copy | PASS **103/103**, independently executed; exact file-list command in review, `final-production-suite.log`. |
| Independent syntax of every reviewed source/test file | PASS **41/41**. |
| `node tmp/integrity-fix-2026-10-10/replay-consumer.mjs` | PASS: legacy **13** and v2 **27** builder files byte-identical; both accepted by actual Analytics verifier; fixture rejected; all **28** existing recorded runs validate. `replay-consumer.json`. |
| Independent `node tmp/integrity-independent-review/final-checks.mjs` | PASS: both immutable publication replays return `verified_existing_bytes`; v2 retains its additional publication-pins file; asynchronous caller/cache-buffer mutation cannot change the artifact; unregistered read capability rejects. |
| `node tmp/integrity-fix-2026-10-10/gates.mjs preserve` and independent `check-evidence.mjs final` | PASS: **118** protected files and membership, plus **14** consumer files unchanged. Reviewed code hash coverage includes the new regression file. |
| `node tmp/integrity-fix-2026-10-10/runtime-smoke.mjs` | PASS at 11:48:25 UTC: preview4391 serves exact fixed workflow module, both unchanged manifest hashes, **2** versions/**28** runs; both verified TAR HEAD responses HTTP200 with attachment sizes 1,325,056 and 1,393,664 bytes. No POST/acquisition. |

Protected evidence includes all original raw/artifact/run/lookup/collection files, both browser pins and seven UI assets. Both legacy and newly collected versions remain unchanged. The legacy manifest SHA256 remains `3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f`; v2 remains `7271eb480641c0c96b843ff45357e3519235a2b1f8f9f16dcf5d8df8e25889cc`.

### Failed attempts and environmental limits

Restricted-sandbox fixture traversal failed with Windows realpath EPERM. Ordinary tool-approved host execution subsequently ran the gates; permissions/security settings were not changed. Worker first full-suite run failed two old handcrafted success fixtures because they omitted newly required hashes (100/102); adding truthful empty-array evidence resolved those failures. Main's first replay/consumer harness rejected an expected fixture-error message because its assertion pattern omitted `Explorer history is not a verified bounded artifact`; correcting that harness expectation produced PASS, with fixture classification independently asserted. These attempts are not presented as passing product gates.

The previous preview session was no longer present; no foreign process was killed. The owned local preview was started on port4391 and remains available at http://127.0.0.1:4391. It is not a deployment.

### Remaining limits

No unresolved finding remains for these three fixes at the reviewed hashes. Standalone hash-syntax checks cannot authenticate a substituted well-formed digest without its referenced bytes; canonical builder and replay checks provide the tested value-fidelity gate. Private load evidence is process-local, not a publisher signature or defense against arbitrary hostile code executing in the process.

No new public collection, consumer import/adoption, manual browser/accessibility/screenshot/save inspection or deployment was performed this repair round. Existing UI assets are byte-identical; focused running-preview HTTP checks are distinct from manual browser acceptance. No commits, pushes, source/history writes or permission changes occurred. Full-project acceptance remains excluded.
