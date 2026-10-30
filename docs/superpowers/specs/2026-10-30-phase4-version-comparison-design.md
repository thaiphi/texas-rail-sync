# Phase 4 design: read-only version comparison (RRC-16)

Date: 2026-10-30. Status: **frozen** (2026-10-30). Rulings by Main: OD-1 to OD-8 take the recommended options (section 12 keeps the alternatives for the record). OD-1 rests on the verified real-data finding in section 1 (H-10 report IDs reissued between v2 and v3 of 000020838 with identical values).
- **Authority:** requirement RRC-16 ([tracker](../../requirements.md) row RRC-16: "A read-only, network-free diff of two immutable versions of one UIC, keyed by source identity. It must leave `artifacts/` byte-identical."). [PRD](../../expansion-prd-2026-10-17.md) §RRC-E08: compare two immutable versions of the same well and source schema (new, changed and missing rows, coverage changes, QC changes, source snapshots). It is accepted when no version is mutated, filters never modify downloads, and keys are native source identity plus date or test identity, not row position. [Review](../../expansion-prd-review-2026-10-17.md) §7 Phase 4 row (`:270`) and completion line (`:283`). Also D7 (local only) and D10 (immutable versions; additive files only).
- **Evidence:** the 12 committed versions under `artifacts/` (inventory in section 1). An offline, read-only diff of every same-UIC pair was run on 2026-10-30 (section 1.2). Nothing under `artifacts/` changed.
- **Model:** the merged [Phase 3b design](2026-10-29-phase3b-relation-catalogue-design.md). Every Phase 2/3/3b rule that this spec does not change still applies.
- **Out of scope:** any change to `src/`, any acquisition or export, any new query version, transformation or file inside a version. Also out: any server route, hosted/guest parity (D7), comparing different UICs or areas (E07), interpretation of differences, and a download of the comparison (OD-6).
- **Design** by an Opus planner, read-only. Line numbers refer to commit `8728721`. Baseline `node --test test/*.test.mjs`: **465 pass / 0 fail** (2026-10-30, before any Phase 4 change).

The SPEC cut still applies (`SPEC.md` "Deliberate cuts"). The comparison describes differences. It never states compliance, a correction, an improvement or a cause.

## 1. What actually differs between committed versions

### 1.1 Committed versions (manifest `scope`)

| UIC | Version (artifact ID prefix) | `query_version` | Window | Datasets present |
|---|---|---|---|---|
| 000020838 | `rrc-2026-10-09-uic000020838-v1` (pinned) | none (v1 shape) | start 2024-01-01, **no end** | inventory (5 candidate rows), H-10 |
| 000020838 | `…-10-10-…-7aecd619` | 2 | 2024-01 … 2026-04 | inventory (1), H-10 |
| 000020838 | `…-10-29-…-a8606089` | 3 | 2024-01 … 2026-09 | + BHP, SRT |
| 000020838 | `…-10-29-…-903b89ff` | 4 | 2024-01 … 2026-09 | + casing, plugging |
| 000109605 | `…-10-29-…-70983258` / `…-10-30-…-b7628a71` | 4 / 5 | 2024-01 … 2026-09 | v5 adds `evidence_relations.json` |
| 000111186 | `…-fbee3ba0` / `…-b477a317` | 3 / 4 | 2024-01 … 2026-09 | |
| 000119875 | `…-b911ce3c` / `…-edce4598` | 3 / 4 | 2024-01 … 2026-09 | |
| 000056484, 000125182 | one version each | 2, 4 | | no pair |

That gives nine same-UIC pairs: six for 000020838, and one each for 000109605, 000111186 and 000119875.

### 1.2 Findings from the offline diff (scratch script, keys as in section 3)

