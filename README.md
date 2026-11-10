# Texas RRC Explorer

## Guest collection status (October 14, 2026)

Hosted guest collection is built and locally checked (321/321 tests; final review Ready). Its hosted rollout is pending, and it stays off until the Edge flag `TRRC_GUEST_ENABLED` is set. A local official guest collection was opened and downloaded, and its TAR SHA-256 matches the job record. Details: [local guest verification](docs/verification-2026-10-14-guest-local.md). The October 13 notes below remain the record for the read-only release.

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

**Watched documents (RRC-18, 2026-11-04):** **Watched documents** lists official RRC manuals, guidance, forms and announcement pages. **Check now** (local only, owner-pressed, no scheduler) fetches each once, keeps write-once copies and flags changes until you mark them reviewed; cited UIC manual pages in **Sources** open the saved PDF at that page. See [the live proof](docs/verification-2026-11-04-e12-lite.md).

**Latest navigation:** Start in **Find & collect**, enter an exact nine-digit UIC or eight-digit source API, choose a candidate, confirm 1–36 inclusive reporting months, and collect. Progress belongs to this request; live sub-stage events are unavailable. Use **Open this dataset** when the result is ready. **My datasets** opens preserved versions without changing the default pin. Inside a dataset, use **Overview / Records / Data quality / Sources / Downloads / Collection details**. **Collection history** inspects independent recorded runs, including failures; **Help** explains coverage and the Analytics handoff. Times display in your browser timezone. See the [feature matrix](docs/feature-preservation-2026-10-10.md), [current redesign evidence and limitations](docs/verification-2026-10-10-navigation-redesign.md), and [screenshot gallery](docs/screenshots-2026-10-10-navigation-redesign.md). Earlier navigation descriptions below are historical.

A dependency-free Node 24 acquisition/parser/export and browser inspection app for a bounded official UIC/H-10 slice. This is a separate SWD Intelligence Lab application. No deployment or statewide coverage is claimed.

**Latest integrity repairs:** Fixture classification now survives early replay failures; successful normalization requires both named output hashes/counts; direct artifact construction rejects values or source projections that differ from privately retained loaded evidence. The full suite passes 103/103 and fresh independent adversarial review passes 47/47. Both public versions, source/history files, UI and consumer pins remain unchanged. See [repair evidence](docs/verification-2026-10-10-integrity-fixes.md) and [independent review](docs/review-2026-10-10-integrity-fixes.md). These results close the three reported defects only.

**October 10 update:** The local website now supports real, bounded collection. In Workflow, enter an exact nine-digit UIC or eight-digit source API, inspect and explicitly select a candidate, then collect an inclusive window of 1–36 months. Each successful collection preserves sources, selection and retrieval evidence in a new immutable version and records the actual three-stage run. In Exports / history, select that version and download its complete verified TAR archive for Analytics. Version selection never changes the default pins. The live proof collected one inventory row and 28 public reports for UIC 000020838, January 2024–April 2026. See [current acceptance evidence](docs/verification-2026-10-10-acceptance.md), [bounded contract](docs/adr/002-bounded-well-selection.md) and [visual comparison](docs/visual-comparison-2026-10-10.md). Historical sections below describe the original pinned sample and earlier checks.

**Purpose:** Demonstrate reservoir-engineering and disposal/injection-well analysis skill and knowledge through reproducible engineering calculations and source-backed technical records.

**Deadline:** Before October 14, 2026; delivery must be complete before that date.

## Run the whole system (Docker)

