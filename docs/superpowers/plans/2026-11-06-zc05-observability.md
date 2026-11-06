# ZC-05 Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Explorer collection becomes one trace with matching logs and metrics. These are sent over OTLP to a separate Grafana (otel-lgtm) setup and proven by CI with a no-network fixture collect.

**Architecture:**
- `src/` gets one optional `observer` callback on the source-fetch path, and nothing else.
- Stage spans are derived after the fact from the run record that `src/runEvents.mjs` already writes (its `running`/`succeeded`/`failed` event timestamps), so the record never changes.
- A built-ins-only sender, `scripts/telemetry.mjs`, turns spans, logs and metrics into OTLP/HTTP JSON. `scripts/serve.mjs` wires it in only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `observability/` holds the Grafana setup, the provisioning files, and a read-only evidence script that CI runs.

**Tech Stack:** Node 24 ESM built-ins (`node:crypto`, global `fetch`, `node:test`), `grafana/otel-lgtm` (Docker), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-06-zc05-observability-design.md` (approved 2026-11-06). Issue #41 (amended); cross-app tracing is deferred to #54.

## Global Constraints

- **No new dependencies.** `test/watch-gates.test.mjs` `BASELINE_DEPENDENCIES` stays unchanged. There is no OpenTelemetry package anywhere, and `src/` gains no import.
- **Telemetry is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set and non-empty.** Signals go to `<endpoint>/v1/traces`, `/v1/logs` and `/v1/metrics`.
- **Telemetry never fails, slows or changes a request.** Sends are not awaited by request handlers; each `fetch` has a 2 s timeout (`AbortSignal.timeout(2000)`) and no retries. Export errors produce one `console.warn` per process, then silence.
- **Span/log attribute keys:** only `run.id`, `lookup.id`, `transfer.id`, `stage`, `outcome`, `error.code`, `source.name`, `server.address`, `row.count`, `test_fixture`, `app_token_used`, `http.route`, `http.response.status_code`. Anything else is dropped by the sender.
- **Metric labels:** only `stage`, `outcome`, `error_code`, `source_name`.
- **Never in telemetry:** a well identifier (UIC, API number), `artifactId`, a URL or query string, `$where`, a request header, the Socrata token, or a free-text error message. Error codes only, and only the codes already produced by `ALLOWED_CODES` / `safeError`.
- **Resource attributes on every signal:**
  - `service.name=explorer`;
  - `service.version` = `OTEL_SERVICE_VERSION`, or else the `package.json` `version`, or else `"0.0.0"` when `package.json` has none;
  - `deployment.environment.name` = `DEPLOYMENT_ENVIRONMENT`, or else `local`.
- **Traced routes:** `POST /api/collect`, `POST /api/lookup`, `GET|HEAD /api/versions/<id>/download`. Not traced: watch routes, health checks and static files. The `write refused from peer` warning stays console-only.
- **Metric flushing:** every 10 s on an `unref()`'d timer, and on `shutdown()`. Sums are cumulative (`aggregationTemporality: 2`).
- **Unchanged:** `record.json`, the evidence package, the ADRs and `Dockerfile`. `docker compose up --build` still starts only the app, and `compose-smoke` keeps its checks.
- **Observability setup:** `grafana/otel-lgtm` with an exact pinned tag (never `latest`). Ports bind to `127.0.0.1` only: Grafana on 3000, OTLP/HTTP on 4318. Anonymous Viewer access.
- **The app network** in `docker-compose.yml` gets `name: swd-app`; its subnet and gateway are unchanged.
- **Time-box (owner ruling 2):** if Task 6 can't show all three signals in Grafana within half a day of Task 2 starting, stop and report. The fallback (official OTel Node packages, manual spans) is a recorded ruling with a gate update, never a silent switch.
- **Commits:**
  - end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - workers never stage, commit or push; the main session does;
  - work only in worktree `.claude/worktrees/zc-05`, branch `zc-05/observability`.

## Review Focus

1. **A collector that is down, refuses connections or hangs.** A collect still returns 201 promptly, with no unhandled rejection and one warning only. Owned by the Task 3 tests `collector down` and `collector hangs`.
2. **A collect rejected before a run exists** (bad body, `COLLECTION_BUSY`, invalid selection). It gets a root span with `outcome=rejected` and is counted as `outcome=rejected`, never as `failed`, so the alert ignores user mistakes. Owned by Task 3 test `rejected collect`.
3. **Retried fetch after HTTP 429** (`fetchSourceWithThrottleRetry`). This produces two `source.fetch` spans, `throttled` then `succeeded`, and nothing crashes. Owned by Task 1 test `observer sees both attempts of a throttle retry`.
4. **A random hex trace/span ID that happens to contain long digit runs.** The privacy test must not flag it, but must flag the fixture's real identifiers. Owned by Task 3 privacy test design (ID fields excluded by key, known identifiers matched literally).
5. **A failed collect's counter series appears for the first time.** The alert expression must still fire. A plain `increase()` misses a brand-new series, so the expression subtracts an `offset 5m` sum with an `or vector(0)` fallback, and CI proves it with the forced failure (Task 6).

---

### Task 1: Source-fetch observer seam in `src/`

**Files:**
- Modify: `src/sourceFetch.mjs` (`fetchSource`, ~line 28)
- Modify: `src/acquisition.mjs:11,38` (accept `observer` and pass it on)
- Modify: `src/lookup.mjs:128,134` (accept `observer` and pass it on)
- Test: `test/source-fetch-observer.test.mjs`

**Interfaces:**
- Produces: `fetchSource(target, {..., observer})`, and the same for `fetchSourceWithThrottleRetry` through `...options`, `collectPublicSnapshot({..., observer})` and `performLookup({..., observer})`. Each call invokes `observer(event)` exactly once when the attempt ends. The event is `{name: target.name, serverAddress: <URL hostname>, outcome: 'succeeded'|'failed'|'throttled', httpStatus: number|null, code: string|null, appTokenUsed: boolean, startMs: number, endMs: number}`, where `code` is the thrown error's `code` (or `null`). The observer call is wrapped in `try{}catch{}` inside `src/`.

- [ ] **Step 1: Write the failing tests** in `test/source-fetch-observer.test.mjs`. Use a canned `fetchImpl` with `testFixture: true`.
  - `observer receives one event per fetch attempt`: a 200 response gives `outcome:'succeeded'`, `httpStatus:200`, `code:null`, `serverAddress:'data.texas.gov'`, `name` equal to the target's name, and `endMs >= startMs`.
  - `observer sees a failed fetch`: a 503 gives `outcome:'failed'`, `httpStatus:503`, `code:'HTTP_ERROR'`, and the call still rejects with `HTTP_ERROR`.
  - `observer sees both attempts of a throttle retry`: a 429 with `retry-after: 0`, then a 200, with `wait: async()=>{}`, gives two events with outcomes `['throttled','succeeded']`.
  - `a throwing observer changes nothing`: with `observer: ()=>{throw Error('x')}`, the result's `body` and the `metadata` keys/values (except `retrieved_at`) deep-equal a run without an observer.
  - `event carries no URL or query`: `JSON.stringify(event)` contains neither `'?'` nor `'$where'`.
  - `collectPublicSnapshot and performLookup forward observer`: a fixture collect (reuse the network shape from `test/bounded-collection.test.mjs`: lookup `{kind:'api',value:'38910201'}`, scope `boundedScope('000020838','2024-01','2026-04')`) records one event per target, and the returned `record` deep-equals a run without an observer, apart from `runId`, timestamps and `events[].timestamp`/IDs.
  - `src stays free of telemetry imports`: no file under `src/**/*.mjs` matches `/opentelemetry|scripts\/telemetry/`.
- [ ] **Step 2:** Run `node --test test/source-fetch-observer.test.mjs`. Expected: FAIL (no events recorded).
- [ ] **Step 3:** Implement. In `fetchSource`, record `startMs=Date.now()` and emit the event from a `finally`-style path that knows the status and error. Thread `observer` through `collectPublicSnapshot` (into the `fetchSourceWithThrottleRetry` call at line 38) and `performLookup` (line 134). Add no imports.
- [ ] **Step 4:** Run `node --test test/source-fetch-observer.test.mjs test/source-fetch.test.mjs test/bounded-collection.test.mjs test/lookup.test.mjs`. Expected: PASS.
- [ ] **Step 5:** Run `npm test`. Expected: all pass, 0 failures.

### Task 2: OTLP/HTTP JSON sender `scripts/telemetry.mjs`

**Files:**
- Create: `scripts/telemetry.mjs`
- Test: `test/telemetry.test.mjs`

**Interfaces:**
- Produces:
  - `createTelemetry({endpoint, serviceVersion, environment, fetchImpl=fetch, now=Date.now, flushIntervalMs=10000, warn=console.warn, onRootEnd=null}) → Telemetry`;
  - `telemetryFromEnv(env=process.env, overrides={}) → Telemetry` (reads `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_VERSION`, `DEPLOYMENT_ENVIRONMENT`).
- `Telemetry` members:
  - `enabled: boolean` (false gives a no-op object with the same methods);
  - `startSpan(name, {parent=null, attributes={}, startMs, kind='internal'|'server'}) → Span` (no parent starts a new trace);
  - `Span = {traceId, spanId, setAttributes(obj), end({outcome='succeeded', attributes={}, endMs}) }`. `outcome:'failed'|'rejected'` sets OTLP status code 2, otherwise 1. `end` is idempotent;
  - `log(span|null, {severity='INFO'|'WARN'|'ERROR', body, attributes={}})`, where `body` is a fixed template string chosen by the caller, never error text;
  - `sendTrace(traceId)` posts all ended spans and logs of that trace (fire-and-forget) and clears them;
  - `count(name, labels={}, value=1)` and `observe(name, labels={}, value)`;
  - `flushMetrics() → Promise<void>` and `shutdown() → Promise<void>` (flushes metrics and pending traces, then clears the timer).
- When a root span (no parent) ends, `onRootEnd?.({name, traceId, outcome, attributes})` is called with the filtered attributes.
- Instrument names:
  - counters `rrc_collect_runs`, `rrc_source_fetch`, `rrc_handoff_packages`, with no unit;
  - histogram `rrc_collect_duration`, unit `s`, `explicitBounds: [0.1,0.25,0.5,1,2.5,5,10,30,60,120]`.

- [ ] **Step 1: Write the failing tests** in `test/telemetry.test.mjs`. Inject a capturing `fetchImpl` that records `{url, body: JSON.parse(init.body)}`.
  - `disabled without endpoint`: `createTelemetry({endpoint:''}).enabled===false`, every method runs without throwing, and fetch is never called.
  - `trace export shape`:
    - a root plus a child, then `sendTrace`, posts one request to `http://c:4318/v1/traces`;
    - `resourceSpans[0].resource.attributes` contains `service.name=explorer`, `service.version`, `deployment.environment.name`;
    - both spans share `traceId` (32 lowercase hex); the child's `parentSpanId` equals the root's `spanId` (16 hex);
    - times are decimal-string `*UnixNano`;
    - the failed span has `status.code===2`.
  - `logs carry trace and span id`: posted to `/v1/logs`, `logRecords[0].traceId`/`spanId` match the span and `severityText` is `'ERROR'`.
  - `attribute allowlist`: `attributes:{'run.id':'r','url':'https://x?y','artifactId':'a'}` exports only `run.id`.
  - `metric labels allowlist and cumulative sums`:
    - `count('rrc_collect_runs',{outcome:'failed',stage:'load',error_code:'HTTP_ERROR',uic:'1'})` twice, then `flushMetrics`;
    - this gives a sum data point with `asInt` `'2'` (or `asDouble` 2), `isMonotonic:true`, `aggregationTemporality:2`, and labels without `uic`;
    - a second flush still reports 2 (cumulative).
  - `histogram`: `observe('rrc_collect_duration',{outcome:'succeeded'},1.5)` exports `bucketCounts` matching `explicitBounds`, with `count:'1'` and `sum:1.5`.
  - `send errors are swallowed and warned once`: a `fetchImpl` that rejects, called three times, means `warn` is called exactly once and nothing throws or rejects.
  - `send does not wait for a hanging collector`: with a `fetchImpl` that never resolves, `sendTrace` returns synchronously.
  - `onRootEnd fires for root spans only`.
  - `telemetryFromEnv`: `{OTEL_EXPORTER_OTLP_ENDPOINT:''}` is disabled; with `OTEL_SERVICE_VERSION:'abc'` the resource gets `service.version` `'abc'`; a trailing `/` on the endpoint is tolerated.