1. **`source_row_key` and `source_record_key` are not version-stable.** They are `rrc:<dataset>:<dataset-id>:<sha256(raw response)[0:16]>:<1-based ordinal>` (`src/normalize.mjs:20,47`, `src/testReports.mjs:39`, `src/wellbore.mjs:58`, snapshot IDs `src/artifact.mjs:71,107,121`). They are equal only when the raw response bytes are identical. Observed: 000020838 v3→v4, 000109605 v4→v5, 000111186 and 000119875 v3→v4 have all keys equal (same bytes). 000020838 v2→v3 has **0 of 28** H-10 keys equal. They also encode row position, which E08 forbids as a key. They are **never a comparison key**. They are shown only as each side's row reference.
2. **ODP reissued every H-10 `id` without changing a value.** In 000020838 v2 (retrieved 2026-10-10) vs v3 (2026-10-29), all 28 rows have the same period and identical reported values. Every `source_report_id` changed (`3775425…` → `3777861…`, same order). With the review's key (`source_report_id` + period), this pair reads "28 removed, 28 added" while nothing reported changed. This is the decisive input to OD-1.
3. **v1→v2 (000020838):** the H-10 bytes are identical (same SHA-256, different URL), so all 28 rows are equal, including report IDs. The v1 inventory holds 5 rows from a different query (`api_no like '389%' … $limit=5`, the v1 manifest `sources[0].url`). Four of them (`000022085`, `000039655`, `000039709`, `000048561`) are other UICs that v2's exact-UIC inventory query cannot return.
4. **Rows and QC are otherwise identical in every pair.** 000109605 v4→v5: inventory 1, H-10 16, BHP 0, SRT 0, casing 9, plugging 7, all equal, with identical quality counts. 000111186: BHP 8 equal (5 `missing:report_received_date` both sides). 000119875: BHP 1, SRT 98 equal, **22 SRT rows quarantined on both sides** (`inconsistent:top_perf_exceeds_bottom`), QC delta zero. No real pair has a duplicate key, a value change in a test or wellbore row, or a row outside the other window.
5. **Snapshot deltas are dominated by non-data files.** In every pair, every `*-metadata.json` SHA-256 differs (the metadata embeds a moving `rowsUpdatedAt`) and every `retrieved_at` differs. `etag`/`last_modified` can differ while bytes are identical (000020838 v2→v4 `candidate-inventory`). Documentation files sometimes change (`rrc-resources.html` v2→v3). The 000109605 v4→v5 data responses (`candidate-*`, `wellbore-inventory`, `lookup-inventory`) are byte-identical. Sources present in only one version are those of a later query version (8 wellbore sources in v3→v4).
6. **No real pair exercises** a changed BHP/SRT/casing/plugging value, an ODP re-identification of those datasets, a duplicate key, a quarantine change or two relation catalogues. These cases are covered by constructed fixtures only (section 9), and the proof says so (section 10).

## 2. Where the comparison runs [OD-2]

**A pure shared module, `public/version-compare.js` (new).** It exports `compareVersions(a, b)` and the constants below. It has no imports except, optionally, `rowDisposition` from `./quality-validation.js`, which the producer already shares (`src/normalize.mjs:3`). It does no I/O, uses no `fetch`, timers, storage or DOM, and never mutates its inputs (it reads deep-frozen copies). It lives in `public/` because the browser cannot import `src/`, and `public/quality-validation.js` is the precedent for a module imported by both browser and Node.
- **Browser:** `public/app.js` gets each side as already-verified objects. The core comes from `loadVerifiedVersion` (`public/artifact-integrity.js:2-12`) or `loadPinnedArtifact` (`:13-23`), cached in `libraryArtifacts` (`public/app.js:21,226,262`). The sidecars come from `loadVerifiedSidecar` (`public/artifact-integrity.js:26-38`): `tests.json`, `casing.json`, `plugging.json` and `evidence_relations.json`, each only when listed in that side's verified `manifest.files`. Each sidecar is checked for `artifactId` (and `dataset` for casing/plugging), exactly as `showWellbore` and `showDossier` do (`public/app.js:165,187-188`).
- **Node tests:** the same `compareVersions`, fed by the same `loadVerifiedVersion`/`loadVerifiedSidecar`. Their `fetchImpl` reads committed bytes from disk, and the pins come from each version's `version-pins.json`. v1 has no `version-pins.json` and no `provenance` block, so `loadVerifiedVersion` accepts it only with `defaultPinned` (`public/artifact-integrity.js:10`). Its pins are therefore built exactly as `scripts/serve.mjs:40` builds them: `{...public/artifact-integrity.json, path:'/artifacts/<id>/', classification:'public_reported', defaultPinned:true}`. The fail-closed path under test is therefore the browser's own path.
- **Network-free (definition):** `compareVersions` performs no I/O. The compare page issues only same-origin `GET /artifacts/<id>/<file>` requests for files listed in a verified manifest, which are requests it would also issue to view each version alone. It sends no request to another host, no `POST`, and no `/api/` call except the existing `GET /api/versions` registry. No server change: `scripts/serve.mjs` is untouched, and the comparison is never computed on the server.
- **Nothing written:** no file, no `runs/` record, no `localStorage`/`indexedDB`, no `saveVerifiedPackage`. Selection lives in `location.hash` and module state only (the Phase 3b dossier rule).

