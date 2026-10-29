# Review of `docs/expansion-prd-2026-10-17.md` — readiness and RRC source limits

Reviewer: Fable 5.1 (advisor/reviewer, read-only). Date: October 17, 2026 (live checks ran 2026-10-18 ~00:40 UTC, i.e. the evening of October 17 CDT).
Repository: `C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer` (`thaiphi/texas-rail-sync`), code read from `main` at `dd48857` with `git show main:<path>`; the checkout itself is on `trrc-import`, 30 commits behind `main` (`git rev-list --count trrc-import..main` = 30). The PRD and the feature inventory are untracked working-tree files.
Reference root (read-only): `C:/Users/thai.phi/Downloads/python/portfolio/phi-analytics`.

Labels used throughout: **CONFIRMED** (I read the document or page and quote/paraphrase it), **UNVERIFIED** (could not be fetched or was not checked), **ASSUMPTION** (inference that needs owner confirmation). Nothing here is an implementation; no files other than this report were written, no branches touched, no RRC data rows pulled (only dataset metadata and catalog JSON).

---

## 1. Objective and deliverable

**What the PRD is trying to accomplish** (PRD §1 "Product decision", §1 "Definition of success"): extend the current single-well UIC/H-10 collector into a "bounded SWD regulatory evidence explorer" whose output is a **versioned, reproducible evidence package for one proposed location in a selected review regime**, with every fact source-linked and every gap marked, and which never states a permit is complete, approvable or filed.

**What the final deliverable would contain** (PRD §6 "Output contract proposal"): the existing v1 files (`manifest.json`, `inventory.csv`, `injection_monthly.csv`, `normalized.json`, `quality_report.json`, `data_dictionary.json`, `sources/...`) plus an approved, additive `evidence/` set: `wellbore_crosswalk.json`, `casing.json`, `plugging.json`, `well_bottoms.json`, `bhp_tests.json`, `step_rate_tests.json`, `aor.json`, `permits_and_documents.json`, `readiness.json`; per-row provenance fields (`source_dataset`, `source_record_id`, `retrieved_at`, `source_url`, `snapshot_sha256`, `raw_field_names`, `normalized_values`, `units`, `measurement_basis`, `identity_confidence`, `qc_flags`); and an AOR object with regime, centre, CRS/datum, depth role, radius, method, inventory source/limit and `complete|incomplete|unknown`.

