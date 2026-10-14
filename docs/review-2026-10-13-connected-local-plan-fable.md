**Summary**
Authoring the complete guest flow locally is compatible with the gate intent, provided hosted admission stays disabled by code rather than by configuration. The hosted entrypoint already returns 503 `HOSTED_COLLECTION_UNAVAILABLE` for collection (`src/hosted/edge-bootstrap.mjs:83-86`) and the bridge forwards only the existing routes (`src/hosted/hosting-bridge.mjs:3`). The plan below keeps `supabase/functions/trrc-explorer/index.ts` and the bridge allowlist unchanged, builds every guest module behind an opt-in factory argument that the hosted bootstrap never supplies, and proves the connected browser-save flow against a fixture-mode local server. That is a release of local code, not an enabled hosted feature, and it does not fake an enabled collection because the only reachable guest entry is the local fixture server with fixture labels. One small design revision (rev6) is needed before coding; everything else is routine implementation under rev5.

**Files touched**
None.

**Needs judgment**

Design revision required first (rev6 addendum, Main writes, short):
- D-A Hosted disable contract. State that guest routes mount only when `createHostedEdgeHandler` receives a `guest` option, that `index.ts` does not pass one, and that enabling later requires a code change plus independent review, never an environment flag. This replaces the rev5 assumption that routing is added directly in `edge-bootstrap.mjs` (§6, line 130).
- D-B Provisional guest evidence cap. Rev5 §5 (line 122) defers the cap; the 57 MB memory kill makes a cap mandatory for any complete flow. Set a provisional hard admission of 25,000,000 evidence bytes per collection failing closed with `SOURCE_LIMIT`, labelled local-only, to be re-measured before hosted enablement.
- D-C Acquisition evidence invariants from the D1 review: live prepare always requires evidence and finalize refuses a live journal missing it. Fold into §2 so B1/B2 become routine fixes.
- D-D Local journal verification. Rev5 §3 specifies Postgres only. Add: the journal is an interface with contract tests run against an in-memory reference implementation and, where the local Supabase stack is available in Docker, the real migration on a local database. Hosted apply stays forbidden (G3).
- D-E Browser section line references (§8, line 154) are stale against current `public/app.js`; refresh them when touching the files. Routine.

Routine implementation, dependency order (each step has its own tests and is reviewable alone, but Main should ship them as one connected deliverable, not one per slot):
1. `src/exportCore.mjs` B1/B2 guards and two tests in `test/export-continuation.test.mjs`.
2. `src/lookup.mjs` exports `inspectRows` (rev5 §2 line 48). `src/hosted/evidence-store.mjs`: journal-backed verified reader (ENOENT contract, rehash on read, owned copies) and staged publisher (`readStaged`/`publish`/`readPublished`, hash-named objects, exact publication set) over an object-store transport interface with an in-memory implementation. `test/evidence-store.test.mjs`.
3. `src/hosted/guest-journal.mjs`: interface plus in-memory reference (tokens, jobs, steps, evidence, run_events, publications, quota) implementing claim/renew/commit fencing, lanes, replay, lazy reaping, reservations, database-assigned monotonic timestamps feeding `resumeRunRecorder`'s clock. `supabase/migrations/<date>_trrc_guest.sql` written to the same contract, not applied to hosted. `test/guest-journal.test.mjs` contract suite parameterised over implementations.
4. `src/hosted/guest-steps.mjs`: L1–L3 and C0–C9 composed from `fetchSource`, `validateSelectionEvidence`, `prepareArtifactFromReader`, `finalizeArtifactFromReader`, `buildVersionArchiveFromReader`, with retry, deadline, interruption and failure-finalization semantics from §4. `test/guest-steps.test.mjs`: full lookup→collection→archive on loopback fixtures, lease loss, duplicate advance, abandoned lane, deterministic failure, evidence cap.
5. `src/hosted/guest-http.mjs`: §6 routes, token hash, idempotency, GET read-only, POST advance under lease. `src/hosted/edge-bootstrap.mjs` accepts an optional `guest` handler and keeps today's 503 when absent. `src/hosted/hosting-bridge.mjs` unchanged until enablement. `scripts/serve.mjs` adds a local fixture mode that mounts guest-http over the in-memory journal and store with `testFixture:true` fetch only. Hosted `index.ts` unchanged.
6. Browser: new `public/browser-library.js` (strict TAR reader with the exact `archiveBytes.mjs` limits, IndexedDB add-only save, trust status recomputed per open) and `public/guest-collection.js` (session, poll, advance, job state separate from stages). Modify `public/app.js`, `public/collection.js`, `public/workflow-ui.js`, `public/presentation.js`, `public/index.html`. `test/browser-library.test.mjs` with the golden ordering test. Extend the Playwright probe for the connected flow.
7. Closing verification and an independent final review of the whole deliverable.

Proof requirements for truthful connected browser-save (fixture only):
- Every fetched byte comes from loopback fixtures with `testFixture:true`; sidecars carry the flag; UI shows "Test fixture, not public evidence" at lookup, collection result, library entry and download.
- Job states and the three stages are separate; stages render only from the committed terminal run record; while running, stages stay neutral.
- Success only after C9 commit; the browser saves the TAR only after its own strict reader verifies bytes against `archiveSha256` and pins from the live job result.
- Reopening the saved entry shows "Verified now" only against the live registry or job result, otherwise "Origin unverified" with Analytics handoff disabled.
- Default pin, existing three versions, exports and the existing 21 browser checks unchanged.

Blockers that local work cannot close (report, do not work around):
- G1 hosted profiling and a safe production payload threshold.
- G2 remaining quotas, egress, `pg_cron`/`pg_net`, Storage usage visibility, outbound reachability.
- G3 role-grant proof and migration apply.
- G6 live SOURCE_PROOF collection.
- Local Supabase stack availability for D-D is unverified; if absent, SQL is review-only and the in-memory contract is the executable proof.

**Gates**
- Read (actual): rev5 design, `public/collection.js`, `public/app.js` route lines, `src/hosted/edge-bootstrap.mjs`, `src/hosted/hosting-bridge.mjs`, `scripts/serve.mjs` route lines, latest checkpoint `docs/verification-2026-10-12-source-fetch-adapter.md`. No browser-save or guest modules exist yet.
- Allowed local verification for the plan: isolated full suite, new unit and contract suites, local Docker edge-runtime run of guest-steps on the in-memory journal for partial G1, local fixture-mode Playwright run, TypeScript, tracked preserved-data diff. Reviewer executed nothing.
- Not authorized by this checkpoint: hosted deployment, migration apply, permission, billing, live collection, guest acceptance.

Bounded checkpoint complete; slot released.

Note 2026-10-14: superseded. Hosted guest routes now mount through `src/hosted/edge-bootstrap.mjs` only when the Edge env `TRRC_GUEST_ENABLED` is `'1'` (or when tests pass an explicit `guest` handler); the "never an environment flag" statement in D-A above no longer describes the code.
