# Texas RRC Explorer

## Guest collection status (October 14, 2026)

Hosted guest collection is built and locally checked (321/321 tests; final review Ready). Its hosted rollout is pending, and it stays off until the Edge flag `TRRC_GUEST_ENABLED` is set. Opening and downloading an officially collected guest dataset is not yet verified: RRC's help server was too slow on this machine, and the hosted smoke test will cover it. Details: [local guest verification](docs/verification-2026-10-14-guest-local.md). The October 13 notes below remain the record for the read-only release.

## Release status (October 13, 2026)

This is the current state; the dated banners below are historical and superseded where they conflict.

**Delivered:**
- Local bounded UIC/H-10 collection, normalization/QC, immutable versioned exports and browser inspection (`node scripts/serve.mjs`).
- Hosted read-only browsing (Lovable preview backed by the private Supabase archive): saved versions, sources, quality reports, recorded runs and byte-identical TAR downloads.
- Analytics browser handoff.

Default pin SHA-256 `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727` and all raw/artifact/run evidence are unchanged.

**Not in this release: hosted guest collection.** The guest backend is built and locally gated: journal/budget SQL drafts pass 22/22 in disposable PostgreSQL, native Storage passes 8/8 and local Edge probes pass. It is **disabled in production**. The SQL drafts are not applied. The Edge entrypoint does not mount guest routes, and the browser has no guest wiring. Open release blockers are listed in [the storage/admission checkpoint](docs/verification-2026-10-13-storage-admission.md#remaining-release-gaps): hosted secret-key/PostgREST behavior, Free-plan headroom, late-write/orphan cleanup, browser integration and an end-to-end walkthrough.

**Earlier resumption (October 11):** Lovable MCP authorization is restored. The [working preview](https://f0e9357f-02d2-4f69-8979-05a2e7bda2b3.lovableproject.com/#datasets) shows all three verified dataset versions; original-example records and29 historical runs were inspected. The older `id-preview` address returned503 with unverified origin. Some full production Node runs passed **186/186**, but the latest unmodified-application run is **183/186 PASS,3 FAILED** on publication renameEPERM. A standalone filesystem probe also reproducedEPERM without importing application code; its responsible Windows/sandbox component remains unknown. `node scripts/check-isolated.mjs` preserves every check in a fresh copy. Protected data/pins remain unchanged. Hosted sign-in/collection and release acceptance remain unfinished. See [runtime options requiring a decision](docs/hosted-collection-options-2026-10-11.md), [hosting verification](docs/verification-2026-10-11-lovable-hosting.md) and the [computer migration handover](docs/HANDOVER-2026-10-11.md); older checkpoint summaries below are historical.

**Lovable browsing integration (October 11):** Lovable's original TanStack hosting configuration now wraps the preserved Explorer interface. Saved public versions, sources, quality reports, recorded runs and downloads use the verified Supabase backend; collection/sign-in remain unavailable in the hosted preview and local collection still works. Build, type-check and changed-file lint pass; full isolated tests pass **185/185**. See [hosting evidence and remaining collection work](docs/verification-2026-10-11-lovable-hosting.md). `build` now builds the website; the previous artifact-export command is preserved as `build:artifact` and `node scripts/export.mjs`.

**Latest hosted-backend checkpoint (October 11):** The private Supabase archive now has a tested read-only adapter for versions, recorded runs, original evidence and byte-identical TAR downloads. The final isolated suite passes **169/169** with normal user access; no filesystem permissions were changed. Independent review found no material defect in this checkpoint. The hosted UI, authorization and live collection are not connected or deployed. See [checkpoint evidence and remaining release work](docs/verification-2026-10-11-hosted-adapter.md). Earlier sandbox failures below are historical.

**Latest bounded handoff repair:** Four sender validation defects are fixed and independently reviewed; focused checks pass84/84. The full isolated suite still fails37 checks under existing filesystem/socket restrictions. Quarantined-record handoff requires matching Analytics eligibility changes and remains unresolved within the Explorer-only edit boundary. See [repair evidence and dependencies](docs/verification-2026-10-11-bounded-handoff-fixes.md). No dataset, pin, deployment or permission changes were made.

**October11 producer checkpoint:** Downloads adds **Use in Injection Analytics** for the configured local apps. It transfers the complete verified version to a new receiver window for validation and explicit session confirmation; existing downloads and default pins remain unchanged. Producer tests pass55/55 and independent production review passed, while coordinated browser acceptance remains pending. See [transport contract](docs/adr/003-local-analytics-browser-handoff.md) and [current evidence/limitations](docs/verification-2026-10-11-analytics-handoff.md).

**Latest navigation:** Start in **Find & collect**, enter an exact nine-digit UIC or eight-digit source API, choose a candidate, confirm 1–36 inclusive reporting months, and collect. Progress belongs to this request; live sub-stage events are unavailable. Use **Open this dataset** when the result is ready. **My datasets** opens preserved versions without changing the default pin. Inside a dataset, use **Overview / Records / Data quality / Sources / Downloads / Collection details**. **Collection history** inspects independent recorded runs, including failures; **Help** explains coverage and the Analytics handoff. Times display in your browser timezone. See the [feature matrix](docs/feature-preservation-2026-10-10.md), [current redesign evidence and limitations](docs/verification-2026-10-10-navigation-redesign.md), and [screenshot gallery](docs/screenshots-2026-10-10-navigation-redesign.md). Earlier navigation descriptions below are historical.

A dependency-free Node 24 acquisition/parser/export and browser inspection app for a bounded official UIC/H-10 slice. This is a separate SWD Intelligence Lab application. No deployment or statewide coverage is claimed.

**Latest integrity repairs:** Fixture classification now survives early replay failures; successful normalization requires both named output hashes/counts; direct artifact construction rejects values or source projections that differ from privately retained loaded evidence. The full suite passes 103/103 and fresh independent adversarial review passes 47/47. Both public versions, source/history files, UI and consumer pins remain unchanged. See [repair evidence](docs/verification-2026-10-10-integrity-fixes.md) and [independent review](docs/review-2026-10-10-integrity-fixes.md). These results close the three reported defects only.

**October 10 update:** The local website now supports real, bounded collection. In Workflow, enter an exact nine-digit UIC or eight-digit source API, inspect and explicitly select a candidate, then collect an inclusive window of 1–36 months. Each successful collection preserves sources, selection and retrieval evidence in a new immutable version and records the actual three-stage run. In Exports / history, select that version and download its complete verified TAR archive for Analytics. Version selection never changes the default pins. The live proof collected one inventory row and 28 public reports for UIC 000020838, January 2024–April 2026. See [current acceptance evidence](docs/verification-2026-10-10-acceptance.md), [bounded contract](docs/adr/002-bounded-well-selection.md) and [visual comparison](docs/visual-comparison-2026-10-10.md). Historical sections below describe the original pinned sample and earlier checks.

**Purpose:** Demonstrate reservoir-engineering and disposal/injection-well analysis skill and knowledge through reproducible engineering calculations and source-backed technical records.

**Deadline:** Before October 14, 2026; delivery must be complete before that date.

## Run

```powershell
node scripts/export.mjs
node --test test/*.test.mjs
node scripts/serve.mjs
```

Open http://127.0.0.1:4174. An optional positional port is supported: `node scripts/serve.mjs 4176`. No package installation, framework, database, login, API key or live source query is needed to inspect the pinned data. Node 24 or later is required. The default export is an offline replay: it compares the existing artifact byte for byte without replacing it and records that actual invocation.

## Pinned artifact and consumer

`artifacts/rrc-2026-10-09-uic000020838-v1/` contains `manifest.json`, `inventory.csv`, `injection_monthly.csv`, `quality_report.json`, `data_dictionary.json`, `normalized.json` and seven original files under `sources/`. Copy the complete folder into Analytics. `normalized.json` uses `{schemaVersion:1,artifactId,inventory,injectionMonthly,manifest,qualityReport,dataDictionary}`. Numbers are numeric or null; original identifiers are strings. Manifest hashes cover the four normalized contract files and every source snapshot. The manifest and its embedded copy are intentionally excluded from their own hash inventory; the consumer must pin the external manifest file's SHA256.

The verified slice is five inventory records and 28 exact-UIC-linked monthly rows for UIC `000020838`, January 2024–April 2026. The other four parents have no acquired history, not zero injection. Original source response bytes and retrieval metadata are in `raw/`; the artifact includes its own byte-identical copies so it stands alone.

See [SOURCE_PROOF.md](SOURCE_PROOF.md) for reconciliation, [SPEC.md](SPEC.md) for the contract, [GLOSSARY.md](GLOSSARY.md) for terms and [the requirement tracker](docs/requirements.md) for criterion-level evidence and open work. [Current verification](docs/verification-2026-10-09-core.md) supersedes only the explicitly identified historical gaps in [GATES.md](GATES.md).

## Refresh without destroying reproducibility

```powershell
node scripts/acquire.mjs raw-refresh-YYYYMMDD rrc-YYYY-MM-DD-uic000020838-v2
```

This collects two metadata endpoints, at most five inventory candidates, at most 1,000 monthly rows for UIC `000020838` starting January 2024, and three official documentation files. It requires a new source directory inside this repository, preserves raw bytes and retrieval sidecars, validates/normalizes them, then publishes the named new artifact. Each request has a 30-second deadline and a 10 MB response cap; redirects are refused. A failed collection retains partial raw evidence and an acquisition status marker; incomplete collections cannot be exported. Network execution may require host sandbox approval. The automated path has been checked with explicitly labeled test responses; no fresh live collection was performed for the current core verification.

Offline export of an already-collected snapshot is explicit:

```powershell
node scripts/export.mjs --source-dir raw-refresh-YYYYMMDD --artifact-id rrc-YYYY-MM-DD-uic000020838-v2
node scripts/export.mjs --offline-replay --expected-manifest-sha256 3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f
```

Source/output paths must remain inside this repository. Repeating an identical version verifies bytes without rewriting; a changed or incomplete existing version is refused. New versions are staged, checked and published under an exclusive version lock. Do not edit the exporter to select a snapshot. Review a new version before changing the browser's `public/artifact-path.json` and independent `public/artifact-integrity.json` pins or copying it into Analytics. The browser verifies manifest and normalized payload SHA256 before showing any data. The existing sample and its pins remain unchanged.

## Inspect records and runs

The full inventory table and quick selection list share county/operator/search filters. Details retain source identity, permit constraints and QC flags. The monthly table distinguishes missing values from zero; its volume chart gives missing observations no bar. Downloads always contain the complete pinned snapshot, independently of filters.

The fixed collection map shows source loading/preservation, normalization/linkage/QC, versioned export and the external Analytics boundary. Choose an invocation and select a node to inspect its counts, hashes, outputs and errors. The map is read-only; separate lookup and collection controls appear above it. Historical acquisition events remain **unrecorded**; instrumented offline replays are explicitly offline. Exporting never marks Analytics acknowledgement successful.

Actual terminal run records are preserved at `runs/<run-id>/record.json`; GET/HEAD `/api/runs` and `/api/runs/<run-id>` expose validated records. Demonstration fixtures cannot enter actual history. Each invocation has separate event IDs and times; failure records retain prior successes and downstream skips. Records are written at completion, so an interrupted process may leave no history; this is not continuous live monitoring. A history-write failure makes the CLI exit unsuccessfully even if artifact export completed, and does not invent an export failure or acknowledgement. Follow the printed diagnostic before relying on history availability.

Pressure means public reported injection pressure in source psi. Calendar-day rates are calculated, not observed daily rates. Permit maxima are regulatory constraints, not sustainable capacity. ODP does not provide annulus fields or original H-10 document revision identities. No GIS, permitting, LLM, credentials or synthetic public records are included. Portfolio and deployment destinations are not configured because no verified destination was supplied.
