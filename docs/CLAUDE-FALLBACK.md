# Backup workflow

Owner-approved allocation, October 12, 2026, updated after the advisory trial: Codex retains browser verification; Claude handles investigation, implementation and independent review. Use the Claude roles when Codex's allowance is exhausted or the owner requests a switch. If Codex is unavailable, browser verification remains pending until its allowance and browser tools are available; do not substitute a Claude browser verifier without a new owner instruction. This does not authorize new product scope, deployment, permission changes, paid usage or changes in sibling repositories.

## Roles

| Role | Requested model and effort | Responsibility |
|---|---|---|
| Coordinator | Opus 5.5 / high | Read the handover, bound assignments, integrate work, maintain evidence and report to the owner |
| Investigator | Haiku 5.5 / xhigh | Read-only code/interface investigation; precise mechanical changes only with a separate bounded assignment |
| Implementer | Opus 5.5 / high | Assigned TRRC changes and meaningful regression checks |
| Browser verifier | Codex / current selected model | Read-only walkthrough, responsive/keyboard/error/download checks and screenshots; verify actual model/tool availability and retain independence from the implementer |
| Independent reviewer | Fable 5.1 / high | Review requirements, code differences and actual executable/browser evidence; report defects before acceptance |

Use exact model IDs (`claude-haiku-5-5`, `claude-opus-5-5`, `claude-fable-5-1`) and record the actual model/effort shown by Claude. Do not silently substitute or assume an alias establishes routing. Availability and included subscription allowance must be checked at the time of switch.

At most two active worker assignments, including the reviewer, with non-overlapping write ownership. The coordinator is not a worker. Count external CLI assignments as well as any Codex workers during a transition. Wait for or stop workers before transferring their ownership. Release reviewers after checkpoints; they are not continuously running standbys. This is a procedural limit, not an installed scheduler.

## Subscription boundary

Use the existing Claude Team subscription through Claude CLI authentication. Do not enable API-key billing, accept paid usage credits, change billing settings, purchase services or use a non-interactive invocation that could bypass an interactive paid-usage consent gate. If included access is unavailable or paid consent appears, stop the affected assignment and report it. A displayed token-cost estimate is not proof of an account charge or an account billing audit.

## Handover before a switch

1. Stop or finish current writers. Save their assignment states and return messages.
2. Save the authorized objective, governing documents, exact Git root/branch/revision, current working-tree status, changed paths and ownership. Preserve uncommitted work; do not reset, repin or regenerate the application.
3. Record decisions, open questions, failed/blocked/unrun checks, exact commands, screenshots and the next smallest step. Preserve any active timebox's original deadline; switching models does not restart it.
4. Distinguish dataset, well/report, current request and historical run selection. Record whether source acquisition, browser saving, hosted collection and the receiver handoff were actually exercised.
5. The Claude coordinator reads local TRRC `AGENTS.md` and its adopted shared delegation workflow. Keep Analytics/Phi code untouched; receiver findings go to its owner only when messaging is authorized.

Every assignment retains the shared seven fields: Project, Task class, Brief, Scope, Validation, Report and Return. Include verified owning root, requirement IDs or maintenance N/A, allowed paths, other owners, exact acceptance checks, checkpoint and completion/slot state. A redacted advice-only external brief must explicitly say it has no repository/code evidence; keep its private root and ownership record local.

## Browser gate

Verify browser capability separately from model login and dispatch. Confirm the actual tool connection, selected application origin, navigation, DOM/screenshot access and a harmless read-only interaction before assigning a verifier. An inaccessible preview, authentication gate, failed tool runtime or missing evidence is BLOCKED, not passed.

Test the existing preserved example first, without unnecessary live collection: dataset library/opening, filters and selected well/report, quality/quarantine, source evidence, historical collection details and downloads. Then test the authorized new guest flow against a controlled collection response before any bounded live request. Do not modify permissions to force access or bypass preview authentication. Do not automate sign-in with secrets or claim Codex browser/MCP access automatically transfers to Claude.

The Codex verifier records origin, viewport, current version/run, steps, observed results, screenshots and relevant network/error evidence. Fable assesses that evidence independently; unavailable gates prevent acceptance. Codex allowance exhaustion does not waive the browser gate. Claude may continue unaffected authorized implementation and non-browser checks, but must report the pending browser gate honestly.

## Trial status, October 12, 2026

The first trial uses one redacted advisory response per role, with tools/customizations/additional advisors disabled. It establishes model dispatch and handoff, not repository implementation or browser readiness. Sessions launch in the already trusted Nexus directory solely to avoid changing folder trust; no Nexus files are read or edited by the consultant. Startup directory is not task ownership: all local task documentation and exported trial transcripts remain in TRRC.

- Claude authentication: observed `claude.ai`, first-party, Team login.
- Claude CLI: 2.1.296.
- Haiku 5.5 / xhigh: completed bounded advisory response.
- Opus 5.5 / high: completed coordinator proposal from Haiku's redacted findings.
- Fable 5.1 / high: completed independent advisory review of the redacted proposal; did not review private code or approve a release.
- Main's browser capability probe: FAILED twice, `trusted Node process exited unexpectedly; kernel reset, rerun your request`. No browser verifier was dispatched; no browser gate passed.
- Product tests, live source collection, hosted release checks and receiver import: UNRUN in this trial.
- No product code edits, commits, pushes, deployments, pins, permission or billing-setting changes.

