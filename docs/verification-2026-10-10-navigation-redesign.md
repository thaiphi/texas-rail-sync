# Navigation redesign handoff — October 10, 2026

Implementation is frozen. **Acceptance is not complete:** the independent reviewer has not yet assessed the final replacement desktop/mobile screenshots. The original one-hour window began at 14:47:29 UTC and ended at 15:47:29 UTC. Production changes were refrozen at 15:16:17 UTC; this handoff records existing evidence and does not extend implementation work.

## Delivered

Four global activities: Find & collect, My datasets, Collection history and Help. Six tabs inside an explicitly opened immutable version: Overview, Records, Data quality, Sources, Downloads and Collection details. Global screens hide unrelated dataset context. Version/tab and historical-run bookmarks support refresh and Back/Forward. Well/report, dataset, historical-run and current-request selections remain distinct.

Find starts with exact nine-digit UIC/eight-digit original source API lookup. Candidate selection is explicit; reporting bounds remain 1–36 inclusive months. The current-request step indicator changes through confirmation, collection and result review. Active requests lock controls, report the submitted well/date window and wait for actual terminal evidence. Results offer Open this dataset and Prepare download. No fake live stage events, scheduler or editor were added. Human-readable times use the browser timezone; original UTC evidence is unchanged.

The verified library displays actual identities, inventory/report/month counts, observed reporting coverage, quality and versions; opened and default-pinned versions are distinct. Records retains county/operator/text filters, complete inventory columns, selected report controls/table, liquid/gas volumes, separate pressures, calculated calendar-day rates, chart and source/quality evidence. Data quality retains inventory/monthly dispositions and affected-record evidence; Sources retains all original files, official links and hashes. Downloads retains all supported whole-version TAR, CSV, JSON and original files. Analytics instructions require complete-directory verification and separately curated adoption, without inventing TAR upload or automatic import.

The complete pre-change audit, reference omissions and destination checks are in [the preservation matrix](feature-preservation-2026-10-10.md). Requirement mapping: RRC-01/02 collection; RRC-03/04 record/QC/source evidence; RRC-05 version/export preservation; RRC-06 navigation and inspection; RRC-09/10 read-only stages and recorded history. RRC-07/08, G3 and whole-project acceptance remain open.

## Changed files

- Frontend: `public/index.html`, `public/app.js`, `public/style.css`, `public/collection.js`, `public/workflow-ui.js`, `public/presentation.js`, `public/dataset-state.js`, new `public/navigation.js`.
- Tests: new `test/navigation-redesign.test.mjs`, `test/dataset-state.test.mjs`, and dependency/DOM harness adaptations in `test/version-race.test.mjs` with existing assertions retained.
- Documentation: `README.md`, `DESIGN.md`, `GATES.md`, `docs/requirements.md`, the preservation matrix, this packet, screenshot gallery and independent review.
- Reproduction scripts, isolated test copies, logs, hash ledgers and screenshots are under `tmp/navigation-redesign-2026-10-10/` and `tmp/navigation-review/`.

No backend, schema, normalizer, public dataset, raw source, run history, pin or consumer change was made. No commit, push, deployment, security-setting change, live collection or Analytics import was performed.

## Verification results

