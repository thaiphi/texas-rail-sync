# Phase 3b design — typed relation catalogue, read-only dossier and single-well depth ladder (RRC-15)

Date: 2026-10-29. Status: **frozen** (2026-10-29). Rulings: OD-1 **B (query version 5)** by the owner; OD-2 to OD-10 the recommended options, by Main. Section 12 keeps the options for the record; Appendix B is not used.
- **Authority:** [ADR 004](../../adr/004-wellbore-identity-and-relations.md) §3 (typed relation catalogue) and §4 (selection identity), normative, plus its "Not decided here" (file name and JSON field spelling are decided in Phase 3b); [v1.1 review](../../expansion-prd-review-v1.1-2026-10-17.md) §5 items 1–2 (merge E10 into ADR 004; split E11), §7 Phase 3b row, §8 E10 and E11a criteria, §9 D15, D16, D20, D21, D22; D10 (additive sidecar in `manifest.files`, `schemaVersion: 1`, six v1 contract files byte-identical); D7 (local only); requirement RRC-15 ([tracker](../../requirements.md) row RRC-15).
- **Evidence:** committed v4 version `artifacts/rrc-2026-10-29-uic000109605-70983258-9751-4e79-bb78-1a1cb7068e14/` (UIC 000109605, API 38934609, TRIPPET SWD; casing `matched` 9 rows, plugging `matched` 7 rows, BHP/SRT empty, 16 H-10 rows); [source forms](../../source-forms-2026-10-29-phase3.md) §3–4 for CONFIRMED/INFERRED units.
- **Model:** the merged [Phase 3 design](2026-10-29-phase3-casing-plugging-design.md). Every Phase 2/3 rule not changed here applies unchanged.
- **Out of scope:** formation markers or formation tops (D22), multiwell correlation (E11b, D16), any graph rendering beyond an optional later presentation, any database or hosted table (D21), hosted/guest parity (D7), GIS and bottom location `uumf-5r4y`, statewide refresh, new query targets.
- **Reference hygiene (D18):** this spec and every brief derived from it describe behaviour in this repository's own words and link no external reference implementation.
- **Design** by an Opus planner, read-only. Line numbers refer to commit `7a5477e`. Baseline `node --test test/*.test.mjs`: **416 pass / 0 fail** (2026-10-29, before any Phase 3b change).

The SPEC cut this phase must respect (`SPEC.md` "Deliberate cuts"): no GIS, statewide extraction, permitting, LLM, private data, operational compliance conclusion, sustainable capacity or BHP calculation.

## 1. Versioning [OD-1]

**The constraint.** The committed-version replay test rebuilds every directory under `artifacts/` with `buildArtifact(snapshot, artifactId, normalize(...))` from its own `sources/` and compares every emitted file byte for byte (`test/test-reports-pipeline.test.mjs:148-162`). Four committed versions have `scope.query_version: 4` (`…uic000020838-903b89ff…`, `…uic000109605-70983258…`, `…uic000111186-b477a317…`, `…uic000119875-edce4598…`) and no relation file. ADR 004 §3 says relations are "emitted only into new versions" and its Consequences say "A version that predates a relation simply lacks it". Therefore **`buildArtifact` must never emit the catalogue when its only input is a committed v4 `sources/` directory.** Two designs satisfy that:

- **Option B — query version 5 (recommended).** A new `boundedRelationScope(uic,startMonth,endMonth,apiNo)` in `src/sources.mjs` (after `boundedWellboreScope`, `:71-74`) returns `Object.freeze({...boundedWellboreScope(uic,startMonth,endMonth,apiNo),queryVersion:5})`. **Its targets are exactly the 21 (or 18 when `sourceApiId` is null) v4 targets, in the same order.** Version 5 marks a change of the *export contract* with identical queries; it does not mean that any new dataset was queried, and the dictionary/limitation text says so (section 4). Export output stays a pure function of `sources/`, every existing local-only gate already covers it (`isLocalOnly` `src/sources.mjs:9`; transfer script `>=3`; browser `localOnlyVersion` `public/app.js:36`), and the replay test needs only its `===4` widening. Cost: a *public* relation-bearing version needs one new owner-authorized local collection (it re-fetches the same 21 URLs).
- **Option A — export-time option on v4 sources.** Keep `queryVersion: 4`; add `buildArtifact(…,{relationCatalogue:true})`, threaded through `exportCore` `buildOutputs` (`src/exportCore.mjs:61-69`), `exportArtifact` (`src/pipeline.mjs:41`), `collectPublicSnapshot` (`src/acquisition.mjs:48`), `scripts/serve.mjs:64-66` and a new `scripts/export.mjs` flag; a public relation-bearing version is then made **offline** by re-exporting an existing v4 `sources/` directory to a new artifact ID in the existing `offline_export` mode (`scripts/export.mjs:9`; `src/runEvents.mjs:3`; label "Offline export — preserved sources", `public/workflow.js:80`). Cost: two versions built from byte-identical sources differ, so export output is no longer determined by `sources/`; every replay (CLI, `verified_existing_bytes` comparison `src/pipeline.mjs:33`, and the test at `:148-162`) must first read the published `manifest.transformation_version` to know which transformation to apply.

The brief prefers derivation with no network; Option A achieves that, Option B keeps the repository's "output = f(sources)" invariant. This is a principle trade, not a code-forced one, and is Main/owner's ruling. The rest of this spec is written for **Option B**; Appendix B lists the deltas if Option A is chosen.

**Network access.** Implementation and every test need **none** under either option (fixtures plus committed bytes). A public relation-bearing version needs **none** under Option A and **one authorized local collection** under Option B (section 10).

