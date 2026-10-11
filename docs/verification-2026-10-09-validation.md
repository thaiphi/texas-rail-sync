# Five validation defects — October 9, 2026 (Central)

Recorded October 10 UTC. **Implementation and focused verification complete; fresh independent review and the environment-blocked full-suite gate remain open.** This does not accept the entire project or start the next product milestone. The fixed deadline is **2026-10-10 05:24:24 UTC / October 10 12:24:24 a.m. Central**; this round finishes before it without renewing the timebox.

Final preservation check completed **2026-10-10 04:48:30 UTC**. Work stopped and reported early; no background continuation or new timebox was started.

## Scope and changed files

The authorized fixes cover canonical duplicate months, missing report IDs, invalid permit/depth values, declared source predicates and quality-count validation. Requirements: **RRC-01, RRC-03, RRC-04, RRC-10**, with completion-plan **E1/E3** and export compatibility **RRC-05** preserved.

Before editing, the allowlist was four source modules, the nonvisual workflow validator, its shared helper, focused validation tests, necessary existing run-test fixture corrections, this report, the next-milestone plan and isolated evidence under `tmp/validation-verification/`. Read owning AGENTS/README/SPEC/SOURCE_PROOF/GATES, the shared workflow, approved Explorer PRD/architecture, completion E1/E3, independent acceptance probes and the preceding fixture-provenance report. Applied systematic debugging, regression-first testing and verification-before-completion. No helper or reviewer agent was spawned.

| File | Change |
|---|---|
| `src/normalize.mjs` | Canonical year/month duplicate grouping; missing/blank report-ID flags; negative permit/depth and reversed-interval flags; scoped row validation; retained quarantine reasons/dispositions. |
| `src/sources.mjs` | Shared approved fixed scope and row-predicate checks; original official target/query strings remain equivalent. |
| `src/artifact.mjs` | Validate quality against actual normalized/source row counts; independently refuse out-of-scope raw rows with QC reasons; inventory quarantine prevents verified public-history status. Existing fixture-provenance rules preserved. |
| `src/pipeline.mjs` | Apply approved scope and retain QC evidence before a scope failure; export remains skipped on that failure. |
| `public/quality-validation.js` (new) | Pure producer/browser quality validator, shared disposition policy and object-key-order-independent report comparison. |
| `public/workflow.js` | Validate successful QC/export reports and reconcile source/output evidence counts; safe diagnostics for invalid quality and source bounds. No layout/control change. |
| `test/validation.test.mjs` (new) | Twelve regressions/integration checks, including five originally failing defect categories, preservation, direct construction, forged counts/dispositions and source/fixture compatibility. |
| `test/run-events.test.mjs` | Replace two incomplete synthetic success-count fixtures with complete, reconciled zero-row reports; successful synthetic export must carry the same report. Existing behavior assertions retained. |
| `docs/plan-bounded-well-lookup.md` (new) | Future milestone plan only; implementation, controls, endpoints and live collection remain NOT STARTED. |
| This report and `tmp/validation-verification/` | Dated evidence, faithful test copy, logs, preservation and consumer checks. |

## Before/after evidence

Initial `node --test test/validation.test.mjs` **FAILED as expected: 5 failures, 1 pass** before implementation. The compatibility rebuild was the one pass. Evidence: [before.txt](../tmp/validation-verification/before.txt). Each defect category had its own failing regression; later additions broadened coverage without replacing that initial log.

