# Texas RRC Explorer — feature inventory (October 16, 2026)

Purpose: give an agent a complete picture of what the Explorer does today, so it can propose new features without re-reading the whole repository.

Basis: branch `main` at `dd48857` (PR #3 merged). Sources: `README.md`, `SPEC.md`, `docs/requirements.md`, `docs/feature-preservation-2026-10-10.md`, `docs/superpowers/specs/2026-10-14-guest-collection-design.md`, `docs/verification-2026-10-14-guest-*.md`, plus a file survey of `public/`, `src/`, `scripts/`, `supabase/`. Live checks were run on October 16, 2026. This inventory is a summary; where it conflicts with those files, the files win.

Status legend:
- **Live**: working on the published site.
- **Local**: works when run locally with `node scripts/serve.mjs`.
- **Built, off**: code exists and is tested, but it is switched off or not deployed.
- **Not built**: planned or out of scope.

## 1. What the product is

A bounded explorer for official Texas Railroad Commission (RRC) public injection data: UIC well inventory and H-10 monthly injection reports. It collects data for **one well at a time** over a **1–36 month window**, normalizes it, runs quality checks, and publishes immutable, hash-pinned dataset versions. Every record can be traced to the original source bytes. Datasets can be downloaded as a verified TAR or handed to the sibling Injection Analytics app.

It is a portfolio demonstration of reservoir-engineering and disposal-well data handling. Visitors are meant to enter it from the Phi Analytics portfolio card "Texas RRC Data Intelligence".

## 2. Where it runs

| Surface | URL / command | Status on Oct 16 |
|---|---|---|
| Local app | `node scripts/serve.mjs` → http://127.0.0.1:4174 (Node 24, no install needed for the pinned data) | Local: full features, including real collection |
| Published site | https://texasrrcexplorer.lovable.app | Page shell loads (200), but **data routes return 503** (`/api/versions`, `/api/runs` checked live). The bridge fix in PR #3 is merged but **not yet republished** on Lovable. |
| Lovable preview | `*.lovableproject.com` (Node-based) | Last recorded working Oct 11. Not re-checked. |
| Supabase Edge `trrc-explorer` | project `phxiqnsebqaalvkanljb`, version 6 | Read-only, healthy (`/api/versions` 200 when called directly). Guest flag removed after a failed rollout. |

## 3. Feature inventory

### 3.1 Find & collect (screen "Find injection records")

| Feature | Status | Key files |
|---|---|---|
| Exact lookup by 9-digit UIC or 8-digit source API (leading zeros kept, no truncation) | Local | `public/collection.js`, `src/lookup.mjs`, `src/sources.mjs` |
| Candidate list with identity, operator, lease, well, permit/type/cancellation/plugged fields; explicit selection, never auto-selected | Local | same |
| Blocks unsafe cases: duplicate/ambiguous parents, 25-candidate cap, 1,000-row monthly cap, invalid month window | Local | `src/sources.mjs` |
| Lookup evidence: lookup UUID, hash, retrieval time, exact official query URL | Local | `public/collection.js` |
| Reporting window: inclusive 1–36 months | Local | same |
| Collect: one active request, partial evidence kept on failure, creates a **new immutable version** | Local | `scripts/serve.mjs`, `src/acquisition.mjs`, `src/pipeline.mjs` |
| "Open this dataset" handoff after a successful collection | Local | `public/app.js` |
| Progress display | Local | Shows "waiting for recorded completion" only. There are no live sub-stage events locally; guest mode shows real job steps. |
| Guest collection (no account, hosted) | **Built, off** | See §3.8 |

### 3.2 My datasets (library)

| Feature | Status | Key files |
|---|---|---|
| Registry of public versions with default-pin badge; opening a version never changes the pin | Local. Live only once the site is republished. | `public/app.js`, `public/artifact-integrity.js` |
| Every open re-verifies manifest + normalized-payload SHA-256; a failed/corrupt version clears all prior evidence and disables filters/downloads | Local | `public/artifact-integrity.js`, `public/dataset-state.js` |
| **Save in this browser**: stores exact TAR bytes + pins in IndexedDB (`trrc-saved-v1`), re-verified on every open, works during an API outage, refuses conflicting same-ID packages | Local (verified Oct 13, Chrome 16/16) | `public/browser-library.js`, `public/archive-bytes.js` |

Current public versions: three. The original sample `rrc-2026-10-09-uic000020838-v1` (5 inventory, 28 monthly), plus two Oct 10 collections for UIC 000020838 and UIC 000056484 (1 inventory, 16 monthly).

### 3.3 Dataset workspace — six tabs sharing one version identity

| Tab | What it does |
|---|---|
| **Overview** | Counts: inventory rows, monthly rows, distinct linked UICs. Also scope, schema/transformation version, coverage period and limitations. |
| **Records** | Search by UIC/API/operator number/lease/well. County and operator filters (acquired values only). Full inventory master table, plus a selected-well panel with identity, permit interval/limits and W-14/date. Monthly report selector and full monthly table: liquid/gas, average and max psi kept separate, calculated calendar-day bbl/d, source key, disposition, flags. **Monthly volume SVG chart**: missing values get no bar, zero gets a baseline marker. Explicit "no history acquired" message, distinct from zero. |
| **Data quality** | Reconciliation of raw/parsed/disposition counts and parent joins. Issue counts, quarantine reasons, data dictionary, and full `quality_report.json`. |
| **Sources** | Ledger of every original source: official URL, raw bytes (PDF/HTML/JSON), retrieval time, byte count, snapshot ID, SHA-256. Preserved HTML is shown as inert text. |
| **Downloads** | Whole-version TAR (hash/bytes/containment verified before sending). Six individual files: `inventory.csv`, `injection_monthly.csv`, `normalized.json`, `manifest.json`, `quality_report.json`, `data_dictionary.json`. Raw `sources/*` and `version-pins.json`. Downloads are never narrowed by UI filters. **Use in Injection Analytics** button: browser handoff, see §3.6. |
| **Collection details** | The run that produced this dataset, shown in the collection map (§3.4). |

URL hash routes (`#find`, `#datasets`, `#history`, `#help`, plus dataset routes with the version identity) survive refresh, back/forward and bookmarks. Times display in the browser's timezone; original UTC stays in the downloads.

### 3.4 Collection map and run history (screen "Collection history")

| Feature | Status | Key files |
|---|---|---|
| Fixed, read-only map of the three real stages (`load` → `normalize-qc` → `export`) plus the external Analytics boundary | Local | `public/workflow-ui.js`, `public/workflow.js` |
| Node inspector with tabs Overview / Inputs / Outputs / Raw evidence: hashes, URLs, counts, errors, times; arrow/Home/End keyboard navigation | Local | same |
| History of every recorded run (success, failure, offline replay, no-result), stored as `runs/<id>/record.json` (32 recorded). Viewing a run never switches the open dataset. | Local | `src/runEvents.mjs`, `GET/HEAD /api/runs[/<id>]` |
| Run log (chronological events, safe redacted errors) and raw run JSON download | Local | `public/workflow-ui.js` |

Limits by design: records are written only when a run finishes. There is no crash-safe live journal (except in guest mode), no Run/Retry/Schedule buttons, and no editing. Analytics acknowledgement is always "unrecorded".

### 3.5 Help (screen "Using the explorer")

Explains coverage, provenance, data limitations, quality rules and the Analytics handoff. It makes no RRC-endorsement claim and no automatic-import claim.

### 3.6 Analytics handoff

**Use in Injection Analytics** (Downloads tab) sends the complete verified TAR to the separately owned local Injection Analytics receiver in a new window. It then waits for receiver validation and explicit session confirmation. Cancel, navigation, version change, file fallback and failure states are covered by tests. Contract: `docs/adr/003-local-analytics-browser-handoff.md`; code: `public/analytics-handoff.js`. Status: **Local**. Producer side tested (55/55); coordinated browser acceptance with the receiver is still pending. Not available for guest datasets.

### 3.7 Data pipeline and CLI

| Feature | Command / file |
|---|---|
| Offline replay of the original sample, byte-compared, never rewritten | `node scripts/export.mjs` |
| New version from a collected source directory | `node scripts/export.mjs --source-dir … --artifact-id …` |
| Fresh fixed-scope official acquisition (7 targets, 30 s deadline and 10 MB cap per request, redirects refused) | `node scripts/acquire.mjs <new-source-dir> <artifact-id>` |
| Normalization: strings for all original IDs, null ≠ 0, parse-failure flags, quarantine of invalid/duplicate/ambiguous/unmatched rows, calendar-day rate = monthly bbl / Gregorian days | `src/normalize.mjs` |
| Immutable publication: staging, readback, exclusive per-version lock; conflicting/partial versions refused | `src/artifact.mjs`, `src/pipeline.mjs`, `src/exportCore.mjs` |
| Fixture vs public evidence separation: fixtures can never become a public dataset | `src/artifact.mjs`, tests |
| Isolated full test run in a fresh copy | `node scripts/check-isolated.mjs` (321/321 on Oct 14) |

Artifact contract: `normalized.json` = `{schemaVersion:1, artifactId, inventory, injectionMonthly, manifest, qualityReport, dataDictionary}`. Default browser pin: `public/artifact-path.json` + `public/artifact-integrity.json` (SHA-256 `2bc9bbbe…0f727`). The pin must not change without separate review.

### 3.8 Hosted backend (Supabase + Lovable)

| Feature | Status | Key files |
|---|---|---|
| Read-only hosted adapter: versions, runs, original evidence, byte-identical TAR from the private `trrc_archive` | Built; Edge healthy; **published site 503 until republish** | `src/hosted/catalog.mjs`, `archive-store.mjs`, `evidence-store.mjs`, `supabase-transport.mjs` |
| Same-origin hosting bridge (Lovable TanStack shell → Edge); PR #3 makes it pass through gzip/brotli upstream responses and logs fetch throws separately | Merged, **not republished** | `src/hosted/hosting-bridge.mjs`, `src/server.ts` |
| Guest collection: session token (`Authorization: Guest …`, never in URLs or logs), idempotent lookup/collection jobs, step-by-step advance loop, retry-after backoff, private guest dataset labelled "Guest dataset — private, expires", 3 archive downloads per 24 h | **Built, off**: rollout failed and was rolled back Oct 16 | `public/guest-client.js`, `src/hosted/guest-*.mjs` |
| Free-plan budgets: guest storage 250 MB, DB 50 MB, egress 1 GB/month. Admission refuses rather than evicts. `pg_cron` writes a platform proof every 5 min, and admission fails safe (`BUDGET_UNVERIFIED`) if proofs expire. | Migration **applied** on Oct 15; cron proof verified | `supabase/migrations/20261014000000_trrc_guest.sql`, `src/hosted/guest-admission.mjs` |
| Late-write-safe cleanup and orphan sweep of the private bucket `trrc-guest-evidence` | Built, off | `src/hosted/guest-journal.mjs`, `guest-steps.mjs` |
| "← Thai Phi portfolio" header link | Built, hidden (`PORTFOLIO_URL` is empty) | `public/portfolio-link.js` |

## 4. Not built (explicitly out of scope or open)

| Item | Requirement | Note |
|---|---|---|
| GIS / map of wells | RRC-07 (P1, open) | Needs source CRS, surface vs bottom-hole role, reliability and missing-coordinate rules. AGENTS.md forbids starting it without an authorized task. |
| Scheduled refresh / statewide or county-wide coverage | RRC-08 (P2, open) | Needs access limits, pagination/completeness, version diffs and expanded QC. |
| Deployment and portfolio return link | G3 (open) | Blocked by the republish and guest rollout above. |
| Table sorting, chart metric/zoom/date controls | — | Audited Oct 10 as never implemented. Source order is kept on purpose. |
| Manual QC override, original H-10 document revision IDs, annulus pressure fields | — | Not in the source data (ODP); disclosed as limitations. |
| Sign-in accounts, BHP/sustainable-capacity calculations, permitting, LLM features | — | Deliberate cuts in `SPEC.md`. |
| Hosted Analytics handoff for guest datasets | — | Out of scope in the guest design. |
| Live stage streaming and crash-safe journal for local runs | RRC-10 limit | Terminal-only records today. |
| Full accessibility audit | RRC-06 limit | Only focused keyboard checks were done. |

## 5. Unfinished work that blocks the live demo

These items are not new features, but any new feature that depends on the published site waits on them.

1. **Republish the Explorer on Lovable** with the PR #3 bridge fix, then confirm `/api/versions` returns 200 on https://texasrrcexplorer.lovable.app (Task 11 Step 6).
2. **Retry the guest rollout**: set `TRRC_GUEST_ENABLED`, redeploy the Edge function, then run the hosted smoke test from a machine with network access. The Oct 15 smoke test failed with `fetch failed` before any HTTP response, most likely because the agent's sandbox had no outbound network. Then do one live walkthrough.
3. Set `demoUrl` in phi-analytics and `PORTFOLIO_URL` here (rollout step 8).
4. Analytics receiver acceptance for the browser handoff.

Rollout notes and the work log are in `.superpowers/guest-live-backup/` (git-ignored, local only).

## 6. Rules any feature proposal must respect (from AGENTS.md, SPEC.md)

- Stay inside this repository's scope: bounded official UIC/H-10 acquisition, normalization, QC, versioned exports and browser inspection. Analytics and portfolio changes belong to their own repositories.
- No GIS or statewide refresh, and no invented public observations, without an authorized task.
- Never alter `raw/`, `artifacts/`, `runs/` or the default pin files. Keep raw bytes, original string IDs, missing ≠ zero, dictionary/QC/provenance and old versions.
- Never fake controls or status (no simulated progress, no invented acknowledgement).
- Guest work must stay inside the Supabase Free plan and fail safe.
- No new runtime dependencies for the Node core (it is dependency-free by design).
- Delegation: seven-field briefs, at most two active subagents, workers never commit; work in a worktree branch and merge through a PR.

## 7. Ideas that fit the existing design

These are starting points for the proposing agent, not commitments. Each one reuses data or code that already exists.

| Idea | Fits because | Watch out for |
|---|---|---|
| Table sorting and column chooser in Records | Pure presentation of existing rows | Must not imply a "preferred revision". Keep source order as the default. |
| Chart upgrades: pressure series (avg/max psi) beside volume, metric toggle, permit-limit reference line | Fields already normalized; permit maxima already shown | Label permit maxima as regulatory constraints, not capacity. Missing values must get no point or bar. |
| Version comparison (diff two versions of the same UIC) | Multiple immutable versions already exist | Compare by source keys; do not merge or overwrite. |
| Multi-well collection (a small batch of UICs) | Lookup/collect contract is per-well and could repeat | Changes guest budgets and RRC-08 territory, so it needs an owner decision. |
| CSV/XLSX export of the filtered view | Downloads exist | Must be clearly labelled as a filtered view, separate from the verified complete TAR. |
| Saved-dataset management (delete/rename label/export from IndexedDB library) | `browser-library.js` already lists and verifies | Labels must never be treated as origin proof. |
| Accessibility audit and fixes | RRC-06 open limit | — |
| Local live stage events / crash-safe journal | Guest journal already does this for hosted | Large change to the RRC-10 contract. |
| GIS map | RRC-07 planned | Needs explicit authorization first (AGENTS.md). |
