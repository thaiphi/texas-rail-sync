# Phase 3b proof — relation catalogue and dossier (RRC-15), 2026-10-29

Scope: [Phase 3b design](superpowers/specs/2026-10-29-phase3b-relation-catalogue-design.md) §10, option B (query version 5). The owner ruled OD-1 on 2026-10-29 and accepted one local re-collection.

## Live v5 collection

One local collection through `/api/collect`, with the app token from `TRRC_SOCRATA_APP_TOKEN` (header only):

| Item | Value |
|---|---|
| Well | UIC 000109605, API 38934609, TRIPPET SWD 1 (the well's v4 version has matched casing and plugging) |
| Reporting range | 2024-01 to 2026-09 (the same as the v4 version) |
| Version | `rrc-2026-10-30-uic000109605-b7628a71-03fe-4a16-928c-033353e1fce0` |
| Labels | query version 5, `rrc-collection-v5`, `rrc-odp-v2.3.0` |
| Run | `e5b65e02-2082-45c6-a1d2-25925ed9a4d7` |
| `manifest.json` SHA-256 | `89586fc14a58cb770cb282ffaf3b453728a13be8b4c643ff09a95e708b5d6308` |

The artifact ID carries 2026-10-30 because it is stamped in UTC.

**Counts.** For every dataset, raw = parsed = accepted + quarantined:

| Dataset | Rows | Link |
|---|---|---|
| H-10 | 16 matched | — |
| BHP | 0 | — |
| SRT | 0 | — |
| Casing | 9 = 9 + 0 | `matched` |
| Plugging | 7 = 7 + 0 | `matched` |

The only quality flags are 6 × `missing:multi_stg_depth`.

**Relations** (`evidence_relations.json`, `rrc-relations-v1`): 67 in total. This equals the offline derivation from the committed v4 bytes.

| Relation | Count | Status |
|---|---|---|
| `inventory_to_h10` | 16 | matched |
| `inventory_to_test_report` | 0 | — |
| `inventory_to_wellbore` | 2 | matched |
| `wellbore_to_casing` | 9 | matched |
| `wellbore_to_plugging` | 7 | matched |
| `record_to_source_snapshot` | 33 | null |

**Same targets as v4.** The v5 manifest lists 22 sources: the 21 targets plus the lookup. Their URLs are equal, in the same order, to those of the v4 version `rrc-2026-10-29-uic000109605-70983258-…`.

**§5 regression on live data.** These ten files are byte-identical to the committed v4 version, although the bytes were fetched again:
- `inventory.csv`
- `injection_monthly.csv`
- `quality_report.json`
- `data_dictionary.json`
- `tests_bhp.csv`
- `tests_srt.csv`
- `tests_dictionary.json`
- `casing.csv`
- `plugging.csv`
- `wellbore_dictionary.json`

The differences from v4 are:
- Retrieval metadata: the `*.source.json` and `*-metadata.json` files, and the `acquisition.json`, `selection.json` and `lookup.json` markers.
- `tests.json`, `casing.json` and `plugging.json`, where `query_version` is now 5.
- The one new file, `evidence_relations.json`.

The source rows did not change between the two retrievals.

**Replay.** `node --test test/*.test.mjs` passes 465/465 with the new version present. The committed-replay test rebuilds every version, including this v5 version and the v4 Barbaro version, byte for byte from its own `sources/`.

**Token.** A grep for the token value over `artifacts/`, `runs/`, `collected-sources/` and `lookups/` finds 0 hits.

**Transfer script.** `scripts/prepare-supabase-archive.mjs` exits 0 and logs `skipped_local_only_test_report_version` for the v5 version, its run and its raw source folder. The default and Analytics pins are unchanged.

## Cross-module check (offline)

The v4 sources of TRIPPET (000109605) and Barbaro 23 (000125182) were copied to a temporary folder, marked v5 and built with `buildArtifact`. The real output was then passed to the browser's `reconcileDossier` and `renderDossierView`. Both reconcile, and neither render contains compliance wording.

Barbaro has these relations:
- 31 H-10.
- 5 test-report relations (4 BHP, 1 SRT).
- `inventory_to_wellbore` casing `matched` and plugging `none/no_source_rows`.
- 4 casing.
- 41 source-file relations.

## Browser check

Chrome, local server, with the new v5 version open:
- **Content.** The Dossier tab shows the identity panel, presence sentences, an edge table of 35 rows, a source-file table of 33 rows inside `<details>`, and a ladder of 45 drawn depths, 6 of them listed only. The ladder table has 51 rows. Every table has a caption, and no header cell lacks `scope`. The three scroll regions are focusable and named. The filter is labelled "Show relation type".
- **Keyboard.** From the filter, Tab reaches the edge-table region and then the first key link. Enter opens the Records tab of the same version.
- **Other versions and keys.** On the v4 TRIPPET version the tab says the catalogue "was not produced for this version". A key outside the version gives "This record is not part of version …", with no fallback.
- **Analytics message.** It reads "Test-report, wellbore and relation versions are not sent to Analytics …".
- **Console.** The only error is a 404 for `/favicon.ico`, which was already there.
- **Not done.** No screen-reader session was run. The accessible names above come from the DOM.

## Independent review

An Opus reviewer ran a read-only review at `02149e6` and gave a PASS. Main fixed four findings in `517cba4`:
- **I1.** The browser validator refused non-matched H-10 and test relations, because the pipeline publishes `parent_key` as `''` there. This was latent: no bounded export can produce such a row today.
- **M1.** The `not_permitted` fence is now checked against the array rebuilt from its own strings. On that condition, the reviewer accepted keeping "nearby" verbatim inside the fence.
- **M2.** The Analytics message now names wellbore and relation versions.
- **M3.** Null-status counts must have the shape `{"null":n}`.

Recorded, not fixed:
- **M4.** There is no per-relation uniqueness or completeness check in the browser. This is defence in depth only, because the file is verified by its hash first.
- **M5.** The candidate table links a wellbore-inventory candidate by text match. This is sound because equal keys imply identical bytes.
