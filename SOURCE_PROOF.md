# Official source proof — October 9, 2026

## October 10 additional live website proof

The original October 9 evidence below remains unchanged. A separate website lookup and bounded collection on October 10 produced new version `rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0`, actual run `c24eb125-53eb-42cb-9d5a-d73c5387ce05` at 05:37:32–05:37:35UTC. Exact UIC 000020838/source API 38910201 was explicitly selected; monthly bounds January 2024–April 2026 returned 28 public rows and one inventory parent, with zero quarantined rows. Retrieval time does not establish reports beyond April 2026 or current operating status.

All lookup/selection/collection bytes, retrieval sidecars, metadata, documentation and publication pins are retained in that new artifact. Actual Analytics whole-artifact validation, independent deterministic 27-file rebuild, four literal source anchors, complete 28-file browser-saved TAR and original-source/pin preservation pass. Detailed hashes, source IDs, commands and limitations are in `docs/verification-2026-10-10-acceptance.md`, `docs/review-2026-10-10-bounded.md` and `tmp/acceptance-review-2026-10-10/new-version-proof.json`. Fixtures remain explicitly classified and are rejected by the public consumer path. No old evidence was relabeled or replaced.

## Source and acquisition

The [official RRC Injection-Storage Resources page](https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/) identifies the Texas Open Data Portal as an official state repository and names both the UIC inventory and monthly H-10 datasets. Acquisition used their public bounded JSON endpoints, not the interactive query site's bulk access.

| Source | Official dataset | Retrieved UTC | SHA256 of response bytes |
|---|---|---|---|
| Inventory | [givw-z9t4](https://data.texas.gov/d/givw-z9t4) | 2026-10-09T11:11:47.999Z | `2bb2e506dea368726dcecfb5ad30f6a84fe3c5da8f3b43b0cf735a214396b45c` |
| Monthly H-10 | [qq2j-f2zm](https://data.texas.gov/d/qq2j-f2zm) | 2026-10-09T11:11:48.192Z | `de475d2906f07f5759d31627f0855bcaeb4145cb2752893e4dcf0b3b68ee5aed` |

Exact encoded query URLs, response byte counts, Last-Modified/ETag, dataset metadata update epochs and seven evidence-file hashes are recorded in `artifacts/rrc-2026-10-09-uic000020838-v1/manifest.json`. Source metadata update epochs are 1790858146 (inventory) and 1790862225 (monthly), with HTTP Last-Modified on October 1, 2026. Retrieval date does not imply data through October 2026.

Inventory selection: API prefix `389`, injection type `1`, no source cancellation date, no source plugged date, ordered by UIC, limit five. This is a bounded candidate selection, not an assertion of current operation. Monthly selection: exact `uic_no='000020838'`, dates from January 1, 2024, ordered by date then source `id`, limit 1,000. The API returned 28 rows, below the cap. The inventory intentionally reached its five-row bound and is not a complete county inventory.

## Parent identity and independently entered anchors

Raw inventory ordinal 1 contains UIC `000020838`, API_NO `38910201`, operator number `103834`, lease number `17459`, well `5D`, lease `TREES, J. C. ESTATE, ET AL -A-`, W-14 `7412`. All monthly rows carry exactly the same original nine-character UIC string. The parser joins by that string only, after requiring one retained parent; eight-character API is preserved but never used to join.

The initial official response was inspected directly before the expected anchors were entered in `test/normalize.test.mjs`:

| Raw monthly ordinal / original ID | Period | Source vol_liq | Source inj_press_avg | Source inj_press_max | Reconciled normalized values |
|---|---|---|---|---|---|
| 1 / `3775425` | 2024-01 | `17173` | `900` | `900` | 17,173 bbl; separate 900 psi average and maximum; 31 days; 553.9677419354839 calculated bbl/day |
| 2 / `3775426` | 2024-02 | `17927` | `900` | `900` | 17,927 bbl; separate 900 psi average and maximum; 29 days; 618.1724137931035 calculated bbl/day |
| 28 / `3775452` | 2026-04 | `4799` | `900` | `900` | 4,799 bbl; 30 days; 159.96666666666667 calculated bbl/day |

All twelve 2024 liquid volumes are asserted independently in the test: 17173, 17927, 17989, 15119, 22427, 23579, 24010, 15980, 15820, 16072, 16108, 19670. Totals are 221,874 bbl in 2024; 184,263 bbl in 2025; 26,061 bbl for the four acquired 2026 months. These are totals of acquired monthly reports, not estimates of daily operation. All 28 gas volumes are reported zero; no missing gas value was replaced with zero.

## Units and field definitions

The preserved [official UIC manual](https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf), printed page II.35 (PDF page 42), defines monthly average/maximum injection pressures as pounds per square inch, liquid volume as barrels, gas as MCF, and spaces as not reported. Printed pages II.10–II.11 (PDF pages 17–18) define injection type 1 as W-14 disposal into a nonproductive zone, authorized liquid maximum in barrels/day and permitted depths in feet. [Official UIC query help](https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html) names maximum liquid pressure as PSI and maximum liquid volume as BBLS/Day.

ODP metadata has empty field descriptions. The exported mapping uses actual ODP field names and the associated official H-10/permit definitions; it does not invent a pressure datum conversion. Source pressure is exported as psi and not relabeled as bottom-hole pressure or reservoir pressure. The raw monthly ODP schema contains no annulus fields; unavailable annulus values are explicitly documented rather than synthesized.

## Quality and limits

Five raw inventory rows = five parsed = five accepted + zero quarantined + zero excluded. Twenty-eight raw monthly rows = 28 parsed = 28 accepted + zero quarantined + zero excluded; matched 28, unmatched zero, ambiguous zero. No duplicate periods/source report IDs or parse/null issues occur in this snapshot. Separate focused fixture tests cover ambiguous/unmatched parents, repeated report IDs/revisions, missing versus zero, invalid month/negative quantity and CSV quoting; those fixtures are test-only and are not evidence of acquisition.

All source rows are retained, including conflicts if present; duplicates would be quarantined without selecting a preferred revision. `most_recent_record` is preserved as an undocumented source flag. The dataset does not supply original document revision IDs or a complete revision ledger, so revision history completeness is not claimed. Reported measurements are not independently field-validated. No current well-status, daily measurement, BHP, injectivity or sustainable capacity conclusion is drawn.
# Refresh and execution evidence

The October 9 core completion preserves every original source/artifact byte referenced here. `src/sources.mjs` retains the exact seven selected official queries; `scripts/acquire.mjs` now requires a new snapshot directory and artifact ID, preserves response bytes/retrieval hashes and invokes the same export pipeline. Offline replay verifies the existing version without rewriting it; changed inputs cannot replace a published version. A monthly response reaching the 1,000-row cap fails before publication because completeness is unproven. See `docs/verification-2026-10-09-core.md` for actual offline execution records, version tests and unchanged hashes. No fresh live acquisition was run for that packet; it does not extend the sample's reporting coverage or turn source observations into independently verified measurements.

