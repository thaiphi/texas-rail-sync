# Phase 2 design — BHP and SRT test-report connectors (RRC-13)

Date: 2026-10-29. Status: frozen contract for implementation.
- **Authority:** owner "start Phase 2" (2026-10-29); plan [review §7–8](../../expansion-prd-review-2026-10-17.md) Phase 2; [ADR 004](../../adr/004-wellbore-identity-and-relations.md) §3 and its sidecar/repin rule; decisions D7, D8 and D10.
- **Owner answers (2026-10-29):** local collection always produces v3; the live proof covers UIC 000020838, 000111186 and 000119875.
- **Design** by an Opus planner, read-only; rulings by Main.

## 1. Versioning

- **Scope.** A new `boundedTestScope(uic,start,end)` in `src/sources.mjs` returns `{...boundedScope(...), queryVersion:3, testReportLimit:1000}`. `boundedScope` stays v2, unchanged.
- **Who uses v3.** Only the local `scripts/serve.mjs` `/api/collect` switches to `boundedTestScope`, and it always produces v3 (owner). The HTTP request schema is unchanged. The hosted guest path stays v2 (D7).
- **Labels.** Pipeline `rrc-collection-v3`, transformation `rrc-odp-v2.1.0`. The acquisition marker keeps `schemaVersion:2`, and the provenance basis stays `recorded_official_acquisition_v2`.
- **Version checks.** Every `queryVersion===2` / `=== 2` decision becomes a shared `isBounded(scope)` (queryVersion 2 or 3), plus a `versionLabels(scope)` helper. The planner's site list:
  - `sources.mjs` :6 and :50
  - `acquisition.mjs` :12-13 and :26
  - `artifact.mjs` :44, :49, :57 and :134
  - `normalize.mjs` :24
  - `exportCore.mjs` :37, :40, :59 and :114
  - `pipeline.mjs` :42-43
  - `public/app.js` :119

  **Implementers must grep all of `src/`, `scripts/` and `public/` themselves and report every site against this list.**
- **Guest refusal.** `prepareArtifactFromReader` and `finalizeArtifactFromReader` refuse a v3 snapshot with `SOURCE_INVALID` ("test-report versions are local-only (D7)"). `src/hosted/*` is not edited, and `GUEST_EVIDENCE_NAMES` is unchanged.

## 2. Targets and queries

The v3 targets are the seven v2 targets, unchanged and in the same order, followed by four new ones:

| Name | URL |
|---|---|
| `bhp-metadata.json` | `https://data.texas.gov/api/views/qxfy-wcfs.json` |
| `srt-metadata.json` | `https://data.texas.gov/api/views/h54t-xnbi.json` |
| `candidate-bhp.json` | `https://data.texas.gov/resource/qxfy-wcfs.json?` + `URLSearchParams({'$where':"uic_no='<uic>'",'$limit':'1000','$order':'report_id,tracking_no,test_sequence_no'})` |
| `candidate-srt.json` | `https://data.texas.gov/resource/h54t-xnbi.json?` + `URLSearchParams({'$where':"uic_no='<uic>'",'$limit':'1000','$order':'report_id,tracking_no'})` |

- **Order.** There is no `:id` tiebreak, because preserved URLs are permanent and `:id` is unverified. The ordering is not a total order, but the cap exceeds each whole dataset (~581 BHP, ~337 SRT rows), so no paging ever happens.
- **Sidecars.** Each target gets a `.source.json` sidecar from the existing naming rule.
- **Cap.** Exactly 1000 rows gives `SOURCE_ROW_LIMIT`; more than 1000 gives `SOURCE_INVALID`. Either way nothing is published, a failed run is recorded and the raw bytes are kept.
- **Empty result.** `[]` means `confirmed_empty`. It never means "no test was conducted".
- **Window.** The test queries have **no reporting-window bound**, unlike H-10. Scope and Help say so.
- **Official documents.** Two official RRC documents, `srt-guidelines.html` and `bhp-permian-nto.pdf`, are appended after these four as preserved targets (section 9), giving 13 v3 targets in all.

