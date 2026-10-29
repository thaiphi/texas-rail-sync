# Bounded Explorer specification v1

## October 29 source-access and identity addendum (Phase 1)

**Scope.** The scope now includes bounded RRC ODP wellbore and test records for explicitly selected wells (owner decision D3): BHP, SRT, casing and plugging. Requirements RRC-11 to RRC-16 track this in [requirements](docs/requirements.md). Phase 1 adds no dataset row query, artifact file or UI; Phase 1.1 preserves view metadata only, under a dated discovery directory. The statewide/GIS cut below still applies, and well bottom location is part of that cut until RRC-07 is authorized.

**Fetch contract (RRC-11).** These rules apply to the shared official fetch:
- It may carry an optional Socrata app token, sent only as the `X-App-Token` header and only to `https://data.texas.gov`. The token is never put in a URL, so preserved query URLs stay byte-identical with or without it. The token is passed to the shared fetch as an explicit option. The fetch module never reads the environment, because it is bundled into the hosted runtime.
- Local entrypoints read the token from `SOCRATA_APP_TOKEN`. The hosted guest path sends no token until the hosted-parity decision (D7).
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
