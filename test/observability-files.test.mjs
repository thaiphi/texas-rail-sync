// ZC-05 Task 5: the observability setup's files (text and JSON checks only; no YAML library).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(root + rel, 'utf8');

const ALERT_EXPR =
  'sum(rrc_collect_runs_total{outcome="failed"}) - (sum(rrc_collect_runs_total{outcome="failed"} offset 5m) or vector(0)) > 0';
const DASHBOARD_METRICS = new Set([
  'rrc_collect_runs_total',
  'rrc_collect_duration_seconds_bucket',
  'rrc_collect_duration_seconds_sum',
  'rrc_collect_duration_seconds_count',
  'rrc_source_fetch_total',
]);

test('observability compose pins otel-lgtm, binds loopback only, Viewer anonymous, joins swd-app', () => {
  const compose = read('observability/compose.yaml');
  assert.match(compose, /image:\s*grafana\/otel-lgtm:\d+\.\d+\.\d+\s*$/m);
  assert.doesNotMatch(compose, /latest/);
  assert.match(compose, /^\s*lgtm:\s*$/m, 'service must be named lgtm');

  const ports = [...compose.matchAll(/^\s*-\s*"([^"]*:\d+)"\s*(?:#.*)?$/gm)].map((m) => m[1]);
  assert.deepEqual(ports.sort(), ['127.0.0.1:3000:3000', '127.0.0.1:4318:4318']);
  for (const port of ports) assert.ok(port.startsWith('127.0.0.1:'), port);

  assert.match(compose, /GF_AUTH_ANONYMOUS_ORG_ROLE:\s*"?Viewer"?\s*$/m);
  assert.match(compose, /external:\s*true/);
  assert.match(compose, /name:\s*swd-app\s*$/m);
  assert.doesNotMatch(compose, /^\s*GF_PATHS_PROVISIONING:/m, "never move the image provisioning path");
  for (const uid of ['prometheus', 'tempo', 'loki']) assert.match(compose, new RegExp(`^#.*\\b${uid}\\b`, 'm'));
});

test('dashboard provider points at the mounted dashboard folder', () => {
  const compose = read('observability/compose.yaml');
  const provider = read('observability/grafana/provisioning/dashboards/explorer.yaml');
  const path = provider.match(/path:\s*(\S+)/)?.[1];
  assert.ok(path, 'provider has options.path');
  assert.ok(compose.includes(`./grafana/dashboards:${path}:ro`), `compose mounts the dashboards folder at ${path}`);
  assert.ok(compose.includes('./grafana/provisioning/dashboards/explorer.yaml:'), 'provider mounted as a single file');
  assert.ok(compose.includes('./grafana/provisioning/alerting/explorer-alerts.yaml:'), 'alert file mounted as a single file');
});

test('dashboard JSON has uid explorer-collect, 3-4 panels, and only the frozen metric names', () => {
  const dashboard = JSON.parse(read('observability/grafana/dashboards/explorer-collect.json'));
  assert.equal(dashboard.uid, 'explorer-collect');
  assert.ok(dashboard.panels.length >= 3 && dashboard.panels.length <= 4, `panels: ${dashboard.panels.length}`);
  for (const panel of dashboard.panels) {
    assert.ok(panel.targets?.length >= 1, `panel ${panel.title} has targets`);
    for (const target of panel.targets) {
      const names = target.expr.match(/\brrc_\w+/g) ?? [];
      assert.ok(names.length >= 1, `expr uses an Explorer metric: ${target.expr}`);
      for (const name of names) assert.ok(DASHBOARD_METRICS.has(name), `unexpected metric ${name}`);
    }
  }
});

test('alert rule file carries UID, title, labels, annotations and the exact expression', () => {
  const alert = read('observability/grafana/provisioning/alerting/explorer-alerts.yaml');
  assert.match(alert, /uid:\s*explorer-collect-failed\s*$/m);
  assert.match(alert, /title:\s*Explorer collection failed\s*$/m);
  assert.match(alert, /service:\s*explorer\s*$/m);
  assert.match(alert, /journey:\s*collect\s*$/m);
  assert.match(alert, /summary:/);
  assert.match(alert, /runbook_url:\s*\S+#on-call\s*$/m);
  assert.match(alert, /dashboard_url:\s*http:\/\/127\.0\.0\.1:3000\/d\/explorer-collect\s*$/m);
  assert.ok(alert.includes(ALERT_EXPR), 'exact alert expression');
  assert.match(alert, /interval:\s*10s/);
  assert.match(alert, /for:\s*30s/);
  assert.match(alert, /datasourceUid:\s*prometheus\s*$/m);
});

test('app compose names its network swd-app and keeps subnet, gateway; passes telemetry env through', () => {
  const compose = read('docker-compose.yml');
  assert.match(compose, /name:\s*swd-app\s*$/m);
  assert.ok(compose.includes('subnet: ${SWD_SUBNET:-172.30.0.0/24}'));
  assert.ok(compose.includes('gateway: ${SWD_GATEWAY:-172.30.0.1}'));
  assert.ok(compose.includes('OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-}'));
  assert.ok(compose.includes('OTEL_SERVICE_VERSION: ${OTEL_SERVICE_VERSION:-}'));
  assert.ok(compose.includes('DEPLOYMENT_ENVIRONMENT: ${DEPLOYMENT_ENVIRONMENT:-local}'));
});
