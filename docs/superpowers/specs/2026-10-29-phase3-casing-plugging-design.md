# Phase 3 design — API-keyed wellbore casing and plugging connectors (RRC-14)

Date: 2026-10-29. Status: **frozen for implementation except section 9** (2026-10-29). Every decision in section 13 was ruled on with its recommended option. Section 9 is completed from the OD-5 research before Task 1 is dispatched. Items marked **[OD-n]** follow those rulings.
- **Authority:** owner "merge PR #8 then start the next phase" (2026-10-29); plan [review §7](../../expansion-prd-review-2026-10-17.md) Phase 3 row and §8 Phase 3 criteria; [ADR 004](../../adr/004-wellbore-identity-and-relations.md) §1–3 (normative); decisions D4 (independent identity review before merge), D7 (local only), D10 (additive sidecars, `schemaVersion: 1`); requirement RRC-14 ([tracker](../../requirements.md) row RRC-14).
- **Evidence:** [Phase 3 API format proof](../../verification-2026-10-29-phase3-api-format-proof.md) (raw bytes in `raw-discovery-2026-10-29-api-proof/`), preserved view metadata `raw-discovery-2026-10-29/casing-u9m4-xnh6.json` and `plugging-wfzn-9fje.json`, [source discovery](../../source-discovery-2026-10-29.md).
- **Model:** the merged [Phase 2 design](2026-10-29-phase2-bhp-srt-design.md). Every Phase 2 rule not changed here applies unchanged.
- **Out of scope:** the relation catalogue file, the dossier and the depth ladder (RRC-15, Phase 3b); bottom location `uumf-5r4y`; GIS; statewide refresh; hosted parity.
- **Design** by an Opus planner, read-only. Line numbers refer to commit `d5826b3`.

The SPEC cut this phase must respect, quoted from `SPEC.md:106`:

> "No GIS, statewide extraction, permitting, LLM, private data, operational compliance conclusion, sustainable capacity or BHP calculation."

## 1. Versioning

- **A new query version 4 is forced; extending v3 is not possible.** Three v3 versions are committed (`artifacts/rrc-2026-10-29-uic000020838-a8606089-…`, `…uic000111186-fbee3ba0-…`, `…uic000119875-b911ce3c-…`, each with `scope.query_version: 3`). `loadSnapshotFromReader` requires the recorded `acquisition.targets` to equal `targetsForScope(scope)` exactly (`src/artifact.mjs:53`), and the replay test rebuilds every committed version byte for byte (`test/test-reports-pipeline.test.mjs:144-155`). Adding targets to v3 would break all three.
- **Scope.** A new `boundedWellboreScope(uic,startMonth,endMonth,apiNo)` in `src/sources.mjs` (after `boundedTestScope`, `src/sources.mjs:60-62`) returns
  `Object.freeze({...boundedTestScope(uic,startMonth,endMonth),queryVersion:4,sourceApiId,wellboreLimit:1000,wellboreInventoryLimit:25})`,
  where `sourceApiId = (typeof apiNo==='string' && /^\d{8}$/.test(apiNo)) ? apiNo : null` **[OD-1]**. `sourceApiId` must live in the scope: `targetsForScope` re-derives the scope from its own fields and compares JSON (`src/sources.mjs:80-81`). Only an eight-digit string can reach a SoQL `$where`, so no quoting or escaping is needed. `boundedScope` and `boundedTestScope` are unchanged.
- **Who uses v4.** Only local `/api/collect`: `scripts/serve.mjs:63` switches from `boundedTestScope(...)` to `boundedWellboreScope(selection.row.uic_number,body.startMonth,body.endMonth,selection.row.api_no)`; the import at `scripts/serve.mjs:8` changes accordingly. Local collection therefore always produces v4. The owner confirmed this on 2026-10-29: v3 is no longer produced, and v1–v3 versions stay as they are. The HTTP request schema is unchanged. The hosted guest path stays v2 (`src/hosted/guest-steps.mjs:23-24,50-51,96`, not edited).
- **Labels.** `versionLabels` (`src/sources.mjs:7-11`) gains `queryVersion===4 → {pipelineVersion:'rrc-collection-v4',transformationVersion:'rrc-odp-v2.2.0'}`. The acquisition marker keeps `schemaVersion:2` (`src/acquisition.mjs:28,52`; checked at `src/artifact.mjs:53`), and the provenance basis stays `recorded_official_acquisition_v2` (`src/artifact.mjs:106`).
- **Shared predicates.** `src/sources.mjs` gains `isLocalOnly(scope) = Number.isInteger(scope?.queryVersion) && scope.queryVersion>=3`, used for every D7 refusal, so a later v5 cannot slip into the guest path. `isBounded` (`src/sources.mjs:6`) becomes `queryVersion` 2, 3 or 4. Test-report behaviour becomes `queryVersion>=3`; wellbore behaviour is `queryVersion===4`.
- **Every version-dispatch site** is listed in Appendix A with file:line. **Implementers must re-run the Appendix B greps themselves and report each hit against Appendix A**; Phase 2's planner list missed five sites.
- **Guest refusal.** `refuseTestReports` (`src/exportCore.mjs:30`) uses `isLocalOnly`. Its message stays byte-for-byte "test-report versions are local-only (D7)": the refusal is for the local-only version class, and the Phase 2 assertions on that text (`test/test-reports-pipeline.test.mjs:162` matches the full sentence, `:167` matches "local-only (D7)") stay unchanged. `prepareArtifactFromReader` keeps the v2 recorder for any local-only scope (`src/exportCore.mjs:147`: `isLocalOnly(detected)?null:detected`). `GUEST_EVIDENCE_NAMES` is unchanged.

## 2. Targets and queries

The v4 targets are the 13 v3 targets, unchanged and in the same order (`src/sources.mjs:78-86`, `:68-77`), followed by:

| # | Name | URL |
|---|---|---|
| 14 | `casing-metadata.json` | `https://data.texas.gov/api/views/u9m4-xnh6.json` |
| 15 | `plugging-metadata.json` | `https://data.texas.gov/api/views/wfzn-9fje.json` |
| 16 | `wellbore-inventory.json` | exactly `lookupTarget({kind:'api',value:sourceApiId}).url` (`src/sources.mjs:43-48`): `https://data.texas.gov/resource/givw-z9t4.json?` + `URLSearchParams({'$where':"api_no='<api>'",'$limit':'25','$order':'uic_number,api_no'})` |
| 17 | `candidate-casing.json` | `https://data.texas.gov/resource/u9m4-xnh6.json?` + `URLSearchParams({'$where':"api_no='<api>'",'$limit':'1000','$order':'record_sequence,id'})` |
| 18 | `candidate-plugging.json` | `https://data.texas.gov/resource/wfzn-9fje.json?` + the same parameters |