One command starts Explorer, SWD Injection Analytics and Postgres ([design](docs/superpowers/specs/2026-11-05-zc02-docker-compose-design.md), issue #38):

```
docker compose up --build
```

- Explorer: http://127.0.0.1:4391
- Analytics: http://127.0.0.1:4290. Open a dataset in Explorer, then use **Downloads → Use in Injection Analytics**.
- Postgres keeps an index of collection runs and dataset versions. It is shown on **Collection history** and at `/api/health`. The files in this repository stay the record.
- Optional: export `TRRC_SOCRATA_APP_TOKEN` in your shell first. It is passed through and never written to a file.
- Stop with `docker compose down`. Add `--volumes` to also drop the index.
- Collections made inside the container (new runs, versions and source folders) live in the container only. They survive `docker compose stop`/`start` and restarts, but are lost when the container is rebuilt or removed (`up --build`, `down`). The datasets shipped in this repository are always present. Run Explorer directly with `npm start` to keep new collections in your checkout.

Analytics is built from its own repository's Dockerfile at a pinned commit (see `docker-compose.yml`), so building needs internet access.

`.github/workflows/compose-smoke.yml` starts the same stack on every pull request. Run every test suite with `npm run test:all`.

Dev and production deploys, rollback and the one-time owner setup are in [docs/deployment.md](docs/deployment.md).

## Observability (ZC-05)

One Explorer well collection (`POST /api/collect`) sends traces, structured logs and metrics that share a trace ID to Grafana ([design](docs/superpowers/specs/2026-11-06-zc05-observability-design.md), issue #41). It uses no extra packages: `scripts/telemetry.mjs` sends OTLP/HTTP JSON with Node built-ins. Telemetry is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and a collector that is down never fails or slows a collection.

### Start it

Start the app first, then Grafana ([grafana/otel-lgtm](observability/compose.yaml) `0.37.0`, about 2 GB):

```
docker compose up --build -d
docker compose -f observability/compose.yaml up -d
```

Point the Explorer container at Grafana: set the variable in your shell and recreate Explorer (`docker-compose.yml` passes it through):

```
export OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318      # PowerShell: $env:OTEL_EXPORTER_OTLP_ENDPOINT="http://lgtm:4318"
docker compose up -d explorer
```

- Grafana: http://127.0.0.1:3000 (anonymous, read-only Viewer). Dashboard **Explorer: well collection** (`/d/explorer-collect`); alert rule **Explorer collection failed** in folder Explorer.
- For `npm start` outside Docker, use `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`.
- The app compose file creates the `swd-app` network with a fixed subnet. Run `docker network create swd-app` **only** to start Grafana without the app (as CI does). If you create it by hand before the app, it lacks that subnet, and Explorer's write guard no longer matches the gateway.
- Optional: `OTEL_SERVICE_VERSION` (default: the `package.json` version) and `DEPLOYMENT_ENVIRONMENT` (default `local`).
- Stop with `docker compose -f observability/compose.yaml down`.

### What is collected

- **Traces:** `collect` with child spans `load` (with one `source.fetch` per source file), `normalize-qc`, `export` and `index.refresh` (only when the Postgres run index is configured, e.g. in Docker); `lookup` with its `source.fetch` spans; `handoff.package` when Analytics downloads a dataset.
- **Logs** (each with `trace_id` and `span_id`): `collect started`, `stage succeeded` / `stage failed`, `run finished` (run ID, outcome, failed stage, error code), `lookup finished`, `package served`.
- **Metrics** (Prometheus names): `rrc_collect_runs_total{outcome,stage,error_code}`, `rrc_collect_duration_seconds` (histogram), `rrc_source_fetch_total{source_name,outcome}`, `rrc_handoff_packages_total{outcome}`.
- **Allowed attributes** (anything else is dropped by the sender): `run.id`, `lookup.id`, `transfer.id`, `stage`, `outcome`, `error.code`, `source.name`, `server.address`, `row.count`, `test_fixture`, `app_token_used`, `http.route`, `http.response.status_code`. Metric labels: `stage`, `outcome`, `error_code`, `source_name`.
- **On every signal:** `service.name=explorer`, `service.version`, `deployment.environment.name`, and a random `service.instance.id` per process (Prometheus label `instance`), so each process counts in its own series.

### What is never collected

Well identifiers (UIC, API number), dataset `artifactId`s, URLs or query strings, `$where`, request headers, the Socrata token, and free-text error messages. Errors appear only as the existing error codes. A privacy test checks every exported payload. Health checks, static files and watch routes are not traced.

### Deviations

- Production (the Supabase Edge Function) is not observed, and hosted collection is off (D7). Telemetry covers local Docker, `npm start`, CI and Codespaces.
- "Build once, promote the same image" does not apply: production is an Edge Function, not this image.
- No exemplars (metric-to-trace links). The trace ID is on every span and log; metrics share the `stage`/`outcome`/`error_code` labels; the `run finished` log ties each counted run to its trace.
- The trace across the handoff into Analytics is deferred (#54).

### CI proof

The `observability` workflow (`.github/workflows/observability.yml`) starts Grafana and the alert receiver, runs a success and a forced-failure fixture collect with no network (`node scripts/collect-fixture.mjs --both`) plus a second failure in a new process, and reads everything back through Grafana as the Viewer (`observability/collect-evidence.mjs`). Its 11 checks: traces and logs for both runs, the success and failure metrics (2 failures, one series per process), the alert expression, the provisioned dashboard and alert rule, the rule in state firing, and Grafana's firing webhook saved by the receiver. The `observability-evidence` artifact holds the JSON, the saved webhook bodies and the receiver log.

The Loki lookup by trace ID relies on otel-lgtm `0.37.0` storing `trace_id` as structured metadata. Re-run the `observability` workflow when bumping the image tag.

### Codespace demo

1. Open a GitHub Codespace on this repository. Check `node --version` (24 or higher) and `docker --version` there.
2. In the Codespace, run the commands in [Start it](#start-it).
3. From a terminal on your own machine, forward the ports with the same numbers: `gh codespace ports forward 4391:4391 4290:4290 3000:3000` (add `-c <codespace-name>` to pick one). VS Code desktop connected to the Codespace also works if it keeps the same local port numbers.
4. In your local browser, open Explorer at http://127.0.0.1:4391, look up a well and run one real collection. Analytics is at http://127.0.0.1:4290 and Grafana at http://127.0.0.1:3000. The port numbers must stay the same, because Explorer's write guard and the Analytics handoff check exact loopback origins. The Codespaces browser preview URLs (`*.app.github.dev`) are refused for writes on purpose.
5. In Grafana, open the dashboard, then **Explore → Tempo** to see the `collect` trace and its logs.
6. Back in the Codespace, force a failure and watch the alert arrive. Codespaces run Linux Docker, where Grafana reaches the host on a non-loopback address, so give Grafana and the receiver a token of your own first:
   ```
   export ALERT_WEBHOOK_TOKEN=$(openssl rand -hex 16)
   docker compose -f observability/compose.yaml up -d --force-recreate
   npm run alert:receiver -- --bind 0.0.0.0     # leave running; in a second terminal (same token exported):
   npm run alert:trigger
   ```
   See [On call](#on-call).

### On call

**Alert (ZC-06, issue #42).** The Grafana rule **Explorer collection failed** fires when a well collection has failed in the last 5 minutes (`rrc_collect_runs_total{outcome="failed"}` rose, or a new process reported a failure). That is a failure the user sees, not a resource graph; rejected requests (bad input, wrong origin) do not count. Grafana sends that rule, and only that rule, to the local responder's webhook, `POST http://host.docker.internal:8001/alerts` with a bearer token. The responder that acts on it is the [on-call agent](#on-call-agent-zc-07) below.

Trigger it on demand, with Grafana running ([Start it](#start-it)):

```
npm run alert:receiver        # terminal 1: listens on 127.0.0.1:8001 and saves each alert to tmp/alerts/
npm run alert:trigger         # terminal 2: one forced-failure fixture collect, no network
```

- About 45 seconds later the rule shows **Firing** in Grafana (Alerting → Alert rules) and the receiver prints `firing Explorer collection failed -> tmp/alerts/...-firing.json`. That file is Grafana's webhook body: labels, summary, runbook and dashboard links, and start time.
- About 5 minutes after the last failure the rule returns to Normal and the receiver saves a `-resolved.json` body within 30 seconds.
- A second failure while the rule is still firing keeps it firing; it does not send a new webhook (repeats come after 1 hour). For a clean retake, wait for the resolved message first.
- Docker Desktop (Windows, macOS) reaches a receiver on 127.0.0.1. On Linux Docker (CI, Codespaces) add `-- --bind 0.0.0.0`.
- The token is `ALERT_WEBHOOK_TOKEN` for both Grafana (`observability/compose.yaml`) and the receiver. Its default, `explorer-local-alert-token`, is a local-only placeholder, not a secret, so the receiver refuses to start with it on any address other than loopback. Set your own in both places first, as in the [Codespace demo](#codespace-demo); CI generates one per run.
- `collect-evidence.mjs` counts only webhook files saved after its fixture file, so a firing file from an earlier demo cannot pass for a new run. Grafana reads the alerting files at start, so recreate it after a change: `docker compose -f observability/compose.yaml up -d --force-recreate`.

#### On-call agent (ZC-07)

**Responder (ZC-07, issue #43).** When the alert fires, the responder starts Claude Code headless as the [`on-call-engineer`](.claude/agents/on-call-engineer.md) subagent, which follows the [`incident-response`](.claude/skills/incident-response/SKILL.md) skill. `oncall:break` plants a real bug on a demo branch. The agent diagnoses it from the alert and the telemetry, fixes it, and opens a PR with the diagnosis.

Prerequisites: the observability stack running ([Start it](#start-it)), Claude Code installed and logged in, and `gh` logged in for the repository's account (`thaiphi`).

| Step | Command | What happens |
|---|---|---|
| 0 | [Start it](#start-it) | Grafana/LGTM running with the ZC-06 alert and contact point |
| 1 | `npm run oncall:break` | Creates the worktree `tmp/oncall-demo` on a new branch `oncall-demo/<UTC stamp>` from `origin/main`, plants the bug, commits it and pushes the branch (the PR needs a remote base). Refuses if `tmp/oncall-demo` exists. Add `-- --no-push` to keep it local. |
| 2 | `GH_TOKEN=$(gh auth token -u thaiphi) npm run oncall:responder` (bash), or in PowerShell `$env:GH_TOKEN = gh auth token -u thaiphi; npm run oncall:responder` | The ZC-06 receiver with `--respond`; leave it running |
| 3 | `npm run oncall:trigger` | One success-mode fixture collect from the demo worktree to `127.0.0.1:4318`, no network. The bug makes it fail for real. |
| 4 | — | About 45 seconds later the alert fires, the webhook is saved under `tmp/alerts/`, the responder starts Claude and the agent opens the PR |
| 5 | `npm run oncall:reset` | Removes the demo worktree. The remote demo and fix branches and the PR stay as evidence. |

Why a PR between two throwaway branches: the bug must never reach `main`, so the agent fixes it where it lives, on the demo branch, and the PR diff shows exactly the fix.

- **The agent may** read the repository, run tests and fixture collects, query local Grafana read-only, edit source to fix the bug, commit and push an `oncall-fix/<stamp>` branch cut from the demo branch, and open one PR whose base is the demo branch. If the failure is not a code bug, it writes a report and opens no PR.
- **The agent may never** merge, push to `main` or force-push, edit the Analytics repository, read `.env`, secrets or tokens, run `gh auth switch` or `gh auth login`, or call the RRC network.
- The alert resolves on a 5-minute timer; `oncall:verify` is what shows the fix works. After the PR opens, run `npm run oncall:verify` (before `oncall:reset`): it repeats the collect from the demo worktree, now on the agent's fix branch, and Grafana shows a succeeded run.
- Each run's files land in `tmp/oncall/<stamp>/`: `alert.json` (the webhook), `settings.json` (the agent's permissions), `agent.jsonl` (its full stream-json log) and the agent's `report.md`. The responder ignores resolved webhooks, runs one agent at a time, stops it after 20 minutes, removes `ALERT_WEBHOOK_TOKEN` and `OTEL_*` from its environment, and turns off Claude Code auto memory so the owner's memory never reaches it. Evidence is committed under `docs/evidence/` after the recorded run.
- Before a recorded run, clear `tmp/oncall/` (for example `Remove-Item -Recurse -Force tmp/oncall`): old run logs hold earlier answers.
- The demo's own tests are outside `npm test`, in `test/oncall/`; run them with `npm run test:oncall` (CI runs both).
- Delete old demo branches with `git push origin --delete oncall-demo/<stamp> oncall-fix/<stamp>`.

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

## License

Copyright (c) 2026 Thai Phi. Licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only); see [LICENSE](LICENSE). Anyone who distributes this software, or runs a modified version as a network service, must make its complete source available under the same licence. For use under other terms, contact the copyright holder.

Owner decision D19, 2026-11-05. Versions up to commit `4b4977e` were briefly published under MIT on the same day; later versions are AGPL-3.0-only.

Source data comes from the Railroad Commission of Texas and the Texas Open Data Portal and keeps its own terms.
