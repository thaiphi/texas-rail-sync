# Guest collection on existing Supabase Free — feasibility-first design (2026-10-12, rev 4)

**Status:** selected direction, unproven. Not implemented, migrated, deployed or run. The owner decided to stay within the existing Supabase Free plan. The Node worker with SQLite design is preserved as not selected (`2026-10-12-node-worker-alternative-not-selected.md`). Requirements covered: RRC-01/02, 03/04, 05, 06, 09/10.

**Published Free limits:** Edge functions get 150 s of wall time, 2 s of CPU and 256 MB of memory. The database allows 500 MB and Storage 1 GB. The project's actual remaining quotas, invocation and egress allowances are **unverified**.

**Main's read-only platform check:** organization plan is confirmed Free. Portfolio is healthy; database usage is 12,621,491 bytes, with 134 preserved archive chunks and one snapshot. `pgmq`, `pg_cron` and `pg_net` are not enabled. Storage usage and remaining invocation/egress quotas are unverified. No migration, extension enablement, deployment or data change occurred. This inventory does not prove the proposed collector fits Free.

## 1. Fixed boundaries

- **Local code and data stay as they are:** the local server, CLI, file entrypoints, all legacy artifact bytes, pins, `runs/` and tests stay unchanged.
- **The pinned archive stays read-only:** `trrc_archive` and its pinned snapshot (`edge-bootstrap.mjs:7`) are never written. The hosted catalog keeps listing only that snapshot.
- **Guest versions stay private:** they are reachable only through the owned job routes. There is no shared promotion.
- **No silent workarounds:** no paid upgrade, no extra server, no billing change. Calculation, schema and format changes are not allowed. If any gate fails, it is reported as a blocker.

## 2. Trusted byte adapter (proposed)

**Why the loader can't run as-is:** `loadSnapshot(sourceDir)` reads from disk (`artifact.mjs:24-26`). It also stores its proof in a WeakMap keyed by the `read` function (`:15,84`), which `buildArtifact` requires (`:96-97`).

**The change:**
1. Move the body of `loadSnapshot` into `loadSnapshotFromReader(read)` inside `artifact.mjs`. All checks stay identical:
   - every hash and sidecar check
   - fixture classification, including after early failures (`:29-31,86-90`)
   - scope and targets (`:38,55-58`)
   - row caps (`:46-47`)
   - the selection replay and fresh exact-UIC parent check (`:65-73`)
   - provenance (`:74-80`)
2. `loadSnapshot(sourceDir)` becomes a wrapper that passes a file reader. Its bytes and behavior are unchanged.
3. The private brand, its private copies and canonical renormalization in `buildArtifact` (`:93-108`) are untouched.

**The hosted reader:** it is built only by `createVerifiedEvidenceReader(jobId, attemptId)` (proposed, `src/hosted/evidence-store.mjs`).
- It serves only objects whose path, SHA-256 and byte count are recorded in the service-only journal.
- Every object is hashed again on read.
- Evidence files are produced only by server steps, using the existing local format: `acquisition.json`, the `*.source.json` sidecars, `selection.json` and the lookup files (`acquisition.mjs:33,38,45`; `lookup.mjs:14,30-38`).
- **A client-supplied or JSON-serialized snapshot is never accepted or turned into a trusted public snapshot.**

**Other adapters:**
- **Publisher:** `exportArtifact` gets an optional `publisher` that stores immutable objects. The filesystem `publish` (`pipeline.mjs:22-40`) stays the default. Output paths keep the `artifacts/<id>/<name>` form, so `artifactDownload` still works (`presentation.js:10-12`).
- **Recorder:** `resumeRunRecorder(journalEvents)` (proposed, in `runEvents.mjs`) replays real journal timestamps and continues in the same schema. Every intermediate and final record must pass `workflowView`.
- **Lookup:** export the existing `inspectRows` logic (`lookup.mjs:20-26`), or wrap it, so a step can finish a lookup from stored bytes.