**v5 details (Option B).**
- `isBounded` (`src/sources.mjs:7`) adds `queryVersion===5`.
- `versionLabels` (`:10-15`) gains `queryVersion===5 → {pipelineVersion:'rrc-collection-v5',transformationVersion:'rrc-odp-v2.3.0'}`. The acquisition marker keeps `schemaVersion:2`; the provenance basis stays `recorded_official_acquisition_v2` (`src/artifact.mjs:130`).
- `targetsForScope` (`:111-120`): the checked-scope dispatch at `:113` becomes `queryVersion===5?boundedRelationScope(…,scope.sourceApiId):queryVersion===4?boundedWellboreScope(…):…`, and `:119` `queryVersion===4` becomes `>=4`.
- `src/artifact.mjs:55` `wellbore=scope.queryVersion===4` **must** become `>=4`, or a v5 load silently drops casing/plugging (the same trap Phase 3 found for test reports). Add `relations=scope.queryVersion>=5`.
- Local `/api/collect` switches from `boundedWellboreScope` to `boundedRelationScope` (`scripts/serve.mjs:9`, `:64`); the request schema is unchanged; v4 is no longer produced by the server but stays loadable and collectable through `collectPublicSnapshot` (tests at `test/wellbore-pipeline.test.mjs:57,65`). The hosted guest path stays v2 (not edited).

## 2. The relation file: `evidence_relations.json` [OD-2]

The name is the one used in review §8 (E10 criterion). It is one additive JSON sidecar; there is no CSV and no separate dictionary (the file is self-describing). It is written with `JSON.stringify(doc,null,2)+'\n'`, like every other sidecar (`src/artifact.mjs:198,209`).

### 2.1 Top level (exact keys, in this order)

```
{schemaVersion:1, artifactId, catalogue_version:'rrc-relations-v1',
 scope:{query_version, inventory_source_record_key, source_api_id},
 relation_types:['inventory_to_h10','inventory_to_test_report','inventory_to_wellbore','wellbore_to_casing','wellbore_to_plugging','record_to_source_snapshot'],
 not_permitted:[…section 3, fixed strings…],
 status_policy:{…fixed sentences, section 2.4…},
 counts:{<relation>:{total, by_status:{<status>:n}}},   // relation_types order; statuses in first-seen order
 relations:[…]}
```

There are no timestamps, run IDs, retrieval dates, file paths outside `sources/`, UI state or route data.

### 2.2 Relation object (exact keys, in this order, always all present) [OD-3]

```
{relation, from_kind, from_key, to_kind, to_key, dataset, basis, status, reason, candidates, evidence}
```
- `from_kind` / `to_kind` ∈ `inventory_record`, `h10_row`, `bhp_row`, `srt_row`, `wellbore`, `casing_row`, `plugging_row`, `source_snapshot`. **Kind tags are required**: keys from different files can be textually equal. In the TRIPPET version `candidate-inventory.json` and `wellbore-inventory.json` are byte-identical, so both carry snapshot `givw-z9t4:9243e138d823f249` (manifest `sources`), and `casing.json` `link.candidates[0].candidate_key` equals the inventory `source_record_key`. A key is only ever resolved against the table its kind names.
- `dataset`: the dataset of the `to` record (`h10`, `bhp`, `srt`, `casing`, `plugging`); for `inventory_to_wellbore` the wellbore dataset whose link it mirrors; for `record_to_source_snapshot` the dataset of the `from` record (`inventory`, `h10`, …).
- `reason`: `null` except on `inventory_to_wellbore` (copied from `link.reason`).
- `candidates`: always an array; empty unless section 2.3 says otherwise.
- `evidence`: an array of `{file, sha256}`, where `file` is a `sources/` path and `sha256` is the full 64-hex hash of those bytes, taken from `manifest.sources[].raw_file`/`.sha256` (`src/artifact.mjs:83`); it must equal `manifest.files[file].sha256`. Evidence lists exactly the files whose bytes the key rule reads, in the order given in 2.3. A snapshot ID alone is never evidence (it is a 16-hex prefix and is not unique per file, see above).

### 2.3 Derivation, per relation (from records already built in `buildArtifact`; no re-join, no raw re-read)

The builder is a new pure module `src/relations.mjs`, `buildRelations({artifactId, scope, inventory, monthly, testRows, wellboreRows, sources})`. Inputs are the canonical values `buildArtifact` already holds after validation: `canonical.inventory`/`.monthly` (`src/artifact.mjs:154`), `testRows` (`:155`), `wellboreRows` (`:158`) and `snapshot.sources`. It performs no I/O.

| `relation` | One entry per | from → to | `basis` | `status` | `candidates` | `evidence` |
|---|---|---|---|---|---|---|
| `inventory_to_h10` | normalized monthly row, source order | `inventory_record` `parent_key` (null unless matched) → `h10_row` `source_row_key` | `exact_uic_string` | the row's `parent_join_status` **as is**: `matched`/`unmatched`/`ambiguous` (ADR §3; `src/normalize.mjs:32-34,47`) | `ambiguous`: every inventory `source_record_key` whose `uic_number` equals the row's, inventory order; otherwise `[]` | inventory file, monthly file |
| `inventory_to_test_report` | BHP row then SRT row, each in source order | same, → `bhp_row`/`srt_row` `source_row_key` | `exact_uic_string` | the row's `parent_join_status` as is (`src/testReports.mjs:34-39`) | as above | inventory file, `candidate-bhp.json`/`candidate-srt.json` |
| `inventory_to_wellbore` | wellbore dataset, `casing` then `plugging` [OD-4] | `inventory_record` `link.inventory_source_record_key` → `wellbore` `link.source_api_id` (null when `api_missing_or_invalid`) | `inventory_api_no` | `link.status` verbatim (`matched`/`none`/`ambiguous`; `src/wellbore.mjs:86-90`) | `link.candidates` copied verbatim (all candidates, the selected one marked) | inventory file, then `wellbore-inventory.json` and that dataset's `candidate-*.json` when queried |
| `wellbore_to_casing` / `wellbore_to_plugging` | casing/plugging row, source order | `wellbore` `source_api_id` → `casing_row`/`plugging_row` `source_row_key` | `exact_api_string` | `matched` [OD-5] | `[]` | inventory file (source of `source_api_id`), `candidate-casing.json`/`candidate-plugging.json` |
| `record_to_source_snapshot` | every record above: inventory, then H-10, BHP, SRT, casing, plugging rows | that record's key → `source_snapshot` `source_snapshot_id` | `source_file_hash` | `null` | `[]` | the one file the record was parsed from |

