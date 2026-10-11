# Texas RRC Explorer — UI revision and verification

This revision implements the requested collection, records and export/history views against the supplied RRC mockups and approved completion plan. It is **not full PRD acceptance**. The known fixture-to-public provenance defect remains unresolved, and this UI task does not close earlier parser/QC findings or the integrated delivery gate.

Preview: [Texas RRC Explorer](http://127.0.0.1:4189/). The older `4287` preview serves a review snapshot, not these edits.

Work was limited to `C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer`. No commit, push, deployment, permission-setting change, live acquisition, or original-data re-export was performed. The original task window began 2026-10-09 23:29 UTC; its unchanged stop checkpoint was 2026-10-10 00:29 UTC.

## Reference and before-edit comparison

Both supplied images were accessible and inspected before editing:

- `ChatGPT Image Oct 9, 2026, 06_26_21 PM.jpg`: collection workflow, 1536 × 1024.
- `ChatGPT Image Oct 9, 2026, 06_26_27 PM.jpg`: records explorer, 1536 × 1024.

The original app was captured at a 1536 × 1024 browser viewport before edits. The initial capture used the review preview; its four initial UI files were compared with the owning repository's preserved originals. All implementation and final browser checks used the owning preview on port 4189.

| Area | Original app | Reference direction and implemented revision |
|---|---|---|
| Navigation | Single long page with a horizontal header | 188 px navy navigation rail, blue active item, white line icons; workflow, records, sources, quality and exports/history destinations. Mobile uses a persistent five-item top navigation. |
| Header / typography | Dark header; large sans-serif hero | White header, navy Georgia product title, compact Segoe UI content, 28 px desktop view headings and smaller evidence labels. A truthful bounded-snapshot label replaces concept/simulation labels. |
| Panel arrangement | Map, JSON inspector, inventory table and filters stacked | Workflow canvas beside its inspector, run metrics below the canvas, chronological log underneath. Records filters/table sit beside the selected well/report. Exports pair version/downloads with provenance/history. |
| Spacing / color | Large hero and section gaps | Compact 8–20 px gaps, light blue-gray background, white bordered panels, pale blue section bands, blue selection, green recorded success, amber qualification and red errors. |
| Tables | Full-width inventory separated from filters/details | Compact headers, selected blue row with a blue leading rule, fixed first identity column and contained horizontal scrolling for all retained source/permit fields. Monthly rows remain accessible in a keyboard-operable disclosure. |
| Workflow nodes | Four broad blocks, with the consumer styled as a stage | Exactly three implemented collection stages on a dotted canvas, thin arrows, blue selected border and recorded status/count labels. External Analytics acknowledgement is a separate unrecorded boundary. |
| Node inspector | Raw JSON beneath the map | Overview, Inputs, Outputs and Raw evidence tabs; recorded times, identities, validation counts, hashes, references and redacted errors. Arrow/Home/End keyboard navigation is supported. |

Before-edit file scope was stated to the user: `public/index.html`, `public/style.css`, `public/app.js`, `public/workflow-ui.js`, plus focused view helpers/tests as needed. The chart was subsequently refined in `public/inspection.js` with gridlines and a labeled barrel scale; it continues to plot only actual observations.

## Connected behavior and requirement mapping

| Requirement | Revision / evidence | Limit |
|---|---|---|
| RRC-06 | Search, county and operator filters share one inventory table. Selecting a well updates identity, permit constraints, source references and acquired history. Selecting a month or report row updates the report inspector. Empty filters remove stale details. | Five acquired inventory candidates; monthly history for one UIC. Four records explicitly show history not acquired. |
| RRC-09 | Fixed read-only map uses `load`, `normalize-qc`, `export`. Node selection reveals evidence; mobile selection focuses and reveals the inspector. | No drag/drop, authoring, retry, run or schedule controls. The mockup's extra simulated stages are not implemented or represented as real stages. |
| RRC-10 | One run selection drives nodes, selected-stage evidence, metrics and chronological errors/logs. Previous evidence is cleared while loading or after a fetch failure. Selected run JSON is downloadable. | Historical acquisition events and consumer acknowledgement remain unrecorded. Existing terminal history is not live monitoring. |
| RRC-04 | Report details and export quality inspection retain dispositions and reasons; zero and missing values remain distinct. The presentation helper combines recorded row flags and disposition reasons without dropping either. | Existing parser/QC correctness findings remain open. The real pinned slice has no quarantined rows; reason preservation was tested with explicitly synthetic unit-test inputs. |
| RRC-05 | Version selector, manifest/payload hashes, schema/transformation information, source ledger and six whole-snapshot downloads. Run history links back to its exact invocation without changing the selected dataset. | Only the one independently pinned version exists here. There is no arbitrary/unreviewed version browser or consumer acknowledgement. |
| RRC-01 / RRC-02 / RRC-03 | Original identifiers, source anchors, normalized values and source bytes retained and tested. | Acquisition, normalization, linker and exporter implementation were not changed. This is preservation evidence, not new correctness acceptance. |
| RRC-07 / RRC-08 | No change. | Optional GIS and scheduled/statewide collection remain outside scope. |

The records summary derives **5 inventory records, 1 linked UIC and 28 monthly observations** from the loaded pinned artifact. The successful run independently supplies **5 accepted inventory rows, 28 matched monthly rows, 0 quarantined monthly rows and 7 input references**. No simulated mockup counts are used.

## Screenshots

Desktop captures use a 1536 × 1024 viewport, matching the supplied references. Mobile captures use 390 × 844; full-page files retain content below the fold. Screenshots are actual browser captures, not regenerated mockups.

The browser exports some JPEGs at slightly smaller pixel dimensions than the CSS viewport. Exact image dimensions, changed-file hashes and the 56-file preservation result are recorded in [verification metadata](ui-evidence/verification-metadata.json); no screenshot resizing or image editing was performed here.

| State | Desktop | Mobile |
|---|---|---|
| Before edits | [Original app](ui-evidence/before-desktop.jpg) | — |
| Collection workflow | [Workflow](ui-evidence/workflow-desktop.jpg) | [Full workflow](ui-evidence/workflow-mobile.jpg), [selected-node detail](ui-evidence/node-detail-mobile.jpg) |
| Data explorer | [Records](ui-evidence/records-desktop.jpg) | [Full records view](ui-evidence/records-mobile.jpg) |
| Export/history | [Exports](ui-evidence/exports-desktop.jpg) | [Full exports view](ui-evidence/exports-mobile.jpg) |
| Recorded failure | [Actual failed invocation](ui-evidence/failed-run-desktop.jpg) | Exercised through history navigation |
| Empty records | [No matches](ui-evidence/empty-records-desktop.jpg) | Responsive layout checked |
| Test-only unavailable run | [HTTP failure state](ui-evidence/test-only-unavailable-run.jpg) | — |
| Test-only mismatching pin | [Rejected dataset state](ui-evidence/test-only-pin-failure.jpg) | — |

Direct visual comparison with the references confirmed the navigation rail, header treatment, two-column records layout, canvas/inspector arrangement, status badges, selected-row styling and compact log. The final successful-run screenshot contains all six actual events. At mobile size, wide tables scroll inside their containers rather than expanding the page.

Remaining visual differences: the Texas silhouette is represented by a TX monogram; the map has three actual stages rather than the concept's larger simulated graph; the real linkage/report inspector replaces the concept's illustrative API-agreement diagram. Source/permit columns require horizontal scrolling. Detailed stage evidence can require scrolling inside the desktop inspector. No separate mobile mockup was supplied.

## Automated gates

The complete suite was run in a faithful copy at `tmp/ui-verification/snapshot`, because several existing tests record CLI invocations. This kept test-generated runs out of the original `runs/` directory. The final copy included the revised public files and presentation tests.

```powershell
node --test test/acquisition.test.mjs test/browser-artifact.test.mjs test/history.test.mjs test/inspection.test.mjs test/normalize.test.mjs test/run-events.test.mjs test/server.test.mjs test/versioning.test.mjs test/presentation.test.mjs
```

| Gate | Result |
|---|---|
| Complete suite, initial sandbox attempt | **FAILED: 25 passed, 13 failed.** Known `EPERM realpath` and `EACCES 127.0.0.1` restrictions prevented filesystem/publication and local-HTTP checks. |
| Same suite, approved local execution in the isolated copy | **PASS: 38/38**, including a rerun against the final JavaScript. No skipped tests. |
| `node --check` for every `public/*.js` file | **PASS: 6/6** (`app`, `artifact-integrity`, `inspection`, `presentation`, `workflow-ui`, `workflow`). |
| Focused source, integrity, chart and presentation checks | **PASS: 14/14** before the complete suite. |
| Preserved-file SHA-256 comparison | **PASS: all 56 original files unchanged**: raw sources, artifact files, independent browser pins and 27 original run records. |
| Browser console on the owning preview | **PASS:** no captured errors or warnings at the final check. |

The sandbox failures were environmental, but are recorded as failed attempts rather than passes. No dependency installation, npm/npx shim, Vitest, Python test runner, Git write or permission-setting change was used. This dependency-free project has no configured TypeScript or ESLint gate.

## Browser and download checks

[Detailed browser observations](ui-evidence/browser-checks.json) record the performed checks and DOM evidence.

- Successful run `4c62874f-07d3-437d-b2fd-3ee5d1518436`: three succeeded stages, six events, correct stage times, input/output references and counts.
- Failed run `dc99b8e9-aa1c-429a-ac6e-cf24f8d47d0a`: recorded `MANIFEST_PIN_MISMATCH`, downstream skipped stages, no inherited success counts or output claims.
- Historical selection: all stages unrecorded, counts unavailable, no invented original run log/download.
- Test-only unavailable-run response after a successful selection: nodes, inspector, counts and log cleared; download hidden. Test-only bad pin: no dataset counts, record rows or dataset downloads, and data filters disabled. Temporary test servers substituted read responses only and were stopped after verification.
- Search `000022085` and keyboard selection: one matching parent, explicit history-not-acquired message. Search with no match: no stale identity, report or source details. County `Reeves` plus operator `103834`: one record.
- February report: 17,927 reported bbl, 0 reported MCF, separate 900 psi average/maximum, 618.17 calculated bbl/day. Table selection of April: report `3775452`, 4,799 bbl and 159.97 calculated bbl/day.
- Keyboard Space selects nodes and inventory records; arrow/Home keys operate inspector tabs; Enter opens disclosures; arrows scroll both inventory and monthly tables. The skip link preserves the active records view.
- Mobile selection focuses/reveals well and node inspectors beneath the persistent navigation. All five navigation destinations fit; no horizontal page overflow was observed in workflow, records or export views.
- Source ledger: seven retained sources with original URLs, retrieval times, byte counts and hashes. Source/quality navigation focuses the requested section.
- Export history selects the correct invocation while preserving the pinned dataset version. Six dataset links remain whole-snapshot links independently of record filtering.
- No editable node controls, draggable nodes or collection-trigger buttons were found.

The first keyboard-scroll observation was marked **FAIL** because it sampled the browser before scrolling settled (`inventoryLeft: 0`, `monthlyTop: 4`). The subsequent completed movement was **PASS** (`40`, `40`, 28 report rows, no page overflow). This initial observation remains in the JSON record. A mobile test's initial 90 px top-position assumption also failed at the end of a short page; the correctly focused well inspector was visible at 112 px below navigation. The visibility assertion was corrected; no app failure was hidden.

| Saved browser download | Verified result |
|---|---|
| [Monthly CSV](ui-evidence/downloaded-injection_monthly.csv) | 5,513 bytes; SHA-256 `1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3`, byte-identical to the pinned artifact. |
| [Selected failed run JSON](ui-evidence/downloaded-failed-run.json) | Correct run ID, `failed` status, four events, failed load plus downstream skips. |

The CSV browser confirmation took about 53 seconds; the run JSON confirmation took about 558 seconds despite a requested short timeout. Both eventually produced saved files which were verified. This delay remains an automation/runtime limitation; prompt download confirmation is not claimed. Original browser downloads were left in the user's Downloads folder; evidence copies are inside this repository.

## Changed files

Production UI:

- `public/index.html` — navigation, three connected views, evidence tabs, export/version/quality panels.
- `public/style.css` — reference-based desktop composition and responsive mobile layout.
- `public/app.js` — routing, consistent record/report selection, filters, source/version/quality display and truthful unavailable state.
- `public/workflow-ui.js` — run-driven map, inspector, metrics/log, history navigation, safe run download and loading/error cleanup.
- `public/inspection.js` — chart scale/grid/units; missing and zero semantics preserved.
- `public/presentation.js` — pure view helpers for counts, stage timing, safe references, filtering and disposition reasons.

Verification:

- `test/presentation.test.mjs` — five focused tests for missing evidence, stage isolation, filters, quarantine reasons and safe links.
- `docs/verification-2026-10-09-ui.md` — this report.
- `docs/ui-evidence/` — actual screenshots, browser observations, downloaded evidence, and final verification metadata.
- `tmp/ui-revision-backup/` — preserved pre-edit UI files and original-data hash inventory.
- `tmp/ui-verification/` — isolated test copy and test-only response-fault helper/logs. Not part of the production app; helper stopped.

## Remaining correctness and acceptance gaps

1. **Fixture-to-public provenance defect — explicitly unresolved.** `src/artifact.mjs:6` loads a snapshot without preserving the acquisition fixture marker; `src/pipeline.mjs:39` defaults a separate export invocation to `testFixture=false`. The known offline re-export path can therefore lose fixture provenance. These files were not modified. The UI's pinned public evidence and warning do not repair the pipeline or certify other versions. Passing the existing fixture tests does not close this defect.
2. Earlier review findings concerning timestamp canonicalization/duplicate detection, missing report IDs, permit consistency, query-scope validation and incomplete QC-count validation were not changed or re-audited by this UI revision. Existing tests are bounded evidence, not proof those findings are resolved.
3. The one pinned version is inspectable/downloadable. Additional unreviewed versions are not automatically discovered or adopted. Consumer acknowledgement stays unrecorded.
4. Focused keyboard/mobile checks are not a complete screen-reader or accessibility audit. Full integrated application acceptance, independent review and deployment remain open.

The UI implementation and the listed local checks are complete within this task's scope. Full product acceptance remains open.
