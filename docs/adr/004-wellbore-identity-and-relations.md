# ADR 004 — Wellbore identity domain and typed evidence relations

Date: 2026-10-29. Status: accepted for Phases 1–2. No connector implements it yet. Phase 3 identity code requires another independent review before it merges (D4). Authority: owner approval of the expansion-review recommendations D3, D4 (as changed by v1.1), D10, D15, D21 and D22 on 2026-10-17 ([v1.0 review](../expansion-prd-review-2026-10-17.md) §9, [v1.1 review](../expansion-prd-review-v1.1-2026-10-17.md) §9). Requirements: RRC-13 to RRC-15 in the [tracker](../requirements.md). It extends [ADR 002](002-bounded-well-selection.md) and does not change any existing artifact, query or replay.

## Context

The Explorer's identity rules come from ADR 002 and SPEC "Identity and normalization". UIC is a nine-character original string. The eight-character source API is preserved, but it is never used as a join key or treated as unique.

Three of the planned ODP datasets carry no UIC field: Wellbore Casing `u9m4-xnh6`, Wellbore Plugging `wfzn-9fje` and Well Bottom Location `uumf-5r4y`. They are keyed by API. The two test datasets, BHP `qxfy-wcfs` and SRT `h54t-xnbi`, carry `uic_no` (v1.0 review §5.3). Linking casing and plugging to a selected UIC well therefore needs a second identity domain with written rules. PRD item E10 (dossier and relationship index) needs the same rules, so it is merged into this ADR (D15).

## Decision

### 1. Two sibling identity domains

| Domain | Identity | Source of the value | Joins it may drive |
|---|---|---|---|
| UIC | `uic_id`: the original nine-character `uic_number` / `uic_no` string, leading zeros retained | Inventory `givw-z9t4`; H-10 `qq2j-f2zm`; BHP; SRT | Inventory → H-10 rows; inventory → BHP/SRT reports |
| Wellbore | `source_api_id`: the original `api_no` string of the selected inventory row, exactly as received | Inventory row only | Wellbore → casing/plugging rows of the same string |

Neither domain substitutes for the other. **API never joins H-10 monthly rows and never resolves a UIC parent automatically.** The ADR 002 API lookup only lists candidates for explicit selection. After selection, the exact-UIC inventory query governs. `parent_key` keeps its ADR 002 meaning. The existing dictionary statement that `api_no` is "never used as join key" stays true for the UIC contract files. The wellbore link is a separate, labelled relation with its own status.

No normalization of API strings is approved. That rules out padding to 10 or 14 digits, adding a state code and stripping zeros or dashes. If the Phase 3 one-query format proof shows the casing/plugging `api_no` differs in format from the inventory's eight characters, connector work stops. Any transformation then needs an amendment to this ADR, with the proof attached.

### 2. Wellbore link status

Each retained inventory row in a version that collected a wellbore dataset gets exactly one link status per wellbore dataset. Every status records the link basis `inventory_api_no`. Whenever a query was made, it also records the query URL and the response hash.

**Uniqueness is proven, never assumed.** A bounded collection keeps only the exact-UIC inventory query (ADR 002), which cannot reveal other permits on the same wellbore. So before any wellbore status is assigned, the version also preserves an exact-`api_no` inventory query on `givw-z9t4`, with its sidecar. That query uses `$where api_no='<string>'`, `$limit=25` and an `$order`. The response must contain the selected row, identified by its original UIC, API, operator, lease and well identity. If it does not, or if it is empty, that is a scope contradiction and the version is not verified.

Statuses are assigned in this order. The first rule that applies wins.

1. The row's `api_no` is missing or not eight digits → `none` with reason `api_missing_or_invalid`. No query is made.
2. The inventory or wellbore query fails → no status is assigned and the run fails.
3. Any response row contradicts its predicate → handled as in ADR 002: the raw bytes are retained, the row is quarantined and the version is not verified. This is never a status.
4. The wellbore response reaches its row cap → `SOURCE_ROW_LIMIT`, and the version is not published (as for H-10).
5. The exact-`api_no` inventory response has two or more rows → `ambiguous`. This happens, for example, when two UIC permits sit on one wellbore. If the response reaches the 25-row cap, the reason is `inventory_cap_reached`. The wellbore rows are kept and shown under the wellbore, but they are attributed to no single UIC. Every candidate inventory row is listed, along with the wellbore row count, which may be zero.
6. The wellbore query succeeded with zero rows → `none` with reason `no_source_rows`. This does not mean "no casing exists".
7. Otherwise → `matched`. Exactly one inventory row carries the string, and every wellbore row's `api_no` equals it.