## 3. Loading (`loadSnapshot`)

- For v3, after the selection block, load `candidate-bhp` and `candidate-srt` as kinds `bhp` and `srt`, and the two metadata files as `metadata`. They get the same endpoint, hash, host and status checks and the same retrieval filter, appended after the v2 entries.
- Source IDs: `sourceIds.bhp = qxfy-wcfs:<sha16>` and `sourceIds.srt = h54t-xnbi:<sha16>`.
- `snapshot.tests = {bhp, srt, rawBhp, rawSrt}` is kept in the private loaded-evidence proof. `buildArtifact` deep-compares it and never accepts caller-supplied test rows.
- `sourceScopeFlags` gains kinds `bhp`/`srt`: when `uic_no !== monthlyUic`, the flag is `source_scope:uic_no`, the run fails with `SOURCE_SCOPE_MISMATCH` and nothing is published (ADR 002).

## 4. Normalization (`src/testReports.mjs`, `normalizeTests`)

Grain: one retained source row. Rows are never merged or dropped.

- **Common columns:**
  - `source_row_key`: `rrc:bhp:<sourceIds.bhp>:<ordinal>` or `rrc:srt:…`
  - `parent_key` and `parent_join_status`: exact UIC string per ADR 004 `inventory_to_test_report`
  - `uic_number`, `source_report_id` (`report_id` as a string), `tracking_no`, `source_snapshot_id`, `quality_flags`
- **BHP adds:** `test_sequence_no` (string); `report_conducted_date` with `report_conducted_date_text`; `report_received_date` with `report_received_date_text`; `bhp_psia`, `test_depth_ft`, `gradient_psi_ft`, `tested_formation`.
- **SRT adds:** `srt_received_date` with `_text`; `test_date` with `_text`; `satisfactory_test_code` (verbatim, with no meaning assigned to 0/1 unless section 9 cites one); `top_perf_ft`, `bottom_perf_ft`, `formation_tested`; `min_inj_rate_bpm`, `max_inj_rate_bpm`; `isip_psig`, `formation_frac_press_psig`, `frac_inj_rate_capacity_bpd`, `surface_pressure_firc_psig`, `fracture_gradient_psi_ft`; `comments`.
- **Dates.** The only accepted format is `^\d{4}-\d{2}-\d{2}$` that is also a valid Gregorian date. The preserved `cachedContents` top/smallest/largest values for all four date columns are in this form. Missing or empty gives `missing:<field>`, which is accepted. Anything else gives `parse_failure:<field>`, which is quarantined. The original text is always kept in `_text`. The live proof re-confirms the format.
- **Numbers.** Use the existing strict `numberField`. Missing becomes null, zero stays zero, and a parse failure is quarantined. `invalid_negative` applies to the ft, bpm, bpd and psia fields, and never to psig fields. Values are never converted.
- **Consistency flags:** `inconsistent:top_perf_exceeds_bottom` and `inconsistent:min_rate_exceeds_max`.
- **Duplicate reports.** `duplicate_report_identity` is set on every occurrence of a duplicated key, and those rows are quarantined. The key is `report_id|tracking_no|test_sequence_no` for BHP and `report_id|tracking_no` for SRT. An empty `report_id` gives `invalid:source_report_id`.
- **Disposition** reuses the existing rule.
- **Reconciliation.** For each dataset: raw = parsed = accepted + quarantined (+ excluded = 0).

## 5. Output (additive sidecars; D10)

The files `tests.json`, `tests_bhp.csv`, `tests_srt.csv` and `tests_dictionary.json` are appended to `manifest.files` after all `sources/` entries. `data_dictionary.json` is **not** extended.

