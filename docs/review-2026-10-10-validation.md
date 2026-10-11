# Independent review of five validation fixes — October 10, 2026

Initial review completed 05:11 UTC, before the assigned 05:30:20 UTC checkpoint. **Verdict: NEEDS CHANGES.** Four normalization/source fixes pass independent bounded review; quality/run-evidence validation remains incomplete. This is not project acceptance or authorization for lookup/collection work. Main accepted the findings and owns remediation; this reviewer authored no application fixes.

## Scope and evidence identity

Reviewed original `src/normalize.mjs`, `sources.mjs`, `artifact.mjs`, `pipeline.mjs`, `public/quality-validation.js`, `workflow.js`, focused tests, and acquisition/recorder/versioning/history/consumer call sites. Read owning AGENTS/README/SPEC/SOURCE_PROOF/GATES, both validation/provenance verification packets, shared workflow, Explorer PRD, architecture contract and completion E1/E3. Requirements RRC-01/03/04/10; preserve RRC-05 and fixture segregation.

No Git base/head exists. The preserved provenance snapshot's five pre-fix modules match `tmp/validation-verification/baseline.json`; the initial log independently shows five failed regressions and one compatibility pass. At 05:09:25 UTC, the review snapshot matched all 32 original files under src/public/scripts/test, before Main's subsequent repair. All probes/tests ran within `tmp/independent-validation-review/snapshot`; source/data/UI originals and sibling repositories were read-only. Original scope does not include Main's later fixes.

## Per-defect assessment

| Defect | Status | Independent evidence |
|---|---|---|
| Canonical well/month duplicates | PASS | Three revisions using both supported timestamp spellings all quarantined, with distinct ordinal keys; repeated report IDs independently counted; different UIC/month remains distinct. Ambiguous duplicate parents retain both parents and all children with empty parent keys. `src/normalize.mjs:29`–`38`. |
| Missing report IDs | PASS | Null, absent, empty and whitespace IDs retain source absence and quarantine; tab/newline/nonbreaking spaces covered independently. Leading-zero IDs remain unchanged; missing liquid remains null while gas zero stays zero. `src/normalize.mjs:38`. |
| Negative permit/depth and inverted intervals | PASS | All four fields and a combined negative/inverted example retain numeric values and every reason; zero and missing remain distinct. Inventory quarantine prevents verified public-history status. `src/normalize.mjs:21`–`22`, `src/artifact.mjs:75`. |
| Declared query predicates | PASS for producer, with related run-evidence finding below | All six declared predicates fail direct artifact construction, including empty-but-not-null canceled/plugged fields, wrong UIC, wrong prefix/type and pre-bound date. Exact bound passes. Pipeline retains QC counts before scope failure and skips export. `src/sources.mjs:4`–`15`, `src/pipeline.mjs:62`–`64`, `src/artifact.mjs:62`. |
| Quality count/disposition validation | FAIL | Integer/conservation/duplicate-key checks and producer row binding pass. Row-free run validation still accepts internally impossible joins and missing quarantine evidence; successful scope-violating run evidence also passes. Findings I1/I2. |

## Findings

### I1 — Important: row-free QC validation accepts contradictory or incomplete dispositions

`public/quality-validation.js:17` validates join totals without constraining unmatched/ambiguous rows to quarantine. At `:23`, quarantine reasons may be absent or empty; at `:27`, the entire inventory disposition list is optional even with inventory quarantine. The required inventory evidence check occurs only in the rows-supplied branch at `:40`. `public/workflow.js:41` and `:46` invoke the weaker row-free form, as do recorder/save/history validation through that function.

Reproduction uses a copied genuine successful record, mutates the same report in successful normalize-qc and export events, and leaves chronology, source/output counts and hashes intact:

1. Set parent joins to matched 27 / unmatched 1, retaining accepted 28 / quarantined 0. `workflowView` returns succeeded.
2. Set monthly accepted 27 / quarantined 1 and first disposition quarantined, with `invalid:source_report_id: 1` in issue counts but no reasons. Returns succeeded.
3. Set inventory accepted 4 / quarantined 1 with a negative-permit issue but no inventory dispositions. Returns succeeded.

Independent rejection regressions fail with `Missing expected exception`, at `tmp/independent-validation-review/snapshot/test/independent-validation-review.test.mjs:50`, `:54`, `:58`. The producer's stronger rows-supplied checks reject analogous inconsistencies, but that does not protect corrupted/malformed persisted run evidence. This does not allege that the current normalizer naturally emits these malformed reports.