- [ ] **Step 2:** Run `node --test test/telemetry.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `scripts/telemetry.mjs` with built-ins only. IDs come from `randomBytes(16|8).toString('hex')`. OTLP attribute values: strings use `stringValue`, booleans `boolValue`, integers `intValue` (as a string), other numbers `doubleValue`. The scope is `{name:'explorer'}`. Every send is `fetchImpl(url,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(2000)}).catch(warnOnce)`, wrapped in `try` for synchronous throws.
- [ ] **Step 4:** Run `node --test test/telemetry.test.mjs`. Expected: PASS.

### Task 3: Wire telemetry into the server (collect, lookup, download, index refresh) + privacy gate

**Files:**
- Create: `scripts/fixture-network.mjs`, the canned no-network RRC responses used by tests and Task 4.
- Modify: `scripts/serve.mjs`:
  - `createExplorerServer` gains `telemetry=null`;
  - wire the collect route (lines 172–179), the lookup route (168–170), the download route (192–196) and `refreshIndex`;
  - the main block reads `telemetryFromEnv()` and calls `shutdown()` on `SIGTERM`/`SIGINT`.
- Test: `test/telemetry-server.test.mjs`, `test/telemetry-privacy.test.mjs`

**Interfaces:**
- Consumes:
  - from Task 1: `observer` on `collectPublicSnapshot` and `performLookup`, and its event shape;
  - from Task 2: the whole `Telemetry` API.
- Produces:
  - `fixtureNetwork({fail=null}={}) → async (url)=>Response`. It serves `raw/` files exactly like `network()` in `test/bounded-collection.test.mjs`. With `fail:'qq2j-f2zm'`, monthly requests return 503, which gives a `load` failure with `HTTP_ERROR`;
  - `FIXTURE_LOOKUP = {kind:'api', value:'38910201'}`;
  - `FIXTURE_MONTHS = {startMonth:'2024-01', endMonth:'2026-04'}`.
- Span lineage: create the root span and the `load` span BEFORE calling `collectPublicSnapshot` (and the `lookup` root before `performLookup`), so observer events can become `source.fetch` children of `load` as they arrive. When the run finishes, set `load`'s start/end from the record's events and create `normalize-qc`/`export` from the record.
- Signal mapping (later tasks and the dashboard rely on these names):
  - **Collect trace:** root span `collect` (kind server, `http.route:'/api/collect'`).
    - Children: `load`, `normalize-qc`, `export`, built from `record.events`. Each runs from the `running` event's timestamp to its terminal event. Attributes: `stage`, `outcome`, `error.code` (from the event's `safeError` code) when failed. `skipped` stages produce no span.
    - `source.fetch` spans (children of `load`) come from observer events, with `source.name`, `server.address`, `outcome`, `http.response.status_code`, `error.code`, `app_token_used`.
    - The root has `run.id`, `outcome` (`succeeded|failed|rejected`), `http.response.status_code` and `test_fixture`.
    - `index.refresh` is a child of the root, started when `refreshIndex` begins and ended when it settles, and sent in its own `sendTrace` (it only happens when `runIndex` is set).
  - **Logs, all carrying the root's IDs:**
    - `collect started`;
    - one per stage: `stage succeeded` or `stage failed` (ERROR);
    - `run finished`, with `run.id`, `outcome`, `stage` (the failed stage, or `none`), `error.code` (or `none`).
  - **Metrics, emitted once per collect:**
    - `rrc_collect_runs{outcome, stage, error_code}`, where `stage`/`error_code` are `none` on success;
    - a rejected request (no run record) is `outcome=rejected, stage=request, error_code=<allowed code or REQUEST_FAILED>`;
    - `rrc_collect_duration{outcome}` in seconds;
    - `rrc_source_fetch{source_name, outcome}` per observer event.
  - **Lookup trace:** root `lookup` (`lookup.id` when it succeeded, `outcome`), with `source.fetch` children and log `lookup finished`.
  - **Download:** root `handoff.package` with `http.route:'/api/versions/{id}/download'` and `outcome`, the log `package served`, and `rrc_handoff_packages{outcome}`.

- [ ] **Step 1: Write the failing tests** in `test/telemetry-server.test.mjs`. Start the server with `testFixture:true`, `fetchImpl:fixtureNetwork()`, and a `createTelemetry` that uses a capturing `fetchImpl`. Run lookup, then collect, as in `test/bounded-server.test.mjs`, then `await telemetry.shutdown()`.
  - `one trace per collect`:
    - the collect returns 201;
    - the exported spans named `collect`, `load`, `normalize-qc`, `export` share one `traceId`;
    - the `load` span has ≥1 `source.fetch` child;
    - the `run finished` log carries that `traceId` and `run.id` equal to the response's `run.runId`;
    - `rrc_collect_runs` has `outcome=succeeded, stage=none, error_code=none` with value 1.
  - `failed collect`: with `fixtureNetwork({fail:'qq2j-f2zm'})`, the collect returns 502; the root `outcome=failed`; the `load` span has status code 2 and `error.code:'HTTP_ERROR'`; `rrc_collect_runs{outcome=failed,stage=load,error_code=HTTP_ERROR}` is 1; there are no `normalize-qc`/`export` spans.
  - `rejected collect`: a body with an extra field returns 400; the root `outcome=rejected` and `rrc_collect_runs{outcome=rejected,stage=request,error_code=REQUEST_INVALID}` is 1.
  - `collector down`: telemetry endpoint `http://127.0.0.1:1`, real `fetch`. The collect returns 201, `warn` is called at most once, and there are no unhandled rejections (register `process.on('unhandledRejection')` and assert it stays unset).
  - `collector hangs`: the telemetry `fetchImpl` never resolves, and the collect returns 201 within 5 s.
  - `no telemetry, no change`: a server without `telemetry` returns the same status and response keys as before.
  - `download is traced without the artifact id`: `GET /api/versions/<pinned id>/download` (ID from `public/artifact-integrity.json`; with a temp `outputRoot` it may 404, which is fine) gives one `handoff.package` span whose `outcome` matches the status (`succeeded` for 200, `failed` otherwise) and whose attributes do not contain the ID.
