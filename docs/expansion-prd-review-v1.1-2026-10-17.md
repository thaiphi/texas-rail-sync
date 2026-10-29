# Review of PRD revision v1.1 (`docs/expansion-prd-2026-10-17.md`) — delta only

Reviewer: Fable 5.1 (advisor/reviewer, read-only). Date: October 17, 2026 (evening CDT).
Inputs: `diff -u C:/Users/thai.phi/Downloads/project-1-texas-rrc-explorer-expansion-prd.md docs/expansion-prd-2026-10-17.md` (v1.0 → v1.1; v1.0 21,753 bytes 10:20, v1.1 31,779 bytes 20:01, both untracked); my v1.0 review `prd-review-fable.md` (same scratchpad); `main` code via `git show`; `phi-analytics/docs/swd-intelligence-lab/{01,03,05,06}-*.md`; GitHub raw files and API for `gabrielserrao/spe-2026-challenge`; RRC "Well Bore Database" layout guide (`wba091_well-bore-database.pdf`, text extracted locally from the fetched PDF); PyMuPDF licence page. Labels: **CONFIRMED** / **UNVERIFIED** / **ASSUMPTION**. No Git state changed; no RRC data rows pulled (one PDF documentation download and GitHub documentation reads only).

---

## 1. What v1.1 changes (CONFIRMED from the diff)

1. Header: `**Revision:** v1.1 — SPE Volve repository design review incorporated October 17, 2026`.
2. New section "Revision notes — external architecture review (v1.1)": names `gabrielserrao/spe-2026-challenge` as a Volve drilling-intelligence app whose "multiwell correlation, typed evidence relationships, map-to-record selection, and page-linked technical document viewer are design patterns we may independently adapt"; decision "Do not migrate to Neo4j, LangGraph, FastAPI or Next.js"; "No LLM/chatbot, generic agent database-query tool, scraping or autonomous permit decisions"; "The external repository is GPL-3.0 licensed and calls out an AGPL-3.0 dependency; study its ideas, but do not copy source files without a documented license and distribution review"; and "release recovery, new ODP ingestion and consumer handoff remain higher priority than visual refinements".
3. §3 In scope: new item 7 (dossier, typed relationships, depth-aware multiwell inspection, page-level document evidence; "every visualization is an alternate view of verified records"); old item 7 renumbered 8.
4. E03: new bullet — cross-highlight a shared selected well across map, inventory, dossier and source inspector "using a stable verified identity"; no fuzzy name matching; map usable alone; accessible tabular equivalents.
5. E05: new bullet — source-document inspector with optional page/table/figure anchors "where obtainable from authorized records"; derived text/OCR distinguished; "Missing original pages must not be represented by generated pages".
6. E06: new bullet — stable keys for dossier records, relationships, selected well(s), document-page anchors and depth markers; "A presentation-only layout must never change authoritative source rows or the frozen version ID".
7. New **RRC-E10** (P1) Well Evidence Dossier + typed relationship index; **RRC-E11** (P1, "conditional on real depth evidence") depth-aligned offset-well correlation viewer; **RRC-E12** (P1) page-level source/document inspection — full text in the diff hunk `@@ -162,6 +175,44 @@`.
8. §6 tree: four illustrative additive files `dossier.json`, `evidence_relations.json`, `document_pages.json`, `well_depth_evidence.json`, stated as "illustrative and additive, not approved file names".
9. §8 phase table: Phase 3 now includes "page-level viewer and Well Evidence Dossier" with dependency "E02 crosswalk"; Phase 4 now includes "bounded depth-correlation UI once real depth evidence exists" with dependency "source-attested MD/TVD and engineer-reviewed depth basis".
10. §9 verification: three new bullets (dossier/linked-selection tests; correlation tests incl. MD vs TVD, missing surveys, formation-top-only evidence; document-viewer tests incl. tampering, untrusted attachments, derived-text labelling).
11. §10: six links into the external repository's source files (`correlation.py`, `CorrelationCanvas.tsx`, `FormationTrack.tsx`, `MapView.tsx`, `schema_init.py`, `rag_chunks.py`) plus its `LICENSE`, labelled "reviewed (not incorporated as code)".

