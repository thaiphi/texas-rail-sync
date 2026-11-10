# ZC-07: On-call responder agent — design

Issue: [#43](https://github.com/thaiphi/texas-rail-sync/issues/43). Builds on ZC-05 (telemetry, #41) and ZC-06 (alert + webhook receiver, #42, PR #57).

## Intent

The course rubric's On-Call Agent criterion is all-or-nothing (2 points): "An agent wakes up on an alert and fixes the issue." The issue adds: it diagnoses the failure, opens a fix PR (or applies a documented remediation), and a recorded run shows alert → agent → fix.

The owner chose the lecture's shape (DevOps and Observability module, "Designing an AI on-call engineer"): **plant a small real bug, the alert fires, Claude Code wakes up headless, finds the bug, and opens a pull request that fixes it.** The owner ruled that **saved logs plus the PR are the recording**: no screen capture.

The work also applies the Agent Capabilities module (skills and specialized subagents): the on-call engineer is a **project subagent file** and its procedure is a **project skill**. The repo has none today: every subagent so far was a generic helper with a hand-written prompt, and the process skills come from the superpowers plugin installed on the owner's machine. That module isn't graded on its own, so the scope is only what ZC-07 needs. Separate implementer and reviewer agent files are out of scope.

## Goals

1. A real, repeatable bug turns a normal fixture collection into a **failed** run, which fires the ZC-06 alert and webhook.
2. On a firing webhook, the receiver (in an opt-in responder mode) starts `claude -p --agent on-call-engineer` in the demo worktree.
3. The agent follows the `incident-response` skill. It reads the alert, gathers evidence, reproduces the failure offline, makes the minimal fix, runs `npm test`, and pushes a fix branch. Then it opens a PR **into the demo branch** with the diagnosis. If the failure isn't a code bug, it writes a remediation report and opens no PR.
4. Evidence: the saved alert, the agent's full stream-json log, the PR URL, and the alert resolving afterwards. The log and a short run summary are committed under `docs/evidence/`, then linked from the README and #43.
5. CI proves, with no Claude and no API key, that the planted bug still applies to `main` and still fails a fixture collection. It also proves the responder's behavior (what triggers it and the command it builds) with a fake process starter.

## Non-goals / anti-goals

- **Never touches `main`.** The bug lives only on a throwaway demo branch. The agent never merges, never pushes to `main`, never force-pushes, and never edits the Analytics repo. Branch protection on `main` is the backstop.
- ZC-06 behavior is unchanged: `npm run alert:receiver` and `npm run alert:trigger` work exactly as today and never start Claude.
- No Claude in GitHub Actions (that would need a paid API key stored as a secret).
- No screen recording, no web UI for the agent, no implementer or reviewer agent files, no `.agents/` symlink tree.
- The agent never reads `.env` files or secrets. The receiver's webhook token is never passed to it.

## Verified facts (spikes run 2026-11-09 in the zc-07 worktree; nothing kept)

- **A throw inside a collection step yields `outcome: failed`** (HTTP 502, with a run id), so the alert counts it. Subtle data bugs (wrong day counts, an off-by-one month) do **not** fail the run; they pass silently, so they can't drive this demo.
- **Chosen bug: the per-response byte cap in `src/sourceFetch.mjs` lowered from `10_000_000` to `1_000_000`** (the streaming check `size>10_000_000`; leave the `content-length` header check as is or lower both, builder's call).
  - A fixture collection then fails at stage `load` with `SOURCE_LIMIT`, because the 1.08 MB `raw/uic-manual.pdf` exceeds the cap.
  - 12 existing tests fail, so the agent has both a reproduction and a check for its fix.
  - It reads like a plausible "tightened a limit" regression, and the error code points to it without spelling out the answer.
- `claude -p --agent <name>` resolves a project agent in `.claude/agents/`, and a project skill in `.claude/skills/` runs from `-p` mode (Claude Code 2.1.321).

## The demo flow

| Step | Command (owner or main session) | What happens |
|---|---|---|
| 0 | Observability stack up (README "On call") | Grafana/LGTM running with the ZC-06 alert and contact point |
| 1 | `npm run oncall:break` | Creates the git worktree `tmp/oncall-demo` on new branch `oncall-demo/<stamp>` from `origin/main`, applies the planted bug, commits it with a neutral message (see "Settled" 2), and **pushes the branch to origin** (the PR needs a remote base). Refuses if `tmp/oncall-demo` exists. |
| 2 | `GH_TOKEN=$(gh auth token -u thaiphi) npm run oncall:responder` | The ZC-06 receiver plus the responder hook (below) |
| 3 | `npm run oncall:trigger` | Runs `scripts/collect-fixture.mjs` in **success mode** (no `--fail`) from the demo worktree, with `--endpoint http://127.0.0.1:4318`. The bug makes it fail for real. |
| 4 | — | About 45 s later the alert fires, the webhook is saved under `tmp/alerts/`, the responder starts Claude, and the agent opens the PR |
| 5 | `npm run oncall:reset` | Removes the demo worktree. Remote demo and fix branches and the PR stay as evidence; the README says how to delete old ones. |

**Why a PR between two throwaway branches** (one sentence for graders, in the README): the bug must never reach `main`, so the agent fixes it where it lives, on the demo branch, and the PR diff shows exactly the fix.

## Responder (extends `scripts/alert-receiver.mjs`; may live in `scripts/oncall/responder.mjs`)

- **Opt-in:** `--respond` (or the separate npm script) wires `onAlert`. Without it the receiver is unchanged.
- **Triggers only on** a body with `status: "firing"` that contains an alert with `labels.alertname === "Explorer collection failed"` and `status: "firing"`. It ignores resolved bodies, which Grafana sends about 5 minutes later and which also reach `onAlert`.
- **One agent at a time.** If an agent is already running it logs and ignores the new alert (no queue). After an agent exits, a new firing alert can start another.
- **Command it builds** (exact flag spelling to be checked against `claude --help` during the build):
  - `claude -p "<prompt>" --agent on-call-engineer --output-format stream-json --verbose --max-turns <N, default 60> --permission-mode acceptEdits`
  - `--allowedTools`: Read/Edit/Write/Grep/Glob, `Bash(npm test:*)`, `Bash(node:*)`, `Bash(git status/diff/log/switch/checkout -b/add/commit/push origin oncall-fix/*:*)`, `Bash(gh pr create:*)`, `Bash(curl -s http://127.0.0.1:3000/*)` (read-only Grafana proxy queries)
  - `--disallowedTools`: `Bash(gh pr merge:*)`, `Bash(git push --force*)`, any push to `main`
  - **cwd** = the demo worktree (`--workdir`, default `tmp/oncall-demo`). It must exist and be on an `oncall-demo/*` branch, or the responder refuses and logs why.
  - **Environment:** the parent's environment minus `ALERT_WEBHOOK_TOKEN`. `GH_TOKEN` passes through if set; without it the agent writes the report but `gh pr create` fails, and the README says to set it.
- **Prompt** (short, since the skill carries the procedure): "Alert fired. The webhook body is at `<absolute path>`. Follow the incident-response skill."
- **Output:** `tmp/oncall/<stamp>/agent.jsonl` (the stream-json log) and `tmp/oncall/<stamp>/alert.json` (a copy of the triggering body). The responder logs start, exit code and duration.
- **Testability:** the process starter is injected (`spawn` by default), so unit tests check the trigger rules, the single-agent rule, the built arguments, cwd and the token removal without running Claude.

## The on-call engineer subagent (`.claude/agents/on-call-engineer.md`)

Frontmatter: `name: on-call-engineer` and a `description`. Body:
- **Role:** the Explorer on-call engineer, woken by an alert.
- **Procedure:** follow the `incident-response` skill.
- **May:** read the repo, run tests and fixture collections, and query local Grafana read-only. Edit source to fix the bug. Create `oncall-fix/<stamp>` from the current `oncall-demo/*` branch, commit, push that branch, and open one PR whose base is the demo branch.
- **Never:** merge, push to `main` or force-push, edit the Analytics repo, read `.env`/secrets/tokens, run `gh auth switch` or `gh auth login`, or call the RRC network. It doesn't touch `docs/evidence/`: the main session commits evidence later.

**AGENTS.md conflict, resolved:** AGENTS.md says "Workers never stage, commit or push". `docs/agent-team.md` gets an **On-call engineer** row stating the exception: it commits and pushes only its `oncall-fix/*` branch and opens a PR into an `oncall-demo/*` branch, never merges, and never touches `main` or Analytics. AGENTS.md gets one line naming the exception and pointing to `.claude/agents/` and `.claude/skills/`, so Codex and other tools can find them.

## The incident-response skill (`.claude/skills/incident-response/SKILL.md`)

Frontmatter: `name: incident-response`, plus a description ("Use when an Explorer alert fires …"). Numbered steps:
1. Read the webhook body: alert name, labels, values, start time.
2. Gather evidence. Query recent failed `collect` logs (error code, stage, run id, trace id) through Grafana's datasource proxy on `127.0.0.1:3000`, using GETs only. If Grafana is unreachable, skip this step and say so.
3. Reproduce offline: `node scripts/collect-fixture.mjs` (success mode, no endpoint). Expect `outcome: failed`, and record the stage and error code.
4. Locate the cause from the error code and stage, searching where that code is thrown, and confirm with `npm test`.
5. **Decide.**
   - *Code bug:* make the minimal fix, then confirm the fixture collect succeeds and `npm test` passes. Commit, push `oncall-fix/<stamp>`, and run `gh pr create --base <demo branch>`. The PR body holds the alert, evidence (run id, trace id, stage, error code), root cause, fix, and test results.
   - *Not a code bug* (for example the real RRC source being down): change nothing, and write `tmp/oncall/<stamp>/report.md` with the diagnosis and the documented remediation (wait and retry the collection; the alert resolves about 5 minutes after the last failure).
6. End with a one-paragraph summary as the final message.

## Evidence and proofs

- **CI (no Claude):**
  - a node test that the planted-bug change still applies cleanly to the current source and makes `runFixtureCollects({modes:['success']})` return `failed`/`load`/`SOURCE_LIMIT` (done in a temp copy or by injection, never by editing the checkout);
  - responder unit tests;
  - file tests that the agent and skill files exist with valid frontmatter and the required "never" rules.
  - The existing `observability` workflow already proves failed run → alert → webhook; whether it also runs the planted bug end to end is the builder's call (note the cost in CI minutes).
- **Local recorded run:** done once after merge-ready, on the owner's machine with the owner's Claude Code login (the main session can run it). Commit `docs/evidence/zc-07-<date>/` containing `alert.json`, `agent.jsonl` (checked for tokens before committing) and `RUN.md` (commands, timestamps, PR link, Grafana firing → resolved). README "On call" and #43 link it.
- #43's evidence comment: issue writes were refused for this session earlier, so the main session hands the owner a `!` command.

## Settled after the builder check (main session's calls)

1. **Sequence: build PR first, recorded run after merge, evidence in a second small PR.** The agent and skill files must be on `main` for `oncall:break` (cut from `origin/main`) to carry them into the demo tree. PR 1 has `Part of #43`; PR 2 (evidence + README links) has `Closes #43`.
2. **No answer key in the demo tree.**
   - The planted commit uses a neutral message, `Tighten source download cap`. It doesn't mention a demo, ZC-07 or a bug.
   - The skill and agent file forbid reading `scripts/oncall/`, the planted-bug test, `docs/superpowers/specs/*zc07*`, `docs/superpowers/plans/*zc07*` and `docs/evidence/`.
   - The planted value is not written as a literal diff in a file the skill points at.
   - The stream-json log is the proof of what the agent actually read, and RUN.md lists the files it opened.
   - `git log` stays allowed, because the neutral message gives nothing away.
3. **Resolve evidence is honest, not causal.** The alert resolves about 5 minutes after the last failure, whatever the fix. After the PR opens, a new `npm run oncall:verify` runs a success-mode fixture collect from the `oncall-fix/*` branch with telemetry on, so Grafana shows a succeeded run from the fixed code. RUN.md says plainly that the resolve is time-based and that verify is what shows the fix works.
4. **Backstop confirmed** (rulesets read 2026-11-09). On `main`:
   - "tests must pass" (required status checks); the only bypass is the Lovable app, not the owner's account;
   - "no history rewrite or deletion".
   - A direct push from the agent's token without passing checks is rejected, and the tool deny list is the first guard.
5. **The responder strips from the agent's environment** `ALERT_WEBHOOK_TOKEN` and every `OTEL_*` variable, so the agent's repro collects don't send telemetry and don't re-fire the alert. Unit tests check this.
6. The demo worktree needs `node_modules`: `oncall:break` runs `npm ci` in it, or links the main checkout's `node_modules`. Builder's call.

## Left to the builder

- Planted-bug mechanism: a stored patch versus a guarded string replacement. It must fail loudly if the target line moves.
- File split between `alert-receiver.mjs` and `scripts/oncall/*`; npm script names may be adjusted (keep `oncall:` prefix).
- `--max-turns` default; whether the responder also has a wall-clock timeout (recommended, about 20 min, which kills the child).
- Exact Grafana proxy queries in the skill (Loki for logs; Tempo by trace id is optional).

## Rulings (main session's calls, for the owner to check)

1. **Bug = byte cap 10 MB → 1 MB.** If wrong: the bug may look trivial to graders. The fix is a one-line change, but the diagnosis path (error code → constant → tests) is real.
2. **The demo branch is pushed to the public repo.** If wrong: throwaway branches are visible on GitHub (named `oncall-demo/*`, deletable).
3. **The PR targets the demo branch, not `main`.** If wrong: a grader may expect a PR into `main`, so the README explains why.
4. **`.claude/` is canonical, with no `.agents/` mirror.** If wrong: Codex users must follow the AGENTS.md pointer.
5. **The agent runs with `acceptEdits` plus a tool allow-list, not skip-permissions.** If wrong: it may stall on a tool not on the list, which shows up in the log, and we widen the list.
