# Guest bounded collection and browser saving — design rev 3 (2026-10-12)

**Status:** proposal. Not implemented or run; not release acceptance. Replaces rev 2 and fixes Fable review 2, items N1–N12. Owner direction: guests can collect bounded public data without signing in, save it in the browser and export it. Cloud saving and sign-in are optional and later; this replaces the signed-in-only plan in dated docs. Requirements covered: RRC-01/02, 03/04, 05, 06, 09/10.

## 1. Delivery boundary

- **Milestone 1 is a controlled local prototype, not the online goal.** It is the worker inside `scripts/serve.mjs`, which binds `127.0.0.1` (`serve.mjs:107`). It keeps the loopback, same-origin write guard (`serve.mjs:26-28`). No provider charge.
- **Online guest delivery** waits on owner approval of host, provider and price. It needs:
  - **A Node host, not Supabase Edge.** The trusted loader's proof is a WeakMap filled by filesystem reads (`artifact.mjs:15,84,96-97`). The collector and publisher only accept paths inside the repository (`acquisition.mjs:28-31`, `pipeline.mjs:11,23`). So the persistent volume must be mounted inside the deployed checkout.
  - **Same-origin bridge changes:** an allowlist for `/api/guest/*` (today `hosting-bridge.mjs:3,12`), and validated forwarding of `Idempotency-Key` and `Authorization: Guest` (today only `authorization` is forwarded, `:23`). It keeps the 8,192-byte body limit (`:21`), adds a second backend origin (`:2`), and streams archives up to 80,106,496 bytes within the 120 s timeout. That timing must be measured.
  - **Edge stays read-only.** It accepts GET/HEAD only, a JWT Bearer, and no anonymous users (`edge-bootstrap.mjs:62,68,73`). The pinned archive (`edge-bootstrap.mjs:7`) is never written.
- **Supabase-only short steps are not impossible, but not selected.** They would need byte-reader adapters that keep the trusted byte proof (no snapshot rebuilt from JSON), resumable steps, and measured limits. A browser fetching sources directly would lose the trusted loader, and source access from a browser is unverified.

## 2. Current behavior kept unchanged (code-read)

- **Lookup:** exact identifier only, 9-digit UIC or 8-digit API. Exactly 25 rows means `cap_reached`, nothing selectable. Duplicate or invalid parents cannot be selected. 30 s, 10 MB, no redirects (`sources.mjs:34-39`, `lookup.mjs:9-26`).
- **Collection:** 1–36 inclusive months. Seven fixed targets. Refused at 1,000 monthly rows. The fresh parent must match the selected identity (`artifact.mjs:47,70`). Out-of-scope rows refuse the whole version (`pipeline.mjs:71`). Zero reports is a successful but `incomplete` result.
- **Publication and runs:** lock, staged readback, rename, identical-byte reuse, `VERSION_CONFLICT` for differing bytes (`pipeline.mjs:22-40`). Pins exist for v2 only. Run records are written once at the end and never for fixtures.
- **`acquisition.json` "succeeded"** means all seven responses were saved (`acquisition.mjs:52`). It is never used as job success.
- **Calculation eligibility of quarantined rows** is the receiver owner's open dependency. This design does not settle it.

## 3. Job ledger

**Store:** `guest-data/ledger.sqlite`, using Node's built-in `node:sqlite`; no package is installed.
- Main confirmed only that `DatabaseSync(':memory:')` opens on Node 24.19.
- Not yet proven: WAL, `synchronous=FULL`, `BEGIN IMMEDIATE`, file durability and contention on the repository's Node 24 floor. **This is a stop-and-ask gate (G0) before implementation.** There is no fallback to mutable JSON files.
- `synchronous=FULL` makes only the ledger durable. It does not make separate artifact and run files atomic with the ledger.

