The brief is a seven-field, read-only mapping assignment. I'll stay within its listed scope and skip the Nexus repo. Next I'll confirm which files exist.
All eight files exist. I'll read the hosted backend interface and the local script first.
The backend interface is clear. Next are the five browser-side files.
I've read all eight in-scope files. Before mapping, I'll confirm one key fact: whether any browser code calls the `/api/guest` routes.
Confirmed: no browser file references `/api/guest`. Next I'll list the network calls and the history/run render targets in the in-scope browser files only.
The mapping is done, but I couldn't write the plan file or call ExitPlanMode. This session exposes only Read, Glob and Grep, so the findings are below. Nothing was edited, no Nexus files were read, and no helpers, git, network or paid calls were made.

**Key findings**

1. **No browser code calls the guest API.** The in-scope browser files contain no `/api/guest` reference. Collection only calls `POST /api/lookup` (collection.js:18) and `POST /api/collect` (collection.js:39).
2. **The guest routes exist only on the guest reference server.** `guest-local.mjs:49-56` mounts them, and `guest-local.mjs:57` returns 405 text for every other non-GET request. On that server, `post()` (collection.js:10) fails on `response.json()`, so the Find and Collect controls show "Lookup failed" (collection.js:30) or "Collection unavailable" (collection.js:45). The guest server itself runs with `--fixture` or `--official` (guest-local.mjs:40-41).
3. **The browser cannot tell which server it is on.** Both servers serve the same bundle, so a mode signal is the first decision (U1).
4. **Two request and response shape mismatches.** The collect body sends `lookupId` (collection.js:35), but the guest requires exactly `lookupJobId`, `sourceRecordKey`, `startMonth`, `endMonth` (guest-steps.mjs:173). The guest result sits under `job.result`, while the UI reads top-level `result.run`, `artifactId`, `scope` and `realHistoryStatus` (collection.js:40-42).
5. **A private guest artifact has no entry point in the in-scope open or save paths.** `openDataset` (app.js:175-179) resolves only registry entries and saved packages. Save requires `livePinsFor` (app.js:214, 237-239).

**Mapping** (tags: EXISTING = in code now; PLANNED = not implemented; INFERRED = from call sites, file not read)

| # | Stage | Browser today | Guest API | Status |
|---|---|---|---|---|
| 0 | Session | none | `POST /api/guest/session`, JSON `{}`, returns 201 with token (guest-http.mjs:30; guest-steps.mjs:195) | PLANNED |
| 1 | Identifier check | collection.js:15 (9-digit UIC, 8-digit API) | `lookupTarget` (guest-steps.mjs:168) | EXISTING client; server check INFERRED |
| 2 | Lookup | collection.js:18, one awaited POST | `POST /api/guest/lookups` (guest-http.mjs:31), then advance L1–L3 (guest-steps.mjs:147-148), then `GET /jobs/{id}` (guest-http.mjs:38) | PLANNED; step count INFERRED |
| 3 | Candidates | collection.js:22-29 reads `candidates`, `status`, `lookupId`, `sha256`, `queryUrl`, `testFixture`, `retrievedAt`, `sourceRowsUpdatedAt` | `publish` result (guest-steps.mjs:70), same field names | Fields match; equivalence to `/api/lookup` UNVERIFIED (serve.mjs not read) |
| 4 | Selection | collection.js:23-24, explicit radio, no auto-select; gated only by `row.selectable` | `sourceRecordKey` revalidated (guest-steps.mjs:181-183) | EXISTING |
| 5 | Period | collection.js:34, navigation.js:25-29 (YYYY-MM, 1–36 inclusive), index.html:6 | `boundedScope` (guest-steps.mjs:174, 184) | EXISTING, both sides |
| 6 | Collect | collection.js:35, 39 | `POST /api/guest/collections` with `Idempotency-Key` (guest-http.mjs:19, 31); exact body keys (guest-steps.mjs:173) | PLANNED mapping |
| 7 | Progress | static copy, no polling (collection.js:37) | `POST …/advance` loop (guest-http.mjs:32; guest-steps.mjs:160-166); retry backoff 30–120 s (guest-steps.mjs:156) | PLANNED |
| 8 | Result and run | `result.run` → `onRun` (collection.js:40) | `job.result` (guest-steps.mjs:131); `job.run` snapshot (guest-steps.mjs:92); `GET …/runs/{id}` (guest-http.mjs:39) | PLANNED |
| 9 | Open after collect | `onOpen` sets hash (collection.js:44, app.js:204); `route()` (app.js:50) → `openDataset` (app.js:173) | none; needs a third resolver | PLANNED |
| 10 | Download | `fileHref`/`tarHref` (app.js:211-212) | `GET …/archive` (guest-http.mjs:40; guest-steps.mjs:200) | PLANNED |
| 11 | Registry | `refreshVersions` (app.js:166-172), `renderLibrary` (app.js:141-153) | none, by design | EXISTING; keep guest out |
| 12 | Save | click handler (app.js:237-247), `saveVerifiedPackage` (browser-library.js:55) | pins from `job.result.pins` (guest-steps.mjs:130-131) | PLANNED |
| 13 | Saved open | `openSavedDataset` (app.js:226-231), `markSavedView` (app.js:232-236) | none | EXISTING pattern to reuse |
| 14 | History | `#export-history` (index.html:9) and `workspace-run-association` (index.html:21) have no writer in in-scope JS | `GET /api/guest/history` (guest-http.mjs:37) | UNMAPPED; writer is in workflow-ui.js, not read |
| 15 | Default pin | app.js:194-196, library-default app.js:152, `samePins` app.js:215 | guest pins carry `defaultPinned:false` (guest-steps.mjs:127) | EXISTING; must stay unchanged |
| 16 | Analytics | `analyticsReady` requires `!savedView` (app.js:26); `updateSaveControl` (app.js:216) | n/a | EXISTING rule to preserve |

