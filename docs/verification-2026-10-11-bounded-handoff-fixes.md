# Bounded handoff repair — October 10 CDT

Human-authorized round began at 2026-10-11 02:53:03 UTC (October 10, 9:53:03 p.m. CDT). Fixed stop: 03:37:00 UTC / 10:37 p.m. CDT. Work remains in Texas RRC Explorer; Analytics was inspected read-only. No live collection, deployment, permission changes, Git writes, dataset replacement or repinning.

Requirement mapping: RRC-03/04 retain invalid rows and quality evidence; RRC-05 preserves complete immutable export bytes and consumer compatibility. This maintenance round does not close whole-project acceptance.

## Completed sender repairs

Original implementer GPT-6.1 Sol/high changed only `public/analytics-handoff.js` and `test/analytics-handoff.test.mjs`. Main owns this evidence packet and diagnostics. Independent GPT-6 Astra/high reviewed read-only; assignments had disjoint ownership.

| Defect reproduced before repair | Result after repair |
|---|---|
| Year `0000` passed scope validation | Rejects before opening Analytics or fetching bytes; ordinary nonzero four-digit years remain supported |
| Sparse arrays and nonrecord rows could bypass scope checks | Requires dense arrays of plain records with an own nine-digit UIC string; no invented identity |
| `receiving` followed by late `validating` restarted the 60-second deadline | One deadline from first receiver progress; preview clears it and still requires explicit adoption |
| ArrayBuffer/Uint16Array chunks could become substituted zero bytes during accumulation | Requires Uint8Array chunks before accumulation, cancels malformed streams, offers no substituted package |

Meaningful before-fix gate: 17/21 passed, four new regressions failed. After repair: 21/21 sender tests and syntax pass. Complete TAR content, scope schema, hashes, original download, strict origins and receiver confirmation remain unchanged.

## Quarantined-record handoff remains blocked by a cross-repository contract

No sender-only filtering or value repair was applied. Current sender scope rejects malformed retained UIC/month values. Analytics additionally requires history identifiers to be a subset of inventory identifiers and non-null coverage, recomputes scope from all retained values, and invokes a public-artifact validator requiring zero quarantine, resolved joins and nonempty history. A filtered sender offer would therefore fail independent receiver verification.

Read-only dependency locations in sibling `swd-injection-analytics`:

- `web/explorer-handoff.mjs:22`: offer scope constraints.
- `web/explorer-receiver.mjs:20`: independent scope recomputation.
- `web/explorer-package.mjs:167`: public-artifact validation before preview.
- `src/publicArtifact.ts:20`: all-accepted eligibility constraints, with additional disposition and nonempty-history checks.
- `web/explorer-receiver.mjs:51`: preview caption assumes every retained source row is accepted.

The user confirmed: “Keep edits in TRRC; give the receiver findings to the Analytics owner.” Matching receiver findings and the independent recommendations below were delivered to **Review injection acceptance** (thread `01a12294-ee3c-7b92-b7bc-28a10fd40647`). Explorer edits remain confined to this repository. Quarantined-record browser handoff is **not fixed or accepted**; the receiver dependency is handed off, not closed. Existing complete downloads retain original values and reasons; file download is not claimed to make a quarantine-bearing package acceptable to Analytics.

Independent recommended design, requiring its own consumer call-site review:

1. Preserve the complete validated artifact and original TAR for inspection/export.
2. Apply identical scope projection on both sides: sorted unique syntactically valid identifiers, valid actual monthly bounds, paired nulls when unavailable; disclose any unprojectable evidence without deleting rows.
3. Separate verified evidence from calculation eligibility. Derive a separately validated accepted-row view, excluding invalid/quarantined rows and invalid parents. Do not globally loosen the current calculation validator or mutate the adopted original artifact.
4. Test affected preview/adoption/model paths, empty accepted selections, unmatched/ambiguous parents, duplicate months, cancellation and hash/scope substitution. Do not describe receipt or evidence acceptance as engineering readiness.

## Test evidence

- Focused integration and validation: `node --test test/analytics-handoff.test.mjs test/navigation-redesign.test.mjs test/dataset-state.test.mjs test/version-race.test.mjs test/inspection.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/version-selection.test.mjs test/lookup.test.mjs test/validation.test.mjs` — **PASS 84/84**.
- Independent review: four-file sender/navigation/dataset-state/version-race gate — **PASS 50/50**. Additional in-memory probes pass for years 0001/9999, inherited-UIC rejection, null-prototype records, offset Uint8Array bytes/hash preservation, DataView rejection/cleanup and absolute timeout behavior. No new material sender regression found.
- Final isolated full suite: `node tmp/navigation-redesign-2026-10-10/suite.mjs bounded-handoff-final` — **FAIL: 150 tests, 113 passed, 37 failed**. Full acceptance is blocked; no failing check is relabeled as passed. Log: `tmp/navigation-redesign-2026-10-10/bounded-handoff-final-suite.log`.
- Protected-file check: `node tmp/navigation-redesign-2026-10-10/preserve.mjs` — **PASS: 166 protected files and 14 consumer evidence/pin files unchanged**, including file membership and byte hashes.
- Real browser cross-window quarantine transfer/adoption and receiver calculation exclusion — **UNRUN**. No new visual-layout change or screenshot acceptance is claimed.

## Diagnosed full-suite blockers using existing permissions

Initial isolated suite before these repairs: 146 tests, 109 passed, 37 failed. Its log and diagnostic inventory are under `tmp/navigation-redesign-2026-10-10/bounded-handoff-fixes-suite.log` and `tmp/analytics-handoff-2026-10-11/bounded-suite-diagnosis.json`. Twenty-nine failures directly expose denied `realpath` or local socket `EACCES` operations. Eight initially surfaced as secondary assertions or missing evidence.

Diagnostic copies of six test files exposed original errors without changing production code, disabling containment, changing permissions or claiming the diagnostic run passed. `tmp/analytics-handoff-2026-10-11/blocker-trace.log` records:

- Acquisition and versioning expected-code failures encounter `EPERM realpath` before HTTP, source-cap or source-validation assertions; they report `STAGE_FAILED` instead of the intended code.
- The early acquisition marker is missing because containment fails before the source directory/marker is created (`src/acquisition.mjs:30`).
- History/provenance/CLI diagnostics reveal an additional existing error-reporting weakness: a failed attempt to save an already-failed run can replace its original error at `src/pipeline.mjs:88`, losing `.record` and leaving CLI stdout empty. The triggering containment/persistence operations are denied here. This is disclosed, not repaired or counted as successful source/provenance testing.
- Socket-dependent server tests cannot complete their local connections under existing permissions.

No alternate access route or permission escalation was attempted. Containment guards remain intact. The final 37 failing checks remain open until their intended assertions can execute in an already-authorized environment; blocked checks cannot certify archive/export or full validation acceptance.

Receiver synchronous parsing/normalization can also delay browser timer callbacks. The sender deadline prevents protocol extension; it is not proof of a hard execution-time interrupt. Worst-case browser execution time remains unmeasured.