- **`tests.json`:** `{schemaVersion:1, artifactId, scope:{query_version:3, uic_number, test_report_limit:1000, order, bhp_returned, srt_returned, bhp_status, srt_status, window:'exact uic_no; not limited to reporting period'}, bhp:[…], srt:[…], quality:{bhp, srt, parent_join, issue_counts, dispositions, duplicate_policy, empty_result_policy}}`. It has no embedded manifest; its integrity chain runs pins → manifest → `files['tests.json']`.
- **`tests_dictionary.json`:** the same shape as `data_dictionary.json`, with one entry per CSV column: `{units, status, definition, source_field}`.
  - Units come from the field names: psia, psig, ft, bbl/min ("bpm as named"), bbl/day and psi/ft.
  - The basis is the ODP field-name suffix, together with any official citation from section 9.
  - Status is `public reported` or `calculated`; fixtures are `synthetic`.
- **Run evidence** is additive only:
  - `normalize-qc` gains `testReports:{bhp:{raw,parsed,accepted,quarantined,excluded}, srt:{…}}`.
  - `outputs` stays at exactly two entries.
  - `loadInputs` gains counts for `bhp` and `srt`.

## 6. Regression criterion (revision of the review §8 wording)

The review's §8 criterion — "the six v1 files for the new version are byte-identical to what the v1 pipeline would produce" — **cannot be met under D10**. Listing sidecars in `manifest.files` changes `manifest.json`, and `normalized.json` embeds the manifest.

**The replacement criterion, adopted by Main and disclosed in SPEC and the PR:**
- **Byte-identical:** `inventory.csv`, `injection_monthly.csv`, `quality_report.json` and `data_dictionary.json`; and `manifest.normalized_payload_sha256` is identical.
- **Equal except for a closed list:** `manifest.json` must deep-equal the v2 manifest once this delta is removed:
  - `transformation_version`
  - `scope.query_version`, `scope.test_report_limit`
  - the appended BHP/SRT (and official-document) `sources` entries
  - the appended `files` entries
  - `files['sources/acquisition.json']`
  - the appended `limitations` entry
- **`normalized.json`:** minus `.manifest`, it is identical.

The test builds v3 in fixture mode, derives the v2 directory by copying the v2-named files and rewriting only `acquisition.json`, exports both under the same `artifactId`, and asserts the criterion above.

## 7. Contract checks and gates

- **No change:** the archive/TAR builders and the version registry. They already enumerate `manifest.files`.
- **New sidecar loader.** `public/artifact-integrity.js` gets a new export, `loadVerifiedSidecar(artifact, integrity, name, fetchImpl)`. It requires `name` to be in `manifest.files` and an exact SHA-256 and byte-count match. Existing functions are untouched.
- **Analytics.** `analyticsReady` is false when `scope.query_version === 3`, with the message: "Test-report versions are not sent to Analytics until the receiver accepts additive files (D10, Phase 6)."
- **Hosted transfer.** `scripts/prepare-supabase-archive.mjs` skips (and logs) any query_version 3 version and its runs (D7).

## 8. Browser

- **Tab.** A "Tests" tab: `navigation.js` tabs, an `index.html` link, and a `tests-view` section.
- **Renderers.** Pure renderers live in the new `public/tests-view.js`:
  - two tables with units in the headers, taken from `tests_dictionary.json`;
  - original date text, disposition and reasons;
  - a "public reported" label;
  - no charts, derived values or comparisons with permit limits.
- **States:**
  - A version without the sidecars shows "Test reports were not collected for this version." This covers v1/v2 and guest.
  - An empty result shows "No rows were returned by the exact-UIC query; this does not show that no test was conducted."
- **Downloads** list the four sidecars when present.
- **Help text:** "ODP BHP/SRT datasets are report inventories: one summary row per reported test, without test documents or pressure series. Values are shown as reported; psia and psig are kept as labelled and not interpreted."

## 9. Official unit/meaning documents

Source research (Opus, read-only, 2026-10-29) found no ODP data dictionary, attachment or column description for either view. Two official RRC documents define the concepts, and both are appended to the v3 targets after `candidate-srt.json`. Each gets the standard `.source.json` sidecar and the existing rrc.texas.gov host rules. They are fetched without a token, since the token goes only to data.texas.gov.

