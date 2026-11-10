---
name: incident-response
description: Use when an Explorer alert fires (for example the Grafana alert "Explorer collection failed") and you must diagnose it from the alert, local Grafana logs and an offline reproduction, then either fix a code bug and open a pull request into the demo branch, or write a remediation report.
---

# Incident response

The procedure the on-call engineer follows when an Explorer alert fires. Work in order, keep notes as you go (they become the PR body or the report), and base every conclusion on evidence you saw.

The prompt gives you three things:
- the **alert file**: the path of Grafana's webhook body;
- the **demo branch**: the `oncall-demo/*` branch your working tree is on;
- the **run directory**: where `report.md` and any scratch files go. Use its last folder name as `<stamp>`.

## Ground rules

- Do not read `scripts/oncall/`, `test/oncall-*`, `docs/superpowers/specs/*zc07*`, `docs/superpowers/plans/*zc07*` or `docs/evidence/`, and never `.env` files or other secrets.
- Grafana is read-only for you: GET requests only, with `curl -s`. Its anonymous access is read-only, so send no credentials.
- Stay offline: no RRC or other internet calls. The fixture collection reproduces a collection without the network.
- Use the command spellings below as written. You run with a fixed permission list, and a different spelling may be refused. If a command is refused, do not work around it; note it in your output.
- Never merge, never push to `main`, never force-push, never run `gh auth`.

## 1. Read the alert

Read the alert file. Note the alert name (`labels.alertname`), its labels, `status`, `startsAt`, the summary and the values. Confirm it is a firing Explorer alert. Record the start time: your log queries cover the minutes around it.

## 2. Gather evidence from Grafana

Grafana runs at `http://127.0.0.1:3000`. Query its datasources through the datasource proxy (`/api/datasources/proxy/uid/<uid>/...`). The datasource uids are pinned by the observability stack: Loki `loki`, Prometheus `prometheus`, Tempo `tempo`. If a uid answers 404, list them with `curl -s http://127.0.0.1:3000/api/datasources`.

Write each URL **unquoted**, with the query percent-encoded (including `(` as `%28` and `)` as `%29`) and every `&` escaped as `\&`. A quoted URL does not match the permission rule and is refused.

- Explorer failure and error logs from the last 15 minutes (LogQL `{service_name="explorer"} |~ "(?i)fail|error"`):

  ```
  curl -s http://127.0.0.1:3000/api/datasources/proxy/uid/loki/loki/api/v1/query_range?query=%7Bservice_name%3D%22explorer%22%7D%20%7C~%20%22%28%3Fi%29fail%7Cerror%22\&since=15m\&limit=50\&direction=backward
  ```

  If that returns no streams, drop the filter (`{service_name="explorer"}`) to see every Explorer log line:

  ```
  curl -s http://127.0.0.1:3000/api/datasources/proxy/uid/loki/loki/api/v1/query_range?query=%7Bservice_name%3D%22explorer%22%7D\&since=15m\&limit=50\&direction=backward
  ```

- Failed collections by stage and error code (PromQL `sum by (stage, error_code) (rrc_collect_runs_total{outcome="failed"})`):

  ```
  curl -s http://127.0.0.1:3000/api/datasources/proxy/uid/prometheus/api/v1/query?query=sum%20by%20%28stage%2C%20error_code%29%20%28rrc_collect_runs_total%7Boutcome%3D%22failed%22%7D%29
  ```

- Optional, once you have a trace id from the logs: the trace from Tempo, and that trace's log lines from Loki (`trace_id` is structured metadata):

  ```
  curl -s http://127.0.0.1:3000/api/datasources/proxy/uid/tempo/api/traces/<trace id>
  curl -s http://127.0.0.1:3000/api/datasources/proxy/uid/loki/loki/api/v1/query_range?query=%7Bservice_name%3D%22explorer%22%7D%20%7C%20trace_id%3D%22<trace id>%22\&since=1h
  ```

From the failed collection, record the **run id, trace id, stage and error code**, and any error message.

If Grafana is unreachable (curl exits non-zero or returns nothing), skip this step, say so in your notes and continue: step 3 reproduces the failure without it.

## 3. Reproduce offline

Run the fixture collection in success mode, with no endpoint:

```
node scripts/collect-fixture.mjs
```

It runs one lookup and one collect against an in-process server on canned fixture data, with no network, and prints a JSON array with `outcome`, `stage` and `errorCode`. A healthy tree prints `outcome: "succeeded"`. If it prints `outcome: "failed"`, record the stage and error code and check they match step 2. If `node_modules` is missing, run `npm ci` first.

If the collection succeeds and step 2 showed a failure, the failure was probably not caused by the code in this tree: go to step 5, "Not a code bug".

## 4. Locate the cause

Start from the error code and stage you recorded. Search the code (Grep) for where that error code is raised, read that code and the path the collection takes to reach it, and work out which condition fails and why. Use `git log` and `git diff` to see recent changes to the code you suspect.

Then run `npm test` and read the failures. They should point at the same code. Do not settle on a cause until the reproduction, the error code and the failing tests agree.

## 5. Decide

### Code bug

1. Create the fix branch from the demo branch:

   ```
   git switch -c oncall-fix/<stamp>
   ```

2. Make the **smallest change** that fixes the cause. Do not reformat, refactor or edit tests to hide the failure. Add or adjust a test only if it proves the fix.
3. Confirm the fix:
   - `node scripts/collect-fixture.mjs` prints `outcome: "succeeded"`;
   - `npm test` reports 0 failures. Record its pass/fail counts.
4. Check the change with `git status` and `git diff`, stage only the files you changed (`git add <file> ...`), and commit with a message that names the cause, e.g. `git commit -m "Fix <what was wrong> in <area>"`.
5. Push the fix branch:

   ```
   git push -u origin oncall-fix/<stamp>
   ```

6. Write the PR body to `<run directory>/pr-body.md` with these headings:

   ```markdown
   ## Alert
   <alert name, status, start time, summary>

   ## Evidence
   <run id, trace id, stage, error code; the log lines and query results that showed them; the offline reproduction>

   ## Root cause
   <what was wrong, where, and how it causes the failure>

   ## Fix
   <the change and why it is the minimal one>

   ## Tests
   <fixture collection result before and after; npm test counts before and after>
   ```

7. Open one pull request **into the demo branch** (never `main`):

   ```
   gh pr create --base <demo branch> --head oncall-fix/<stamp> --title "Fix <short cause>" --body-file <run directory>/pr-body.md
   ```

   If it fails (for example no GitHub token), do not retry with other commands: put the error in `report.md`.

8. Write `report.md` in the run directory: the same sections as the PR body, plus the PR URL.

Never merge the pull request; a human reviews it.

### Not a code bug

For example the real RRC source was down or slow, or the offline reproduction succeeds. Change no code, create no branch and open no PR. Write `report.md` in the run directory with:

- **Alert**: name, status, start time;
- **Evidence**: what Grafana and the reproduction showed;
- **Diagnosis**: why this is not a code bug;
- **Remediation**: wait for the source to recover and retry the collection. The alert resolves on its own about 5 minutes after the last failed collection.

## 6. Summarize

End with a one-paragraph final message: the alert, the cause, what you did (the PR URL, or "report only"), the test results, and anything you could not do.
