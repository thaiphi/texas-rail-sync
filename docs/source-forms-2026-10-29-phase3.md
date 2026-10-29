# Phase 3 official source forms — casing and plugging units and meanings (2026-10-29)

Requirement: RRC-14 (owner ruling OD-5, 2026-10-29). Scope: read-only research. No `data.texas.gov/resource/` row query was made. Nothing was downloaded into the repository; the PDFs were read from a session scratch directory only.

Datasets:
- RRC ODP Wellbore Casing `u9m4-xnh6`;
- RRC ODP Wellbore Plugging `wfzn-9fje`.

Their ODP metadata has no column descriptions (`raw-discovery-2026-10-29/casing-u9m4-xnh6.json`, `plugging-wfzn-9fje.json`).

## 1. What the ODP itself says

The dataset pages on data.texas.gov are rendered by script. A WebFetch of `https://data.texas.gov/dataset/RRC-Wellbore-Casing/u9m4-xnh6` returned only the page title, with no description, attachments or column text. The preserved view metadata is therefore the ODP's only statement. Every quote below is from the preserved raw JSON (`description`).

| View | `description` (verbatim) | Columns described? | Attachments |
|---|---|---|---|
| `u9m4-xnh6` RRC-Wellbore Casing | "Wellbore casing information as reported on RRC Form G-1/W-2; one row per API # per casing string." | No; every `description` is empty | None. `metadata` holds only `custom_fields` (Agency, Category Tile, "Update Frequency": "Monthly") and display types. |
| `wfzn-9fje` RRC-Wellbore Plugging | "Wellbore plugging information as reported on RRC Form W-3; one row per API # per plug." | No | None, as above. |

- **Row grain (stated):** one row per API per casing string, and one row per API per plug.
- **Contradiction with the data:** the Phase 3 proof (`docs/verification-2026-10-29-phase3-api-format-proof.md`) shows API `20332896` with 8 casing rows for 2 physical strings, repeated across `record_sequence` 1–4. The stated grain "one row per API # per casing string" is therefore not literal. The observed grain is one row per casing string per filing record (`record_sequence`).
- **Plug number:** the plugging view has no plug-number column, although W-3 lists "PLUG #1 … PLUG #8". Within one `record_sequence`, only the source `id` tells plug rows apart.
- **`record_sequence` and `on_top_record`:** neither the ODP nor any RRC document found defines them. A web search of official and catalog pages for "on top record" or "record sequence" returned nothing relevant (the data.gov catalog mirrors repeat only the description above).

## 2. Candidate documents

Every URL below was fetched by this research on 2026-10-29. "curl" means a direct `curl -L` download to scratch; SHA-256 values are given so the connector can detect drift. All `www.rrc.texas.gov/media/<hash>/…` links are CMS media paths. The hash segment can change when RRC re-uploads a file, so treat them as **unstable**, as Phase 2 did with `bhp-permian-nto.pdf`.