Scratch transcripts: `tmp/claude-fallback-haiku-2026-10-12.txt`, `tmp/claude-fallback-opus-2026-10-12.txt`, and the Fable transcript after completion. These are local ignored outputs, not a replacement for a checked-in handover or test evidence.

All three CLI sessions were closed after their transcript exports. Model responses and the two advisory handoffs completed. Repository tool execution, an implementer role, and the initially proposed separate Opus browser-verifier assignment were not exercised. Opus's response used the word "ASSIGNED" for the browser role; this was a proposed responsibility, not an actual dispatch. The owner's subsequent instruction assigns browser verification to Codex instead. See `claude-fallback-trial-2026-10-12.md` for gates and corrections.

## Next engineering checkpoint

Latest continuation: `verification-2026-10-13-storage-admission.md`. Final full suite291/291, local SQL22/22, actual metered SQL-plus-Storage8/8, five positive local Edge cases plus CPU termination control, TypeScript and preservation passed. Independent Storage and admission reviews passed the bounded local prototype. Storage deletion, processing/download accounting and short-lived private attestation are implemented as local/draft code with regression evidence. The SQL drafts were not applied to Portfolio. Hosted authentication/headroom/physical-orphan gates and browser guest wiring remain incomplete; admission stays disabled. All consultant sessions and test-owned containers/networks closed; no commits, pushes or deployment.

Current October 13 checkpoint: `verification-2026-10-13-connected-release.md`. Full suite 264/264 and TypeScript passed; browser persistence 16/16 and actual bounded local collection 9/9 passed. Datasets/pins unchanged. Local guest reference code exists, but durable SQL/Storage, cleanup/quotas, actual guest Edge profiling, browser guest wiring and independent backend review remain incomplete. Hosted admission stays disabled. Work paused; no deployment, commit or push. All consultant sessions and test-owned containers closed.

Latest checkpoint: `verification-2026-10-12-source-fetch-adapter.md`. Lookup and collection now share the actual bounded fetch implementation. Independent bounded review PASS; 228 full tests, 8 adapter tests, 7 controlled Node/Edge native-fetch parity cases including actual 30-second timeout, and 21 existing browser checks PASS. All sessions and the test-owned container closed. Hosted journal/Storage/SQL, quota/admission headroom and browser saving remain unverified/unimplemented; no guest-release acceptance or deployment.

Current checkpoint: `verification-2026-10-12-acquisition-continuation.md`. Acquisition evidence retention plus the independent review's two omission paths are fixed with RED→GREEN evidence; full suite 220/220, existing browser 21/21, three exact preserved exports across separate actual local Edge workers. Trusted journal/Storage/SQL services, real-fetch adapter parity, hosted headroom and guest browser saving remain unverified/unimplemented. No guest acceptance or deployment. All assignments and the test-owned container are closed.

Latest implementation checkpoint: `verification-2026-10-12-export-implementation.md`. Actual shared export core, private reader loading and resumable preparation/finalization are implemented; the final suite passed 213/213. Local cached Edge measurements now cover the actual one-call export core without a Buffer shim. Separate-isolate continuation and hosted acquisition/Storage/SQL remain unverified; acquisition request-evidence integration is still open. The original hour expired and work is paused. Older blocked/prototype statements below describe earlier checkpoints.

Latest owner decision: use existing Supabase Free only. The selected guest design is revision 5 in `superpowers/specs/2026-10-12-guest-collection-browser-save-design.md`; the Node worker is an unselected alternative. Free plan and read-only project inventory are confirmed. No migrations were applied. The later October 12 continuation completed independent design correction/review and isolated Node loader parity; actual Edge feasibility remains blocked and complete reader-based export parity is unrun. Guest implementation has not begun. See `verification-2026-10-12-guest-gates.md`; earlier Node reviews and diagnostic CPU figures do not approve hosted feasibility.

After the owner started Docker, a cached Edge image provided actual local user-worker measurements, independently reviewed by Fable. All three preserved versions/TARs match with a test-only Buffer bridge; unmodified Buffer compatibility and a larger fixture's memory fit fail. The startup blocker is resolved, but hosted/complete-adapter feasibility is unverified. See `verification-2026-10-12-local-edge.md`. Product code is unchanged; no guest implementation or deployment is accepted.

October 12 resumption: the backup roles have now inspected actual assigned TRRC code. Codex verified the existing local app using an installed Chrome/Playwright terminal surface: 21 browser checks passed, the actual TAR download matched the frozen version, the isolated Node suite passed 186/186 and TypeScript passed. The CUA tool remains blocked at kernel startup, and hosted/guest collection is not verified. See `verification-2026-10-12-backup-resume.md` and the proposed guest design under `superpowers/specs/`. Do not use the earlier advisory-only trial as the current browser status.

Prepare one reviewed guest-collection design using the current source, validation, publication and receiver contracts. Verify existing capabilities from code rather than asking the owner to reconstruct them. Define the hosted worker, guest ownership/resume, server quotas, retention and costs before provisioning anything. Preserve existing well/date/cap rules, raw bytes, quarantine reasons, calculations, immutable versions and TAR/CSV/JSON compatibility.

The first implementation milestone should demonstrate one explicitly selected well and bounded period through real server collection, truthful request-specific stages, transactional browser saving, downloadable evidence-preserving backup and the receiver's supported validated import. Separate examples from live requests. Optional sign-in/cloud saving comes later. This milestone is not approved for deployment by this workflow.

Restore and prove browser verification before accepting the milestone. Existing unresolved correctness/test/receiver findings remain open until fresh checks and independent review establish otherwise.
