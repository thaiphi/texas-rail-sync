# Phase 3 live proof — casing and plugging (2026-10-29)

Requirement: RRC-14. Contract: [Phase 3 design](superpowers/specs/2026-10-29-phase3-casing-plugging-design.md) §11. The owner authorized the four wells on 2026-10-29. Three are the Phase 2 proof wells; the fourth is the plugged disposal well chosen in [the format proof](verification-2026-10-29-phase3-api-format-proof.md), addendum 2.

## How it was run

On 2026-10-29, Main ran the branch's local server (`createExplorerServer`, the same code as `scripts/serve.mjs`, at commit a49fb47) with the owner's data.texas.gov app token, read from `TRRC_SOCRATA_APP_TOKEN`.
- For each UIC: one exact-UIC lookup, explicit selection of the single candidate, then one `/api/collect` over 2024-01 to 2026-09.
- That gave four new local query-version-4 versions (transformation `rrc-odp-v2.2.0`), each with 21 targets.
- No other wells were queried.

| UIC | API | Version | Run | H-10 rows | BHP raw = accepted + quarantined | SRT raw = accepted + quarantined | `manifest.json` SHA-256 |
|---|---|---|---|---|---|---|---|
| 000020838 | 38910201 | `rrc-2026-10-29-uic000020838-903b89ff-452c-422c-87cf-ae3e4260b733` | `2ce28149-b7da-459f-be86-715d5d1b7b90` | 28 | 0 = 0 + 0 | 0 = 0 + 0 | `93a6d9a9f95812cc29c39f5c8d1efbb1de0e86f23ac8ffb13aac99b02e614fbb` |
| 000111186 | 20332896 | `rrc-2026-10-29-uic000111186-b477a317-a6bb-4ab9-b059-ac2e5d61b12d` | `d21e9575-831b-4ea1-98ae-6ec5eb093b88` | 23 | 8 = 8 + 0 | 0 = 0 + 0 | `d11fb2f1966f724a43243655a14499ae85d98db132f0ecbeb6ad7a31a07839b3` |
| 000119875 | 38940222 | `rrc-2026-10-29-uic000119875-edce4598-1396-49f0-9829-96271fa93249` | `6da54853-48f7-4e8f-b2ef-7de4a07b12f5` | 28 | 1 = 1 + 0 | 98 = 76 + 22 | `8daf5c7c76e7fb3c82dea4e6a9f2cb9b2e9f4b4808eae70dfa2f3f86d433c224` |
| 000109605 | 38934609 | `rrc-2026-10-29-uic000109605-70983258-9751-4e79-bb78-1a1cb7068e14` | `c0585094-a6f9-47a4-be50-9d9b358c0801` | 16 | 0 = 0 + 0 | 0 = 0 + 0 | `57d8f4327dd85d7b14d737ca2024fedfe2acea87e1c8c2e741f84affb7045d0b` |

The H-10, BHP and SRT counts of the three Phase 2 wells equal their [Phase 2 proof](verification-2026-10-29-phase2-live-proof.md) counts.

## Casing and plugging

| UIC | Exact-API inventory rows | Casing raw = parsed = accepted + quarantined | Casing link | Plugging raw = parsed = accepted + quarantined | Plugging link |
|---|---|---|---|---|---|
| 000020838 | 1 | 2 = 2 = 2 + 0 | `matched` | 0 = 0 = 0 + 0 (`confirmed_empty`) | `none` / `no_source_rows` |
| 000111186 | 1 | 8 = 8 = 8 + 0 | `matched` | 0 = 0 = 0 + 0 (`confirmed_empty`) | `none` / `no_source_rows` |
| 000119875 | 1 | 2 = 2 = 2 + 0 | `matched` | 0 = 0 = 0 + 0 (`confirmed_empty`) | `none` / `no_source_rows` |
| 000109605 | 1 | 9 = 9 = 9 + 0 | `matched` | 7 = 7 = 7 + 0 | `matched` |

- In every case excluded = 0, and every run succeeded through load, normalize-qc and export.
- The casing counts for the three Phase 2 wells equal the format proof (2 / 8 / 2), and the plugging rows for 000109605 equal its discovery bytes (7 plugs, 4508–4629 deepest to 3–12 at the surface, `total_depth_w3` 6515, `w3_date` 2024-12-21).
- **The only quality flags are `missing:multi_stg_depth`** (2, 8, 2 and 6 casing rows), all accepted. No row was quarantined; no duplicate `id`, no date parse failure and no inverted plug occurred.
- **Dates:** every `completion_date` and `w3_date` arrived as `YYYY-MM-DDT00:00:00.000` and was accepted.
- **`$limit=1000` was accepted** for every casing and plugging query (HTTP 200, below the cap).
- **Each API is unique in the inventory** (one exact-API inventory row each), so no link is `ambiguous`.

## Findings

- **Casing row grain is wider than the ODP description.** For 000109605 each of three filings (`record_sequence` 1–3, completion dates 2021-10-28, 2019-05-01 and 2014-12-14) carries three rows: a 10.75 in string at 1550 ft and two 7 in rows at 6515 ft. The two 7 in rows differ only in `toc` (1650 and 3984) and in `multi_stg_depth` (3984 on the first, absent on the second). This looks like a two-stage cement job reported as two rows, but the source does not say so. Every row is kept; nothing is merged. `on_top_record` is set only on sequence 1, the newest filing.
- **Token:** a search of `artifacts/`, `collected-sources/`, `runs/`, `lookups/`, `docs/` and the three discovery directories finds no token value.
- **Replay:** `node --test test/*.test.mjs` passes 416/416 with the four new versions committed, so every committed version, including these four, rebuilds byte for byte.
- **Browser:** the Wellbore view renders the real 000109605 and 000020838 sidecars with cited units in the column headers (for example `csg_depth (ft)`, `toc (ft (INFERRED))`), the §4.4 presence sentences and no "unavailable" fallback. This was checked by rendering `renderWellboreView` on the real files in Node, not in a browser window.
- **Pins:** the default and Analytics pins are unchanged. These versions are local only; the transfer script skips query version 3 and later.