| # | Title (publisher: Railroad Commission of Texas) | URL | Type / size | Fetch result | SHA-256 |
|---|---|---|---|---|---|
| D1 | "Oil and Gas Well Bore System Magnetic Tape User's Guide", Publication Number WBA091, "Last updated May 20, 2019" (linked as "Wba091 Well Bore Database") | `https://www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf` | PDF, 804,319 bytes, 91 pages | curl HTTP 200 `application/pdf` | `71891d48dede8a82c9ac73d2c35710de28ec18737598bd7e0cce9fd4fa027e24` |
| D2 | Form W-2 "Oil Well Potential Test, Completion or Recompletion Report, and Log", Rev. 01/2014 | `https://www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf` | PDF, 59,078 bytes, 2 pages | curl HTTP 200 | `46e753d3f47444291f2f3ff9b2af6d8b436b760cb1d309484117d80b228819c1` |
| D3 | Form G-1 "Gas Well Back Pressure Test, Completion or Recompletion Report, and Log", Rev. 01/2014 | `https://www.rrc.texas.gov/media/da2j41dw/g-1-0114.pdf` | PDF, 54,803 bytes, 2 pages | curl HTTP 200 | `fce54936f3018da1581bbcd29afd464dddd1d09d9beb08c7609508033580c50e` |
| D4 | Form W-3 "Plugging Record", Rev. 08/2019 | `https://www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf` | PDF, 117,481 bytes, 2 pages | curl HTTP 200 | `c4a6d98222b00fed17be9c561135f7b60b13b707636b9f5d733eabfde9396131` |
| D5 | "Completion Data Subscriptions", Revised November 1, 2017 | `https://www.rrc.texas.gov/media/ltudbyql/cmpldatasubscriptions_usermanual_20171101.pdf` | PDF, 408,177 bytes | curl HTTP 200 | `ff7a8086c0e98ac76c7042c4f6c6a139a6db5ee59d5f78b6dddf74aaf8b0bb61` |
| D6 | "Og Wellbore Ewa definition manual 2013-10-30 Subscription" | `https://www.rrc.texas.gov/media/di1mm5or/og_wellbore_ewadefinitionmanual2013-10-30_subscription.pdf` | PDF, 106,876 bytes | curl HTTP 200 | `b6ad3c8556c45555d054f9b86d0dce77593147390c0ccce1ed12ac5708655264` |
| P1 | Data Sets Available for Download (the page that links D1, D5 and D6) | `https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/` | HTML | WebFetch OK | — |
| P2 | Oil and Gas Forms (the page that links D2, D3 and D4) | `https://www.rrc.texas.gov/oil-and-gas/oil-and-gas-forms/` | HTML | WebFetch OK | — |

Notes:
- P2 lists no instructions document for W-2, G-1 or W-3; only the forms, a fillable W-3 (`/media/a3lm3vdy/w-3-fillable.pdf`, not fetched) and online filing.
- D5 extracts with misaligned columns, so its value-to-row pairing is unreliable. It is used only for one corroborating code list (§4).
- D6 is a glossary for the Wellbore Query and covers none of these columns. It is not cited.
- Page citations for D1 use the manual's printed page labels (for example "p. 2-21"). PDF page = label page + 7 in section 2 (label 2-20 is PDF page 27).

## 3. Field table

Status key:
- **CONFIRMED** means an official document states the unit or meaning in a quoted item. The ODP column is tied to that item through the ODP description ("as reported on RRC Form G-1/W-2" / "Form W-3") plus the field name. No document names the ODP columns themselves, so every mapping from a column to a form item rests on the field name. That is the same "concept citation" standard Phase 2 used.
- **INFERRED** says what the inference rests on.
- **UNSTATED** means no official text was found.

### Casing `u9m4-xnh6`