| Check | Result and evidence |
|---|---|
| Baseline complete production suite | PASS 103/103 before UI changes; `tmp/navigation-redesign-2026-10-10/before-suite.log`. |
| New regression development | Expected failing tests reproduced missing navigation/state behavior; repaired checks pass. Independent reviewer additionally reproduced history-completion selection replacement and stale auxiliary version links, then reran the unchanged probes successfully after repair. |
| Final implementer isolated full suite | PASS 118/118, zero failures/skips; `full-history-fix-green.log` under the implementation scratch directory. |
| Independent final isolated full suite | PASS 118/118 on refrozen source; `tmp/navigation-review/final-host-suite.txt`, with exact expanded command in `final-host-evidence.json`. Ten browser-module syntax checks pass. |
| Sandbox suite | FAILED in the filesystem sandbox: independent run 81 passed/37 failed due Windows `EPERM realpath` restrictions; Main's sandbox run also failed. Ordinary approved host execution succeeded without changing permissions. These failures are retained, not counted as passes. |
| Independent unchanged adversarial probes | PASS `node tmp/navigation-review/history-race.mjs` and `node tmp/navigation-review/auxiliary-links.mjs` after repair. |
| Original preservation | PASS all 166 protected files and complete membership plus 14 consumer files, independently before/after final suite. No source drift across the 47 source/test files in the independent ledger. |
| Three published versions | PASS byte-identical reconstruction: 13/27/27 builder files; actual Analytics whole-artifact verifier accepts 11/33/33 inventoried checks. All 29 original run records validate as nonfixtures. `tmp/navigation-review/contract-review.json`. |
| Actual browser downloads | PASS monthly CSV byte-identical (3,248 bytes), TAR exact 28-file membership/content, run JSON deep-equal retained original. Independently checked in `tmp/navigation-review/download-review.json`. Quality report also downloaded; its saved bytes were not independently rechecked in this round. |
| Browser records/navigation | PASS SAND BEND version opens with actual January 2024–April 2025 coverage and 16 report rows, distinct from requested query ending April 2026. Text filtering clears hidden selected-well details; Clear filters requires deliberate reselection. February report selection shows 417 bbl and calculated 14.38 bbl/day. Back/Forward restores version/tab. Historical failed-run bookmark restores its own failed/skipped evidence without changing dataset. |
| Keyboard | PASS Enter selects stage buttons; evidence tabs respond to ArrowRight/End and show visible solid focus. Narrow node selection focuses its detail heading. A complete accessibility audit was not performed. |
| Error/evidence states | PASS unavailable version clears records/counts/source/download/run evidence; controlled corrupt normalized bytes reject with hash-mismatch alert. Failed historical run shows failure, downstream skips and unavailable counts rather than success. |
| Controlled walkthrough | PASS nine-digit UIC/eight-digit API forms, invalid input, no matches, multiple candidates with explicit selection, lookup failure, candidate/date confirmation, invalid >36-month bounds, locked active request, collection failure/recovery, success handoff and no-reports wording. Local replay harness clearly labels all response fixtures and performs no public acquisition or dataset writes. Success handoff opens the existing preserved SAND BEND version; it does not establish a newly acquired dataset. |
| Desktop/mobile screenshots | Captured all eight reference destinations at actual desktop 1280×720 and narrow 390×844 browser viewports, plus desktop history/Help and important unpictured states. Narrow Records has page width390 with a1050px inventory table contained in345px scrolling area; narrow map width315 and page375. Initial viewport attempts were ineffective and are explicitly superseded by real390px captures. Gallery below. |

Frozen implementation ledger SHA256: `ca5ebb277287f8b2f1b305b8b42e33046e87037bda1a2408db4a2fc7dd09e440`, stored at `tmp/navigation-redesign-2026-10-10/implementation-freeze.json`. Independent review and all-file hashes: [review report](review-2026-10-10-navigation-redesign.md) and `tmp/navigation-review/final-host-evidence.json`.

## Remaining scope and acceptance limits

- Independent reviewer inspected all four references and initial desktop captures, found and verified repairs for two navigation defects, and passed final source/contract/tests/preservation gates. **Final replacement desktop/mobile screenshot review remains pending.** Main confirmed repaired metric icons are hidden and obtained genuine narrow captures; this is not a substitute for independent final visual assessment.
- Narrow Collection history/Help screenshots, final refreshed unpictured-state captures, broad keyboard traversal and a complete accessibility audit remain incomplete. Some unpictured captures predate final presentation-only repairs and are labeled as controlled/earlier evidence.
- No new live collection was run for visual testing. Controlled UI tests verify request/result behavior, while existing preserved public versions and unchanged collection tests establish the backend evidence. The no-reports fixture has no real published empty dataset; empty histories are not accepted by the stricter Analytics consumer.
- The final quality screen uses actual public versions with zero quarantined rows. Quarantine, excluded/unmatched evidence and inventory QC are covered in code/regressions; no new public issue was fabricated for a screenshot.
- No sorting or chart metric/zoom/date controls existed in the audited baseline. They remain unimplemented. GIS/statewide coverage, scheduling, a crash-safe live journal, original H-10 document revision identities, annulus acquisition and manual quality override remain absent.
- Consumer adoption, acknowledgement, repinning, production delivery and whole-project acceptance remain separate. Accepted public records do not establish engineering readiness, compliance, safe injection conditions, BHP or sustainable capacity.

See [all screenshots](screenshots-2026-10-10-navigation-redesign.md). The local user-facing preview remains at `http://127.0.0.1:4391/`; this is not deployment.