**Adapter hooks (all PLANNED, none implemented)**

- **H1, transport seam:** `mountCollection` (collection.js:4) takes an optional `transport` with `lookup` and `collect`. It defaults to the current `post` (collection.js:10, 18, 39). Keep validation (:15), busy flags (:14, :33, :45) and tickets (:5, :9, :18, :30) in collection.js.
- **H2, lookup:** enqueue, advance until the job is terminal, then `GET` the job. Only a `succeeded` job with `result` can feed collect (guest-steps.mjs:179-180).
- **H3, collect body:** exactly `{lookupJobId, sourceRecordKey, startMonth, endMonth}`. `lookupJobId` is the guest job id, not `lookupId`. `sourceRecordKey` comes only from the explicit radio.
- **H4, idempotency:** one key per user intent, stored with the pending request and reused on retry. A replay returns 200 with `replayed:true` (guest-http.mjs:31; guest-steps.mjs:176). Key format is 16–128 characters of `[A-Za-z0-9_-]` (guest-http.mjs:19).
- **H5, advance loop:** each POST needs `Content-Type: application/json` and a JSON object body, even `{}` (guest-http.mjs:8, 13-14). A 200 response with a failed job is a failure (guest-steps.mjs:140). 409 `LANE_BUSY`/`TOKEN_BUSY` means wait and retry (guest-http.mjs:4). Honour the job's retry-due time; that field is in guest-journal.mjs, not read.
- **H6, third resolver in `openDataset`:** after the registry and saved checks, a guest branch does `GET` job, `GET` archive (with `Authorization: Guest`), then `verifyVersionPackage(tar, job.result.pins)` (browser-library.js:38-46). It then checks `tarSha256 === result.archiveSha256` and the byte length against `archiveBytes` (guest-steps.mjs:131; browser-library.js:45). It returns the same shape as `openSavedDataset` and goes through the `savedView` path. Guard with `versionRequest.isCurrent` after every `await` (app.js:175, 179).
- **H7, save branch:** `updateSaveControl` (app.js:216) and the save click (app.js:237) need a guest branch that passes `job.result.pins` to `saveVerifiedPackage`. Stored pins go through `storedPins` (browser-library.js:54).
- **H8, labels:** `markSavedView` (app.js:232-236) hard-codes "Saved in this browser". A guest view needs its own wording, because reusing the existing text misstates provenance.
- **H9, keep guest out of registry state:** do not add guest entries to `availableVersions` (app.js:14, 166-172), `pinnedVersion` (app.js:196), or the default-pin text (app.js:152). Use a separate in-memory map read only by `openDataset` and the post-collect open.
- **H10, routing edge:** `route()` auto-opens only if `availableVersions.length || savedPackages.size` (app.js:50). If both are empty, the guest open never fires. Without a guest resolver, `openDataset` throws "Requested publication pins unavailable" (app.js:179).

**Hazards**