| Field | Unit | Meaning | Status | Source and quote |
|---|---|---|---|---|
| `csg_depth` | ft | Depth at which the casing string is set | CONFIRMED | D2 p.2, item 36 CASING RECORD column "Setting Depth (ft.)"; D3 p.2, item 37, same column. D1 p.2-21 WB-CASING-DEPTH-SET: "INDICATES DEPTH AT WHICH CASING IS SET." |
| `toc` | ft (by form convention, see note) | Top of cement behind the casing | CONFIRMED meaning; unit INFERRED | D1 p.2-22 WB-TOP-OF-CEMENT-CASING: "MINIMUM DEPTH UP TO WHICH CEMENT WAS CIRCULATED." D2/D3 casing record column "Top of Cement" carries **no unit** (it sits beside "Top of Cement Determined By"). The unit is inferred from every other depth column on the form being "(ft.)". **`0.0` = surface is INFERRED, not stated**: a cement top at depth 0 is the surface, but 0 can also mean "not reported" (see §5). |
| `multi_stg_depth` | ft | Depth of the multi-stage cementing tool | CONFIRMED | D2 p.2 item 36 column "Multi-Stage Tool Depth (ft.)" (G-1 the same). D1 p.2-21 WB-MLTI-STG-TOOL-DPTH: "DEPTH AT WHICH THE DEVICE USED TO RE-CIRCULATE CEMENT OUTSIDE OF CASING IS SET." |
| `cmt_sacks` | sacks (see conflict C2) | Amount of cement used for the string | CONFIRMED (form); conflict | D2 p.2 item 36 column "Cement Amount (sacks)". D1 p.2-21 WB-AMOUNT-OF-CEMENT: "INDICATES THE QUANTITY OF CEMENT USED TO SECURE CASING." D1 p.2-22 WB-CEMENT-MEASUREMENT allows "WB-SACKS VALUE 'S'", "WB-CUBIC-YARDS VALUE 'Y'", "WB-CUBIC-FEET VALUE 'F'". |
| `csg_size` | in | Casing outside size | CONFIRMED | D2 p.2 item 36 "Casing Size (in.)". D1 p.2-21 WB-CAS-INCH: "INDICATES SIZE OF CASING IN INCHES." Legacy storage is whole inches plus a fraction (WB-CAS-FRAC-NUM/DENOM); the ODP decimal (e.g. `9.625`) is a conversion, INFERRED. |
| `hole_size` | in | Drilled hole size for the string | CONFIRMED | D2 p.2 item 36 "Hole Size (in.)". D1 p.2-22 WB-HOLE-INCH: "INDICATES SIZE OF CASING HOLE IN INCHES." |
| `total_depth_g1w2` | ft | Total depth reported on the G-1/W-2 | CONFIRMED (form) | D2 p.1 "31. Total Depth (ft.)"; D3 p.1 "32. Total Depth (ft.)". |
| `completion_date` | date | A date of the G-1/W-2 filing record; which date is not stated | INFERRED (ambiguous) | Neither form has a "completion date" item; the nearest are D2 "12a. Spud date", "12b. Date of first production after rig released" and "27. Date of plug back, deepening, recompletion…". D1 p.2-15 offers several candidates in the per-filing date segment: WB-COMPL-DATE "DATE IN SHICH [sic] THE WELL WAS COMPLETED"; WB-W2-G1-DATE "DATE FORM WAS RECEIVED BY DISTRICT OFFICE"; WB-FILE-DATE "DATE THE COMPLETION IS BUILT". In the proof data the date differs between filings that repeat identical casing (2004-04-08, 2004-05-10, 2017-11-09, 2014-12-03 for API `20332896`), so it is a filing-level date. Which D1 date it is remains unstated. |
| `depth_reference` | ft above mean sea level | Well elevation | CONFIRMED meaning (D1); mapping to this column INFERRED | D2 p.1 "29. Elevation (DF, RKB, RT, GR, etc.)" (D3 p.1 item 30) — **no unit on the form**. D1 p.2-15 WB-ELEVATION: "MEASUREMENT OF FEET ABOVE MEAN SEA LEVEL OF WELL." The column name says "depth reference", but its partner code uses the elevation code list, so the column is inferred to be WB-ELEVATION. Structural support: D1 p.2-13 lays out "WB-ELEVATION PIC 9(04)", and the casing metadata maximum is exactly `9999.0`, the four-digit ceiling. `9999` may be a legacy fill value, so do not render it as a real elevation. See C1. |
| `depth_reference_code` | code | Point from which the elevation was measured | CONFIRMED for GL, DF, KB, RT, GR; other codes UNSTATED | D1 p.2-15 WB-ELEVATION-CODE: "POINT FROM WHICH ELEVATION READING WAS MEASURED." with "WB-GROUND-LEVEL VALUE 'GL'", "WB-DERRICK-FLOOR VALUE 'DF'", "WB-KELLY-BUSHING VALUE 'KB'", "WB-ROTARY-TABLE VALUE 'RT'", "WB-GROUND VALUE 'GR'" (layout p.2-13). D2 item 29 lists "DF, RKB, RT, GR, etc.". See §4. |
| `record_sequence` | integer | Filing-record ordinal per API | UNSTATED (meaning INFERRED from data) | No document defines it. The proof shows several strings sharing one value and whole casing sets repeating across values, so it groups filings. D1 p.2-21 WB-CASING-COUNT says casing lines sit "UNDER A DATE SEGMENT", which supports a per-filing grouping, but no document links the ODP column to it. It is **not chronological** (sequence 4 is dated 2014-12-03, sequence 3 is dated 2017-11-09). |
| `on_top_record` | boolean | Unknown; plausibly marks the record RRC treats as current | UNSTATED | No document found. The proof shows it is set on sequence 3, not on the highest sequence 4, and is absent rather than `false` on the other rows.<br>Lead (INFERRED, one well plus a legacy key definition): in `20332896` the flag sits on the filing with the latest `completion_date` (2017-11-09). D1 p.2-14 defines WB-FILE-KEY as "DERIVED BY SUBTRACTING FILE DATE (IN CCYYMMDD FORMAT) FROM 99999999", a descending-date key that would place the latest filing first ("on top") in the hierarchical file.<br>Meaning not claimed. Preserve verbatim; never derive it. |