- [ ] **Step 2:** Write the failing test `test/telemetry-privacy.test.mjs`.
  - Setup: a capturing telemetry, a fixture app token `appToken:'fixture-token-not-real'` (passed into `createExplorerServer`), and a success collect, a failed collect, a lookup and a download.
  - On every captured request body, assert:
    - the raw JSON text contains none of `'000020838'`, `'38910201'`, `'fixture-token-not-real'`, `'X-App-Token'`, `'$where'`, `'?'` (inside attribute values), `'rrc-'` (the `artifactId` prefix), `'data.texas.gov/resource'`;
    - every span/log attribute key is in the allowlist;
    - every metric label key is in `stage|outcome|error_code|source_name`;
    - no attribute value, except under the keys `run.id`/`lookup.id`/`transfer.id`, matches `/\d{8,}/`;
    - `traceId`/`spanId`/time fields are excluded by key, not scanned.
- [ ] **Step 3:** Run `node --test test/telemetry-server.test.mjs test/telemetry-privacy.test.mjs`. Expected: FAIL.
- [ ] **Step 4:** Implement `scripts/fixture-network.mjs`, then the wiring in `scripts/serve.mjs`. Every telemetry call sits behind `telemetry?.` and inside `try{}catch{}`. `sendTrace(rootTraceId)` runs right after `send(res, …)` returns. When `testFixture` is true, the root's `test_fixture` is `true`.
- [ ] **Step 5:** Run `node --test test/telemetry-server.test.mjs test/telemetry-privacy.test.mjs test/bounded-server.test.mjs test/server.test.mjs`. Expected: PASS.
- [ ] **Step 6:** Run `npm test`. Expected: all pass, 0 failures.