Unchanged from v1.0: everything I reviewed earlier (E00–E09 text, source table, AOR rules, out-of-scope list, §7 governance). My v1.0 findings therefore stand; this document covers only the delta.

---

## 2. Fit with this repository's scope and the architecture document

Reference: `phi-analytics/docs/swd-intelligence-lab/05-architecture-integration.md` §1 (ownership table) and §4 (corpus contract); `03-ai-permitting-assistant.md` §5–6; `01-swd-injection-analytics.md` SWD-10; `06-delivery-roadmap.md` §7.

| Item | Fit with Explorer scope (AGENTS.md "bounded official UIC/H-10 acquisition, normalization, source/identity/quality checks, versioned exports and browser inspection") | Overlap with another repository |
|---|---|---|
| **E10 dossier + relationship index** | **Fits**, provided it is what the PRD says: a read-only projection over verified records of one version. The Records tab already has a "selected-well panel with identity, permit interval/limits and W-14/date" (feature inventory §3.3), so a dossier is a re-organisation plus new sections once E01/E02 exist. The "typed, source-keyed associations" are exactly the output ADR 004 (identity) must define. | None. Caveat: the relation `permit -> document` has no source in this repository (no permit documents are acquired; ODP test datasets carry no document pointers — v1.0 review §5.3). |
| **E11 depth-aligned multiwell correlation** | **Partly out of scope.** A *single-well depth ladder* of reported depths (casing shoes, TOC, plugs, perfs, test depth, permitted interval, packer) is browser inspection of acquired records and fits. *Multiwell correlation with formation markers, MD/TVD alignment and BHP/SRT overlays* is engineering interpretation. | **Analytics**: `01-swd-injection-analytics.md` line 133 "Extended wellbore model | SWD-10/P1 geometry, depth, fluids, temperature"; line 72 "Expose density, depth/datum, geometry ... pressure basis". **Roadmap** §7: "layering/relative permeability, transient aquifer/pressure models ... geomechanics/seismicity models ... need separate scopes". **Permitting**: the Permian "2-Mile+ Cross Section" is a permit supporting document (PB review page, v1.0 review §5.9); the PRD itself says the viewer "must not be labelled a regulator-ready geologic cross section". |
| **E12 page-level document inspection** | **Narrow slice fits; the rest does not.** The Explorer already records page anchors for its preserved official manual: `src/artifact.mjs` line 122 dictionary `units_source:{url, pdf_pages:[18,41,42]}` and SOURCE_PROOF.md "printed page II.35 (PDF page 42)". Exposing those anchors as links from the Sources tab is inspection of preserved bytes. Indexing, text extraction, OCR and a general "page/table/figure evidence inspector" are not. | **ai-swd-permitting** owns "source viewer" (`05-architecture-integration.md` §1 row 4), AI-02 "PDF/HTML extraction/retrieval — Known page/heading survives" and AI-04 "Citation/source viewer — Correct official source, page/heading and excerpt resolve" (`03-ai-permitting-assistant.md` §6 table), and the corpus contract "Chunks reference source-version ID plus PDF page or HTML heading/section and excerpt" (`05-architecture-integration.md` §4). E12's "page-linked RAG chunks" reference (PRD §10) is literally the Permitting pipeline. |
| E03 cross-highlight | Fits (UI). | None. Depends on ADR 004: offset wells in an AOR have API numbers and no UIC, so the "stable verified identity" cannot be UIC-only. |
| E05 page anchors bullet | Same analysis as E12; and E05 itself was flagged in v1.0 as belonging to Permitting (v1.0 review §3.1, Decision 11). | Permitting. |
| E06 stable keys bullet | Fits for record/relationship keys. "Selected well(s)" is UI state and should not be in an evidence package (the PRD's own next sentence says presentation must not alter authoritative rows). | Analytics receiver must tolerate the extra files (v1.0 review §3.1 E06). |

Conclusion on fit: E10 belongs here and is best understood as the user-facing half of the E02/ADR 004 identity work. E11 should be split; its multiwell/formation half is Analytics or engineer territory. E12 should be cut to "anchors for documents this app already preserves or the user supplies", with extraction/OCR and any permit-document corpus left to Permitting.

---

## 3. Evidence availability for E10–E12 (from the datasets inspected in the v1.0 review)

### 3.1 Depth and location fields that actually exist (CONFIRMED from `data.texas.gov/api/views/<id>.json`, v1.0 review §5.3)

| Source | Depth / location evidence | What it is not |
|---|---|---|
| Inventory `givw-z9t4` | `top_inj_zone`, `bot_inj_zone`, `prod_casing_pkr_depth` (number); `latitude_nad83`, `longitude_nad83` | No datum/elevation, no TVD, no formation names |
| H-10 `qq2j-f2zm` | `toz`, `boz` (number; top/bottom of zone as reported) | No datum |
| Casing `u9m4-xnh6` | `csg_depth`, `toc`, `multi_stg_depth`, `hole_size`, `csg_size`, `cmt_sacks`, `total_depth_g1w2`, `depth_reference`, `depth_reference_code` (text), `completion_date` | **`depth_reference_code` meaning undocumented** (0 column descriptions); no formation tops; no trajectory |
| Plugging `wfzn-9fje` | `plug_top_depth`, `plug_bottom_depth`, `plug_cmt_sacks`, `total_depth_w3`, `depth_reference`, `depth_reference_code`, `w3_date` | same |
| Well Bottom Location `uumf-5r4y` | `api`, `gis_lat27/long27`, `gis_lat83/long83` | **No depth at all**; a point, not a trajectory |
| BHP `qxfy-wcfs` | `test_depth_ft`, `bhp_psia`, `gradient_psi_ft`, `tested_formation` (text) | One value per report; `tested_formation` is a name, not a top depth |
| SRT `h54t-xnbi` | `top_perf_ft`, `bottom_perf_ft`, `formation_tested` (text), ISIP/frac pressure/gradient summaries | Summary values; no series |

**Not present in any of the seven ODP datasets**: formation tops (name + depth lists), directional surveys / trajectories, TVD, kelly-bushing or ground-level elevation, log curves, document pointers.

### 3.2 Other authorized RRC sources checked

- **RRC Well Bore Database bulk file** (the "Full Wellbore" set on the Data Sets page; weekly; EBCDIC and ASCII; free) — layout guide `https://rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf` (91 pages; text extracted locally). CONFIRMED: it defines a **"FORMATION DATA SEGMENT", segment name `WBFORM` (recurring), tape record ID 09**, with `WB-FORMATION-CNTR` PIC 9(03), `WB-FORMATION-NAME` PIC X(32) and `WB-FORMATION-DEPTH` PIC 9(05), described as "DEPTH OF FORMATION IN WHICH WELL IS COMPLETED" (guide pages 2-27/2-28). It also carries `WB-ELEVATION` PIC 9(04) with `WB-ELEVATION-CODE` values GL/DF/KB/RT/GR (page 2-13). For surveys it carries only flags: `WB-DIR-SURVEY` "INDICATES WHETHER OR NOT A DIRECTIONAL SURVEY HAS BEEN FILED" and `WB-W-12` (inclination report filed Y/N). The strings "TVD", "DEVIAT", "TRUE VERT" do not occur. The physical format is an IBM mainframe tape layout ("1600 BPI, Channel Phase Encoded, IBM Standard Labels", page 1-2); the ASCII variant's exact layout UNVERIFIED.
  - Implication: the only structured, authorized RRC source of "formation markers" I found is a *completed-formation name + one depth per completion line*, not a formation-tops log; and it is a statewide bulk file (RRC-08 territory, mainframe record parsing).
- **Directional Survey Applications** bulk set: "PDF images, nightly" (Data Sets page, v1.0 review §5.7) — images, not parsed trajectories.
- **Public ArcGIS MapServer** `rrc_public/RRC_Public_Viewer_Srvs` has layers `8 Well Logs` and `9 Horiz/Dir Surface Locations` (v1.0 review §5.8) — attribute contents UNVERIFIED; terms UNVERIFIED.
- **Imaged records (EDMS / Research Queries)**: automated retrieval is warned against (v1.0 review §5.6); "Imaged Completion Files" exist as nightly bulk zips (PDF/TIFF) — statewide bulk, anonymous download UNVERIFIED.

### 3.3 Verdicts

- **E10**: buildable once E01/E02 exist. Relations with real keys: `inventory_row -> h10_row` (exact `uic_no` string; exists today), `inventory_row -> bhp/srt report` (`uic_no` + `report_id`/`tracking_no`), `inventory_row -> casing/plugging rows` (via the inventory row's own `api_no`; ADR 004), `record -> source_snapshot` (exists today as `source_snapshot_id`/hashes). Relations with **no source** in this repo: `permit -> document`, anything to an AOR offset until E03.
- **E11 as specified is not buildable from authorized sources available to this repository.** It requires "source-attested formation markers", MD/TVD and trajectories; ODP has none, and the only structured RRC candidate is the bulk tape file's completed-formation depth. A **single-well depth ladder** (reported depths with `depth_reference_code` shown verbatim and labelled "reference code undocumented") is buildable after Phases 2–3 of the v1.0 plan. The PRD's own guard ("conditional on real depth evidence") should resolve to: multiwell/formation correlation **deferred out of Project 1**; single-well ladder in.
- **E12**: page anchors are obtainable **only** for (a) documents the app already preserves (`uic-manual.pdf` — anchors already in the dictionary; `uic-query-help.html`, `rrc-resources.html` — HTML, heading anchors possible), (b) any future official form-instruction PDFs the owner adds as fixed documentation targets (G-1/W-2, W-3, H-5), and (c) user-supplied attachments. No per-well document pointers exist in any ODP dataset, so "jump from a permit, test or plugging claim to its actual original PDF page" cannot be populated without EDMS access. Browser-native `#page=N` on a PDF URL is a dependency-free way to open a page (Adobe PDF Open Parameters convention; browser support is common but UNVERIFIED per browser and not guaranteed for `blob:` URLs, which the Sources tab currently uses — `public/app.js` line 221 `blobType`). Text extraction/OCR is out: dependency-free core, and it is Permitting's pipeline.

---

## 4. Gaps and conflicts introduced by v1.1

1. **Priority vs phase placement.** The revision note says visual refinements rank below release recovery, ingestion and handoff, yet §8 inserts the dossier and page viewer into Phase 3 and the correlation UI into Phase 4 ("integrated release"). That lengthens the critical path to the integrated release with P1 items. Either move them to a post-release phase or state that Phase 4 can ship without them.
2. **E11's condition is undefined.** "Conditional on real depth evidence" and "once real depth evidence exists" never say which source would satisfy it. From §3 above, none of the five datasets does; the PRD should say so and name the bulk Well Bore file as the only candidate (with its RRC-08 implications) or drop formation markers.
3. **E12 duplicates Permitting's contract** (AI-02/AI-04; corpus chunks with PDF page anchors) and adds "optional extracted text ... OCR", which the Explorer cannot do without dependencies and which is the Permitting repo's job. The v1.0 finding on E05 ownership (Decision 11) now also covers E12-full.
4. **E10 duplicates E02.** Both model identities and crosswalks; E10 adds presentation. Two items for one contract invites two briefs editing the same files. Merge (see §5).
5. **E03 "stable verified identity"** is undefined for non-UIC offset wells; it must be the wellbore/API domain from ADR 004, with its stated format caveat (API format in the new datasets UNVERIFIED).
6. **E06 "selected well(s)" as stable keys** puts UI state into the evidence package. Keep selection out; keep record/relationship/anchor keys in.
7. **§10 links to GPL source files.** Any implementation brief that forwards these links exposes implementers to the code. The PRD's "do not copy source files" is correct but the links sit in the same document the briefs will quote.
8. **"reviewed Supabase tables if authorization is granted"** (revision note). A relationship index belongs in the versioned artifact (JSON derived at export), not in a hosted table: the Explorer's evidence model is file-based and hash-pinned (SPEC.md "Output and consumer"), and the Free-plan guest DB budget is 50 MB (v1.0 review §3.3). Nothing in v1.1 needs a database.
9. **`well_depth_evidence.json` "formation markers"** — the file name and comment promise evidence the sources do not provide (§3.1). Rename to what exists (reported depths) or mark "not populated from ODP".
10. **Verification bullets** for correlation ("MD versus TVD, missing surveys") test behaviours that no source can exercise with real data; they would be fixture-only tests of a feature with no public evidence path — the kind of thing the repository's fixture/public separation exists to flag (SPEC.md "October 10 integrity repair contract").
11. **GitHub licence detection.** CONFIRMED: `api.github.com/repos/gabrielserrao/spe-2026-challenge/license` returns `spdx_id: "NOASSERTION"` ("Other"); the `LICENSE` file is 1,129 bytes and is the GPL "how to apply" notice ("either version 3 of the License, or (at your option) any later version", "Copyright (C) 2026 Gabriel Serrao Seabra"), not the full licence text. ASSUMPTION: that is why GitHub cannot classify it. The README (line 15 badge, line 723 "Licensed under the GNU General Public License v3.0") is unambiguous. The PRD's "GPL-3.0" statement is therefore CONFIRMED in substance, with the nuance "GPL-3.0-or-later per the notice; not machine-detected".
12. **AGPL dependency claim.** CONFIRMED: README line 725 "This project uses PyMuPDF (AGPL-3.0) for PDF processing. When distributing combined works, AGPL-3.0 terms apply."; `pyproject.toml` line 16 `pymupdf>=1.27.1`; PyMuPDF's own page: "available under both, open-source AGPL and commercial license agreements", Artifex as commercial licensing agent. No `NOTICE`/`THIRD_PARTY_LICENSES` file (404). Other dependencies CONFIRMED from `pyproject.toml`: `langchain`, `langgraph`, `langchain-neo4j`, `neo4j`, `fastapi`, `minio`. The reference app's core (LLM agent, Neo4j graph, RAG) is exactly what SPEC.md "Deliberate cuts" excludes ("No ... LLM"); the PRD already says not to adopt it.
13. **This repository has no LICENSE file** (CONFIRMED: `git ls-tree -r main` has no LICENSE/COPYING/NOTICE; `package.json` has `"private": true` and no `license` field). Not a conflict with v1.1, but any "licence and distribution review" the PRD promises has no local baseline to review against.

---

## 5. Challenge and alternatives

1. **Merge E10 into the identity work and make it the deliverable of ADR 004.** ADR 004 defines two identity domains (UIC; wellbore/API) and a fixed set of typed relations with a deterministic key and a basis label; the export writes `evidence_relations.json` (or whatever name is approved) from those rules; the dossier is a browser view over one version that groups records by those relations. One brief, one owner, one test suite; no graph library, no database. The optional "relationship view" is a table of edges first; a drawn graph is a later presentation decision.
2. **Split E11.** E11a "single-well reported-depth ladder": a vertical list/SVG of the well's own reported depths from inventory, casing, plugging, BHP, SRT and H-10, each with source, units (ft as reported) and `depth_reference_code` shown verbatim with "meaning undocumented in ODP metadata"; no datum conversion, no TVD, no interpolation. Feasible after Phases 2–3. E11b "multiwell correlation with formation markers": out of Project 1; if the owner wants it anywhere, it is an Analytics scope with an engineer's picks as *user-supplied, unverified* inputs, or a separate RRC-08-class task to parse the bulk Well Bore `WBFORM` segment.
3. **Cut E12 to "E12-lite: anchors for preserved and supplied documents."** Expose the existing `pdf_pages` anchors and HTML heading anchors in the Sources tab; record page anchors for any new fixed documentation targets at acquisition time (as the dictionary does today); for user attachments (if E05-lite survives), store the user's own page claim as `user_supplied_unverified`. No extraction, no OCR, no index of documents the app has not preserved. Everything else goes to `ai-swd-permitting`, which already has the page-anchored corpus contract.
4. **External reference handling.** "Study ideas, do not copy source" is the right posture; copyright protects expression rather than ideas, and GPL/AGPL obligations attach to copying, modifying or distributing the code (general statement, not legal advice). The practical risk is implementers who read the linked files and reproduce their structure. Mitigations: (a) briefs describe behaviour in the PRD's own words and never link the external source files; (b) keep the §10 links in a separate "reference reading for the owner" note rather than in the PRD that briefs quote; (c) no UI copy, component names, schema names or file layouts borrowed; (d) record in the PRD that no code was read by implementers. The AGPL point is moot for this repository as long as the Node core stays dependency-free and no PDF-processing library is added — which is a second reason to keep extraction/OCR out of E12.
5. **Keep every new item out of Phases 0–2.** The v1.0 plan's Phase 0 (republish) and Phases 1–2 (source-access contract; UIC-keyed BHP/SRT connectors) are unchanged by v1.1 and remain the only work that moves the product. E10/E11a/E12-lite are presentation over data those phases produce.

---

## 6. Revised readiness table (E00–E12)

| Item | v1.0 verdict | v1.1 verdict | Change / reason |
|---|---|---|---|
| E00 | Ready — overdue | **Ready — overdue** | Unchanged; site still 503 on data routes at my last check (v1.0 review §4.1). |
| E01 | Technically unblocked, procedurally blocked | same | Unchanged. |
| E02 | Blocked (ADR 004) | **Blocked; merge with E10** | §5.1. |
| E03 | Blocked (RRC-07, CRS) | same, plus cross-highlight depends on ADR 004 | §4 item 5. |
| E04 | Blocked (E01/E02) | same | Unchanged. |
| E05 | Wish list / wrong repository | same; now also carries the page-anchor bullet | §2. |
| E06 | Blocked (v1 acceptance) | same; drop "selected well(s)" from stable keys | §4 item 6. |
| E07 | Wish list | same | Unchanged. |
| E08 | Ready | **Ready** | Unchanged; still the best second-slot item. |
| E09 | Wish list | same | Unchanged. |
| **E10** | — | **Blocked (depends on E01/E02; merge into ADR 004 deliverable)**. An "E10-lite" re-grouping of the existing selected-well panel is ready but low value until new datasets exist. | §3.3, §5.1. |
| **E11** | — | **E11a single-well depth ladder: blocked on Phases 2–3 (buildable).** **E11b multiwell/formation correlation: not buildable from authorized sources; out of Project 1 scope.** | §3. |
| **E12** | — | **E12-lite (anchors for preserved/supplied documents): ready to start, small, dependency-free — first step is to check `#page=N` behaviour on the Sources tab's `blob:` URLs; it may require serving preserved PDFs by URL instead.** **E12-full (index/extraction/OCR/permit documents): wrong repository; no obtainable anchors without EDMS.** | §2, §3.3; Assumptions B. |

Overall verdict: **unchanged** — not ready for the expansion as written; ready for Phase 0 and narrow local-only items. v1.1 adds presentation-layer items that depend on the unfinished data items and, as placed in §8, lengthens the path to an integrated release.

---

## 7. Plan and phase changes (relative to the v1.0 plan, §7 of `prd-review-fable.md`)

- Phase 0, 1, 2: **no change**.
- Phase 1.3 (ADR 004): **add** the typed-relation catalogue (relation name, key fields, basis, status values) so that E10's `evidence_relations.json` is specified by the same ADR. Astra reviews once.
- Phase 3 (API-keyed connectors): **no change**; E10's dossier sections for casing/plugging appear here as UI over Phase 3 data.
- Phase 4 (E08 version comparison, parallel slot): **no change**. **Add E12-lite** as a second small second-slot task (Sources tab anchors from the existing dictionary `pdf_pages`; HTML heading anchors) — no network, no new data.
- **New Phase 3b (after Phase 3): E10 dossier + E11a single-well depth ladder** — presentation only; one brief; byte-identical v1 files; accessible table equivalents.
- Phase 5 (AOR, after RRC-07 authorization): **add** E03 cross-highlight keyed by the ADR 004 identity.
- Phase 6 (package v2 + receiver): stable keys for records/relations/anchors; **no selection state**.
- **Removed from the Project 1 plan**: E11b (multiwell/formation correlation), E12-full (document index/extraction/OCR), E05 (per v1.0 Decision 11) — pending the cross-repo decisions below.
- Dependencies summary: E10 ← ADR 004 + Phases 2–3; E11a ← Phases 2–3; E12-lite ← nothing; E03 cross-highlight ← ADR 004 + Phase 5.

---

## 8. Success criteria for the new items

- **E10 (merged with ADR 004)**: ADR lists every relation with key fields, basis and status (`matched|none|ambiguous|needs_review`); `evidence_relations.json` for a version is reproducible from the version's own `sources/` (deterministic re-export test); every dossier statement resolves to a `source_record_key`/`source_row_key`/`report_id` and a snapshot hash; a well opened from map (when E03 exists), table or bookmarked route shows the same version ID; counts in the dossier equal the quality report's accepted/quarantined counts; the six v1 files of the version are byte-identical with and without the dossier code path; keyboard navigation and a table equivalent exist for any drawn relationship view.
- **E11a (single-well depth ladder)**: every depth shown carries source dataset, field name, unit as reported and the verbatim `depth_reference_code`; missing values produce gaps, never interpolation; no TVD or datum conversion is offered; no formation names are drawn as depths unless the source supplies a depth for them (BHP `test_depth_ft`, SRT perfs); fixtures cover missing, duplicate `record_sequence`, malformed intervals (top > bottom), and unit-less rows; an accessible table mirrors the ladder.
- **E12-lite**: each anchor opens the preserved document at the recorded page/heading or shows "unavailable" truthfully; anchors are stored with the document hash and invalidated when the hash changes (tamper fixture); user-supplied page claims are labelled `user_supplied_unverified`; no text extraction exists in the codebase (grep gate for PDF libraries in `package.json`/imports); Sources ledger and downloads unchanged (hash comparison).
- **E03 cross-highlight (when authorized)**: selection key is the ADR 004 identity; a well with ambiguous identity cannot be "selected" as one entity; the map is usable with panels hidden; the table equivalent exposes the same selection.
- **External-reference hygiene**: every implementation brief for E10/E11a/E12-lite contains no link to `github.com/gabrielserrao/...`; the PRD records that implementers were given behaviour descriptions only.

---

## 9. New or changed owner decisions (numbering continues from the v1.0 list; D1–D14 unchanged unless noted)

15. **Merge E10 into E02/ADR 004** and make the relation catalogue part of the ADR; the dossier is the UI deliverable of that contract. *Recommend: yes.*
16. **Split E11**: keep a single-well reported-depth ladder (E11a) in Project 1; remove multiwell/formation correlation (E11b) from Project 1 and either defer it to Analytics with engineer-supplied picks or open a separate RRC-08-class task on the bulk Well Bore `WBFORM` segment. *Recommend: E11a in, E11b out; do not start a bulk-file parser for this.*
17. **Cut E12 to E12-lite** (anchors for preserved and user-supplied documents, no extraction/OCR, no document index beyond what the app preserves); assign everything else to `ai-swd-permitting` (AI-02/AI-04). *Recommend: yes; record the ownership line in the phi-analytics architecture doc, not here.*
18. **External-reference handling in briefs**: no source-file links to the GPL/AGPL repository in any implementation brief; concept descriptions only; note in the PRD that no code was read by implementers. *Recommend: yes; move PRD §10's six source links to an owner-only reading note.*
19. **Explorer licence posture**: the repository has no LICENSE file and is `private: true`; decide whether to add one (and which) so that any future "licence and distribution review" has a baseline. *Recommend: decide now; no specific licence recommended by this review.*
20. **Phase placement**: keep E10/E11a/E12-lite out of Phases 0–2 and off the Phase 4 integrated-release critical path (new Phase 3b after the API-keyed connectors; E12-lite as a small second-slot task). *Recommend: yes.*
21. **No hosted tables for relationships**: the relationship index is a derived file in the versioned artifact, not a Supabase table. *Recommend: yes.*
22. **Rename or re-scope `well_depth_evidence.json`**: "reported depths" only; no "formation markers" until a source exists. *Recommend: yes.*
- **Changed D4** (ADR 004): now also defines relation types and the E03 selection identity.
- **Changed D10** (package evolution): stable keys for records/relations/anchors only; no UI selection state.
- **Changed D11** (E05 ownership): now covers the E05 page-anchor bullet and E12-full as well.

---

## 10. Confirmed / Assumptions / Recommendations

### A. Confirmed facts
- v1.1 diff content (§1) — from the `diff -u` of the two files.
- External repo: Volve drilling-intelligence app for the SPE GCS 2026 ML Challenge; Neo4j (~138,900 nodes), LangGraph ReAct agent, FastAPI, Next.js, PyMuPDF; created 2026-03-21, last push 2026-05-03 (README; GitHub repo API).
- Licence: `LICENSE` = GPL v3 "or any later version" notice, 1,129 bytes; README badge and §License say GPL-3.0; README line 725 names PyMuPDF (AGPL-3.0) and says AGPL terms apply to distributed combined works; `pyproject.toml` pins `pymupdf>=1.27.1`; GitHub API licence detection `NOASSERTION`; no NOTICE/THIRD_PARTY file; PyMuPDF is dual AGPL/commercial (PyMuPDF about page).
- Explorer repo has no LICENSE file; `package.json` `private: true` (git ls-tree on `main`).
- Existing page anchors in the Explorer: `src/artifact.mjs` line 122 `pdf_pages:[18,41,42]`; SOURCE_PROOF.md "PDF page 42".
- Depth/location fields per ODP dataset (§3.1; `/api/views` metadata from the v1.0 review); zero column descriptions; no formation tops, surveys, TVD or document pointers.
- RRC Well Bore Database layout: `WBFORM` segment with `WB-FORMATION-NAME` and `WB-FORMATION-DEPTH` ("DEPTH OF FORMATION IN WHICH WELL IS COMPLETED"); `WB-ELEVATION` + code GL/DF/KB/RT/GR; directional survey and W-12 inclination report as filed-flags only (wba091 PDF, pages 1-2, 2-13, 2-27, 2-28).
- Ownership text: Permitting owns source viewer/page-heading extraction/citation viewer (`05-architecture-integration.md` §1, §4; `03-ai-permitting-assistant.md` §6 AI-02/AI-04); Analytics owns the extended wellbore/depth model (`01-swd-injection-analytics.md` SWD-10); roadmap §7 defers layering/geomechanics.

### B. Assumptions needing verification
- GitHub's `NOASSERTION` is due to the short notice-only LICENSE file (ASSUMPTION).
- Browser-native `#page=N` works for the way the Sources tab serves PDFs (currently `blob:` URLs) — UNVERIFIED; may require serving the preserved PDF by URL instead.
- The ASCII variant of the bulk Well Bore file has the same segment layout as the tape guide — UNVERIFIED.
- Contents of ArcGIS layers `Well Logs` and `Horiz/Dir Surface Locations` — UNVERIFIED.
- The specific external source files linked in PRD §10 were not read by this review; nothing here depends on their contents.
- Whether the owner intends E05/E12 attachments to be stored hosted (Supabase) or locally — not stated.

### C. Recommendations (summary)
- Keep the v1.0 verdict and phase order; treat v1.1's E10/E11/E12 as post-ingestion presentation work, not release-path items.
- Merge E10 with ADR 004; split E11 (ladder in, correlation out); cut E12 to anchors; keep extraction/OCR and permit documents in Permitting.
- Strip the external repository's source links out of anything implementers will read; keep the "concept only" rule; keep the Node core dependency-free (which also keeps AGPL questions out).
- Decide the Explorer's own licence posture once.
- Rename `well_depth_evidence.json` to what the sources can fill.

**Network activity for this review**: GitHub raw files (`LICENSE`, `README.md`, `pyproject.toml`, `ui/package.json`, plus 404s for `requirements.txt`, `NOTICE`, `THIRD_PARTY_LICENSES.md`), two GitHub API calls, one GitHub page via WebFetch, one PyMuPDF documentation page, one RRC PDF (`wba091_well-bore-database.pdf`, 785 KB, saved by WebFetch to the tool-results folder and text-extracted locally). No RRC data rows, no Socrata queries. Temporary extraction files in the scratchpad were deleted; the scratchpad holds only the two review reports. The fetched PDF remains where the harness saved it (`.claude/projects/.../tool-results/webfetch-1792285449368-6zbbpi.pdf`); that is a harness cache location, not a project write. `docs/expansion-prd-review-2026-10-17.md` (untracked) is a byte-identical copy of the v1.0 report placed there by Main, not a write of this review.

— End of v1.1 delta review.