Required narrow correction: validate intrinsic join/disposition consistency and required quarantine identities/reasons even without rows. Reconcile quarantine-triggering issue frequencies to retained reasons where available. Preserve accepted rows' legitimate `missing:*` issues: accepted dispositions intentionally omit reasons, so demanding reconstruction of every issue from quarantine reasons would reject valid reports. Keep existing valid original report bytes unchanged.

### I2 — Important: successful run evidence can contradict mandatory source-scope refusal

`public/workflow.js:40`–`48` accepts a report with positive `source_scope:*` issues in successful normalize-qc/export stages. The actual pipeline must fail normalization for such an issue at `src/pipeline.mjs:64`, and the direct builder refuses it at `src/artifact.mjs:62`.

Reproduction: in both copied successful reports, set monthly accepted 27 / quarantined 1, first disposition quarantined with reason `source_scope:uic_no`, and issue count 1. All counts and reasons now agree, yet `workflowView` reports all stages succeeded. Independent rejection regression at `tmp/independent-validation-review/snapshot/test/independent-validation-review.test.mjs:62` fails with `Missing expected exception`.

Required narrow correction: prohibit positive source-scope issue counts in successful QC/export evidence. Failed normalization must remain inspectable with its truthful quality reasons and skipped export. This finding concerns event validation, not a demonstrated bypass of the producer's export refusal.

Critical: none. Minor: none reported. Both Important findings were relayed promptly and accepted by Main for correction.

## Gates

Commands below ran in `tmp/independent-validation-review/snapshot` unless another working directory is specified.

| Exact command | Result |
|---|---|
| `node --test test/validation.test.mjs test/normalize.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/inspection.test.mjs` | PASS 26/26; `../focused.txt`. |
| `node --test test/independent-validation-review.test.mjs` | FAILED: 8 pass, 4 fail; all four final failures are missing expected rejection, not sandbox errors; `../adversarial.txt`. |
| `node --test test/acquisition.test.mjs test/browser-artifact.test.mjs test/history.test.mjs test/inspection.test.mjs test/normalize.test.mjs test/run-events.test.mjs test/server.test.mjs test/versioning.test.mjs test/presentation.test.mjs test/provenance.test.mjs test/validation.test.mjs` | FAILED overall: 38/58 pass, 20 fail; `../full-suite-sandbox.txt`. Filesystem/CLI/history/acquisition gates COULD NOT RUN successfully under EPERM realpath; local server COULD NOT RUN under EACCES. No reviewer escalation attempted. |
| Same full-suite command run by Main in its own copy | Main's host log inspected: PASS 58/58, `tmp/acceptance-review-2026-10-10/full-suite-host.txt`. This is corroborating Main evidence, not this reviewer's execution or coverage of the four new adversarial regressions. |
| `node tmp/independent-validation-review/preservation-consumer.mjs` from owning root | PASS: 63 preserved baseline files, including all 54 raw/artifact/run files and membership; 32 faithful original code files; five verified pre-fix files; consumer original/copy/public replay accepted and loaded fixture rejected. `preservation-consumer.json`/`.txt`. |
| `node --check src/normalize.mjs`; `node --check src/sources.mjs`; `node --check src/artifact.mjs`; `node --check src/pipeline.mjs`; `node --check public/quality-validation.js`; `node --check public/workflow.js`; `node --check test/validation.test.mjs`; `node --check test/run-events.test.mjs` | PASS 8/8. |

Initial independent probe authoring had two harness failures because `loadSnapshot` accepts a filesystem string, not a URL object. Corrected only the probe with `fileURLToPath`; final 8/12 result above supersedes those harness failures. No application workaround or altered security behavior was used.

Adversarial failure tail:

```text
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /quality|scope|disposition/i,
    operator: 'throws',
    diff: 'simple'
  }
```

Full-suite failure tail:

```text
      at async exportArtifact (file:///C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer/tmp/independent-validation-review/snapshot/src/pipeline.mjs:47:22)
      at async TestContext.<anonymous> (file:///C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer/tmp/independent-validation-review/snapshot/test/versioning.test.mjs:62:15)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'realpath',
    path: 'C:\\Users\\thai.phi\\Downloads\\python\\portfolio\\texas-rrc-explorer\\tmp\\independent-validation-review\\snapshot\\tmp\\versioning-AZ44rQ\\raw',
    record: { schemaVersion: 1, runId: 'f95177be-5f8b-430f-9597-dab793f6892f', mode: 'offline_replay', testFixture: true, provenance: { classification: 'test_fixture', basis: 'explicit_test_fixture' }, pipelineVersion: 'rrc-collection-v1', dataSchemaVersion: 1, transformationVersion: 'rrc-odp-v1.0.0', startedAt: '2026-10-10T05:08:46.436Z', endedAt: '2026-10-10T05:08:46.437Z', status: 'failed', events: [ [Object], [Object], [Object], [Object] ] }
  }
```

