# Texas RRC Explorer + SWD Injection Analytics

One system in two repositories, submitted together for the [AI Dev Tools Zoomcamp](https://github.com/DataTalksClub/ai-dev-tools-zoomcamp/tree/main/project) final project.

- **Explorer** (this repository, [`thaiphi/texas-rail-sync`](https://github.com/thaiphi/texas-rail-sync)) collects and checks official well records.
- **Analytics** ([`thaiphi/well-injection-insights`](https://github.com/thaiphi/well-injection-insights)) analyses them.

| Try it | Link |
|---|---|
| Live Explorer (browse saved datasets) | https://texasrrcexplorer.lovable.app |
| Live Analytics (click **Take the guided tour**) | https://swdinjectionanalytics.lovable.app |
| Demo video (about 5 minutes) | *link added after recording* |
| Whole system on your computer | [`docker compose up --build`](#run-the-whole-system-docker) |

## The problem

Oil wells in Texas bring up large volumes of salt water. It is pumped back underground through disposal wells, and the Railroad Commission of Texas (RRC) regulates every one of them. The RRC publishes the records an engineer needs to judge a disposal well:
- the permit, with its pressure and volume limits;
- monthly injection reports (form H-10);
- pressure tests, casing and plugging records.

They are spread across separate portals and datasets, with no link between a report and the source it came from. Engineers copy them into spreadsheets by hand. Mistakes are easy, and nobody can later prove which numbers came from where.

## What the system does

1. **Find a well.** In Explorer, enter a well's 9-digit UIC number or 8-digit API number. Explorer looks it up in the official RRC inventory and shows the candidates; you choose one.
2. **Collect.** Choose 1–36 reporting months. Explorer downloads the official records, keeps the original bytes, converts them into clean tables and runs quality checks. A missing month stays missing; it is never turned into a zero.
3. **Review.** Each collection becomes a new, unchangeable dataset version with its sources, quality report and data dictionary. Earlier versions are never overwritten.
4. **Hand over.** **Downloads → Use in Injection Analytics** sends the whole version to Analytics in the browser. Analytics checks every file hash before showing anything and waits for you to confirm.
5. **Analyse.** Analytics shows the injection history and screens the pressures. For each month, it estimates the pressure at the bottom of the well from the reported surface pressure, then compares it with the regulatory and permit limits (**WHP/BHP reconciliation**). It also compares planned water volumes with injection capacity.

**Expected behaviour:**
- Every number can be traced to its official source file and hash.
- Bad or unexpected source data is quarantined and shown, never silently fixed.
- A failed collection is recorded with the stage and error code where it failed. It fires an alert, and an AI on-call agent investigates (see [On call](#on-call)).
- Results are screening estimates for education, not a regulatory or engineering approval.

**What runs where:**
- **Live sites:** you browse saved datasets in Explorer and use Analytics. Collecting new wells is switched off there on purpose: public collection needs abuse limits and cost controls that are not finished.
- **Your computer (Docker):** the whole flow runs, including live collection, the handoff, and monitoring.

```
 RRC open data ──► Explorer ──(hash-checked package, in the browser)──► Analytics
                   │  Node server + browser UI          browser app: calculations run locally
                   ├─ Postgres: index of runs and dataset versions
                   └─ OpenTelemetry ──► Grafana (traces, logs, metrics) ──► alert ──► on-call agent
```

## For reviewers: where each criterion is shown

| Criterion | Where to look |
|---|---|
| Problem description | This page: [The problem](#the-problem), [What the system does](#what-the-system-does) |
| Product specification | [SPEC.md](SPEC.md) (Explorer contract), [requirements](docs/requirements.md), [Analytics product spec](https://github.com/thaiphi/well-injection-insights/blob/main/swd-injection-analytics/product-spec.md). Public tracker: [Zoomcamp milestone](https://github.com/thaiphi/texas-rail-sync/milestone/1) and [all issues](https://github.com/thaiphi/texas-rail-sync/issues). Each issue has acceptance criteria, and agents post their evidence on it before closing, for example [#43](https://github.com/thaiphi/texas-rail-sync/issues/43). |
| Agent team | [docs/agent-team.md](docs/agent-team.md) (roles, who may do what, how work flows) and [docs/agent-workflow.md](docs/agent-workflow.md) (delegation rules). Project agent and skill: [`.claude/agents/`](.claude/agents/), [`.claude/skills/`](.claude/skills/) |
| Context management | [AGENTS.md](AGENTS.md), with a docs map pointing to process, team, decisions ([docs/adr/](docs/adr/)), designs and plans ([docs/superpowers/](docs/superpowers/)) |
| Application | Browser UI ([`public/`](public/)), Node backend ([`scripts/serve.mjs`](scripts/serve.mjs)) and Postgres run index ([`src/runIndex.mjs`](src/runIndex.mjs)), started together by [one command](#run-the-whole-system-docker) |
| Testing | `npm run test:all`: Node unit and integration tests (including a real Postgres test and end-to-end collection fixtures) plus the browser UI tests (vitest). [CI](.github/workflows/ci.yml) runs them on every pull request. |
| Containerization | [`docker-compose.yml`](docker-compose.yml): Explorer, Analytics and Postgres, with one command. [compose-smoke](.github/workflows/compose-smoke.yml) starts it on every pull request. |
| Deployment | The two live sites above. Details: [docs/deployment.md](docs/deployment.md) |
| CI/CD | See [CI/CD](#cicd) below |
| Observability | [Observability](#observability-zc-05): traces, structured logs and metrics sharing one trace ID, in Grafana |
| Alerting on user impact | [On call](#on-call): **Explorer collection failed** fires when a user's collection fails, not on CPU |
| On-call agent | [On-call agent](#on-call-agent-zc-07). The recorded run is in [docs/evidence/zc-07-2026-11-10/](docs/evidence/zc-07-2026-11-10/RUN.md): alert → agent diagnosis → [fix PR #59](https://github.com/thaiphi/texas-rail-sync/pull/59) |

## CI/CD

| Stage | When | What it does |
|---|---|---|
| [`ci`](.github/workflows/ci.yml), [`compose-smoke`](.github/workflows/compose-smoke.yml), [`observability`](.github/workflows/observability.yml) | Every pull request | All tests with a Postgres service; the whole Docker system; the telemetry and alert path |
| [`deploy-dev`](.github/workflows/deploy-dev.yml) | Automatically, after `ci` passes on `main` | Deploys that commit to a dev copy of the backend and checks it ([example run](https://github.com/thaiphi/texas-rail-sync/actions/runs/42765315871)) |
| [`deploy-prod`](.github/workflows/deploy-prod.yml) | By hand, with the owner's approval | Deploys a commit from `main` that passed its tests to production, then checks the live site. Rollback: run it again with the previous good commit. |

**What "dev" is here.** The dev environment is a complete Supabase copy (database, API gateway and function runtime) that the `deploy-dev` job starts inside GitHub Actions. It deploys there, checks the result and is removed when the job ends. This was a deliberate choice: a second permanent Supabase project would add cost and lock-in for a portfolio project. Each run's log is the record of the dev deploy. Analytics is a static site that Lovable rebuilds from `main`; its production release is a manual Publish.

Analytics has its own CI in [its repository](https://github.com/thaiphi/well-injection-insights/actions).

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
- Each run's files land in `tmp/oncall/<stamp>/`: `alert.json` (the webhook), `settings.json` (the agent's permissions), `agent.jsonl` (its full stream-json log) and the agent's `report.md`. The responder ignores resolved webhooks, runs one agent at a time, stops it after 20 minutes, removes `ALERT_WEBHOOK_TOKEN` and `OTEL_*` from its environment, and turns off Claude Code auto memory so the owner's memory never reaches it. The recorded run of 2026-11-10 is in [`docs/evidence/zc-07-2026-11-10/`](docs/evidence/zc-07-2026-11-10/RUN.md): alert → agent → [fix PR #59](https://github.com/thaiphi/texas-rail-sync/pull/59) in 3.6 minutes.
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

Pressure means public reported injection pressure in source psi. Calendar-day rates are calculated, not observed daily rates. Permit maxima are regulatory constraints, not sustainable capacity. ODP does not provide annulus fields or original H-10 document revision identities. No GIS, permitting, LLM, credentials or synthetic public records are included. The live deployments are listed at the [top of this page](#texas-rrc-explorer--swd-injection-analytics).

## License

Copyright (c) 2026 Thai Phi. Licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only); see [LICENSE](LICENSE). Anyone who distributes this software, or runs a modified version as a network service, must make its complete source available under the same licence. For use under other terms, contact the copyright holder.

Owner decision D19, 2026-11-05. Versions up to commit `4b4977e` were briefly published under MIT on the same day; later versions are AGPL-3.0-only.

Source data comes from the Railroad Commission of Texas and the Texas Open Data Portal and keeps its own terms.