**Edge compatibility is unverified** (gate G0): `node:crypto` `createHash` (`normalize.mjs:1`), `node:util` `isDeepStrictEqual`, the global `Buffer`, and `fetch` with `redirect:'error'` plus `AbortSignal.timeout`.

## 3. Private guest journal (Postgres, proposed migration)

**Schema:** a new schema `trrc_guest` (proposed name), with no grants to `anon` or `authenticated`. Every write goes through `SECURITY DEFINER` functions that only `service_role` may call, using the RPC pattern in `supabase-transport.mjs:11-20`.

**Tables:**
- `tokens(token_hash, expires_at, issue_bucket)`
- `jobs(job_id, kind, owner_hash, idem_key, request_digest, request_json, state, fence, lease_owner, lease_expires_at, next_step_at NOT NULL, lane_deadline, lookup_job_id, result_json, error_code, reserved_bytes, used_bytes, created_at, terminal_at, UNIQUE(owner_hash, idem_key))`
- `steps(job_id, seq, kind, attempt, outcome, error_code, started_at, ended_at)`
- `evidence(job_id, attempt_id, path, sha256, bytes, object_key, created_at)`: the journal-backed set the reader serves
- `run_events(run_id, seq, event_json)`
- `publications(artifact_id, job_id, files_json, pins_json, archive_sha256, run_id)`
- `quota` and `global_quota`

Partial unique indexes allow **one active lookup job and one active collection job across the project**.

**Enqueue** (`trrc_guest.enqueue`), in this order:
1. The token exists and is unexpired.
2. Syntax check, done in the Edge handler first: `lookupTarget` for lookups; for collections, the allowlist (`serve.mjs:59`), the patterns from `lookup.mjs:59`, and `YYYY-MM` months spanning 1–36.
3. **Owned lookup check:** the request names this owner's succeeded lookup job, no older than 24 h, with a matching `lookupId`. The selected candidate must be selectable, re-checked with `validateSelectionEvidence(verifiedReader, selection)` (`lookup.mjs:42-57`).
4. Replay by `(owner_hash, idem_key)`: same digest returns that job; a different digest returns 409.
5. Quotas, the active-job limit and the storage reservation, then insert with `next_step_at=created_at`.

All of this happens in one transaction. Invalid requests are never charged.

**Fencing:** the same compare-and-set predicates as rev 3, in SQL:
- **Claim:** `fence=fence+1`, plus a lease owner and lease expiry.
- **Renew and commit:** match `job_id`, `fence`, `lease_owner`, `state='running'`, and `lease_expires_at>now()`.
- **Zero rows changed** means no commit happens.
- **Lease length:** 180 s, longer than Edge's 150 s wall limit.
- **Concurrency:** one step in flight per job.

## 4. Steps and triggering

**One step = one Edge invocation**, with at most one official fetch (30 s, 10 MB, no redirects). No request ever runs all seven fetches at once.

- **Lookup:** L1 metadata, then L2 inventory, then L3 inspect and commit.
- **Collection:**
  - C0 prepare: validate the selection, `boundedScope`, write `selection.json`, copy the lookup files, write the marker as running, and start the run with a journal `load running` event.
  - C1–C7: one fetch per target, in `targetsForScope` order (`sources.mjs:49-56`).
  - C8 process: write the acquisition marker as succeeded, then `loadSnapshotFromReader`, normalize, `buildArtifact`, then stage the output objects. This step needs the trusted in-memory brand, so it must fit inside one invocation.
  - C9 commit: read back every object, run `buildVersionArchiveFromReader`, then one transaction commits the publication, run record and job result with the fence check.
- **What counts as success:** **job success = the C9 commit only.** An acquisition marker saying "succeeded" is never job success.
- **Retry:** each fetch step gets at most 2 attempts, and only after `HTTP_ERROR`, a timeout or a lease loss. Backoff is 30–120 s with jitter. Each attempt keeps separate evidence rows.
- **Final failures:** run a finalization step that writes the failed run record (load failed, later stages skipped). Deterministic failures are final: `SOURCE_ROW_LIMIT`, scope, identity, provenance, `VERSION_CONFLICT` and `STORAGE_QUOTA`.
- **Fresh parent check:** stays in C8 through the unchanged parent comparison (`artifact.mjs:70`).