**Tables:**
- `tokens(token_hash PK, created_at, expires_at, issue_bucket)`
- `jobs(job_id PK, kind, owner_hash, idem_key, request_digest, request_json, state, fence INT NOT NULL DEFAULT 0, lease_owner, lease_expires_at, next_attempt_at NOT NULL, attempt_count, lookup_job_id NULL, lookup_attempt_n NULL, result_json, error_code, reserved_bytes, used_bytes, created_at, terminal_at, archive_deleted_at, UNIQUE(owner_hash, idem_key))`
- `attempts(job_id, n, fence, root, lookup_id NULL, run_id, artifact_id, outcome, error_code, run_record_json, reserved_bytes, used_bytes, started_at, ended_at, PK(job_id,n))`
- `quota(owner_hash, kind, window_start, count)` and `global_quota(kind, day, count)`
- `UNIQUE INDEX one_running ON jobs(kind) WHERE state='running'`

**Enqueue order (N2, N1):**
1. The token must exist and be unexpired. Otherwise return `401 GUEST_TOKEN_INVALID` with no ledger read of jobs.
2. Syntax check:
   - Lookups go through `lookupTarget`.
   - Collections use the key allowlist from `serve.mjs:59`, the `lookupId` and `sourceRecordKey` patterns from `lookup.mjs:59`, and `YYYY-MM` months spanning 1–36 inclusive.
   - Failures return `400` and are never written or charged.
3. Replay: `(owner_hash of this token, idem_key)`. Same digest returns `200` with that job; a different digest returns `409 IDEMPOTENCY_CONFLICT`. Replay never crosses tokens.
4. Collections only, outside any transaction:
   - Find the owner's **succeeded** lookup job whose result `lookupId` matches, no older than 24 h. Otherwise return `LOOKUP_NOT_OWNED` or `LOOKUP_EXPIRED` without revealing whether it exists.
   - `lookupRoot` is that lookup job's succeeded attempt `root` from the ledger, never a caller path.
   - Run `loadSelection` and `boundedScope` there, unchanged.
5. In `BEGIN IMMEDIATE`:
   - Re-check replay, active-job limit, quotas and the lookup reference.
   - Insert with `state='queued'`, `next_attempt_at=created_at`, and `lookup_job_id`/`lookup_attempt_n` for collections.
   - Increment quotas, commit, return `202`.
   - **Quotas change only on a successful insert.**

**Shared lanes (N8):** one in-process single-lane lock per kind (`lookup`, `collect`), replacing the `lookingUp` and `collecting` flags (`serve.mjs:16,56,60`). Legacy routes try the lock and keep their `409 *_BUSY` response. The dispatcher waits for the lock. So at most one lookup and one collection run at a time across legacy and guest work. The `one_running` index adds the same guarantee in the database.

**Admission (disk budget):** checked after the lock and before claiming, and before any source request.
- Worst-case reservation per attempt:
  - Collection: 200,000,000 bytes. That is 9 source bodies at 10,000,000 each (seven targets plus two copied lookup bodies) in the source folder, a similar copy in the artifact, plus normalized output.
  - Lookup: 25,000,000 bytes.
- Required: `budget − Σ reserved_bytes of active attempts − Σ used_bytes of unexpired attempts ≥ reservation`, **and** `fs.statfs` free space ≥ reservation + 1 GB margin. Both figures are provisional and must be measured.
- Otherwise the job ends as `failed` with `STORAGE_QUOTA`. The failure is deterministic, does not consume a retry, and nothing is auto-billed or expanded.
- On finish, actual bytes are recorded in `used_bytes` and the reservation is released.
- **Counts do not guarantee capacity:** 50 collections/day × 7 days × 2 attempts × 200,000,000 bytes = 140,000,000,000 bytes worst case. The byte budget enforces the limit, so the 7-day retention promise holds only within that budget. The observed v1 archive is 1,325,056 bytes, so typical use is far smaller. That figure is not used for sizing.

**Claim (CAS):**
- `UPDATE jobs SET state='running', fence=fence+1, attempt_count=attempt_count+1, lease_owner=:me, lease_expires_at=:now+15min WHERE job_id=:id AND state IN('queued','retry_wait') AND next_attempt_at<=:now`, then insert `attempts(n=fence, root=guest-data/jobs/<jobId>/a<n>)` in the same transaction.
- `changes()===0` means not claimed.
- Each attempt gets its own folders, so a crash's `.lock` or `.publish-*` leftovers never block later attempts.

