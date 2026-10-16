# Guest collection — hosted verification (October 15, 2026)

Project: `phxiqnsebqaalvkanljb` (Portfolio). Existing worktree: `guest-live`, previously verified at `e5a2999`. Scope: Task 11 Steps 2–5. No commits or pushes.

Verification concluded at approximately 23:31 CDT on October 15, 2026 (advisor timestamp: October 16, 2026 04:31:09 UTC).

## Result: smoke test failed; rollback redeployment completed as version 6

The migration succeeded after the owner reconnected the connector. The cron job and automatic proof passed. The security-advisor comparison initially stopped the rollout because ten new INFO findings mentioned `trrc_guest`. The owner subsequently accepted those findings and revised the gate, as recorded below. Step 3 is complete. Step 4 was completed by the owner in the dashboard, per their confirmation. Step 5 deployed version 4 successfully, then FAILED at the first smoke-test request with Node `fetch failed`, before receiving an HTTP status. No further smoke-test requests or log queries were made. The owner subsequently confirmed deleting `TRRC_GUEST_ENABLED`; rollback redeployment succeeded as ACTIVE version 6 on October 16, 2026 at 12:11 CDT (17:11 UTC). Secret absence and live HTTP behavior were not independently verified.

Continuation: October 16, 2026, 11:48 CDT (16:48 UTC).

## Owner ruling — security gate passes

On October 16, 2026, the owner accepted the ten INFO `rls_enabled_no_policy` findings as intended lockdown: the migration deliberately enables RLS without policies and revokes schema/table access from `public`, `anon`, and `authenticated` (migration lines 12, 123–133, 718–720). The existing `trrc_archive` schema has the same INFO notice. The two WARN findings in the baseline were unchanged. Step 2 therefore passes under the owner's revised gate. No database permissions or policies were changed in response to these INFO findings.

Updated security stop rule: stop on a NEW WARN or ERROR finding, or on any finding saying a `trrc_guest` table or function is reachable by `anon`/`authenticated`.

## Verified

| Check | Result |
|---|---|
| Prior access checks: `list_projects`, `get_project` | Portfolio project present, organization `qrhxxtjtjatfumoqdorh`, ACTIVE_HEALTHY. |
| Security baseline: `get_advisors`, type security | Saved to `tmp/t11/advisors-before.json`. Two existing archive-table informational findings and two existing warnings about `public.rls_auto_enable`. |
| `apply_migration`, name `enable_pg_cron` | Succeeded in the initial attempt. Extension verification returned exactly one `pg_cron` row. |
| Recovery: `execute_sql`, schema count | 0 before this migration attempt. |
| Recovery: `execute_sql`, cron job count | 0 before this migration attempt. |
| Recovery: `execute_sql`, latest five migration rows | `20261016040746 / enable_pg_cron`; `20261011060458 / trrc_verified_archive_read_rpc`; `20261011051901 / create_private_trrc_migration_archive`. No `trrc_guest` row before retry. |
| `apply_migration`, name `trrc_guest` | Submitted full, unedited `supabase/migrations/20261014000000_trrc_guest.sql`; returned `success: true`. Earlier two attempts returned `Invalid or expired requestState`; read-only recovery checks showed neither committed. |
| `execute_sql`: count of `cron.job` named `trrc_guest_attest` | 1. |
| Proof wait | Waited 325.806 seconds after the cron count before querying the proof; no early proof polls. |
| `execute_sql`: latest `platform_proofs.attested_by` | `pg_cron:trrc_guest_attest`. |
| Security after: `get_advisors`, type security | Saved to `tmp/t11/advisors-after.json`; initially failed the original brief gate. PASSED under the subsequent owner ruling: ten intended INFO `rls_enabled_no_policy` findings; existing public-function warnings unchanged. |
| Step 3 `execute_sql`: exact bucket INSERT from brief | Succeeded. |
| Step 3 `execute_sql`: bucket row verification | Exactly one row: id/name `trrc-guest-evidence`, `public=false`, `file_size_limit=80106496`. |
| Step 4 MCP capability discovery | No Supabase secret creation, update, deletion, or listing tool is available. Owner subsequently confirmed setting both secrets in the dashboard. Secret names/values were not independently listed by this agent. |
| `get_edge_function`, `trrc-explorer` | Succeeded: prior version 3 ACTIVE, `verify_jwt=false`, repo-relative files and entrypoint `supabase/functions/trrc-explorer/index.ts`. |
| `deploy_edge_function`, `trrc-explorer` | Succeeded: version 4 ACTIVE, `verify_jwt=false`; all 23 brief-listed files uploaded at repo-relative paths. Bundle SHA-256 `c373f1cffbc872bc2f652142bc7a306422a6b81468c25f976fde10e0bccbe3e2`. |
| `node tmp/t11/smoke-hosted.mjs` | FAILED, exit 1: `{"status":"FAILED","error":"fetch failed"}` on initial session request; no HTTP status received. Results saved in `tmp/t11/smoke-results.json`. The failure alone does not establish whether the deployed endpoint is unhealthy or local network access prevented the request. |

