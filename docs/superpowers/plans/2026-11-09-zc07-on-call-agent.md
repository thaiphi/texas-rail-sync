# ZC-07 On-call Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the ZC-06 alert fires on a real (planted) bug, an opt-in responder starts Claude Code headless as the repo's `on-call-engineer` subagent. The agent follows the `incident-response` skill and opens a fix PR into the demo branch.

**Architecture:**
- `scripts/oncall/` holds the planted-bug transform, the demo break/reset commands and the responder.
- The responder is a factory returning an `onAlert(file, body)` function, which `scripts/alert-receiver.mjs` wires up only under `--respond`.
- Claude is started via an injected spawn with simple tokens only. Tool permissions go in a per-run `--settings` JSON file and the prompt goes on stdin, so no shell quoting of patterns is needed on Windows.

**Tech Stack:** Node ESM (`.mjs`), `node:test`, git CLI, Claude Code CLI 2.1.x (`claude -p --agent`), `gh`.

**Spec:** `docs/superpowers/specs/2026-11-09-zc07-on-call-agent-design.md` (read it; its "Settled after the builder check" section is binding).

**Scope:** PR 1 only (the build, `Part of #43`). The recorded run and the evidence PR (`Closes #43`) come after the merge and are not in this plan.

## Global Constraints

- Never touches `main`: the bug lives only on `oncall-demo/<stamp>`, and the agent pushes only `oncall-fix/<stamp>` and opens one PR with `--base oncall-demo/<stamp>`.
- `npm run alert:receiver` and `npm run alert:trigger` behave exactly as before; without `--respond` the receiver never starts Claude.
- Agent name: `on-call-engineer`. Skill name: `incident-response`. Alert name matched: `Explorer collection failed`.
- Planted change: in `src/sourceFetch.mjs`, both occurrences of `10_000_000` become `1_000_000` (exactly 2 occurrences must exist, or it throws). The planted commit message is exactly `Tighten source download cap`.
- The agent's environment is the parent's minus `ALERT_WEBHOOK_TOKEN` and every key starting with `OTEL_`.
- The agent must not read: `scripts/oncall/`, `test/oncall-*.test.mjs`, `docs/superpowers/specs/*zc07*`, `docs/superpowers/plans/*zc07*`, `docs/evidence/`, `.env*`.
- No Claude in CI. No `gh auth switch` or `gh auth login` anywhere. The Socrata token is never written anywhere.
- Repo code style: compact one-line-heavy ESM like `scripts/alert-receiver.mjs`, with a header comment naming the issue (`ZC-07 (issue #43)`).
- Tests must not leave files in the checkout (`npm test` already writes `runs/<uuid>/`, so don't add to that); use `os.tmpdir()` or the git-ignored `tmp/`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by name, never `git add -A`.

## Review Focus

1. Grafana's **resolved** webhook arrives about 5 minutes after firing and must not start a second agent (Task 2 test).
2. A second **firing** webhook while an agent is still running is ignored with a log line, not queued (Task 2 test).
3. **`claude` is not installed or fails to start** (spawn `error` event, ENOENT): log it, release the lock, and keep the receiver alive (Task 2 test).
4. **Agent hangs:** after `timeoutMs` the child is killed and the lock released (Task 2 test).
5. **The demo worktree is missing or on the wrong branch:** refuse with a clear log line, don't start anything (Task 2 test). **The plant target has drifted:** `plantBug` throws naming the file and the count it found (Task 1 test).

---

### Task 1: Planted-bug transform and its CI proof

**Files:**
- Create: `scripts/oncall/plant.mjs`
- Test: `test/oncall-plant.test.mjs`

**Interfaces:**
- Produces: `export const PLANT_TARGET='src/sourceFetch.mjs'`, `export const PLANT_COMMIT_MESSAGE='Tighten source download cap'`, `export function plantBug(source: string): string` (throws `Error` containing `src/sourceFetch.mjs` and the found count unless exactly 2 `10_000_000` occurrences), `export async function plantInto(dir: string): Promise<void>` (reads, transforms and writes `<dir>/src/sourceFetch.mjs`).

- [ ] **Step 1: Write failing tests** in `test/oncall-plant.test.mjs`:
  - `plantBug replaces both byte caps`: on the real current `src/sourceFetch.mjs` text, the result has 0 `10_000_000` and 2 `1_000_000`, and everything else is unchanged (`result.replaceAll('1_000_000','10_000_000')===source`).
  - `plantBug refuses a drifted target`: `plantBug('const a=1;')` throws matching `/src\/sourceFetch\.mjs.*0/`; a source with 3 occurrences throws matching `/3/`.
  - `the planted bug fails a real fixture collection`:
    - copy `src/`, `scripts/`, `public/`, `raw/`, `test/fixtures/` and `package.json` into a fresh `mkdtemp` dir under the repo's `tmp/` (it must sit inside the repo tree so `node_modules` resolves upward), then `plantInto(copy)`;
    - run `node <copy>/scripts/collect-fixture.mjs` with `execFile` and an env without `OTEL_*`, and parse stdout JSON;
    - assert `[{outcome:'failed', stage:'load', errorCode:'SOURCE_LIMIT'}]` (use `assert.partialDeepStrictEqual` or field checks);
    - `t.after` removes the copy.
  - `the unplanted copy still succeeds`: the same copy flow without `plantInto` gives `outcome:'succeeded'`. This guards against the test passing for the wrong reason.
- [ ] **Step 2:** `node --test test/oncall-plant.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `scripts/oncall/plant.mjs` per Interfaces. The header comment says this file is the demo's answer key and the agent is forbidden to read it.
- [ ] **Step 4:** `node --test test/oncall-plant.test.mjs`. Expected: 4 pass. Then `git status --short` shows no leftovers in `tmp/` or `runs/` from this test.
- [ ] **Step 5:** Commit `scripts/oncall/plant.mjs test/oncall-plant.test.mjs`: "Add the on-call demo's planted bug and prove it fails a collection (ZC-07)".

### Task 2: Responder

**Files:**
- Create: `scripts/oncall/responder.mjs`
- Test: `test/oncall-responder.test.mjs`

**Interfaces:**
- Produces:
  - `export const ALERT_NAME='Explorer collection failed'`
  - `export function shouldRespond(body): boolean`: true only if `body.status==='firing'` and some `body.alerts[i]` has `status==='firing'` and `labels.alertname===ALERT_NAME`.
  - `export function agentEnv(env: object): object`: a copy without `ALERT_WEBHOOK_TOKEN` and without keys starting with `OTEL_`.
  - `export function agentSettings(): {permissions:{allow:string[],deny:string[]}}`:
    - allow: `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Bash(npm test:*)`, `Bash(npm ci:*)`, `Bash(node scripts/collect-fixture.mjs:*)`, `Bash(node --test:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git switch -c oncall-fix/:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git push -u origin oncall-fix/:*)`, `Bash(gh pr create:*)`, `Bash(curl -s http://127.0.0.1:3000/:*)`;
    - deny: `Bash(gh pr merge:*)`, `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(git push origin main:*)`, `Bash(gh auth:*)`, `Read(./.env*)`, `Read(./scripts/oncall/**)`, `Read(./test/oncall-*)`, `Read(./docs/superpowers/specs/*zc07*)`, `Read(./docs/superpowers/plans/*zc07*)`, `Read(./docs/evidence/**)`.
    - Check the exact rule syntax against Claude Code's settings docs (context7 or `claude --help`) and adjust the spelling, not the intent.
  - `export function buildAgentCommand({settingsFile, runDir, maxTurns}): {command:string,args:string[]}`: `command` is `claude`; args exactly `['-p','--agent','on-call-engineer','--output-format','stream-json','--verbose','--max-turns',String(maxTurns),'--permission-mode','acceptEdits','--settings',settingsFile,'--add-dir',runDir]`.
  - `export function agentPrompt({alertFile, demoBranch, runDir}): string` mentions all three values and "Follow the incident-response skill".
  - `export function createResponder({workdir, outRoot, spawn, log=console.log, now=()=>new Date(), maxTurns=60, timeoutMs=1_200_000, currentBranch}): (file, body) => Promise<{started:boolean, reason?:string}>`
    - `currentBranch(workdir)` defaults to `git -C <workdir> rev-parse --abbrev-ref HEAD`.
    - `spawn` has the `child_process.spawn` signature.
- Consumes: none.

**Behavior of the returned function:**
- If `!shouldRespond(body)`, resolve `{started:false, reason:'not a firing collection alert'}` with no log noise beyond one line.
- If an agent is running, resolve `{started:false, reason:'agent already running'}` and log it.
- If `workdir` doesn't exist or its branch doesn't start with `oncall-demo/`, resolve `{started:false, reason:...}` naming the problem.
- Otherwise:
  - make `runDir=<outRoot>/<stamp>` (same stamp format as the receiver);
  - copy the alert body to `runDir/alert.json` and write `runDir/settings.json` from `agentSettings()`;
  - spawn with `{cwd: workdir, env: agentEnv(process.env), stdio:['pipe', <write stream to runDir/agent.jsonl>, 'pipe'], shell: process.platform==='win32'}` (on Windows wrap the path args in double quotes because `claude` is an npm `.cmd` shim), and write the prompt to stdin and close it;
  - log start, then on `exit` log exit code and duration and release the lock; on `error` log and release; after `timeoutMs` kill the child, log the timeout and release;
  - resolve `{started:true}` right after spawning.

- [ ] **Step 1: Write failing tests** with a fake `spawn` (an `EventEmitter` with `stdin` as a `PassThrough`, `kill()` recording calls, and the stdio stream ignored) and a temp `outRoot`:
  - `shouldRespond` truth table: firing + matching name → true; `resolved` → false; firing with a different alertname → false; malformed body (`null`, no `alerts`) → false.
  - `agentEnv strips the webhook token and OTEL variables`: input `{ALERT_WEBHOOK_TOKEN:'x',OTEL_EXPORTER_OTLP_ENDPOINT:'y',OTEL_SERVICE_NAME:'z',GH_TOKEN:'g',PATH:'p'}` → exactly `{GH_TOKEN:'g',PATH:'p'}`.
  - `buildAgentCommand` returns exactly the args above for `maxTurns:60`.
  - `agentSettings denies merge, force push and the answer key`: deny includes `Bash(gh pr merge:*)` and `Read(./scripts/oncall/**)`, and allow has no entry containing `merge`.
  - `a firing alert starts one agent in the demo worktree`: `currentBranch` returns `oncall-demo/20261109T1`; result `{started:true}`; spawn called once with `cwd===workdir`; `env` has no `ALERT_WEBHOOK_TOKEN`; prompt written to stdin includes the alert file path and the demo branch; `runDir/alert.json` and `runDir/settings.json` exist.
  - `resolved alert starts nothing` (Review Focus 1).
  - `second firing while running is ignored, and accepted again after exit` (Review Focus 2): the second call gives `reason:'agent already running'`; after the fake emits `exit`, a third call starts.
  - `spawn error releases the lock` (Review Focus 3): the fake emits `error` (ENOENT); the next firing starts.
  - `timeout kills the agent and releases the lock` (Review Focus 4): `timeoutMs:20`, so `kill` is called and the next firing starts.
  - `missing worktree or wrong branch refuses` (Review Focus 5): a nonexistent dir gives `started:false`; `currentBranch` returning `main` gives `started:false` with the reason mentioning `oncall-demo/`; spawn is never called.
- [ ] **Step 2:** `node --test test/oncall-responder.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `scripts/oncall/responder.mjs` per Interfaces and Behavior.
- [ ] **Step 4:** `node --test test/oncall-responder.test.mjs`. Expected: all pass.
- [ ] **Step 5:** Commit both files: "Add the on-call responder that starts Claude on a firing alert (ZC-07)".

### Task 3: Demo commands and receiver wiring

**Files:**
- Create: `scripts/oncall/demo.mjs` (break and reset)
- Modify: `scripts/alert-receiver.mjs` (`parseArgs` gains `--respond` and `--workdir`; the CLI block wires `createResponder` when `respond` is set; header comment updated)
- Modify: `package.json` scripts
- Test: `test/oncall-demo.test.mjs`, `test/alert-receiver.test.mjs` (parseArgs cases)

**Interfaces:**
- Consumes: `plantInto`, `PLANT_COMMIT_MESSAGE` (Task 1); `createResponder` (Task 2).
- Produces:
  - `export async function breakDemo({repoRoot, git, npm, now=()=>new Date(), push=true, log=console.log}): Promise<{branch:string, workdir:string}>`
    - `git(args: string[], opts?: {cwd})` and `npm(args, {cwd})` are injected runners (default: `execFileSync`, stdio inherit; on win32 `npm` needs `shell:true`).
    - `workdir=<repoRoot>/tmp/oncall-demo`, `branch='oncall-demo/'+stamp`.
    - Sequence:
      1. Refuse (throw, naming the path) if `workdir` exists.
      2. `git(['fetch','origin','main'])`.
      3. `git(['worktree','add','-b',branch,workdir,'origin/main'])`.
      4. `plantInto(workdir)`.
      5. `git(['-C',workdir,'commit','-am',PLANT_COMMIT_MESSAGE])`.
      6. If `push`: `git(['-C',workdir,'push','-u','origin',branch])`.
      7. `npm(['ci','--no-audit','--no-fund'],{cwd:workdir})`.
    - It never runs Claude.
  - `export async function resetDemo({repoRoot, git, log}): Promise<void>`: `git(['worktree','remove','--force',<workdir>])` then `git(['worktree','prune'])`. A missing worktree logs "nothing to reset" and does not throw. Remote branches are kept.
  - CLI: `node scripts/oncall/demo.mjs break [--no-push]` and `node scripts/oncall/demo.mjs reset`.
  - `parseArgs` adds:
    - `respond:false` and `workdir:resolve(root,'tmp/oncall-demo')`;
    - `--respond` (a flag with no value) and `--workdir <path>`.
  - The receiver CLI with `respond` calls `createAlertReceiver({..., onAlert: createResponder({workdir, outRoot: resolve(root,'tmp/oncall'), spawn})})`.
  - `package.json` adds:
    - `"oncall:break": "node scripts/oncall/demo.mjs break"`
    - `"oncall:reset": "node scripts/oncall/demo.mjs reset"`
    - `"oncall:responder": "node scripts/alert-receiver.mjs --respond"`
    - `"oncall:trigger": "node tmp/oncall-demo/scripts/collect-fixture.mjs --endpoint http://127.0.0.1:4318"`
    - `"oncall:verify": "node tmp/oncall-demo/scripts/collect-fixture.mjs --endpoint http://127.0.0.1:4318"`

- [ ] **Step 1: Write failing tests:**
  - `breakDemo runs the steps in order and plants the bug`:
    - use a temp `repoRoot` and a fake `git` that records calls and, for `worktree add`, creates `<workdir>/src/sourceFetch.mjs` holding the real file's text;
    - assert the recorded call order (fetch, worktree add with `-b oncall-demo/<stamp>` and `origin/main`, commit with `Tighten source download cap`, push `-u origin oncall-demo/<stamp>`), then `npm ci` with `cwd===workdir`;
    - assert the planted file now has 2 `1_000_000`.
  - `breakDemo --no-push skips the push`.
  - `breakDemo refuses when tmp/oncall-demo exists`: it rejects matching `/oncall-demo/` and no git call is made.
  - `resetDemo with no worktree does not throw`.
  - In `test/alert-receiver.test.mjs`:
    - `parseArgs --respond sets respond and keeps defaults`: `parseArgs(['--respond'],{}).respond===true` and `workdir` ends with `tmp/oncall-demo` (`path.sep`-agnostic);
    - `parseArgs without --respond has respond false` (ZC-06 unchanged);
    - `--workdir needs a value` throws.
- [ ] **Step 2:** Run both test files. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `scripts/oncall/demo.mjs`, the `parseArgs` and CLI changes, and the package.json scripts.
- [ ] **Step 4:** Run both test files: all pass. Then smoke-check locally (no push) in the zc-07 worktree: `node scripts/oncall/demo.mjs break --no-push`. Expect `tmp/oncall-demo` on `oncall-demo/<stamp>`, `git -C tmp/oncall-demo log -1 --format=%s` = `Tighten source download cap`, and `node tmp/oncall-demo/scripts/collect-fixture.mjs` printing `failed`/`load`/`SOURCE_LIMIT`. Then `node scripts/oncall/demo.mjs reset` and `git branch -D oncall-demo/<stamp>`. Expect `git worktree list` without `oncall-demo`. Because `origin/main` doesn't have Task 1's files yet, the smoke needs nothing beyond `src/` existing there.
- [ ] **Step 5:** Commit the four files: "Add on-call demo break/reset commands and the receiver's --respond mode (ZC-07)".

### Task 4: The on-call engineer subagent, the incident-response skill and the team docs

**Files:**
- Create: `.claude/agents/on-call-engineer.md`, `.claude/skills/incident-response/SKILL.md`
- Modify: `docs/agent-team.md` (one table row), `AGENTS.md` (one short paragraph)
- Test: `test/oncall-agent-files.test.mjs`

**Interfaces:** none in code. The files' required content is pinned by the tests below and by the spec sections "The on-call engineer subagent" and "The incident-response skill".

- [ ] **Step 1: Write failing tests** in `test/oncall-agent-files.test.mjs` (parse frontmatter with a small regex `^---\n([\s\S]*?)\n---\n`, CRLF-tolerant):
  - Agent file:
    - frontmatter `name: on-call-engineer` and a non-empty `description`;
    - body mentions `incident-response`, `oncall-fix/`, `oncall-demo/`;
    - body has a "Never" section containing `merge`, `main`, `force`, `Analytics`, `.env`, `gh auth`.
  - Skill file:
    - frontmatter `name: incident-response`, and a `description` containing `alert`;
    - body mentions `scripts/collect-fixture.mjs`, `npm test`, `gh pr create --base`, `report.md`, `127.0.0.1:3000`;
    - body lists the forbidden paths `scripts/oncall/` and `docs/evidence/`.
  - No answer key in the agent docs: neither file contains `1_000_000`, `10_000_000`, `sourceFetch` or `SOURCE_LIMIT`.
  - `docs/agent-team.md` has a table row starting `| **On-call engineer**` that mentions `oncall-fix/` and `never merges` (case-insensitive).
  - `AGENTS.md` mentions `.claude/agents/`, `.claude/skills/` and `on-call-engineer`.
- [ ] **Step 2:** `node --test test/oncall-agent-files.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Write the files.**
  - Agent: role, then May / Never lists per the spec, and "Follow the incident-response skill."
  - Skill: the six numbered steps from the spec.
    - Step 2 gives concrete read-only Grafana datasource-proxy GET examples for Loki: `curl -s "http://127.0.0.1:3000/api/datasources/proxy/uid/<loki uid>/loki/api/v1/query_range?query=..."`. Find the Loki datasource uid in `observability/` provisioning, or tell the agent to read it from `GET /api/datasources`. Query for `service_name="explorer"` error logs from the last 15 minutes.
    - Step 5's PR body template has headings Alert / Evidence / Root cause / Fix / Tests.
  - `docs/agent-team.md` row:
    - Responsibility: woken by an alert through `npm run oncall:responder`; diagnoses; fixes a code bug on `oncall-fix/*` and opens a PR into the `oncall-demo/*` branch, or writes a remediation report.
    - Never does: never merges, pushes to `main` or force-pushes, edits Analytics, or reads secrets.
    - Add one sentence under the table saying this is the only role that commits and pushes, and only to `oncall-fix/*`.
  - `AGENTS.md`: a short paragraph under "Coordination and delegation":
    - project subagents live in `.claude/agents/` and skills in `.claude/skills/`, and any agent tool can read them;
    - `on-call-engineer` is the one exception to "Workers never stage, commit or push", limited as `docs/agent-team.md` states;
    - the generic process skills (brainstorming, plans, subagent-driven development) come from the superpowers Claude Code plugin.
- [ ] **Step 4:** Run the test. Expected: pass. Then smoke-check:
  - `claude -p --agent on-call-engineer --max-turns 2 "In one sentence, what may you never do?"` from the worktree. Expected: an answer mentioning merging or `main`.
  - `npm test`. Expected: all pass (the previous count plus the new tests), 0 fail.
  - Remove any `runs/` leftovers before committing.
- [ ] **Step 5:** Commit the four files plus the test: "Add the on-call engineer subagent and incident-response skill (ZC-07)".

### Task 5: README "On call" demo section

**Files:**
- Modify: `README.md` (the "On call" section)
- Modify: `test/observability-files.test.mjs` (if it pins README text, extend it; otherwise add one assertion in `test/oncall-agent-files.test.mjs`)

- [ ] **Step 1: Write a failing assertion:** README contains `npm run oncall:break`, `npm run oncall:responder`, `npm run oncall:trigger`, `npm run oncall:verify`, `npm run oncall:reset` and `GH_TOKEN=$(gh auth token -u`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Add an "On-call agent (ZC-07)" subsection after the existing ZC-06 alert text:
  - the six-step demo table from the spec;
  - the one-sentence reason the PR targets the demo branch, not `main`;
  - what the agent may and may never do, linking `.claude/agents/on-call-engineer.md` and `.claude/skills/incident-response/SKILL.md`;
  - "the alert resolves on a 5-minute timer; `oncall:verify` is what shows the fix works";
  - where the run's files land (`tmp/oncall/<stamp>/agent.jsonl`, `alert.json`, `settings.json`) and that evidence is committed under `docs/evidence/` after the recorded run;
  - prerequisites: Claude Code installed and logged in, and `gh` logged in for the repo's account.
- [ ] **Step 4:** Run the test and `npm test`. Expected: pass.
- [ ] **Step 5:** Commit: "Document the on-call agent demo (ZC-07)".

### After the tasks (main session, not a subagent task)

- Final whole-branch review on the most capable model.
- Push the branch, open PR 1 (`Part of #43`), wait for `test`, `compose`, `observability` and GitGuardian, then merge with `--match-head-commit`.
- Then the recorded run and PR 2 per the spec.