- **Stale responses:** `reset()` invalidates the lookup ticket (collection.js:9), so a late lookup response is dropped (:18). The guest loop must check the same ticket before writing candidates. A stale open must lose to a newer selection through the `openDataset` guard (app.js:175, 179).
- **Repeated clicks:** busy flags and disabled buttons (collection.js:14, 16, 33, 36, 45). A repeated advance is safe because a lease-less call returns the current job (guest-steps.mjs:162). A repeated enqueue is safe only with the same key.
- **Reload and recovery:** guest state is in memory (guest-local.mjs:4). The token must stay out of URLs and logs (guest-http.mjs:17). Token storage is unresolved (U2). Without the token, `GET /history` is unreachable (guest-http.mjs:36). A saved IndexedDB copy is the only recovery that survives losing the token (browser-library.js:57, 70).
- **No cancel:** there is no route to cancel a job. Stopping the advance loop pauses the job. Do not show a cancel control.
- **Pin unchanged:** `samePins` compares `defaultPinned` (app.js:215). Nothing in the adapter may write `pinnedVersion` or the default-pin text.
- **Request versus recorded run:** the job is the request (guest-http.mjs:38); the run is the recorded execution (guest-http.mjs:39). Keep the copy at index.html:6.
- **Selection scope:** `openDataset` resets `selected` and clears evidence (app.js:177). The guest path must go through `displayDataset`, never write `data` directly.
- **Analytics:** `analyticsReady` checks only `savedView` and `analyticsPins` (app.js:26). A guest view with live-looking pins and no `savedView` would enable Analytics. Set `savedView`-equivalent state.
- **Downloads 404:** `tarHref` and `fileHref` fall back to `/artifacts/{id}/` and `/api/versions/{id}/download` when `savedView` is null (app.js:211-212). Both 404 for guest IDs, so the guest view must use blob URLs.
- **Origin and host:** POST requires `Origin` to match the request origin (guest-http.mjs:20). Browsers send Origin on POST. `guest-local` accepts only loopback Host values (guest-local.mjs:51).
- **Error codes:** unmapped codes become 503 `GUEST_UNAVAILABLE` (guest-http.mjs:45). `SOURCE_LIMIT`, `STEP_INTERRUPTED`, `ARCHIVE_INVALID` and `GUEST_UNAVAILABLE` are not in the status table (guest-http.mjs:4). Read `job.errorCode` instead.
- **Round trip:** guest pins include every `version-pins.json` field plus `publicationPinsSha256` (guest-steps.mjs:130). The browser keeps only the `storedPins` fields (browser-library.js:54) and rebuilds from them (app.js:229, browser-library.js:41). If the canonical builder needs a dropped field, verification fails.
- **Size caps:** browser caps are 80,106,496 bytes and 103 entries (browser-library.js:7). Check guest archives against them.
- **`cap_reached`:** the status text blocks selection (collection.js:22), but radios are gated only by `row.selectable` (:23). Confirm the server sets `selectable` false under cap (lookup.mjs not read).
- **Fixture mode:** fixture collections may never publish. The builder refuses fixtures (guest-steps.mjs:126 comment; archiveBytes.mjs not read). The replay kind (guest-steps.mjs:187-193) with preserved public packages (guest-local.mjs:21-29) may reach publication for tests (INFERRED). Do not expose replay in the UI.
- **Official mode:** `--official` makes live calls to data.texas.gov (guest-steps.mjs:17, 52). Use `--fixture` for tests. I made no such calls.

**Proposed tests (PLANNED)**

1. The collect body has exactly four keys with `lookupJobId`; a `lookupId` body is rejected.
2. Identifier bounds: 9-digit UIC and 8-digit API accepted; other lengths rejected (collection.js:15).
3. Period bounds: `2024-01`..`2024-01` is 1 month and accepted; 37 months rejected (navigation.js:28); empty input rejected.
4. Stale lookup: changing the identifier mid-loop means the late response renders no candidates.
5. Double submit while busy sends one enqueue.
6. Same key and same body returns `replayed:true`; same key with a different body returns 409 `IDEMPOTENCY_CONFLICT`.
7. A failed job returned with 200 is shown as failure, never as "Collection completed".
8. Round trip: `job.result.pins` → `storedPins` → `verifyVersionPackage` gives a `tarSha256` equal to `archiveSha256`.
9. A single flipped byte in the TAR makes `verifyVersionPackage` reject.
10. Guest open and save leave `availableVersions`, `pinnedVersion` and the default-pin text unchanged.
11. A guest view disables `analytics-start`.
12. A saved guest copy survives reload, is listed as "Saved in this browser", and opens without a token.
13. On the guest server, POST `/api/lookup` (405) does not reach the guest adapter, and non-guest mode shows no "Lookup failed" text.

**Unresolved decisions (for main)**

- **U1:** how the browser selects guest versus local mode. Options are a server capability signal, a separate page, or a query parameter. Each is a new contract, so it needs the SPEC.
- **U2:** guest token storage (memory, sessionStorage, or none) and reload recovery.
- **U3:** whether guest artifacts may be saved to the browser library, and how they are labelled in stored records. That may change the `storedPins` whitelist.
- **U4:** on each open, re-fetch job and archive, or re-verify in-memory bytes.
- **U5:** where guest runs and job history render. `workflow-ui.js` owns `#export-history` and the run lists, and it was not read.
- **U6:** keep the static progress copy at collection.js:37, or show per-advance state (possibly a new feature).
- **U7:** the `cap_reached` `selectable` gate (lookup.mjs).
- **U8:** equivalence of `/api/lookup` to the guest lookup result (serve.mjs).
- **U9:** the retry-due field and the step count (guest-journal.mjs, `GUEST_STEPS`).
- **U10:** the requirement IDs RRC-01/05/09/10 live in `docs/superpowers/specs/2026-10-12-guest-collection-browser-save-design.md`, which appeared in the grep but is outside the brief's scope. Decide whether to widen scope for requirement mapping.

**Not read and limits**

- Not read, outside the brief's list: serve.mjs, sources.mjs, lookup.mjs, guest-journal.mjs, evidence-store.mjs, archive-bytes.js, artifact-integrity.js, workflow-ui.js, inspection.js, archiveBytes.mjs, test/guest-http.test.mjs, src/hosted/edge-bootstrap.mjs, and the SPEC and design docs.
- The 22:42:43 UTC stop time was not checked; no clock tool is available. This report is the single checkpoint.
- Slot released. No project files changed, and no plan file was written.
