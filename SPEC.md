# Bounded Explorer specification v1

## October 30 version comparison (Phase 4, RRC-16)

**Scope.** A read-only, network-free comparison of two preserved versions of one UIC, shown on a new Compare screen (`#compare/<A>/<B>`). Nothing is collected or exported, and no query version changes. Nothing under `artifacts/`, `src/` or `scripts/` changes. The frozen contract is [the Phase 4 design](docs/superpowers/specs/2026-10-30-phase4-version-comparison-design.md).

**Keys.**
- Rows pair only by native source identity:
  - inventory by `uic_number`
  - H-10 by UIC + `period_start`
  - BHP by report ID + tracking number + test sequence
  - SRT by report ID + tracking number
  - casing and plugging by source `id`
- `source_row_key` and `source_record_key` embed a response hash and a row position, so they are shown only as row references.
- On 2026-10-29 the source reissued every H-10 report ID for UIC 000020838 without changing any value. Such rows show as "Same values, different report identity".
- Values are compared exactly as published, so `null`, `0` and `"0"` are all different.
- Rows that share a key are never paired arbitrarily.

**Comparability.**
- A dataset one version lacks is "not comparable", never removed.
- Rows outside the other version's reporting window or inventory query are "outside the other version's scope".
- Coverage, QC counts and per-source SHA-256 are compared. Retrieval time, ETag and last-modified are shown as secondary detail.
- The relation catalogue is compared by its counts only.

**Browser.**
- Only versions listed by this server can be compared. Both are verified first, and the pair is refused (with no rows shown) for different UICs or the same version twice.
- A is the version collected earlier. The page never says which version is correct, newer or better.
- Filters change only what is shown. There is no download of the comparison.

**Proof.** Every same-UIC pair of committed versions (9 pairs) is compared in the test suite, in both orders, with a check that the files under `artifacts/` are unchanged. See [the proof](docs/verification-2026-10-30-phase4-proof.md).

## October 29 relation catalogue and dossier (Phase 3b, RRC-15)

**Scope.** Local `/api/collect` now always produces query version 5 (owner decision, 2026-10-29). Version 5 queries exactly the version 4 targets (21, or 18 without a valid API) and adds one derived sidecar, `evidence_relations.json`. Existing v1–v4 versions are unchanged and never gain the file. Transformation: `rrc-odp-v2.3.0`, pipeline `rrc-collection-v5`. The frozen contract is [the Phase 3b design](docs/superpowers/specs/2026-10-29-phase3b-relation-catalogue-design.md); relations follow [ADR 004](docs/adr/004-wellbore-identity-and-relations.md) §3–4.

**Relation catalogue.** `evidence_relations.json` (`catalogue_version` `rrc-relations-v1`) is built at export by a pure module from the records already validated in the version. It is not a database table, and it is reproducible byte for byte from the version's own `sources/`.
- Six relation types:
  - `inventory_to_h10` and `inventory_to_test_report`: `parent_join_status` as is (`matched` / `unmatched` / `ambiguous`).
  - `inventory_to_wellbore`: one per wellbore dataset, with the ADR 004 §2 link status, reason and candidates copied verbatim.
  - `wellbore_to_casing` and `wellbore_to_plugging`: one per source row, always `matched`.
  - `record_to_source_snapshot`: status null.
- Every relation has kind-tagged keys (`from_kind`/`to_kind`), because keys from different files can be textually equal. Its evidence is the source file name plus its full SHA-256, checked against `manifest.files`.
- `ambiguous` relations list every candidate and are never resolved to one parent. `needs_review` is reserved and never emitted.
- The not-permitted relations are listed in the file and each has a negative test: API → H-10; API → BHP/SRT; casing or plugging → UIC bypassing the inventory row; spatial or name-similarity relations; bottom location `uumf-5r4y`; permit → document.

**Acceptance criterion.** Against the v4 output from the same sources: the four v1 data files, the three test-report files, `casing.csv`, `plugging.csv` and `wellbore_dictionary.json` are byte-identical and `normalized_payload_sha256` is equal. `tests.json`, `casing.json` and `plugging.json` differ only in `query_version` (now the true value). `manifest.json` differs only by an enumerated delta (design §5). No source file is added.