| Defect | Before | After / retained evidence |
|---|---|---|
| Duplicate months | Same exact UIC and January 2024 with `.000` and without milliseconds produced **0 quarantined**, expected 2. | Both rows retained with distinct source-row keys and `duplicate_or_revision_period`; canonical well/month grouping. Different UIC or reporting month remains distinct. Unsupported/malformed timestamps remain parse failures rather than guessed dates. |
| Missing report IDs | Absent report ID produced **0 quarantined**, expected 1. | Missing/null/empty/whitespace IDs quarantine with `invalid:source_report_id`; original raw bytes remain available and no source ID is invented. String `0007` keeps its zeros. |
| Permit/depth values | Negative permit pressure produced **0 quarantined**, expected 1. | Negative pressure/volume/top/bottom and top deeper than bottom quarantine with field-specific reasons. Normalized negative/reversed values remain retained; zero and absent numeric fields keep their separate meanings. |
| Source scope | Wrong API prefix produced **0 inventory quarantined**, expected 1. | API prefix, injection type, uncanceled/unplugged inventory predicates, exact monthly UIC and lower date bound are checked. Contradictions stay in raw/QC evidence and refuse export; direct `buildArtifact` cannot bypass checks by using unscoped normalization. |
| Quality counts | Empty/malformed successful QC evidence did not throw. | Require safe nonnegative integer counts, conservation, join/disposition totals and bounded issue counts. Producer checks actual rows and raw-source totals; successful run validation reconciles load, normalized and exported counts and reports. Forged identities/reasons also reject. |

One additional same-defect regression exposed missing producer linkage between an inventory disposition and its retained row: **FAILED as expected: Missing expected rejection**, [quarantine-evidence-before.txt](../tmp/validation-verification/quarantine-evidence-before.txt). The producer now requires quarantine evidence to name the actual row and match its recorded reasons. Both inventory and monthly forged-reason cases reject.

Quarantine is retention, not silent repair or removal. Monthly quarantined dispositions carry reasons; inventory dispositions are added when inventory has quarantined rows. Valid original reports retain their existing quality JSON shape/bytes. A source-scope failure stores the computed report in failed-stage evidence before skipping export. Other retained QC issues may be exported as incomplete evidence; they cannot advertise wholly verified public history. Existing original history remains readable, including historical records without newer optional provenance fields.

## Gates

All commands used direct Node in the existing sandbox. No escalation, permissions change, replacement filesystem adapter or security-control bypass was used to force a pass. No npm/npx, Python, Vitest, dependency installation, commit, push, deployment, live public collection or sibling write was performed.

| Check | Result |
|---|---|
| Before-fix `node --test test/validation.test.mjs` | **FAILED as expected: 1/6 pass, 5 fail**, one per confirmed category. |
| Before final quality linkage fix, `node --test --test-name-pattern='producer quality validation binds' test/validation.test.mjs` | **FAILED as expected: 0/1**, missing rejection. |
| `node --test test/validation.test.mjs test/normalize.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/inspection.test.mjs` | **PASS 26/26**, including all twelve validation checks; [after.txt](../tmp/validation-verification/after.txt). |
| Full suite below, from faithful isolated copy | **FAILED overall: 58 total, 38 pass, 20 fail, 0 skipped**. Filesystem/CLI/history/acquisition paths encounter sandbox `EPERM realpath`; localhost attachment test encounters `EACCES`. These are not passing application gates. [full-suite-sandbox.txt](../tmp/validation-verification/full-suite-sandbox.txt). |
| `node --check <file>` for four changed source modules, workflow/helper and both changed test files | **PASS 8/8**, [syntax.txt](../tmp/validation-verification/syntax.txt). No TypeScript/lint setup exists in this dependency-free JS repository. |
| `node tmp/validation-verification/verify-preservation.mjs` | **PASS**: 65/70 baseline files unchanged; only the five allowed existing source/validator files changed. All 54 original raw/artifact/run files retain bytes and membership; 14 sibling consumer artifact/pin files unchanged. [preservation.json](../tmp/validation-verification/preservation.json). |
| `node tmp/validation-verification/consumer-check.mjs` | **PASS**: actual Analytics source validator accepts original/consumer-copy/in-memory public rebuild and rejects the fixture rebuild. Existing consumer artifact inventory and pins verify. This is in-memory construction and read-only consumer validation, not publication/history or a new import. [consumer-check.json](../tmp/validation-verification/consumer-check.json). |