### Plugging `wfzn-9fje`

| Field | Unit | Meaning | Status | Source and quote |
|---|---|---|---|---|
| `plug_top_depth` | ft | Top of plug; measured or calculated is unstated | CONFIRMED unit; which top is ambiguous | D4 p.1 "*24. Calculated Top of Plug (ft.)" and "25. Measured Top of Plug (if tagged) (ft.)". D1 p.2-47 WB-MEAS-TOP-OF-PLUG: "MECHANICALLY-VERIFIED DEPTH TO WHICH TOP OF PLUG WAS SET." and WB-PLUG-CALC-TOP: "ESTIMATED DEPTH TO WHICH TOP OF PLUG WAS SET (MAY BE REPORTED IN LIEU OF MEASURED TOP OF PLUG OR ALONG WITH TOP OF PLUG)." The ODP keeps only one top, so which source fed it is unstated (C4). |
| `plug_bottom_depth` | ft | Bottom of plug (depth of tubing or drill pipe bottom) | CONFIRMED unit; mapping INFERRED by name | D4 p.1 "21. Depth to Bottom of Tubing or Drill Pipe (ft.)". D1 p.2-47 WB-BOTTOM-TUBE-PIPE-DEPTH: "DEPTH TO WHICH BOTTOM OF PLUG WAS SET INSIDE CASING." |
| `plug_cmt_sacks` | sacks | Cement used for this plug | CONFIRMED | D4 p.1 "*22. Sacks of Cement Used (each plug)". D1 p.2-47 WB-NBR-OF-CEMENT-SACKS: "NUMBER OF SACKS OF CEMENT USED TO PLUG WELL." |
| `total_depth_w3` | ft (INFERRED) | Total depth reported on the W-3 | CONFIRMED meaning; unit INFERRED | D4 p.1 header "Total Depth", next to "16. Type Well (oil, gas, or dry)"; its item number is not legible in text extraction. A second, unrelated "34. Total Depth" label sits beside "Other Fresh Water Zones by GAU"; this citation is the first one. **Neither label carries a unit.** D1 p.2-41 WB-PLUG-TOTAL-DEPTH: "THE MAXIMUM DEPTH OF THE PLUGGED BORE." Feet inferred from the other W-3 depth items "(ft.)". |
| `w3_date` | date | A W-3 date: plugged date or filed date | INFERRED (ambiguous) | D4 p.1 "15. Date Well Plugged". D1 p.2-41 offers two: WB-DATE-WELL-BORE-PLUGGED "THE DATE REPORTED ON W-3 FORM BY OPERATOR." and WB-DATE-W3-FILED "THE DATE STAMPED ON FORM WHEN IT IS RECEIVED IN THE RRC DISTRICT OFFICE." The column name does not say which. |
| `depth_reference` | ft above MSL (if same as casing) | Elevation | INFERRED (from casing); see C3 | **The W-3 (D4) has no elevation item, and D1's plugging segments (pp.2-39 to 2-53) carry no elevation field.** The only official definition is D1 WB-ELEVATION in the completion date segment. Where the plugging view takes the value from is unstated. |
| `depth_reference_code` | code | Elevation reference point | INFERRED (same code list as casing); see C3 | As above. The preserved metadata range runs "BH" to "UU", with top values GR, GL, KB, DF, RT, DB. |
| `record_sequence` | integer | Plugging-filing ordinal per API | UNSTATED (meaning INFERRED) | Metadata range 1–5. D1 p.2-39: the plugging data segment WBPLUG is "(RECURRING)", keyed "WB-DATE-W3-FILED … NON-UNIQ", so several W-3 filings per wellbore exist. Linking that to this column is inference only. |
| `on_top_record` | boolean | Unknown | UNSTATED | As casing. |