- **Order of steps (RRC-14, do not collapse).** Uniqueness first (16), then the connector queries (17, 18), all from the inventory row's own `api_no`. Acquisition fetches in target order (`src/acquisition.mjs:35-44`), and any failure stops the run (ADR 004 §2 rule 2).
- **Proof that these URLs are accepted.** The format proof ran target 16's exact URL form (`$limit=25`, `$order=uic_number,api_no`) and the casing/plugging form with `$order=record_sequence,id`; all nine sidecars show HTTP 200 (proof doc, "How it was run"; `raw-discovery-2026-10-29-api-proof/*.source.json`). Only `$limit` differs here (1000 instead of the proof's 50).
- **`sourceApiId === null` [OD-1].** Targets 16–18 are omitted (15 targets). The metadata files 14–15 are still preserved, so the version visibly "collected" the wellbore datasets and can say why no query ran (ADR 004 §2 rule 1, "No query is made").
- **Order is total.** Unlike Phase 2 (which avoided `:id`), `id` is a real number column of both views (metadata `id`, `null=0`), and it is the only unique row key observed (proof, "Findings": "The only unique row key observed is the source `id`"). `record_sequence,id` is therefore a deterministic total order as long as `id` is unique. A duplicate `id` is quarantined (section 4.3), so a non-total order cannot pass silently.
- **Cap.** 1000 rows per dataset query. Basis: casing `record_sequence` is at most 25 statewide and plugging at most 5 (metadata `record_sequence` `largest`). The proof well `20332896` returned 8 rows for 4 filings × 2 strings (proof doc). 1000 rows allows 40 strings in each of 25 filings, so the cap is a completeness guard, not an expected limit. Exactly 1000 rows gives `SOURCE_ROW_LIMIT`, and more than 1000 gives `SOURCE_INVALID` (ADR 004 §2 rule 4). The exact-API inventory response has its own cap of 25: more than 25 gives `SOURCE_INVALID`, and exactly 25 gives `ambiguous` with `inventory_cap_reached` (ADR rule 5; section 4.1). Nothing pages.
- **Empty result.** `[]` from 17 or 18 is `confirmed_empty`. It means "no rows returned". It never means "no casing exists" or "not plugged" (ADR 004 §2 rule 6). An empty response from 16 is a scope contradiction (section 4.1).
- **Window.** The wellbore queries have **no reporting-window bound** and no date filter.
- **Sidecars.** Each target gets a `.source.json` sidecar from the existing naming rule (`src/acquisition.mjs:40`).
- **No H-10 by API.** No target, for any version, sends `api_no` to `qq2j-f2zm`, and no casing, plugging or inventory-by-API target sends `uic`. A test asserts this over `targetsForScope` for v1–v4 (section 10).

## 3. Loading (`loadSnapshotFromReader`, `src/artifact.mjs:38-119`)

- **Flags.** `src/artifact.mjs:48` currently sets `testReports=scope.queryVersion===3`. This **must** become `>=3`, otherwise a v4 load silently drops BHP/SRT. Add `wellbore=scope.queryVersion===4`.
- **Selected API cross-check.** Directly after the exact-UIC identity check (`src/artifact.mjs:86`): `sourceApiId` must equal `inventory[0].api_no` when that is an eight-digit string, and must be `null` otherwise. A mismatch gives `SOURCE_INVALID` ("Selected inventory API changed"). This proves that every wellbore query came from the inventory row's own `api_no` (ADR 004 §1).
- **Load block.** After the v3 test block (`src/artifact.mjs:91-100`), for v4:
  - If `sourceApiId` is set, read `wellbore-inventory.json`, `candidate-casing.json` and `candidate-plugging.json`. Each must parse as a JSON array, or the run fails with `SOURCE_INVALID`.
  - Bounds: inventory length > 25 gives `SOURCE_INVALID`. Casing or plugging length > 1000 gives `SOURCE_INVALID`, and exactly 1000 gives `SOURCE_ROW_LIMIT`.
  - `sourceIds.wellbore_inventory = givw-z9t4:<sha16>`, `sourceIds.casing = u9m4-xnh6:<sha16>`, `sourceIds.plugging = wfzn-9fje:<sha16>`.
  - `loadSource` order: `['wellbore-inventory','wellbore_inventory']`, `['candidate-casing','casing']`, `['candidate-plugging','plugging']`, `['casing-metadata','metadata']`, `['plugging-metadata','metadata']`. When `sourceApiId` is null, only the two metadata entries.
  - **Kind names are constrained.** The new inventory query must not use kind `inventory`: `sourceCount` would report its rows as inventory rows (`src/exportCore.mjs:18`), the run validator would reconcile them against `counts.inventory.raw` (`public/workflow.js:46`), and `sourceScopeFlags('inventory',…)` would flag every other permit `source_scope:uic_number` (`src/sources.mjs:16`), which would turn an `ambiguous` case into a failed run.
  - **Title lookup.** `loadSource` derives a title by reading `kind+'-metadata.json'` (`src/artifact.mjs:75`). That works for `casing` and `plugging`. `wellbore_inventory` needs an explicit mapping to `inventory-metadata.json`.
- **Snapshot.** `snapshot.wellbore = {inventory, casing, plugging, rawInventory, rawCasing, rawPlugging}`, with the arrays and buffers set to `null` when not queried. It is added to the snapshot (`src/artifact.mjs:108`) and to the private loaded-evidence proof (`:111`). It needs its own `copyWellbore`/`sameWellbore`, beside `copyTests`/`sameTests` (`:24,:26`; those hard-code the keys `bhp,rawBhp,rawSrt,srt`). `buildArtifact` deep-compares it (`:126`) and never accepts caller-supplied wellbore rows.
- **Scope flags.** `sourceScopeFlags` (`src/sources.mjs:12-22`) needs explicit branches for `casing`, `plugging` and `wellbore_inventory` **before** the `else` at `:17`. That `else` treats any unknown kind as monthly and would flag every row `source_scope:uic_no` and `source_scope:formatted_date`. The new branches: `row.api_no !== scope.sourceApiId` gives `source_scope:api_no`.

## 4. Normalization (new pure module `src/wellbore.mjs`)

Modelled on `src/testReports.mjs`: pure, with no I/O. It reuses `numberField` and `csv` (`src/normalize.mjs:7-11,54`) and `rowDisposition` (`public/quality-validation.js:6`). Grain: one retained source row. Rows are never merged, collapsed or dropped (ADR 004 §3 `wellbore_to_casing`/`wellbore_to_plugging`).

Signature: `normalizeWellbore(wellbore, sourceIds, selected, scope, queries)`, where
- `selected` is `{row: canonical inventory[0] (normalized), raw: proof.inventory[0] (raw)}`;
- `queries` is `{inventory, casing, plugging}`, each `{url, sha256}` from the loaded `sources`, or `null`.

It returns `{casing:{link,rows,quality}, plugging:{link,rows,quality}, violations:[…]}`.

### 4.1 Wellbore link status (ADR 004 §2, applied in order; first rule wins)

There is exactly one inventory row per bounded version (`src/artifact.mjs:86`: `inventory.length!==1` fails), so each dataset has exactly one link.

1. `sourceApiId === null` → `none`, reason `api_missing_or_invalid`. No query was made; rows `[]`; scope status `not_queried`.
2. Query failure → the run already failed at acquisition (`src/acquisition.mjs:43`). No status exists.
3. Predicate contradictions are **violations, never statuses** [OD-11]:
   - any `wellbore-inventory` row with `api_no !== sourceApiId` → `source_scope:api_no`;
   - the inventory response is empty, or contains no row `sameIdentity` with the raw selected row (`src/lookup.mjs:10-12`: UIC, API, operator, district, lease number, lease name, well number, W-14 number) → violation `selected_row_absent`;
   - any casing or plugging row with `api_no !== sourceApiId` → row flag `source_scope:api_no`.

   The callers fail the run with `SOURCE_SCOPE_MISMATCH`. Nothing is published, a failed run is recorded and the raw bytes are kept in `collected-sources/`. This follows the Phase 2 practice (`src/exportCore.mjs:27`, `src/artifact.mjs:132`).
