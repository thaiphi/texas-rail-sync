# Independent integrity review — October 10, 2026

## Diagnostic checkpoint — 11:40 UTC

**Verdict: NEEDS CHANGES.** All three reported integrity issues independently reproduce. This checkpoint reviews the before-fix evidence; final review must use a freshly hashed copy after the sole production writer freezes changes. The task started at 11:34:45 UTC and retains its hard stop of 12:34:45 UTC.

Scope: RRC-03/04/05/09/10, fixture classification/history segregation, successful normalization output evidence, and direct artifact source/normalization integrity. Owning AGENTS, README, SPEC, SOURCE_PROOF, GATES, requirement tracker, shared delegation workflow, ADR 002, producer/recorder/run validator and relevant provenance/source contracts were read. Only this report and `tmp/integrity-independent-review/**` were written. No production, sibling, original data/history/pins, Git, deployment, permission settings or live collection changes were made. Injected-response probes use preserved bytes and remain in the isolated review copy.

### Evidence identity

`tmp/integrity-independent-review/before` was copied from Main's retained before-fix snapshot. At 11:39:49 UTC its 40 baseline source/test/script/public JavaScript files matched `tmp/integrity-fix-2026-10-10/baseline.json` exactly. All 118 protected original files and 14 consumer files retain baseline hashes, and raw/artifact/run/lookup/collected-source membership is unchanged. Evidence: `before-evidence.json`. The existing six-test `tmp/independent-validation-review/adversarial.test.mjs` was copied unchanged into the review snapshot and executed there.

### Important findings

**I1 — Fixture failures occur before authoritative classification.** Before-fix `src/pipeline.mjs:48`–`:55` validates the artifact ID, loads the expected manifest and checks its pin before loading/classifying the source. Failure reaches `:80` with `testFixture:false` and may persist fixture-derived failures as actual history. Independently reproduced for wrong existing manifest pin, missing requested manifest and invalid artifact ID. A shallow promoted `providedSnapshot` with a load-started non-fixture recorder plus pin failure also loses authoritative fixture provenance. Corrupt/failed markers with surviving fixture sidecars and corrupt-body failure already pass in this snapshot; those earlier fixes must remain intact. Correctness requires classification from preserved/private loaded evidence before all relevant early errors, not trusting the mutable supplied snapshot flag. All failed fixture probes require both a fixture-tagged returned record and no actual-history entries.

**I2 — Successful normalization output evidence is optional and hashes are unchecked.** Before-fix `public/workflow.js:47` iterates `evidence.outputs ?? []`, only checking counts for recognized names. Missing, empty or null output lists, missing/short/nonhex/numeric hashes, duplicated or unrecognized output names, and an extra output all pass incorrectly. Invalid/null/negative counts for recognized entries already reject. Require exactly the two named normalization outputs with valid hashes and matching nonnegative integer row counts; order need not be fixed. This is evidence validation, not a claim that a standalone run record can authenticate an arbitrary well-formed replacement hash without its output bytes.

**I3 — Direct artifact construction checks internal QC agreement but not source fidelity.** Before-fix `src/artifact.mjs:80`–`:83` accepts normalized values whose counts/QC agree internally while their source identities or values differ from the loaded raw rows. The unchanged reproduction substitutes report ID, barrels and a mathematically consistent rate. Expanded probes independently accept wrongly substituted source API, parent key, source row key with matching disposition, reported pressure, calendar days, derived-only rate, permit pressure, QC scope prose and row order. Mutating the snapshot's parsed rows/IDs and normalizing that altered projection also passes; a shallow fixture-to-public override passes direct construction. The private loaded source evidence must bind original IDs/ordinals, source/derived values, scope and QC before export. Restrictive public-to-fixture override remains supported. Building from private canonical copies should also prevent caller mutation across the builder's asynchronous metadata reads; that specific timing case remains for post-freeze review.

Critical findings: none identified. These three Important findings were relayed promptly to Main and the sole writer. Earlier five-defect PASS reports do not waive these newly scoped source/evidence failures.

### Before-fix gates

Test working directory: `tmp/integrity-independent-review/before`.

| Exact command | Result |
|---|---|
| `node --test tmp/independent-validation-review/adversarial.test.mjs` — restricted sandbox | FAILED: 2 pass / 4 fail. Fixture setup COULD NOT RUN successfully because of EPERM realpath; two pure evidence/source rejection assertions also fail. `before-sandbox.log`. |
| Same command — ordinary auto-reviewed host execution | FAILED as reproduced: 3 pass / 3 fail. Pin-failure fixture classification, absent normalization outputs and direct source substitution fail; existing quarantine/corrupt-marker checks pass. `before-host.log`. |
| `node --test test/integrity-independent.test.mjs` — ordinary auto-reviewed host execution | FAILED as reproduced: 41 reported tests including parent subtest groups, 8 pass / 33 fail. Exact variants above; `expanded-before-host.log`. Test totals are not defect acceptance counts. |
| `node tmp/integrity-independent-review/check-evidence.mjs before` — owning root | PASS: 40 before-fix code hashes, 118 protected files and 14 consumer files, plus protected membership. |

