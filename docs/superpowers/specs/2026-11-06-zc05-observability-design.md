# ZC-05 Observability design (issue #41)

Status: approved by the owner, 2026-11-06. Reviewed by Fable (`zc05-fable-review`, 2026-11-05) and checked against the Zoomcamp module `04-devops/01-devops-and-observability-for-ai-built-apps.md`, its lecture, and the Analytics session's deployment review (`well-injection-insights` `docs/zoomcamp-deployment-review-2026-11-06.md`).

## Why

The final project's Observability criterion (2 points) asks: "A key user journey is instrumented with metrics, traces, and structured logs that share a trace ID; no customer data or credentials are sent to telemetry; and the signals are collected, stored, and viewable in a UI." ZC-06 (alert, 1 point) and ZC-07 (on-call agent, 2 points) are built on top of it, so this design also lays their groundwork. The demo moment: a reviewer sees one well collection as a timeline in Grafana, clicks a step to see its logs, sees success and failure counts, then watches a failure turn red and raise the counter that the alert uses.

## Owner rulings (2026-11-06)

1. **Key journey = one Explorer collection** (`POST /api/collect`). The cross-app trace into Analytics is deferred to a later issue. Analytics' receiver rejects unknown handoff fields (`web/explorer-handoff.mjs`), so carrying a trace ID needs an Analytics change and its file-protection review first. Issue #41's "across both apps" line is amended to match; the rubric asks for "a key user journey".
2. **Sender: hand-rolled OTLP/HTTP JSON, built-ins only**, with a half-day time-box: if all three signals aren't visible in Grafana by then, switch to the official OpenTelemetry Node packages (manual spans only, no auto-instrumentation).
3. **Grafana runs as its own Docker setup** (`observability/compose.yaml`), started separately, joined to the app network. `docker compose up --build` still starts only the app, and `compose-smoke` keeps its checks.
4. **Real-collect screenshots and demo run in a GitHub Codespace.** The owner's PC can't run the stack (about 2 GB). CI proves everything with the fixture collect and no network.
5. **No dataset IDs in telemetry.** `artifactId` embeds the UIC (`rrc-…-uic000020838-…`); telemetry joins on `run.id` (a random UUID).
6. **On-call agent (ZC-07) works in a worktree branch and opens a PR; the owner merges.** The planted bug for the demo lives on `main` behind an off-by-default environment switch.

## Goals

