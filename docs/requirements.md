# Explorer requirement evidence tracker

## October 10 navigation redesign

The [preservation matrix](feature-preservation-2026-10-10.md) audits existing capabilities before navigation changes, including controls omitted from the four supplied images. The [redesign packet](verification-2026-10-10-navigation-redesign.md) and [independent review](review-2026-10-10-navigation-redesign.md) are the current UI evidence. This round maps RRC-01/02 to Find & collect, RRC-03/04 to Records/Data quality/Sources, RRC-05 to My datasets/Downloads, RRC-06 to global navigation and the dataset workspace, and RRC-09/10 to Collection details/Collection history. It does not change those data requirements or close RRC-07, RRC-08, G3, consumer adoption or whole-project acceptance. Prior mobile evidence below is historical; redesigned mobile acceptance requires new actual narrow captures.

## October 10 evidence update

The historical October 9 table below remains a record of the earlier checkpoint. The current packet is `verification-2026-10-10-acceptance.md`; the new contract is ADR 002.

| Requirement | New evidence | Remaining limit |
|---|---|---|
| RRC-01 / RRC-02 | Exact UIC/API lookup, explicit identity selection and bounded public collection implemented. Actual website collection: UIC 000020838, January 2024–April 2026, one inventory row and 28 reports; four literal source anchors and deterministic replay pass. | One live UIC proof; API/multiple/empty/error paths use controlled regression evidence. No statewide or unsupported document/annulus claim. |
| RRC-03 / RRC-04 | Five validation defects and expanded contradictory QC cases closed by independent review; invalid/ambiguous rows retain quarantine reasons. | Source truth/measurement accuracy is not independently certified. |
| RRC-05 | New immutable v2 version passes actual Analytics whole-artifact verifier. Browser-saved TAR contains 28 verified byte-identical files including provenance/publication pins. | Consumer import/adoption and acknowledgement not performed; no automatic repin. |
| RRC-06 | Explicit version loading, filters, record/report details, empty recovery, desktop/mobile captures and focused keyboard checks exercised. Stale failed-version evidence and version-refresh race have regression coverage. | Exact reference-size screenshot surface clips; dense tables use contained horizontal scrolling; complete accessibility audit absent. |
| RRC-09 / RRC-10 | Actual live run c24eb125-53eb-42cb-9d5a-d73c5387ce05 drives three real nodes, details, counts and logs consistently. Failure and historical-unrecorded selections exercised. | Terminal-only records, no crash-safe live journal. External Analytics acknowledgement stays unrecorded. |

RRC-07, RRC-08 and G3 remain open. This evidence does not close the entire PRD.

Updated October 9, 2026. Authority: sibling portfolio [PRD 02](../../phi-analytics/docs/swd-intelligence-lab/02-texas-rrc-explorer.md), [completion plan](../../phi-analytics/docs/swd-intelligence-lab/2026-10-09-plan-compliance-completion.md), and owning [SPEC](../SPEC.md). Original priorities and planned scope are retained. This tracker reports local evidence; independent integration review and production delivery are separate gates.