Ordinary host execution was used only after the sandbox's known realpath block and was approved by tool auto-review. No filesystem/security permission setting was altered or bypassed; all writes stayed inside the assigned review snapshot.

Last ten lines of the unchanged reproduction failure:

```text
      at async TestContext.<anonymous> (file:///C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer/tmp/integrity-independent-review/before/tmp/independent-validation-review/adversarial.test.mjs:44:2)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /quality|source|identity|normaliz/i,
    operator: 'rejects',
    diff: 'simple'
  }
```

Last ten lines of the expanded failure:

```text
      at async TestContext.<anonymous> (file:///C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer/tmp/integrity-independent-review/before/test/integrity-independent.test.mjs:45:157)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /provenance|classification|source/i,
    operator: 'rejects',
    diff: 'simple'
  }
```

### Retained compatibility and deferred final gates

The original thirteen-file artifact rebuild remains byte-identical. Restrictive public-to-fixture construction remains fixture-labeled, and surviving sidecar fixture evidence survives malformed acquisition markers, failed markers and malformed source bodies. All assertions, before-fix logs and source hashes are retained unchanged for the final review.

Final full suite, legacy/v2 publication replay, exact frozen source coverage, consumer verification, asynchronous mutation defense and post-fix adversarial acceptance are **NOT YET REVIEWED** at this checkpoint. No whole-project, website visual, live source, deployment or new feature acceptance is claimed. No generic authenticity against an actor rewriting every local source/sidecar, full UI audit or unrelated workflow redesign is requested by these probes.

**Diagnostic assignment complete; slot released.** Reactivate after production freeze with the unchanged probes and a fresh faithful snapshot; deadline remains 12:34:45 UTC.

## Final frozen-source review — 11:48 UTC

**Current verdict: PASS for the three reported integrity defects.** The earlier NEEDS CHANGES result remains the before-fix record. No Critical, Important or Minor finding remains within this bounded review. This is not whole-project, deployment, live-source or new-feature acceptance.

### Frozen source coverage

The fresh review copy is `tmp/integrity-independent-review/final`. At 11:46:52 UTC, every current original JavaScript file under src/public/scripts/test matched the copy: **41 files**, including the newly added `test/integrity-defects.test.mjs`, not merely the 40-file old baseline. Exact per-file hashes are recorded in `tmp/integrity-independent-review/final-evidence.json`. The unchanged supplied six-test reproduction and expanded 41-test probe files match their before-fix copies byte-for-byte.

The five changed implementation/test file hashes reviewed are:

| File | SHA256 |
|---|---|
| `src/artifact.mjs` | `385eb8a83fb072721847488d2588df448d8349e20d7be06d5e44782eb5a464f1` |
| `src/pipeline.mjs` | `f09de82dea886fc7903cd0a8113201e0603ef5f81ff875e8598cae52de480d7d` |
| `public/workflow.js` | `58dc6aa5585fa6927d582b128eaf1e8ebfbaf8b89ba097e852ff89d98077e0d3` |
| `test/integrity-defects.test.mjs` | `71e564ce7640fdbf73f31226ca9d6ea3d01b7661fdfbf6c04a8c99c500add93e` |
| `test/run-events.test.mjs` | `81dcd3e997387b273c1fd013b7e982ccd0a41a4fd0879a93128b17a0473aeb29` |

### Finding resolutions

| Finding | Result | Source and independently established behavior |
|---|---|---|
| I1 fixture classification on early failure | PASS | `src/artifact.mjs:16` obtains authoritative loaded provenance; `src/pipeline.mjs:53` classifies before artifact/manifest/pin checks. Loaded fixture evidence wins over shallow promotion. Invalid ID, missing manifest, wrong pin, failed/corrupt markers and corrupt bodies retain fixture-tagged failed records and create no actual-history entries. A provided snapshot with completed load retains that completed event and fails the following stage at `src/pipeline.mjs:86`. |
| I2 normalization output evidence | PASS | `public/workflow.js:47`–`:49` requires exactly the named inventory/monthly outputs, each with SHA256 syntax and a nonnegative integer count matching QC. Missing/empty/null outputs, absent/malformed/numeric hashes, duplicate/unrecognized/extra entries and bad counts reject. Reversed output order remains accepted. |
| I3 source-bound direct artifact construction | PASS | `src/artifact.mjs:15`/`:84` retains private copied load evidence under its read capability. `:96`–`:104` rejects unregistered callbacks, changed source projections/IDs/scope/metadata/buffers/classification, and supplied normalization differing from canonical source normalization. Original identities, observed values, derived values, QC text/flags and row order cannot be substituted while retaining counts. `:107`–`:108` uses private copies for serialization after validation, so asynchronous caller mutation cannot change verified output. Restrictive fixture override remains supported; promotion rejects. |