- `candidates[].selected` is the collection's selected inventory row (`sameIdentity` with the row named by `selection.json`, `src/wellbore.mjs:94`), already published in `casing.json`; it is source evidence, not UI selection (D10).
- Quarantined rows keep their edge; a relation never filters or merges rows. Their disposition stays in the existing quality evidence; it is never copied into a relation status (Phase 3 OD-3 reasoning: ambiguity belongs to the relation, quarantine to the row).
- `wellbore_to_*` edges exist for every published row whatever `link.status` is: "The wellbore rows are kept and shown under the wellbore, but they are attributed to no single UIC" (ADR §2 rule 5). Attribution to a UIC is carried **only** by `inventory_to_wellbore`.
- The ADR's "A conflicting key produces an `ambiguous` or `needs_review` entry that lists all candidates" is met by `ambiguous` + `candidates`. **`needs_review` is reserved**: no Phase 3b rule emits it (ADR §2 forbids it for wellbore links; no other conflict exists that `ambiguous` does not already express) [OD-6]. A test proves it is never emitted.

### 2.4 Status vocabulary and policies

`status_policy` holds fixed sentences, one per relation, for example: `inventory_to_h10` "parent_join_status reused as is (matched / unmatched / ambiguous)"; `inventory_to_wellbore` "ADR 004 §2 link status of one wellbore dataset (matched / none / ambiguous); matched asserts string equality only and cannot distinguish sidetracks or recompletions"; `needs_review` "reserved; not emitted by catalogue rrc-relations-v1". No sentence draws a casing, cementing, plugging, compliance or hydraulic conclusion.

### 2.5 Determinism and size

- Order is fully determined by array order: `relation_types` order, then the source order of the driving record. Nothing is sorted by locale, hash or time; no `Map`/`Set` iteration over keys derived from values.
- Bound: at most 1 inventory row and < 1000 rows in each of H-10, BHP, SRT, casing and plugging (caps at `src/artifact.mjs:68-69,104-105,118-119`), so ≤ 2 + 2 × 4,996 relations (about 5 MB worst case); TRIPPET gives 67 relations.

## 3. Relations that are not permitted (ADR §3) and how each is enforced

The `not_permitted` array lists these strings verbatim; each has a negative test (section 9, `test/relations.test.mjs` unless noted).

| Not permitted | Enforcement |
|---|---|
| API → H-10 | No relation has `from_kind:'wellbore'` with `to_kind:'h10_row'`. Builder fixture: a monthly row whose (raw) `api_no` equals the inventory API but whose `uic_no` is foreign yields `inventory_to_h10` `unmatched` with `from_key:null`, never a wellbore edge. Static: `src/relations.mjs` never contains `api_no`. The existing static scan (`test/wellbore-pipeline.test.mjs:247-254`) and target test (`:182`) are extended to v5. |
| Wellbore/API → BHP or SRT | No relation has `from_kind:'wellbore'` with `to_kind` `bhp_row`/`srt_row`; test rows relate only through `parent_key`. |
| Casing or plugging → UIC directly | No relation has `from_kind:'inventory_record'` with `to_kind` `casing_row`/`plugging_row`; every `casing_row`/`plugging_row` `to` edge has `from_kind:'wellbore'`; casing/plugging rows still carry no `uic_number`/`parent_key` (Phase 3). |
| `permit -> document` | Closed set: `relation` ∈ the six `relation_types` only; no kind or relation name matches `/document|permit/`. |
| Spatial / "nearby" | Same closed set; static: `src/relations.mjs` contains none of `latitude`, `longitude`, `distance`, `nearby`. |
| Bottom location `uumf-5r4y` → anything | No evidence file or key contains `uumf-5r4y`; v5 targets equal v4 targets (no new URL). |
| Operator, lease or well-name similarity | Static: `src/relations.mjs` contains none of `operator_number`, `lease_name`, `lease_number`, `well_no_display`, `w14_number` (candidates are copied as whole objects from `link.candidates`, never read field by field); browser: section 7.5. |

Allowed `(relation, from_kind, to_kind)` triples are a closed table in the test; any other triple fails.

## 4. Export integration (`buildArtifact`, `src/artifact.mjs:144-221`)

- After the v4 wellbore block (`:203-211`), when `snapshot.scope.queryVersion>=5`: `manifest.transformation_version='rrc-odp-v2.3.0'`; `manifest.scope.query_version=scope.queryVersion`; build `evidence_relations.json` and append it to `files` and `manifest.files` **after** the five wellbore sidecars.
- `:205` hard-codes `manifest.scope.query_version=4`, and `:208` hard-codes `scope:{query_version:4,…}` inside `casing.json`/`plugging.json`. Both use `scope.queryVersion` [OD-7, same rule as Phase 3 OD-2]. For v4 output this is byte-identical (the value is 4).
- One appended `limitations` entry (v5 only): "evidence_relations.json lists typed relations derived at export from this version's own records and source files (ADR 004 §3); query version 5 queries exactly the version 4 targets. Relations assert exact string equality of source keys only; matched does not establish one physical wellbore, and no relation states casing, cementing, plugging, compliance or hydraulic communication."
- The catalogue is built from `canonical`/`testRows`/`wellboreRows` **after** the existing projection checks (`:150-160`), so caller-supplied rows can never reach it.
- **Run evidence is unchanged.** No new `normalize-qc` key; `public/workflow.js` is not edited; `outputs` stays two entries (`public/workflow.js:62`). The export stage's `outputs` list gains the file automatically (`src/exportCore.mjs:77`).
- `data_dictionary.json`, `tests_dictionary.json`, `wellbore_dictionary.json` and the normalized payload are **not** extended.

## 5. Regression criterion (extends Phase 3 §6)