**Browser.**
- The new Dossier tab (`#dataset/<id>/dossier/<source_record_key>`) is read-only.
  - It verifies the catalogue and every sidecar, and reconciles every edge with the quality counts; on any failure it shows no rows.
  - It then shows a table of edges (no graph), candidates for ambiguous links and a per-dataset count line.
  - Selection is UI state only and never enters a file or hash. Name matching is never used.
- The single-well reported-depth ladder (E11a) is drawn in the browser only.
  - Units are verbatim and labelled CONFIRMED or INFERRED; `depth_reference_code` is shown verbatim, and its meaning is undocumented.
  - There is no interpolation, TVD or datum conversion.
  - Malformed intervals are listed, never swapped. Quarantined and unit-less rows are listed, not drawn.
  - Every drawn mark has a table row.
  - Raw-only depths (H-10 `toz`/`boz`, inventory `prod_casing_pkr_depth`) are omitted and disclosed.
- Versions before 5 show "not produced for this version".

**Hosted and Analytics.** Version 5 is local only, like versions 3 and 4. It cannot be sent to Analytics until Phase 6.

**Live proof.** On 2026-10-29 one local v5 collection of UIC 000109605 (TRIPPET SWD) used the same 21 targets as its v4 version. It produced 67 relations, all reconciled. The ten regression files are byte-identical to v4, and the version replays byte for byte (see [the proof](docs/verification-2026-10-29-phase3b-proof.md)). Independent Opus review: PASS, with four findings fixed.

## October 29 casing and plugging connectors (Phase 3, RRC-14)

**Scope.** Local `/api/collect` now always produces query version 4 (owner decision, 2026-10-29); version 3 is no longer produced, and existing v1–v3 versions are unchanged. Version 4 adds the following to the thirteen v3 targets:
- casing `u9m4-xnh6` and plugging `wfzn-9fje` view metadata;
- an exact-`api_no` inventory query (`$limit=25`) that proves whether the selected row's API is unique;
- exact-`api_no` casing and plugging queries from the selected inventory row's own `api_no` (`$limit=1000`, ordered `record_sequence,id`), with no reporting-window bound;
- three official RRC documents for unit and meaning citations: the WBA091 well-bore manual and Forms W-2 and W-3.

Transformation: `rrc-odp-v2.2.0`, pipeline `rrc-collection-v4`. The frozen contract is [the Phase 3 design](docs/superpowers/specs/2026-10-29-phase3-casing-plugging-design.md); identity follows [ADR 004](docs/adr/004-wellbore-identity-and-relations.md) as amended on 2026-10-29.

**Identity.** The API string is matched exactly and never normalized. Each dataset gets one link status with basis `inventory_api_no`: `matched`, `none` (`no_source_rows` or `api_missing_or_invalid`) or `ambiguous` (`multiple_inventory_rows` or `inventory_cap_reached`). A scope contradiction fails the run. Casing and plugging rows carry no UIC or parent key, and no code path joins H-10 by API (negative tests).

**Output.** Additive sidecars `casing.json`, `casing.csv`, `plugging.json`, `plugging.csv` and `wellbore_dictionary.json` are listed in `manifest.files`; `schemaVersion: 1` is unchanged.
- One row per source row; nothing is merged. The source `id` is the row key. `record_sequence` is a filing sequence and may repeat; only a repeated `id` is quarantined. `on_top_record` is kept as published.
- Dates are accepted only as `YYYY-MM-DDT00:00:00.000`; the original text is kept. A published zero stays zero, and missing stays null.
- A plug whose top is deeper than its bottom is quarantined.
- Units are cited from the official documents and labelled CONFIRMED or INFERRED. The source conflicts are disclosed, not resolved: cement may be recorded in other units than sacks (WBA091), the plugging view's elevation fields have no W-3 source, the W-3's two plug tops are reduced to one, `toc` `0.0` may mean surface or "not reported", and the casing row grain does not match the ODP description.
- Presence wording states only whether source rows were returned. It never says a well has no casing or is or is not plugged.

**Acceptance criterion.** The Phase 2 revised criterion is extended: against the v3 output from the same sources, `inventory.csv`, `injection_monthly.csv`, `quality_report.json`, `data_dictionary.json`, `tests_bhp.csv`, `tests_srt.csv` and `tests_dictionary.json` are byte-identical and `normalized_payload_sha256` is equal; `tests.json` differs only in `query_version`; `manifest.json` differs only by an enumerated delta (design §6). A regression test enforces it. The design's "duplicate sequence" fixture is reinterpreted as a duplicate source `id`.