| Name | URL | Supports |
|---|---|---|
| `srt-guidelines.html` | `https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/` | SRT purpose, fracture (parting) pressure, fracture gradient in psi/ft, ISIP recorded at shut-in, stepped injection rates |
| `bhp-permian-nto.pdf` | `https://www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf` | BHP method and unit, p.1. **Permian districts 7C, 8, 8A and Fisher County only.** It says "Operator shall report pressure (PSIG)". |

Dictionary rulings for `tests_dictionary.json`. Every entry carries `basis`, either `odp_field_name` or `official_document:<name>[, page]`, plus the note "ODP publishes no column descriptions".
- **`bhp_psia`:** units "psia as named by the ODP field". The note must say: "Official RRC Permian guidance (bhp-permian-nto.pdf p.1) states BHP is reported in PSIG; the ODP field name says psia. The conflict is unresolved; the value is shown as published and never converted."
- **SRT `fracture_gradient_psi_ft`, `formation_frac_press_psig`, `isip_psig`, `min_inj_rate_bpm`/`max_inj_rate_bpm`:** these cite `srt-guidelines.html` for the concept only.
  - `isip_psig`'s note says the guidance records ISIP at both the surface and the bottom hole, so which one this column holds is unstated.
  - The rate units come from the field name.
- **BHP `gradient_psi_ft`:** the meaning is unstated, and the note says "not the SRT fracture gradient".
- **`surface_pressure_firc_psig` and `frac_inj_rate_capacity_bpd`:** "FIRC is not defined in any RRC document found; meaning unverified". No expansion of the abbreviation is asserted.
- **`satisfactory_test_code`:** the values 0/1 are shown verbatim with "code meaning undocumented".
- **`test_sequence_no`, `tracking_no`, `report_id` and `comments`:** identity or verbatim text, with "meaning undocumented".
- **`test_depth_ft`:** "depth basis unstated".
- **Not cited:** Form W-7, which covers oil and gas wells, not UIC; the conference slides; and the versioned review spreadsheet.

## 10. Tests (must exist)

- **Empty result:** BHP/SRT `[]` publishes `confirmed_empty`, and 0 = 0 + 0.
- **Duplicate identity:** duplicates are quarantined, and a pair that differs only in `test_sequence_no` stays accepted.
- **Dates:** an invalid date, Feb 30 and a non-ISO string are quarantined; a missing date is accepted; the original text is kept.
- **Numbers:**
  - `''` becomes null and `'0'` stays 0;
  - `'1,234'` is a parse failure;
  - a negative psig value is accepted, but a negative psia value gets `invalid_negative`.
- **Cap:** 1000 rows gives `SOURCE_ROW_LIMIT` and 1001 rows gives `SOURCE_INVALID`. Nothing is published, a failed run is recorded and the raw bytes are kept.
- **Scope:** `uic_no` ≠ the selected UIC gives `SOURCE_SCOPE_MISMATCH`.
- **Dictionary:** every column is covered and the units are correct.
- **Tampering:** a modified `tests.json` is refused by package verification and by `loadVerifiedSidecar`.
- **Regression criterion:** section 6.
- **Old versions:** all committed versions replay byte-identically.
- **Guest:** v2 output, URLs and evidence names are frozen, and v3 is refused.
- **Server:** `/api/collect` produces v3 with the request schema unchanged.
- **Browser:** not collected, empty, quarantined rows, unit headers, a rejected hash, the Analytics gate and the Help text.
- **Fixtures:** stored under `test/fixtures/test-reports/`, with the metadata copied from `raw-discovery-2026-10-29/`.

## 11. Live proof (after merge-ready code; Main, owner-authorized wells only)

- **Wells:** three local v3 collections, for UIC 000020838 (expected `confirmed_empty`), 000111186 (BHP rows) and 000119875 (SRT rows).
- **Each proof records:** raw = parsed = accepted + quarantined, the date format, and that the URL with `$order` was accepted.
- **Token:** the app token from `TRRC_SOCRATA_APP_TOKEN`.
- **Pins:** default and Analytics pins are unchanged.
