# Project 1 — Texas RRC Explorer
## Expansion PRD and implementation plan

**Project:** SWD Intelligence Lab · Data and permitting-evidence foundation  
**Repository:** `thaiphi/texas-rail-sync`  
**Existing site:** https://texasrrcexplorer.lovable.app  
**Document date:** October 17, 2026  
**Revision:** v1.1 — SPE Volve repository design review incorporated October 17, 2026  
**Status:** Proposed roadmap — not authorization to implement scope-restricted features  
**Baseline:** `feature-inventory-2026-10-16.md`, `main` at `dd48857` (PR #3 merged); site and backend statuses are *as reported on October 16*, not newly retested here.

## Revision notes — external architecture review (v1.1)

**External reference:** [gabrielserrao/spe-2026-challenge](https://github.com/gabrielserrao/spe-2026-challenge), reviewed on October 17, 2026. The repository is a **Volve drilling-intelligence application**, not an RRC/SWD data source. Its multiwell correlation, typed evidence relationships, map-to-record selection, and page-linked technical document viewer are *design patterns* we may independently adapt, **not implementations we have adopted or verified live in our applications**.

**Additions to this PRD:** RRC-E10 Well Evidence Dossier and relationship index; RRC-E11 bounded depth-aligned well correlation; RRC-E12 page-aware evidence inspection; linked-selection improvements to RRC-E03; versioned display/evidence references in RRC-E06. Existing source acquisition, AOR/regulatory applicability, and immutable-data requirements stay in force. The original P0 release recovery, new ODP ingestion and consumer handoff remain higher priority than visual refinements.

**Decision:** Do **not** migrate to Neo4j, LangGraph, FastAPI or Next.js merely to copy the reference. First use a read-only, typed relationship view over existing normalized artifacts (or reviewed Supabase tables if authorization is granted). No LLM/chatbot, generic agent database-query tool, scraping or autonomous permit decisions in Project 1. The external repository is GPL-3.0 licensed and calls out an AGPL-3.0 dependency; study its ideas, but do **not copy source files** without a documented license and distribution review.

## 1. Product decision

Extend the current **single-well, source-verifiable UIC/H-10 collector** into a **bounded SWD regulatory evidence explorer**. An engineer should be able to select a well or proposed location, gather the relevant public well and wellbore evidence, identify missing records, inspect an Area of Review (AOR), and export an auditable evidence package for Project 2 (Injection Analytics).

**Do not turn Project 1 into an engineering-calculation application or an AI chatbot.** It owns acquisition, source provenance, normalization, spatial inventory, and preliminary permitting-document *readiness*. Project 2 owns hydraulic/reservoir calculations and scenario results. Project 3 is deferred.

### User story

> As an SWD engineer evaluating a proposed disposal location, I want to see the surrounding wellbores, their known casing/plugging status, related test and permit evidence, and what information remains unavailable—without confusing reported public records with engineering interpretation or permit approval.

### Definition of success

An engineer can produce a **versioned, reproducible evidence package** for one proposed location in a selected review regime, with every included fact linked to its source and every missing/ambiguous fact conspicuously marked. A package must never state that a permit is complete, approvable, or filed.

## 2. Preserve what already exists

The October 16 inventory reports:

- Exact UIC/API lookup; explicit well selection; 1–36-month H-10 collection; original UIC inventory and monthly reports.
- Source snapshots with official URL, bytes, retrieval timestamps, SHA-256 hashes, data dictionary, QC/quarantine, immutable versions, verified TAR/CSV/JSON exports, and run history.
- Six dataset tabs and a local browser handoff to Injection Analytics.
- Published site shell loads but `/api/versions` and `/api/runs` returned **503** on October 16; the hosting bridge fix was merged but not republished. Guest collection exists but was **disabled** after an unsuccessful rollout.
- GIS, multiwell collection, scheduled refresh, BHP-based analysis, permitting, and LLM functionality are not built.

**Invariants:** Never rewrite `raw/`, `artifacts/`, `runs/`, or default pin files; maintain old versions and byte-identical proof. Preserve leading zeros, original source IDs, `null` distinct from `0`, quarantined records, transformation versions, and user-visible limitations. All new public observations must originate in real acquired sources. Do not fabricate progress or confirmation.

## 3. Scope and regulatory applicability

### In scope (subject to owner approval where current repository rules prohibit it)

1. Restore the existing public demo and independently verify deployed routes.
2. Integrate five additional RRC Open Data Portal (ODP) datasets: wellbore casing, wellbore plugging, well bottom location, UIC bottomhole pressure test results, and UIC step-rate test results.
3. Build a **provenance-rich well/record crosswalk**, without guessed matches.
4. Support an **AOR workspace** initialized from an RRC GIS radius CSV export, then optional published geospatial datasets after source/access review.
5. Maintain a permit-evidence checklist and references to relevant official imaged documents; allow authorized manual attachments with clear origin labels.
6. Generate a validated evidence handoff to Project 2 without altering existing artifacts.
7. Offer a **well evidence dossier**, typed source-backed record relationships, depth-aware multiwell inspection and page-level document evidence; every visualization is an alternate view of verified records.
8. Later: bounded multiwell collection, source-version differences, and permitted scheduled updates.

### Out of scope

- RRC permit submission, legal/regulatory approval, automated sign-in to RRC systems.
- Scraping RRC Online Research Queries/EDMS in bulk through browser automation.
- Regulatory MSIP/MDIV calculations, reservoir-pressure prediction, calibrated injectivity, seismic hazard determination, or safety certification.
- Statewide unrestricted crawling, real SCADA, employer/private well data, or chatbot features.

### AOR rules must be selected, not assumed

The general RRC injection application attachments describe a **¼-mile AOR map** requirement. The **Permian Basin Disposal Well Review** applies to disposal applications in RRC Districts **7C, 8, and 8A** and adds a detailed **½-mile** review and **2-mile** well inventory. These are *not* interchangeable statewide defaults. The Permian workbook uses a **Well Template**, **AOR Template**, and **MSIP & MDIV** worksheet; the first two AOR worksheet coverage requirements are columns **A–AD within ½ mile** and **A–O within 2 miles**, per current RRC guidance. Other geographic/geologic/seismic restrictions must be separately reviewed.

The AOR feature must require a `review_regime` plus its source/date, and display the selected review rule; unknown jurisdiction means **review required**, not silently selecting Permian rules.

## 4. Source inventory and acquisition policy

| Source | Already acquired? | Proposed role | Access method |
|---|---|---|---|
| ODP UIC well location / inventory | Yes | UIC parent, permit fields, location evidence | Existing documented ODP API |
| ODP UIC H-10 injection monitoring | Yes | Monthly injection volume/pressure | Existing documented ODP API |
| ODP Wellbore Casing | No | Casing-string and well-construction evidence | Official ODP dataset/API, after metadata/field audit |
| ODP Wellbore Plugging | No | Plug-by-plug plugging evidence | Official ODP dataset/API, after metadata/field audit |
| ODP Well Bottom Location | No | Well-bottom vs surface spatial roles | Official ODP dataset/API, after metadata/field audit |
| ODP UIC Bottom Hole Pressure Test Results | No | BHP test inventory and supplied measured values, when present | Official ODP dataset/API; retain test context |
| ODP UIC Step Rate Test Results | No | Step-rate-test inventory and supplied measurements, when present | Official ODP dataset/API; retain test context |
| RRC GIS Viewer | No | Initial surrounding-well inventory | **User-provided GIS radius CSV export** first |
| Injection/storage permits and imaged records | No | W-14, H-1/H-1A, H-5, logs, supporting records | Deep links/manual capture with explicit provenance; no mass query scraping |
| Current RRC rules/guidance | No | Source links and checklist versions | Official published guidance and manual review |
| TexNet, USGS, other geologic sources | No | Possible later separate seismic/geologic evidence | Explicit external-source authorization; not described as RRC records |

**Source-specific guardrails:** The RRC GIS Viewer documents a 2.5-mile maximum export radius and a 1,000-well export cap. An export that reaches the limit is **potentially truncated**, never automatically declared complete. The GIS export may contain multiple rows per well because of completions. RRC Online Research Queries expressly warns that automated bulk retrieval can terminate sessions; do not treat its interactive site as a bulk API. Respect documented portal limits, pagination, retries, cache policy, and rate/access conditions; do not evade protections.

**Initial existing ODP endpoints** (verified against the repository source, not guesses for new datasets):

- UIC inventory: `https://data.texas.gov/resource/givw-z9t4.json`
- H-10 monthly: `https://data.texas.gov/resource/qq2j-f2zm.json`

For the five new datasets, discover the **official dataset identifiers and complete metadata schema before coding**. Record the actual Socrata view ID, original field names, typed units, update frequency, row coverage, and license/access notes. Do not infer that every test dataset contains a pressure series or a PDF report.

## 5. Feature backlog and acceptance criteria

### RRC-E00 — Production baseline recovery · P0 / release blocker

- Republish only the already-reviewed hosting bridge fix with owner authorization.
- From the actual published origin, verify `/api/versions`, `/api/runs`, dataset load, SHA verification, TAR downloads, and source evidence. Track actual HTTP outcomes.
- Verify guest collection only through an independent, explicit rollout plan and actual hosted acceptance; do not reactivate it automatically.

**Accept when:** public routes work on the published site, an existing dataset can be opened and downloaded intact, prior pins remain unchanged, and release evidence records test time, deployed version, and exact results.

### RRC-E01 — Five new ODP connectors · P0

- One connector per official dataset with schema discovery, bounded query/pagination, raw byte preservation, retry/backoff according to access terms, normalization and quarantine.
- Casing and plugging use **wellbore identity**; pressure/step-rate tests use UIC + test identity where provided. Do not collapse test rows by well only.
- Retain date, test method/type, measurement basis (WHP/BHP; gauge/depth if known), units, test outcome and document pointers *only where the source provides them*.

**Accept when:** fixtures and one bounded public proof per dataset reconcile raw/parsed/accepted/quarantined counts; missing values remain missing; duplicates and conflicting parent matches cannot silently merge; every displayed new field has source lineage. No original normalized contract is broken.

### RRC-E02 — Wellbore identity and completeness · P0

- Explicitly model `uic_id`, `source_api_id`, normalized/API-display identity, source record key, completion identity, operator/lease/well, and evidence for any crosswalk.
- API identification can link **wellbore** records after verified source linkage, but must **not** substitute for UIC when joining H-10 monthly records or act as an unchecked universal join key.
- Mark ambiguous, duplicate, missing, historical, and conflicting identities; expose an evidence/conflict inspector.

**Accept when:** leading zeros survive, mismatched source IDs do not falsely link, one-to-many completions do not create duplicate wells in AOR counts, and a user can inspect why a record linked or was quarantined.

### RRC-E03 — AOR map and offset-well inventory · P0, **requires explicit GIS authorization**

- Proposed well defined by user-specified coordinates, datum/CRS, location role and depth/interval; record all input assertions. Never silently choose surface vs bottomhole position.
- Import a manually exported RRC GIS CSV; retain original file hash; verify columns, geometry provenance, selected radius, source date, deduplication and coverage warnings.
- Display well points, proposed-well marker, selected ¼-mile or Permian ½-mile and 2-mile boundaries, distance-ordered offset well table, and suspect/missing coordinates. Compute radii geodetically with documented test cases.
- **Cross-highlight a shared selected well** across the AOR map, offset inventory, Well Evidence Dossier and source inspector using a stable verified identity. No fuzzy well-name matching as the UI selection contract; the map must remain usable without other panels and provide accessible tabular equivalents.
- Present every well penetrating or potentially relevant to the AOR, **not only UIC wells**. Separately tag surface and bottom locations, and uncertainties in wellbore-path intersections.

**Accept when:** tests exercise boundary wells, coordinate/CRS mistakes, duplicate completions, unknown trajectory, 1,000-row export cap, missing coordinates and truncated GIS exports. Any incomplete inventory is visibly **not AOR-complete**. No unsupported claim of subsurface confinement.

### RRC-E04 — Casing, cement, plugging and orphan evidence · P0/P1

- Well detail combines casing strings, relevant available cementing/plugging records, well status and depth interval, each from original sources.
- Surface wellbore-isolation flags such as **missing plugging record**, **cement evidence unavailable**, **orphan status needs verification**; do not auto-classify regulatory compliance without review.
- Label if an unresolved record lies within ½ mile versus from ½ to 2 miles under the Permian methodology; show the official consequence as a *potential review consideration*, not an automatic permit calculation.

**Accept when:** every flag identifies the source and precise unresolved input; records with no evidence are neither treated as properly plugged nor as proven defective; user can export the unresolved-well list.

### RRC-E05 — Permit evidence navigator and readiness checklist · P0/P1

- Organize checklist by selected jurisdiction and source version. For Permian: Well Template source references; ½-mile/2-mile AOR evidence; area map; representative 2-mile-plus geological cross section; well logs, pressure/step-rate reports and supplemental explanations.
- Provide a source-document inspector with optional source **page/table/figure anchors**, where obtainable from authorized records; retain original bytes and distinguish any derived text/OCR from official source content. Missing original pages must not be represented by generated pages.
- Attach verified official links and, with approval, manually supplied PDFs/files. File status values: `verified_public`, `user_supplied_unverified`, `derived_with_method`, `unavailable`, `not_applicable`, `needs_engineer_review`.
- Distinguish *required supporting document* from *data available online* and *engineer interpretation pending*.

**Accept when:** checklist exports contain exact missing items and source/page references when known; unavailable fields remain `unavailable` (never estimated), and the workflow cannot label a permit ready for filing or guaranteed approvable.

### RRC-E06 — Evidence-package contract and Analytics handoff · P0/P1

- Preserve existing v1 TAR and consumer behavior. Propose an **additive, independently reviewed v2 package** only if new evidence exceeds v1 contracts; no silent schema replacement.
- Bundle source bytes, manifests, per-record source references, AOR parameters/quality, record crosswalk, candidate test evidence, inspection flags, data dictionary, and a machine-readable list of missing prerequisites.
- For any approved additive evidence schema, include stable keys for dossier records, relationships, selected well(s), document-page anchors, and depth markers. A presentation-only layout must never change authoritative source rows or the frozen version ID.
- Negotiate and independently test the consumer agreement with Project 2: origin allowlist, receiver validation, explicit user consent, intact SHA, schema version and limits. A failed handoff must leave the receiver unchanged.

**Accept when:** an old v1 package opens unchanged, a new package fails closed on tampering, and hosted + local transfer each pass actual sender/receiver browser acceptance after explicit configuration.

### RRC-E07 — Bounded multiwell acquisition · P1, requires new scope approval

- Allow a small, explicit selection of UICs or an owner-approved bounding area; never silently initiate a statewide scan.
- Per-well progress and individual completeness; dedupe repeated source snapshots without changing original hashes; stop on documented limits.

**Accept when:** a failed individual well cannot turn the group into a falsely complete dataset; all source counts and collection manifests reconcile.

### RRC-E08 — Version comparison · P1

- Compare two immutable versions of the same well/area and source schema: new/changed/missing rows, coverage changes, QC changes, and source snapshots.

**Accept when:** no version is mutated, filters never modify downloads, and comparison keys include native source identity + date/test identity rather than row position alone.

### RRC-E09 — Permitted incremental updates · P2

- Schedule only approved ODP or published bulk-download retrieval paths; maintain update watermark, full-refresh safety checks and changed-row verification. Never schedule the interactive research query system.

**Accept when:** repeated refresh is idempotent, detectable upstream schema breaks fail closed, and no stale version silently overwrites history.

### RRC-E10 — Source-backed Well Evidence Dossier and relationship index · P1

**Purpose.** Give a permitting engineer one bounded entry point for a well's related public evidence, instead of manually navigating disconnected RRC tables. This implements the *concept* of the Volve project's well-centered data model without adopting a new database by default.

**Build.**

- Display a selected verified UIC / wellbore's permit information, casing, plugging, BHP/SRT tests, source-document links, injection history and associated AOR offsets in organized sections. Show collection scope and counts, dates, record quality and missing evidence.
- Model typed, source-keyed associations such as `well -> wellbore`, `wellbore -> casing/plugging`, `UIC -> injection_report/test`, `permit -> document`, and `record -> source_snapshot`. Relationships require a documented key, source reference and deterministic join rule; a nearby spatial relationship is not proof of hydraulic communication.
- Support a small, optional **relationship view** that can expand one or two linked levels, not an uncapped network visualization. The ordinary dossier/table view must remain fully useful without graph rendering.
- When source identifiers conflict, show all candidates with a `needs_review` or `ambiguous` state; never choose a single parent simply because names are similar. Counts and labels distinguish uncollected, quarantined and observed-zero evidence.

**Acceptance:** A well chosen from map, table or bookmarked version opens the identical version-pinned dossier. Every dossier statement links back to a native record/source hash; ambiguity is visible and not auto-resolved. Graph/list counts reconcile, bounded views are responsive, and existing UIC/H-10 exports are byte-for-byte unchanged.

### RRC-E11 — Depth-aligned offset-well correlation viewer · P1, **conditional on real depth evidence**

**Purpose.** Adapt the multiwell correlation *interaction* (shared depth axis, selectable tracks) for SWD AOR engineering context; do not misrepresent an illustration as a verified geological cross section.

**Build.**

- Allow a bounded set of explicitly selected wells from a verified AOR inventory. Align available surface/bottom locations, wellbore trajectories, casing shoes, completion/injection intervals and **source-attested** formation markers by MD or TVD, with unit/datum labels on every track.
- Distinguish **a formation-top observation (point)** from a **known interval (top + actual documented bottom)**. Never fabricate the end of a final formation, infer missing layers from the next well, or silently transform MD into TVD without an adequate trajectory.
- Mark incomplete/unknown depth, no public log, missing formation pick, conflicting datum and crosswell correlation uncertainty directly on screen and in exports. Overlay BHP/SRT evidence only where a valid test depth and pressure basis are known; these are not automatically continuous pore-pressure or fracture-gradient logs.
- This viewer may assist review but must not be labelled a regulator-ready geologic cross section without an engineer's interpretation and independent underlying log evidence.

**Acceptance:** At least two bounded verified well cases display shared-scale depth tracks with explicit MD/TVD and unit provenance; missing depth/formation fields yield gaps, not extrapolated colors; coordinate and datum disagreements block misleading crosswell alignment. A data table provides an accessible alternative, and all evidence pointers persist in a new versioned export only if schema approval is granted.

### RRC-E12 — Page-level source and document inspection · P1

**Purpose.** Adapt the Volve report-page evidence navigation without introducing a chatbot or uncontrolled RRC scraping.

**Build.**

- For permitted public files or explicitly supplied attachments, index `document_id`, original URL/attachment provenance, immutable file hash, retrieval/import timestamp, document type, well/permit linkage, and page anchors when they truly exist.
- Add a page/table/figure evidence inspector that can jump from a permit, test or plugging claim to its **actual original PDF page** or a read-only link; optional extracted text is marked derived with method/version and original-page mapping. Bad/OCR-ambiguous extractions remain unverified.
- Do not fetch RRC research-query/EDMS pages with automated bulk browser sessions. Do not execute embedded HTML or PDF scripts or expose private uploaded files as public RRC records. Implement file-size, MIME/type and access-policy checks.

**Acceptance:** Every page reference opens its matching original verified document/page or displays a truthful unavailable status. Changed files/hashes invalidate derived indexes. Unsupported scans, unrelated documents and broken URLs do not generate invented evidence; old source ledger/downloads remain unchanged.

## 6. Output contract proposal (design, not deployed)

Store native source files **unchanged** and derive immutable normalized views:

```text
verified-evidence-package/
  manifest.json                   # schema, SHA-256, collection scope, source snapshots
  inventory.csv                   # existing v1 content retained
  injection_monthly.csv           # existing v1 content retained
  normalized.json                 # v1-compatible unless explicitly versioned
  quality_report.json
  data_dictionary.json
  sources/...                     # raw official bytes and acquisition sidecars
  evidence/                      # v2-only, if approved
    wellbore_crosswalk.json
    casing.json
    plugging.json
    well_bottoms.json
    bhp_tests.json
    step_rate_tests.json
    aor.json
    permits_and_documents.json
    readiness.json
    dossier.json                    # proposed, versioned well-evidence projection
    evidence_relations.json         # typed, verified record/source relationships
    document_pages.json             # optional original document/page anchors
    well_depth_evidence.json        # formation markers and casing/interval depths; no invented bottoms
```

These `evidence/*` items are **illustrative and additive**, not approved file names or a migration instruction. Keep source snapshots authoritative; linked graphs, dossiers and correlated tracks are disposable read-only projections over verified identifiers.

Per evidence row, require: `source_dataset`, `source_record_id`, `retrieved_at`, `source_url`, `snapshot_sha256`, `raw_field_names`, `normalized_values`, `units`, `measurement_basis`, `identity_confidence`/join status, and `qc_flags`. If a source lacks any attribute, retain `null` and a reason, rather than inventing a value. An AOR object also needs review regime, center, CRS/datum, depth/interval role, exact radius, calculation method, inventory source/limit, and `complete|incomplete|unknown` coverage status.

The **consumer** must not mistake inventory `permit_max_pressure` for available pressure margin, nor H-10 reported psi for BHP, nor an absent monthly row for zero injection.

## 7. Dependencies and repository governance

- Project 2 is a **different repository** and owns engineering calculations, case models and reports. Project 1 can validate and transmit evidence, but does not compute injectivity, pressure buildup, MSIP or MDIV.
- Repository `AGENTS.md` previously prohibits GIS, statewide refresh and other expansion absent an authorized task. **This document is a proposal; implementation requires owner approval and any required specification/ADR updates.**
- Each implementation task needs a bounded brief (the repo calls for seven-field delegation briefs), worktree branch, tests, independent review and PR. Limit to **two active subagents**; workers do not commit. Old artifact pins move only via separate reviewed action.
- Do not activate hosted guest collection merely to enable a new feature; first resolve its existing fail-safe, budget and rollout gates.

## 8. Phasing and dependencies

| Phase | Project 1 deliverable | Blocking dependency |
|---|---|---|
| 0 — release repair | Re-published existing public Explorer, verified API and download acceptance | Owner-controlled Lovable publish |
| 1 — source expansion | Five new ODP dataset adapters, QC, evidence and crosswalk | Official field-schema inventory and source terms |
| 2 — first AOR | Manual RRC GIS CSV import, distance-ordered well inventory, clear incomplete-state handling | Explicit GIS approval; CRS and export-limit testing |
| 3 — permit evidence | Wellbore flags, links/manual attachments, jurisdiction-specific checklist, page-level viewer and Well Evidence Dossier | Regime review, source access policy and E02 crosswalk |
| 4 — integrated release | Additive evidence export + hosted verified Analytics handoff; bounded depth-correlation UI once real depth evidence exists | Project 2 receiver/security contract, source-attested MD/TVD and engineer-reviewed depth basis |
| 5 — later optimization | Multiwell, diffs, permitted periodic update | Usage/coverage/cost review and new approval |

## 9. Required verification and done criteria

Before each release:

- Existing protected artifact pins, raw bytes, versions and baseline checks unchanged unless a separately approved migration explicitly requires otherwise.
- Acquisition unit/integration tests cover success, empty, malformed, missing, duplicate, pagination limit, partial failure, network timeout and source schema drift.
- Spatial tests cover actual geodesic distances, CRS, boundary inclusion, 2.5-mile/1,000-well GIS export constraints, missing/unknown well locations and completion deduplication.
- Dossier and linked-selection tests verify that map/table/correlation views point to exactly the same versioned well; typed relations have native keys and do not infer parents or hydraulic connectivity.
- Correlation tests cover MD versus TVD, missing surveys, formation-top-only evidence, malformed intervals, unit mismatch and empty tracks; no fabricated depths or continuous pressure logs.
- Document viewer tests cover immutable source/page IDs, tampering, unavailable pages, untrusted attachments and derived-text labelling; public and user-supplied evidence never silently merge.
- Full lineage inspection shows real retrieval timestamps, source URL and hashes. All unsupported engineering conclusions blocked.
- Browser acceptance checks local, published, offline/saved and receiver handoff behavior. Clearly record *tested* versus *unverified* states.
- Accessibility check for map/table keyboard navigation, contrast and text alternative to graphical risk flags.

**Project 1 is done for this phase** when an engineer can reliably export a verifiable, non-misleading **well- and area-scoped regulatory evidence package**, with explicit open evidence gaps, and Project 2 can accept it without weakening either app's provenance rules.

## 10. Official reference links (verified October 17, 2026)

1. RRC Injection-Storage Resources — official seven UIC ODP datasets and imaged-record links: https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/
2. RRC Permian Basin Disposal Well Review — applicability, workbook, AOR and supporting documents: https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/pb-disposal-review/
3. RRC Application Attachments — general AOR requirements: https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/application-attachments/
4. RRC GIS Download Wells help — 2.5-mile/1,000-well export restrictions: https://gis.rrc.texas.gov/gisviewer/GISViewer/docs/WebHelp/Download_Wells.htm
5. RRC Research Queries — automated retrieval warning: https://www.rrc.texas.gov/resource-center/research/research-queries/
6. RRC Injection-Disposal Permit Procedures — Rule 9/46 review stages: https://rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/

**External implementation concepts reviewed (not incorporated as code):**

- [Volve multiwell correlation endpoint](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/src/volve/api/routes/correlation.py), [correlation canvas](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/ui/components/correlation/CorrelationCanvas.tsx), [formation track](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/ui/components/correlation/tracks/FormationTrack.tsx), [map view](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/ui/components/map/MapView.tsx).
- [Graph/schema and relationships](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/src/volve/graph/schema_init.py), [page-linked RAG chunks](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/src/volve/ingestion/parsers/rag_chunks.py), [source license](https://github.com/gabrielserrao/spe-2026-challenge/blob/main/LICENSE). None is an official Texas RRC source; the concepts are to be independently designed, not copied.

**Baseline reference:** User-provided `feature-inventory-2026-10-16.md` (not an externally verified live test). Current project governing documents and actual code supersede this proposal where they conflict.