`test/relations-pipeline.test.mjs` builds v5 in fixture mode (the v4 fixture network of `test/wellbore-pipeline.test.mjs`), derives a v4 directory by copying every file and rewriting only `acquisition.json` (scope `boundedWellboreScope`, same targets), exports both under one `artifactId`, and asserts:
- **Byte-identical:** `inventory.csv`, `injection_monthly.csv`, `quality_report.json`, `data_dictionary.json`, `tests_bhp.csv`, `tests_srt.csv`, `tests_dictionary.json`, `casing.csv`, `plugging.csv`, `wellbore_dictionary.json`; `manifest.normalized_payload_sha256` equal; `normalized.json` minus `.manifest` identical. (This is the review §8 "six v1 files … byte-identical with and without the dossier code path".)
- **Deep-equal after resetting `scope.query_version` to 4:** `tests.json`, `casing.json`, `plugging.json`.
- **`manifest.json`:** deep-equal to the v4 manifest once this closed delta is removed: `transformation_version`; `scope.query_version`; `files['sources/acquisition.json']`; `files['tests.json']`, `files['casing.json']`, `files['plugging.json']`; the one appended `files['evidence_relations.json']`; exactly one appended limitation matching `/evidence_relations/`. **No `sources` entry and no `sources/` file is added.**
- The Phase 3 chain test (`test/wellbore-pipeline.test.mjs:212-235`, v4 vs derived v3) stays unchanged and passes, so the chain is v5 → v4 → v3 → v2.

**Committed replay.** `test/test-reports-pipeline.test.mjs:159` becomes `queryVersion>=4` for the five wellbore sidecars, plus `queryVersion>=5` → `evidence_relations.json` present, else absent. All ten committed versions still replay byte-identically (no committed file changes).

**Determinism (review §8 "reproducible from the version's own `sources/`").**
- Export the same v5 fixture `sources/` twice to two output roots under one ID: `evidence_relations.json` byte-identical.
- Replay from the published `artifacts/<id>/sources/`: operation `verified_existing_bytes` (`src/pipeline.mjs:33`).
- Rebuilding with `loadSnapshot` + `buildArtifact` from that `sources/` gives the same SHA-256 as `manifest.files['evidence_relations.json']`.

## 6. Contract checks and gates (verify; no edit unless stated)

- **Transfer script** `scripts/prepare-supabase-archive.mjs`: `:17` (`query_version>=3`), `:19` (`queryVersion>=3` or a BHP/SRT/casing/plugging target URL) and `:20` (`rrc-collection-v(\d+)`, N ≥ 3) already skip v5. **Verify unchanged**, plus a new test with a v5 artifact, collected-sources folder and run record in a temporary root: all three skipped, event `skipped_local_only_test_report_version` (`:30`). The hosted-edge mirror (`test/hosted-edge.test.mjs:134-137`) uses the same `>=3` rule; verify.
- **Guest:** `refuseTestReports` (`src/exportCore.mjs:41`) and the recorder choice (`:158`) use `isLocalOnly`; a v5 snapshot is refused by prepare and finalize with the unchanged message "test-report versions are local-only (D7)". `GUEST_EVIDENCE_NAMES` frozen.
- **Analytics:** `localOnlyVersion` (`public/app.js:36`) already disables v5. Only the message at `:116` changes to "Test-report, wellbore and relation versions are not sent to Analytics until the receiver accepts additive files (D10, Phase 6)." Default and Analytics pins are untouched; v5 is never proposed for a repin (ADR §3, D10).
- **Package verification and TAR** enumerate `manifest.files`; `loadVerifiedSidecar` (`public/artifact-integrity.js:26-38`) accepts the name (pattern `:28`). No change.
- **Run validator** (`public/workflow.js:44-72`): unchanged (section 4).

## 7. Dossier (browser, read-only)

