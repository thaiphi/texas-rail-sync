# Phase 2 live proof — BHP/SRT test reports (2026-10-29)

Requirement: RRC-13. Contract: [Phase 2 design](superpowers/specs/2026-10-29-phase2-bhp-srt-design.md) §11. The owner authorized the three wells on 2026-10-29.

## How it was run

On 2026-10-29, Main ran the branch's local server (`createExplorerServer`, the same code as `scripts/serve.mjs`) with the owner's data.texas.gov app token, read from `TRRC_SOCRATA_APP_TOKEN`.
- For each UIC: one exact-UIC lookup, explicit selection of the single candidate, then one `/api/collect` over 2024-01 to 2026-09.
- That gave three new local query-version-3 versions (transformation `rrc-odp-v2.1.0`, pipeline `rrc-collection-v3`).
- No other wells were queried.

| UIC | Version | Run | H-10 rows | BHP raw = accepted + quarantined | SRT raw = accepted + quarantined | `manifest.json` SHA-256 |
|---|---|---|---|---|---|---|
| 000020838 | `rrc-2026-10-29-uic000020838-a8606089-cd03-4c22-9161-11dd443331a8` | `bd118d62-5798-41b6-8a98-f1774e5d7588` | 28 | 0 = 0 + 0 (`confirmed_empty`) | 0 = 0 + 0 (`confirmed_empty`) | `e583cb24b12a2b8c32c245e051f073d54fa3f3a892f8e92ef64cfdc3419e74f1` |
| 000111186 | `rrc-2026-10-29-uic000111186-fbee3ba0-9d68-4572-9331-7a545cbbade7` | `571ff098-8270-4b0b-a623-24ad8c878e94` | 23 | 8 = 8 + 0 | 0 = 0 + 0 (`confirmed_empty`) | `1f79572809b5126dd266bd6e0f72f32897b4210327ef3d7c974c994f47296abb` |
| 000119875 | `rrc-2026-10-29-uic000119875-b911ce3c-2d6d-430e-bee0-8b3cb8cc7465` | `7259fd89-37b0-436c-8561-1bdb09c81113` | 28 | 1 = 1 + 0 | 98 = 76 + 22 | `f35ef5980e6e4a62e675606e8f3595b973013566ad62a2a6e042f00bd5757e21` |

In every case parsed = raw and excluded = 0. All three runs succeeded through load, normalize-qc and export.

A first run of the same three collections, earlier that day, gave identical counts. It was discarded before any push, because its manifests described test rows as "one summary row per reported test". That wording overclaims (see "Row grain" below). The wording was corrected in code, Help and SPEC, and the proof was re-run.

## Findings

- **Date format confirmed.** All 54 non-missing date values across the four date columns match `YYYY-MM-DD`. Missing dates are flagged `missing:` and accepted; none were quarantined for date parsing.
- **`$order` accepted.** HTTP 200 for both the BHP query (`report_id,tracking_no,test_sequence_no`) and the SRT query (`report_id,tracking_no`).
- **Quarantine came from source contradictions only.** All 22 quarantined SRT rows for 000119875 carry `inconsistent:top_perf_exceeds_bottom`: the source's top perforation is deeper than its bottom perforation (for example top 7192 ft, bottom 6065 ft, tracking 51855000).
  - Their `missing:` flags (rates, ISIP, fracture values) are accepted flags, not quarantine reasons.
  - Every row is retained in `tests.json` and `tests_srt.csv`.
- **Row grain is undocumented.**
  - For 000119875, all 98 SRT rows share one `tracking_no` (51855000) but have 98 distinct `report_id` values.
  - Most rows are sparse. Socrata omits null fields from the JSON, and the connector flags each absent field as `missing:` and keeps it null.
  - Counts over all 98 rows:
    - 92 lack the injection rates and ISIP;
    - 86–88 lack the fracture values;
    - 76 lack the received date and the perforations;
    - 77 lack the test date;
    - 22 have the top perforation below the bottom.
  - Missing values are accepted flags, never zeros. Only the 22 contradictions are quarantined.
  - The source does not say whether this is one submission with many rows, resubmissions or step records.
  - The connector merges and drops nothing. The Help text, Tests caption and manifest limitation now say "one row per source record (the source does not document how many rows one test produces)".
- **CSV well-formed.** `tests_srt.csv` for 000119875 parses under a strict RFC 4180 reader into exactly 98 data rows of 24 columns, with no ragged rows. It is written by the same CSV writer as `inventory.csv`.
- **Token handling.** The token was used only where intended:
  - All 30 data.texas.gov sidecars written by these collections record `app_token_used: true`.
  - The two RRC document sidecars record `false`; the token is never sent to rrc.texas.gov.
  - Both RRC documents returned HTTP 200.
  - A byte scan of all 2,796 files in the worktree after the re-run found no occurrence of the token value.
- **Pins unchanged.** `public/artifact-path.json` and `public/artifact-integrity.json` are unmodified, and no existing version changed. The new versions are local only: the Supabase transfer script skips v3 versions, their runs and their raw sources (D7).
- **Browser.** The local server opened the 000119875 version from the first run in Chrome. That run had the same code apart from the corrected wording:
  - the Tests tab rendered 1 BHP and 98 SRT rows, with the 22 quarantined rows marked and dictionary units in the headers;
  - the definitions panel showed the `bhp_psia`/PSIG conflict note and the FIRC "not defined" note;
  - Downloads showed the Analytics block message for v3.

  The only console error was the known favicon 404.

## Limits

- The H-10 row counts for each window are as returned; this proof does not check H-10 reporting completeness.
- 000020838 has no BHP or SRT reports in ODP, so its empty result is a confirmed empty query, not evidence that no test was conducted.
- Units still rest on ODP field names, plus the cited official documents for concepts only.