## Retained invariants and declined judgments

- All 13 original artifact files independently rebuild byte-for-byte. Original five inventory rows and 28 monthly rows, pins, sources and saved runs remain intact. Exact consumer manifest/normalized hashes and eleven inventoried contract/source files verify; sibling code/data were not changed.
- Fixture loading still yields test_fixture; fixture dictionaries label reported fields synthetic; actual Analytics validator rejects the fixture. Original/public replay remains accepted. Full persistence/CLI fixture segregation was blocked in this reviewer's sandbox; Main's separate 58/58 host run covers those existing tests.
- Ordinary quarantine may legitimately produce a completed export with incomplete public history. Declined to forbid every successful run containing quarantine; only source-scope violations are mandatory export refusals under the current pipeline.
- Declined to add unsupported timestamp formats or general date repair. The declared parser supports month-start midnight with optional `.000`; unsupported dates remain parse-failure quarantine. Pre-2024 Gregorian-year edge behavior, time zones and future-date policy are outside these five fixes.
- Declined to authenticate arbitrarily forged in-memory snapshots/normalized objects against signed publisher records. Actual production call sites normalize the loaded source. This review validates producer row/count consistency and run-report internal contradictions, not resistance to an actor rewriting all local evidence.
- Declined new report-ID schema rules for nonblank non-string values; the requested fix is missing/blank identifiers, and the contract preserves source IDs as strings without inventing a numeric-ID grammar.
- Declined mandatory new run fields/schema migration or reconstruction of missing historical evidence. Existing valid original records remain inspectable. Intrinsic contradictions require rejection; absence of unrecorded historical instrumentation remains unrecorded.
- Did not independently rerun successful publication/CLI/history/HTTP in an unrestricted environment; no escalation was authorized to this reviewer. Main's logged host gates are distinguished above.
- No fresh browser screenshot/download/keyboard audit, live source collection, access-policy research, performance audit, lookup implementation, statewide work, deployment or project-wide acceptance. Visual assets were unchanged and those tasks are outside this bounded review. No sibling audit beyond the read-only consumer contract/pin checks, no Git writes and no child agents.

**Initial assignment complete; slot may release.** Re-review is required after Main's narrow corrections, with a fresh faithful snapshot and these adversarial rejection checks. Main retains final integration and the fixed 06:05:20 UTC round stop.

## Re-review 1 — 05:14 UTC, October 10

Main updated only the two validators and `test/validation.test.mjs` in the supplied snapshot while this reviewer's slot was released. This reviewer read those original changes and Main's host log; no original source was edited. **Verdict remains NEEDS CHANGES**, with the original four normalization categories still PASS and the quality/run-evidence category FAIL on further intrinsic contradictions.

### Finding status

- **I1: original reproductions fixed, further join-evidence variant remains.** The original unmatched/all-accepted, missing monthly reasons and missing inventory dispositions regressions now pass. `public/quality-validation.js:24` ensures unmatched + ambiguous does not exceed quarantine, and `:40`–`:43` reconciles quarantine-triggering issue frequencies. However, the report may still claim an unmatched parent with no `unmatched:parent` reason, or claim all parents matched while retaining a positive `unmatched:parent` issue. This is a contradiction between existing report fields, not a demand for cryptographic source authentication.
- **I2: PASS/resolved.** `public/workflow.js:8`–`:11` prohibits positive source-scope issues on successful QC/export. Failed source-scope evidence remains readable with reasons and skipped export.
- **I3: Important, newly reproduced — explicit verified-history claim is not reconciled with QC.** `public/workflow.js:49`–`:52` validates export counts but not `evidence.realHistoryStatus`. A copied success record carrying an authentic normalized QC report with monthly or inventory quarantine still passes with `realHistoryStatus='verified_bounded_linkage'`. `src/artifact.mjs:75` would instead require nonempty monthly rows, all inventory/monthly rows accepted and every monthly parent matched, and would mark these artifacts incomplete. `public/workflow-ui.js:31` exposes the contradictory claim in inspected event JSON. This does not allege that the current builder naturally produces the false claim.