**Lease renewal (N6):**
- Every 60 s: `UPDATE jobs SET lease_expires_at=:now+15min WHERE job_id=:id AND fence=:n AND lease_owner=:me AND state='running' AND lease_expires_at>:now`.
- `changes()===0`, or any database error, means the lease is lost. The attempt's `AbortController` fires, no further source requests start, and the attempt can never commit.
- **Required additive change:** the collector and fetcher refuse an injected fetch outside fixture mode (`acquisition.mjs:18`, `lookup.mjs:8`), so a wrapper fetch is not possible. Add an optional `signal` to `fetchSource` and `collectPublicSnapshot`, combined with the existing 30 s `AbortSignal.timeout` via `AbortSignal.any` (availability to be verified). The `fetchImpl===fetch` guard stays unchanged. An abort is recorded as a failed stage through the existing recorder.
- The lease length must exceed the measured worst case of 7×30 s of fetching plus load and export (G2).
- **In-process rule:** the dispatcher never claims a job, or a job of the same kind, while a `performLookup` or `collectPublicSnapshot` promise for it is still pending, whatever the lease says.

**Success commit (collection):**
1. `collectPublicSnapshot` resolved.
2. Re-read the run record from the attempt's `runs/`. Validate it with `workflowView`. Require `succeeded` and `public_reported`, and require it to deep-equal the returned record.
3. Derive pins with the extracted `serve.mjs:40-45` logic.
4. `buildVersionArchive({directory,pins})` succeeds; `archiveSha256` is the SHA-256 of its output.

These steps **verify on-disk consistency**. They do not guarantee durability: the pipeline never fsyncs (`pipeline.mjs:37-38`). The commit is then:
- `UPDATE jobs SET state='succeeded', result_json=:r WHERE job_id=:id AND fence=:n AND lease_owner=:me AND state='running' AND lease_expires_at>:now`, plus the attempt row.
- `changes()!==1` means roll back and keep the attempt as a private orphan.
- **Job success = this committed row.**
- Lookup success is the same, with `performLookup` output and `attempts.lookup_id`.

**Failure and retry:**
- The same CAS stores `error.record` in `run_record_json`, including fixture runs that are never saved to disk.
- Every attempt keeps its own record.
- At most **2 attempts**, and a retry only after transient failures: `HTTP_ERROR`, timeouts, lease loss or restart interruption. Backoff is `next_attempt_at = now + 30 s×attempt + random 0–15 s`, capped at 120 s. The state is `retry_wait`.
- Deterministic failures are terminal: `SOURCE_ROW_LIMIT`, `SOURCE_SCOPE_MISMATCH`, identity change, provenance errors, `VERSION_CONFLICT` and `STORAGE_QUOTA`.

**Restart:**
- For each `running` row whose lease has expired, take it over: `UPDATE jobs SET lease_owner=:me, lease_expires_at=:now+15min WHERE job_id=:id AND fence=:n AND state='running' AND lease_expires_at<=:now`. A live old process keeps renewing, so takeover fails.
- After takeover, **re-run commit steps 2–4 on disk**. Adopt the attempt only with the CAS success commit above, and flag it `reconciled=true`. Otherwise mark it `interrupted`, then retry or end.
- Committed jobs are also **re-verified before being offered** after a restart. A job that fails re-verification is reported as `EVIDENCE_UNAVAILABLE`.
- Orphans, `.publish-*` folders and locks are kept privately and never cleaned automatically (`requirements.md:29`).
- Production disk durability, snapshots and backups are a measured gate (G9).

**Cleanup (N7):** works only from ledger rows. Each `root` must resolve under `guest-data/jobs/`. Lookup attempt roots referenced by any `queued`, `running` or `retry_wait` collection are never deleted. A collection copies the lookup files into its own sources (`acquisition.mjs:36`), so unreferenced lookups expire after 24 h.

**Intentional refresh:** a new click is a new key, job, attempt, artifact ID and run. Identical bytes are legitimate.

## 4. Token and retention