## 3. Comparison keys and compared fields [OD-1, OD-3]

All values are compared **verbatim** with `Object.is`-style equality on the published JSON value. `null`≠`0`, `""`≠`null`, `"1"`≠`1`, arrays are compared element by element, and nothing is trimmed, rounded, converted or case-folded. Row position never decides a pairing.

| Dataset (source of rows) | Comparison key (native identity) | Identity fields (compared, reported separately) | Never compared (version-local) |
|---|---|---|---|
| `inventory` (`normalized.json` `inventory`) | `uic_number` | none | `source_record_key`, `source_snapshot_id` |
| `h10` (`normalized.json` `injectionMonthly`) | `uic_number` + `period_start` (**OD-1**) | `source_report_id` | `source_row_key`, `parent_key`, `source_snapshot_id` |
| `bhp` (`tests.json` `bhp`) | `source_report_id` + `tracking_no` + `test_sequence_no` (the producer's identity, `src/testReports.mjs:30`) | none | as H-10 |
| `srt` (`tests.json` `srt`) | `source_report_id` + `tracking_no` (`src/testReports.mjs:30`) | none | as H-10 |
| `casing`, `plugging` (`casing.json`/`plugging.json` `rows`) | `source_id` (the only observed unique row key, `src/wellbore.mjs:48-52`) | none | `source_row_key`, `source_snapshot_id` |
| `relations` (`evidence_relations.json`) | `relation` + `status` (counts only, **OD-3**) | none | every edge (keys embed `source_row_key`) |

- **Compared fields** are every other contract column of the dataset (`inventoryColumns`/`monthlyColumns`, `src/normalize.mjs:5-6`; `testColumns`, `src/testReports.mjs:7-10`; `wellboreColumns`, `src/wellbore.mjs:11-14`), taken from the published rows. This includes calculated columns (`county`, `calendar_days`, `calculated_calendar_day_avg_bpd`, `parent_join_status`, `wellbore_link_status`). The header always shows both `transformation_version` values, with the sentence "Calculated columns follow each version's own transformation version." `quality_flags` is not a value field. It is compared as an ordered array and reported as a QC difference (section 5). A flag or disposition difference never changes a row's outcome. It is carried on the row (`flags`, `disposition`) and counted in `quality.paired_rows_with_qc_change`.
- **Row outcome (one per key; values only):** `same` (all compared fields equal); `identity_differs` (only identity fields differ, e.g. the v2→v3 reissue); `values_differ` (at least one non-identity field differs; identity differences are listed too); `only_in_a` / `only_in_b`; `outside_other_scope` (section 4); `multiple_rows` (below).
- **Multiplicity (duplicates):** a key that occurs more than once on either side is **not paired by position**. Within such a group, a row pairs only when its full tuple, key plus identity fields (H-10: `period_start` + `source_report_id`), is unique on both sides. All other rows of the group are listed under `multiple_rows` with their per-side counts and row references, never as added or missing. This mirrors the producer's no-preferred-revision policy (`src/normalize.mjs:36,38`; `src/testReports.mjs:38,65`; `src/wellbore.mjs:52`).
- **Missing key parts:** an H-10 row with an empty `period_start` (parse failure, `src/normalize.mjs:40`) is keyed by `uic_number` + `source_report_id` and is never window-classified. A BHP/SRT row with an empty `source_report_id`, or a casing/plugging row with an empty `source_id`, is never paired. It is listed as `multiple_rows` with the reason "key incomplete".
- **Quarantined rows** are compared like any other row. Quarantine is a QC attribute, not an exclusion. Each side's disposition (`rowDisposition`, `public/quality-validation.js:6`) is shown per row.

## 4. Scope, windows and comparability [OD-7]

- **Same UIC, two versions, both verified (fail closed).** `compareVersions` throws `COMPARE_REFUSED` with a short reason when: the two `manifest.scope.uic_number` strings differ; the two artifact IDs are equal; either side lacks `artifactId`, `manifest`, `inventory`, `injectionMonthly` or `qualityReport`; or a sidecar's `artifactId`/`dataset` does not match. The UI shows the reason and **no rows**. A comparison never falls back to one side.
- **Dataset comparability.** A dataset is compared only when both sides collected it: `tests.json` present for BHP/SRT, `casing.json` present with `scope.status` ≠ `not_queried` for wellbore, `evidence_relations.json` for relations. Otherwise the dataset is `not_comparable`, with the reason `not_collected_in_a`, `not_collected_in_b`, `not_collected_in_either`, `not_queried_in_a`, `not_queried_in_b` or `not_queried_in_either`. **It is never reported as removed or added.** Casing/plugging are also `not_comparable` (`different_source_api_id`) when the two `link.source_api_id` strings differ.
- **H-10 window.** Each side's window is `[manifest.scope.start, manifest.scope.end]` by month. **v1 has no `end` (OD-7):** its window is open-ended and is shown as "from 2024-01, no end stated". A row whose `period_start` lies outside the other side's window is `outside_other_scope` ("outside the other version's reporting window"), not missing. Rows inside the overlap follow section 3.
- **Inventory query scope.** Bounded versions query the inventory by exact UIC (`src/artifact.mjs:94`). An inventory row whose `uic_number` differs from the compared UIC is therefore `outside_other_scope` ("outside the other version's inventory query") when the other side is bounded. Example: v1's four extra candidates.
- **BHP/SRT/casing/plugging** have no reporting window ("not limited to reporting period", `src/artifact.mjs:198,210`). All their rows are in scope when the dataset is comparable.

## 5. Coverage, QC and source-snapshot deltas

Each item is shown as A value, B value and an equal/differs marker. The page never computes a judgement.

- **Coverage per dataset:** row count; for H-10, distinct reporting months, first/last `period_start` and the window; for BHP/SRT, `scope.bhp_status`/`srt_status` (`returned_below_cap`/`confirmed_empty`, `src/artifact.mjs:194,198`); for casing/plugging, `scope.status`, and `link.status`, `link.reason`, `link.wellbore_row_count` and the candidate count; plus `query_version` and `transformation_version` per side.
- **QC per dataset:** `raw`, `parsed`, `accepted`, `quarantined`, `excluded` (inventory/H-10 from `qualityReport`, BHP/SRT from `tests.quality`, casing/plugging from `quality.counts`); H-10/BHP/SRT `parent_join`; `issue_counts` as one row per flag present on either side, with the A and B counts. The producer omits flags with zero occurrences (`src/normalize.mjs:51`), so an absent flag is shown as 0, and the table note says so. For paired rows, a changed disposition or changed `quality_flags` array.
- **Source snapshots (`manifest.sources`, already covered by the verified manifest hash):** one row per source `name` across both sides, with `kind` and a class: `data` (`inventory`, `monthly`, `bhp`, `srt`, `wellbore_inventory`, `casing`, `plugging`), `selection`, `metadata` and `documentation` (`kind` values from `src/artifact.mjs:88,98,108,124`). **Primary:** `sha256` equal or different, and `bytes`. **Secondary (always listed, never an outcome):** `url` (equal or different; a different query is a scope fact), `retrieved_at`, `etag`, `last_modified`, `http_status`. A source in one version only reads "not collected in <other id>". `manifest.source_revisions` (`rowsUpdatedAt`) is shown per side.
- **Snapshot fast path (display only):** when a data source has equal `sha256`, the page says "Same response bytes; row references are identical." Pairing still uses section 3.

## 6. Result shape (`compareVersions` output; Task 2 fixtures use only this)

```
{schemaVersion:1, comparison_version:'rrc-compare-v1', uic_number,
 sides:{a:{artifact_id, query_version|null, transformation_version, window:{start, end|null}, collected_at}, b:{…}},
 datasets:[{dataset, comparable, reason|null, key:[…field names], identity_fields:[…],
   coverage:{a:{…}, b:{…}}, quality:{a:{raw,parsed,accepted,quarantined,excluded}, b:{…}, parent_join:{a,b}|null,
     issue_counts:[{flag, a, b}], paired_rows_with_qc_change},
   counts:{same, identity_differs, values_differ, only_in_a, only_in_b, outside_other_scope, multiple_rows},
   rows:[{outcome, key:{…}, a:[row_ref…], b:[row_ref…], fields:[{field, identity, a, b}], flags:{a, b}|null,
     disposition:{a, b}|null, reason|null}]}],
 sources:[{name, kind, class, a:{sha256,bytes,url,retrieved_at,etag,last_modified,http_status}|null, b:…|null, bytes_equal:true|false|null}],
 source_revisions:{a, b}}
```

- `collected_at` is the `retrieved_at` of that side's `candidate-monthly` source (present in every version). `row_ref` is the side's `source_row_key`/`source_record_key`/`source_id`. `fields` lists only fields that differ (empty for `same`).
- Dataset order: inventory, h10, bhp, srt, casing, plugging, relations. Rows are sorted by key tuple in code-unit order (`<`), never by source position. Sources are sorted by `name`.
- **Determinism and symmetry:** two calls give identical `JSON.stringify`. `compareVersions(b,a)` equals `compareVersions(a,b)` with `a`/`b` swapped everywhere (`only_in_a`↔`only_in_b`, side objects, field values).
- For `relations` (OD-3), `rows` holds one row per `(relation, status)` pair, with the `counts[type].by_status` value per side as the compared field.

## 7. Browser UI (read-only) [OD-4, OD-5]

### 7.1 Route and entry
- A new top-level screen, not a workspace tab, because it spans two versions: `#compare/<encodeURIComponent(idA)>/<encodeURIComponent(idB)>`. `parseRoute` (`public/navigation.js:5-18`) returns `{screen:'compare', a, b}` only when both IDs pass `validId` (`:2`) and differ. Anything else falls back to `{screen:'datasets'}`. A new `compareRoute(a,b)` throws on invalid or equal IDs.
- **Sides (OD-5):** the page shows the version with the earlier `collected_at` as A ("collected earlier", with its date) and the other as B ("collected later"). Ties are broken by artifact ID. If the route order differs, `app.js` replaces the hash with the canonical order (`history.replaceState`, no new history entry). The labels never say "old/new version", "previous/current" or "latest".
- **Entry:** the workspace version picker (`public/index.html:11`, `<details class="version-picker">`) gains a `<label for="compare-selection">Compare with another version of UIC <uic></label>`, a `<select id="compare-selection">` and an `<a id="compare-open">` link. The select lists only other versions in `availableVersions` whose verified `libraryArtifacts` entry has the same `manifest.scope.uic_number`. With none, a note reads "No other preserved version of UIC <uic>." (000056484, 000125182).
- **Eligible versions (OD-4):** only server-listed versions verified by `loadVerifiedVersion`/`loadPinnedArtifact` (public, non-fixture, `public/artifact-integrity.js:3,10`). Browser-saved and guest packages are not offered and are refused by route ("Only preserved versions listed by this server can be compared.").

### 7.2 Loading and states (fail closed)
- `showCompare(route)` in `public/app.js` has its own `createLatestRequest` (the `showDossier` pattern, `public/app.js:170-191`). It is invalidated on every route change.
- States: `loading` (`role="status"`), `refused` (section 4 reasons, `role="alert"`, no rows), `error` (verification failure: "Comparison unavailable: <reason>. No differences are shown."), `loaded`.
- `route()` (`public/app.js:51-60`) adds `'compare'` to the screen list at `:55`, plus a `<section id="compare-view" class="view" aria-labelledby="compare-title" hidden>` with `<div id="compare-content">` after `help-view` (`public/index.html:10`).

### 7.3 Content (`public/compare-view.js`, new, pure `renderCompareView(state)`)
1. **Header:** UIC; per side the artifact ID (link to `#dataset/<id>/overview`), `collected_at`, `query_version` (v1: "v1 shape, no query version"), `transformation_version`, window; and the fixed sentence "This page describes differences between two preserved versions. It does not say which is correct."
2. **Summary table:** one row per dataset with the seven outcome counts, or "Not comparable: <reason>".
3. **Per-dataset sections:** coverage table, QC table (including issue counts) and the row table. The row table has columns outcome, key, A reference, B reference, differing fields (`field: A → B`, with identity fields marked "identity"), and A/B disposition. `same` rows are collapsed inside `<details>` with their count.
4. **Sources table:** the section 5 columns, with the full SHA-256 in text.
5. **Filters:** `<label>`+`<select>` for dataset and outcome. Filters change only which rendered rows are visible. They never change the result object, either version, or any download link. The compare page shows **no** download link (OD-6). Each version's own Downloads tab stays reachable from its header link, unchanged.

**Fixed wording.** Outcome labels: "Same values", "Same values, different report identity", "Values differ", "Only in A", "Only in B", "Outside the other version's scope", "Several rows share this key (not row-matched)", "Not comparable". Source rows read "Same bytes" or "Different bytes". Banned in the page's own text, meaning every label, heading, note and state message (test; verbatim source values such as SRT `comments` are excluded by rendering fixtures with neutral values): `improved`, `corrected`, `correction`, `fixed`, `updated`, `better`, `worse`, `regression`, `revised`, `error in`, `wrong`, `deleted`, `removed`, `added`, `compliant`, `violation`, `safe`, `latest`, `newer`, `older`, the Phase 3b test-6 list, and "most recent" outside the verbatim `most_recent_record` field name.

### 7.4 Accessibility
The Phase 3b pattern (`public/wellbore-view.js:49`) applies: native tables with `<caption>` and `<th scope>`, `.scroll-table` regions with `tabindex="0"`, `role="region"` and `aria-label`, `<label>`ed selects, `<a href>` navigation, and no pointer-only control. Every outcome is text, never colour alone. Focus moves to the `compare-title` heading after load.

## 8. Regression and protected-clean criterion

- **Protected-clean (test):** `test/version-compare.test.mjs` hashes every file under `artifacts/` (relative path, then SHA-256, sorted) before and after running all nine pairs in both orders, and asserts the two lists are equal, so no file is added, removed or changed under `artifacts/`. It makes no assertion about `runs/`: test files run in parallel processes, and other suites write there. `runs/` is left to Main's check after the suite.
- **Protected-clean (Main, after the full suite):** `git status --porcelain -- artifacts` is empty and `git diff --exit-code -- artifacts` exits 0. **Disclosed pre-existing behaviour:** the existing suite writes three `runs/<uuid>/` folders into the repository on every run (observed at baseline). That is not Phase 4's behaviour. Main deletes them before staging, and the Phase 4 tests add none.
- **Replay unchanged:** `test/test-reports-pipeline.test.mjs:148-165` (all committed versions replay byte-identically) and `test/browser-library.test.mjs:25` pass unedited. No `src/` file, no `manifest`, no `version-pins.json` and no `public/artifact-integrity.json` changes. `scripts/prepare-supabase-archive.mjs`, `src/exportCore.mjs` and the guest path are verified unchanged.

## 9. Tests (must exist)

`test/version-compare.test.mjs` (Task 1, pure module, committed bytes through the real verified loaders):
1. **Committed pairs, exact outcomes** (from section 1.2):
   - 000020838 v1→v2: inventory 1 `same` + 4 `outside_other_scope` (the four UICs named in 1.2); H-10 28 `same`; BHP, SRT, casing, plugging and relations `not_comparable` (`not_collected_in_either`); `candidate-monthly` equal bytes with a different `url`.
   - v2→v3: H-10 28 `identity_differs`, each with exactly one differing field `source_report_id`, and 0 `values_differ`.
   - v3→v4: H-10 28 `same`; BHP 0/0 and SRT 0/0 comparable (both `confirmed_empty`); casing/plugging `not_collected_in_a`; 8 sources "not collected" in A.
   - v1→v4: H-10 28 `identity_differs`, and the window shows "no end stated" for v1.
   - 000109605 v4→v5: inventory 1, H-10 16, casing 9, plugging 7 all `same`; relations `not_collected_in_a`; every data source equal bytes; the six `*-metadata` sources different bytes.
   - 000111186: BHP 8 `same`, issue count `missing:report_received_date` 5/5.
   - 000119875: SRT 98 `same`, quarantined 22/22, 22 rows with disposition `quarantined` on both sides, QC deltas zero.
2. **Reconciliation, every pair and comparable dataset:** the number of A row references across all outcomes equals the A row count, and the same holds for B. Each row is referenced exactly once, so no row is dropped or double-counted.
3. **Refusals:** different UIC (000020838 vs 000109605), same ID, tampered `normalized.json` or `tests.json` (the loader rejects, so no comparison runs), and a sidecar with the wrong `artifactId`.
4. **Determinism and symmetry** (section 6) on all nine pairs.
5. **Constructed fixtures** (derived from committed rows by `structuredClone` in memory, no file written): a changed SRT value (`isip_psig` 1500 → 1520 gives `values_differ` with one field); `null` vs `0` (differs); `"1"` vs `1` (differs); a duplicate BHP identity (2 rows in A, 1 in B gives `multiple_rows`, not paired); a duplicate H-10 period with distinct report IDs pairing by full tuple; an H-10 row outside B's window; a casing `source_id` reissue (`only_in_a` + `only_in_b`, disclosed as the native-key limit); a changed quarantine (flags differ, `same` values reported as a QC difference); different `source_api_id` (`not_comparable`); two relation catalogues with different `counts` (relation count rows).
6. **Purity:** inputs deep-equal before and after; a static scan of `public/version-compare.js` finds no `fetch(`, `import(`, `node:`, `localStorage`, `indexedDB`, `XMLHttpRequest`, `writeFile`, `saveVerifiedPackage`, `source_row_key` used as a key (the key tables are exported constants and are asserted not to contain `source_row_key`, `source_record_key` or `parent_key`).
7. **Protected-clean** (section 8).

`test/compare-view.test.mjs` (Task 2, fixtures built only from the section 6 shape):
1. States: loading, refused (each reason), error, loaded, `not_comparable` dataset, no-other-version note.
2. Tables: captions, `th scope`, region `tabindex="0"` and `aria-label`, full SHA-256 in text, and outcome text in every row.
3. Filters: changing dataset or outcome changes visible rows only. The state object is deep-equal before and after, and the output contains no `download` attribute and no `?download=1` or `/download` href.
4. Wording: the banned list (section 7.3) is absent from the rendered HTML of every state.
5. Route: `parseRoute`/`compareRoute` round-trip with encoded IDs; equal or invalid IDs are rejected; the reversed order canonicalizes to the earlier `collected_at` (app harness).
6. Static scan of `public/compare-view.js`: no `fetch(`, storage, `method:`.

Harness edits (Task 2): inject `renderCompareView` and `compareVersions` (a stub returning a section 6 fixture) into the `public/app.js` harnesses at `test/navigation-redesign.test.mjs:55`, `test/version-race.test.mjs:19`, `test/tests-view.test.mjs:116`, `test/wellbore-view.test.mjs:164` and `test/dossier-view.test.mjs:211`. Also add the new element IDs, and a `history.replaceState` stub, because the harnesses stub only `location:{hash}`.

## 10. Proof (Main, after merge-ready code; no network, no acquisition)

- In a browser on the local server: open 000020838 v2 → "Compare with" v3 and record that the 28 rows show "Same values, different report identity"; open v1 vs v4, v3 vs v4, 000109605 v4 vs v5 and 000119875 v3 vs v4. Do a keyboard-only pass, check the screen-reader table names, and check the network panel shows only same-origin `GET /artifacts/…` and `/api/versions`.
- Then run `git status --porcelain -- artifacts` (empty), `git diff --exit-code -- artifacts`, the full suite (465 + new tests), and delete the suite's `runs/` folders.
- State in the proof that BHP/SRT/casing/plugging re-identification and value changes are fixture-tested only (section 1.2 item 6).

## 11. Tasks (at most two parallel implementers; disjoint allowlists)

| Task | Owner / model | Allowed files (create or edit only these) | Acceptance |
|---|---|---|---|
| **1: Comparison module** | Implementer, Opus high | `public/version-compare.js` (new), `test/version-compare.test.mjs` (new) | Sections 2–6 and 8 and the Task 1 tests of section 9; no file outside the allowlist changes; **no `src/` edit**; full suite green (baseline 465) plus new tests; `git status --porcelain -- artifacts` empty |
| **2: Compare screen** | Implementer, Opus | `public/compare-view.js` (new), `public/app.js`, `public/navigation.js`, `public/index.html`, `public/style.css`, `test/compare-view.test.mjs` (new), harness lines only in `test/navigation-redesign.test.mjs`, `test/version-race.test.mjs`, `test/tests-view.test.mjs`, `test/wellbore-view.test.mjs`, `test/dossier-view.test.mjs` | Section 7 and the Task 2 tests of section 9; fixtures from the section 6 shape only (no import of Task 1 code in tests); `app.js` imports `compareVersions` from `./version-compare.js` by the section 6 contract |
| **3: Independent review** | Reviewer, Opus, read-only | none | After Tasks 1–2: keys against E08 and section 1.2, no position pairing, multiplicity, comparability, fail-closed loading, symmetry, wording, protected-clean. Findings resolved or ruled before merge. |
| **4: Docs, integration, proof** | Main | `SPEC.md` (Phase 4 addendum), `docs/requirements.md` RRC-16, `docs/verification-2026-10-30-phase4-proof.md` (new) | Section 10; Git in the worktree only |

- Tasks 1 and 2 run in parallel in two slots. Task 3 starts after both release their slots. Workers never stage, commit, push, revert others' edits or spawn helpers.
- Integration risk: Task 2 codes against section 6. Main runs the full suite after both tasks and resolves any shape mismatch in favour of section 6.

## 12. Open decisions (Main/owner)

| ID | Decision | Recommended | Alternatives |
|---|---|---|---|
| OD-1 | H-10 key | **A:** `uic_number`+`period_start`; `source_report_id` is an identity field (outcome `identity_differs`); duplicates pair only by full tuple | **B:** review key `source_report_id`+period as written (000020838 v2→v3 reads 28 removed + 28 added with no value change). **C:** strict key, plus a second pass that aligns unpaired rows by unique period (same result as A, two concepts) |
| OD-2 | Where it runs | Pure `public/version-compare.js` shared by browser and tests; nothing written | **B:** browser-only code (tests need the DOM harness). **C:** Node CLI or export writing a diff file (a new artifact-like file; conflicts with "nothing written") |
| OD-3 | Relations | Compare `counts[type].by_status` only, when both versions have the catalogue | **B:** remap edge keys through native identity (complex; no real pair exists). **C:** exclude relations from Phase 4 |
| OD-4 | Saved/guest packages | Excluded; server-listed verified versions only | Include saved copies with a "not re-verified now" label |
| OD-5 | Side labels and order | A = earlier `collected_at` (`candidate-monthly.retrieved_at`), canonical route | Route order as given; or artifact-ID date (ties: three 000020838/000111186/000119875 IDs share 2026-10-29) |
| OD-6 | Download of the comparison | Out of scope in Phase 4 | Client-side Blob `trrc-comparison-<a>-<b>.json` with no `artifact_id`/manifest, labelled "Not a dataset version" |
| OD-7 | v1 window (no `end`) | Open-ended from `start`; shown as "no end stated" | Treat v1 end as its last returned month (invents a bound the query did not state) |
| OD-8 | Inventory rows outside the compared UIC (v1 candidates) | `outside_other_scope` | `only_in_a` (reads as missing, which the v2 query could never return) |

## 13. Contradictions and reinterpretations found

1. **Review key vs code and data.** The review §7 names `source_record_key` and `source_row_key` as comparison keys. Both embed a response-hash prefix and a 1-based ordinal (section 1.2 item 1), so they change whenever the bytes change, and they encode row position, which E08 excludes. They are kept only as row references.
2. **`source_report_id` + period** (review §7) fails on real data: ODP reissued all 28 H-10 ids for 000020838 between 2026-10-10 and 2026-10-29 (OD-1).
3. **"Three existing public versions" / "the two existing UIC 000020838 versions"** (review `:270`, `:283`): there are now 12 versions and 4 of 000020838. The review's completion test, a deterministic diff of two 000020838 versions, is covered by section 9 test 1, extended to all nine pairs.
4. **"Missing rows"** (PRD) is read as `only_in_<side>` within a comparable dataset and window. A dataset or window not covered by one version is never "missing".
5. **PRD "same source schema":** pairs across query versions (v1 to v4) are allowed, compared per dataset, with `not_comparable` for datasets one side lacks. Refusing such pairs would leave 000020838 with no fully equal-schema pair except v3/v4.
6. **Native keys for BHP/SRT/casing/plugging** are the producer's own duplicate identities (`src/testReports.mjs:30`, `src/wellbore.mjs:48-52`). No real pair shows whether ODP reissues them as it did H-10 `id`. If it does, rows read `only_in_a` + `only_in_b`, which is disclosed in the page note and the proof rather than hidden by a position or value heuristic.