Concrete additional reproductions live in `snapshot/test/independent-validation-review.test.mjs`:

1. Normalize the original 5/28 rows with the first report ID absent; the genuine report has one quarantine for `invalid:source_report_id`. Change only parent joins from matched 28 to matched 27 / unmatched 1. Both successful stage reports agree, but their join count has no corresponding unmatched reason. `workflowView` incorrectly accepts.
2. Normalize the original rows with one monthly UIC unmatched, retaining its actual `unmatched:parent` reason, then change joins to matched 28 / unmatched 0. It incorrectly accepts again.
3. Use an authentic report with one monthly missing-ID quarantine, or one inventory negative-pressure quarantine. Both successful stage reports agree. Give export explicit `verified_bounded_linkage`; it incorrectly accepts despite the mandatory incomplete-history rule.

Required narrow follow-up: equate the known monthly join issue frequencies (`unmatched:parent`, `ambiguous:parent`) with their respective join counts, and reject an explicit verified-history claim when the producer's readiness rule is unmet. Keep absent historical readiness optional; allow conservative incomplete status and successful exports containing ordinary quarantine. Main accepted these findings and owns the corrections.

### Independent gates and compatibility

| Exact command | Result |
|---|---|
| `node --test test/independent-validation-review.test.mjs` before expanding the probes | PASS 12/12; `tmp/independent-validation-review/rereview-initial-probes.txt`. All four initial failing cases now reject. |
| Same command after adding six independent checks | FAILED 15/18; `tmp/independent-validation-review/rereview-expanded.txt`. Three new rejection assertions fail with missing expected exception; no environment failure in this command. |
| `node --test test/validation.test.mjs test/normalize.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/inspection.test.mjs` | PASS 33/33; `tmp/independent-validation-review/rereview-focused.txt`. |
| `node --check public/quality-validation.js`; `node --check public/workflow.js`; `node --check test/validation.test.mjs` | PASS 3/3. |
| Main's existing full-suite command, host execution | Read `tmp/acceptance-review-2026-10-10/full-suite-after-review.txt`: PASS 65/65. Corroborating Main evidence, not reviewer execution; the three new failing checks are absent from it. |

Final ten lines of expanded-probe failure:

```text
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /quality|join|count|disposition/i,
    operator: 'throws',
    diff: 'simple'
  }
```

Independent compatibility checks PASS for accepted rows with missing liquid, real monthly quarantine, real inventory quarantine, valid incomplete exports, failed scope reports retaining their reason/skipped export, and rejection of missing/empty/inconsistent quarantine reasons or counts. Byte-identical 13-file original rebuild and ambiguous duplicate-row cases remain covered by the passing independent probes.

The earlier deliberate exclusions remain in force. Additionally declined to require every successful export to have complete public history, require new historical readiness fields, or equate run completion with Analytics acceptance. These would change the existing contract. No fresh full sandbox suite was rerun in this short re-review: the same known filesystem/local-server restrictions remain, while Main separately ran the host gate. No new browser/network/publication/consumer-import claim is made.

**Re-review 1 assignment complete; slot released for Main's narrow fixes.** All five fixes are not yet independently ready. Follow-up re-review remains within the original 06:05:20 UTC stop; lookup implementation remains unstarted.

## Final re-review — 05:17 UTC, October 10

**Current scoped verdict: PASS. The five validation defects can close subject to Main's final preservation/integration check.** This supersedes the earlier NEEDS CHANGES verdicts for these defects only; their reproductions and failed evidence remain preserved above. No full-project, feature, deployment or live-acquisition acceptance is implied.

### Resolutions and current per-defect status