| ID / original priority | Criterion and current result | Evidence | Remaining acceptance or limitation |
|---|---|---|---|
| RRC-01 / P0 | Implemented for the fixed bounded official UIC import: explicit snapshot directory, seven selected targets, raw response/metadata preservation and automated export. | `src/sources.mjs`, `src/acquisition.mjs`, `test/acquisition.test.mjs`; original official responses in `raw/` and source proof. | New automated acquisition path tested with marked responses, not a fresh live fetch. Only five candidate inventory records; no full county inventory claim. |
| RRC-02 / P0 source gate | Preserved real sample passes source anchors and exact UIC parent linkage: 28 monthly rows, January 2024–April 2026, UIC 000020838. | `SOURCE_PROOF.md`; real-source anchor tests in `test/normalize.test.mjs`; 28 original file hashes unchanged. | No annulus fields, complete original-document revision ledger, independent measurement verification or current reporting coverage beyond April. Reaching the monthly query cap fails before publication. |
| RRC-03 / P0 | Original string identities/leading zeros retained; duplicates/revisions, ambiguous/unmatched parents and invalid values remain inspectable with explicit dispositions. | `src/normalize.mjs`, `test/normalize.test.mjs`; source-key and QC detail in `public/app.js`. | No undocumented preferred revision selection. Original-document identities unavailable in source remain disclosed. |
| RRC-04 / P0 | Dictionary/quality counts reconcile; missing versus zero/parse failure and units remain distinct in tables, chart and downloads. | Original dictionary/QC artifact files; `test/normalize.test.mjs`, `test/inspection.test.mjs`. | Overlapping issue counts differ from mutually exclusive row dispositions; permit maxima remain constraints. |
| RRC-05 / P0 | Explicit new-version export with automatic conflict refusal and byte-identical replay; original artifact and independent Analytics copy/pin validate. | `src/artifact.mjs`, `src/pipeline.mjs`, `test/versioning.test.mjs`, current verification and Analytics validator check. | New version adoption needs separately reviewed pin curation. No automatic consumer acknowledgement. Crash recovery/stale-lock cleanup not implemented. |
| RRC-06 / P0 | Full inventory table, county/operator/search filters, consistent selection/details/history, complete-snapshot downloads; local desktop/mobile/keyboard checks pass. | `public/index.html`, `public/app.js`, `public/inspection.js`; current verification; actual browser-saved CSV hash. | Focused keyboard checks are not a complete accessibility audit. Production/portfolio return links remain unconfigured. |
| RRC-07 / P1 optional | OPEN: GIS/map not implemented. | Original PRD retained; owning scope excludes unapproved geographic expansion. | Source CRS/coordinates, surface/bottom role, reliability and missing-coordinate behavior require a separate authorized work package. Optional for core deadline, still planned. |
| RRC-08 / P2 | OPEN: scheduled refresh/statewide expansion not implemented. | Bounded CLI refresh only; no scheduler or trigger UI. | Reviewed access limits, pagination/completeness, version differences and expanded QC remain required before coverage expansion. |
| RRC-09 / owner-added P0 | Fixed read-only collection map implemented from the actual three execution boundaries plus external consumer boundary; selected node shows evidence/downloads. | `public/workflow-ui.js`, `public/workflow.js`; mobile390×844 and keyboard selection/scroll checks. | Independent UI review pending. No editor, rearranging/drag-drop or Run/Retry/Schedule controls. Historical events and consumer acknowledgement stay unrecorded. |
| RRC-10 / owner-added P0 | Actual offline replay and controlled failure records persist separately; IDs, versions, chronological events, counts, source/output hashes, safe errors and downstream skips validate. Live collection uses the same recorder. | `src/runEvents.mjs`, `src/pipeline.mjs`, `src/acquisition.mjs`, `scripts/serve.mjs`; event/history/acquisition tests; actual record IDs in current verification. | Terminal-only history is not crash-safe live monitoring. Fresh live collection not run. Consumer acknowledgement absent, correctly unrecorded. Independent contract review pending. |

## Completion-plan work packages

| Package | Owning result | Open integrated gate |
|---|---|---|
| D1 — useful owning docs | README/SPEC/design, glossary, this tracker, ADR with ticket convention, dated verification. Existing AGENTS/source proof preserved. | Main reconciles sibling planning/portfolio records; no sibling edits made here. |
| E1 — immutable export | Explicit sourceDir/artifactId, cached snapshot bytes, fixed source checks, staging/lock/readback, byte conflict refusal and new-version tests. | Review new pin adoption independently; no automatic repin. |
| E2 — inspection truth | Full inventory table/operator filter, identity/QC, clear filter-selection behavior, missing/zero chart and all-snapshot download scope. | Independent browser review and production links. |
| E3 — actual map/run evidence | Fixed map, real offline success/failure, persisted read-only history, shared live/offline recorder, historical/fixture/consumer distinctions. | Independent review; live fetch and crash journal not established. |
| G2 — Explorer local gate | Automated suite, syntax, original hashes, current Analytics validator/pin and focused browser/download checks pass; see dated packet. | Main's integrated fresh-browser/independence gate and independent Astra review remain open. Prior runtime independence evidence is historical. |
| P1-E / P2-E | Retained as RRC-07 / RRC-08 above. | Not silently waived or counted complete. |
| G3 — deployment/portfolio | OPEN; outside this authorized repository task. | No deploy, published URL or portfolio return destination invented. |

Core local criteria are implemented and checked within the bounded source proof. This does not declare the entire PRD, all planned priorities or integrated delivery complete.