- **Token:** 256-bit random; the server keeps only its SHA-256. Valid 30 days (provisional). Issuance limited to 5 per hour per salted IP bucket, online only.
  - It travels only in the `Authorization: Guest` header. **Never in URLs, logs, the bridge or error bodies.** Logs carry `jobId` only.
  - It lives in IndexedDB `session`, which any script on the origin can read. Mitigations: no third-party scripts and a strict CSP, both to be verified.
- **Expired token or job:** a pending entry shows "Guest access expired; this job can no longer be resumed here. Saved copies remain." It is marked unresumable and never reassigned to a new token.
- **Retention** (provisional):
  - Lookups: 24 h, as in §3.
  - Archives and source evidence: 7 days after terminal (`archive_deleted_at`). Archive routes then return `410 EVIDENCE_DELETED`.
  - Ledger job rows and run records: 30 days, then `404 JOB_UNAVAILABLE`.
  - Only inside `guest-data/`. Never `raw/`, `artifacts/`, `runs/`, pins or the hosted snapshot.
- **Quotas:** 1 active job per token, 10 lookups per hour, 3 collections per day; 50 per day globally; plus the byte budget. No CAPTCHA and no purchase.

## 5. Interfaces (additive; existing routes unchanged)

| Route | Response |
|---|---|
| `POST /api/guest/session` | `201 {guestToken,expiresAt}` |
| `POST /api/guest/lookups` (token, key, `{kind,value}`) | `202`, `200` replay, `400`, `401`, `409`, `429` |
| `POST /api/guest/collections` (token, key, `{lookupId,sourceRecordKey,startMonth,endMonth}`) | same |
| `GET /api/guest/jobs/:id` | `{jobId,kind,state,attempts[{n,outcome,runId,errorCode,startedAt,endedAt}],result?,error?,reconciled?,archiveDeletedAt?,pollAfterMs}` |
| `GET /api/guest/jobs/:id/runs/:runId` | ledger `run_record_json`, validated with `workflowView` |
| `GET /api/guest/jobs/:id/archive` | `buildVersionArchive` output, `${artifactId}.tar` |

- Collection `result` is `{artifactId,pins{…,publicationPinsSha256},archiveSha256,runId,scope,realHistoryStatus}`.
- Locally, all new routes also pass `guardWrite`.
- Guest versions never appear in `/api/versions`. There is no shared promotion; guest archives are immutable.

## 6. Progress display

- Three layers stay separate:
  1. **Request steps:** find → confirm → collect → review → download.
  2. **Job state:** `queued`, `running`, `retry_wait`, `succeeded`, `failed`, `interrupted`, `expired`.
  3. **The three collection stages:** shown only from each finished attempt's persisted, validated run record.
- Milestone 1 keeps the terminal-only contract. While running, stage nodes stay neutral with "Stage evidence is recorded when the attempt ends". No animated or green progress; real-time stage status is a stated limitation. A durable stage journal is a separate later RRC-10 change.
- Past runs never drive current progress.
- The result panel opens from the job result or the saved copy, not from a version-list refresh. This closes the `app.js:168,172` gap.

## 7. Browser save

**IndexedDB `trrc-saved-v1`:**
- `packages` (key `artifactId`): `{tarBytes,tarSha256,pins,origin:'guest_job'|'server_library',legacyVerificationMode:boolean,jobId?,runId?,savedAt,authenticatedAt}`
- `runs`, `pending`, `session`

**All stored fields are editable by same-origin script and are never trust inputs on their own (N3).**

**Archive limits:** file-body total ≤80,000,000 bytes; each file ≤10,000,000; ≤100 manifest entries, so ≤103 TAR entries (`archiveBytes.mjs:12,21`). Archive between 1,024 and 80,106,496 bytes and a multiple of 512 (`analytics-handoff.js:5,81`). Check: 80,000,000 + 103×512 + up to 103×511 + 1,024 = 80,106,393, which rounds up to 80,106,496.

