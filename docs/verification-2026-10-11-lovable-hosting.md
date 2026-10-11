# Lovable hosting and public browsing — October 11, 2026

## Scope and implementation

User approved public browsing with sign-in required to collect. The existing vanilla interface remains in `public/` unchanged. Lovable's original TanStack Start configuration and framework files were restored from commit `dd90523`, alongside the existing Node application, rather than regenerating the product. The custom server entry bundles the original HTML and proxies supported evidence routes to a fixed Supabase function. Generated static output contains only current UI scripts/styles and framework assets; private archives, original HTML and pin files are not copied into static output.

`package.json` preserves the dependency-free local start and Node test commands. Website `build` now invokes Vite; prior artifact export remains `build:artifact` and the unchanged direct script. `package-lock.json` records installed starter dependencies; install scripts were not run. No paid service, plan upgrade or additional project was provisioned.

Supabase `Portfolio` (`phxiqnsebqaalvkanljb`) hosts function `trrc-explorer`, version 2, ACTIVE, explicitly `verify_jwt=false`. Public GET/HEAD is intentional. POST lookup/collection validates a nonanonymous user server-side; unauthenticated requests receive401, and valid-user collection remains503 unavailable. No collection or sign-in screen is claimed implemented in the hosted app.

Migration `trrc_verified_archive_read_rpc` applied the SQL in `docs/sql/trrc-archive-rpc-proposed.sql`. Only service_role has invoker RPC execution/schema usage/table read access. SQL inspection confirmed anon/authenticated have none of these privileges. No RLS policy or browser table access was added. Server keys are supplied by the Edge environment and never copied to the frontend.

## Gates and live evidence

- `node tmp/navigation-redesign-2026-10-10/suite.mjs hosting-release`: **185/185 PASS**, zero failed/skipped; browser-module syntax PASS. Runs against isolated copies with normal user access and no filesystem permission changes.
- `node node_modules/vite/bin/vite.js build`: **PASS**, Cloudflare-module production output.
- `node node_modules/typescript/bin/tsc --noEmit`: **PASS**.
- `node node_modules/eslint/bin/eslint.js src/server.ts vite.config.ts nitro.config.ts src/routes/index.tsx src/routes/__root.tsx`: **PASS** after formatting errors were corrected.
- Independent Astra review found and verified fixes for stale generated assets and compressed-response Content-Length handling. Regressions failed before the fixes and passed afterward. Focused independent bridge/Edge tests15/15 passed.
- Live first-deployment smoke test failed404/405 because Supabase forwards its shorter function prefix. Exact-boundary prefix handling was corrected; canonical/full/short prefix regression now passes. Version2 live checks: `/api/versions`200, three versions (~6.4s); `/api/runs`200, 29 runs, zero unavailable (~3.1s); unauthenticated `/api/collect`401.
- Original166 archive files remain hash-identical; earlier preservation probe also confirmed14 consumer files unchanged. Analytics implementation was not edited.
- Browser on local Lovable-compatible server4401 against the real Supabase backend: library includes all three versions and the original public example; example Records, Data quality, Sources and Downloads inspected. Complete TAR downloaded through the same-origin proxy. This is live-backed local verification; remote Lovable acceptance is recorded separately after sync.

All three live backend archives matched local complete exports exactly:

| Version | Bytes | SHA-256 |
|---|---:|---|
| October9 UIC000020838 v1 | 1,325,056 | `492ebaa6b5f7c9353c39416dc72a1cf5180d1e9ba7a3af21d4b063c20e81db8a` |
| October10 UIC000056484 | 1,377,280 | `377721ac93c47313a9f5b58df2f581c9133cf9920ef74e390fef88392dbf6b9d` |
| October10 UIC000020838 | 1,393,664 | `69a9378185df7a1ecd8fe357d7d984eaf1b6258f4cc0b402c5f679f133f605f8` |

Download verification took approximately9–11.5 seconds/version. No new public records were collected. The frozen Supabase snapshot remains `trrc-d6678bd4e24e4d4cd0e224c39c98aa8af9ce543dbd61545c6fa155eeefef6186`; new local collections are not automatically added to this hosted snapshot.

