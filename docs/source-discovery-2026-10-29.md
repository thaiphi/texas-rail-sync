# Source discovery — seven RRC ODP views (2026-10-29)

Requirement: RRC-12 (Phase 1.1 of the [expansion plan](expansion-prd-review-2026-10-17.md) §7). This document records **view metadata only**. No data rows were requested. It confirms, at a new date, the dataset table in review §5.3, and preserves the metadata bytes as evidence.

## How it was collected

On 2026-10-29 at 05:10 UTC, seven `GET https://data.texas.gov/api/views/<id>.json` requests were made through the shared `fetchSourceWithThrottleRetry`. That function uses the Phase 1.2 fetch contract: 30 s timeout, 10 MB cap, no redirects. No app token was registered, so every sidecar records `app_token_used: false`. All seven returned HTTP 200 with no `ETag` or `Last-Modified` header.

The bytes are preserved unchanged in [`raw-discovery-2026-10-29/`](../raw-discovery-2026-10-29/), each next to its `.source.json` sidecar. That directory is evidence only: no pipeline reads it, and it is not part of any artifact version.

| File | Retrieved (UTC) | Bytes | SHA-256 |
|---|---|---|---|
| `inventory-givw-z9t4.json` | 2026-10-29T05:10:39.912Z | 47527 | `0839163287547e5ac0a197380844b0d4bba2a22aa37751ba955168952730e374` |
| `h10-monthly-qq2j-f2zm.json` | 2026-10-29T05:10:40.055Z | 21609 | `a925d48738efaa2ffddc4469306d1e6a842ebc9a33e93d5e1f8e9285df9eefe7` |
| `casing-u9m4-xnh6.json` | 2026-10-29T05:10:40.201Z | 26705 | `f0518dc46181d3ddaf443154e0fd4c31c3baee2ba763385fe92af23f49e8445c` |
| `plugging-wfzn-9fje.json` | 2026-10-29T05:10:40.317Z | 20395 | `7d8917e1c2fdf5d9be8842fd92defc127eb24600437fdc9d5a83db99b609e1fd` |
| `bottom-location-uumf-5r4y.json` | 2026-10-29T05:10:40.445Z | 12291 | `4a8760c3810f9e020cfec57e04ad94bbcec21dcf94fad58ed27899bd958abf65` |
| `bhp-qxfy-wcfs.json` | 2026-10-29T05:10:40.588Z | 19789 | `2e0bf6e6ed2522d7c1778936c149f5deaeae031bc8d4022030927fcc5c7a50d0` |
| `srt-h54t-xnbi.json` | 2026-10-29T05:10:40.751Z | 33117 | `6d3409f8eea667a406548773a000ffe7c77218daa6445b2cb3d131579957e131` |

## Findings common to all seven

- **Publisher:** `metadata.custom_fields` gives "Agency: Railroad Commission of Texas" and "Update Frequency: Monthly".
- **Licence:** the `license` field is `null` and no licence ID or attribution is given, so no licence is stated. This finding is unchanged from review §5.2. Decision D14 (ask DIR once and record the answer in SOURCE_PROOF.md) remains an open owner action.
- **Column descriptions:** none of the 96 non-system columns has one. Meanings and units come only from field names and official RRC forms and guidance, never from ODP metadata.
- **Row counts** are estimates: the largest `non_null + null` in each view's `cachedContents`. They are not official counts.

## Per-dataset fields

Field types are as published (`text`, `number`, `calendar_date`, `checkbox`). System columns (`:id`, `:created_at`, …) are omitted.

