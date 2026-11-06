<!-- Copied 2026-11-06 from the private sibling phi-analytics/docs/swd-intelligence-lab/agent-workflow.md so this public repository is self-contained. This copy governs Explorer. Links to sibling documents were repointed to Explorer's own equivalents. -->
# Delegation workflow

Applies to `phi-analytics`, `swd-injection-analytics` and `texas-rrc-explorer` through each repository's own `AGENTS.md` entrypoint. They are independent sibling repositories; instructions in one sibling are not automatically inherited by another. This document governs coordination, not product scope or permission to implement, stage, commit, push or deploy.

Read the owning repository's instructions and current authorized task first. Preserve the integration contract ([ADR 003](adr/003-local-analytics-browser-handoff.md)), the evidence gates ([GATES.md](../GATES.md), [requirements](requirements.md)) and the owning PRD: [Analytics](https://github.com/thaiphi/well-injection-insights) or [Explorer](../SPEC.md). Dated feasibility briefs are historical task records, not substitutes for the current brief.

## Roles and retained ownership

| Role | Model and reasoning | Ownership |
|---|---|---|
| Main | Keep the session's current selection; this workflow does not assign Main a model | Owner discussion, scope/contracts, workspace selection, index freshness, coordination, integration, Git and final verification |
| Advisor/reviewer | GPT-6 Astra / high | Independent bounded design/contract advice and meaningful review checkpoints |
| Feature implementer | GPT-6.1 Sol / medium; explicitly high for integration-heavy work | Assigned implementation files and focused checks |
| Bounded explorer / Graphify | GPT-6 Luna / medium | Read-only source/interface investigation and focused mapping; no scope selection or feature ownership |
| Exact mechanical worker | GPT-6 Luna / low | Explicit one/two-file changes with supplied values and checks |

Main verifies that the supported dispatch tool offers the selected model/reasoning and records the actual selection. Do not silently substitute a model or claim that a default setting proves routing. Reuse the original implementer for fix rounds. Workers never stage, commit or push, revert another agent's edits, or spawn helpers; Main controls all dispatches.

## Required seven-field brief

Every dispatch or reactivation uses these seven fields. Do not omit repository identity, requirement mapping, write ownership or acceptance because a worker already has conversation context.

```text
Project: Exact repository name and verified absolute Git top-level/root. For a multi-repository task, list every root separately; identify the owning root for each output.
Task class: Role, exact model/reasoning, and read-only or bounded write mode.
Brief: Requested outcome and relevant requirement IDs with their source (for example SWD-08 or RRC-05). For maintenance, state N/A and explain why no product requirement applies. Include the intended checkpoint/timebox.
Scope: Exact allowed files or bounded path allowlist, ownership per root, read-only inputs, and exclusions. Identify concurrent owners and confirm no overlapping write paths. No staging, commits, pushes or child agents.
Validation: Concrete commands/checks, expected passing evidence and preserved invariants. Cite meaningful numerical, source, interface or export gates when applicable; mark unavailable checks unverified.
Report: Changed paths, check results, findings, evidence and limitations. Send useful intermediate findings, blockers or decisions promptly; flag an exceeded checkpoint instead of continuing silently.
Return: Final concise outcome and remaining blockers/decisions for Main; say whether the assignment is complete and its slot can be released.
```

Main resolves proposed shared-file/interface edits before dispatch. Assign one writer per path, or sequence an explicit ownership handoff after the first writer stops. Another worker may inspect that path read-only. Requirement IDs do not authorize work beyond the user's current scope.

## Two-slot dispatch procedure

1. Before every spawn or follow-up that reactivates a worker, Main checks the supported agent-status tool and its assignment record. Count all active subagents, including Astra and any unfinished assignment waiting on a tool or input. Main is not a subagent.
2. Record each assignment's agent, role/model/reasoning, exact roots, write allowlist and state. Start the next assignment only when the resulting active count is at most two and write ownership is disjoint.
3. If both slots are occupied, wait for completion or interrupt/pause an assignment and confirm it has stopped before releasing its slot. A progress message or informal 'yield' does not release a slot. Retain unfinished work and its return state for resumption.
4. Before resuming a paused implementer, recheck slots and ownership. Release Astra's slot after its bounded advice/review is complete; do not keep it running as a standby during routine implementation.

Use Astra when a consequential design/contract decision needs independent judgment, after meaningful changes to calculation/source/export contracts, and at the required final review gate. Provide the relevant requirements, exact review paths/diff and executable evidence. Keep the review independent: Astra reviews read-only and does not author the change it approves. Routine implementation proceeds between checkpoints; this scheduling does not remove numerical/reference tests, source lineage checks, export/browser gates or required re-review after fixes.

These are written procedural safeguards, checked by Main using observed task state. No scheduler limit, hook or automatic file-ownership enforcement is installed or established by this document. Do not claim technical enforcement without evidence, and do not add global settings or hooks without explicit authorization.

## Repository and Git boundaries

Before delegation, Main verifies each named root with `git -C <root> rev-parse --show-toplevel` and resolves the proposed output paths against that root. Use the exact owning repository, not the umbrella folder or another sibling.

Only when staging/committing is separately authorized, Main repeats the top-level and resolved-target checks immediately before the operation. Confirm every target remains inside the intended repository/allowed paths, inspect the current diff/status, stage explicit paths only, and inspect the index for unrelated changes before committing. Preserve existing edits, source fixtures and published history. Workers never stage, commit or push.

## Useful progress and evidence

Main gives a short update when useful results arrive, a blocker or decision appears, or work passes its expected checkpoint. Relay worker findings promptly, including what they imply and the next action; do not hold them until the final answer. During sustained work, avoid going roughly a minute without a useful status update.

State what is established, what remains uncertain and what the next check resolves. Avoid empty repetitive updates, unchanged polling narration and unsupported completion claims. Final delivery names changed paths, actual roles/models, validation outcomes and remaining limits; distinguish procedural compliance from technical enforcement.