**Hosted and Analytics.** Version 4 is local only, like version 3: the guest path stays v2, the export core refuses query version 3 and later there, and the transfer script skips those versions, their runs and raw folders containing the casing or plugging datasets. Version 4 cannot be sent to Analytics until Phase 6.

**Live proof.** The live proof ran on 2026-10-29 for UIC 000020838, 000111186, 000119875 and 000109605; every count reconciles, casing is `matched` for all four, and plugging is `matched` for 000109605 and `none/no_source_rows` for the three active wells (see [the proof](docs/verification-2026-10-29-phase3-live-proof.md)).

**Browser.** The Wellbore tab verifies each sidecar before showing it, shows the link status, basis and candidates, and says casing and plugging were not collected for older versions.

## October 29 test-report connectors (Phase 2, RRC-13)

**Scope.** Local `/api/collect` produced query version 3 from Phase 2 until Phase 3 (owner decision, 2026-10-29); it now produces version 4, which keeps every v3 target. Version 3 adds the following to the seven v2 targets:
- exact-`uic_no` queries on BHP `qxfy-wcfs` and SRT `h54t-xnbi`, with their view metadata (`$limit=1000`, ordered by report identity);
- two official RRC documents, the SRT guidelines page and the December 2023 Permian monitoring notice, preserved for unit and meaning citations.

Transformation: `rrc-odp-v2.1.0`, pipeline `rrc-collection-v3`.

**Query rules:**
- The test queries have no reporting-window bound.
- Exactly 1000 rows gives `SOURCE_ROW_LIMIT`, and more gives `SOURCE_INVALID`; neither publishes.
- An empty response is `confirmed_empty`. It never means "no test was conducted".

The frozen contract is [the Phase 2 design](docs/superpowers/specs/2026-10-29-phase2-bhp-srt-design.md).

**Output.** These additive sidecars are listed in `manifest.files`: `tests.json`, `tests_bhp.csv`, `tests_srt.csv` and `tests_dictionary.json`. `data_dictionary.json` and `schemaVersion: 1` are unchanged.
- One row per retained source row; nothing is merged.
- Dates are accepted only as `YYYY-MM-DD`, and the original text is kept.
- psia and psig values are kept as the field names state and are never converted. The `bhp_psia` name conflicts with the PSIG unit in official Permian guidance. That conflict is disclosed, not resolved.
- Duplicate report identities are quarantined.
- FIRC and the `satisfactory_test` codes are shown verbatim as undocumented.

**Revised acceptance criterion (disclosed revision of review §8).** The review's Phase 2 criterion said "the six v1 files … byte-identical". It cannot hold under D10, because listing sidecars changes `manifest.json`, and `normalized.json` embeds the manifest. The criterion is replaced by:
- byte-identical `inventory.csv`, `injection_monthly.csv`, `quality_report.json` and `data_dictionary.json`;
- an identical `normalized_payload_sha256`;
- `manifest.json` and `normalized.json` equal to the v2 output from the same sources, except for a closed, enumerated delta (design §6).

A regression test enforces it.

**Hosted and Analytics.** Version 3 is local only (D7):
- The hosted guest path stays v2, and the shared export core refuses v3 there.
- The Supabase transfer script skips v3 versions, their runs and their raw `collected-sources` folders.

Version 3 cannot be sent to Analytics until its receiver accepts additive files (D10, Phase 6). Until then, **new local collections cannot be handed to Analytics**; the three existing versions still can.

**Live proof.** The live proof ran on 2026-10-29 for UIC 000020838, 000111186 and 000119875; the counts reconcile for all three (see [the proof](docs/verification-2026-10-29-phase2-live-proof.md)).

**Browser.** The Tests tab verifies each sidecar against the manifest's SHA-256 and byte count before showing it. A version without sidecars says test reports were not collected.

## October 29 source-access and identity addendum (Phase 1)

**Scope.** The scope now includes bounded RRC ODP wellbore and test records for explicitly selected wells (owner decision D3): BHP, SRT, casing and plugging. Requirements RRC-11 to RRC-16 track this in [requirements](docs/requirements.md). Phase 1 adds no dataset row query, artifact file or UI; Phase 1.1 preserves view metadata only, under a dated discovery directory. The statewide/GIS cut below still applies, and well bottom location is part of that cut until RRC-07 is authorized.

