# Demo video script (ZC-08, issue #44)

About 5 minutes, recorded in one take. Each scene shows one or more course criteria.

## Before recording

Never show tokens, `.env` files or an email address on screen, and never type a key while recording. Explorer reads the optional RRC app token from your shell; it doesn't need to appear.

1. Start Docker Desktop.
2. Start the app with telemetry switched on. The first build takes a few minutes, so do it before you record:

   ```powershell
   $env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://lgtm:4318"
   docker compose up --build -d
   ```

3. Then start monitoring (Grafana with Loki, Tempo and Prometheus). It must come second, because it joins the network the app creates:

   ```powershell
   docker compose -f observability/compose.yaml up -d
   ```

4. Open these tabs in this order. Zoom the browser to 125%.
   - The README: https://github.com/thaiphi/texas-rail-sync
   - Live Explorer: https://texasrrcexplorer.lovable.app
   - Live Analytics: https://swdinjectionanalytics.lovable.app
   - Local Explorer: http://127.0.0.1:4391 (use exactly this address, not `localhost`)
   - Grafana: http://127.0.0.1:3000/d/explorer-collect
   - Grafana Explore: http://127.0.0.1:3000/explore
   - Grafana alerts: http://127.0.0.1:3000/alerting/list
   - The on-call fix PR: https://github.com/thaiphi/texas-rail-sync/pull/59
   - The on-call report: https://github.com/thaiphi/texas-rail-sync/blob/main/docs/evidence/zc-07-2026-11-10/report.md

## Scenes

| # | Time | On screen | Say |
|---|---|---|---|
| 1 | 0:00 | The README, top of the page | "Texas injection-well data is public but scattered. Explorer collects and checks it; Analytics screens the pressures." |
| 2 | 0:20 | Live Explorer: click **example well** in the banner. Then live Analytics: **Take the guided tour**, show the first stop, close it. | "Both apps are deployed at public URLs. Analytics has a five-minute guided tour for first-time visitors." |
| 3 | 0:50 | Terminal: `docker compose ps` showing `db`, `explorer` and `analytics` running | "Locally the whole system, database included, starts with one command: `docker compose up --build`." |
| 4 | 1:20 | Local Explorer: **Find & collect** → UIC `000020838` → **Find well** → choose the candidate → keep the default months (2024-01 to 2026-04) → **Collect selected well** (about 15 seconds) → **Open this dataset** → **Data quality**, **Sources** | "It downloads the official RRC files and checks them. Every run is saved as a new version." |
| 5 | 2:20 | **Downloads → Use in Injection Analytics**. Analytics opens a new tab and shows "Validation passed" → **Confirm & use this exact dataset** → **Injection & capacity** (left menu). Scroll to **Well assumptions**, type a reason ("RRC H-10 reports gauge pressure") → **Confirm basis**. Scroll to **WHP/BHP reconciliation (screening)**: 28 months modelled, regulatory margin 1,700 psi, chart at the bottom. | "The package arrives hash-checked. Analytics estimates the flowing bottomhole pressure for each month and screens it against the limits." |
| 6 | 3:20 | First run `npm run alert:trigger` in the terminal, so the alert is firing by scene 7. Then show the Grafana dashboard (the successful collection). Then **Explore → Tempo → Search**, Service name `explorer` → open the newest `collect` trace and show its spans (`load`, `normalize-qc`, `export`). Copy its trace ID, then **Explore → Loki** with `{service_name="explorer"} \| trace_id="<paste>"` → the logs `collect started`, `stage succeeded`, `run finished`. | "Each collection is traced, measured and logged under one trace ID." |
| 7 | 4:00 | Grafana alerts: **Explorer collection failed** shows Firing (it takes 1–2 minutes after the trigger). Then PR #59 and the report. | "When a collection fails, the alert fires and wakes an AI on-call agent. In this run, recorded earlier, it found the bug and opened this fix." |
| End | 4:50 | GitHub: Issues (milestone), Actions (green), `AGENTS.md` | "Specs, tracker, agent team and CI are all in the repo." |

Scene 7 replays the recorded on-call run of 2026-11-10 instead of running the agent again. A rerun takes about 4 minutes, costs about $2 and can behave differently. To run it live anyway, follow [On call](../README.md#on-call) in the README.

## After recording

```powershell
docker compose down
docker compose -f observability/compose.yaml down
```