## Remaining work and acceptance limits

Hosted collection needs durable lookup/source/run storage and atomic version publication. The unchanged Node collector requires filesystem locks, staging and persistent directories; Cloudflare compatibility alone does not provide those guarantees. Its sequential acquisition can also exceed Supabase Free request duration. Do not enable it by moving its files into ephemeral Edge storage.

Hosted sign-in UI, authenticated collection, current-request execution and result publication are not implemented. Direct Analytics browser transfer remains for the configured local apps; hosted users can download complete versions. The existing quarantine receiver eligibility and history-persistence error-masking gaps remain open. These gates authorize read-only preview verification, not full project acceptance or production publication.

Screenshot: [live-backed local Records](screenshots-2026-10-11-hosting/records-local-live-backend.png).

## Remote preview checkpoint

GitHub main received hosting commit `373bd83`; Lovable rebuilt it and added its own lockfile in `6418884`. The remote preview displays the preserved Explorer interface, but its dataset library reports **Version registry unavailable**. This is a failed remote acceptance check, not evidence of deleted datasets. Direct Supabase checks and live-backed local browsing above remain successful.

Anonymous HTTP probes of the preview root, app.js and API all return401 text/plain Unauthorized. Lovable independently reproduced the same response, including for a nonexistent path, indicating a platform access gate before application routing. These probes cannot establish the response received by an authenticated preview browser. Browser navigation to the preview dataset endpoint was blocked by the client. No access gate, project visibility or publication setting was changed to force a pass.

Lovable's diagnosis is preserved in `.lovable/plan.md` at remote commit `7982af3`. It is awaiting human review of `plan--show` with path `.lovable/plan.md`. No proposed routing remedy has been implemented without confirming the actual authenticated response.

Lovable also found TS2353 in the Edge entrypoint options. Explicit JSDoc now describes the required environment reader and optional typed test seams. A direct installed TypeScript compiler regression checks the actual entrypoint with a Deno ambient stub. Actual Deno tooling is unavailable locally, so this regression does not claim a Deno release check.

User policy confirmed: public dataset browsing, sign-in required to collect. The current hosted implementation is read-only; sign-in and durable collection remain unfinished. Lovable consumed two existing workspace credits for rebuild and diagnosis; no plan upgrade or purchased credits were requested.

### Typing-fix checks

- Independent review: no material findings in the two-file typing/test change.
- `node --test test/hosted-edge.test.mjs`: **12/12 PASS**, including actual-entrypoint TypeScript positive/negative caller checks.
- `node node_modules/typescript/bin/tsc --noEmit`: **PASS**.
- Full isolated rerun `node tmp/navigation-redesign-2026-10-10/suite.mjs hosting-typefix-v3`: **FAILED / environment blocked** on EPERM renaming a temporary bounded-collection artifact. The earlier185/185 result predates this typing-only change and is not substituted for this failed rerun. No permissions were changed. Log: `tmp/navigation-redesign-2026-10-10/hosting-typefix-v3-suite.log`.
- The already-running worker rerun `hosting-typefix-v2` finished **185/186 PASS,1 FAILED**: another temporary artifact rename EPERM in `acquisition.test.mjs`. Both new regressions passed. No additional retries were requested after this blocker was confirmed.
- Earlier reruns exposed a hardcoded run-count assumption and a harness omission of the Supabase entrypoint. The test now compares every captured fixture run ID; the isolated runner now copies `supabase/`. Neither failure was suppressed.
- Default ESLint for the two compact JavaScript files: **FAILED**,187 formatting errors; correctness lint with only the formatter rule disabled passed. Existing compact style was retained to keep this fix narrow.
- Actual Deno and imported starter Vitest checks: **UNRUN**, unavailable tooling / standing instruction. Orchestrator gate for starter tests: `node node_modules/vitest/vitest.mjs run`.

No further backend or preview release was performed after these failed/unverified gates. Screenshots include [remote library failure](screenshots-2026-10-11-hosting/datasets-lovable-preview.png) and [live-backed local narrow history](screenshots-2026-10-11-hosting/history-narrow-local-live-backend.png). The remote failure screenshot is explicitly not successful browsing evidence.