**Fetch contract (RRC-11).** These rules apply to the shared official fetch:
- It may carry an optional Socrata app token, sent only as the `X-App-Token` header and only to `https://data.texas.gov`. The token is never put in a URL, so preserved query URLs stay byte-identical with or without it. The token is passed to the shared fetch as an explicit option. The fetch module never reads the environment, because it is bundled into the hosted runtime.
- Local entrypoints read the token from `TRRC_SOCRATA_APP_TOKEN`. The hosted guest path sends no token until the hosted-parity decision (D7).
- Retrieval sidecars gain an `app_token_used` boolean. It is kept out of the manifest's `sources` projection, so replay stays byte-identical. The token value never appears in sidecars, errors, run records or downloads.
- HTTP 429 fails with `SOURCE_THROTTLED` and `retryAfterMs`, parsed from `Retry-After` as delta-seconds or an HTTP-date, otherwise null. The shared fetch itself never waits. Local acquisition and lookup retry once after the parsed wait when it is at or below a fixed cap. A missing, unparseable or over-cap `Retry-After` fails at once with no wait. The guest path sends no token, treats `SOURCE_THROTTLED` as retryable and keeps its existing journal backoff.
- Committed source sidecars and every existing version stay unchanged. The new key appears only in sidecars written after this change.

**Identity (ADR 004).** The UIC and wellbore/API identity domains are siblings:
- The wellbore link uses only the inventory row's own original `api_no`, with basis `inventory_api_no`. Its status is `matched`, `none` or `ambiguous`.
- API never joins H-10 rows or resolves a UIC parent automatically. The API lookup only lists candidates for explicit selection. The existing "API is not a join key" rule for the UIC contract files is unchanged.
- Typed relations are derived files inside a version, never a database. UI selection state never enters a package.

## October 11 local browser transfer

The optional [version1 browser handoff](docs/adr/003-local-analytics-browser-handoff.md) adds a user-initiated Downloads action to the separately owned local Analytics receiver. It transfers the existing complete verified TAR without narrowing to UI filters, then waits for receiver validation and explicit session confirmation. It does not change the artifact schema, public provenance, default pins or recorded run acknowledgement. Coordinated browser acceptance and remaining limitations are recorded in the dated producer checkpoint.

## October 10 integrity repair contract

Fixture classification comes from retained source evidence before replay parameter/pin failures and cannot be promoted through mutable snapshot fields. Successful normalization events require exactly `normalized inventory` and `normalized monthly` outputs, each with a 64-hex SHA256 and a nonnegative integer count reconciling with QC. Standalone event validation checks hash form and required evidence; authenticating its contents requires the referenced bytes.

Direct artifact construction requires a successfully loaded snapshot. Private copies bind its source projections, raw bytes, identities, scope, metadata and classification; supplied normalization must equal canonical normalization of those private sources. Serialization uses private copies across asynchronous reads. Restricting public evidence to a fixture remains supported; promoting fixture evidence to public rejects. See [repair verification](docs/verification-2026-10-10-integrity-fixes.md) for frozen hashes and compatibility evidence.

## October 10 bounded collection extension

The typed JSON loopback API adds POST `/api/lookup` and `/api/collect`, GET/HEAD `/api/versions` and `/api/versions/<artifactId>/download`. Exact identifiers retain original strings: UIC nine digits, supported source API eight digits. Candidate selection is explicit; 25 candidates, ambiguous parents, a 1,000-row monthly response, invalid month types or windows outside 1–36 inclusive months block a complete collection. Fresh exact-UIC inventory must match the selected lookup identity. The browser never sends arbitrary source URLs or filesystem paths.

New transformation `rrc-odp-v2.0.0` artifacts retain the legacy schema-1 wrapper/CSV compatibility and add bounded scope, hashed lookup/selection/acquisition/retrieval evidence and publication pins anchored in the successful actual run. Fixture evidence stays fixture even on early failure. Whole-version TAR delivery verifies hashes, byte counts, containment and public provenance before responding. Preserved artifact HTML is delivered as inert text; source bytes remain unchanged. See ADR 002 and the October 10 verification packet for the implemented contract and remaining limits.

Run selection, dataset version selection and record filters are independent. A failed version verification clears all earlier dataset evidence and disables filters/downloads. Confirmed empty source results differ from history outside the acquisition scope. Default pins and Analytics adoption remain separately curated. The sections below retain the original pinned-sample specification; this extension supersedes their fixed-only/no-write-endpoint statements.

