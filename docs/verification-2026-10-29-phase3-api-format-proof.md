# Phase 3 API format proof — casing, plugging and inventory (2026-10-29)

Requirement: RRC-14 step 1 and step 2. Contract: [ADR 004](adr/004-wellbore-identity-and-relations.md) §2 ("If the Phase 3 one-query format proof shows the casing/plugging `api_no` differs in format from the inventory's eight characters, connector work stops"). The owner authorized these nine read-only queries on 2026-10-29.

## How it was run

Main ran a one-off script through `fetchSourceWithThrottleRetry` from `src/sourceFetch.mjs`, using the owner's app token from `TRRC_SOCRATA_APP_TOKEN`. That function sends the token only in the header and records `app_token_used`. The script queried three API numbers, taken from the inventory rows of the Phase 2 proof wells:

| UIC | Inventory `api_no` |
|---|---|
| 000020838 | `38910201` |
| 000111186 | `20332896` |
| 000119875 | `38940222` |

The three queries per API:
- Casing `u9m4-xnh6`: `$where=api_no='<api>'`, `$limit=50`, `$order=record_sequence,id`.
- Plugging `wfzn-9fje`: the same `$where`, `$limit` and `$order`.
- Inventory `givw-z9t4`: `$where=api_no='<api>'`, `$limit=25`, `$order=uic_number,api_no`, the same form as the existing lookup query.

The bytes are preserved unchanged in [`raw-discovery-2026-10-29-api-proof/`](../raw-discovery-2026-10-29-api-proof/), each next to its `.source.json` sidecar. That directory is evidence only: no pipeline reads it. All nine sidecars show HTTP 200 and `app_token_used: true`. A search of the directory for the token value finds nothing.

## Results

| API | Casing rows | Plugging rows | Inventory rows |
|---|---|---|---|
| `38910201` | 2 | 0 | 1 (UIC 000020838) |
| `20332896` | 8 | 0 | 1 (UIC 000111186) |
| `38940222` | 2 | 0 | 1 (UIC 000119875) |

- **Casing format: confirmed.** Every casing row returned `api_no` exactly equal to the inventory string, with 8 characters. No padding, state code or stripping is needed. ADR 004 §2 holds and connector work may proceed.
- **Plugging format: confirmed by metadata, not by a matched row.** None of the three active injectors has a plugging (W-3) row. A zero-row result cannot by itself tell "no record" apart from "format mismatch". The format evidence for plugging is therefore the preserved Phase 1.1 view metadata (`raw-discovery-2026-10-29/plugging-wfzn-9fje.json`, column `api_no`):
  - type `text`;
  - smallest value `00100008`, largest `71530033`;
  - every top value is 8 digits with no non-digit characters.
  - That is the same form as inventory (`text`, smallest `00100000`) and casing (`text`, smallest `00100037`).
- **Inventory uniqueness: each API matched exactly one inventory row.** None of the three APIs is shared by several inventory rows. The "inventory rows sharing an API" fixture therefore cannot be drawn from these wells and must be a constructed fixture.

## Findings that change the design

- **`record_sequence` is a filing sequence, not a casing-string key.**
  - Several casing strings share one `record_sequence`. In `38910201`, both strings are sequence 1.
  - `20332896` has four filings (sequences 1–4). Each repeats the same two strings (9.625 in at 1547 ft and 5.5 in at 10210 ft), with differing dates, depth-reference codes (GR, then GL) and top of cement.
  - A repeated `record_sequence` is therefore normal and must not be treated as a duplicate.
  - The only unique row key observed is the source `id`.
- **`on_top_record` does not follow the highest sequence.**
  - For `20332896`, `on_top_record: true` is set on sequence 3 (completion date 2017-11-09), not on sequence 4 (2014-12-03).
  - The field is absent (not `false`) on the other rows.
  - It must be preserved verbatim and not derived from the sequence or the date.
- **Dates are `calendar_date` timestamps** (`YYYY-MM-DDT00:00:00.000`), not the plain `YYYY-MM-DD` text of BHP/SRT.
- **Numbers arrive as JSON strings** (`"1547"`, `"0.0"`). `on_top_record` arrives as a JSON boolean.
- **Socrata omits null fields from the JSON**, as with BHP/SRT. `multi_stg_depth` is absent from all 12 casing rows.

## Addendum: plugging format with matched rows (owner decision OD-7, 2026-10-29)

None of the three proof wells has a plugging row. The owner therefore authorized two more read-only discovery queries, to find one inventory well that does. Both went through the same fetch function with the app token: HTTP 200, `app_token_used: true`, and no token value in the bytes. The bytes are in [`raw-discovery-2026-10-29-fourth-well/`](../raw-discovery-2026-10-29-fourth-well/).

1. Inventory `givw-z9t4`:
   - `$where=w3_plugged_date >= '2025-01-01' AND w3_plugged_date < '2025-07-01'`, `$limit=10`, `$order=uic_number`.
   - It returned 10 wells, UIC 000000091 to 000000226, all injection type 3 in district 01.
2. Plugging `wfzn-9fje`:
   - `$where=api_no in (<the 10 inventory api_no strings>)`, `$limit=200`, `$order=api_no,record_sequence,id`.
   - Every one of the 10 APIs returned 2–3 plug rows, each under its exact 8-character inventory string.

- **Plugging format: now confirmed with matched rows.** The inventory `api_no` string matches plugging `api_no` exactly. No transformation is needed.
- **Candidate fourth well (not yet collected): UIC 000000209, API `16300331`.**
  - Three plug rows (ids 485464–485466), all with `record_sequence` 1 and `on_top_record: true`.
  - `w3_date` is 2025-01-28.
  - Plug intervals are 2881–3505, 1691–2125 and 1–1430, with 30, 20 and 130 sacks.
- **`total_depth_w3` is `"0"` on all three rows.** That is a published zero, not an absent field. It must be kept as published and must not be read as a total depth of zero feet or treated as missing.
- **The inventory `w3_plugged_date` (2025-03-07) differs from the plugging `w3_date` (2025-01-28) for the same API.** The source does not say what each date marks, so both are kept as published, without reconciliation.
