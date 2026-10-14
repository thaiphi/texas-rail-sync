# Connected local release checkpoint — October 13, 2026

Status: local real collection and browser persistence verified; hosted guest release incomplete. Work paused after the original one-hour deadline. No deployment, cloud writes, billing changes, permission changes, commits or pushes. Phi Analytics untouched.

## Passed

- Full isolated suite: direct Node `scripts/check-isolated.mjs`, 264/264 passed, zero failed/skipped. Log: `tmp/connected-final-full.log`.
- Direct Node TypeScript `node_modules/typescript/bin/tsc --noEmit` and `git diff --check` passed at handoff.
- Browser package unit tests: 7/7. Guest reference backend targeted tests: 29/29. Supplementary backend tests were run after implementation; only the initial two core tests have prior failing evidence.
- Native Chrome browser-save checks: 16/16, including exact package verification, duplicate/collision handling, quota atomicity, concurrent tabs, saved version inspection during API outage, legacy example access, Blob downloads, bfcache restoration and startup handler readiness. This does not prove offline cold-start support. Evidence: `screenshots-2026-10-13-connected/save-probe.json`.
- Actual public local walkthrough: 9/9, explicit UIC 000020838 candidate and January 2024 confirmation, real bounded collection, result handoff, browser save and download. Evidence: `screenshots-2026-10-13-connected/real-walkthrough.json`.
- Existing tracked raw/artifacts/runs and integrity pin unchanged (`git diff --quiet -- raw artifacts runs public/artifact-integrity.json`). Integrity file SHA-256: `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`.

The real collection wrote only to owned `tmp/connected-real-y21dJd`, not the main dataset registry. Artifact: `rrc-2026-10-13-uic000020838-bb4b3a30-b167-4ffd-830c-ec3ab67e5228`; run: `795368e3-50b2-4397-a969-2dcb7a07dd1b`. Preserved download: `screenshots-2026-10-13-connected/real-collected-backup.tar`, 1,356,288 bytes, SHA-256 `72d47f1d79bc24ca6297af0528bd6bf815ca5e895e86eed137e1cc4e1a7c30ae`. Scratch source evidence remains local and ignored; it is not published or pushed.

## Failed and resolved

- Initial missing browser module and Buffer-backed byte ownership failures: fixed; browser tests passed.
- Cached same-ID save trusted a checksum without rehashing bytes: reproduced in Chrome, fixed and verified.
- bfcache pagehide revoked usable saved links: reproduced, fixed and verified.
- First real walkthrough clicked Find before collection handlers mounted: failed without any official lookup request. Lookup now remains disabled until handlers mount; retry passed.
- Split consultant output initially truncated guest steps: detected by import failure, reconstructed from complete text blocks and verified by targeted/full tests.

## Blocked / incomplete

- Durable hosted Supabase guest service is not implemented. Draft transport references missing SQL functions; no migration was written or applied. Cleanup methods remain unimplemented.
- Hosted guest admission remains disabled. The browser's existing local collection UI is not connected to the new guest HTTP protocol.
- Global storage/headroom and download/egress budgets, orphan cleanup, interrupted-run terminalization, and durable scheduling remain unfinished.

## Unrun

- Actual Edge CPU/memory profiling of the newly authored guest core and hosted official-source reachability.
- SQL migration/role/auth/Storage transport integration and retention/quota enforcement. Test-owned PostgreSQL container was only prepared; no migration was applied.
- Independent final backend review. Fable reviewed the browser save path with bounded PASS and a bfcache finding; its later fix has direct browser evidence, not a new reviewer verdict.
- Cross-browser download compatibility, hosted guest walkthrough, and Phi Analytics receiver import. No acceptance claim for these.

## Changed implementation files

- `public/archive-bytes.js`, `public/browser-library.js`, `public/app.js`, `public/index.html`, `public/collection.js`
- `src/archiveBytes.mjs`, `src/lookup.mjs`, `src/hosted/edge-bootstrap.mjs`
- `src/hosted/guest-journal.mjs`, `evidence-store.mjs`, `guest-steps.mjs`, `guest-http.mjs`, `guest-transport.mjs`
- `scripts/guest-local.mjs`
- `test/browser-library.test.mjs`, `guest-release.test.mjs`, `guest-journal.test.mjs`, `guest-evidence.test.mjs`, `guest-steps.test.mjs`, `guest-http.test.mjs`

Shared archive bytes preserve server/browser export compatibility. Browser saved versions remain explicitly unverified/offline replay, do not repin, and cannot trigger Analytics handoff. The guest journal/object store are in-memory local references and lose state at process exit; do not describe them as durable Supabase implementation.

## Resume order

1. Independent review of the guest reference backend and revision-6 local release addendum, addressing existing gaps before further implementation.
2. Verify actual Edge guest-core parity and CPU/memory feasibility using existing local permissions and cached runtime.
3. Author and locally verify durable SQL/Storage ownership, fencing, quotas, cleanup and transport. Keep hosted admission disabled until these gates pass.
4. Connect browser guest controls only after the durable contract is verified, then exercise full request-specific progress and result handoff. Deployment requires separate authorization.

Backup roles used Claude Opus for read-only implementation proposals, Fable for independent bounded review, and Codex for integration/tests/browser verification. All consultant sessions closed; test-owned containers cleaned up. Preserve pre-existing unrelated edits when resuming.
