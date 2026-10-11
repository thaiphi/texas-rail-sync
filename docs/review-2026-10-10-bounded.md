# Bounded feature independent review — 2026-10-10

Reviewer: GPT-6 Astra high. Final bounded-feature verdict: **PASS at the final frozen source hashes**. All backend, API, UI-state, archive and publisher-HTML findings below were fixed and independently retested. No production source edits or live collection, browser acceptance, consumer import or repin were performed by this reviewer. This is not full-project, statewide-coverage or deployment acceptance.

## Final whole-feature gate

Isolated command: `node --test test/*.test.mjs` in `tmp/bounded-contract-review/feature-final-snapshot/` — **PASS 107/107**, comprising 89 production and 18 reviewer tests; zero failures or skipped tests. Log: `tmp/bounded-contract-review/feature-final-full-host.log`. All test writes stayed in reviewer scratch. Exact hashes for all 44 production files under src/public/scripts/test are recorded in `tmp/bounded-contract-review/feature-final-reviewed-hashes.json`; every reviewed snapshot hash matched the current frozen production file in the final comparison.

The final suite covers the backend evidence/classification failures, original byte-identical legacy rebuild, API origin/host/port/body/concurrency boundaries, pinned version verification, stale UI clearing, empty-history labeling, registry refresh race, typed month rejection, complete TAR checksums/bytes, corruption rejection and actual new-version offline replay. The unchanged reviewer publisher-HTML test now passes: preserved artifact HTML is served as inert text/plain with nosniff, while source bytes and the application entrypoint remain correct. Worker `test/source-html.test.mjs` additionally covers both publisher HTML files, attachment downloads and HEAD.

No remaining finding at the recorded hashes. Actual browser behavior, live acquisition, consumer-runtime verification and preservation of original/consumer files remain Main-owned gates; inspected Main evidence is attributed below, not claimed as independently executed. No test of deployment, statewide coverage or Analytics import was performed.

## Final backend/API checkpoint

Exact final reviewed hashes: `tmp/bounded-contract-review/backend-final-reviewed-hashes.json`. Final isolated source: `tmp/bounded-contract-review/backend-final-snapshot/`. Earlier snapshots/hashes/logs remain historical evidence.

Independent host command:

`node --test test/lookup.test.mjs test/bounded-collection.test.mjs test/reviewer-adversarial.test.mjs test/bounded-server.test.mjs test/server.test.mjs test/reviewer-api.test.mjs`

**PASS 24/24**; log `tmp/bounded-contract-review/backend-api-final-host.log`. This includes the unchanged original five reviewer tests, two expanded evidence tests, additional worker fixture preflight/caller-mode tests, origin/host/port checks, chunked body cap, concurrency, structured failure, error redaction and byte-identical legacy rebuild. Fixture evidence now survives early/malformed acquisition failures and caller-mode conflicts; persisted selection fields are mandatory; all four original findings are closed.

Expanded findings, also closed by this checkpoint:

- Fixture selection plus caller `testFixture:false` entered actual failed history before the acquisition guard classified source evidence.
- A failed acquisition marker could short-circuit lookup fixture classification.
- Missing persisted ordinal/hash fields were still accepted after contradictory ordinal was rejected.
- Missing lookup returned an absolute filesystem path in an API error. Unexpected filesystem diagnostics are now redacted.

Version listing inspected at `scripts/serve.mjs`: available new versions require successful public run evidence and a version-pins.json hash matching that export event. GET does not recompute replacement manifest/payload pins from current artifact files. Pin creation inspected in `src/pipeline.mjs` occurs before immutable publication; subsequent browser verification must use these retained pins. No separate versions module exists or was assumed.

Broader isolated backend regression command: `node --test test/acquisition.test.mjs test/normalize.test.mjs test/provenance.test.mjs test/run-events.test.mjs test/history.test.mjs test/validation.test.mjs test/versioning.test.mjs` — initial **59/60**, one scratch setup failure (`ENOENT`, missing copied `runs` directory at validation.test.mjs:74). Restoring run fixtures encountered an existing-directory Copy-Item warning; the isolated directory then contained the required records. Targeted `node --test test/validation.test.mjs` **PASS 22/22**. Logs: `backend-regression-host.log`, `backend-validation-host.log`. The initial setup failure is not represented as a clean full-suite pass.

No remaining backend/API finding at these hashes. UI state transitions, actual browser actions, live proof and consumer execution remain separate Main-owned gates; this is not whole-feature or project acceptance.

## Whole-feature findings — closed

The connected app review reproduced three UI state issues using the actual app.js with a small deterministic DOM harness (not a browser acceptance claim):

1. **P2, now retested closed:** a failed version switch left previous identity, scope, quality JSON and dictionary visible. `clearDatasetEvidence` now clears the complete dataset projection before verification.
2. **P2, now retested closed:** successful selected-UIC queries with zero reports were labeled unacquired in the badge/table. Shared `historyState` now distinguishes zero returned from history not acquired.
3. **P2, retested closed:** registry refresh during an outstanding version load reset the selector to the default because data was null; the pending load subsequently rendered a different version. Explicit requestedVersionId and latest registry-request checks now retain selector/display agreement.
4. **P2, retested closed:** array month values passed regex coercion and constructed official queries before failing later. The bounded-scope contract now requires strings before query construction. Reviewer cases cover arrays, objects, null, numbers and booleans in either month position.
5. **P2, retested closed:** preserved publisher HTML was executable in the loopback write-API origin. Artifact .html/.htm responses now use text/plain plus nosniff without changing source bytes; ordinary app HTML remains text/html.