### Task 4: `scripts/collect-fixture.mjs` (CI and on-call driver)

**Files:**
- Create: `scripts/collect-fixture.mjs`
- Test: `test/collect-fixture.test.mjs`

**Interfaces:**
- Consumes: `fixtureNetwork`, `FIXTURE_LOOKUP` and `FIXTURE_MONTHS` (Task 3), `telemetryFromEnv` (Task 2), and `createExplorerServer({telemetry, testFixture:true, fetchImpl})`.
- Produces:
  - `runFixtureCollects({modes=['success'], telemetry, workDir}) → Promise<Array<{mode, status, traceId, runId, outcome, stage, errorCode}>>`. Each mode runs one lookup and one collect against an in-process server on `127.0.0.1:0`, and the server and `workDir` are removed afterwards. `traceId` comes from the `collect` root's `onRootEnd`.
  - CLI: `node scripts/collect-fixture.mjs [--fail | --both] [--out <file>]`.
    - Without a flag it runs `['success']`; `--fail` runs `['failed']`; `--both` runs `['success','failed']`.
    - It prints the JSON array, writes it to `--out` when given, then calls `await telemetry.shutdown()`.
    - It exits 0 when every mode's outcome matches what was requested, otherwise 1.
    - `workDir` is a fresh `mkdtemp` under the repo's `tmp/`, because `collectPublicSnapshot` requires `sourceDir` inside the repository.

