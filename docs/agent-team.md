# Agent team

How the AI agents and the owner build Explorer and SWD Injection Analytics together. The coordination rules every agent follows are in [agent-workflow.md](agent-workflow.md); the task list is in [GitHub Issues](https://github.com/thaiphi/texas-rail-sync/issues).

## Who does what

| Member | Responsibility | Never does |
|---|---|---|
| **Owner** (human) | Decides scope and product questions, approves anything irreversible or outward-facing (making repos public, licence, production deploys, Lovable Publish, repository settings), approves pushes and merges in the Analytics repo, records rulings in issues and docs | — |
| **Explorer main session** (Claude Code in this repo) | Turns an issue into a design and plan, dispatches subagents, integrates their work, runs final verification, owns Git for this repo (worktree branch, PR, merge, cleanup), posts evidence on the issue | Edits the Analytics repo |
| **Analytics main sessions** (Claude Code in `well-injection-insights`, one per workstream, e.g. licence/CI and phase work) | The same role for the Analytics repo, under that repo's own AGENTS.md and preservation rules | Edits this repo |
| **Implementer subagent** | Writes the code and tests for one task from a written brief, in the main session's worktree | Stages, commits, pushes, spawns agents, changes files outside its brief |
| **Reviewer subagent** | Reviews each task's diff against its brief (spec compliance and quality), then the whole branch before merge | Writes the change it reviews |
| **Independent design reviewer** (a stronger model, e.g. Fable) | Read-only second opinion on consequential designs, called when the owner asks or a contract changes | Writes code |
| **Explorer/search subagent** | Read-only searches across many files, returning conclusions | Writes anything |

## How work flows

1. **Issue.** Every piece of work has a GitHub issue with acceptance criteria (`RRC-xx` product requirements, `ZC-xx` course work).
2. **Design.** Larger work gets a short design in `docs/superpowers/specs/`, approved by the owner; owner rulings are recorded there and in the issue. Small changes are agreed in chat.
3. **Plan.** Approved designs become a task plan in `docs/superpowers/plans/`.
4. **Build.** The main session creates a git worktree branch; for each task an implementer writes it test-first and a reviewer checks it; fixes loop until the review passes. A final whole-branch review follows.
5. **Ship.** The main session opens a PR (`Closes #n` or `Part of #n`). CI runs `ci` (tests, with Postgres) and `compose-smoke` (the whole Docker system); after `ci` passes on `main`, `deploy-dev` deploys automatically. The main session merges, records evidence on the issue and removes the worktree. Production is released by the owner ([deployment.md](deployment.md)).

## Working between the two repositories

The two repos are separate sessions. They coordinate by Claude Code cross-session messages: a request names the issue, the exact contract (for example ports, file names or message fields) and the acceptance check, and the receiving session works under its own repo's rules and owner approvals. Contracts between the apps live in [ADR 003](adr/003-local-analytics-browser-handoff.md). Neither session edits the other's repository, and neither does on the other's behalf something its own permissions refused.

## Memory and handover

Sessions keep short persistent notes (decisions, current status, where to resume) outside the repo, and the repo keeps the durable record: AGENTS.md, specs, plans, ADRs, `docs/requirements.md`, verification records and issue comments. A new session starts from AGENTS.md and the open issues.

## History

In October 2026 the same workflow ran with Codex models (Astra as reviewer, Sol as implementer, Luna for search), as recorded in [agent-workflow.md](agent-workflow.md) and the dated review files in `docs/`. From November 2026 the team runs in Claude Code as described above.
