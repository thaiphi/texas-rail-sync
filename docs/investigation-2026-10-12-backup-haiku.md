**Summary**
Lookup identity checks, the 25-candidate cap, the 1–36-month window, and the 1,000-row monthly refusal are implemented and test-observed. The browser sends no credentials and hosted POST is a deliberate 503 stub, so the next design starts from a synchronous, local-only controller. The main gaps are missing sign-in and job state, ambiguous CSV/JSON download names, a post-publish registry failure reported as a failed collection, and "guest" collection, which conflicts with the owner's sign-in requirement. Numeric caps and parent-identity enforcement are test-observed only, because `sources.mjs`, `artifact.mjs`, and `app.js` were outside the allowed read list.

**Files touched**
None. No plan file was written because the brief forbids edits.

**Needs judgment**
Labels: *observed* = implementation; *proposed* = design.

1. **Lookup, date, cap (observed)**
- UIC must be exactly 9 digits and API exactly 8 (`collection.js:15`). Server tests reject other forms and enforce exact `$where` (`test/lookup.test.mjs:6-11`). `lookupTarget` is in unread `sources.mjs`.
- Lookup uses a 30 s timeout, refuses redirects, and caps bodies at 10,000,000 bytes (`lookup.mjs:9-13`). More than 25 rows fails as `SOURCE_INVALID` and is recorded as `failed` (`:21`, `:40`).
- Exactly 25 rows gives `cap_reached` with nothing selectable (`:24-25`; `bounded-collection.test.mjs:34`). A true 25-row result and a truncated one look identical.
- Selectable means a 9-digit UIC that is unique in the result (`:25`). A predicate mismatch gives `SOURCE_SCOPE_MISMATCH` (`:23`).
- The client allows 1–36 inclusive months (`navigation.js:25-28`; `navigation-redesign.test.mjs:42-44`). The server refuses 37 months (`lookup.test.mjs:12-20`). Scope ends at month-end (`bounded-collection.test.mjs:40`).
- An out-of-window row is quarantined at normalize (`lookup.test.mjs:27-28`) but refuses the whole version (`pipeline.mjs:71`). Keep both behaviors distinct.
- 1,000 or more monthly rows refuse before publication (`bounded-collection.test.mjs:55-58`; `versioning.test.mjs:11-19`). Zero rows is an incomplete success shown as "No reports returned" (`bounded-collection.test.mjs:60`; `dataset-state.js:8`).

2. **Browser controller gaps (observed)**
- `post` sends no bearer token (`collection.js:10`). The 401 "Sign in" message has no sign-in control.
- One synchronous POST, with no 202/job ID, polling, refresh resume, or timeout (`collection.js:37-39`). The owner requires these (`hosted-collection-options…md:39`).
- `await onVersions()` sits inside the try block whose catch says "Collection unavailable" (`collection.js:42,45`). A published version can show as failed.
- "Prepare download" only calls `onDownload` (`collection.js:43-44`). The save path is in unread `app.js`.
- `collection-result` and `lookup-candidates` are missing from `clearDatasetEvidence` (`dataset-state.js:4`), so a stale "Open this dataset" button may persist.

3. **Hosted gaps (observed)**
- Valid users still get 503 on both POSTs (`http.mjs:19`; `hosted-edge.test.mjs:115-121`). Authorize runs before routing for every method (`http.mjs:17`).
- **Guest decision:** the owner requires sign-in to collect (`hosted-collection-options…md:3,39`), and `hosted-edge.test.mjs:122-124` rejects `is_anonymous:true`. The owner must define "guest."
- Lookup and acquisition write local files with no owner field (`lookup.mjs:30`; `acquisition.mjs:33-38`).
- A broken default pin fails all of `/api/versions` closed (`catalog.mjs:39`). The local registry-outage tolerance (`navigation-redesign.test.mjs:133-141`) is not mirrored.