- [ ] **Step 1: Write the failing test** `runFixtureCollects with both modes` with a capturing telemetry. It returns two items:
  - success: `status 201`, `outcome 'succeeded'`;
  - failed: `status 502`, `outcome 'failed'`, `stage 'load'`, `errorCode 'HTTP_ERROR'`;
  - the two have distinct 32-hex `traceId`s, and `tmp/` holds no leftover directory from the run.
- [ ] **Step 2:** Run `node --test test/collect-fixture.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement `scripts/collect-fixture.mjs`.
- [ ] **Step 4:** Run `node --test test/collect-fixture.test.mjs`, then `node scripts/collect-fixture.mjs --both` with no endpoint set. Expected: PASS, and the CLI prints two results and exits 0.

### Task 5: Observability setup, provisioning, and the app network name

**Files:**
- Create: `observability/compose.yaml`
- Create: `observability/grafana/provisioning/dashboards/explorer.yaml` (the provider) and `observability/grafana/dashboards/explorer-collect.json`
- Create: `observability/grafana/provisioning/alerting/explorer-alerts.yaml`
- Modify: `docker-compose.yml`:
  - add `name: swd-app` under `networks: app:`;
  - in `explorer.environment`, add `OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-}`, `OTEL_SERVICE_VERSION: ${OTEL_SERVICE_VERSION:-}` and `DEPLOYMENT_ENVIRONMENT: ${DEPLOYMENT_ENVIRONMENT:-local}`.
- Test: `test/observability-files.test.mjs`

**Interfaces:**
- Produces:
  - the service `lgtm` on the external network `swd-app`, so the Explorer container sends to `http://lgtm:4318`;
  - the dashboard UID `explorer-collect`;
  - the alert rule UID `explorer-collect-failed`, titled `Explorer collection failed`, with labels `service: explorer`, `journey: collect`, and annotations `summary`, `runbook_url` (the README's on-call section anchor) and `dashboard_url` (`http://127.0.0.1:3000/d/explorer-collect`);
  - the alert expression, in the Prometheus datasource: `sum(rrc_collect_runs_total{outcome="failed"}) - (sum(rrc_collect_runs_total{outcome="failed"} offset 5m) or vector(0)) > 0`, with a 10 s evaluation interval and `for: 30s`.

- [ ] **Step 1: Write the failing tests** in `test/observability-files.test.mjs` (text and JSON checks, no YAML library):
  - the compose image matches `/grafana\/otel-lgtm:\d+\.\d+\.\d+/` and contains no `latest`;
  - each published port starts with `127.0.0.1:` (`3000`, `4318`);
  - it contains `GF_AUTH_ANONYMOUS_ORG_ROLE` set to `Viewer` and `external: true` with `name: swd-app`;
  - the dashboard JSON parses, has `uid` `explorer-collect` and 3–4 panels, and every `expr` uses only the metric names `rrc_collect_runs_total`, `rrc_collect_duration_seconds_bucket|_sum|_count` and `rrc_source_fetch_total`;
  - the alert file contains the UID, title, both labels, all three annotations and the exact expression;
  - `docker-compose.yml` contains `name: swd-app`, `subnet: ${SWD_SUBNET:-172.30.0.0/24}`, `gateway: ${SWD_GATEWAY:-172.30.0.1}`, and `OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-}`.
- [ ] **Step 2:** Run `node --test test/observability-files.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Write the files.
  - Pin `grafana/otel-lgtm` to the newest release tag older than 14 days; check it exists with `docker manifest inspect grafana/otel-lgtm:<tag>` or the Docker Hub tags API.
  - Find the image's Grafana provisioning directory and datasource UIDs in that tag's source (the `grafana/docker-otel-lgtm` repo at that tag). Mount only into that directory's `dashboards/` and `alerting/` subfolders (single-file or subfolder mounts). Do NOT change `GF_PATHS_PROVISIONING`: otel-lgtm provisions its own datasources there, and moving it drops them.
  - Record the datasource UIDs you used in a comment at the top of `compose.yaml`.
- [ ] **Step 4:** Run `node --test test/observability-files.test.mjs`, then `npm test`. Expected: PASS.

### Task 6: Evidence script and CI round-trip

**Files:**
- Create: `observability/collect-evidence.mjs`
- Create: `.github/workflows/observability.yml`
- Test: `test/collect-evidence.test.mjs`

**Interfaces:**
- Consumes:
  - from Task 4: the CLI output, a JSON array with `traceId` per mode;
  - from Task 5: the setup, the dashboard UID and the alert UID.
- Produces:
  - `checkEvidence({fixture, tempo, loki, prometheus, alert, provisioning}) → {ok:boolean, checks:Array<{name, ok, detail}>}`, a pure function over already-fetched JSON;
  - the CLI `node observability/collect-evidence.mjs --in <fixture.json> --out <evidence.json> [--grafana http://127.0.0.1:3000] [--timeout 90]`. It polls read-only `GET` endpoints through Grafana until every check passes or the timeout ends, writes the evidence JSON, and exits 0/1.
- The queries (the only ones allowed):
  - Tempo: `/api/datasources/proxy/uid/<tempo uid>/api/traces/<traceId>`, for each mode;
  - Loki: `/api/datasources/proxy/uid/<loki uid>/loki/api/v1/query_range` with `{service_name="explorer"} | trace_id="<traceId>"`;
  - Prometheus: `/api/datasources/proxy/uid/<prom uid>/api/v1/query` for `rrc_collect_runs_total`, and separately for the alert expression;
  - `/api/prometheus/grafana/api/v1/rules` (Viewer-readable; look for the rule UID or title `Explorer collection failed`; the `/api/v1/provisioning/...` API needs Admin, and ZC-07's responder will also be a Viewer);
  - `/api/search?type=dash-db&query=` (look for UID `explorer-collect`).
- Checks:
  - `trace:success` has spans `collect`, `load`, `normalize-qc`, `export`;
  - `trace:failed` has a `load` span with error status;
  - `logs:success` and `logs:failed` each have ≥1 line;
  - `metric:succeeded` and `metric:failed{stage="load",error_code="HTTP_ERROR"}` are ≥1;
  - `alert-expr` returns > 0;
  - `provisioned:dashboard` and `provisioned:alert` exist.

- [ ] **Step 1: Write the failing tests** for `checkEvidence`, using canned responses:
  - all present gives `ok:true`;
  - a missing `normalize-qc` span gives `ok:false` with `trace:success` failed;
  - an empty Loki result fails `logs:failed`;
  - a Prometheus vector without the failed series fails `metric:failed`.

  Also assert the CLI source contains no `method:'POST'` and no `/api/v1/write`.
- [ ] **Step 2:** Run `node --test test/collect-evidence.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement `observability/collect-evidence.mjs`.
- [ ] **Step 4:** Write `.github/workflows/observability.yml`:
  - triggers: `pull_request`, push to `main`, `workflow_dispatch`; `permissions: contents: read`; job `observability`, `timeout-minutes: 20`;
  - steps:
    - checkout, `setup-node` 24 with npm cache, `npm ci`;
    - `docker network create swd-app`;
    - `docker compose -f observability/compose.yaml up -d`;
    - wait (up to 120 s) for `curl -fsS http://127.0.0.1:3000/api/health` and for `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:4318/v1/traces -H 'content-type: application/json' -d '{}'` to answer 200;
    - run `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_SERVICE_VERSION=${{ github.sha }} DEPLOYMENT_ENVIRONMENT=ci node scripts/collect-fixture.mjs --both --out observability-fixture.json`;
    - run `node observability/collect-evidence.mjs --in observability-fixture.json --out observability-evidence.json`;
    - add a step summary listing the checks;
    - `actions/upload-artifact@v4` (name `observability-evidence`, both JSON files, `if: always()`);
    - logs on failure: `docker compose -f observability/compose.yaml logs --tail 200`;
    - `down` with `if: always()`.
- [ ] **Step 5:** Commit and push the branch, then run the workflow: `GH_TOKEN=$(gh auth token -u thaiphi) gh workflow run observability.yml --ref zc-05/observability` (or let the PR trigger it) and watch it with `gh run watch`.
  - Expected: green, with every check `ok:true` in the uploaded evidence.
  - **If a metric name differs from the frozen names** (check `/api/v1/label/__name__/values` in the failure output), change the names everywhere: the Task 3 tests, the Task 5 dashboard/alert/tests, the evidence checks, and this plan's Global Constraints. Re-run until green; the frozen names are whatever Prometheus ingests.

### Task 7: README, deviations, and full verification

**Files:**
- Modify: `README.md` (a new section, "Observability (ZC-05)")
- Modify: `docs/deployment.md` (one paragraph on the deviation, linking to the README section)

**Interfaces:**
- Consumes: the commands, file paths, metric names, dashboard and alert UIDs from Tasks 2–6.

- [ ] **Step 1:** Write the README section:
  1. **Start it:** `docker compose up --build -d`, then `docker compose -f observability/compose.yaml up -d`, then restart Explorer with `OTEL_EXPORTER_OTLP_ENDPOINT=http://lgtm:4318`. Grafana is at http://127.0.0.1:3000.
  2. **For the local `npm start`,** use `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`.
  3. **What's collected:** the span, log and metric names from Task 3, and the attribute allowlist.
  4. **What's never collected:** the list from the Global Constraints.
  5. **Deviations:**
     - production (Supabase Edge Function) is not observed, and hosted collection is off (D7);
     - "build once, promote the same image" doesn't apply to an Edge Function;
     - there are no exemplars;
     - the cross-app trace is deferred (#54).
  6. **CI proof:** the workflow name and evidence artifact.
  7. **Codespace demo steps:** open a Codespace, run the commands from steps 1–2, do one real collect in the browser, open the dashboard and the trace, then force a failure with `node scripts/collect-fixture.mjs --fail`.
  8. **An `#on-call` anchor:** a heading `On call` with one line pointing to ZC-07 (#43). The alert's `runbook_url` targets it.
- [ ] **Step 2:** Run `npm run test:all`. Expected: all node tests pass with 0 failures, and vitest passes.
- [ ] **Step 3:** Run `git diff origin/main --stat -- src/`. Expected: only `src/sourceFetch.mjs`, `src/acquisition.mjs` and `src/lookup.mjs` changed.
- [ ] **Step 4:** Commit, open a PR "ZC-05: Explorer observability (traces, logs, metrics → Grafana)" with "Part of #41" (not "Closes", because the Codespace screenshot is still outstanding), and confirm `ci`, `compose-smoke` and `observability` are green. Then merge, and confirm `deploy-dev` is green on the merge commit.
- [ ] **Step 5:** Post evidence on #41: run links, the evidence-JSON summary, and the test counts. The owner, or a Codespace session, then attaches the screenshot of a real collect, and #41 closes.