## 4. `depth_reference_code` code table

The only official code list with meanings is D1 p.2-15 (definitions) and p.2-13 (layout):

| Code | D1 name | Status |
|---|---|---|
| GL | WB-GROUND-LEVEL | CONFIRMED |
| DF | WB-DERRICK-FLOOR | CONFIRMED |
| KB | WB-KELLY-BUSHING | CONFIRMED |
| RT | WB-ROTARY-TABLE | CONFIRMED |
| GR | WB-GROUND | CONFIRMED; D1 gives no explanation of how GR differs from GL |
| RKB | — | D2/D3 item 29/30 lists "RKB" (rotary kelly bushing, not expanded on the form); D5 lists "GL(1),GR(2),DF(3),RT(4),RKB(5)". Not observed in the ODP top values. |
| DB, AR, WF, BH, UU and any other | — | **UNSTATED.** These appear in the preserved ODP metadata (casing top values include "DB"; casing range "AR"–"WF"; plugging range "BH"–"UU"), but no official code list contains them. Show them verbatim as "code not in RRC WBA091 list". |

## 5. Conflicts and disclosures (R7 style)

- **C1 — `depth_reference` is an elevation, not a depth offset.**
  - D1 defines the paired value as "MEASUREMENT OF FEET ABOVE MEAN SEA LEVEL OF WELL", and the forms label it "Elevation". The ODP name "depth_reference" suggests a depth datum.
  - The proof values fit elevations in feet: `300.0` for API `20332896` (county code 203, East Texas) and `2541.0` for API `38910201` (county code 389, Permian). That geographic fit is INFERRED from the county code, not stated.
  - Small values in the metadata top list ("12.0", "25.0", "17.0") are ambiguous. They could be low coastal elevations, or a kelly-bushing height above ground entered in the wrong place. No document resolves this.
  - Structural support: D1 p.2-13 "WB-ELEVATION PIC 9(04)", and the casing metadata maximum is `9999.0`, the four-digit ceiling (possibly a fill value).
  - Ruling suggestion: label it "elevation (ft above MSL per RRC WBA091 p.2-15; ODP column named depth_reference)", show it verbatim, and never use it to convert depths.
- **C2 — `cmt_sacks` may not always be sacks.** D1 stores a cement-measurement code allowing sacks, cubic yards or cubic feet ('S'/'Y'/'F'). The ODP exposes no measurement code, and the column name asserts sacks. Disclose: "unit is sacks per the ODP name and Form W-2/G-1; legacy records may have been recorded in cubic yards or cubic feet (WBA091 p.2-22), and the ODP does not say whether those were converted or excluded."
- **C3 — Plugging `depth_reference`/`depth_reference_code` have no W-3 source.** The ODP says the plugging view is "as reported on RRC Form W-3", but the W-3 has no elevation item. Its provenance is unstated, possibly copied from the completion record. Disclose it as such.
- **C4 — Plug top is measured or calculated.** The W-3 has both a calculated top and a measured "(if tagged)" top. The ODP has one `plug_top_depth`, so the basis is unstated.
- **C5 — `toc` values.**
  - `0.0` is plausibly surface (cement circulated to surface), but D1 stores the field as text (`PIC X(07)`, p.2-20) and zero-filled numerics default to zero. So `0.0` can also mean "not reported". Do not render `0.0` as "surface" without a disclosure.
  - The metadata maximum `4000300.0` is not a physical depth. It is exactly seven characters, matching D1's text layout `WB-TOP-OF-CEMENT-CASING PIC X(07)` (p.2-20), so a text-to-number conversion artifact is likely (INFERRED).
