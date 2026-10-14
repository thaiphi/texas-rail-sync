# Backup workflow resumption — October 12, 2026

Later October 12 continuation: revision-4 independent review completed, design corrected to revision 5, and an isolated Node loader-parity probe plus targeted regressions were executed. Complete export parity and actual Edge profiling remain unverified/blocked; guest implementation did not begin. See `verification-2026-10-12-guest-gates.md` for current results and `review-2026-10-12-guest-gates-fable.md` for independent evidence review. The rest of this file records the earlier baseline/timebox and is not a claim that those browser/full-suite checks were repeated.

Status: existing local baseline verified; guest collection design in independent review. This is not implementation completion or hosted release acceptance.

Owner objective: no-login bounded public well collection, truthful current-request progress, preserved evidence/quality, browser-local saving, unchanged portable exports and optional later cloud saving. The backup allocation is Haiku investigation, Opus design/implementation, Fable independent review and Codex browser verification. Work belongs to TRRC only.

## Actual roles and scope

- Haiku 5.5/xhigh inspected assigned source/test/docs paths with Read/Glob/Grep only. Findings are in `investigation-2026-10-12-backup-haiku.md`; its executable gates were UNRUN. Assertions observed in test source are not executed test results.
- Opus 5.5/high inspected additional source interfaces and drafted `superpowers/specs/2026-10-12-guest-collection-browser-save-design.md`. Main saved the proposed document. No product code was written. Opus corrected several tentative Haiku findings after reading their call sites.
- Fable 5.1/high independently reviews the written design against source and actual verification evidence. No implementing worker shares its write ownership.
- Codex ran local browser/check gates. At most two external worker sessions are open at once; completed sessions are closed after export. Private credentials, environment/account files and raw customer snapshots are excluded from Claude briefs and tool scope.

The existing Claude Team login was used. No paid-credit consent, API-key billing, services, ACL/persistent-permission changes, commits, pushes or deployments were introduced. The already trusted Nexus startup directory supplies no project context: consultants run with custom system instructions, safe mode, assigned tools and TRRC read scope; Nexus code remains untouched.

## Gates run by Main

| Gate | Exact command/action | Result |
|---|---|---|
| Full production Node suite | Bundled `node.exe scripts/check-isolated.mjs` | PASS **186/186**, fail 0, skipped 0; log `tmp/v-x9JFil/suite.log`. Runner clones sources/tests/data into a fresh short workspace. |
| TypeScript | Bundled `node.exe node_modules/typescript/bin/tsc --noEmit` | PASS, exit 0. |
| Tracked source/version/run/default-pin preservation | `git diff --quiet -- raw artifacts runs public/artifact-integrity.json` | PASS, exit 0. No bytes differ from tracked HEAD. This does not inventory unrelated ignored/untracked files. |
| Default-pin preservation during browser actions | Compare complete file bytes before/after the walkthrough | PASS, file SHA-256 `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`. |
| Original TAR native browser download | Download via the rendered package link, save locally, compare to `buildVersionArchive` using actual registry pins | PASS **1,325,056 bytes**, filename `rrc-2026-10-09-uic000020838-v1.tar`, SHA-256 `492ebaa6b5f7c9353c39416dc72a1cf5180d1e9ba7a3af21d4b063c20e81db8a`; matches the prior preserved archive digest. |
| Browser walkthrough | Bundled `node.exe tmp/backup-browser-probe-2026-10-12.mjs` | PASS **21 checks**, no page errors or failed network requests in the final run. |
| Proposed ledger API availability | Bundled `node.exe --input-type=module` importing `DatabaseSync` and opening `:memory:` | PASS on Node **24.19.0**. Does not prove the minimum Node floor, WAL/transaction durability, disk races or any implemented ledger. |

The old rename-EPERM failure did not recur in this isolated suite. This pass does not establish its underlying intermittent Windows/sandbox cause or remove its historical evidence.

## Browser method and evidence

The Codex CUA tool failed before page access: `node_repl kernel exited unexpectedly`, with `windows sandbox failed: helper_unknown_error: setup refresh had errors`. This tool remains blocked.

An existing Playwright 1.62.1 library and installed Chrome channel provided an alternative terminal browser surface. No npm/npx, installation, browser download, personal browser profile, login automation or permission repair was used. Chrome reported version 154.0.8037.98. A temporary local server forwarded **GET/HEAD only** to the existing Explorer handler and rejected every write method. A source-fetch guard and browser origin restriction prevented live acquisition and external navigation. Both browser and server closed after each check run.

Origin was the ephemeral loopback app server (final run URL in `screenshots-2026-10-12-backup/probe.json`), not the authenticated Lovable preview. Desktop viewport 1440×1000; narrow viewport 390×844; timezone America/Chicago.

Final checks:

1. All three preserved versions appear with Open dataset controls.
2. The original example opens with five inventory rows and 28 reports.
3. An empty filter clears stale well/report selection.
4. Keyboard Enter on Clear filters restores the five records.
5. An inventory well without acquired history shows unavailable history rather than zero activity.
6. Selecting February 2024 updates report details to source report 3775426.
7–12. Overview, Data quality, Sources, Downloads, Collection details and the real TAR download remain reachable with the original selected version.
13. A failed recorded invocation, `dc99b8e9-aa1c-429a-ac6e-cf24f8d47d0a`, loads as failed and remains inspectable.
14. Global Find excludes the unrelated dataset workspace.
15. Three-digit UIC input is rejected before collection and the collection control remains disabled.
16. Narrow records document width is 390 px at a 390 px viewport; required tables/tabs remain contained scroll regions.
17–20. Historical workflow stays out of new-request progress; another immutable version opens with UIC 000056484 and 16 reports; history navigation preserves its opened identity; an unavailable version reports an error without stale well details.
21. Default pin remains byte-identical.

Intermediate harness failures are retained as diagnostic facts: the bundled Playwright default requested absent browser build 1234; selecting the existing Chrome channel resolved that executable mismatch. Early selectors incorrectly used visible icon text as accessible link names, and selected-run assertions ran before asynchronous loading completed. The harness was corrected using the actual DOM controls and awaited run state. A direct TAR comparison initially supplied the three-field default-pin file without the registry's public classification, correctly triggering fixture/provenance refusal; using actual registry metadata resolved the verifier precondition. No application behavior or guard was changed to force these passes.

## Screenshots

The eight reference screen destinations are represented by fresh actual local captures:

- [Find & collect](screenshots-2026-10-12-backup/find-desktop.png)
- [My datasets](screenshots-2026-10-12-backup/datasets-desktop.png)
- [Overview](screenshots-2026-10-12-backup/overview-desktop.png)
- [Records](screenshots-2026-10-12-backup/records-desktop.png)
- [Data quality](screenshots-2026-10-12-backup/quality-desktop.png)
- [Sources](screenshots-2026-10-12-backup/sources-desktop.png)
- [Downloads](screenshots-2026-10-12-backup/downloads-desktop.png)
- [Collection details](screenshots-2026-10-12-backup/collection-desktop.png)

Additional captures: [History](screenshots-2026-10-12-backup/history-desktop.png), [Help](screenshots-2026-10-12-backup/help-desktop.png), [empty records](screenshots-2026-10-12-backup/records-empty-desktop.png), [invalid identifier](screenshots-2026-10-12-backup/find-invalid-desktop.png), [narrow records](screenshots-2026-10-12-backup/records-mobile.png), [narrow Find](screenshots-2026-10-12-backup/find-mobile.png).

Also captured: [unavailable version](screenshots-2026-10-12-backup/version-unavailable-desktop.png).

Main inspected actual desktop and narrow records screenshots. Existing navy navigation, light workspace, workspace tabs, table/detail hierarchy and contained narrow scrolling remain visible. This pass changes no UI and is not a fresh exhaustive comparison of every reference detail or full accessibility acceptance.

## Requirements and remaining gates

Existing local preservation checks support RRC-03/04 (records, quality/source/calculation distinctions), RRC-05 (immutable version/package), RRC-06 (navigation/selection/narrow state), and RRC-09/10 (recorded collection/history). Invalid input supports the existing RRC-01/02 entrypoint. No new live acquisition or hosted guest success is claimed.

UNRUN: hosted signed-in/guest collection; new job/lease/quota migrations; browser saving/offline reopening; crash-resume; new-run live stage journal; coordinated Analytics receiver import; actual Deno check; starter Vitest; complete keyboard/accessibility audit; broader operator/sorting/chart interactions beyond this focused baseline. Existing receiver quarantine eligibility and broader PRD gaps remain open.

Backend facts checked against current official guidance: [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits) state 150 seconds on Free, 2 seconds CPU and 256 MB memory; [pricing](https://supabase.com/pricing) lists 500 MB database and 1 GB storage on Free. Those limits are not a sizing proof or authorization for an upgrade. The public changelog was retrieved separately after the web tool rejected its Markdown content type.

Owner selected **existing Supabase Free**. Read-only MCP inspection confirmed organization `qrhxxtjtjatfumoqdorh` is `free` / `tier_free`; Portfolio (`phxiqnsebqaalvkanljb`) is healthy. Database usage was 12,621,491 bytes; preserved archive contains 134 chunks and one snapshot. `pgmq`, `pg_cron` and `pg_net` are not enabled. Storage usage and remaining Edge/egress quotas remain unverified. No cloud resources, extensions, migrations or data were modified.

The selected design is revision 4 in `superpowers/specs/2026-10-12-guest-collection-browser-save-design.md`. Node/SQLite is preserved only as an unselected alternative. Revision 4 is feasibility-first: trusted reader parity, Edge profiling, quota verification and independently reviewed private journal/storage migrations precede implementation. Earlier Fable reviews assessed Node revisions; they do not establish acceptance of revision 4. Final selected-design review remains a separate gate.

## Timebox handoff

Paused at the one-hour boundary, approximately 01:36 CDT on October 12. All external Claude sessions were closed. The final Fable dispatch did not produce a revision-4 review: its returned response only acknowledged the previous Node review. This is an incomplete review gate, not approval. Resume with a fresh bounded review brief before implementation. Main also flags revision-4 sections 3–4 for review: JavaScript evidence validation versus SQL transaction boundaries, and the proposed state-changing GET status route. No product code changed; final documentation whitespace and tracked data/pin preservation checks passed.