The private WeakMap/read capability is process-local source-loading evidence, not a remote signature or general security boundary against arbitrary code executing inside the process. Its copies are isolated from the public snapshot projection and cached buffers, and its reader returns a fresh buffer. This review verified those concrete properties rather than treating matching counts or hashes of caller-supplied values as source fidelity.

`test/run-events.test.mjs` changes are confined to supplying real empty-array SHA256/count outputs for two handwritten empty-QC recorder examples. Their event/state/evidence assertions remain. The new production test file covers early fixture errors, output shape/hash/name/counts, source/value substitutions, proof mutations, restrictive classification, provided-snapshot early errors, completed-load preservation, asynchronous mutation and both immutable public versions.

### Final independent gates

All test writes/publication replay occurred in the review copy. These are this reviewer's actual executions, not substituted worker/Main suite totals.

| Exact command | Result |
|---|---|
| `node --test tmp/independent-validation-review/adversarial.test.mjs test/integrity-independent.test.mjs` from final copy, ordinary auto-reviewed host execution | **PASS 47/47**, unchanged assertions; `final-adversarial.log`. This closes the original 3/6 and expanded 8/41 failures. |
| Full production suite command below, final copy, ordinary auto-reviewed host execution | **PASS 103/103**; `final-production-suite.log`. Includes the 14 new production regressions and all previous acquisition, browser-state, source, server, history, versioning and validation tests. |
| `node tmp/integrity-independent-review/check-evidence.mjs final` from owning root | **PASS**: 41 current source/test hashes match; 118 protected original files and 14 consumer files unchanged; all protected data/history membership unchanged. `final-evidence.json`. |
| `node tmp/integrity-independent-review/final-checks.mjs` from owning root, ordinary auto-reviewed host execution | **PASS**: both public versions build and replay without changing bytes; all 28 original run records validate; private serialization survives caller/cache-buffer mutation; unregistered read callback rejects; both versions pass actual Analytics validators. `final-checks.json`/`.log`. |
| `node --check <path>` for every one of the 41 exact paths listed in `final-evidence.json` | **PASS 41/41**. |
| SHA256 comparison of both independent probe files in before/final copies | **PASS**, assertions unchanged. |

Full production command (the actual invocation supplied this exact file list through a PowerShell array):

```powershell
node --test test/acquisition.test.mjs test/bounded-collection.test.mjs test/bounded-server.test.mjs test/browser-artifact.test.mjs test/dataset-state.test.mjs test/history.test.mjs test/inspection.test.mjs test/integrity-defects.test.mjs test/lookup.test.mjs test/normalize.test.mjs test/presentation.test.mjs test/provenance.test.mjs test/run-events.test.mjs test/server.test.mjs test/source-html.test.mjs test/validation.test.mjs test/version-archive.test.mjs test/version-race.test.mjs test/version-selection.test.mjs test/versioning.test.mjs
```

No final gate failed. The initial sandbox EPERM failures remain recorded as environment failures above; successful normal-host checks do not retroactively turn those attempts into passes. No permission/security setting was changed.

### Replay and asynchronous evidence

- Legacy `rrc-2026-10-09-uic000020838-v1`: all **13 builder/published files** match; replay returns `verified_existing_bytes`; Analytics verifies its 11 inventoried contract/source entries.
- V2 `rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0`: all **27 builder files** match; the published directory retains **28 files** including `version-pins.json`; replay returns `verified_existing_bytes`; Analytics verifies its 33 manifest entries (overlapping entries are not unique-file counts).
- All **28 original run records** match original bytes and remain accepted by `workflowView`. Test-created history in the isolated copy is not counted as original history.
- The independent asynchronous probe starts `buildArtifact`, then mutates the supplied normalized barrels/rate/QC, source URL, scope/classification, cached metadata buffer, raw monthly buffer and PDF source buffer before awaiting completion. All 13 returned original artifact files remain byte-identical. Replacing the read callback with a wrapper is rejected because it is not a registered load capability.
- Original/consumer pins and files remain unchanged. Validator acceptance is not consumer adoption or acknowledgement; no consumer import, repin or sibling write occurred.

### Final limits and completion

No unresolved blocker remains for these three repairs at the recorded hashes. This review does not reaccept every requirement previously claimed by the application. No fresh browser screenshots/manual accessibility/download inspection, live public collection, network access-policy review, statewide work, deployment or arbitrary hostile in-process code audit was performed. Hash-syntax validation of standalone event evidence cannot prove an arbitrary replacement hash's content without the referenced bytes; source-bound builder/replay checks provide the tested value-fidelity gate. Persisted source evidence is not a cryptographic attestation from its publisher.

**Final assignment complete; slot released.** Main retains final integration/runtime and preservation checks. The unchanged 12:34:45 UTC deadline was not extended; review completed early.