| Finding / defect | Current result | Independently verified resolution |
|---|---|---|
| Canonical well/month duplicates | PASS | Both supported date spellings group by exact original UIC/year/month; revisions, repeated IDs, ambiguous parents and every retained ordinal remain accounted for. |
| Missing report IDs | PASS | Absent/null/blank/whitespace identifiers quarantine without invented source IDs; leading zeros and missing-versus-zero observations remain intact. |
| Negative permit/depth / inverted intervals | PASS | Every invalid field/reversed interval retains its original numeric projection and reason, and inventory quarantine prevents verified public-history claims. |
| Declared query scope | PASS | Every fixed predicate is independently refused at direct construction; scope-failing QC retains reasons and skipped export. Successful scope-violating event evidence rejects. |
| Quality counts/dispositions | PASS within reviewed contract | Counts, unique disposition keys, mandatory quarantine reasons, reason frequencies, known parent-join frequencies, input/output reconciliation and explicit verified-readiness assertions pass positive/negative checks. |
| I1 including expanded join variants | RESOLVED | `public/quality-validation.js:26` now equates unmatched/ambiguous join counts with their known issue frequencies; `:8`–`:10`, `:35`, `:42`–`:45` enforce intrinsic quarantine evidence. The initial three failures and both expanded contradictory-join variants now reject. |
| I2 source-scope success | RESOLVED | `public/workflow.js:8`–`:11` rejects positive source-scope issues for successful QC/export. A real failed scope report remains readable with reasons and downstream skipped state. |
| I3 explicit verified readiness | RESOLVED | `public/workflow.js:51` rejects verified public linkage for fixtures, empty monthly history, unaccepted inventory/monthly rows or incomplete parent matching, matching `src/artifact.mjs:75`/`:80`. Missing readiness remains optional; incomplete export can legitimately succeed. |

Critical/Important/Minor findings remaining in this bounded review: **none**. This is not a claim that every possible fabricated local record can be authenticated or that arbitrary in-memory objects are trusted public source evidence.

### Final independent gates

Working directory for tests/syntax: `tmp/independent-validation-review/snapshot`.

| Exact command | Result |
|---|---|
| `node --test test/independent-validation-review.test.mjs` before final compatibility additions | PASS 18/18, with the previous independent test body unchanged; `tmp/independent-validation-review/final-independent.txt`. |
| `node --test test/independent-validation-review.test.mjs test/validation.test.mjs test/normalize.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/inspection.test.mjs` | PASS 57/57: 21 independent checks plus 36 existing focused checks; `tmp/independent-validation-review/final-focused.txt`. |
| `node tmp/independent-validation-review/preservation-consumer.mjs final-preservation-consumer` from owning root | PASS at 05:16:49 UTC; original source/test/public/script files match the snapshot (32 files), 63 protected baseline files unchanged (54 data/history files plus nine public files), baseline data membership unchanged, five before-fix files still match their historical baseline. Consumer original/copy/public replay accepted; loaded fixture rejected. `final-preservation-consumer.json`/`.txt`; earlier preservation evidence not overwritten. |
| `node --check public/quality-validation.js`; `node --check public/workflow.js`; `node --check test/validation.test.mjs`; `node --check test/independent-validation-review.test.mjs` | PASS 4/4. |
| Main's full-suite host execution | Independently read `tmp/acceptance-review-2026-10-10/full-suite-final.txt`: PASS 68/68. This is attributed Main execution, not a reviewer-run unrestricted gate. |

The three final independent additions verify: accepted missing observations still allow verified linkage; absent historical readiness is optional; a fixture record cannot claim verified public history but can remain a truthful completed fixture; empty history can export incomplete but cannot claim verified linkage. Actual monthly/inventory quarantine remains valid QC and a valid incomplete export. All 13 original artifact files rebuild exactly; original 5/28 source anchors and consumer pins remain protected.

Main reported a preceding 67/68 host run with a test-only provenance mismatch: a compatibility fixture recorder received copied public-classified load evidence. The final reviewed test now sets that fixture load evidence to the recorder's fixture provenance before asserting failed scope behavior. This changes only the test label and does not weaken production provenance enforcement. The final 68/68 result supersedes that intermediate failure; historical logs remain in Main's scratch directory.

### Final coverage boundaries

All deliberate exclusions in the initial review remain. No new behavior was silently declined: reviewed/in-scope intrinsic contradictions were fixed and re-tested. Conservatively incomplete history, missing accepted measurements, optional historical readiness and external consumer acknowledgement remaining unrecorded are intentional compatibility behavior, not defects.

Reviewer publication/CLI/history/HTTP execution remains **UNVERIFIED in the restricted sandbox** because the initial full suite encountered EPERM/EACCES; Main separately supplied the successful supported-host full gate. No additional permission/escalation or workaround was attempted. Fresh UI/browser save/accessibility, new live acquisition, source-policy research, generalized adversarial authentication, wider consumer changes, unsupported date grammars, statewide/lookup implementation, performance, deployment and full-project acceptance remain outside this five-fix review. No original application/data/UI/pin or sibling file was written by this reviewer.

**Final assignment complete; slot released.** Main owns final preservation/integration and any separately authorized next milestone. The unchanged 06:05:20 UTC overall stop still applies; this independent review completed early.