**Strict reader `public/tar-read.js` (N10):**
- Checks: ustar magic and version `00`, regular files only, mode 0644, zero uid/gid/mtime, valid checksum, the path character set and length, unique names, the limits above, and two zero blocks with nothing after.
- It does **not** enforce its own sort order.
- **Ordering and bytes are unchanged.** After parsing, the browser rebuilds with the existing `buildVersionArchiveFromReader` (`localeCompare` ordering, `archiveBytes.mjs:26`) and requires byte identity with the downloaded archive. A mismatch refuses the save (fails closed).
- **G4 must pass a golden test before browser saving is accepted.** It compares real v1/v2 file sets and adversarial names (`lookup.json` and `lookup-inventory.json`, `-`, `_`, `.`, digits, mixed case) across the Node runtime and the target browsers and locales. If it fails, stop and ask; there is no silent comparator or schema change.

**Saving a copy:**
1. Get the trusted pins: for guest copies, the live owned job result; for server copies, the live `/api/versions` entry.
2. Fetch and hash the archive. For guest copies it must equal `archiveSha256`.
3. Parse it.
4. Run `loadVerifiedVersion(pins, tarFetch)`.
5. Rebuild and require byte identity.
6. Guest copies only: check the run record with `workflowView` (same artifact, `succeeded`).
7. One `readwrite` transaction: `packages.add()` plus the run and pending entries. If the artifact ID already exists, `ConstraintError` aborts the transaction. A fresh read-only `get` then reports "already saved" for the same `tarSha256`, otherwise refuses. Nothing is ever overwritten.
8. Report "saved" only on `complete`. A quota error or abort means nothing is saved.
9. `persist()` is called only after a user action.

**Trust status, recomputed each time a copy is opened (N3):**
- `server_library` copies: verified now only if the live `/api/versions` entry has the same `artifactId`, `manifestSha256`, `normalizedSha256`, `publicationPinsSha256`, `classification`, `path` and `defaultPinned`, **and** the stored bytes rebuild byte-identically with those live pins.
- `guest_job` copies: verified now only if the live owned job result has the same pins and `archiveSha256`, **and** the bytes rebuild identically.
- Otherwise the status is **"Origin unverified"**: the server is down, the copy is unlisted, the job expired or deleted, the token is invalid, or anything mismatches.
  - Inspection and exact backup are still allowed, with a warning.
  - The `app.js:101` label becomes "Origin unverified — integrity self-consistent only". Never "Public reported — verified version pins".
  - **Analytics handoff is disabled** until trust is re-established.
- Existing server-version handoff is unchanged.
- No signing and no new receiver protocol.
- A manual import of a backup file stays subject to the receiver's own checks. Quarantine eligibility stays open.

**Legacy v1 and the default pin (N4):**
- `legacyVerificationMode` exists only because the v1 manifest has no provenance (`artifact.mjs:136`; `artifact-integrity.js:10`). It is used **only** as the `defaultPinned` input to verification. It is set only for `server_library` copies whose live registry or `/artifact-integrity.json` currently proves that artifact and its hashes.
- A stored flag can never create legacy proof. Without live proof, a saved v1 is **"Unavailable for verified inspection"**; only exact backup with an unverified-origin warning is offered. Guest copies can never set the flag.
- The "Default pinned" badge (`app.js:144,146,157`) comes **only** from the live `/artifact-integrity.json`. If that is unavailable, it shows "Default pin: unknown". Saving never repins.

**Merged library and startup (N5):**
- Startup opens IndexedDB and lists saved copies **before and independently of** the pinned-artifact request (`app.js:184-193`). A pinned failure no longer disables saved entries.
- `availableVersions` is server entries plus saved copies, each with `{origin, reader, trust}`. `openDataset`, `verifyLibrary` and `route` (`app.js:45,152,166-172`) use the reader of each entry.
- If an artifact ID is in both lists: identical pins show one row; different pins show a conflict and the entry cannot be opened.
- **There is no service worker, offline mode or PWA promise.** Saved copies open only while the app page itself is loaded. Opening the app cold without a server is not supported.