Purpose: inspect public injection records and hand Analytics a standalone pinned file artifact with evidence. The source proof is one UIC history and five inventory candidates; expanding coverage is a separate task.

The application has no third-party runtime dependencies. Node handles official acquisition, strict number parsing, exact string parent linkage, disposition accounting, SHA256 and CSV/JSON export. Static browser assets inspect the pinned result. Source files remain immutable evidence; the exporter never queries the network.

## Identity and normalization

`inventory.csv` grain is one retained source inventory row. `injection_monthly.csv` grain is one retained source monthly row, including duplicate/conflicting revisions. `source_record_key` and `source_row_key` contain dataset snapshot identity plus raw 1-based ordinal, preserving repeated original IDs. `parent_key` is populated only if an exact original UIC string resolves to exactly one retained inventory row. Shortened API has no uniqueness assumption. All original IDs are strings.

Numeric missing values become null/empty CSV; zero remains zero. Non-numeric values receive parse-failure flags and null. Invalid identities, negative quantities, inconsistent pressures, duplicate periods/IDs and ambiguous/unmatched parents are retained with quarantine dispositions. Missing numeric observations receive explicit flags, remain accepted source records and do not become zeros. Issue counts can overlap; accepted/quarantined/excluded counts cannot. Source code `most_recent_record` is retained without undocumented selection semantics.

Calendar rate = monthly liquid barrels / Gregorian calendar days. Units, status and formulas are in `data_dictionary.json`. Distinct reported average and maximum psi fields remain distinct even when their numeric values coincide. Annulus fields are not present in this dataset. Permit maxima are labeled regulatory constraints. Full source row fields are preserved in the raw response even when absent from normalized projections.

## Output and consumer

Artifact `rrc-2026-10-09-uic000020838-v1` contains five contract files, typed `normalized.json` with the agreed camel-case wrapper, and original source bytes under `sources/`. Manifest inventories URLs, timestamps, source revisions/ETags, hashes, schema/transformation versions, query bounds and limitations. Manifest and embedded manifest avoid self-hashing; consumer pins the external manifest hash. Analytics must retain public reported / calculated labels and identity when copying this artifact.

## Inspection behavior

Search by UIC/API/operator number/lease/well; filter acquired county and operator; inspect the full inventory table and selected identity, constraints, QC and actual acquired history. No-history parents show an explicit acquisition-scope message. Missing chart values have no bar and zero has a baseline marker. Export downloads always contain the complete pinned slice, independent of view filters. Original official URLs, raw snapshot downloads and SHA256 are inspectable. Independent manifest and normalized payload hash pins are checked before display; failures leave counts and data unavailable. No live source access occurs in the browser.

## Invocation and immutable publication

`scripts/export.mjs` accepts explicit `--source-dir`, `--artifact-id`, `--output-root`, optional `--offline-replay` and `--expected-manifest-sha256`. Default invocation replays the original sample. `scripts/acquire.mjs` takes a NEW source directory and artifact ID, collects the fixed seven official targets and uses the same normalization/publication path. Conflicting or partial existing artifact versions cannot be replaced. Identical retries compare all file names/bytes without rewriting. New versions are staged and readback-checked under an exclusive per-version lock before directory publication. A stale lock after process termination requires investigation; the application does not automatically break it.

The three instrumented stages combine actual execution boundaries: `load` covers source acquisition or offline raw/metadata validation; `normalize-qc` covers parsing, exact parent linkage and disposition accounting; `export` covers contract construction, hashing and publication/comparison. UUID invocation IDs namespace ordered stage/event IDs. Actual input URLs, timestamps, snapshot identities, hashes, output paths/bytes/counts and structured redacted errors are recorded. Failed stages terminate execution and mark downstream stages skipped. Test fixtures are explicitly marked and excluded from persistent actual history.

The read-only browser map uses these validated events. GET/HEAD history routes return records; there are no trigger/write endpoints. The pinned inventory is independent of the selected historical run, with that distinction stated in the interface. Historical absent events and external consumer acknowledgement remain unrecorded. Terminal records are saved once after execution; crash recovery and live streaming status are not implemented. Failure to persist history rejects the invocation while retaining truthful completed stage evidence.

## Deliberate cuts

No GIS, statewide extraction, permitting, LLM, private data, operational compliance conclusion, sustainable capacity or BHP calculation. No invented deployment/portfolio return URL. No Git initialization/writes were performed in the delegated implementation; main owns repository creation and integration.