4. **Integrity and export (observed)**
- Publish uses an exclusive lock (`pipeline.mjs:24-25`), staged readback (`:37`), one rename (`:38`), reuse of identical bytes (`:27-34`), and VERSION_CONFLICT for differing bytes (`:32-33`). There is no stale-lock recovery (`requirements.md:29`).
- Run records use non-recursive `mkdir` plus `wx` (`pipeline.mjs:19`). Fixtures are refused (`:15-16`).
- The catalog verifies pins, bytes, and export output hash (`catalog.mjs:41-48`). Version pins exist only for v2 (`pipeline.mjs:75-77`).
- **Gap:** `acquisition.json` stays `succeeded` when export fails after load (`acquisition.mjs:52,59`). Published TARs are unaffected, but unpublished source directories can claim success.
- **Gap:** fresh-parent identity is test-observed only (`bounded-collection.test.mjs:48-53`). `sameIdentity` is exported (`lookup.mjs:19`) but not imported by `acquisition.mjs` (`:3-8`).

5. **Reuse and minimal additions (proposed)**
- Reuse: `performLookup`/`loadSelection` (`lookup.mjs:27,58`); `collectPublicSnapshot` (`acquisition.mjs:17`); `exportArtifact`/`saveRun` (`pipeline.mjs:41,14`); `createHostedExplorerHandler` (`http.mjs:7`); `catalog.listVersions` (`catalog.mjs:35`); `mountCollection` (`collection.js:4`); `monthWindow`/`associatedRun` (`navigation.js:25,34`).
- These write local files, so hosted collection needs a worker (`hosted-collection-options…md:18-21`).
- Minimum additions: owner-bound lookup/job/attempt rows outside the export schema; a 202 response with idempotency key replacing the stub at `http.mjs:19`; a job-status GET; a bearer header at `collection.js:10`; job state shown apart from the three stages. No repin and no schema change.

6. **Browser-save collisions (observed)**
- The TAR name is version-unique (`http.mjs:33`). CSV/JSON names use bare final segments (`http.mjs:38`): `inventory.csv`, `injection_monthly.csv`, `quality_report.json`, `normalized.json`, `sources/lookup.json`. Saving two versions to one folder collides.
- Renaming conflicts with existing expectations (`hosted-http.test.mjs:22`; `navigation-redesign.test.mjs:98`). This is an owner decision.
- Handoff window names are per transfer (`analytics-handoff.js:93`). A portable save cancels a pending handoff without rollback (`analytics-handoff.test.mjs:80-84`).

7. **Historical vs. current-run isolation**
- Observed: a run must match the same artifact (`navigation.js:34-36`). Background completion keeps the bookmarked run (`navigation-redesign.test.mjs:103-111`). Fixtures are excluded (`catalog.mjs:16`).
- Gap: `collection.js` has no job or run identity (`:37`). Whether `onRun` feeds progress is unverifiable (`workflow-ui.js` unread).
- Proposed: keep job ID separate from `runId`. Historical runs never drive progress.

8. **Preservation checks (proposed, UNRUN)**
- Baseline is 183/186, with three unnamed renameEPERM failures (`README.md:3`; `hosted-collection-options…md:47`). Compare every publishing test (versioning, bounded-collection, acquisition) against that baseline.
- Keep the 28 raw hashes (`requirements.md:26`), pins, and artifact bytes unchanged.

9. **Coverage gaps**
- Unread (outside the allowed list): `sources.mjs` (25/1000 constants, `boundedScope`); `artifact.mjs` (`loadSnapshot`, cap and parent checks); `runEvents.mjs`; `edge-bootstrap.mjs`; `archive-store.mjs`; `archiveBytes.mjs`; `app.js`; `workflow*.js`; `inspection.js`; `serve.mjs`; `normalize.test.mjs`; `GATES.md`; the preservation matrix; verification packets.
- Bodies of `version-race` and `version-selection` tests were not read.

**Gates**
- UNRUN: all executable checks (read-only tools). Proposed later: `node --test` over the test files below; `node scripts/check-isolated.mjs` (`README.md:3`).
- Read paths: `AGENTS.md`; `README.md`; `SPEC.md`; `SOURCE_PROOF.md`; `docs/requirements.md`; `docs/hosted-collection-options-2026-10-11.md`; `src/lookup.mjs`; `src/acquisition.mjs`; `src/pipeline.mjs`; `src/hosted/http.mjs`; `src/hosted/catalog.mjs`; `public/collection.js`; `public/dataset-state.js`; `public/navigation.js`; `public/analytics-handoff.js`; `test/{lookup,bounded-collection,acquisition,versioning,hosted-http,hosted-archive,hosted-edge,hosted-transport,hosted-download,navigation-redesign,dataset-state,analytics-handoff}.test.mjs`.
