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
