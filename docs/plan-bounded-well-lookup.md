# Bounded well lookup and collection — implementation plan

Prepared October 10, 2026, after the five validation fixes. Originally plan-only during that fix round, which stopped early at 04:48:30 UTC. **Implementation authorized by the later user “Do it” and started in the 05:05:20–06:05:20 UTC review/implementation round after the five-defect gate passed.** Fresh independent validation review passed, the full host suite passed 68/68, and protected files passed preservation checks. See `verification-2026-10-10-acceptance.md`. Closing those defects does not accept the entire project; feature acceptance remains pending.

**Final status:** Implemented and independently reviewed within this round. Main final production suite 89/89, independent full suite 107/107, actual website public collection, whole-artifact consumer verification and browser-saved complete 28-file TAR pass. Original sources/versions/history/pins and consumer files remain unchanged. The historical proposed steps below record the plan; actual final contracts are ADR002 and the current verification packet. No full-project/deployment/consumer-adoption acceptance is claimed.

## Outcome and boundaries

A user identifies a well, inspects official candidate identities, explicitly selects one, collects a bounded period of supported public injection reports, inspects the recorded run on the existing read-only map, and downloads a new immutable dataset for Analytics. The original five-inventory/28-report dataset and all earlier sources, versions, history and consumer pins remain reproducible.

The current code supports official inventory dataset `givw-z9t4` and monthly dataset `qq2j-f2zm`, as evidenced by the preserved October 9 metadata and SOURCE_PROOF. That is dated evidence. Before implementing new lookup queries, verify the current official metadata, supported query fields, access conditions and response limits. Do not assume other report types, original H-10 document downloads, annulus values, statewide completeness or current operating status are supported.

No map editing, drag/drop, arbitrary workflow authoring, scheduling, GIS or statewide refresh. No automatic Analytics repin, consumer acknowledgement, deployment, Git operation or permission change. Collection actions belong outside the read-only map.

## Proposed user flow

1. **Find a well.** Enter an exact original UIC or an exact original API value supported by the official inventory schema. Preserve leading zeros. The existing sample has eight-character source API values; do not truncate a different API format to manufacture a match. Explain unsupported formats and retain the submitted value.
2. **Choose the identity.** Display original UIC/API, operator identifier, lease/well name, county basis and available permit/status fields, together with the lookup source and retrieval time. Zero candidates is an empty result; multiple candidates require explicit selection. Duplicate/ambiguous parent identities block collection until resolved; never pick the first match automatically. Lookup absence is not proof that a well does not exist.
3. **Choose the reporting window.** Use inclusive start/end reporting months. Proposed initial limit: 36 months, one selected UIC, at most 25 inventory candidates and the existing 1,000-row monthly cap. These are application bounds, not a claim about publisher limits. Reaching a response cap leaves completeness unproven and blocks verified publication; narrow the request rather than silently truncate or expand it.
4. **Collect supported records.** Show the exact selected identity, period and supported source before the user starts the explicit collection action. Preserve the lookup response, selection evidence, official responses and retrieval metadata. A failed fetch retains partial evidence and a failed run; no successful empty dataset substitutes for a failed request.
5. **Inspect the result.** Select the actual recorded invocation on the existing map. Load, normalize/QC and export remain the three nodes unless actual execution boundaries are deliberately changed and tested. All four panels use that invocation's evidence. Viewing a node does not start or retry collection.
6. **Open and export the version.** Explicitly select the resulting dataset version for records/details and downloads. A history selection must not silently repin the browser or Analytics. Show dataset ID, source scope, retrieval time, provenance, quality/dispositions and hashes. Downloads contain the whole selected version and explain their independence from table filters.

## Contracts to implement

| Contract | Proposed content and invariant |
|---|---|
| Lookup request | Typed identifier kind/value; optional supported narrowing fields only. Server constructs official query; client cannot supply a URL, query expression or filesystem path. |
| Lookup evidence | Original response bytes, official URL/query, retrieval time, hash, metadata/schema revision, bounds, returned count and completeness state. No public classification from URL shape alone. |
| Selected well | Exact UIC, original API/operator/lease/well fields, selected source-record identity and lookup snapshot hash. Revalidate unique parent identity before collecting monthly records. |
| Collection scope | Selected UIC, inclusive reporting-month bounds, candidate/monthly/byte/time caps and query-contract version. Validate every returned row against the recorded predicates. |
| Source snapshot | New server-generated directory/ID, selection and lookup evidence, raw responses and sidecars, explicit public/fixture classification. Never reuse or overwrite `raw/` or an earlier snapshot. |
| Run record | Unique invocation ID, actual mode/stage events/timestamps, source/input/output hashes/counts, quarantine reasons and structured errors. Preserve partial/failure records; no historical timing reconstruction. |
| Dataset version | New immutable ID, manifest scope and transformation version, compatible inventory/monthly columns, normalized JSON, dictionary and QC report. Keep source rows and original identifiers, including invalid/conflicting revisions. |
| Browser selection | Separate selected run ID, selected dataset ID, selected inventory row and selected report. Async responses must match their request/selection identity before updating the view. |
| Analytics handoff | Whole-version files and external manifest/normalized pins. Consumer validates source status and counts before an explicitly authorized import; export alone never proves consumer acceptance. |