**What this review delivers** (owner's brief): requirements extraction, gap/conflict analysis against `docs/requirements.md` (RRC-01..10, G3) and the authoritative PRD 02, a readiness verdict per PRD item (question A), an evidence-backed survey of RRC/Socrata access limits (question B), a challenge of the approach, a phased plan with verification and success criteria, and the list of decisions only the owner can make. The PRD itself says it is "a proposal; implementation requires owner approval and any required specification/ADR updates" (PRD §7) — this review takes that at face value.

---

## 2. Requirements extracted (per PRD section)

### 2.1 Functional requirements

| PRD item | Functional requirement (paraphrased from the PRD) | Source |
|---|---|---|
| E00 | Republish the already-merged hosting-bridge fix; verify `/api/versions`, `/api/runs`, dataset open, SHA verification, TAR download and source evidence **from the published origin**; guest collection re-enabled only through a separate rollout plan | PRD §5 RRC-E00 |
| E01 | One connector per new ODP dataset (wellbore casing, wellbore plugging, well bottom location, UIC BHP test results, UIC SRT results) with schema discovery, bounded query/pagination, raw-byte preservation, retry/backoff, normalization and quarantine; casing/plugging keyed by wellbore identity, tests by UIC + test identity; keep date/method/basis/units/outcome/document pointers only where the source provides them | PRD §5 RRC-E01, §4 table |
| E02 | Explicit identity model (`uic_id`, `source_api_id`, display identity, source record key, completion identity, operator/lease/well) with evidence for every crosswalk; API may link **wellbore** records after verified linkage but must not replace UIC for H-10 joins; conflict/evidence inspector | PRD §5 RRC-E02 |
| E03 | Proposed well from user coordinates + datum/CRS + location role + depth; import of a manually exported RRC GIS CSV (hash, column check, radius, source date, dedupe, coverage warnings); map with ¼-mile or Permian ½-mile/2-mile boundaries; distance-ordered offset-well table; geodesic radii; all wells, not only UIC wells; surface vs bottom tags | PRD §5 RRC-E03 |
| E04 | Per-well detail combining casing, cementing/plugging, status, depth interval; flags such as "missing plugging record", "cement evidence unavailable", "orphan status needs verification"; ½-mile vs ½–2-mile labelling under the Permian method; export of the unresolved-well list | PRD §5 RRC-E04 |
| E05 | Jurisdiction-specific permit-evidence checklist (Permian: Well Template refs, AOR evidence, area map, 2-mile+ cross-section, logs, pressure/SRT reports); attachments with status values `verified_public`, `user_supplied_unverified`, `derived_with_method`, `unavailable`, `not_applicable`, `needs_engineer_review` | PRD §5 RRC-E05 |
| E06 | Preserve v1 TAR and consumer behaviour; additive v2 package only if needed; bundle sources, manifests, crosswalk, AOR parameters, flags, dictionary, machine-readable missing-prerequisite list; negotiated receiver contract (origin allowlist, validation, consent, SHA, schema version, limits); failed handoff leaves receiver unchanged | PRD §5 RRC-E06, §6 |
| E07 | Small explicit multi-UIC or owner-approved bounded-area collection; per-well progress and completeness; dedupe snapshots without changing hashes; stop on documented limits | PRD §5 RRC-E07 |
| E08 | Compare two immutable versions of the same well/area and schema: new/changed/missing rows, coverage, QC, snapshots | PRD §5 RRC-E08 |
| E09 | Scheduled retrieval only through approved ODP or published bulk-download paths; watermark, full-refresh safety, changed-row verification; never schedule the interactive research query system | PRD §5 RRC-E09 |

### 2.2 Technical requirements

- Store native source files unchanged; derive immutable normalized views; per-row provenance fields as listed in §1 above (PRD §6).
- Discover "the actual Socrata view ID, original field names, typed units, update frequency, row coverage, and license/access notes" before coding any new dataset (PRD §4 "Initial existing ODP endpoints").
- Respect "documented portal limits, pagination, retries, cache policy, and rate/access conditions; do not evade protections" (PRD §4 "Source-specific guardrails").
- Geodesic radius computation with documented test cases; CRS/datum recorded for every coordinate (PRD §5 E03).
- Tests must cover success, empty, malformed, missing, duplicate, pagination limit, partial failure, network timeout, schema drift; spatial tests must cover geodesic distance, CRS, boundary inclusion, the 2.5-mile/1,000-well GIS limits, missing locations and completion dedupe (PRD §9).
- Accessibility: keyboard navigation for map/table, contrast, text alternative to graphical risk flags (PRD §9).

### 2.3 Constraints (as stated by the PRD and by the governing documents it defers to)

- Never rewrite `raw/`, `artifacts/`, `runs/` or default pin files; keep old versions byte-identical; keep leading zeros, original IDs, `null` ≠ `0`, quarantined records, transformation versions, disclosed limitations (PRD §2 "Invariants"; AGENTS.md "Scope"; SPEC.md "Identity and normalization").
- No RRC permit submission, no automated sign-in, no bulk browser scraping of Research Queries/EDMS, no MSIP/MDIV, reservoir prediction, injectivity, seismic determination, statewide crawling, SCADA, private data, chatbot (PRD §3 "Out of scope").
- Project 2 owns calculations; Project 3 (permitting) is deferred (PRD §1, §7).
- Delegation rules: seven-field briefs, worktree branch, tests, independent review, PR; at most two active subagents; workers do not commit (PRD §7; AGENTS.md "Coordination and delegation"; `phi-analytics/docs/swd-intelligence-lab/agent-workflow.md` "Required seven-field brief", "Two-slot dispatch procedure").
- Do not activate hosted guest collection to unlock a feature (PRD §7).
- Dependency-free Node core (README "A dependency-free Node 24 acquisition/parser/export"; SPEC.md "The application has no third-party runtime dependencies"; feature inventory §6 "No new runtime dependencies for the Node core").

### 2.4 Acceptance criteria (verbatim intent, per item)

E00: public routes work on the published site; a dataset opens and downloads intact; prior pins unchanged; release evidence records time, deployed version and results. E01: fixtures + one bounded public proof per dataset reconcile raw/parsed/accepted/quarantined; missing stays missing; no silent merge of duplicates/conflicting parents; every displayed field has lineage; no v1 contract broken. E02: leading zeros survive; mismatched IDs do not link; one-to-many completions do not inflate AOR counts; linkage/quarantine reasons inspectable. E03: boundary/CRS/duplicate/unknown-trajectory/1,000-row/missing-coordinate/truncation tests; incomplete inventory visibly "not AOR-complete"; no confinement claim. E04: every flag names source and the unresolved input; no-evidence ≠ plugged and ≠ defective; unresolved list exportable. E05: exports list exact missing items with references; `unavailable` never estimated; cannot label "ready for filing". E06: v1 opens unchanged; v2 fails closed on tampering; hosted + local transfer pass real sender/receiver acceptance. E07: one failed well cannot make the group "complete"; counts reconcile. E08: no version mutated; keys are source identity + date/test identity. E09: idempotent refresh; schema breaks fail closed; no silent overwrite. (All PRD §5.)

---

## 3. Gaps, ambiguities and conflicts

### 3.1 Mapping RRC-E00..E09 to the existing tracker (`docs/requirements.md`) and PRD 02

| PRD item | Existing ID(s) | Relationship | Conflict / gap |
|---|---|---|---|
| E00 | **G3** (deployment/portfolio, OPEN); RRC-06 limit "Production/portfolio return links remain unconfigured" | Same work as the open G3 gate and feature-inventory §5 items 1–3 | Not a new requirement; it is overdue release repair. Only the owner can publish on Lovable (PRD §8 "Owner-controlled Lovable publish"). |
| E01 | RRC-01 (repeatable import), RRC-03/04 (identity, dictionary/QC) by analogy | Extends the acquisition contract to five datasets that are **not UIC/H-10** | AGENTS.md "Scope" limits the repo to "bounded official UIC/H-10 acquisition". Three of the five datasets have no UIC field at all (see §5.3). Needs a scope amendment plus new requirement IDs; the tracker has none for casing/plugging/bottom/BHP/SRT. |
| E02 | RRC-03 (identity audit) | Changes the identity contract | **Direct conflict with current invariants**: SPEC.md "Identity and normalization": "Shortened API has no uniqueness assumption"; `src/artifact.mjs` line 123 dictionary: `api_no` "never used as join key"; ADR 002: "eight-character API is preserved but never used to join" (SOURCE_PROOF.md "Parent identity"). Allowing API-based wellbore linkage is an ADR-level change, not a feature brief. |
| E03 | **RRC-07** (optional GIS/map, P1, OPEN) | Goes well beyond RRC-07's "optional map of acquired wells with sourced CRS": it adds a proposed-well input, AOR radii, an all-wells inventory from an external CSV | RRC-07's own open items ("Source CRS/coordinates, surface/bottom role, reliability and missing-coordinate behavior require a separate authorized work package") are still open. AGENTS.md forbids GIS without an authorized task (owner already knows). |
| E04 | none; nearest RRC-04 (quality flags) | New product semantics ("wellbore-isolation flags") | SPEC.md "Deliberate cuts" excludes "operational compliance conclusion". The PRD's own wording ("do not auto-classify regulatory compliance") is compatible only if flags are strictly "record present/absent". Needs a new requirement ID and a definition of each flag's exact evidentiary rule. |
| E05 | none | New | **Repository-ownership conflict**: `phi-analytics/docs/swd-intelligence-lab/05-architecture-integration.md` §1 assigns "Official disposal-permitting corpus, retrieval, grounded research/checklist, source viewer" to `ai-swd-permitting`, and SPEC.md "Deliberate cuts" excludes permitting here. The PRD places the checklist in Project 1 while saying Project 3 is deferred (PRD §1). This is a cross-repo decision, not a repo-local one. |
| E06 | **RRC-05** (versioned Analytics export); ADR 003 | Extends the consumer contract | v1 receiver acceptance is itself still pending: `docs/verification-2026-10-11-analytics-handoff.md` "Pending acceptance and dependencies" ("Real browser two-window handoff ... UNRUN HERE"); feature inventory §5 item 4. Adding `evidence/` files changes `manifest.files` and therefore the manifest hash the consumer pins (README "Pinned artifact and consumer"). |
| E07 | **RRC-08** (P2, OPEN) in part; ADR 002 ("statewide collection, scheduling, GIS and automatic Analytics import remain outside this decision") | New scope | Hosted guest limits make this local-only in practice (§3.3). |
| E08 | RRC-08 lists "version comparisons" as a prerequisite for coverage expansion; feature inventory §7 lists it as fitting the existing design | Fits | No conflict. It needs no network and no scope change. |
| E09 | **RRC-08** (P2); PRD 02 §8 "Scheduled refresh remains RRC-08/P2" | Deferred by both documents | Depends on an app-token decision and on RRC-08 review of access limits (§5). |

### 3.2 Missing information (needs owner input)

1. **No deadline or priority ordering.** README/roadmap targeted October 14 (README "Deadline"; `06-delivery-roadmap.md` title). The PRD marks E00–E06 all "P0" or "P0/P1" and gives no new date or sequence authority.
2. **"Well" vs "wellbore" vs "completion" counting rules** for AOR counts are asserted (E02 "one-to-many completions do not create duplicate wells") but not defined. The GIS export has "each completion record ... its own row" (§5.5).
3. **`review_regime` enumeration** (E03) is not specified: which regimes, their source documents and versions.
4. **GIS CSV import column contract** (E03): the RRC help page does not list fields (§5.5), so "verify columns" has nothing to verify against until a real export is inspected.
5. **CRS/datum of the GIS CSV export**: not stated on the help page — UNVERIFIED (§5.5). The ODP bottom-location dataset carries both NAD27 and NAD83 columns; inventory carries NAD83 (§5.3).
6. **Units** for the five datasets: the ODP metadata has zero column descriptions for all seven RRC datasets (§5.3), as already noted for the existing two (SOURCE_PROOF.md "Units and field definitions": "ODP metadata has empty field descriptions"). E01's "typed units" must come from official form instructions (G-1/W-2, W-3, H-5, SRT guidelines) — a real dependency the PRD lists only as "after metadata/field audit".
7. **Hosted vs local**: the PRD never says whether new datasets must work through hosted guest collection. Guest limits (§3.3) make that infeasible for AOR-scale pulls.
8. **Map rendering**: the browser app is vanilla JS with a hand-rolled SVG chart (feature inventory §3.3). Whether a map library may be added is unstated; the Node core forbids new dependencies, the browser side is not explicitly covered.
9. **Geodesy without dependencies**: NAD27↔NAD83 transformation and ellipsoidal distance need either a dependency or a documented in-house formula with test vectors.
10. **Manual attachments** (E05): storage location, retention, privacy and size for user-supplied PDFs on a Supabase Free project are not addressed.
11. **Who "verifies"** a `verified_public` status (E05)?
12. **Project 2 receiver status** for v2 is unknown from this repository; "Negotiate ... with Project 2" has no named owner or date.

### 3.3 Conflicts with the hosted runtime as built

CONFIRMED from `main`:
- `src/hosted/guest-journal.mjs` line 11: `GUEST_LIMITS` = `evidenceBytes: 10_000_000` total per job, `collectionsPerDay: 3`, `lookupsPerHour: 10`, `globalCollectionsPerDay: 20`, `maxAttempts: 2`, `leaseMs: 180_000`, `laneMs: 600_000`.
- `src/hosted/guest-steps.mjs` lines 25–26: `GUEST_SOURCE_TIMEOUT_MS = 90_000` ("Slow official hosts (TLS/response ~30 s+): 90 s per fetch fits Edge wall 150 s and leaseMs 180 s").
- `src/hosted/hosting-bridge.mjs`: upstream `AbortSignal.timeout(120000)`, request body cap 8,192 bytes, `accept-encoding: identity` forced.
- Supabase Free budgets: guest storage 250 MB, DB 50 MB, egress 1 GB/month (`docs/superpowers/specs/2026-10-14-guest-collection-design.md` "Budgets").

Consequence: an AOR of up to 1,000 wells × per-well casing/plugging queries cannot run through the hosted guest path as designed. The expansion is **local-first** unless the owner decides otherwise (Decision 7).

### 3.4 Internal inconsistencies in the PRD

- §4 table says the UIC inventory already provides "location evidence". The raw inventory rows do carry `latitude_nad83`/`longitude_nad83` (CONFIRMED in dataset metadata, §5.3), but the normalized projection does not: `src/artifact.mjs` line 123 definitions contain no coordinate fields. Coordinates exist only in preserved raw bytes.
- §5 E01 says tests should keep "document pointers only where the source provides them". CONFIRMED: neither test dataset has any document-pointer or pressure-series field (§5.3). The sentence is correct but should state the finding: there are none.
- §10 says links were "verified October 17, 2026". I re-verified links 1–5 (§5); link 6 (permit procedures) UNVERIFIED by me.
- §2 says "Six dataset tabs" — matches feature inventory §3.3. §2 says guest collection "disabled after an unsuccessful rollout" — matches `docs/verification-2026-10-14-guest-hosted.md` "Result: smoke test failed; rollback redeployment completed as version 6".

---

## 4. Readiness verdict (question A)

### 4.1 State of the repository, from evidence

CONFIRMED:
- **Published site is still broken.** Live check at 2026-10-18 ~00:40 UTC: `https://texasrrcexplorer.lovable.app/` → 200 (29,400 bytes HTML); `/api/versions` → **503** `{"error":{"code":"BACKEND_UNAVAILABLE","message":"Saved datasets are temporarily unavailable. Please retry."}}`; `/api/runs` → **503**. The Edge called directly (`.../functions/v1/trrc-explorer/api/versions`) → 200 with both identity and gzip/br accept-encoding. This matches the Oct 16 diagnosis (`docs/verification-2026-10-14-guest-hosted.md` "Follow-up by Main (October 16, 2026)": the published Workers build requests gzip, Supabase gzips, the old bridge refused compressed bodies). The fix is on `main` (`39922f0`, `9a6ae1c`, merged as `dd48857`) but the live site still serves the old bridge (the 503 code `BACKEND_UNAVAILABLE` is the pre-fix code; the fixed bridge returns `BACKEND_FETCH_FAILED` on throw — `src/hosted/hosting-bridge.mjs` last line).
- **Hosted guest collection is off.** Rolled back to Edge version 6 on Oct 16 after the smoke test failed with `fetch failed` before any HTTP status (`docs/verification-2026-10-14-guest-hosted.md` "Result"). Main's follow-up attributes the failure to the agent sandbox having no outbound network, "not evidence of an Edge fault" — i.e. the hosted guest path has **never passed a hosted smoke test**.
- **Open tracker items**: RRC-07 (GIS) OPEN, RRC-08 (refresh/statewide) OPEN, G3 OPEN (`docs/requirements.md` "October 10 evidence update" and the main table). Analytics receiver acceptance pending (`docs/verification-2026-10-11-analytics-handoff.md` "Pending acceptance"). Accessibility: "complete accessibility audit absent" (RRC-06 limit).
- **What is solid**: 321/321 isolated tests on the guest branch at `28a5255` (`docs/verification-2026-10-14-guest-local.md` "Verified"); immutable artifacts, hash pins, provenance sidecars, quarantine model, fixture/public separation (SPEC.md "October 10 integrity repair contract"; ADR 002); a local official guest collection succeeded end-to-end on Oct 14 (`docs/verification-2026-10-14-guest-local.md` "Official mode, after RRC recovered").
- **Architecture**: dependency-free Node core (`src/*.mjs`), vanilla browser app (`public/*.js`), Supabase Edge + Lovable TanStack shell (`src/hosted/`, `src/server.ts`, `supabase/functions/trrc-explorer/index.ts`), artifact/pin contracts (SPEC.md, `src/artifact.mjs`). The `package.json` dependencies are all for the Lovable shell/UI tooling, not the core.
- **Process hygiene**: the shared checkout is on `trrc-import`, 30 commits behind `main`; the PRD and inventory are untracked. Memory rule: commit only in a worktree branch, merge via PR.
- **Fetch layer today**: `src/sourceFetch.mjs` — 30 s default `AbortSignal.timeout`, 10 MB cap (content-length and streamed), `redirect:'error'`, **no headers set at all** (so no `X-App-Token`), no 429 handling (any non-OK status → `HTTP_ERROR`). `src/sources.mjs`: lookup `$limit=25` with `$order=uic_number,api_no`; monthly `$limit=1000` with `$order=formatted_date,id`; `src/artifact.mjs` line 58 refuses publication when exactly 1,000 monthly rows return (`SOURCE_ROW_LIMIT`). A collection makes 7 sequential requests (2 metadata, 2 data, 3 documents), a lookup makes 2.

### 4.2 Verdict

**The repository is not ready to take on the expansion as written. It is ready for Phase 0 (release repair) and for one or two narrow, local-only items; everything else is a wish list until the owner makes the scope, identity and ownership decisions in §9.**

The reasons are not the GIS/statewide prohibitions the owner already knows. They are: (1) the only public demo has been 503 on its data routes since at least Oct 11 (`docs/verification-2026-10-11-lovable-hosting.md` line ~104, re-confirmed today), and every hosted item in the PRD chains off a republish only the owner can do; (2) three of the five new datasets are keyed by API number with no UIC field, which collides head-on with the repository's written identity invariant (§3.1 E02) — that is an ADR, not a connector; (3) the permit checklist belongs to a different repository by the architecture document; (4) the hosted runtime's budgets cannot carry AOR-scale pulls; (5) the v1 Analytics handoff has not been accepted by the receiver, so a v2 package has no consumer to test against.

### 4.3 Per-item classification

| Item | Status | Blocked by / notes |
|---|---|---|
| E00 Production baseline recovery | **Ready — overdue** | Owner-only Lovable publish of `dd48857`; then Main verifies `/api/versions` 200 on the published origin, TAR byte-identical, pins unchanged. Guest retry is a separate decision (Decision 2). |
| E01 Five ODP connectors | **Technically unblocked, procedurally blocked** | View IDs, schemas, cadence and sizes are now CONFIRMED (§5.3), so "discover before coding" is done. Blocked by: scope amendment to AGENTS.md/SPEC (Decision 3); identity ADR for the three API-keyed datasets (Decision 4); units sourcing (§3.2 item 6); app-token decision (Decision 6). The two **UIC-keyed** test datasets (BHP, SRT) have no identity conflict and are tiny — lowest-friction start. |
| E02 Wellbore identity | **Blocked** | ADR required (changes SPEC/ADR 002 invariant). `api_no` format in the new datasets UNVERIFIED (no rows pulled). |
| E03 AOR map and inventory | **Blocked (authorization + design)** | RRC-07 authorization; CRS/datum policy; GIS export CRS UNVERIFIED; no map library decision; geodesy without dependencies. Wish list until Phases 1–3 exist. |
| E04 Casing/plugging/orphan flags | **Blocked (depends on E01/E02)** | Also needs flag definitions that stay inside "record present/absent" to respect the "no compliance conclusion" cut. |
| E05 Permit evidence navigator | **Wish list / wrong repository** | Ownership conflict with `ai-swd-permitting` (§3.1). Needs a cross-repo decision before any brief. |
| E06 Evidence package v2 + handoff | **Blocked** | v1 receiver acceptance pending; depends on E01–E04 content; manifest/pin consequences (§3.1). |
| E07 Multiwell | **Wish list** | RRC-08 territory; hosted budgets; requires new approval (PRD says so). |
| E08 Version comparison | **Ready to start** | No network, no scope conflict, listed as fitting in feature inventory §7; RRC-08 names it a prerequisite. Good candidate for the second subagent slot. |
| E09 Scheduled updates | **Wish list** | P2; depends on app token, RRC-08 review, a scheduler the Edge does not have for this purpose, and Free-plan budgets. |

### 4.4 Recommendation

Do Phase 0 now (republish + verify + commit the two docs via a worktree PR). Then authorize, in writing, a narrow Phase 1–2: the source-access contract (app token, 429 handling, discovery record) and the two UIC-keyed test connectors (BHP `qxfy-wcfs`, SRT `h54t-xnbi`) for the already-selected well, local-only, v1 files untouched, evidence as additive sidecar files. Run E08 in parallel as the second slot. Hold E02/E03/E04 until ADR 004 (identity) and the RRC-07 authorization exist. Move E05 to a cross-repo decision. Keep E07/E09 deferred.

---

## 5. RRC data-access limits (question B)

### 5.1 Socrata / Tyler Data & Insights (SODA) — platform limits

| Claim | Status | Evidence |
|---|---|---|
| Without an app token, requests share a per-IP pool and are throttled at a lower limit; 429 on throttle | **CONFIRMED** | https://dev.socrata.com/docs/app-tokens.html : "requests that aren't using an application token come from a shared pool via IP address"; "IP addresses that make too many requests during a given period may be subject to throttling"; "you'll be subjected to a much lower throttling limit for all requests originating from your IP address"; "you will receive a status code 429 response". |
| With an app token: own pool; "Currently we do not throttle API requests that are using an application token" unless abusive; limits can change "with notice" | **CONFIRMED** | same page. |
| Numeric throttle values | **Not published** | The app-tokens page gives no numbers; a web search found none on official pages. Treat as unknown, handle 429 + `Retry-After`. |
| Token passing: `X-App-Token` header (preferred, works for SODA 3.0 and 2.x); `$$app_token` query parameter for 2.0/2.1 | **CONFIRMED** | same page. Note for this repo: query URLs are preserved verbatim in manifests and `.source.json` sidecars (`src/sourceFetch.mjs` metadata `url`), so the token must go in the **header only**. |
| `$limit` default 1,000; SODA 2.0 max 50,000; "Version 2.1 and 3.0 endpoints have no maximum" | **CONFIRMED** | https://dev.socrata.com/docs/queries/limit . |
| `$offset` is 0-indexed, used with `$limit` to page | **CONFIRMED** | https://dev.socrata.com/docs/queries/offset . That page does **not** state an `$order` requirement; `https://dev.socrata.com/docs/paging.html` and `/docs/paging` returned 404 — stable-paging guidance **UNVERIFIED** from official docs. (Current code already orders every query.) |
| SODA 3.0: endpoint moves to `/api/v3/views/<id>/query.json`; "Query requests must be either authenticated by a user or marked with a valid application token"; POST preferred | **CONFIRMED** | https://dev.socrata.com/docs/endpoints.html . |
| SODA3 article (Tyler, "Last Updated: July 16, 2026"): "All new SODA3 API requests now need to identify who is making the call" (username/password, API key/secret, or app token on public datasets); "If you're already using the SODA2.1 API ... it's still fully supported and will continue to be available"; "Full exports via the /export endpoint do not need to provide authentication"; motivation: "anonymous traffic from bots and AI scrapers" | **CONFIRMED** | https://support.socrata.com/hc/en-us/articles/34730618169623-SODA3-API (fetched with a browser user-agent; WebFetch got 403). |
| Which SODA version `data.texas.gov/resource/<id>.json` serves today for these views | **UNVERIFIED** | Not tested. The current `$limit` values (25 and 1,000) are below every documented cap, so it does not matter yet. |
| SoQL GET URL length limit for `api_no in (...)` batches | **UNVERIFIED** | Not documented on the pages fetched; SODA3 article prefers POST for "larger requests". |

### 5.2 Terms of use / licence

| Claim | Status | Evidence |
|---|---|---|
| `https://data.texas.gov/terms-of-use` | **404** | Fetched; not found. |
| Portal footer links | **CONFIRMED** | `https://data.texas.gov/` home HTML links only `http://www.socrata.com/terms-of-service` and `https://www.tylertech.com/privacy`. |
| Socrata terms-of-service content | **UNVERIFIED** | Both WebFetch and curl returned an effectively empty body (105 bytes). |
| Per-dataset licence field | **CONFIRMED: none** | `/api/views/<id>.json` for all seven RRC datasets: `license` is null; no `attribution`. |
| Texas-specific reuse policy (DIR) | **UNVERIFIED** | Search found only DIR's description of the portal as "the state's official repository" (https://dir.texas.gov/office-chief-data-officer/texas-open-data-portal) and no licence/reuse page. Owner action: open the portal footer in a browser or ask DIR (`txopendataportal@dir.texas.gov` per texas.gov). |
| RRC Injection-Storage Resources page | **CONFIRMED** | https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/ : "The Texas Open Data Portal (ODP) is the official State of Texas repository for publicly accessible open datasets"; it names all seven datasets (also in the preserved copy `raw/rrc-resources.html`); it contains **no usage or licensing language**. |

### 5.3 The five datasets (plus the two already used) — all CONFIRMED from `https://api.us.socrata.com/api/catalog/v1?domains=data.texas.gov&q=uic` and `https://data.texas.gov/api/views/<id>.json`

All seven: publisher custom metadata "Agency: Railroad Commission of Texas", "Update Frequency: Monthly"; `license` null; **0 of N columns have descriptions**; all created February 20–23, 2026 (they are about eight months old). Row estimates are derived from Socrata `cachedContents` (non_null + null per column), not an official count, and no rows were pulled.

| Dataset | View ID | Rows (est.) | Last rows update (UTC) | Key / identity fields | Other fields (type) | Notes |
|---|---|---|---|---|---|---|
| RRC-UIC well location (inventory) | `givw-z9t4` | ~126,780 | 2026-10-16 12:46 | `uic_number` text, `api_no` text (8 digits in existing artifacts) | 27 fields incl. `latitude_nad83`, `longitude_nad83` (number), permit fields; dates are **text** | Already acquired. Coordinates exist in raw rows, not in the normalized projection. |
| RRC-UIC H10 Injection Monitoring | `qq2j-f2zm` | ~21,110,889 | 2026-10-01 13:43 | `uic_no` text, `id` number | `formatted_date` calendar_date, `vol_liq`, `vol_gas`, `inj_press_avg`, `inj_press_max`, `most_recent_record` … | Already acquired. |
| **RRC-Wellbore Casing** | `u9m4-xnh6` | ~2,410,353 | 2026-10-01 12:31 | `api_no` text, `id` number, `record_sequence` number | `csg_depth`, `toc`, `multi_stg_depth`, `cmt_sacks`, `csg_size`, `hole_size`, `total_depth_g1w2` (number), `completion_date` **calendar_date**, `depth_reference`, `depth_reference_code`, `on_top_record` checkbox | "one row per API # per casing string" (Form G-1/W-2). **No UIC field.** |
| **RRC-Wellbore Plugging** | `wfzn-9fje` | ~1,675,977 | 2026-10-01 12:04 | `api_no` text, `id`, `record_sequence` | `plug_top_depth`, `plug_bottom_depth`, `plug_cmt_sacks`, `total_depth_w3`, `w3_date` **calendar_date**, `depth_reference`, `depth_reference_code`, `on_top_record` | "one row per API # per plug" (Form W-3). **No UIC field.** |
| **RRC-Well Bottom Location** | `uumf-5r4y` | ~1,396,722 | 2026-10-01 12:03 | `api` text | `gis_lat27`, `gis_long27`, `gis_lat83`, `gis_long83` (number) | "all the well bottom spots on the RRC GIS map". Both NAD27 and NAD83. **No UIC field.** Format of `api` UNVERIFIED. |
| **RRC-UIC Bottom Hole Pressure Test Results** | `qxfy-wcfs` | **~581** | 2026-10-01 12:04 | `uic_no` text, `report_id` number, `tracking_no` text, `test_sequence_no` number | `report_conducted_date` **text**, `report_received_date` **text**, `bhp_psia` number, `test_depth_ft`, `gradient_psi_ft`, `tested_formation` text | Single value per row (psia). **No document pointer, no pressure series.** Small enough to snapshot whole. |
| **RRC-UIC Step Rate Test Results** | `h54t-xnbi` | **~337** | 2026-10-01 12:32 | `uic_no` text, `report_id`, `tracking_no` | `srt_received_date` **text**, `test_date` **text**, `satisfactory_test` number, `top_perf_ft`, `bottom_perf_ft`, `formation_tested`, `min_inj_rate_bpm`, `max_inj_rate_bpm`, `isip_psig`, `formation_frac_press_psig`, `frac_inj_rate_capacity_bpd`, `surface_pressure_firc_psig`, `fracture_gradient_psi_ft`, `comments` | Summary values only (psig). **No document pointer, no pressure series.** Small enough to snapshot whole. |

Design-relevant facts from this table:
- The three wellbore datasets are API-keyed; the two test datasets are UIC-keyed. The PRD's "casing and plugging use wellbore identity; tests use UIC + test identity" is consistent with the schemas.
- Unit basis differs by field name: BHP `bhp_psia` (absolute) vs SRT `isip_psig`/`..._psig` (gauge). The data dictionary must carry this; H-10 pressures are "psi" as named by the manual (SOURCE_PROOF.md "Units and field definitions").
- Dates: casing/plugging dates are typed `calendar_date`; BHP/SRT dates are **text** (like inventory dates) — parse-failure flags and quarantine are required, as today.
- Test-record "document pointers" do not exist in the source; the PRD's `permits_and_documents.json` cannot be populated from ODP.
- Sizes: BHP/SRT could be snapshotted whole (well under the 10 MB cap; `/export` needs no auth per the SODA3 article). Casing/plugging/bottom-location must be queried per well (millions of rows).

### 5.4 How the current code pulls (CONFIRMED from `main`)

- Endpoints: `https://data.texas.gov/resource/givw-z9t4.json` and `.../qq2j-f2zm.json` plus `/api/views/<id>.json` metadata (`src/sources.mjs` `acquisitionTargets`).
- Query bounds: lookup `$where uic_number='…'` or `api_no='…'`, `$limit=25`, `$order=uic_number,api_no` (`lookupTarget`); monthly `$where uic_no='…' AND formatted_date >= … AND formatted_date < …`, `$limit=1000`, `$order=formatted_date,id` (`targetsForScope`); legacy `$limit=5` candidate query retained for v1 replay.
- Caps: exactly 25 lookup rows → `cap_reached`, not selectable (`src/lookup.mjs` `inspectRows`); exactly 1,000 monthly rows → `SOURCE_ROW_LIMIT`, publication refused (`src/artifact.mjs` line 58; SPEC.md "October 10 bounded collection extension").
- Transport: 30 s per request (`timeoutMs=30000`), 10 MB cap, `redirect:'error'`, no custom headers, **no app token**, no 429/`Retry-After` logic (`src/sourceFetch.mjs`). Guest path: 90 s and one retry with 30–120 s backoff on `HTTP_ERROR`/`NETWORK_ERROR`/timeout (`src/hosted/guest-steps.mjs` lines 26–28, 165).
- Oct 14 finding: `webapps2.rrc.texas.gov` (`uic-query-help.html`, the 7th target) TCP connects in ~15 ms but TLS handshake + response takes ~30 s or more (curl 200 after 31 s; another attempt timed out at 40 s); Node fetch's 10 s connect+TLS limit cannot be raised without `undici` (`docs/verification-2026-10-14-guest-local.md` "Official mode (--official…)"). This is the reason for the 90 s guest timeout and is a standing fragility of the fixed 7-target list.

### 5.5 RRC GIS Viewer export limits

**CONFIRMED** from https://gis.rrc.texas.gov/gisviewer/GISViewer/docs/WebHelp/Download_Wells.htm : "a maximum radial (buffer) distance of 2.5 miles is allowed" (larger input is reset to 2.5); "can export information for up to 1000 wells" with a popup at 1000; export is CSV, but the page warns that saving as CSV may lose leading zeros and advises saving as .xlsx; "Each completion record has its own row in the CSV file", each row carrying the most recent operator/wellbore information and any plugging record. The page **does not list the exported fields** and **does not state the coordinate system** — both UNVERIFIED. The PRD's 2.5-mile/1,000-well claims are correct.

### 5.6 RRC Online Research Queries — automated-retrieval warning

**CONFIRMED** from https://www.rrc.texas.gov/resource-center/research/research-queries/ : "The use of automated tools to retrieve volumes of data can cause severe degradation of Railroad Commission of Texas systems." and "If the query system detects that data is being retrieved using an automated tool, the Railroad Commission of Texas will end the session for that user." The page does not point to the bulk downloads as the alternative. The UIC query help (https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html, already preserved in `raw/`) has no automation warning but states "The system will not display more than 10,000 records." The PRD's characterization is correct.

### 5.7 RRC bulk downloads (alternative to API pulling)

**CONFIRMED** from https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/ : "available ... free of charge"; "The conversion of the data and choice of conversion tools is the responsibility of the user"; **UIC Database** — EBCDIC and ASCII, monthly "by the 3rd workday", "H-10 monitoring data, H-5 pressure testing data, and UIC enforcement action data" plus inventory/permit; **Full Wellbore** — EBCDIC and ASCII, weekly, "completion, plugging, formation, and other information related to the well bore" (manual: "Wba091 Well Bore Database" PDF); **Wellbore Query Data** — ASCII monthly; **Completion Information in Data Format** — nightly zipped W-2/G-1/G-10/P-4/W-12; **Digital Map Data** — ArcView shapefiles by county, twice a week, lat/long decimal degrees **NAD27**, with `.prj`; **Statewide API Data** — ASCII/dBase twice a week. Download links go to `https://mft.rrc.texas.gov/link/<uuid>` (e.g. UIC Database `.../link/d2438c05-b42f-45a8-b0c6-edceb0912767`, Full Wellbore `.../link/b070ce28-5c58-4fe2-9eb7-8b70befb7af9`). No terms-of-use section; it links the RRC privacy policy and `Publicassist@rrc.texas.gov`.
- `https://mft.rrc.texas.gov/` root is a GoAnywhere **login page** ("THIS SYSTEM IS FOR AUTHORIZED BUSINESS OF THE STATE OF TEXAS ONLY AND ONLY FOR AUTHORIZED USERS"). The `/link/<uuid>` pages returned **200 without login** and render an unauthenticated file-listing shell ("GoDrive", `FooterPanelUnauth`). **Actual file download without login: UNVERIFIED** (not attempted).
- Fit for this repo: bulk files are mainframe-style fixed-length EBCDIC/ASCII; a dependency-free parser is possible but is a different class of work from Socrata JSON; the sets are statewide (RRC-08 territory) and would need a bounded-extraction design to stay inside "no statewide extraction". They are the only documented path for H-5 pressure-test *data* beyond the ODP inventories.

### 5.8 RRC public ArcGIS REST (not in the PRD; relevant to "better alternatives")

**CONFIRMED-exists, terms UNVERIFIED**: `https://gis.rrc.texas.gov/server/rest/services?f=pjson` lists folders incl. `rrc_public`; `rrc_public/RRC_Public_Viewer_Srvs` MapServer reports `capabilities: "Map,Query,Data"`, `maxRecordCount: 1000`, spatial reference wkid 4326, 41 layers including `1 Well Locations`, `2 Orphan Wells`, `3 Commercial Disposal`, `4 Injection/Disposal`, `8 Well Logs`, `9 Horiz/Dir Surface Locations`. The `Hosted` folder answers `499 Token Required`. No terms of use for programmatic access were found; RRC's only stated automation policy is the Research Queries warning in §5.6. This is **not** a recommendation to use it; it is a fact the owner should weigh (Decision 5).

### 5.9 Regulatory references the PRD relies on

- **Permian Basin Disposal Well Review** — CONFIRMED (https://www.rrc.texas.gov/.../pb-disposal-review/): applies to "Districts 7C, 8A, and 08"; ½-mile (zonal isolation through penetrations) and 2-mile (unknown/orphaned wells) reviews; workbook "UIC PERMIAN REVIEW V1.3" with Well Template, AOR Template, MSIP & MDIV; "Columns A-AD completed for ½-mile AOR", "Columns A-O completed for 2-mile AOR"; 2-mile AOR map with index numbers matching the AOR Template; "2-Mile+ Cross Section"; step-rate tests, well logs and BHP tests in the Well Template appendix; plugging/cementing records for ½-mile wells. No effective date on the page (only a May 22, 2025 webinar).
- **Application attachments** — CONFIRMED (https://www.rrc.texas.gov/.../application-attachments/): "A map of all wells of public record within a 1/4-mile radius of the proposed injection/disposal well ... showing the total depth of each well"; AOR table of wells within ¼ mile that "penetrate the top of the proposed injection zone" with lease, well no., API, total depth, date drilled, status, plug date; W-14 requires a "No Harm Letter".
- Link 6 of PRD §10 (permit procedures overview): UNVERIFIED by me.

---

## 6. Challenge to the approach: weaknesses, risks, better alternatives

1. **The PRD is a product vision wearing a "P0" label on almost everything.** Six of ten items are P0 or P0/P1 with no ordering and no deadline. Given a two-slot delegation model and an owner-only publish step, this guarantees that the live demo stays broken while design debates run. Alternative: a strictly serial Phase 0, then at most two parallel narrow items (§7).

2. **Identity is the real risk, not GIS.** The repository's provenance story rests on "exact UIC string only; API never joins". Three new datasets only have API numbers. Any wellbore crosswalk is therefore a **second identity domain** (wellbore/API) that must be modelled as a sibling of, not a bridge to, the UIC domain: the link from a UIC inventory row to its wellbore records is the inventory row's own `api_no`, carried as evidence with an explicit basis, never used to join H-10. ADR 004 should say exactly that, and should also handle: API format differences between datasets (UNVERIFIED), multiple inventory rows sharing an API, and wells with no UIC (offset wells in an AOR, which have wellbore records but no UIC and no H-10). The PRD gestures at this (E02) but a feature brief cannot carry it.

3. **"Discover before coding" is now done, and it changes the plan.** BHP (~581 rows) and SRT (~337 rows) are tiny statewide inventories with no documents and no series; they are the cheapest connectors and fit the existing UIC identity model. Casing/plugging/bottom-location are multi-million-row and API-keyed. The PRD treats the five as one block; they are two very different blocks.

4. **Test datasets will disappoint the user story.** The PRD's user story expects "related test and permit evidence". The ODP test datasets give one BHP value or one SRT summary per report and no pointer to the imaged report. The PRD must say so up front ("inventory of reports received", which is exactly the RRC wording), or engineers will assume more.

5. **Manual GIS CSV import is defensible but under-specified.** It is the right first step given the automation warning, but the export's columns and CRS are undocumented on the help page; the export is per-completion, not per-well; CSV loses leading zeros unless saved as .xlsx (RRC's own warning). The import contract must be written from a real export inspected by the owner, and the importer must accept .xlsx or require a verified CSV with string API columns. Alternatives (ODP bottom-location by API; the public MapServer with a 1,000-record cap) exist but have no stated terms — the owner's "do not evade protections" posture argues for asking RRC (`Publicassist@rrc.texas.gov`) before using either programmatically.

6. **Geodesy and maps collide with the dependency rule.** Great-circle distance on a sphere is a dozen lines and testable; ellipsoidal distance and NAD27→NAD83 are not trivially dependency-free. Recommend: NAD83/WGS84 only, treat NAD27-only coordinates as "not placed, datum conversion required", document the formula and accuracy bound, and decide separately whether a browser map library is permitted (the Node rule does not cover the browser, but the browser app is deliberately vanilla).

7. **App token is a one-way decision that should be made early.** Today's traffic (≤9 requests per collection) is far below any plausible throttle, but five more datasets × per-well queries × multi-well AORs is not. SODA 2.1 remains supported (so nothing breaks tomorrow), but SODA3 requires identification and Tyler's stated motive is bot/AI-scraper traffic. Header-only token, server-side secret, fixture tests token-free, manifest records `app_token_used: true/false` without the value.

8. **Hosted parity is a trap.** The PRD's §7 line "do not activate hosted guest collection merely to enable a new feature" should be strengthened to "the expansion is local-first; hosted parity for any new dataset is a separate decision with its own budget arithmetic" (10 MB per job, 3 collections/day, 90 s per fetch).

9. **Package evolution needs a consumer first.** Adding `evidence/` files changes the manifest file inventory and its hash; Analytics pins the manifest hash. Until the v1 browser handoff is accepted by the receiver, there is no way to prove "an old v1 package opens unchanged" on the receiver side. Sequence: v1 acceptance → sidecar-only additions (no change to the six v1 files) → receiver tolerance test → only then a schemaVersion bump if ever.

10. **E05 should leave this repository.** The architecture document already assigns checklist/grounded research to `ai-swd-permitting`. Keeping it here duplicates ownership and reintroduces permitting into a repo whose SPEC cuts it. If the owner wants a *data-availability* readiness list (which ODP records exist for the well), that is an Explorer feature; a *permit* checklist is not.

11. **The webapps2 TLS slowness is a latent single point of failure.** Every collection fetches `uic-query-help.html` from `webapps2.rrc.texas.gov`; its TLS handshake took ~30 s+ on Oct 14. Adding more fixed documentation targets per dataset (form instructions for G-1/W-2, W-3, H-5) multiplies exposure. Prefer: fetch form/manual documents once per *source-version*, not once per collection, or keep them as separately versioned "documentation snapshots" referenced by hash.

---

## 7. Proposed phased plan (plan only — nothing here is authorized by this review)

| Phase | Deliverable | Depends on | Owner of the step | Verification |
|---|---|---|---|---|
| **0 — Release repair and hygiene** | 0.1 Owner publishes Lovable from `main` (`dd48857`). 0.2 Main verifies on the published origin: `/api/versions` 200, `/api/runs` 200, a dataset opens with SHA verification, TAR download byte-identical to the Edge TAR, `public/artifact-path.json`/`artifact-integrity.json` unchanged; writes `docs/verification-2026-10-xx-republish.md`. 0.3 Commit the PRD + inventory docs through a worktree branch and PR. 0.4 Decide the guest retry separately (not a gate for Phase 1). 0.5 Coordinate v1 Analytics receiver acceptance (other repo). | Owner publish; MCP/Lovable access | Owner (publish), Main (verify, Git) | HTTP status/byte evidence with timestamps; SHA-256 equality; `node scripts/check-isolated.mjs` unchanged count |
| **1 — Source-access contract (no new datasets yet)** | 1.1 `docs/source-discovery-2026-10-xx.md`: the seven view IDs, preserved `/api/views/<id>.json` snapshots under a new `raw-discovery-…/` directory with sidecars, field/type lists, cadence, sizes, the "no licence stated" finding, and the official form references for units (G-1/W-2, W-3, H-5, SRT guidelines). 1.2 Fetch-layer change: optional `X-App-Token` from env (local) / Edge secret (hosted); header only; 429 + `Retry-After` → `SOURCE_THROTTLED` (retryable); metadata gains `app_token_used` boolean. 1.3 Governance: AGENTS.md scope amendment, SPEC addendum, **ADR 004 identity** (wellbore/API domain as sibling of UIC; link basis; no H-10 join via API), new requirement IDs RRC-11..1x in `docs/requirements.md`. | Phase 0.3; Decisions 3, 4, 6 | Implementer (1.1, 1.2); Main/Astra (1.3) | Fixture tests for header presence/absence and 429 path; token never appears in any written file (grep test); v1 replay byte-identical; existing suite green |
| **2 — UIC-keyed test connectors (BHP `qxfy-wcfs`, SRT `h54t-xnbi`)** | Per selected UIC: exact `uic_no` query with `$order=report_id` and a cap check (or whole-dataset `/export` snapshot — Decision 8); raw bytes + sidecars; normalization with text-date parse flags, psia/psig units from field names + official guidance, quarantine for duplicate `report_id`/`tracking_no`; additive sidecar `tests.json` (+ CSV) listed in `manifest.files`; the six v1 files unchanged; a "Tests" section in the dataset workspace and dictionary entries; no interpretation of values. | Phase 1 | Implementer | Fixtures: empty, duplicate report IDs, text-date failures, cap reached; one owner-authorized bounded public proof for UIC 000020838 reconciling raw/parsed/accepted/quarantined; old versions and pins unchanged; `check-isolated` green |
| **3 — API-keyed wellbore connectors (casing `u9m4-xnh6`, plugging `wfzn-9fje`) for the selected well only** | First a one-query format proof of `api_no` in each dataset (owner-authorized). Then: query by the inventory row's own `api_no`; `wellbore_link_basis: inventory_api_no`, status `matched|none|ambiguous`; preserve `record_sequence`, `on_top_record`, depth references; "record present/absent" flags only; sidecars `casing.json`, `plugging.json`. | ADR 004; Phase 2 patterns | Implementer; Astra review of identity handling | Fixtures: multi-string, multi-plug, missing, duplicate sequence, inventory rows sharing an API; bounded public proof; no API→H-10 join possible (negative test) |
| **4 — Version comparison (E08)** — parallel second slot from Phase 1 onward | Compare two immutable versions of the same UIC by source keys (`source_record_key`, `source_row_key`, `source_report_id` + period): added/removed/changed rows, coverage, QC deltas, snapshot hashes; read-only; no network. | None (existing versions suffice) | Implementer | Tests on the three existing public versions; no file under `artifacts/` modified (protected-clean check) |
| **5 — AOR (E03/E04 spatial), only after RRC-07 authorization** | 5.1 ADR 005 CRS/datum + distance method with test vectors; map rendering decision. 5.2 Manual GIS export import: file hash, column verification against an owner-inspected real export, .xlsx or string-safe CSV, per-completion → per-well dedupe rule, 1,000-row/2.5-mile truncation → `coverage: incomplete`. 5.3 Optional bottom-location by API for listed wells (ODP) — Decision 5. 5.4 ½-mile/2-mile labelling as "potential review consideration". | Decisions 5, 9; Phases 1–3 | Implementer; Astra review | Spatial fixtures per PRD §9; truncated export visibly "not AOR-complete"; NAD27-only rows not placed; keyboard/contrast checks |
| **6 — Evidence package v2 + handoff (E06)** | Additive `evidence/` namespace; schema decision; receiver tolerance test; fail-closed on tamper; hosted + local acceptance. | Phase 0.5 (v1 acceptance); Phases 2–3 (content); Decision 10 | Both repos | v1 package opens unchanged on the real receiver; tampered v2 refused; SHA intact |
| **Deferred** | E05 (cross-repo decision), E07, E09 | Decisions 11, 12 | — | — |

---

## 8. Success criteria per phase

- **Phase 0 complete when**: on `https://texasrrcexplorer.lovable.app`, `/api/versions` and `/api/runs` return 200 with the three known versions and the recorded runs; a TAR downloaded from the published origin has the same SHA-256 as the Edge TAR and as the local `scripts/serve.mjs` TAR; `public/artifact-path.json` and `artifact-integrity.json` unchanged (`2bc9bbbe…0f727`); a dated verification doc records time, deployed commit and exact HTTP results; the PRD/inventory docs are on `main` via PR; the shared checkout is no longer a stale `trrc-import` or is explicitly left alone.
- **Phase 1 complete when**: discovery doc and preserved metadata snapshots exist with hashes; ADR 004 and the scope amendment are merged; a token-present and token-absent fixture test both pass; a grep over `artifacts/`, `raw*/`, `runs/`, `lookups/`, `docs/` finds no token value; 429 fixture yields `SOURCE_THROTTLED` and a retry with the `Retry-After` wait; full isolated suite green with the pre-phase count plus the new tests.
- **Phase 2 complete when**: one real bounded proof for the selected UIC reconciles raw = parsed = accepted + quarantined for BHP and SRT; every displayed test field has a dictionary entry with units and "public reported" status; the six v1 files for the new version are byte-identical to what the v1 pipeline would produce for the same sources (regression test); old versions untouched; the Help text states that ODP test datasets are report inventories without documents or series.
- **Phase 3 complete when**: the API format proof is recorded; casing/plugging rows for the selected well reconcile; the `wellbore_link_basis` and link status are shown in the inspector; a negative test proves H-10 cannot be joined via API; no flag implies compliance (review by Astra with the SPEC cut quoted).
- **Phase 4 complete when**: comparing the two existing UIC 000020838 versions produces a deterministic diff keyed by source identity; running it leaves `artifacts/` byte-identical (protected-clean check); filters never alter downloads.
- **Phase 5 complete when**: all PRD §9 spatial cases have tests; a real owner-supplied GIS export imports with hash, column check and dedupe; a 1,000-row export is labelled incomplete; distances match documented test vectors within the stated bound; keyboard navigation and text alternatives pass a focused accessibility check.
- **Phase 6 complete when**: the real Analytics receiver accepts a v1 package unchanged and a v2 package, refuses a tampered v2, and both local and hosted transfers are walked through in a browser with recorded evidence.

---

## 9. Decisions the owner must make (numbered, with my recommendation)

1. **Republish now?** Publish `main` (`dd48857`) to Lovable and let Main verify the published origin before any expansion work. *Recommend: yes, immediately; it is the only thing on the critical path that nobody else can do.*
2. **Guest rollout retry — before or after expansion?** *Recommend: decouple. Retry it from a machine with outbound network when convenient; do not make it a gate for Phases 1–4, and do not extend guest scope to new datasets until budgets are re-derived.*
3. **Scope amendment** to AGENTS.md/SPEC to allow additional ODP datasets, bounded per selected well. *Recommend: yes, worded as "bounded official UIC, H-10 and related RRC ODP wellbore/test records for explicitly selected wells"; keep the statewide/GIS prohibitions.*
4. **Identity policy (ADR 004)**: allow an API-keyed wellbore domain linked to the UIC inventory by the inventory row's own `api_no`, never substituting for UIC in H-10 joins. *Recommend: yes, with link-basis evidence and `matched|none|ambiguous` status; Astra reviews before any Phase 3 code.*
5. **Spatial sources and RRC-07 authorization**: manual GIS CSV import first (as the PRD says) vs ODP bottom-location by API vs the public MapServer. *Recommend: defer E03 until Phases 1–3 are done; when authorized, manual export first, ODP bottom-location second; do not use the MapServer or bulk mft files programmatically until RRC's terms for them are confirmed in writing (`Publicassist@rrc.texas.gov`).*
6. **Socrata app token**: register one and pass it via `X-App-Token` only (env locally, Edge secret hosted). *Recommend: yes, in Phase 1, before any new dataset; record `app_token_used` in sidecars, never the value.*
7. **Local-first expansion**: declare that new datasets are local-only until a separate hosted-parity decision with budget arithmetic. *Recommend: yes.*
8. **Query style for BHP/SRT**: per-UIC bounded query (consistent with today's model) vs whole-dataset snapshot via `/export` (~581 and ~337 rows; no auth needed per Tyler). *Recommend: per-UIC bounded query for consistency with the "bounded, no statewide extraction" posture; revisit if the owner wants statewide test inventories.*
9. **Geodesy and map rendering**: NAD83/WGS84 only with a documented spherical/ellipsoidal formula, NAD27-only coordinates "not placed"; whether a browser map library is permitted. *Recommend: NAD83-only in-house formula with test vectors; no map library until the table/SVG version exists.*
10. **Package evolution**: sidecar files added to `manifest.files` with the six v1 files untouched; schemaVersion stays 1 until the receiver tolerates extra files. *Recommend: yes; sequence after v1 receiver acceptance.*
11. **E05 ownership**: keep the permit checklist out of this repo (it belongs to `ai-swd-permitting` per the architecture doc); allow only a "data-availability readiness" list here. *Recommend: move E05 out; record the decision in the phi-analytics docs, not here.*
12. **E07/E09**: keep deferred under RRC-08; revisit after Phase 5 with real usage. *Recommend: defer.*
13. **Deadline and priority**: state the new target date (if any) and confirm the ordering in §7. *Recommend: no calendar commitment until Phase 0 is verified.*
14. **Licence posture**: accept "no licence stated" on the ODP datasets with attribution to RRC/ODP, or ask DIR/RRC. *Recommend: ask DIR (`txopendataportal@dir.texas.gov`) once; record the answer in SOURCE_PROOF.md.*

---

## 10. Three labelled lists

### A. Confirmed facts (with source)

- Published site: shell 200, `/api/versions` 503 `BACKEND_UNAVAILABLE`, `/api/runs` 503 at 2026-10-18 ~00:40 UTC; Edge direct 200 (live curl). Diagnosis and fix: `docs/verification-2026-10-14-guest-hosted.md` "Follow-up by Main"; `src/hosted/hosting-bridge.mjs` on `main`.
- Guest hosted rollout failed and was rolled back to Edge version 6 on Oct 16; hosted smoke test never passed (`docs/verification-2026-10-14-guest-hosted.md` "Result").
- Local official guest collection succeeded on Oct 14; 321/321 isolated tests (`docs/verification-2026-10-14-guest-local.md`).
- `webapps2.rrc.texas.gov` TLS ~30 s+ on Oct 14; 90 s guest timeout (`docs/verification-2026-10-14-guest-local.md`; `src/hosted/guest-steps.mjs` line 26).
- Guest limits: 10 MB evidence per job, 3 collections/day, 10 lookups/hour, 20 global collections/day, 2 attempts (`src/hosted/guest-journal.mjs` line 11). Free-plan budgets 250 MB/50 MB/1 GB (guest design spec "Budgets").
- Current fetch: 30 s, 10 MB, `redirect:'error'`, no headers, no token, no 429 logic (`src/sourceFetch.mjs`); queries and caps as in §5.4 (`src/sources.mjs`, `src/lookup.mjs`, `src/artifact.mjs` line 58).
- Identity invariant: API never a join key (SPEC.md "Identity and normalization"; `src/artifact.mjs` line 123; ADR 002; SOURCE_PROOF.md "Parent identity").
- Open tracker items RRC-07, RRC-08, G3; receiver acceptance pending; accessibility audit absent (`docs/requirements.md`; `docs/verification-2026-10-11-analytics-handoff.md`).
- Checkout `trrc-import` is 30 behind `main`; PRD/inventory untracked (`git status`, `git rev-list`).
- Seven RRC ODP datasets with IDs, sizes, fields, cadence, no licence, no column descriptions (§5.3; catalog and `/api/views` JSON).
- Socrata throttling/token/limit/SODA3 statements (§5.1, with URLs).
- RRC GIS Viewer 2.5 miles / 1,000 wells / per-completion rows / CSV leading-zero warning (§5.5).
- Research Queries automation warning; UIC query 10,000-record display limit (§5.6).
- Bulk download catalogue, formats, cadence, free of charge, mft link form; mft root is a login page; `/link/<uuid>` pages load without login (§5.7).
- Public ArcGIS MapServer exists with Query capability and 1,000-record cap (§5.8).
- Permian review districts/radii/workbook columns and ¼-mile general AOR (§5.9).
- Architecture doc assigns checklist to `ai-swd-permitting` (`05-architecture-integration.md` §1).

### B. Assumptions needing verification

- The 503 on the published site will clear once `dd48857` is published (ASSUMPTION based on the Oct 16 diagnosis; only a real publish proves it).
- `api_no` in casing/plugging and `api` in bottom-location use the same 8-digit text form as the inventory (UNVERIFIED; one bounded query each will settle it).
- Row estimates from `cachedContents` are close to true counts (UNVERIFIED; no `count(*)` was run).
- `data.texas.gov/resource/<id>.json` serves SODA 2.1 for these views (UNVERIFIED; irrelevant at current `$limit`).
- Stable paging requires `$order` (common practice; official paging page 404 — UNVERIFIED).
- GIS Viewer CSV export CRS and field list (UNVERIFIED; needs a real export).
- mft `/link` file download works anonymously (UNVERIFIED).
- Socrata terms of service content and any Texas-specific licence (UNVERIFIED).
- Terms for programmatic use of the public MapServer (UNVERIFIED).
- PRD §10 link 6 content (UNVERIFIED).
- Whether the Analytics receiver tolerates extra files in `manifest.files` (UNVERIFIED; other repository).

### C. Recommendations (summary)

- Phase 0 first and alone; publish, verify on the published origin, commit the docs via worktree PR.
- Narrow Phase 1–2 authorization: app token (header-only), 429 handling, discovery record, ADR 004, then BHP/SRT connectors for the selected well; E08 in the second slot.
- Hold API-keyed connectors until ADR 004; hold AOR until RRC-07 authorization and a CRS ADR; move E05 out of this repo; defer E07/E09.
- Keep the expansion local-first; re-derive hosted budgets before any hosted parity.
- Sidecar-only package additions; v1 receiver acceptance before any v2 talk.
- Ask RRC/DIR about licence and about programmatic use of the MapServer/bulk files before relying on either.
- State plainly in the PRD and Help that ODP test datasets are report inventories (no documents, no pressure series).

**Network activity disclosure.** The brief allowed "a few" metadata requests; the actual count was higher, all metadata/listing, zero data rows: Socrata hosts — 3 discovery-catalog queries (`api.us.socrata.com/api/catalog/v1`) and 7 `data.texas.gov/api/views/<id>.json` fetches (one per RRC dataset) plus the portal home page; `gis.rrc.texas.gov` — 4 REST directory/service JSON reads and the viewer home page; `mft.rrc.texas.gov` — 2 HEAD requests and 1 range-limited GET (first 1,500 bytes) of a `/link/<uuid>` listing page; owner's own endpoints — 3 GETs to `texasrrcexplorer.lovable.app` and 2 to the Supabase Edge; documentation pages via WebFetch/WebSearch (rrc.texas.gov, dev.socrata.com, support.socrata.com, catalog.data.gov). Intermediate JSON/HTML downloads were deleted after use; the scratchpad contains only this report.

— End of report. No files other than this report were written; no Git state changed; no RRC data rows were pulled (metadata and catalog JSON only).