**Triggering:**
- **Primary:** `GET /api/guest/jobs/:id` with the owner's token runs at most one due step inline, under the lease.
  - Progress needs a browser that keeps polling. Abandoned jobs pass `lane_deadline` (10 min, provisional), become `interrupted` and free the lane.
- **Alternative:** `pg_cron`/`pg_net` calling a private advance endpoint. Availability on this project is unknown, so it must be verified before the migration.
- Background tasks, `waitUntil` and queue durability are **not** relied on. Performance on the Free plan is not promised.

## 5. Storage, budgets and retention

- **Bucket:** a private bucket, `trrc-guest-evidence` (proposed). Objects are named by SHA-256 and never overwritten. An existing object is accepted only if its readback hash matches.
- **Hard byte admission, checked before every fetch step:** reserve 10,000,000 bytes plus sidecar space, against both:
  - a guest Storage budget of 250,000,000 bytes (provisional), and
  - the measured remaining room under the 1 GB Storage limit, read from journal totals plus a storage-usage check that must be verified.
  - **DB budget:** guest database rows stay within 50 MB (provisional) of the 500 MB limit.
  - **Failure:** fails closed with `STORAGE_QUOTA`. Nothing is evicted, and `trrc_archive` and pins are never touched.
- **Capacity:** the worst-case reservation per collection is about 100,000,000 bytes, so only two would fit in the budget at once. The observed v1 archive is 1,325,056 bytes, and actual bytes replace the reservation once a job finishes. Counts alone cannot guarantee 7 days of capacity.
- **Defaults:**
  - **Per token:** 1 active job, 10 lookups/hour, 3 collections/day.
  - **Global:** 20 collections/day.
  - **Retention:** lookups 24 h, evidence and archives 7 days, job and run rows 30 days.
  - **After expiry:** routes return `410` or `404` and say the evidence is unavailable.
- **Archive size vs memory (critical):** the theoretical 80,000,000-byte archive held in several copies would exceed 256 MB. The copies come from the loader cache, private copies, built files and the archive build.
  - G1 measures the largest safe size. Guest collections then get a stricter evidence-byte cap that fails closed, for example `SOURCE_LIMIT`.
  - The local 1–36-month window, 10 MB per file and 80,000,000 limits stay unchanged.

## 6. Interfaces (Edge, additive)

- **Routes:** `POST /api/guest/session`, `POST /api/guest/lookups`, `POST /api/guest/collections`, `GET /api/guest/jobs/:id` (runs a step), `GET …/runs/:runId`, `GET …/archive`.
- **Token:** an opaque 256-bit token in `Authorization: Guest`, stored only as a hash. Never in URLs or logs.
- **Routing:** handled in `edge-bootstrap.mjs` before the existing JWT check for collection. `config.toml` already sets `verify_jwt=false`. Existing GET routes, `/api/lookup` and `/api/collect` are unchanged.
- **Bridge:** `hosting-bridge.mjs` adds the `/api/guest/*` allowlist and validated forwarding of `Idempotency-Key` and `Authorization: Guest`. The 8,192-byte body limit and 120 s timeout stay.
- **Collection result:** `{artifactId, pins, archiveSha256, runId, scope, realHistoryStatus}`.

## 7. Progress display

- **Separate layers:**
  - **Request steps** in the UI.
  - **Job state:** `queued`, `running` (step k of N), `retry_wait`, `succeeded`, `failed`, `interrupted`, `expired`.
  - **The three collection stages,** shown **only from the committed terminal run record**.
- **While running:** stages stay neutral; there is no green or animated stage progress. Real-time stage status is a stated limitation of this first milestone.

## 8. Browser library (rev 3 §7 carried over)

- **Strict TAR reader:**
  - **Limits, exactly as in the code:** total ≤80,000,000 bytes, ≤10,000,000 per file, ≤100 manifest entries, ≤103 TAR entries, archive ≤80,106,496 bytes and a multiple of 512.
  - **Ordering:** existing ordering is kept. The browser rebuilds and requires byte identity, and a golden test across locales must pass first.
