No further files are needed; everything required to close or retain each finding is already in hand. Report follows.

**Summary**
The spec path now holds the complete rev 2 (252 lines, correct heading), so B1 is closed; H1, H2 and M1–M10 are closed with code-accurate corrections, and `probe.json` now shows 21/21 PASS with the v1 TAR hash unchanged. H3 is substantially fixed by the SQLite ledger but carries two new HIGH defects: the claim statement can never dispatch a fresh job (`next_attempt_at` is NULL), and token validity is checked after idempotent replay. Three further HIGH items concern the browser side: reopened packages are integrity-checked but not re-authenticated, `defaultPinnedAtSave` must not surface as the current default pin, and "offline reopen" is impossible with the current boot path and no service worker. The online goal is now truthfully labelled as unmet and remains the owner's approval item, not a spec defect.

**Files touched**
None.

**Needs judgment**

Closed from round 1: B1 (spec:1-3), H1 (spec:11-14), H2 (spec:15-28; `edge-bootstrap.mjs:62,68,73`, `hosting-bridge.mjs:3,12,23` verified), M1 (spec:146-151; arithmetic 80,106,393→80,106,496 checks out against `archiveBytes.mjs:12,21,25`, `analytics-handoff.js:5,81`), M2 (spec:181-190; `presentation.js:10-12` verified), M3 (spec:175-179), M4 (spec:120,148), M5 (spec:170-173), M6 (spec:163-166), M7 (spec:98-103), M8 (spec:82-86), M9 (spec:36), M10 (spec:50). H3 reduced; residue below.

HIGH
- N1. Claim never fires for new jobs. spec:59 claims with `next_attempt_at<=?`, but enqueue (spec:56) never sets `next_attempt_at`; NULL comparisons are false in SQLite, so `queued` jobs are undispatchable. Correction: set `next_attempt_at=created_at` on insert, or `COALESCE(next_attempt_at,created_at)<=?`.
- N2. Token authenticated after replay. spec:53 replays `(owner_hash, idem_key)` before spec:54 validates the token, so an expired token (hash still in `tokens`) replays job state, and malformed requests reach the ledger before syntax checks. Correction: order = token exists and unexpired → syntactic validation (`serve.mjs:59` allowlist, `boundedScope`, `lookupTarget`) → replay → quota/ownership → insert. Quotas increment only on insert (spec:56 already), so invalid requests never consume them; say so explicitly.
- N3. Reopen is not authenticated. spec:198 "re-hashing checks integrity only" is correct, but `pins` and `tarBytes` live in the same mutable origin store (spec:141), and guest versions never enter `/api/versions` (spec:126), so after retention nothing server-side can re-confirm them. Correction: saved entries carry `authenticatedAt` (save time only); the workspace label at `app.js:101` ("Public reported — verified version pins") must read "verified at save time; not re-authenticated" for `origin:'guest_job'` and for `server_library` entries no longer listed; Analytics handoff via `loadPackage` passes `pins.manifestSha256/normalizedSha256` (`analytics-handoff.js:95`) and the receiver cannot tell the difference — disclose.
- N4. `defaultPinnedAtSave` vs current pin. Opening legacy v1 requires `defaultPinned:true` because its manifest has no provenance field (`artifact.mjs:136`; `artifact-integrity.js:10`). spec:173 says saving never repins, but the merged entry's `pins.defaultPinned` also drives the "Default pinned" badge (`app.js:144,146,157`). Correction: pass `defaultPinnedAtSave` only into `loadVerifiedVersion`; derive the badge solely from the live `/artifact-integrity.json`; if the server later repins, the saved v1 shows "legacy default at save time".
- N5. Offline app shell unspecified. G6 (spec:249) promises "offline reopen", but boot (`app.js:185-193`) requires `/artifact-path.json` and `loadPinnedArtifact` and disables the version selector on failure, and no service worker is planned. Correction: either drop "offline" and define the case as "server up, guest archive deleted/expired", or specify boot tolerance (saved packages render when the pinned fetch fails) and state that the HTML/JS shell itself is not cached.

MEDIUM
- N6. Lease renewal and restart CAS. spec:64 renews every 60 s but gives no statement; specify `UPDATE … SET lease_expires_at=? WHERE job_id=? AND fence=? AND lease_owner=? AND state='running'` and that `changes()===0` aborts the attempt before commit. Restart adoption (spec:90) must use the same CAS predicate so an old process on a rolling restart cannot double-commit.
- N7. Lookup evidence path binding. `loadSelection` resolves `lookupRoot/lookupId` (`lookup.mjs:58-60`); with per-attempt roots (spec:61) the collection must take `lookupRoot` from the lookup job's succeeded attempt `root`. `attempts` (spec:48) has no `lookup_id`; add it, and tie the 24 h "unless used" deletion (spec:105) to a ledger reference, not filesystem inspection.
- N8. Shared in-process concurrency. The partial index (spec:50) bounds guest jobs only; legacy `/api/lookup`, `/api/collect` use `lookingUp`/`collecting` (`serve.mjs:16,56,60`). State that the dispatcher and legacy routes share those flags, otherwise one legacy plus one guest collection can run together.
- N9. "Proves durability" (spec:68) overstates: readback confirms consistency, not fsync; `pipeline.mjs:37-38` never fsyncs. Reword to "verifies on-disk consistency; durability of attempt files is not guaranteed beyond the existing pipeline; reconciliation re-verifies after restart".
- N10. Sorted-name check in `tar-read.js` (spec:155) and byte-identical rebuild both depend on `localeCompare` (`archiveBytes.mjs:26`); Node and browser ICU could order `lookup.json`/`lookup-inventory.json` differently. Pin a codepoint comparator in both or accept the risk in G4.
- N11. Re-export packaging (spec:211): `src/hosted/http.mjs:1` → `src/archiveBytes.mjs` → `public/archive-bytes.js`; the Supabase function bundle must include `public/`. Add to G8.
- N12. `node:sqlite` on the `>=24` floor (`package.json:101`): Main's `DatabaseSync(':memory:')` open is not a WAL/`synchronous=FULL`/`BEGIN IMMEDIATE` proof; keep spec:42 as a stop-and-ask gate.

Open dependency, not a defect: online delivery still unmet (spec:15); owner approval 2 (spec:229) is the only material cost/runtime decision. Approval 1 should wait for N1–N5 edits.

Coverage gaps: not read — `index.html`, `normalize.mjs`, `dataset-state.js`, `navigation.js`, `inspection.js`, `GATES.md`, `supabase/functions/trrc-explorer/index.ts`, `node:sqlite` docs, suite logs, screenshot PNGs, test bodies beyond those cited in round 1.

**Gates**
- Read (actual): revised spec in full; `tmp/backup-resume-opus-revision-2026-10-12.md`; `docs/screenshots-2026-10-12-backup/probe.json:1-110` (21 PASS incl. second version, historical isolation, unavailable-version clear, old workflow hidden; TAR 1,325,056 bytes sha256 `492ebaa6…db8a`; pin file unchanged); `public/presentation.js:1-20`; `package.json:100-101`; grep for `node:sqlite`/`DatabaseSync` in `src/`, `scripts/` (none). Round-1 reads of all assigned `src/`, `src/hosted/`, `scripts/serve.mjs`, `public/` modules and cited tests reused.
- Executable checks: UNRUN (Node suite, TypeScript, browser, SQLite, live collection). Main's 186/186, TypeScript and 21-check results not repeated.

Bounded second review complete; slot released.