Parameterizing the current fixed scope requires a versioned acquisition/selection contract. `loadSnapshot` currently verifies exact fixed target URLs and caps, and the legacy public compatibility exception is bound to fourteen exact evidence files. Preserve that exception only for its original sample. New query scopes require complete recorded acquisition evidence, not a broader legacy allowlist or caller-controlled public flag.

Quarantined rows remain in source and export evidence. Duplicate months use exact well identity plus canonical year/month; missing report IDs, invalid permit/depth values, scope contradictions and count inconsistencies retain the validation rules from this fix round. Any quality quarantine makes verified-public-history readiness explicit; do not silently repair rows or select a preferred revision. A confirmed successful query with zero monthly rows shows **no reports returned for this period**, distinct from unsupported history, missing source, cap reached and failed request.

## Execution order and proposed files

| Step | Ownership / proposed files in texas-rrc-explorer | Deliverable and acceptance |
|---|---|---|
| 0. Review gate | Independent reviewer; validation verification packet | Review all five fixes and fixture-provenance preservation. Rerun the blocked filesystem/CLI/server gates in an environment that supports them without permission changes. Findings resolved before feature implementation. |
| 1. Confirm official source contract | `SOURCE_PROOF.md`, `docs/adr/002-bounded-well-selection.md` (new), `src/sources.mjs` | Record supported exact identity queries, field semantics, date boundaries, caps and access evidence. Reconcile browser acquisition controls with the approved read-only-map PRD. No live collection until separately authorized. |
| 2. Lookup and explicit selection | `src/lookup.mjs` (new), `src/sources.mjs`, focused `test/lookup.test.mjs` (new) | Parameterized bounded query construction and source-preserving lookup. Test no result, unique result, multiple/duplicate parents, leading zeros, unsupported API forms, response caps, malformed responses, wrong predicates and timeout. |
| 3. Bounded collection/versioning | `src/acquisition.mjs`, `src/artifact.mjs`, `src/pipeline.mjs`, `src/normalize.mjs`, `scripts/acquire.mjs`; acquisition/versioning/validation/provenance tests | Carry selected identity and immutable scope from lookup to monthly collection, validation, source preservation, run events and manifest. Preserve all old data/exports/pins; reject scope mismatch and conflicts. Increment transformation/contract version for new behavior while retaining old replay compatibility. |
| 4. Website adapter and flow | `scripts/serve.mjs`, `public/index.html`, `public/app.js`, `public/workflow.js`, `public/presentation.js`, `public/style.css`; server/presentation tests | Proposed local-only lookup/collection adapter plus selection/result UI outside the map. One active collection, explicit bounded request, no arbitrary paths/URLs, stale-response protection and truthful failed/empty states. This introduces write/trigger endpoints and requires explicit implementation authorization because the existing PRD permits only read-only history routes. |
| 5. Version inspection/export | Same public modules, `public/artifact-integrity.js`; artifact/inspection tests | Load an explicitly selected available version using verified manifest/payload pins. Run selection and version selection remain clear. Table/detail/source links and whole-version downloads agree. No automatic replacement of default or Analytics pins. |
| 6. Source and consumer proof | Owning tests and dated verification packet; sibling Analytics read-only validation only | One separately authorized bounded public lookup/collection, manual source anchors, offline deterministic rebuild, independent source/fixture rejection checks, actual desktop/mobile/keyboard/download evidence and fresh independent review. |

These are proposed future ownership boundaries, not an edit allowlist for the current round. Main must assign actual files and a new bounded timebox before implementation. Analytics changes, if needed, belong to its separate repository and authorization; Explorer alone cannot change its consumer pin.

## Requirement and evidence gates

| Requirement | Required evidence |
|---|---|
| RRC-01 / RRC-03 | Selected original identity resolves uniquely to preserved lookup/inventory evidence; query predicates and reporting bounds reconcile with every retained row. |
| RRC-02 | At least one supported public well's collected monthly reports link to its actual parent; manually reconcile original IDs, period, liquid volume, average/max psi and calendar-day calculation. Unsupported fields remain unavailable. |
| RRC-04 | Raw/parsed/accepted/quarantined/excluded counts reconcile with retained rows; issue counts, join totals and dispositions/reasons match; zero/missing/invalid remain distinct. |
| RRC-05 / completion E1 | New immutable dataset, dictionary and all source/output hashes validate; changed source cannot replace an old version; actual Analytics validator accepts the verified public version and rejects fixtures/incomplete provenance. |
| RRC-06 | Selected well/version, filters, details and downloads agree; empty/error/cap/unsupported-history states are distinct; desktop/mobile/keyboard and saved download bytes pass. |
| RRC-09 / RRC-10 / completion E3 | Actual load/normalize/export run and controlled failure agree across run selector, read-only nodes, node detail and log; downstream skips and unavailable evidence are truthful. No fabricated consumer acknowledgement. |

Acceptance closes only the bounded lookup/collection milestone. It does not establish statewide coverage, operating status, engineering capacity, compliance, complete project acceptance or hosted delivery.

## Decisions required before implementation

- Confirm the proposed website lookup/collection controls and narrow local adapter as the requested product expansion. The map remains read-only; the original PRD's prohibition on new execution controls must be reconciled explicitly.
- Confirm the initial bounds (one well, exact source-supported identity, 36 months, 25 candidates, 1,000 monthly rows) against actual official-source behavior. Reaching a cap must remain a visible incomplete result.
- Select one bounded public well/period and authorize that live acquisition after the independent validation review. Do not treat the present five-fix brief as live-query or feature authorization.