- **Save:** one atomic IndexedDB transaction using `add()`; a `ConstraintError` never overwrites.
- **Trust status, recomputed on every open:**
  - **Verified now:** only against the live server registry or the live owned job result (pins and `archiveSha256`).
  - **Otherwise:** "Origin unverified". Inspection and exact backup are allowed, and **trusted Analytics handoff is disabled**.
  - **Legacy flag:** used only as verification input and only with live proof.
  - **"Default pinned" badge:** comes only from the live `/artifact-integrity.json`.
- **No offline promise:** the saved library loads at startup even when the pinned request fails. There is no service worker and no offline cold-start promise.
- **Blob URLs replace:** `app.js:79,104,105,107,109,117,177`, `presentation.js:10-12`, `workflow-ui.js:12-13,57`.
- **Formats:** TAR, CSV and JSON stay unchanged. Quarantine eligibility for calculations stays the receiver owner's open question.

## 9. SOURCE_PROOF requirements for hosted acceptance

- Exact official targets, retrieval sidecars, HTTP 200, SHA-256 and byte counts, `testFixture:false`, and lookup and selection evidence.
- A real run ID, plus a comparison with the anchors in `SOURCE_PROOF.md` for UIC 000020838, January 2024–April 2026. Any source revision is disclosed, not forced to match.
- Reachability of data.texas.gov and rrc.texas.gov from Supabase Edge is **unverified**.

## 10. Integration files

- **Reused unchanged:**
  - `src/sources.mjs`, `src/normalize.mjs`
  - `public/workflow.js`, `public/quality-validation.js`
  - `src/archiveBytes.mjs` (bundling it with the hosted function must be verified)
  - `src/hosted/{archive-store,catalog,http,supabase-transport}.mjs`
- **Modified (proposed):**
  - `src/artifact.mjs`: `loadSnapshotFromReader`
  - `src/pipeline.mjs`: the `publisher` option
  - `src/runEvents.mjs`: `resumeRunRecorder`
  - `src/lookup.mjs`: export the inspection logic
  - `src/hosted/edge-bootstrap.mjs`, `src/hosted/hosting-bridge.mjs`
  - browser files from rev 3
- **New (proposed):**
  - `src/hosted/guest-journal.mjs`, `src/hosted/evidence-store.mjs`, `src/hosted/guest-steps.mjs`, `src/hosted/guest-http.mjs`
  - `supabase/migrations/<date>_trrc_guest.sql`: written, independently reviewed, **not applied**
  - tests: `adapter-parity`, `guest-journal`, `guest-steps`, `edge-profile`

## 11. Gates (all UNRUN; G0–G3 come before any commit, deploy or migration)

- **G0 adapter parity:** the reader-based loader produces byte-identical artifacts and identical run-record shape on real v2 evidence and fixtures. Legacy tests pass unchanged. Branded proof can't be forged from JSON. Edge compatibility of `node:` built-ins and `Buffer` is confirmed.
- **G1 Edge profiling:** CPU, memory and wall time for C8, C9 and the archive route at 1.3 MB and at higher payload sizes.
  - **Go only if it fits** within 2 s CPU and 256 MB with margin.
  - **If realistic payloads fail,** it is a **blocker** reported to the owner. No server, billing or calculation change is made.
- **G2 platform check:** pgmq, pg_cron and pg_net availability; Storage usage visibility; the actual remaining quotas; and outbound access to the source sites.
- **G3 migration review:** grants and RLS, `SECURITY DEFINER` functions, the compare-and-set fencing and quota races, and a zero-cost check. It does not migrate until approved.
- **G4:** the existing suite stays at 186/186 and frozen bytes stay unchanged.
- **G5:** browser library tests, including the golden ordering test and the trust and handoff states.
- **G6:** hosted end-to-end check against the SOURCE_PROOF requirements. Needs separate live-collection authorization.