Full command (owning copy: `tmp/validation-verification/snapshot`):

```powershell
node --test test/acquisition.test.mjs test/browser-artifact.test.mjs test/history.test.mjs test/inspection.test.mjs test/normalize.test.mjs test/run-events.test.mjs test/server.test.mjs test/versioning.test.mjs test/presentation.test.mjs test/provenance.test.mjs test/validation.test.mjs
```

The 20 failures comprise acquisition 3, history 2, provenance 7, run-events/CLI 3, server 1 and versioning 4. Some assertions report `STAGE_FAILED`, missing returned records or empty CLI JSON because confinement checks fail before the intended operation; this does not prove those intended assertions passed. The source path calls `realpath` before acquisition/normalization, and persistence can mask an earlier failure with its own `realpath` denial. The independent reviewer must rerun these gates in a supported environment. No test was skipped or weakened to manufacture a green suite.

Last ten lines of the failed full-suite log:

```text
      at async exportArtifact (file:///C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer/tmp/validation-verification/snapshot/src/pipeline.mjs:47:22)
      at async TestContext.<anonymous> (file:///C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer/tmp/validation-verification/snapshot/test/versioning.test.mjs:62:15)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'realpath',
    path: 'C:\\Users\\thai.phi\\Downloads\\python\\portfolio\\texas-rrc-explorer\\tmp\\validation-verification\\snapshot\\tmp\\versioning-yqLTxS\\raw',
    record: { schemaVersion: 1, runId: 'abcf6473-c538-4f6b-8b47-7db3a6ed417d', mode: 'offline_replay', testFixture: true, provenance: { classification: 'test_fixture', basis: 'explicit_test_fixture' }, pipelineVersion: 'rrc-collection-v1', dataSchemaVersion: 1, transformationVersion: 'rrc-odp-v1.0.0', startedAt: '2026-10-10T04:42:17.465Z', endedAt: '2026-10-10T04:42:17.466Z', status: 'failed', events: [ [Object], [Object], [Object], [Object] ] }
  }
```

The full log also retains every failing assertion and the localhost EACCES diagnostic. One documentation-update tool wrapper FAILED before execution with a JavaScript quoting syntax error; the corrected call succeeded without changing application files.

## Preservation and remaining gaps

- Original artifact ID `rrc-2026-10-09-uic000020838-v1`; external manifest SHA256 `3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f`; normalized SHA256 `4f243138c833f09a5be6a970e85f76f3f73e95040c69677a10b8c3b2fe03ca5b`; monthly CSV SHA256 `1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3`. All thirteen artifact files rebuild byte-for-byte. Five inventory rows, 28 reports and original source anchors remain unchanged.
- Both browser pins and all other nine existing public files are unchanged. `src/acquisition.mjs` and `src/runEvents.mjs` are unchanged; the fixture provenance classifier/legacy fingerprint, synthetic dictionary labels and fixture-history exclusions remain in effect. Fixture construction/consumer rejection passes; the complete acquisition/CLI/history provenance tests remain environment-blocked this round.
- Fresh independent review has **not** occurred. Review canonical identity/month handling, fail-closed query predicates, report conservation and retained reasons, and the conservative incomplete-history status for inventory quarantine. This implementer cannot close the defects by self-review.
- Filesystem publication, separate CLI replay, actual saved downloads/history routes and current browser runtime were not freshly verified successfully in this round. No new desktop/mobile screenshots or visual acceptance claim; visual files are unchanged and earlier UI evidence remains historical.
- The follow-on [bounded lookup/collection plan](plan-bounded-well-lookup.md) identifies source-contract verification, well disambiguation, scope/version propagation, optional newly authorized website adapter, read-only run evidence, version selection and Analytics handoff. No lookup feature, trigger endpoint, live refresh or statewide work was implemented.

Next gate: separately coordinated fresh independent review plus the blocked suite. Passing that gate closes these five defects only; project-wide correctness, product milestone and delivery acceptance remain separate.