4. Cap reached → `SOURCE_ROW_LIMIT` at load (section 3). No status exists.
5. Inventory response has 25 rows → `ambiguous`, reason `inventory_cap_reached`. Two to 24 rows → `ambiguous`, reason `multiple_inventory_rows` **[OD-4]**. This applies to both datasets, whatever their row count, including zero.
6. Wellbore response `[]` → `none`, reason `no_source_rows`.
7. Otherwise → `matched` (reason `null`): exactly one inventory row carries the string, and every row's `api_no` equals it. This asserts string equality only. It does not assert one physical bore: "An eight-digit API cannot tell sidetracks or recompletions apart" (ADR 004 §2).

**Link object** (one per dataset, embedded in that dataset's sidecar):
```
{inventory_source_record_key, source_api_id, basis:'inventory_api_no',
 status:'matched'|'none'|'ambiguous', reason:null|'api_missing_or_invalid'|'no_source_rows'|'inventory_cap_reached'|'multiple_inventory_rows',
 inventory_query:{url,sha256,rows}|null, wellbore_query:{url,sha256,rows}|null,
 candidates:[{candidate_key, selected, uic_number, api_no, operator_number, district_code, lease_number, lease_name, well_no_display, w14_number}],
 wellbore_row_count}
```
- `candidate_key` is `rrc:uic:<sourceIds.wellbore_inventory>:<1-based ordinal>`.
- `selected` is `sameIdentity` with the selected raw row.
- Candidate values are coerced to strings exactly like `src/normalize.mjs:12`.
- Candidates are listed for every status that queried inventory (one candidate when `matched`). `inventory_cap_reached` lists all 25.
- Candidate rows never enter `inventory.csv` (D10).

**Ambiguous rows are accepted, not quarantined [OD-3].** "The wellbore rows are kept and shown under the wellbore, but they are attributed to no single UIC" (ADR 004 §2 rule 5). The ambiguity belongs to the inventory→wellbore relation, not to the source row, so no row flag is added. The relation is carried only by `link.status` and the per-row `wellbore_link_status` column. A flag beginning `ambiguous` or `unmatched` would quarantine the row (`public/quality-validation.js:5`), so no row flag may use those prefixes.

**Forbidden, enforced by shape:** casing and plugging rows carry **no** `uic_number` and **no** `parent_key`. They link to the wellbore (`source_api_id`), and only the link object links the wellbore to the inventory row (ADR 004 §3, "Casing or plugging → UIC directly, bypassing the inventory row" is not permitted). No code compares plugging rows with the inventory's `w3_plugged_date` (`src/sources.mjs:2` uses it only for the v1 query) or with `prod_casing_pkr_depth`, `top_inj_zone` or `bot_inj_zone`.

### 4.2 Columns

Common to both datasets, in this order:
- `source_row_key` = `rrc:casing:<sourceIds.casing>:<ordinal>` / `rrc:plugging:<sourceIds.plugging>:<ordinal>`
- `source_api_id` (= `scope.sourceApiId`)
- `wellbore_link_status`
- `source_id` (`id` as a string)
- `api_no` (verbatim)
- `record_sequence` (verbatim string)
- `on_top_record`

Then by dataset:
- **Casing:** `completion_date`, `completion_date_text`, `csg_size`, `hole_size`, `csg_depth`, `toc`, `multi_stg_depth`, `cmt_sacks`, `total_depth_g1w2`, `depth_reference`, `depth_reference_code`
- **Plugging:** `w3_date`, `w3_date_text`, `plug_top_depth`, `plug_bottom_depth`, `plug_cmt_sacks`, `total_depth_w3`, `depth_reference`, `depth_reference_code`

Both end with `source_snapshot_id`, `quality_flags`.

The field lists are exactly the non-system columns in `raw-discovery-2026-10-29/casing-u9m4-xnh6.json` (14) and `plugging-wfzn-9fje.json` (11).

### 4.3 Value rules

- **`record_sequence` is a filing sequence, not a key.** "Several casing strings share one `record_sequence`… A repeated `record_sequence` is therefore normal and must not be treated as a duplicate" (proof, "Findings"). It is kept verbatim, never parsed or used for order beyond the source `$order`, and **never flagged**. A missing value gives `missing:record_sequence`, which is accepted.
- **Duplicates.** The only duplicate rule is a repeated source `id` string within one response. Every occurrence gets `duplicate_source_id` and is quarantined (prefix `duplicate`, `public/quality-validation.js:5`). An empty or missing `id` gives `invalid:source_id`, which is quarantined. Rows that are identical apart from `id` and `record_sequence`/date, such as the same string re-filed, are normal and unflagged (proof: `20332896` repeats the 9.625 in and 5.5 in strings in four filings). No preferred row is chosen.
- **`on_top_record`.** The proof found it "a JSON boolean present only when true" and "absent (not `false`)" otherwise; it is "not the highest sequence" (seq 3 flagged, seq 4 older-dated; proof "Findings"). The metadata `top` holds only `true`.
  - JSON `true` gives `true`; absent or `null` gives `null`; JSON `false` gives `false` (never yet observed, kept verbatim).
  - Any non-boolean value gives `parse_failure:on_top_record` (quarantined), with `on_top_record` set to `null`.
  - CSV: `true`, `false` or empty.
  - Absence gets **no** `missing:` flag: it is the source's encoding for "not set", and flagging it would mark most rows (metadata casing `null=907543`).
  - Never derived from `record_sequence` or a date.
- **Dates.** `completion_date` and `w3_date` are `calendar_date` (metadata), and arrive as `YYYY-MM-DDT00:00:00.000` (proof "Findings"; metadata `smallest`/`largest`/`top`).
  - Accepted: exactly `^(\d{4})-(\d{2})-(\d{2})T00:00:00\.000$` with a valid Gregorian month and day (same validity test as `src/testReports.mjs:17-18`). The column gets `YYYY-MM-DD`, and `_text` keeps the original.
  - Missing or empty gives `missing:<field>` (accepted). Anything else, including another time of day or a plain `YYYY-MM-DD`, gives `parse_failure:<field>` (quarantined), with the original kept in `_text`.
  - There is **no plausibility rule** [OD-9]: metadata `completion_date` runs from 1900-01-03 to 2070-09-05, and `w3_date` from 1893-10-14. Values are shown as published.
- **Numbers** use the existing strict `numberField`. Numbers arrive as JSON strings (`"1547"`, `"0.0"`; proof "Findings"). Missing becomes null with `missing:<field>` (accepted), zero stays zero, and a non-numeric value is a quarantined `parse_failure`. Socrata omits null fields: `multi_stg_depth` is absent from all 12 proof casing rows (proof), so it is expected to carry `missing:multi_stg_depth` on most rows, accepted. **A published zero is kept as zero and never treated as missing.** For example, `total_depth_w3` is `"0"` on all three plug rows of API `16300331` (proof addendum). The dictionary says the meaning of a zero total depth is not stated by the source.
- **`invalid_negative`** applies to `csg_size`, `hole_size`, `csg_depth`, `toc`, `multi_stg_depth`, `cmt_sacks`, `total_depth_g1w2`, `plug_top_depth`, `plug_bottom_depth`, `plug_cmt_sacks` and `total_depth_w3` (metadata `smallest` ≥ 0 for each). It does **not** apply to `depth_reference`, whose meaning is undocumented.
- **Consistency flags.** Only `inconsistent:plug_top_exceeds_bottom` (when both are non-null and `plug_top_depth > plug_bottom_depth`, quarantined), the direct analogue of the SRT perforation rule (`src/testReports.mjs:48`). There is no `toc` vs `csg_depth` or `multi_stg_depth` vs `csg_depth` rule [OD-6]: the meaning of TOC, and whether `0.0` means surface or not reported, is undocumented (metadata `toc` top value `0.0`, largest `4000300.0`).
- **`depth_reference_code`** is verbatim text, with the meaning "undocumented in ODP metadata" (v1.1 review, casing row: "`depth_reference_code` meaning undocumented"; metadata values `GL`, `GR`, `KB`, `DF`, `RT`, `DB`, …). **`depth_reference`** is a number via `numberField`, with the meaning undocumented. No datum conversion.
- **Scope flags** come from `sourceScopeFlags(kind,row,scope)` (section 3).
- **Disposition** reuses `rowDisposition`.
- **Reconciliation per dataset:** raw = parsed = accepted + quarantined (+ excluded = 0).

### 4.4 Presence wording (no compliance conclusion)

The sidecars and UI state only whether rows were returned. They never state or imply that a well is or is not cased, cemented, plugged, abandoned, compliant or safe. Fixed strings:
- casing `none/no_source_rows`: "No casing rows were returned by the exact-API query; this does not show that no casing exists."
- plugging `none/no_source_rows`: "No plugging rows were returned by the exact-API query; this does not show whether the well is or is not plugged."
- `none/api_missing_or_invalid`: "The selected inventory row has no eight-digit API number, so no casing or plugging query was made."
- `ambiguous`: "Several inventory permits carry this API number. These rows belong to the reported API and are attributed to no single UIC."
- `matched`: "The source API string equals the selected inventory row's API string. An eight-digit API cannot distinguish sidetracks or recompletions."

## 5. Output (additive sidecars; D10)

`casing.json`, `casing.csv`, `plugging.json`, `plugging.csv` and `wellbore_dictionary.json` **[OD-10]** are appended to `manifest.files` after the v3 test sidecars (`src/artifact.mjs:165-172`). `data_dictionary.json` and `tests_dictionary.json` are **not** extended.

- **`casing.json` / `plugging.json`:**
  ```
  {schemaVersion:1, artifactId, dataset:'casing'|'plugging',
   scope:{query_version:4, source_api_id, wellbore_limit:1000, wellbore_inventory_limit:25, order:'record_sequence,id', returned, status:'returned_below_cap'|'confirmed_empty'|'not_queried', window:'exact api_no; not limited to reporting period'},
   link:{…section 4.1…}, rows:[…],
   quality:{counts:{raw,parsed,accepted,quarantined,excluded}, issue_counts, dispositions, duplicate_policy, empty_result_policy, presence_policy, record_sequence_policy, on_top_record_policy}}
  ```
  There is no embedded manifest. The integrity chain is pins → manifest → `files[name]`.
- **`wellbore_dictionary.json`** has the same shape as `tests_dictionary.json` (`src/testReports.mjs:108-125`): `row_grain`, `missing_value`, `date_policy`, `unit_policy`, `window`, `documents`, `order`, `tables:{casing,plugging}`, and per column `{units, status, definition, source_field, basis, note}`.
  - Every note starts "ODP publishes no column descriptions." (source discovery: "none of the 96 non-system columns has one").
  - `row_grain` must **not** repeat the ODP description "one row per API # per casing string" (casing metadata `description`). It says: "one retained official casing row (u9m4-xnh6); the source repeats a casing string in each filing (record_sequence), so a row is a string as reported in one filing". Plugging: "one retained official plugging row (wfzn-9fje)". The plugging grain is unproven by data (proof: 0 plugging rows).
  - **Units [OD-5].** No casing or plugging field name carries a unit suffix, and the G-1/W-2 and W-3 form documents have not been retrieved (source discovery "Official form references for units"; RRC-12 status "The form documents have not been retrieved yet"). Unless OD-5 adds them:
    - every numeric field gets units "not stated by the source";
    - `cmt_sacks` and `plug_cmt_sacks` get "sacks (as named)";
    - basis `odp_field_name`.

    No inch or foot unit is asserted.
  - Status is `public reported` or `calculated`; fixtures are `synthetic`.
  - Required notes: `record_sequence` "filing sequence shared by several rows; not a row key; repeats are normal"; `on_top_record` "true only where the source sets it; absent in source is shown empty and is not false; never derived from sequence or date"; `source_id` "the only observed unique row key"; `depth_reference_code` "shown verbatim; meaning undocumented in ODP metadata"; `toc` "zero kept as zero; whether 0 means surface or not reported is undocumented"; `wellbore_link_status` "inventory_api_no link status (ADR 004 §2); not a statement about the well".
- **Manifest delta (v4 only).** These are applied **after** the v3 block, which hard-codes `query_version=3` and `rrc-odp-v2.1.0` (`src/artifact.mjs:167`):
  - `transformation_version='rrc-odp-v2.2.0'`
  - `scope.query_version=4`, `scope.wellbore_limit=1000`, `scope.wellbore_inventory_limit=25`
  - one appended `limitations` entry: "Casing and plugging sidecars are exact-API filing records for the selected inventory row's own API (basis inventory_api_no), not limited to the reporting period; record_sequence is a filing sequence; presence or absence of rows is not a statement about casing, cementing or plugging status."
- **`tests.json` [OD-2].** `src/artifact.mjs:169` hard-codes `scope:{query_version:3,…}`. Recommended: use `scope.queryVersion`, so a v4 `tests.json` says 4, and add it to the regression delta. v3 output is unchanged.
- **Run evidence** is additive only:
  - `normalize-qc` gains `wellbore:{casing:{raw,parsed,accepted,quarantined,excluded}, plugging:{…}}`, a sibling of `testReports`, which stays.
  - `outputs` stays at exactly two entries (`public/workflow.js:54`).
  - `loadInputs` counts for `casing`, `plugging` and `wellbore_inventory` come from `sourceCount` (`src/exportCore.mjs:18`, which returns `null` today for unknown kinds).

## 6. Regression criterion (extends Phase 2 §6)

The test builds v4 in fixture mode. It derives the v3 directory by copying every v3-named file and rewriting only `acquisition.json` (scope `boundedTestScope`, v3 targets), exports both under the same `artifactId`, and asserts:
- **Byte-identical:** `inventory.csv`, `injection_monthly.csv`, `quality_report.json`, `data_dictionary.json`, `tests_bhp.csv`, `tests_srt.csv`, `tests_dictionary.json`. `manifest.normalized_payload_sha256` is identical.
- **`tests.json`:** deep-equal once `scope.query_version` is set back to 3 (under OD-2 as recommended; byte-identical under the alternative).
- **`manifest.json`:** deep-equal to the v3 manifest once this closed delta is removed:
  - `transformation_version`
  - `scope.query_version`, `scope.wellbore_limit`, `scope.wellbore_inventory_limit`
  - the appended `sources` entries, by name in order: `wellbore-inventory`, `candidate-casing`, `candidate-plugging`, `casing-metadata`, `plugging-metadata`
  - the appended `files` entries: the 10 `sources/` wellbore bytes and sidecars plus the 5 wellbore sidecars
  - `files['sources/acquisition.json']`, and `files['tests.json']` (OD-2)
  - exactly one appended `limitations` entry matching `/casing|plugging|wellbore/i`
- **`normalized.json`:** minus `.manifest`, it is identical.

The Phase 2 test (v3 against derived v2, `test/test-reports-pipeline.test.mjs:121-142`) stays unchanged and must still pass. Together the two tests chain v4 → v3 → v2.

## 7. Contract checks and gates

- **No change:** the archive/TAR builders and the version registry. They enumerate `manifest.files`. `loadVerifiedSidecar` (`public/artifact-integrity.js:26-38`) is reused unchanged; its name pattern accepts the five new names.
- **Analytics.** `analyticsReady` is false for `query_version >= 3`. Replace `!==3` (`public/app.js:35`) and `===3` (`:114`) with one shared helper. Message: "Test-report and wellbore versions are not sent to Analytics until the receiver accepts additive files (D10, Phase 6)." The version-pins download (`:122`, `[2,3].includes`) becomes `query_version >= 2`.
- **Hosted transfer** (`scripts/prepare-supabase-archive.mjs`):
  - `:17` `query_version===3` becomes `>=3`.
  - `:19` the collected-sources rule becomes "`acquisition.json` `scope.queryVersion>=3`, **or** any target URL matching `/\/(?:qxfy-wcfs|h54t-xnbi|u9m4-xnh6|wfzn-9fje)\.json/`". Both checks are kept so that failed or partial collections are caught.
  - `:20` the run rule becomes "`pipelineVersion` matches `^rrc-collection-v(\d+)$` with N ≥ 3".
  - `:11-12` comment updated.
  - The event name at `:30` stays `skipped_local_only_test_report_version`, for log continuity.
  - The fail-closed rule (`:21-26`) is unchanged.
- **Run validator** (`public/workflow.js:44-57`): a block beside `:47-53` validates `evidence.wellbore`. Its keys must be exactly `["casing","plugging"]`, each summary reconciles (same `valid` rule as `:50`), and each `casing`/`plugging` load input count equals its `raw`. The `testReports` check at `:51` (keys exactly `["bhp","srt"]`) stays and must not receive wellbore keys. `wellbore_inventory` inputs are not reconciled against `counts.inventory` (see `:46`).
- **D4 independent identity review** (Task 3) is a **merge gate**. No Phase 3 identity code merges without it (ADR 004 status line; D4).

## 8. Browser

- **Tab.** A "Wellbore" tab (`wellbore`):
  - added to `navigation.js:1` `tabs` (after `tests`);
  - an `index.html:11` nav link `<a data-tab="wellbore" href="#">Wellbore</a>`;
  - a `<section id="wellbore-view" class="view" … hidden>` with `<div id="wellbore-content">` after `tests-view` (`index.html:18`);
  - the `app.js:53` tab→view map;
  - `wellbore-content` added to the clear list in `dataset-state.js:4`.
- **Loader.** `showWellbore(artifact,integrity,view)` in `app.js`, a copy of `showTests` (`app.js:136-148`) with its own `createLatestRequest`. It verifies `casing.json`, `plugging.json` and `wellbore_dictionary.json` with `loadVerifiedSidecar` before showing any row, checks `artifactId` and `dataset`, and is called beside `showTests` at `app.js:161`.
- **Renderers.** Pure renderers live in the new `public/wellbore-view.js`: `wellboreCollected(manifest)` (`Object.hasOwn(manifest.files,'casing.json')`) and `renderWellboreView(state)`.
  - A **link panel** per dataset: `source_api_id`, basis `inventory_api_no`, status, reason, the section 4.4 sentence, the query URL and SHA-256, and the candidate table when `ambiguous` (`selected` marked). This is the inspector display required by review §8 [OD-8].
  - Two tables in source order, with units from the dictionary in the headers; `_text` dates; `on_top_record` shown as "true" or "not set"; `record_sequence` verbatim; disposition and reasons; a "public reported" label; a reconciliation line.
  - No charts, derived values, ordering by sequence or date, "latest" selection, comparison with inventory permit depths or `w3_plugged_date`, or depth ladder (Phase 3b).
- **States:**
  - "Casing and plugging records were not collected for this version." This covers v1–v3 and guest.
  - Loading.
  - Verification failure: no rows shown.
  - The section 4.4 strings.
- **Downloads.** `app.js:117-119` lists the five sidecars when present.
- **Help text** (in the section heading and Help, as Phase 2): "ODP casing (Form G-1/W-2) and plugging (Form W-3) datasets are filing records keyed by API number, queried with the selected inventory row's own API. A casing string can appear once per filing (record_sequence). Values are shown as reported; units are not stated by the source; reference codes are undocumented. Rows returned or not returned say nothing about casing, cementing or plugging status."
- **Test harnesses** must inject the new exports, or `app.js` will not load under test (Phase 2 left this to Main; this time it belongs to Task 2):
  - `test/navigation-redesign.test.mjs:53-56,133-134`
  - `test/version-race.test.mjs:9-10,15-18`
  - `test/tests-view.test.mjs:114-117`

## 9. Official unit and meaning documents [OD-5]

No official document is cited for casing or plugging units in this design. Source discovery names the needed references (G-1/W-2 completion reports for casing, W-3 plugging records) but did not retrieve them, and this planner had no network access.
- **Recommended:** a read-only Opus research task (web, no repository writes, like Phase 2 R7) finds the official RRC form or instruction URLs.
- Main then amends section 2 to append them as documentation targets 19 and onward, with the standard sidecars and the existing rrc.texas.gov host rules (`src/artifact.mjs:73`), **before Task 1 starts**. Dictionary entries may then cite `official_document:<name>[, page]`.
- If no official document is found, units stay "not stated by the source".

## 10. Tests (must exist)

- **Multi-string, multi-filing:** the `20332896` proof bytes (8 rows; seq 1–4 × 2 strings; `on_top_record` only on seq 3) give 8 accepted rows, no flag from repeated `record_sequence`, `on_top_record` `true` on exactly the two seq-3 rows and `null` elsewhere, and order kept.
- **Repeated sequence (reinterpretation of the PRD "duplicate sequence" fixture):** a repeated `record_sequence` is accepted. A duplicate `id` quarantines both rows with `duplicate_source_id`. An empty `id` gives `invalid:source_id`.
- **Multi-plug:** a synthetic plugging fixture with several plugs per filing and repeated `record_sequence`, with field shapes from `plugging-wfzn-9fje.json`. `plug_top_depth > plug_bottom_depth` is quarantined.
- **Missing vs zero:** absent `multi_stg_depth` gives null with `missing:` (accepted); `"0.0"` stays 0; `"1,234"` is a parse failure; negative `csg_depth` gives `invalid_negative`; a negative `depth_reference` is accepted.
- **`on_top_record`:** absent gives null with no flag; `false` stays false; `"true"` (a string) gives `parse_failure:on_top_record`.
- **Dates:** a valid timestamp, plain `YYYY-MM-DD`, `T12:00:00.000`, Feb 30 and missing. Only the first and last are accepted; `_text` is always kept.
- **Link statuses:**
  - `matched` (1 inventory row, rows > 0);
  - `none/no_source_rows` (plugging `[]`);
  - `none/api_missing_or_invalid` (inventory row `api_no` `''` or `'3891020'`: 15 targets, no wellbore query issued, sidecars written);
  - `ambiguous/multiple_inventory_rows` (constructed: the selected row plus a synthetic second permit with another UIC and the same `api_no`; wellbore rows accepted and listed);
  - `ambiguous/inventory_cap_reached` (25 rows).
  - **This shared-API case must be a constructed fixture:** "None of the three APIs is shared by several inventory rows" (proof, "Inventory uniqueness").
- **Contradictions:** an inventory-by-API response without the selected row, an empty one, one with a foreign `api_no`, and a casing row with a foreign `api_no` each give `SOURCE_SCOPE_MISMATCH`. Nothing is published, a failed run is recorded and the raw bytes are kept.
- **Caps:** casing 1000 rows gives `SOURCE_ROW_LIMIT` and 1001 gives `SOURCE_INVALID`. Inventory-by-API 26 rows gives `SOURCE_INVALID`.
- **Scope cross-check:** an `acquisition.json` whose `sourceApiId` differs from the fresh inventory row gives `SOURCE_INVALID`. `targetsForScope` throws for a v4 scope with a tampered `sourceApiId`, `wellboreLimit` or `queryVersion`, and round-trips through JSON.
- **Negative: no API → H-10 join (ADR 004 Consequences):**
  - (a) `targetsForScope` for v1–v4 never sends `api_no` to `qq2j-f2zm`, and never sends `uic` to `u9m4-xnh6`/`wfzn-9fje` or to the inventory-by-API target;
  - (b) a `normalize()` unit test with scope `null` (in the pipeline such a row would already fail `SOURCE_SCOPE_MISMATCH` before any join is observable): a monthly row carrying an `api_no` equal to the inventory row's `api_no` but a foreign `uic_no` gets `parent_join_status` `unmatched` and no `parent_key`;
  - (c) `src/wellbore.mjs` does not import the `normalize` function (it may import `numberField` and `csv`), never reads `uic_no` and receives no monthly rows (static import check);
  - (d) casing and plugging rows have no `uic_number` or `parent_key` key.
- **No compliance wording:** the sidecars, dictionary and rendered HTML contain none of `compliant`, `non-compliant`, `violation`, `plugged and abandoned`, `not plugged`, `properly`, `adequate` or `safe`, except inside the fixed negated sentences of section 4.4, which the test allow-lists.
- **Dictionary:** every column is covered; no numeric field asserts in or ft unless OD-5 adds a citation.
- **Tampering:** a modified `casing.json` is refused by package verification and by `loadVerifiedSidecar`.
- **Regression criterion:** section 6.
- **Old versions:**
  - All committed versions replay byte-identically.
  - Update `test/test-reports-pipeline.test.mjs:152-153`: its `else` branch asserts `tests.json` is undefined for every non-v3 version, which fails for a committed v4. It becomes `queryVersion>=3`, plus the same check for the wellbore sidecars when `===4`.
- **Guest:** v2 output, URLs and `GUEST_EVIDENCE_NAMES` are frozen. v4 is refused by prepare and finalize.
- **Server:**
  - `/api/collect` produces v4 with the request schema unchanged. This **changes** `test/test-reports-pipeline.test.mjs:169-178`, which asserts v3 from `/api/collect`; its fixture `network()` (`:28-38`) must route the casing, plugging and inventory-by-API hosts.
  - The hosted-edge mirror `test/hosted-edge.test.mjs:134-137` uses `>=3` and the run-version rule.
- **Browser:** not collected, loading, rejected hash, `matched`/`none`/`ambiguous` panels with candidates, quarantined rows, unit headers, `on_top_record` "not set", Analytics gate for v4, Help text.
- **Fixtures** live under `test/fixtures/wellbore/`:
  - metadata copied from `raw-discovery-2026-10-29/`;
  - `candidate-casing.json` copied byte for byte from `raw-discovery-2026-10-29-api-proof/casing-u9m4-xnh6-api38910201.json` (it matches the fixture well 000020838, whose inventory `api_no` is `38910201`, `raw/candidate-inventory.json`);
  - the `20332896` bytes for the normalizer test;
  - plugging and shared-API rows are synthetic and labelled as such.

  All are fixture provenance. Nothing is presented as a public observation.

## 11. Live proof (after merge-ready code and the D4 review; Main, owner-authorized wells only)

- **Wells:** three local v4 collections on the proof wells:

  | UIC | API |
  |---|---|
  | 000020838 | 38910201 |
  | 000111186 | 20332896 |
  | 000119875 | 38940222 |

- **Expected, to be re-observed rather than assumed:**
  - inventory-by-API: 1 row each, so casing is `matched`;
  - casing rows 2 / 8 / 2;
  - plugging `none/no_source_rows` for all three (proof table).
- **Each proof records, per dataset:**
  - raw = parsed = accepted + quarantined;
  - the date format seen;
  - that the `$limit=1000` URLs were accepted;
  - the link status and reason;
  - the inventory-by-API row count.
- **Token:** the app token from `TRRC_SOCRATA_APP_TOKEN`; a grep finds no token value.
- **Pins:** default and Analytics pins are unchanged; v4 is skipped by the transfer script.
- **Fourth well [OD-7]:** UIC `000000209`, API `16300331`, found by the owner-authorized discovery in the proof addendum. It has 3 plug rows (`record_sequence` 1, `on_top_record: true`, `total_depth_w3` `"0"`), was plugged in 2025 and has injection type 3.
  - It gives the live `matched` plugging link and real plugging values.
  - Main shows the owner this well before collecting it. Its H-10 rows in the window are not known beforehand; zero is acceptable and is reported as observed.
  - If the owner declines it, plugging `matched` rests on fixtures plus the discovery bytes, and that is disclosed.

## 12. Tasks (at most two parallel implementers; disjoint allowlists)

| Task | Owner / model | Allowed files (create or edit only these) | Acceptance |
|---|---|---|---|
| **1 — Pipeline** | Implementer, Opus high | `src/sources.mjs`, `src/wellbore.mjs` (new), `src/artifact.mjs`, `src/exportCore.mjs`, `src/acquisition.mjs` (comment `:13` only, if needed), `scripts/serve.mjs`, `scripts/prepare-supabase-archive.mjs`, `public/workflow.js`, `test/fixtures/wellbore/**` (new), `test/wellbore-normalize.test.mjs` (new), `test/wellbore-pipeline.test.mjs` (new), `test/test-reports-pipeline.test.mjs` (only `:152-153`, `:169-178` and the `network()` routes at `:28-38`), `test/hosted-edge.test.mjs` (`:134-137` only) | Sections 1–7 and 10 (non-browser); full `node --test` green (baseline 371) with new tests; Appendix A pipeline sites each reported as changed or verified unchanged |
| **2 — Browser** | Implementer, Opus | `public/wellbore-view.js` (new), `public/app.js`, `public/index.html`, `public/navigation.js`, `public/dataset-state.js`, `public/style.css`, `test/wellbore-view.test.mjs` (new), `test/navigation-redesign.test.mjs`, `test/version-race.test.mjs`, `test/tests-view.test.mjs` (harness `:114-117` only) | Section 8 and the browser tests in section 10; builds its fixtures from the section 5 shapes only (no dependency on Task 1 code); Appendix A browser sites reported |
| **3 — D4 identity review** | Independent reviewer, Opus, read-only | none | After Tasks 1–2: reviews `src/wellbore.mjs`, the link-status order against ADR 004 §2, forbidden relations (§3), the negative tests, and the presence wording against the quoted SPEC cut. Findings resolved or ruled before merge. **Merge gate.** |
| **4 — Docs, integration, live proof** | Main | `SPEC.md` (Phase 3 addendum, incl. the revised criterion and the reinterpreted fixture wording), `docs/requirements.md` RRC-14, (ADR 004 amendment already done by Main), `docs/verification-2026-10-29-phase3-live-proof.md` | Section 11; Git in the worktree only |

- Tasks 1 and 2 run in parallel (two slots). Task 3 starts only after both release their slots.
- Workers never stage, commit, push, revert others' edits or spawn helpers.
- If OD-5 is approved, its research task runs **before** Task 1 is dispatched and occupies one slot.

## 13. Owner/Main decisions (all ruled 2026-10-29)

Rulings: every row below uses its **recommended** option.
- The owner ruled on always-v4, OD-5, OD-7 and OD-11 ("go with your recommendations on all four", 2026-10-29).
- Main ruled on OD-1 to OD-4, OD-6 and OD-8 to OD-10.
- ADR 004 was amended for OD-4 and OD-11, together with the corrected row-grain wording.

| ID | Decision | Recommended | Alternative |
|---|---|---|---|
| OD-1 | How ADR 004 §2 rule 1 ("no query is made") fits fixed per-scope targets | `sourceApiId:null` in scope. Targets 16–18 omitted, metadata 14–15 kept, sidecars written with `none/api_missing_or_invalid` | Refuse to collect v4 for such a row (keeps v3); loses the ADR status |
| OD-2 | `tests.json` `scope.query_version` in a v4 version (`src/artifact.mjs:169` hard-codes 3) | Use the true query version (4); enumerate it in the §6 delta | Keep 3 so `tests.json` is byte-identical to v3, documenting that it names the test-report query contract |
| OD-3 | Disposition of casing/plugging rows under an `ambiguous` link | Accepted; ambiguity carried by the link status only | Quarantine with a row flag (for example `ambiguous:inventory_parent`), as H-10/BHP do for parents |
| OD-4 | Reason name when the inventory-by-API response has 2–24 rows (ADR names only `inventory_cap_reached`) | `multiple_inventory_rows`, recorded as an ADR 004 note | No reason (`null`) |
| OD-5 | Retrieve the official G-1/W-2 and W-3 form instructions as documentation targets for unit citations | Yes: research task first, spec amended before Task 1 | Ship with "units not stated by the source" |
| OD-6 | Consistency rules beyond `plug_top_exceeds_bottom` (`toc` or `multi_stg_depth` vs `csg_depth`) | None in Phase 3; TOC semantics undocumented | Add `inconsistent:toc_below_shoe` |
| OD-7 | Live proof coverage for plugging rows (all three proof wells return 0) | Owner authorizes one extra UIC well known to have W-3 rows, chosen through the existing lookup, for a fourth live collection | Accept fixture-only evidence for `matched` plugging and disclose it |
| OD-8 | Where review §8's "shown in the inspector" lives | The Wellbore tab link panel is the inspector; the Records tab is unchanged until the Phase 3b dossier | Also add a one-line link status to the Records-tab well details (more `app.js` surface) |
| OD-9 | Plausibility rules for dates and values (completion dates to 2070; `toc` to 4,000,300) | None; shown as published, disclosed in the dictionary | Add a non-quarantining `implausible:` flag |
| OD-10 | File set (the PRD names only `casing.json`/`plugging.json`) | JSON plus CSV for each, plus `wellbore_dictionary.json` (Phase 2 parity) | JSON only, with dictionary entries embedded |
| OD-11 | ADR 004 §2 rule 3 says "row quarantined, version not verified"; the Phase 2 code fails the run | Fail closed with `SOURCE_SCOPE_MISMATCH` (nothing published, raw kept, failed run recorded), as Phase 2 does; record it as the ADR's implementation | Publish with quarantined rows and `real_history_status` not verified |

Settled from evidence (not open):
- v4 rather than extending v3 (section 1);
- a cap of 1000 with order `record_sequence,id` (section 2);
- Analytics disabled for v ≥ 3 until Phase 6;
- the transfer script skips v ≥ 3;
- `record_sequence` is never a duplicate key;
- `on_top_record` is never derived;
- local `/api/collect` always produces the newest version, v4 (carried forward from the Phase 2 owner ruling "always v3"; Main to confirm).

## 14. Contradictions and reinterpretations found

1. **Row grain.** The ODP casing description, repeated in review §5.3, says "one row per API # per casing string". The proof shows the same strings repeated in each filing (`20332896`: 4 filings × 2 strings = 8 rows). The dictionary grain is restated (section 5). ADR 004 §3's "one row per string or plug is never collapsed" should read "one source row".
2. **Review §5.3 lists `record_sequence` as a "Key / identity field".** The proof shows it is a filing sequence shared by several rows. The only observed unique key is `id`.
3. **"Duplicate sequence" fixture** (review §7 Phase 3; v1.1 review E11a "duplicate `record_sequence`") must be reinterpreted. A repeated `record_sequence` is normal and accepted; the duplicate fixture is a duplicate `id` (section 10). SPEC should disclose this as for the Phase 2 criterion.
4. **ADR 004 §2 rule 3** prescribes row quarantine with an unverified version. The implemented Phase 2 practice fails the run (OD-11).
5. **ADR 004 §2 rule 5** names only `inventory_cap_reached`; there is no reason for 2–24 rows (OD-4).
6. **ADR 004 §2 rule 1** ("no query is made") versus targets that are a pure function of scope (OD-1).
7. **Plugging format proof rests on metadata only** (proof: "confirmed by metadata, not by a matched row"). This is not a contradiction of ADR 004's stop condition, but the live proof cannot close it (OD-7).
8. **Review §7 assigns the identity review to "Astra".** ADR 004 and D4 require an "independent review", and the current routing uses Opus for all roles. This design uses an independent Opus reviewer (Task 3); Main should confirm.

---

## Appendix A — version-dispatch and structural site inventory (commit `d5826b3`)

"Change" means Phase 3 must edit it. "Verify" means the behaviour must stay as it is and the implementer confirms it.

**`src/sources.mjs`**
- `:4-5` comment (change)
- `:6` `isBounded` 2‖3 → add 4 (change)
- `:7-11` `versionLabels` → add v4 (change)
- `:12-22` `sourceScopeFlags`: `:15` bhp/srt branch (verify); `:16` inventory branch (verify; must not see `wellbore_inventory`); `:17-20` `else` treats unknown kinds as monthly → add `casing`/`plugging`/`wellbore_inventory` branches before it (change)
- `:43-48` `lookupTarget` (verify; reused for target 16)
- `:50-57` `boundedScope` (verify unchanged)
- `:60-62` `boundedTestScope` (verify unchanged); new `boundedWellboreScope` after it (change)
- `:63` `testReportOrder` (verify)
- `:68-77` `testReportTargets` (verify)
- `:78-86` `targetsForScope`: `:79` (verify); `:80` checked-scope dispatch `queryVersion===3?boundedTestScope:boundedScope` → a v4 scope would be compared with `boundedScope` output and throw (change); `:85` `queryVersion===3?…` → `>=3` for test targets plus wellbore targets for 4 (change)
- new `isLocalOnly` (change)

**`src/acquisition.mjs`**
- `:13` comment (change)
- `:14` `isBounded` (verify)
- `:15` `versionLabels` (verify)
- `:28,:52` marker `schemaVersion: dynamic?2:1` (verify unchanged)
- `:35-44` target loop (verify)
- `:47` `sourceCount` inputs (verify)

**`src/artifact.mjs`**
- `:24` `copyTests`, `:26` `sameTests` (verify; add wellbore analogues) (change)
- `:44` v1 classification files (verify)
- `:48` `testReports=scope.queryVersion===3` → `>=3`; add `wellbore` (change)
- `:53` acquisition `schemaVersion!==2` and targets equality (verify)
- `:61` inventory bound 25 (verify)
- `:63` `sourceIds` (change: three keys added in the v4 block)
- `:75` title via `kind+'-metadata.json'` (change: `wellbore_inventory` mapping)
- `:86` exact-UIC identity check; add the `sourceApiId` cross-check after it (change)
- `:91-100` v3 test block (verify); v4 block after it (change)
- `:106` provenance `[1,2].includes(schemaVersion)`, basis v2 (verify)
- `:108` snapshot, `:111` loaded-evidence proof (change)
- `:126` projection compare (change)
- `:129` inventory/monthly scope (verify)
- `:131-132` test rows and scope (verify); wellbore normalize and scope after it (change)
- `:141` `api_no` "never used as join key" (verify; stays true for the UIC files, ADR 004 §1)
- `:152` `isBounded` (verify)
- `:165-172` v3 sidecars: `:167` hard-codes `query_version=3` and `rrc-odp-v2.1.0`; `:168` limitation; `:169` `tests.json` `query_version:3` [OD-2] (change: v4 block after `:172` overrides; `:169` per OD-2)
- `:175` provenance (verify)

**`src/exportCore.mjs`**
- `:8` import (change)
- `:17-18` `sourceCount` → add `casing`/`plugging`/`wellbore_inventory` (change)
- `:19` `loadInputs` (verify)
- `:20` `qcInputs` inventory/monthly only (verify)
- `:23-29` `testReportCounts` (verify); add `wellboreCounts` with the scope throw (change)
- `:30` `refuseTestReports` `===3` → `isLocalOnly`, message text unchanged (change)
- `:49` `detectScope` (verify)
- `:52` `isBounded` pins (verify)
- `:81` `localOnly` gate (verify)
- `:105-106` normalize-qc evidence (change: add `wellbore`)
- `:147` guest recorder `detected?.queryVersion===3?null:detected` → `isLocalOnly` (change)
- `:164` finalize refusal (verify; uses the updated helper)
- `:173-175` finalize normalize compare (verify: wellbore evidence is never journalled on the guest path)

**`src/normalize.mjs`**
- `:24` `isBounded` county rule (verify; required for byte identity)

**`src/pipeline.mjs`**
- `:42-43,:46` scope → `exportRecorder` labels (verify; labels follow `versionLabels`)

**`src/testReports.mjs`**
- `:52` `sourceScopeFlags(kind)` (verify)

**`src/hosted/guest-steps.mjs`**
- `:8,:23,:24,:50-51,:96,:186,:197` v2-only (verify, not edited)

**`src/lookup.mjs`**
- `:10-12` `identityFields`/`sameIdentity` (verify; reused)

**`scripts/serve.mjs`**
- `:8` import, `:63` scope constructor (change)

**`scripts/prepare-supabase-archive.mjs`**
- `:11-12` comment, `:17` `===3`, `:19` dataset-ID regex, `:20` `'rrc-collection-v3'` (change)
- `:29-30` `v3Versions` and event name (verify; name kept)

**`public/app.js`**
- `:2` import (change)
- `:35` `!==3` and `:114` `===3` Analytics (change)
- `:53` tab→view map (change)
- `:117-119` download descriptions (change)
- `:122` `[2,3].includes` (change)
- `:136-148` `showTests` pattern (verify; copy)
- `:161` call site (change)

**Other public files**
- `public/workflow.js`: `:43` load inputs (verify); `:46` inventory kind mapping (verify); `:47-53` `testReports` keys exactly bhp/srt (verify); add `wellbore` block (change); `:54` outputs length 2 (verify)
- `public/navigation.js:1` `tabs` (change)
- `public/dataset-state.js:4` clear list (change)
- `public/index.html:11` nav, `:18` tests section (change: add the wellbore section after it)
- `public/tests-view.js:5` `testReportsCollected` (verify; v4 still has `tests.json`)
- `public/workflow-ui.js:21` `const tabs=` (verify; the run inspector's `[role=tab]` list, unrelated to dataset tabs)
- `public/quality-validation.js:5` quarantine prefixes (verify; drives the flag naming in section 4)
- `public/artifact-integrity.js:26-38` `loadVerifiedSidecar` (verify)

**Tests**
- `test/test-reports-pipeline.test.mjs`: `:24,:121-142` v3 regression (verify unchanged); `:152-153` replay `else` (change); `:162,167` refusal message (verify); `:169-178` `/api/collect` v3 → v4 (change); `:28-38` `network()` routes (change)
- `test/test-reports-normalize.test.mjs:17-36` v3 scope assertions (verify; still true)
- `test/hosted-edge.test.mjs:134-137` (change)
- `test/navigation-redesign.test.mjs:53-56,133-134`, `test/version-race.test.mjs:9-10,15-18`, `test/tests-view.test.mjs:114-117` harness injection (change)
- `test/bounded-collection.test.mjs:44`, `test/reader-adapter.test.mjs:43` v2 assertions (verify)

## Appendix B — grep commands used (run from the worktree root)

```
grep -rnoE ".{0,90}(queryVersion|query_version|isBounded|versionLabels|boundedTestScope|testReports|refuseTestReports|rrc-collection-v|rrc-odp-v|localOnly).{0,90}" src scripts public --include=*.mjs --include=*.js --include=*.ts --include=*.tsx --include=*.html | grep -v "^src/routeTree"
grep -rnoE ".{0,80}(query_version|queryVersion|transformation_version|pipelineVersion|rrc-collection|schemaVersion:2|schemaVersion===2|\[1,2\]|v3Versions|qxfy-wcfs|h54t-xnbi|tests\.json).{0,80}" src scripts public supabase --include=*.mjs --include=*.js --include=*.ts --include=*.tsx --include=*.sql | grep -v routeTree | grep -vE "^src/(sources|artifact|testReports)\.mjs"
grep -rn "boundedScope\|boundedTestScope\|targetsForScope\|loadSnapshotFromReader\|exportArtifactFromReader\|prepareArtifactFromReader\|finalizeArtifactFromReader" src scripts public --include=*.mjs --include=*.js --include=*.ts
grep -rnoE "sameTests|copyTests|sourceCount|kind\+'-metadata\.json'|testReports|Object\.assign\(env|'tests-content'|tests-content|const tabs=|\['tests','tests'\]|testDescriptions|\[2,3\]|query_version!==3|query_version===3|rrc-collection-v3|qxfy-wcfs\|h54t-xnbi|skipped_local_only_test_report_version|limitations\.push|query_version:3|query_version=3" src scripts public test --include=*.mjs --include=*.js --include=*.html | sort -u
grep -rnoE ".{0,80}(query_version|queryVersion|rrc-collection-v3|rrc-odp-v2\.1|boundedTestScope|qxfy-wcfs|local-only|localOnly|tests\.json|test_report_limit|testReportLimit).{0,60}" test
grep -n "const env=\|renderTestsView:" test/*.mjs
grep -ln "api/collect" test/*.mjs
grep -n "dynamic\|schemaVersion" src/acquisition.mjs
grep -n "sourceIds\|kind==='metadata'\|testReports\|tests=\|testRows" src/artifact.mjs
grep -no 'data-tab="[a-z]*"' public/index.html
```
The `src/hosted/*` and `supabase/` greps found only v2 constants (`src/hosted/guest-steps.mjs:24`, `scripts/check-guest-postgres.mjs:73,105`, `supabase/migrations/20261014000000_trrc_guest.sql:237`). None needs a change.