- **Field widths agree with D1.** The other metadata maxima sit under D1's five-digit `PIC 9(05)` ceilings: `csg_depth` 99945, `cmt_sacks` 94912 and `total_depth_w3` 97509 (WB-CASING-DEPTH-SET, WB-AMOUNT-OF-CEMENT and WB-PLUG-TOTAL-DEPTH are all `PIC 9(05)`, pp.2-20 and 2-39). That is consistent with the column-to-segment mapping, but it does not prove it.
- **C6 — Sentinel-like extremes.** Preserve these verbatim with no QC repair:
  - casing `csg_size` max `99.625`, `hole_size` max `100.0`, `toc` max `4000300.0`, `completion_date` up to `2070-09-05`;
  - plugging `w3_date` minimum `1893-10-14`, `depth_reference` max `9999.0` (casing).
- **C7 — Stated row grain vs. observed.** As in §1, "one row per API # per casing string" is contradicted by repeated strings across `record_sequence`.

## 6. Recommended v4 fixed documentation targets

Fetch these without a token, under the existing rrc.texas.gov host rules, each with a `.source.json` sidecar. Pin the SHA-256 values above in the evidence so drift is visible.

1. **`wellbore-wba091.pdf`** ← D1 `https://www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf` (804 KB).
   - It is the only official document that defines the casing segment, the plug record and the elevation code list.
   - It supplies `toc`, `multi_stg_depth`, `depth_reference`/`_code`, the plug-top variants and the cement measurement code.
   - Largest of the three, but well under a megabyte.
   - Unstable `/media/<hash>/` path. The legacy `rrc.state.tx.us/media/1236/wba091k.pdf` exists only in a UNT web archive, so there is no stable alternative.
2. **`form-w2.pdf`** ← D2 `https://www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf` (59 KB).
   - It gives explicit units for casing: "Setting Depth (ft.)", "Casing Size (in.)", "Hole Size (in.)", "Multi-Stage Tool Depth (ft.)", "Cement Amount (sacks)" and "Total Depth (ft.)".
   - It is the form for injection/disposal wells: item 11 "Purpose of filing" includes "B. Injection/Disposal/Storage/Brine Mining".
   - G-1 (D3) carries identical casing-record units and need not be preserved separately. Cite it as "same columns" only if desired.
   - Unstable `/media/<hash>/` path.
3. **`form-w3.pdf`** ← D4 `https://www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf` (117 KB).
   - It gives the plugging units: "(ft.)" for tubing bottom and the calculated and measured tops, "Sacks of Cement Used (each plug)", "Date Well Plugged", and the eight plug columns.
   - Unstable `/media/<hash>/` path.

Not recommended:
- D5: its column layout does not extract reliably, and it is a secondary source.
- D6: it has no relevant fields.
- The fillable W-3: a duplicate.
- The ODP dataset pages: they render by script and add nothing beyond the preserved metadata `description`.

## 7. Unverifiable or not fetched

- `on_top_record` and `record_sequence` meanings: no official source found (UNSTATED).
- Which D1 date feeds `completion_date` and `w3_date`, which plug top feeds `plug_top_depth`, and where plugging `depth_reference` comes from: UNSTATED.
- `https://www.rrc.texas.gov/media/a3lm3vdy/w-3-fillable.pdf`: listed on P2 but not fetched (UNVERIFIED; a duplicate of D4).
- The UNT web-archive copies of older WBA091 editions (`wba091k.pdf`, `wba091_wellbore_october2014.pdf`) and the data.gov catalog mirrors appeared in search results only; they were not fetched (UNVERIFIED) and are not official current RRC URLs.
- The `www.rrc.texas.gov/media/<hash>/` stability is not guaranteed by RRC. All three recommended targets carry that risk.
