# ZC-07 recorded on-call run, 2026-11-10

An alert woke the agent up, and it fixed the issue on its own. Issue #43.

| Step | Time (UTC) | What happened |
|---|---|---|
| Break | 14:33 | `npm run oncall:break` planted a real bug on `oncall-demo/20261110T143326889Z` (commit `cd9e5e2`, from `main` at `766dc14`) and pushed it. |
| Responder | 14:34 | `GH_TOKEN=$(gh auth token -u thaiphi) npm run oncall:responder`, which is the ZC-06 alert receiver with `--respond`. |
| Trigger | 14:34 | `npm run oncall:trigger` ran one fixture collection. It failed with `outcome: failed`, `stage: load`, `errorCode: SOURCE_LIMIT`. |
| Alert | 14:34:55 | Grafana's rule **Explorer collection failed** fired, and its webhook reached the receiver ([`alert.json`](alert.json)). |
| Agent | 14:34:55 → 14:38:31 | The responder started `claude -p --agent on-call-engineer` in the demo worktree, using the per-run permissions in [`settings.json`](settings.json). It ran for 215.9 s and 39 turns, cost $1.85, and exited with code 0. |
| Fix PR | 14:37 | The agent opened [PR #59](https://github.com/thaiphi/texas-rail-sync/pull/59): `oncall-fix/20261110T143455112Z` → `oncall-demo/20261110T143326889Z`, 1 file, +2/−2. **It was not merged**, so a human reviews it. |
| Resolved | 14:39:25 | Grafana's resolved webhook arrived. The responder ignored it, so no second agent started ([`responder.log`](responder.log)). |
| Verify | after | `npm run oncall:verify` on the fix branch gave `outcome: succeeded`, HTTP 201 ([`verify.json`](verify.json)). |

## What the agent did ([`agent.jsonl`](agent.jsonl), [`report.md`](report.md))

1. It loaded the `incident-response` skill and read the alert.
2. It queried Loki and Prometheus through Grafana, read-only. Both showed one failed run, `stage=load`, `error_code=SOURCE_LIMIT`.
3. It reproduced the failure offline with `node scripts/collect-fixture.mjs`.
4. It searched `src/` for the error code. It then read `git log --oneline` and `git diff HEAD~1 -- src/sourceFetch.mjs`, and checked the documented 10 MB cap in README and ADR 002.
5. Before the fix, `npm test` had 57 failures. The agent made a 2-line fix that restored the cap. After it, `npm test` had 0 failures (721 pass, 1 skipped) and the fixture collection succeeded.
6. It committed on `oncall-fix/…`, pushed, and ran `gh pr create --base oncall-demo/…`, using [`pr-body.md`](pr-body.md) as the body.

One compound Bash command was refused by the permission list, and the agent re-ran it as permitted single steps. It made no attempt to read the denied answer-key paths.

## Safeguards seen in this run

- **What the agent ran with.**
  - The webhook token and `OTEL_*` were removed from its environment, and auto-memory was off.
  - Its permissions denied `gh pr merge`, force pushes, pushes to `main`, `gh auth`, `.env` and the demo's answer key.
- **Where the fix went.** The PR targets the throwaway demo branch, not `main`.
- **How this log was edited.** The session-start events in `agent.jsonl` listed the skills, plugins, slash commands and MCP servers installed on the owner's machine. Those lists, and the SessionStart hook output, were replaced with counts before committing. Nothing else in the log was changed.
- **Secrets check.** These files were checked for GitHub, Anthropic and Socrata tokens, and none were found. Lines that match `X-App-Token` or `SOCRATA` are source code the agent read.
