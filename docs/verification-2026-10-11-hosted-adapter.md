# Hosted archive adapter checkpoint — October 11, 2026

This is internal read-only infrastructure, not completed hosted integration or release acceptance. The existing local application and collection pipeline remain available unchanged. No deployment, live collection, pin replacement, remote migration or permission change occurred in this checkpoint.

## Changes

- `src/hosted/archive-store.mjs`: validates the complete preserved manifest, ordered chunks, lengths and hashes; returns private byte copies.
- `src/hosted/catalog.mjs`: lists verified public versions and recorded runs; anchors nondefault versions to successful recorded publication evidence. Failed runs remain discoverable.
- `src/hosted/supabase-transport.mjs`: server-only HTTPS RPC transport with an independent snapshot pin, bounded responses and sanitized errors. No credential is configured or embedded in browser files.
- `src/hosted/http.mjs`: requires explicit strict authorization before reads; serves catalog, runs, preserved evidence and whole-version downloads. Hosted lookup/collection explicitly return unavailable rather than suggesting execution.
- `src/archiveBytes.mjs` and `src/versionArchive.mjs`: share runtime-neutral USTAR serialization while retaining local filesystem safety checks and export contracts.
- `test/history.test.mjs`: isolates each history test's copied artifact directory, fixing parallel lock contention without weakening production locking.
- `docs/sql/trrc-archive-rpc-proposed.sql`: proposed invoker-based, service-role-only RPC definitions. **Not applied.**

Requirements covered in this checkpoint: RRC-03/04/05/06/09/10 preservation of normalization, quality, provenance, export, inspection and run evidence. RRC-01/02 live acquisition remains local; hosted acquisition is not implemented here.

## Verification

Final full-suite command: `node tmp/navigation-redesign-2026-10-10/suite.mjs hosted-final` — **169 passed, 0 failed, 0 skipped**, plus browser-module syntax PASS. The helper copies production inputs and code into an isolated directory before executing the complete Node test suite. It ran with normal user access because the restricted sandbox blocks some filesystem/socket tests; no ACL or permission settings were changed.

Focused adapter tests: `node --test test/hosted-archive.test.mjs test/hosted-download.test.mjs test/hosted-transport.test.mjs test/hosted-http.test.mjs` — **19/19 PASS**, independently rerun by the reviewer. New main-owned module tests first failed because the modules did not exist, then passed after implementation.

Preservation: `node tmp/navigation-redesign-2026-10-10/preserve.mjs` — **166 Explorer data/evidence/pin files and 14 consumer files unchanged**, including membership checks. No Analytics implementation files were edited.

Independent reviewer: hosted_contract_review, read-only. No material defect found. Reviewer confirmed all three TAR outputs are byte-identical to the former Buffer implementation (1,325,056; 1,393,664; 1,377,280 bytes). A composed preserved-snapshot probe verified three versions, 29 runs, zero unavailable records and three complete archives; truthy non-boolean authorization results are rejected before reads.

Before the isolation fix, the normal-user suite passed 164/165 with one EEXIST artifact-lock collision in parallel history tests. After isolation, it passed 165/165; adding the four HTTP tests produced the final 169/169 result. Earlier restricted-sandbox failures did not require changing production validation or permissions.

## Outstanding release work

1. Resolve the user-facing access model: invited users only, or public browsing with authenticated collection. Authorization is intentionally injected, not guessed.
2. Connect the preserved UI to the Lovable hosting entrypoint without regenerating it; configure server-only credentials and verify they are excluded from the browser bundle.
3. Review and apply the proposed RPC migration only when the access/configuration decision is established; exercise actual Supabase RPCs. Current transport tests use mocks and a preserved-snapshot composition probe, not a live RPC deployment.
4. Implement durable hosted collection, lookup/run storage and publication. The existing sequential collector can exceed free Edge request duration, and ephemeral filesystem publication is insufficient. Do not claim that hosted collection works from this adapter.
5. Verify hosted browser flows, latency, authentication, errors, downloads and runtime/build compatibility; obtain independent final release review before preview deployment.
6. Preserve separate existing gaps: quarantine eligibility at the Analytics receiver/local-origin handoff, and pre-existing history-persistence error masking at `src/pipeline.mjs:88`. Passing this suite does not close those gaps.

GitHub `origin/main` remains the Lovable starter. The preserved application is on `trrc-import`; no main merge, force push or deployment occurred during this checkpoint. The previously copied private Supabase snapshot remains `trrc-d6678bd4e24e4d4cd0e224c39c98aa8af9ce543dbd61545c6fa155eeefef6186`.