| Dataset (view) | Rows (est.) | Rows last updated (UTC) | Fields |
|---|---|---|---|
| UIC well location / inventory (`givw-z9t4`) | 126,780 | 2026-10-27 21:10 | `uic_number` text, `oil_gas_code` text, `district_code` text, `lease_number` text, `well_no_display` text, `api_no` text, `activated_flag` checkbox, `uic_type_injection` number, `permit_canceled_date` text, `w14_date` text, `w14_number` number, `h1_date` text, `h1_number` number, `letter_date` text, `w3_plugged_date` text, `max_liq_inj_pressure` number, `max_gas_inj_pressure` number, `prod_casing_pkr_depth` number, `top_inj_zone` number, `bot_inj_zone` number, `lease_name` text, `operator_number` number, `field_number` number, `bbl_vol_inj` number, `mcf_vol_inj` number, `latitude_nad83` number, `longitude_nad83` number |
| H-10 injection monitoring (`qq2j-f2zm`) | 21,143,785 | 2026-10-20 21:05 | `id` number, `uic_no` text, `formatted_date` calendar_date, `inj_press_avg` number, `inj_press_max` number, `vol_liq` number, `vol_gas` number, `type_uic` number, `commercial` number, `toz` number, `boz` number, `most_recent_record` number |
| Wellbore casing (`u9m4-xnh6`) | 2,414,224 | 2026-10-20 19:23 | `id` number, `api_no` text, `csg_depth` number, `toc` number, `multi_stg_depth` number, `cmt_sacks` number, `csg_size` number, `hole_size` number, `total_depth_g1w2` number, `completion_date` calendar_date, `depth_reference` number, `depth_reference_code` text, `record_sequence` number, `on_top_record` checkbox |
| Wellbore plugging (`wfzn-9fje`) | 1,680,718 | 2026-10-20 19:18 | `id` number, `api_no` text, `plug_bottom_depth` number, `plug_top_depth` number, `plug_cmt_sacks` number, `total_depth_w3` number, `w3_date` calendar_date, `depth_reference` number, `depth_reference_code` text, `record_sequence` number, `on_top_record` checkbox |
| Well bottom location (`uumf-5r4y`) | 1,397,402 | 2026-10-22 20:48 | `api` text, `gis_lat27` number, `gis_long27` number, `gis_lat83` number, `gis_long83` number |
| UIC BHP test results (`qxfy-wcfs`) | 581 | 2026-10-20 19:14 | `report_id` number, `uic_no` text, `tracking_no` text, `report_conducted_date` text, `report_received_date` text, `bhp_psia` number, `test_depth_ft` number, `gradient_psi_ft` number, `tested_formation` text, `test_sequence_no` number |
| UIC step-rate test results (`h54t-xnbi`) | 337 | 2026-10-01 12:32 | `report_id` number, `uic_no` text, `tracking_no` text, `srt_received_date` text, `test_date` text, `satisfactory_test` number, `top_perf_ft` number, `bottom_perf_ft` number, `formation_tested` text, `min_inj_rate_bpm` number, `max_inj_rate_bpm` number, `isip_psig` number, `formation_frac_press_psig` number, `frac_inj_rate_capacity_bpd` number, `surface_pressure_firc_psig` number, `fracture_gradient_psi_ft` number, `comments` text |

## What changed since the 2026-10-17 review

- **Schemas:** every field and type that review §5.3 names is still present with the same type. §5.3 listed only selected fields, so this is the first complete field list on record.
- **Row estimates and update timestamps:** these moved forward in six views; SRT is unchanged at 2026-10-01. The monthly cadence still holds, but publishes do not land on a fixed day.

## Design consequences (inputs to Phases 2–3; nothing implemented here)

- **Identity keys:**
  - BHP and SRT carry `uic_no` as text, so they belong to the UIC domain (ADR 004 §1).
  - Casing and plugging carry `api_no` as text, and the bottom location carries `api` as text, so they belong to the wellbore domain. Bottom location stays excluded until RRC-07 is authorized.
  - Neither of the API-keyed text formats is proven equal to the inventory's eight-character `api_no`. The Phase 3 format proof is still required (ADR 004 §1).
- **Dates:** BHP and SRT dates are `text` and need parse flags and quarantine. Casing and plugging dates are `calendar_date`.
- **Pressure basis:** this is taken only from field-name suffixes:
  - `bhp_psia` is absolute;
  - SRT's `isip_psig`, `formation_frac_press_psig` and `surface_pressure_firc_psig` are gauge;
  - H-10 `inj_press_*` are in psi, as the UIC manual names them (SOURCE_PROOF.md).
  The data dictionary must carry this per field. Psia and psig values are never converted to each other.
- **`depth_reference` / `depth_reference_code`** (casing, plugging) have no published meaning. Show them verbatim as "reference code undocumented in ODP metadata" (v1.1 review §3).
- **Size:** BHP (~581) and SRT (~337) are small, but D8 keeps per-UIC bounded queries for consistency. Casing and plugging run to millions of rows and must be queried per well.

## Official form references for units (to confirm in Phases 2–3)

Unit and meaning statements for the new fields should cite the RRC's own forms and guidance:
- G-1/W-2 completion reports for casing;
- W-3 plugging records;
- H-5 for disposal/injection-well pressure tests;
- RRC step-rate-test guidance for SRT.

Their exact URLs and page references were **not retrieved** in this step. Each connector brief must fetch and preserve the specific document it cites, the same way the UIC manual is preserved today.

## Limits

This step verified metadata only:
- No row-level formats were checked: API string length and padding, text-date patterns, duplicate report IDs.
- The Socrata row estimates are not official counts.
- No app token was used, and no numeric throttle limits were observed.