## Resumption: portable test gate and preview diagnostics

On the owner's request to fix the blockers now, the long isolated runner was also tried with serial test execution. Temporary publication rename EPERM persisted, so parallel execution alone is not the cause. A shorter isolated root under `tmp/v-*`, with the same source code, default parallel execution and all tests, passed186/186. This supports a workspace-path-dependent Windows limitation; it does not prove which Windows component causes it. No ACL, security setting, permission or application publication logic was changed.

Added portable `scripts/check-isolated.mjs`, which copies the same application/test/source inputs into a fresh short directory, includes the actual Supabase entrypoint, runs every production `.test.mjs`, preserves the full log, and propagates the child exit status. It does not run live collection or overwrite working datasets. Invocation: `node scripts/check-isolated.mjs`.

- Short proof run `tmp/v-0A4qtD`:186/186 PASS.
- Portable runner `tmp/v-PUVKxE`:186/186 PASS.
- After preview diagnostics, `tmp/v-Hmksal`:186/186 PASS.
- Vite production build PASS; TypeScript PASS; public/app.js syntax PASS; new runner default ESLint PASS.
- Preservation probe:166 protected Explorer files and14 consumer evidence/pin files unchanged.
- Fresh public Supabase probes: versions200/3; runs200/29/zero unavailable.

The first diagnostic trial failed UI regression tests because their lightweight response mocks lack Headers. Optional header inspection corrected the diagnostic without weakening those tests; the complete rerun passed. Only HTTP status/content-type and a generic failure message are logged; response bodies, credentials and tokens are not logged. The user-visible selection/error behavior is unchanged. Remote diagnostics are not yet observed.

Lovable MCP now reports an expired/revoked authorization grant. The old connection uses a stdio mcp-remote bridge, so `codex mcp login lovable` alone cannot reconnect it. CLI help confirmed the direct connection syntax: `codex mcp add lovable --url https://mcp.lovable.dev --oauth-resource https://mcp.lovable.dev`, then `codex mcp login lovable`. The owner's terminal lacks codex on PATH; the verified installed executable is `C:/Users/thai.phi/AppData/Local/OpenAI/Codex/bin/9691020b546a15b2/codex.exe`. The owner is handling normal browser authorization. No credentials or global connection settings were modified by the implementer.

Actual authenticated remote browsing, Deno tooling and starter Vitest remain unverified. The previous compact-file formatting lint result remains a failure; successful new-runner lint does not erase it. Read-only preview diagnosis is still open, and hosted collection/sign-in remain unfinished.

### Further evidence: blockers remain open

The earlier short-path success did not establish root cause. Another short parallel run (`tmp/v-myBqhR`) failed when `validation.test.mjs` enumerated a run directory before the CLI tests wrote its record. `run-events.test.mjs` invokes export CLI into the shared copied run root; `saveRun` creates the directory before writing `record.json`. The portable runner now uses sequential test files, retaining every test and their explicit intra-test concurrency assertions. It also checks the canonical root and rejects linked tmp/inputs before copying.

The final short sequential application run (`tmp/v-Zz7OIR`) still failed183/186,3 EPERM errors in bounded collection. A disposable-copy diagnostic probe (`tmp/p-LMtaD5`) retried failed renames after one second and still failed184/186 with EPERM on both retries. The probe is not application code or an acceptance result; no production retry was added. Thus neither short paths, file serialization nor a brief wait solves the publication error reliably. Cause remains unproven. Earlier186/186 successes remain recorded, but **stable full-suite acceptance is blocked**. No permissions were changed or tests disabled.

The owner's terminal could not locate codex through PATH. Using the verified full executable path configured native transport, but login failed: `Protected resource metadata missing required resource field`. Instructions were supplied to restore the existing mcp-remote bridge and back up only Lovable's expired token before normal browser authorization. The implementer did not alter credentials or connection settings. MCP access and actual authenticated preview diagnosis remain pending; main has not been updated with this diagnosis candidate.