Tests/logs: `feature-snapshot/test/reviewer-ui-state.test.mjs`, `ui-state-expanded.log`; extracted-helper dependency wiring with unchanged assertions in `feature-final-snapshot/test/reviewer-ui-state.test.mjs`, `ui-fixes-review.log` (2/3 PASS before the registry-race fix).

Final UI/month focused command: `node --test test/reviewer-ui-state.test.mjs test/reviewer-month-types.test.mjs test/version-race.test.mjs test/lookup.test.mjs` — **PASS 8/8**, log `ui-month-final.log`. All of these and the publisher-HTML regression are included in the final 107/107 suite above.

Archive independent gate **PASS 5/5**: `node --test test/version-archive.test.mjs test/reviewer-archive.test.mjs`, log `archive-review-host.log`. Approval review initially timed out without launching the command; the permitted retry ran successfully. The actual October 10 public version's TAR contains all 28 files byte-identically, has valid TAR checksums, and supports matching HEAD length/no body. Changed raw-source bytes, changed publication pins and malformed IDs are refused; GET does not create replacement trust pins. Independently rebuilt all 27 generated contract/source files from the downloaded-version source evidence and reconciled January/February 2024 and April 2026 anchors. This review used isolated copies of the actual artifact, not fresh live acquisition.

Main's `new-version-proof.json` and `feature-preservation.json` were inspected read-only: actual consumer verifier acceptance, four anchors and unchanged 56 original/14 consumer files are Main-provided evidence. No reviewer browser or consumer-import acceptance is inferred from these records.

## Reviewed snapshot

Exact source/test hashes are recorded in `tmp/bounded-contract-review/backend-reviewed-hashes.json`. Immutable review copies are under `tmp/bounded-contract-review/backend-snapshot/`. Reviewed: sources, lookup, acquisition, artifact, pipeline, normalization, existing run/quality helpers, lookup tests and bounded-collection tests. Subsequent source changes require delta review against those hashes.

## Initial findings — historical, now closed

1. **P1: Lookup fixture provenance can enter actual failed-run history.** `src/artifact.mjs:47–48` rejects fixture lookup evidence conflicting with false acquisition classifications, but its catch at line 64 considers only acquisition and seven collection sidecars. Lookup fixture evidence is lost; `src/pipeline.mjs:75` persists the resulting failed run with `testFixture:false`. Repro: create a fixture v2 snapshot, change acquisition and collection sidecars to false while retaining fixture lookup evidence, then offline-export without caller fixture mode. The failed run is written to actual history. Fixture evidence must be accumulated from lookup markers/sidecars even when lookup validation fails.

2. **P2: Offline v2 replay reports v1 execution versions.** `src/pipeline.mjs:42` initializes the recorder with v1 versions before loading scope. A successful v2 replay returns manifest transformation `rrc-odp-v2.0.0` but run transformation `rrc-odp-v1.0.0`. Set truthful pipeline/transformation versions from the validated snapshot while retaining truthful load/failure events.

3. **P2: Failed v2 acquisition loses its requested scope.** `src/acquisition.mjs:57` overwrites the running v2 acquisition marker with schemaVersion 1 and no scope/targets. A failure on the first HTTP response loses the requested reporting window and complete target list. Preserve immutable scope/version/targets in the terminal failed marker.

4. **P2: Contradictory selection ordinal is accepted and exported.** `src/lookup.mjs:51–54` selects by sourceRecordKey but never validates the persisted ordinal; `src/artifact.mjs:92` publishes the unchanged selection object. Changing selection.json ordinal to 99 while sourceRecordKey remains lookup:1 still passes loadSnapshot. Validate all required persisted selection fields, including exact ordinal and mandatory snapshot hash, against the selected lookup row.

## Gates

Command in isolated review snapshot: `node --test test/lookup.test.mjs test/bounded-collection.test.mjs test/reviewer-adversarial.test.mjs`.

- Sandbox attempt: **COULD NOT COMPLETE** acquisition-backed checks because Windows realpath returned EPERM. Six tests passed; seven failed due to the environmental block or its downstream missing files. This is not a source-contract verdict.
- Approved host rerun: **FAIL, 9/13 passed, 4/13 failed**. All eight implementation tests passed. Additional legacy exact-byte rebuild passed. Four adversarial tests reproduced the findings above.
- Host log: `tmp/bounded-contract-review/backend-tests-host.log`.
- Adversarial test source: `tmp/bounded-contract-review/backend-snapshot/test/reviewer-adversarial.test.mjs`.

Failure evidence:

```text
offline replay: actual 'rrc-odp-v1.0.0', expected 'rrc-odp-v2.0.0'
failed acquisition marker: actual schemaVersion 1, expected 2
selection ordinal: Missing expected rejection
lookup fixture provenance: false !== true
tests 13; pass 9; fail 4
```

No full suite, API security, browser interaction, live official acquisition, or consumer import was executed in this checkpoint. Original raw sources, published artifacts, actual history and consumer pins were only read; test writes stayed inside reviewer scratch.