- One trace per collection: root span `collect` with child spans for the existing run stages (`load`, then `normalize-qc`, `export` as recorded by `src/runEvents.mjs`, plus `index.refresh`), one `source.fetch` child per source request, and a `handoff.package` span when Analytics downloads a package (`GET /api/versions/<id>/download`). Lookup (`POST /api/lookup`) is its own small trace.
- Structured logs for the same requests, each carrying `trace_id` and `span_id`, including a run-finished line with `run.id`, outcome, failed stage, error code and duration.
- Metrics (names frozen to what Prometheus actually ingests, verified in CI): collections by outcome, stage and error code; collection duration (histogram); source fetches by source name and outcome; handoff packages served.
- Resource attributes on every signal: `service.name=explorer`, `service.version` (git commit or package version), `deployment.environment.name` (`local`, `ci`, `codespace`).
- A provisioned Grafana dashboard (3–4 panels) and a provisioned alert rule (the alert itself is ZC-06's to prove), both loaded from files in `observability/`.
- A CI workflow that starts the app and observability stacks, runs a fixture collect (success and forced failure), and reads the signals back from Tempo, Loki and Prometheus through Grafana. Its output is saved as an evidence file. ZC-07's responder will reuse the same script.

## Non-goals

- Tracing inside Analytics or across the handoff into Analytics (deferred, see ruling 1).
- Observing the hosted Lovable/Supabase production. It's disclosed in the README next to the "build once, promote the same image" deviation: production is a Supabase Edge Function with no collector, and hosted collection is off (D7).
- Exemplars (metric-to-trace links). Correlation is stated honestly: the trace ID is on every span and log; metrics share the `stage`/`outcome`/`error_code` labels; the run-finished log line ties each counted run to its trace ID.
- Auto-instrumentation of HTTP or fetch. It would record full URLs, which contain the well number.

## Anti-goals (would make this a failure even if it works)

- Any well identifier, record row, URL query string, request header, Socrata token or free-text error message in telemetry.
- Telemetry that can fail, slow or change a collection. Export errors are swallowed after one warning, and a collect with the collector down still returns 201.
- Changes to the run record (`record.json`), the evidence package (ADR 001/005), or any OpenTelemetry import under `src/`. `src/` is bundled into the Supabase Edge Function, and `deploy-dev` must stay green.
- Making `docker compose up` heavier, or adding dependencies to the gate (unless the time-box fallback is taken, as a recorded ruling).

## Constraints and decided how

- **Hook point.** `src/` exposes only an optional, injectable observer (for example `createRunRecorder({..., observer})`), which receives stage start, succeed and fail, plus source-fetch outcome events. With no observer, behaviour and output stay byte-for-byte the same. The sender and the span/log/metric mapping live in `scripts/` (for example `scripts/telemetry.mjs`), wired by `scripts/serve.mjs`.
- **Off by default.** Telemetry is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, the same pattern as `DATABASE_URL`. The app's compose file passes it through empty by default; the observability setup's instructions set it.
- **Single-flight server.** One collection at a time, so span context is passed explicitly; no async context manager is needed.
- **Sender behaviour.** W3C trace and span IDs from `crypto`. Spans and logs are sent when the request ends. Metrics are cumulative sums plus one explicit-bucket histogram, flushed on a 10 s timer and on shutdown. Each send is a fire-and-forget `fetch` with a 2 s timeout and no retries.
- **Allowed telemetry content.** Span and log attribute keys come from a fixed allowlist: `run.id`, `lookup.id`, `transfer.id`, `stage`, `outcome`, `error.code` (only codes from `ALLOWED_CODES` / `safeError`), `source.name` (file name such as `candidate-monthly.json`), `server.address`, `row.count`, `test_fixture`, `app_token_used` (boolean), `http.route`, `http.response.status_code`. Metric labels are only `stage`, `outcome`, `error_code` and `source_name`. Only the collect, lookup and download routes are traced; health checks and static files are not. The `write refused from peer` warning stays a local console line and is not exported.
- **Privacy is enforced by a test.** It injects the sender's `fetch`, runs a fixture collect (success and forced failure), and asserts no exported payload contains a query string, `$where`, a 9-digit UIC, `X-App-Token`, an `artifactId` or a key outside the allowlist.
- **Observability stack.** `observability/compose.yaml` runs `grafana/otel-lgtm` (pinned version), published on `127.0.0.1` only: Grafana on 3000, OTLP on 4318. Anonymous access is Viewer, which is the read-only path ZC-07 needs. The provisioning path is set explicitly; the dashboard and alert are mounted from `observability/`. The app's compose names its network explicitly so the second setup can join it.
- **Groundwork for ZC-06 and ZC-07.**
  - Alert rule file: failed collections > 0 over 5 minutes, evaluated every 10 s, `for` 30 s. Labels `service`, `journey`; annotations for the dashboard URL, runbook and summary.
  - `observability/collect-evidence.mjs`: read-only, allowlisted queries, writes one evidence JSON.
  - `scripts/collect-fixture.mjs`: one no-network fixture collect against a running server, with a `--fail` switch that produces a distinct allowed error code.

## Builder-check answers (main session's calls, 2026-11-06)

- **How CI produces a no-network collect.** `scripts/collect-fixture.mjs` starts its own in-process Explorer server with `createExplorerServer({testFixture: true, fetchImpl: <canned responses from test/fixtures>})` and telemetry pointed at the observability stack. It runs a lookup, then a collect, over HTTP against that server. The shipped image gets no fixture mode. The containerised Explorer's telemetry is shown with a real collect in the Codespace demo.
- **`--fail`.** It selects canned data that fails one of the pipeline's existing checks, so the error code comes from `ALLOWED_CODES` and no new codes are added. The builder picks the stage, and the CI assertion and the alert annotation use whatever stage and code it produces.
- **Hook point.** `src/` functions on the collect, lookup and download paths (`collectPublicSnapshot`, `exportArtifact`, the fetch helpers, `performLookup`) may gain one optional `observer` parameter. Without it, behaviour and output are unchanged. `src/` gets no new imports. The Edge Function bundle may change only by that unused parameter, and `deploy-dev` must stay green.
- **Traced routes.** Collect (the key journey), lookup (root span plus `source.fetch` children) and package download (`handoff.package`). Watch-check is not traced.
- **Network.** `docker-compose.yml` gets one change: the app network is given an explicit `name: swd-app`, so `observability/compose.yaml` can join it as an external network. The subnet and gateway stay the same. The observability container has its own address in that subnet, which is not the trusted gateway, so the write guard still refuses its requests. It never sends writes anyway.
- **`index.refresh`.** The root span and the request's logs are sent when the response ends. `index.refresh` is its own span in the same trace, sent when the refresh finishes.
- **`service.version`.** It comes from `OTEL_SERVICE_VERSION` if set, otherwise from the `package.json` version. CI sets it to the commit SHA, and compose passes it through empty by default. The Dockerfile is unchanged.
- **The planted bug** belongs to ZC-07. ZC-05 only provides the `--fail` seam.

## Left to the builder

Exact span and metric names before ingest (the frozen names are the ingested ones); histogram buckets; dashboard layout; whether the CI job is a new workflow or a job in `compose-smoke.yml`; how `--fail` forces the failure, as long as it's in-process fixture data and never a live request.

## Acceptance (mirrors issue #41, as amended)

- CI, green: from one fixture collect, one trace ID is found in Tempo (spans for `collect` and its stages) and in Loki (log lines). The collections counter in Prometheus counts the run, and a forced failure increments `outcome=failed` with its stage and error code. The dashboard and alert rule exist via provisioning. The evidence JSON is uploaded as a workflow artifact.
- The privacy test passes. A collect with the collector down returns 201 and the full suite still passes. `deploy-dev` stays green, with no change to the Edge Function bundle.
- The README documents: how to start observability, what is collected and what never is, the deviations, and the Codespace demo steps. A screenshot from a real Codespace collect is attached to #41.