### 7.1 Placement and route [OD-8]
- A new workspace tab **Dossier** (`dossier`): `public/navigation.js:1` `tabs` (after `wellbore`); an `index.html:11` nav link `<a data-tab="dossier" href="#">Dossier</a>`; a `<section id="dossier-view" class="view" aria-labelledby="dossier-title" hidden>` with `<div id="dossier-content">` after `wellbore-view` (`index.html:19`); the `public/app.js:55` tab→view map; `dossier-content` in the clear list (`public/dataset-state.js:4`).
- Routes: `#dataset/<id>/dossier` (subject = the version's inventory row whose `uic_number` equals `manifest.scope.uic_number`, the same default `public/app.js:177` uses) and `#dataset/<id>/dossier/<encodeURIComponent(source_record_key)>`. `parseRoute` (`public/navigation.js:10-11`) accepts the optional third segment only for `dossier`; `datasetRoute` (`:14-17`) gains an optional key. An Overview action and a "Open dossier" link in the Records-tab well details both navigate to the keyed route, so a well opened from the table and from a bookmark resolves to the same `(artifactId, source_record_key)` and shows the same version ID in the workspace header.
- A key that is not an inventory `source_record_key` of this version renders "This record is not part of version <id>." — never a fallback to another row, a UIC, an API or a name.

### 7.2 Selection identity (ADR §4)
- Subject: `(artifactId, source_record_key)`. When the inventory→wellbore link is `matched`, the wellbore section is identified by `(artifactId, source_api_id)`.
- An `ambiguous` wellbore is not a selectable entity: its candidates are listed (candidate table, the selected one marked) and only inventory rows of this version are links. Bounded versions hold exactly one inventory row (`src/artifact.mjs:93`), so other candidates are shown as non-link text.
- Selection lives only in `location.hash` and module state. The dossier writes nothing: no fetch other than verified GETs, no `saveVerifiedPackage`, no storage, and it never modifies `manifest`, `normalized` or any hash input.

### 7.3 Loading and verification (fail closed)
- `showDossier(artifact,integrity,view)` in `public/app.js`, modelled on `showWellbore` (`:151-164`) with its own `createLatestRequest`, called beside it at `:177`.
- `dossierCollected(manifest)` = `Object.hasOwn(manifest.files,'evidence_relations.json')`. Otherwise: "The relation catalogue was not produced for this version. Versions before query version 5 keep their original files unchanged." (v1–v4, guest, saved v1–v4 packages).
- Loads with `loadVerifiedSidecar`: `evidence_relations.json`, `tests.json`, `casing.json`, `plugging.json`, `tests_dictionary.json`, `wellbore_dictionary.json`; `data_dictionary.json` and rows come from the already verified `normalized.json`. Checks `artifactId` of each, `dataset` of casing/plugging.
- **Consistency check before any render** (pure, in `public/dossier-view.js`): every `from_key`/`to_key` resolves in the table its kind names; every `evidence.file` is in `manifest.files` with the same SHA-256; `counts` equal a recount of `relations`; the relation types and triples are in the closed set (section 3). Any failure renders "Relation catalogue does not reconcile with this version: <reason>. No dossier is shown." and no rows.

### 7.4 Content (a table of edges before any graph; no graph in Phase 3b)
1. **Identity panel:** artifact ID, `source_record_key`, UIC, API (verbatim), lease, well number, operator number — from the inventory row; relation catalogue version.
2. **Edge table:** columns `relation`, `from_kind`/`from_key`, `to_kind`/`to_key`, `dataset`, `basis`, `status`, `reason`, evidence (file + SHA-256, full hash in text, not only a tooltip), candidates count. Rows: every edge whose `from_key` is the subject, every `wellbore_to_*` edge from its `source_api_id`, every `record_to_source_snapshot` edge of those records (in a `<details>`), in file order. A `<select>` filters by relation type. Every key cell links to the existing tab that shows the record (Records, Tests, Wellbore) by route only.
3. **Groups with reconciliation,** one per dataset: "H-10: 16 related rows = 16 accepted + 0 quarantined (quality report: 16 raw = 16 accepted + 0 quarantined + 0 excluded)". Accepted/quarantined come from the record dispositions (`quality_report.json` dispositions; `tests.json` and `casing.json`/`plugging.json` `quality.dispositions`), and the dossier **requires** related + unattributed = the quality report `raw` and the same accepted/quarantined split; a mismatch is the fail-closed state of 7.3.
4. **Not attributed:** edges with status `unmatched` or `ambiguous` (and wellbore rows under an `ambiguous` link) are listed in their own group with all candidates, never folded into the subject.
5. **Depth ladder** (section 8).

Fixed wording: the Phase 3 presence sentences (`public/wellbore-view.js:10-16`) are reused for wellbore links; nothing in the dossier states or implies casing, cementing, plugging, compliance, safety or communication.

### 7.5 Accessibility and keyboard
- Native elements only: tables with `<caption>`, `<th scope="col">`/`<th scope="row">`, inside `.scroll-table` regions with `tabindex="0"`, `role="region"` and an `aria-label` (the existing pattern, `public/wellbore-view.js:49`); filters are `<label>`+`<select>`; navigation uses `<a href>`. All reachable by Tab, activated by Enter; no pointer-only control, no custom key handling needed.
- Status is never conveyed by colour alone (text status in every row). Loading uses `role="status"`, failures `role="alert"`.
- No name matching anywhere: grouping uses edge keys only (test 7 in section 9).

## 8. Single-well reported-depth ladder (E11a) [OD-9, OD-10]

**Presentation only, browser only.** No ladder file is exported: ADR 004 §3 / D22 exclude a `well_depth_evidence` file from the contract. A pure module `public/depth-ladder.js` exports `ladderEntries(state)` and `renderLadder(entries)`; it is rendered inside the dossier and fed only by the verified files of 7.3 and the subject's relations.

### 8.1 Depth fields (only fields present in verified contract/sidecar files)

| Dataset (record kind) | Field shown (source field) | Unit, verbatim from the dictionary | Unit label (source forms §3) | Reference code |
|---|---|---|---|---|
| inventory | `permitted_top_depth_ft` (`top_inj_zone`), `permitted_bottom_depth_ft` (`bot_inj_zone`) — one interval | `ft` (`data_dictionary.json`, `src/artifact.mjs:168`) | "as named in data_dictionary.json; no page citation recorded" | not supplied by this dataset |
| casing | `csg_depth`, `multi_stg_depth`, `total_depth_g1w2` (points) | `ft` | CONFIRMED (W-2 item 36/31, WBA091) | `depth_reference_code` verbatim |
| casing | `toc` (point) | `ft (INFERRED)` | INFERRED | verbatim |
| plugging | `plug_top_depth`–`plug_bottom_depth` (interval) | `ft` | CONFIRMED (W-3 items 24/25, 21) | verbatim |
| plugging | `total_depth_w3` (point) | `ft (INFERRED)` | INFERRED | verbatim |
| BHP | `test_depth_ft` (point); label `tested_formation` | `ft` (`tests_dictionary.json`) | from field name (`odp_field_name`) | not supplied by this dataset |
| SRT | `top_perf_ft`–`bottom_perf_ft` (interval); label `formation_tested` | `ft` | from field name | not supplied by this dataset |

- Every entry carries: dataset, record key, field name, value exactly as in the sidecar, unit string verbatim, the unit label, `depth_reference_code` verbatim (or "not supplied by this dataset") followed by "meaning undocumented in ODP metadata" (the wording of `public/wellbore-view.js:17`; the dictionary note's WBA091 citation for GL/DF/KB/RT/GR is shown beside it), disposition, and for casing/plugging `record_sequence` and `on_top_record` (shown "not set" when absent).
- **Not shown as depths** [OD-9]: `depth_reference` (an elevation; never placed, added or subtracted), H-10 `toz`/`boz` and inventory `prod_casing_pkr_depth` (present in raw `sources/` but in no contract column — `src/normalize.mjs:5-6` — so showing them would need either new contract columns, breaking D10 byte identity, or a raw-file trust path in the browser).

### 8.2 Rules
- **Gaps, never interpolation:** a null value is a table row "Not reported" and draws no mark; a published zero (e.g. TRIPPET casing `toc` 0) is a value and is drawn at 0.
- **Intervals** are drawn only when both ends are non-null and top ≤ bottom. Top > bottom (`inconsistent:plug_top_exceeds_bottom`, `inconsistent:top_perf_exceeds_bottom`, `inconsistent:top_exceeds_bottom`) is listed as "Malformed interval: top exceeds bottom as reported"; nothing is drawn and the ends are never swapped. One end missing: the present end is drawn as a point, labelled "interval end missing".
- **Duplicate `record_sequence`:** every row is its own entry, grouped by verbatim `record_sequence` in source order; nothing is collapsed, de-duplicated or chosen as "latest".
- **Unit-less rows:** a field whose dictionary entry is missing or whose unit string does not begin with `ft` is listed with its unit verbatim (or "unit not stated") and is not drawn on the axis.
- **Quarantined rows:** listed in the table with disposition and reasons; not drawn [OD-10].
- **Wellbore rows under an `ambiguous` link** are not drawn for the subject; they appear in a separate table "Rows for API <api>, not attributed to this UIC".
- **No conversion:** no TVD, measured-depth or datum correction, no elevation arithmetic, no reference-code harmonisation. The axis label is "Reported depth value (ft as reported; depth basis and reference point vary or are undocumented)".
- **Formation names** appear only as the label of the same BHP/SRT row's source-supplied depth; a formation name with no depth is listed as text and not drawn. There are no formation tops or markers.

### 8.3 Drawing and accessible table
- A static inline SVG with one lane per dataset on a shared value axis, `role="img"` and an `aria-label` summary ("<n> reported depths drawn, <m> listed only"). No pointer interaction; nothing is reachable only through the SVG.
- The accessible table mirrors the ladder exactly: one row per entry in ladder order (dataset lane, then record order, then field order of 8.1), columns dataset, record key, field, value, unit, unit label, reference code + note, interval status, disposition, drawn (yes/no and why).

## 9. Tests (must exist)

`test/relations.test.mjs` (Task 1, pure builder):
1. **Shape:** exact top-level and relation key lists and order; `catalogue_version`; every relation has all 11 keys.
2. **Derivation on the TRIPPET committed bytes:** the pure builder applied to the committed v4 snapshot's canonical outputs (`loadSnapshot` on `artifacts/rrc-2026-10-29-uic000109605-…/sources`, then the existing `normalize`, `normalizeTests` and `normalizeSnapshotWellbore`; no scope or file is rewritten): 16 `inventory_to_h10` matched, 0 test edges, 2 `inventory_to_wellbore` (casing matched, plugging matched, one candidate each), 9 + 7 `wellbore_to_*`, 33 `record_to_source_snapshot`, total 67.
3. **Reconciliation:** `inventory_to_h10` count = `quality.monthly.raw` and its status split = `quality.parent_join`; test edges = `tests.quality.bhp/srt.raw` and = `parent_join.bhp/srt`; `wellbore_to_casing` = `casing.quality.counts.raw`; `record_to_source_snapshot` = sum of all row counts; `counts` = recount.
4. **Evidence:** every `evidence.sha256` equals `manifest.files[file].sha256`; no evidence file outside `sources/`.
5. **Statuses:** constructed fixtures give `ambiguous` H-10 (two inventory rows with one UIC, via the pure builder) with both candidates; `unmatched` with `from_key:null`; wellbore `ambiguous/multiple_inventory_rows` with all candidates; `none/no_source_rows` (plugging `[]`); `none/api_missing_or_invalid` (`to_key:null`, evidence inventory file only); `needs_review` never appears in any fixture or committed-bytes run.
6. **Not permitted (section 3):** one test per row of the table, including the API-equal/foreign-UIC H-10 fixture and the closed triple table; the static scans of `src/relations.mjs`.
7. **Key kinds:** the TRIPPET `candidate_key`/`source_record_key` collision resolves by kind; a fixture where two `source_snapshot_id`s are equal is disambiguated by evidence file.
8. **Purity:** two calls on deep copies give identical `JSON.stringify`; the module imports nothing from `node:fs`, `node:net`, `fetch`, and not `normalize`.

`test/relations-pipeline.test.mjs` (Task 1): v5 collection in fixture mode (21 targets equal to v4's, labels `rrc-collection-v5`/`rrc-odp-v2.3.0`, file present and listed last); the section 5 regression and determinism tests; `targetsForScope` refuses a tampered v5 scope and round-trips through JSON; v1–v5 targets never send `api_no` to `qq2j-f2zm` (extends `test/wellbore-pipeline.test.mjs:182`); guest prepare/finalize refuse v5 with the unchanged D7 message; transfer-script skip test (section 6); tampered `evidence_relations.json` refused by package replay and by `loadVerifiedSidecar`; caller-supplied rows never reach the catalogue (mutated snapshot → `SOURCE_HASH_MISMATCH`); `/api/collect` produces v5 with the request schema unchanged.

Edits to existing tests (Task 1, surgical): `test/test-reports-pipeline.test.mjs:159` (section 5) and `:176-186` (the `/api/collect` test asserts v5, labels `rrc-collection-v5`/`rrc-odp-v2.3.0`, `marker.scope.queryVersion` 5); `test/wellbore-pipeline.test.mjs:247-254` static scan unchanged but must still pass.

`test/dossier-view.test.mjs` and `test/depth-ladder.test.mjs` (Task 2, fixtures built only from the section 2 shapes):
1. States: not collected (v1, v3, v4 manifests), loading, verification failure (no rows), unknown key ("not part of version"), reconciliation failure (a fixture whose `counts` or a key does not resolve → no rows).
2. Edge table: captions, `th scope`, region `tabindex="0"` and `aria-label`; relation filter; full SHA-256 in text; candidates listed for `ambiguous`; presence sentences reused verbatim.
3. Counts line equals the fixture quality counts; a fixture with one quarantined H-10 row shows "16 = 15 accepted + 1 quarantined".
4. Route: `parseRoute`/`datasetRoute` round-trip with and without a key (keys with `:` are encoded); the Records-tab link and a typed bookmark open the same `(artifactId, source_record_key)` and the header shows the same version ID; invalid keys and other tabs with a third segment are rejected.
5. No writes: rendering a dossier leaves `manifest`, `normalized` and the fixture bytes unchanged; static scan of `public/dossier-view.js` and `public/depth-ladder.js` finds no `fetch(`, `indexedDB`, `localStorage`, `saveVerifiedPackage`, `method:`.
6. No compliance wording: rendered HTML contains none of `compliant`, `non-compliant`, `violation`, `plugged and abandoned`, `not plugged`, `properly`, `adequate`, `safe`, `communication` outside the allow-listed Phase 3 sentences.
7. No name matching: a fixture with a second candidate carrying the same `lease_name`/`operator_number` is never merged or linked.
8. Ladder fixtures (review §8): **missing** (null `csg_depth` → "Not reported", no mark); **zero** (`toc` 0 drawn at 0); **duplicate `record_sequence`** (two rows with sequence `"1"` both listed, `on_top_record` "not set" vs "true"); **malformed interval** (plug top 4629 > bottom 4508 → not drawn, not swapped, "Malformed interval"); **one end missing**; **unit-less** (dictionary entry removed, or unit "not stated by the source" → listed, not drawn); `depth_reference` never an entry; BHP `tested_formation` shown only with its `test_depth_ft`; every entry's value equals the sidecar value; every drawn entry has a table row and the table row count equals the entry count; ambiguous-link rows go to the separate table.
9. Unit labels: `toc` and `total_depth_w3` labelled INFERRED, the five CONFIRMED fields labelled CONFIRMED, cross-checked against the committed `wellbore_dictionary.json` unit strings.

Harness edits (Task 2): inject the new exports in `test/navigation-redesign.test.mjs:55,134`, `test/version-race.test.mjs:10,18`, `test/tests-view.test.mjs:116`, `test/wellbore-view.test.mjs:164,176` (its `versionArtifact` gains `queryVersion>=5` → a relation sidecar; `===4` → `>=4`).

## 10. Proof (Main, after merge-ready code)

- **Option B:** one owner-authorized local v5 collection of UIC `000109605` (API `38934609`; it has matched casing and plugging) through `/api/collect`, with the app token from `TRRC_SOCRATA_APP_TOKEN`. Record: the 21 URLs equal the v4 version's; per dataset raw = parsed = accepted + quarantined; relation counts reconcile (section 9 test 3); a replay from its `sources/` gives `verified_existing_bytes`; a token grep finds nothing; default and Analytics pins unchanged; the transfer script skips it. Source rows may have changed since 2026-10-29; differences are reported as observed, not as errors.
- **Option A:** the same checks on an offline export of `artifacts/rrc-2026-10-29-uic000109605-…/sources` to a new artifact ID; no network.
- The dossier is checked in a browser on that version (keyboard-only pass; screen-reader names of the tables), and on a v4 version (not-collected state).

## 11. Tasks (at most two parallel implementers; disjoint allowlists)

| Task | Owner / model | Allowed files (create or edit only these) | Acceptance |
|---|---|---|---|
| **1 — Catalogue and v5 pipeline** | Implementer, Opus high | `src/relations.mjs` (new), `src/sources.mjs`, `src/artifact.mjs`, `src/acquisition.mjs` (comment `:13` only), `scripts/serve.mjs`, `test/relations.test.mjs` (new), `test/relations-pipeline.test.mjs` (new), `test/test-reports-pipeline.test.mjs` (only `:159` and `:176-186`), `test/fixtures/relations/**` (new) | Sections 1–6 and the Task 1 tests of section 9; `scripts/prepare-supabase-archive.mjs`, `src/exportCore.mjs`, `public/workflow.js` verified unchanged; full `node --test test/*.test.mjs` green (baseline 416) plus new tests; Appendix A pipeline sites each reported changed or verified |
| **2 — Dossier and ladder** | Implementer, Opus | `public/dossier-view.js` (new), `public/depth-ladder.js` (new), `public/app.js`, `public/index.html`, `public/navigation.js`, `public/dataset-state.js`, `public/style.css`, `test/dossier-view.test.mjs` (new), `test/depth-ladder.test.mjs` (new), `test/navigation-redesign.test.mjs`, `test/version-race.test.mjs`, `test/tests-view.test.mjs` (harness `:116` only), `test/wellbore-view.test.mjs` (harness `:164-177` only) | Sections 7–8 and the Task 2 tests of section 9; fixtures from section 2 shapes only (no import of Task 1 code); Appendix A browser sites reported |
| **3 — Independent review** | Reviewer, Opus, read-only | none | After Tasks 1–2: relation derivation against ADR 004 §3–4, the not-permitted table and its tests, kind-tagged key resolution, ladder rules against review §8 E11a, wording. Findings resolved or ruled before merge. |
| **4 — Docs, integration, proof** | Main | `SPEC.md` (Phase 3b addendum), `docs/requirements.md` RRC-15, `docs/adr/004-wellbore-identity-and-relations.md` (Phase 3b note: file name, field spelling, `needs_review` reserved, per-dataset wellbore edge), `docs/verification-2026-10-29-phase3b-proof.md` | Section 10; Git in the worktree only |

- Tasks 1 and 2 run in parallel (two slots); Task 3 starts after both release their slots. Workers never stage, commit, push, revert others' edits or spawn helpers.
- Implementers re-run the Phase 3 Appendix B greps with `===4|queryVersion>=4|rrc-collection-v4|rrc-odp-v2\.2|boundedWellboreScope|evidence_relations|dossier` added, and report each hit against Appendix A.

## 12. Open decisions (Main/owner)

| ID | Decision | Recommended | Alternatives |
|---|---|---|---|
| OD-1 | How relation-bearing versions are made without changing committed v4 versions | **B:** query version 5 with the v4 targets unchanged; output stays a function of `sources/`; one authorized re-collection for a public proof | **A:** export-time option on v4 sources and offline re-export to a new artifact ID (no network; replay must read `transformation_version` first) |
| OD-2 | File name and form | `evidence_relations.json`, one JSON sidecar, self-describing, no CSV/dictionary | `relations.json` + `relations.csv` + dictionary entries |
| OD-3 | Key namespacing | Explicit `from_kind`/`to_kind` on every relation (keys stay verbatim) | Prefix keys (`h10:rrc:h10:…`) — changes key strings that other files use verbatim |
| OD-4 | ADR §3 has one `inventory_to_wellbore` row; the code has one link per wellbore dataset with independent statuses | One edge per dataset (`dataset` field), status/reason/candidates copied verbatim | One edge with a combined status (would need a new combination rule) |
| OD-5 | Status of `wellbore_to_casing`/`_plugging` | `matched` (exact API string holds for every published row; a mismatch fails the run, `src/artifact.mjs:159`) | Copy the row's `wellbore_link_status` (repeats the inventory attribution on every row); `null` |
| OD-6 | Use of `needs_review` | Reserved; never emitted in `rrc-relations-v1`; negative test | Emit for rows quarantined for identity duplicates (`duplicate_report_identity`, `duplicate_source_id`) — conflates row quarantine with relation status |
| OD-7 | `query_version` inside `casing.json`/`plugging.json` and `manifest.scope` for v5 (hard-coded 4 at `src/artifact.mjs:205,208`) | True version (5), enumerated in the section 5 delta (Phase 3 OD-2 precedent) | Keep 4, so both files stay byte-identical with v4 |
| OD-8 | Dossier route | Optional record key segment `#dataset/<id>/dossier/<key>`; default subject = scope-UIC row | Tab only (subject implied by the single inventory row) — loses bookmarkable identity for future multi-row versions |
| OD-9 | Raw-only depths (H-10 `toz`/`boz`, inventory `prod_casing_pkr_depth`) that review §5 lists for the ladder | Omit in Phase 3b; disclose in the ladder note | Add contract columns (breaks v1 byte identity, D10) or read raw `sources/` in the browser (new trust path) |
| OD-10 | Quarantined rows in the drawn ladder | Table only, not drawn | Drawn with a distinct style |

Settled from evidence (not open): the ladder is browser-only (ADR 004 §3, D22); no graph in Phase 3b (ADR Consequences "table of edges first"); `inventory_to_h10`/`inventory_to_test_report` reuse `parent_join_status` as is, including `unmatched` (ADR §3); no run-evidence change; no new query target; transfer script and guest refusal need no edit.

## 13. Contradictions and reinterpretations found

1. **Status vocabulary.** Review §8 lists `matched|none|ambiguous|needs_review`; ADR §3 says H-10 relations reuse `parent_join_status` "as they are", which includes `unmatched`. The ADR is normative; the catalogue's vocabulary is per relation (section 2.4).
2. **One vs two wellbore relations** (OD-4): ADR §2 assigns "exactly one link status per wellbore dataset", while the §3 table has one `inventory_to_wellbore` row.
3. **Depth fields named for E11a** (review §5 item 2, §3.1: inventory `prod_casing_pkr_depth`, H-10 `toz`/`boz`) are not in any contract column (`src/normalize.mjs:5-6`) (OD-9).
4. **`record_to_source_snapshot` "→ `source_snapshot_id`"**: snapshot IDs are 16-hex prefixes and collide across files with identical bytes (TRIPPET `candidate-inventory`/`wellbore-inventory`; empty BHP/SRT share the hash part `37517e5f3dc66819`). Evidence therefore carries the file name and full hash, as ADR §3 already requires.
5. **ADR §3 "Derivable from v1-schema data"** for `inventory_to_h10`/`record_to_source_snapshot`: true, but emitting them for v1–v3 would need new versions of those scopes; Phase 3b emits the catalogue only for v5 (all relations need v4 data to be complete).
6. **The brief cites "review §6 recs 1–2"**; in the v1.1 review the recommendations are §5 items 1–2 (§6 is the readiness table).
7. **Review §7 "presentation only"** for Phase 3b vs ADR §3's exported relation file: the catalogue is an export-time sidecar (ADR, D15, D21); only the dossier and ladder are presentation.

---

## Appendix A — sites to change or verify (commit `7a5477e`)

**`src/sources.mjs`:** `:4-6` comment (change); `:7` `isBounded` add 5 (change); `:9` `isLocalOnly` (verify); `:10-15` `versionLabels` add v5 (change); `:16-38` `sourceScopeFlags` (verify; kinds unchanged); `:71-74` `boundedWellboreScope` (verify) and new `boundedRelationScope` after it (change); `:83-95` `wellboreTargets` (verify); `:111-120` `targetsForScope` `:113`, `:119` (change).
**`src/artifact.mjs`:** `:55` `wellbore` `>=4`, add `relations` (change); `:93-95` single row and API cross-check (verify); `:148-160` projection checks (verify; catalogue built after them); `:197` `tests.json` scope (verify); `:205`, `:208` hard-coded 4 (change, OD-7); after `:211` the v5 block (change); `:216-220` payload and return (verify).
**`src/exportCore.mjs`:** `:21` `sourceCount`, `:34-39` `wellboreCounts`, `:41` refusal, `:61-69` `buildOutputs`, `:158` recorder (verify, Option B).
**`src/acquisition.mjs`:** `:13` comment (change), `:15` labels (verify). **`scripts/serve.mjs`:** `:9`, `:64` (change). **`scripts/prepare-supabase-archive.mjs`:** `:11-12`, `:17`, `:19`, `:20`, `:30` (verify).
**`public/`:** `navigation.js:1`, `:10-11`, `:14-17`; `index.html:11`, `:19`; `app.js:55`, `:116`, `:120-121` (download description for `evidence_relations.json`), `:151-164`, `:177`; `dataset-state.js:4` (change). `app.js:36`, `artifact-integrity.js:26-38`, `workflow.js:44-72`, `wellbore-view.js:6` (verify).

## Appendix B — deltas if OD-1 Option A is ruled

- No `boundedRelationScope`, no `versionLabels`/`isBounded`/`targetsForScope` change, no `serve.mjs` scope change. `versionLabels(scope,{relationCatalogue})` returns `rrc-odp-v2.3.0` for v4 with the option.
- `buildArtifact(snapshot,artifactId,normalized,{relationCatalogue=false}={})`; true with a non-v4 scope throws `SOURCE_INVALID`. Thread the option through `exportCore` (`buildOutputs`, `exportRecorder`), `exportArtifact`, `collectPublicSnapshot` (`/api/collect` passes true) and a `scripts/export.mjs` `--relation-catalogue` flag; guest prepare/finalize never accept it.
- Replay rule: the caller passes the option iff the published `manifest.transformation_version` is `rrc-odp-v2.3.0`; the committed-replay test reads each committed manifest first. A mismatch is caught by `VERSION_CONFLICT` (`src/pipeline.mjs:33`).
- The section 5 regression compares one v4 `sources/` exported with and without the option; `scope.query_version` stays 4, so the delta is `transformation_version`, the appended file and the limitation only.
- Dossier gating, ladder, tests 1–9 and the task split are unchanged except that `test/relations-pipeline.test.mjs` exercises the flag and Task 1 also owns `src/exportCore.mjs`, `src/pipeline.mjs`, `scripts/export.mjs` and `src/acquisition.mjs` (option threading).