New findings name `trrc_guest.egress`, `evidence`, `jobs`, `maintenance`, `platform_proofs`, `publications`, `reservations`, `staged`, `tokens`, and `tombstones`. Each says RLS is enabled but no policies exist. These notices alone do not demonstrate public exposure. No permissions changes or policy changes were made to bypass the stop rule. Reference: [Supabase RLS Enabled No Policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Not performed

| Step or check | Status |
|---|---|
| Step 2 | DONE, including security gate under owner ruling. |
| Step 3: private bucket creation and row verification | DONE: private bucket and exact size limit verified. |
| Step 4: Edge secrets and listing names | Owner-confirmed set in dashboard: `TRRC_GUEST_ENABLED=1`, `TRRC_GUEST_ALLOWED_ORIGIN=https://texasrrcexplorer.lovable.app`. MCP listing unavailable. |
| Step 5: inspect/deploy function, deployed version | Deploy succeeded: version 4. Smoke-test gate FAILED at session request. |
| Session issuance / lookup / collection | Session attempted but failed before HTTP response. Lookup/collection not attempted; no job IDs or tokens received. |
| C7 attempts and timing | Not tested. |
| Archive byte count / expected SHA-256 / computed SHA-256 | Not tested. |
| Second-session history isolation | Not tested. |
| Read-only `/api/versions` | Not tested. |
| Edge logs: token absence / maintenance failures | Not checked. |
| Rollback | Owner confirmed deleting `TRRC_GUEST_ENABLED`. `deploy_edge_function` then succeeded: version 6 ACTIVE, `verify_jwt=false`, all 23 files and original repo-relative entrypoint preserved. Bundle SHA-256 `e0242600e85582822028bc3f022cb18a6b545cb965d160261ef33402fd3ce1c3`. Schema and private bucket retained. Secret absence and live HTTP behavior not independently verified. |

Rollback redeployment is complete following owner-confirmed secret deletion. This agent did not use a CLI or other workaround. Guest functionality, read-only route health, and Edge logs remain unverified; the failed guest rollout has not been marked successful. No schema or bucket was dropped.

## Files and working tree

Created during rollout: `tmp/t11/advisors-before.json` (initial attempt), `tmp/t11/advisors-after.json`, `tmp/t11/smoke-hosted.mjs`, `tmp/t11/smoke-results.json`, and this report. Scratch files are ignored. No guest token was written to a file or log. No source code or protected data was changed. Before this attempt, Git reported the pre-existing untracked `.claude/` directory and warned that the user-level Git ignore file was inaccessible; that directory was left untouched.

## Follow-up by Main (October 16, 2026)

- **Edge after rollback (version 6):** a direct `GET …/functions/v1/trrc-explorer/api/versions` with `accept-encoding: identity` returns 200, uncompressed. The Edge is healthy and read-only.
- **Smoke-test failure cause:** the request failed 0.3 s after starting, before any HTTP status. This is consistent with the agent's sandbox having no outbound network. It is not evidence of an Edge fault.
- **Published site data routes return 503, and this predates the guest rollout:**
  - `https://texasrrcexplorer.lovable.app` `/api/versions`, `/api/runs`, `/artifact-path.json` and a TAR download all return `503 BACKEND_UNAVAILABLE` from the bridge.
  - The same 503 on `*.lovable.app` was recorded on October 11 (`docs/verification-2026-10-11-lovable-hosting.md:104`), while the Node-based `lovableproject.com` preview returned 200.
  - The October 14 "live read-only site" confirmation checked only the page shell, not its data.
- **Diagnosis (Task 12):**
  - The published build runs on Cloudflare Workers, whose subrequests automatically request gzip/brotli.
  - Supabase gzips every response when gzip is accepted, including 64-byte errors and TARs.
  - The bridge refused any compressed upstream response (`src/hosted/hosting-bridge.mjs:31`), which matches the 503.
  - An external test cannot separate this from a fetch throw, so the fix also gives the throw path its own code and a token-free log line.
- **Step 6 (republish) is blocked** until the bridge fix is published and `/api/versions` returns 200 on the live site.