**Blob URLs for saved copies:**
- `app.js:79,104,105,107,109,117,177`
- `presentation.js:10-12` via `workflow-ui.js:12-13`
- `workflow-ui.js:57`: runs come from the `runs` store or the guest job route
- `.html` files are served as `text/plain` (`serve.mjs:99`); saved bytes are data and are never executed.

**Origin and labels:**
- IndexedDB belongs to one exact origin: scheme, host and port. `127.0.0.1` and `localhost`, or different ports, have separate libraries.
- Analytics handoff stays at `EXPLORER_ORIGIN`.
- Label: "Saved in this browser — may be cleared; download a backup". Loss is reported only when surviving evidence shows it.

**Export:**
- "Download backup" gives the exact stored archive as `${artifactId}.tar`. The format, schema and filenames are unchanged.
- Add an optional `loadPackage` to `createAnalyticsHandoff`, used only for copies verified now.

## 8. Integration files

- **New:**
  - `src/guestLedger.mjs`, `src/guestWorker.mjs`, `src/laneLock.mjs`
  - `src/publishedVersion.mjs`: extracted from `serve.mjs:40-45`, behavior unchanged
  - `public/archive-bytes.js`: moved verbatim; `src/archiveBytes.mjs` re-exports it
  - `public/tar-read.js`, `public/browser-library.js`
  - tests: `guest-ledger`, `guest-worker`, `lane-lock`, `tar-read`, `browser-library`, `archive-order-golden`
- **Modified:**
  - `src/lookup.mjs` and `src/acquisition.mjs`: optional `signal` only
  - `scripts/serve.mjs`
  - `public/{collection,app,presentation,workflow-ui,analytics-handoff}.js`
  - `public/index.html`
- **Online milestone only:** `src/hosted/hosting-bridge.mjs` and Node host configuration.
  - The Supabase function bundle must include `public/archive-bytes.js`, because `src/hosted/http.mjs:1` imports `src/archiveBytes.mjs`, which will re-export it (G8).

## 9. Approvals and recorded defaults

**Owner approval needed:**
1. This written spec.
2. Host, provider and price for online delivery. The price is unknown; no free operation is claimed.

**Technical defaults (not permissions):** opaque token; one lane per kind; no promotion; 2 attempts with backoff; retention of 24 h, 7 days and 30 days; byte budget; no CAPTCHA; terminal-only stages.
- These do not authorize live collection, deployment, services or spending.

## 10. Gates (all UNRUN)

- **G0 (stop-and-ask):** on the Node 24 floor, prove `node:sqlite` file-backed WAL, `synchronous=FULL`, `BEGIN IMMEDIATE` contention, partial unique index behavior and recovery after a process kill. Also prove `AbortSignal.any` and `fs.statfs`.
- **G1 (ledger):** token validated before replay; invalid requests never charged; replay only for the same unexpired token; new jobs get picked up; idempotency conflict; quota races; one-running index; stale-fence and expired-lease CAS refused; lookup references; cleanup protection.
- **G2 (worker):** process killed at every boundary; adoption only with full re-verification and CAS; lease loss aborts the next request and blocks commit; no claim while work is in flight; legacy and guest lanes shared; worst-case timing measured against the lease; `STORAGE_QUOTA` raised before any request.
- **G3:** the existing suite stays at Main's 186/186. EPERM history stays disclosed.
- **G4:** golden ordering grid byte-identical across Node and browsers; boundary sizes and one byte over each; tampering rejected.
- **G5 (IndexedDB fake):** collision abort, two-tab race, quota abort, trust recomputed, v1 without live proof unavailable, handoff disabled when unverified.
- **G6 (Main, local browser):** guest collect (needs separate live-collection authorization), refresh-resume, expired-token message, startup with pinned failure, every Blob link, backup bytes equal to the server archive, verified handoff, default pin unchanged.
- **G7:** frozen bytes unchanged: 28 raw hashes, pins, existing artifacts and runs.
- **G8 (online):** bridge allowlist, headers and limits; forged or expired tokens; cross-owner access; streaming time; actual Deno build and bundle containing `public/archive-bytes.js`.
- **G9 (online):** production disk durability, snapshots and backup/restore measured against the budget.

