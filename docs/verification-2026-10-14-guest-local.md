# Guest collection — local verification (October 14, 2026)

Branch `guest-live`, verified at `28a5255` (base `origin/main` `eb51562`). Plan: `docs/superpowers/plans/2026-10-14-guest-collection.md`, Task 10.

## Verified

| Check | Result |
|---|---|
| `node scripts/check-isolated.mjs` | 321/321 pass across all `test/*.test.mjs`, including the 10 `guest-*` files. |
| Protected data (`raw`, `artifacts`, `runs`, `public/artifact-path.json`, `public/artifact-integrity.json`) vs `origin/main` | Unchanged (`PROTECTED_CLEAN`). |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0. |
| ESLint on guest client/collection/app files, `src/hosted`, `src/sourceFetch.mjs` (formatting rule off) | Exit 0. The `prettier/prettier` formatting errors predate the branch (`public/app.js`: 223 on `main`, 233 here). The files are not reformatted. |
| `git diff --check origin/main...HEAD` | Clean. |
| Final whole-branch review (Opus) | **Ready.** No correctness or security defect. Token never in URLs/logs/responses; bridge forwarding; orphan tombstone fence; admission fails safe; statement constants exact. |

Dependencies were installed with `npm install --ignore-scripts --no-save --package-lock=false`. `npm ci` refuses because `package-lock.json` is out of sync with `package.json` (also true on `main`). The lockfile was not changed.

## Local browser walkthrough

Driven through Chrome DevTools against `node scripts/guest-local.mjs` on `127.0.0.1:4175`. Guest mode was set by injecting `<meta name="trrc-mode" content="guest">` before page scripts ran. The Claude-in-Chrome extension was not connected, so there is a screenshot but **no GIF**.

**Fixture mode (`--fixture`):**
- Session 201. Lookup of UIC `000020838` returned 1 candidate, labelled "Test fixture response — not public evidence".
- Collection showed step progress ("step 5 of 10 — waiting to retry the official source…").
- The fixture fetch serves only the preserved package's exact URLs (period 2024-01..2026-04). The plan's 2024-01..2024-03 range therefore fails at C4 (`HTTP_ERROR`). With the preserved period, every step runs and C9 refuses the fixture with `ARCHIVE_INVALID`. This is by design: fixture data can never become a dataset (`test/guest-steps.test.mjs`). Fixture mode cannot reach "Open this dataset".
- Found and fixed: the failure status read "…still works.. Partial…" (`bc97060`, test first).

**Official mode (`--official`, owner approved):**
- After the server restarted, the stale browser token got "Your guest session expired"; a retry obtained a fresh session.
- The official lookup returned 1 candidate (not a fixture).
- Collection 2024-01..2024-03: C1–C6 fetched HTTP 200. C7 (`uic-query-help.html`, `webapps2.rrc.texas.gov`) failed.
- Diagnosis: TCP to `168.44.248.181:443` connects in about 15 ms, but the TLS handshake and response take about 30 s or more (curl: 200 after 31 s; another attempt timed out at 40 s). Node's built-in fetch has a 10 s connect-plus-TLS limit, which can't be raised without the `undici` package. No new dependencies are allowed.
- The single-period failure message was confirmed live.
- Fix for the hosted path (`2f59454`, `28a5255`, Opus-reviewed): guest source fetches allow 90 s (legacy stays 30 s), and a failure before any response is a retryable `NETWORK_ERROR`.

**Official mode, after RRC recovered (14:58 CDT, with `2f59454`/`28a5255`):**
- Lookup returned 1 candidate. Collection of UIC `000020838`, 2024-01..2024-03, succeeded (not a fixture): `rrc-2026-10-14-uic000020838-13edeb88-82e5-468b-b4a7-235adfbb7ec7`, "Verified bounded linkage".
- "Open this dataset" shows "Guest dataset — private, expires", with reporting coverage 2024-01 – 2024-03: 1 inventory row, 3 monthly rows, no quarantine issues.
- Downloads: the archive endpoint was fetched **once**. The TAR (1,359,360 bytes) has SHA-256 `bfdd920291c33c22fb34c417d2e8550f975fed6aaa355d2294faf84984c9f3a5`, equal to `job.result.archiveSha256`. The working tree stayed clean (nothing written to `artifacts/`, `runs/` or `lookups/`).

## Not verified locally

- **Deno fetch has no default connect/TLS timeout.** This comes from the Deno docs only. Task 11 Step 5 confirms whether 90 s plus one retry carries C7.

## Accepted and documented

- Final review I1 (owner-accepted): with `TRRC_GUEST_ENABLED` unset, the Edge is read-only, but the published shell still shows the guest form, which answers "temporarily unavailable". Spec and plan reworded (`8ed8564`). The rollback says to republish a non-guest shell if the form must disappear.
- Review fixes before rollout: guest bridge routes are case-sensitive, and the stale mount comments are corrected (`0dc8974`).