`source_api_id` is the reported API number. An eight-digit API cannot tell sidetracks or recompletions apart, so `matched` asserts only that the strings are equal. It does not assert that the rows belong to one physical bore.

A wellbore dataset that was not collected for a version has no status at all, and the interface says "not collected". The wellbore link status takes only the values `matched`, `none` and `ambiguous`; Analytics consumes those three (phi-analytics `docs/project-2-decisions-2026-10-20.md`). `needs_review` is a status of the relation catalogue for non-wellbore relations only. It is never a wellbore link status.

### 3. Typed relation catalogue (E10)

Relations are derived at export from records in one version. They are deterministic: the same sources give byte-identical relations. Each relation records:
- `relation`
- `from_key` and `to_key`: stable source keys, never UI state
- `basis`
- `status` where applicable
- `evidence`: the source file name and its SHA-256

| `relation` | From → to | Key rule | `basis` | Available |
|---|---|---|---|---|
| `inventory_to_h10` | inventory `source_record_key` → monthly `source_row_key` | exact `uic_no` string equals the inventory `uic_number`. Status reuses the existing `parent_join_status` values as they are. | `exact_uic_string` | Derivable from v1-schema data; emitted only into new versions |
| `inventory_to_test_report` | inventory `source_record_key` → BHP/SRT source row key (snapshot plus ordinal, so retained duplicates stay distinct) | exact `uic_no` string. Report identity is `report_id` plus `tracking_no` (and `test_sequence_no` for BHP). Duplicate report identities are quarantined, never merged. | `exact_uic_string` | Phase 2 |
| `inventory_to_wellbore` | inventory `source_record_key` → `source_api_id` | section 2 | `inventory_api_no` | Phase 3 |
| `wellbore_to_casing` / `wellbore_to_plugging` | `source_api_id` → casing/plugging source row key | exact `api_no` string. `id`, `record_sequence` and `on_top_record` are preserved; one row per string or plug is never collapsed. | `exact_api_string` | Phase 3 |
| `record_to_source_snapshot` | any record → `source_snapshot_id` | the file the record was parsed from | `source_file_hash` | Derivable now; emitted only into new versions |

The following relations are **not permitted**:
- API → H-10.
- Wellbore/API → BHP or SRT. Test reports link only through UIC.
- Casing or plugging → UIC directly, bypassing the inventory row.
- `permit -> document`: no permit documents are acquired, and the ODP test datasets carry no document pointers.
- Any spatial or "nearby" relation. E03 requires RRC-07 authorization (D5), and proximity is never evidence of hydraulic communication.
- Bottom location `uumf-5r4y` → anything, until RRC-07 is authorized and its `api` format is proven.
- Any relation built from operator, lease or well-name similarity.

A conflicting key produces an `ambiguous` or `needs_review` entry that lists all candidates. It is never resolved to a single parent.

The relation catalogue is a derived file inside the versioned artifact, added to `manifest.files` as an additive sidecar. It is not a database table (D21). The six v1 contract files and `schemaVersion: 1` are unchanged (D10). A version that carries sidecars is not proposed for an Analytics repin until there is evidence that the receiver tolerates extra `manifest.files` entries (D10, Phase 6). Default and Analytics pins stay on existing versions. Its file name is chosen when it is first implemented, in Phase 3b. "Formation markers" and a `well_depth_evidence` file are not part of this contract (D22).

### 4. Selection identity (E03 and dossier)

A selected well is identified by `(artifactId, source_record_key)` of the inventory row. When a wellbore view is shown, it is identified by `(artifactId, source_api_id)`. The map, tables, dossier and source inspector must use these keys. Name matching is never used. An `ambiguous` wellbore cannot be selected as one entity; its candidate inventory rows are selected individually. Selection is UI state: it never enters `manifest.files`, an evidence package or any hash (D10 as changed).

## Consequences

- The Phase 2 connectors (BHP/SRT) use only the UIC domain. They do not need the wellbore domain.
- Phase 3 casing/plugging cannot start until the API format proof is recorded. It must also include a negative test proving that no code path joins H-10 by API.
- The dossier (Phase 3b) is a read-only browser view grouping one version's records by these relations. Graph rendering is optional and comes after a table of edges.
- Old versions, default pins and the Analytics pin are untouched. A version that predates a relation simply lacks it.

## Not decided here

The following stay outside this ADR:
- GIS and coordinate identity (RRC-07, ADR 005).
- Statewide or scheduled refresh (RRC-08).
- The relation file name and its JSON field spelling (Phase 3b).
- Hosted parity for new datasets (D7, local first).
- The Explorer's own licence (D19, open).
