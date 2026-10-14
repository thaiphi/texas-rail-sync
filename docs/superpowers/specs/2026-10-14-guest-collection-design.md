# Hosted guest collection, entered from the portfolio — design

Date: 2026-10-14. Status: approved in conversation; awaiting written-spec review.
Requirements: RRC-05 (versioned export), RRC-09 (collection map), RRC-10 (run/status/error/output provenance).

## Intent

**Owner said:** Visitors arrive at the Phi Analytics portfolio (`../phi-analytics`) first. Its existing **Texas RRC Data Intelligence** card is the entry point. A visitor should be able to collect live public records as a guest on the hosted Explorer. Publishing comes after the guest wiring. Supabase stays on the Free plan.

**Success:** a visitor with no account follows this path:

1. Portfolio card → **Open live demo**.
2. On the hosted Explorer, look up a UIC or API, confirm the candidate and a 1–36 month window, then collect from the official RRC source.
3. Browse the resulting private dataset in the existing dataset tabs and download its whole-version TAR.
4. Return to the portfolio.

Throughout, guest usage stays inside Free-plan limits and refuses with a clear message instead of exceeding them.

**Assumptions:**
- The existing reviewed guest backend (`src/hosted/guest-*.mjs`, the SQL drafts) is the foundation and is not redesigned.
- Sending a guest dataset to the hosted SWD Injection Analytics app is out of scope.

## Chosen approach

Reuse the tested guest backend behind the existing same-origin hosting bridge. Rejected alternatives:
- **Direct cross-origin browser → Edge calls:** these would weaken the reviewed same-origin checks.
- **Supabase anonymous auth:** this would discard the reviewed token and quota design.

## 1. Visitor path and browser

**Portfolio** (`phi-analytics`, `src/lib/portfolio.ts`, `src/routes/index.tsx`):
- The `rrc` project gets `status: "Live prototype"` and `demoUrl`, set to the published Explorer URL.
- The project dialog replaces "No working demonstration…" with an **Open live demo** link: `target="_blank"`, `rel="noopener"`.
- Other cards are unchanged.
- No URL is committed until the Explorer is actually published. Before then, the link renders only when `demoUrl` is set.

**Explorer header:** a **← Thai Phi portfolio** link to the portfolio's published URL. It is hidden when that URL is not configured.

**Guest client** (new `public/guest-client.js`, used by `public/collection.js`):
- **Mode:** guest mode is active when the page is served by the hosted bridge. The bridge marks it with a `<meta name="trrc-mode" content="guest">` injected into the shell. Local `serve.mjs` keeps legacy `/api/lookup` and `/api/collect` unchanged.
- **Session:** `POST /api/guest/session` runs lazily on the first lookup. The token goes in `sessionStorage`, wrapped in try/catch, and is sent only as `Authorization: Guest <token>`. It is never put in URLs or logs. If storage is unavailable, the token is kept in memory for the page lifetime.
- **Lookup:**
  1. `POST /api/guest/lookups` with a fresh `Idempotency-Key`.
  2. Loop `POST /api/guest/jobs/{id}/advance` until the job is terminal.
  3. Render candidates from `job.result`. The field names already match the legacy lookup.
- **Collect:**
  1. `POST /api/guest/collections` with exactly `{lookupJobId, sourceRecordKey, startMonth, endMonth}`.
  2. Run the advance loop, showing the real stage names from the job.
  3. Respect the retry-after backoff of 30–120 s, shown as a countdown.
- **Result:**
  - `job.result` provides `artifactId`, `scope` and `run`.
  - The run goes to the existing `onRun`.
  - The dataset opens through a new **guest resolver** in `openDataset` (`public/app.js`). It loads the version from the guest archive (`GET /api/guest/jobs/{id}/archive`), verifies it with the existing browser-library hash checks, and labels it **Guest dataset — private, expires**.
  - It is never added to the public registry and never changes the default pin.
- **Downloads:** the guest TAR is fetched once per job, using one of the session's 3 downloads per 24 h. Viewing and later downloads use that verified in-memory copy, so they spend no further downloads.
- **Errors:** each guest code maps to one plain message:

| Codes | Message |
|---|---|
| `LANE_BUSY`, `TOKEN_BUSY` | Busy, retrying |
| `QUOTA_EXCEEDED`, `TOKEN_QUOTA`, `STORAGE_QUOTA`, `DATABASE_QUOTA`, `EGRESS_QUOTA`, `DOWNLOAD_QUOTA` | Demo limit reached, try later |
| `BUDGET_UNVERIFIED` | Collection paused, browsing still works |
| `TOKEN_EXPIRED`, `TOKEN_INVALID` | Session expired, start again |
| `EVIDENCE_EXPIRED` | This guest dataset has expired |
| `GUEST_UNAVAILABLE`, 5xx | Temporarily unavailable |

  `guest-http.mjs` gains explicit HTTP statuses for the budget codes, which currently fall through to 503: `STORAGE_QUOTA`, `DATABASE_QUOTA`, `EGRESS_QUOTA` and `DOWNLOAD_QUOTA` return 429; `BUDGET_UNVERIFIED` returns 503 with its own code.

## 2. Hosted wiring, limits and cleanup

**Bridge** (`src/hosted/hosting-bridge.mjs`):
- Allow `/api/guest/*` paths: GET, and POST only for the guest POST routes.
- Keep the same-origin and 8 KB body checks.
- Forward the `authorization` (Guest token only) and `idempotency-key` headers.
- The bridge already enforces a same-origin browser `Origin` and forwards it. The Edge guest handler accepts the request URL's origin or the exact `TRRC_GUEST_ALLOWED_ORIGIN`, which is the published Explorer origin.
- This is the same CSRF-level check as today; guest tokens remain the authentication. No secret is needed on the Lovable host.
- Revised at plan review; the earlier design used a shared bridge secret.

**Edge** (`src/hosted/edge-bootstrap.mjs`, `supabase/functions/trrc-explorer/index.ts`):
- The production entrypoint composes the guest handler with the real `guest-transport` (PostgREST RPC + Storage) and `guest-admission`.
- This happens only when `TRRC_GUEST_ENABLED=1`. With it unset, the Edge serves only the read-only routes, which is also the rollback. The published shell still declares guest mode and the bridge still forwards `/api/guest/*`, so the page keeps showing the collect form and answers "temporarily unavailable"; browsing works and no write path opens (owner-accepted 2026-10-14, final review I1).

**Database:**
- `docs/sql/trrc-guest-journal-DRAFT-not-applied.sql` and `trrc-guest-budget-DRAFT-not-applied.sql` become one reviewed migration under `supabase/migrations/`. Schema `trrc_guest` is service-only; anon and authenticated roles are denied.
- Private Storage bucket `trrc-guest-evidence`.

**Budgets** (existing, unchanged):

| Limit | Value |
|---|---|
| Guest Storage | 250 MB |
| Guest database | 50 MB |
| Guest egress | 1 GB per month |
| Archive downloads per session | 3 per 24 h |
| Collection envelope | 100 MB |
| Lookup envelope | 20 MB |

- Requests are one well and 1–36 months.
- Over-limit requests are refused; nothing is evicted.

**Automatic platform statement** (replaces manual-only attestation):
- A `pg_cron` job runs every 5 minutes and inserts a `platform_proofs` row with a 10-minute expiry.
- **Storage:** limit 1 GB (Free; organization-wide). Remaining = 1 GB − measured `storage.objects` bytes across all buckets.
- **Database:** limit 500 MB (Free, per project). Remaining = 500 MB − `pg_database_size`.
- **Egress:** limit 5 GB uncached per month (Free; organization-wide). Remaining = 5 GB − this month's guest egress ledger − an **untracked-traffic allowance of 2 GB**. The allowance covers public browsing, archive downloads and anything else on the organization that the ledger cannot see.
- Admission's existing 500 MB egress margin and 100 MB storage margin still apply on top.
- If the job stops, proofs expire within 10 minutes and admission refuses (`BUDGET_UNVERIFIED`), so the demo fails safe.
- `source` stays `'operator_attested'` for compatibility with the reviewed validator. A new nullable `attested_by` column records `'pg_cron:trrc_guest_attest'` for automatic rows (null for manual rows), so the two remain distinguishable.

**Late-write-safe cleanup** (closes the release blocker):
- Cleanup only considers jobs that are terminal or expired and whose lease ended **more than 1 hour** ago. That is far beyond the 150 s Edge wall limit, so no in-flight request can still write for them.
- For each candidate:
  1. Tombstone its keys. The existing "cleanup keys refuse new admission" rule applies.
  2. Delete objects.
  3. Read back each object to prove absence.
  4. Release the references.
- An **orphan sweep** lists `trrc-guest-evidence` objects older than 1 hour that no journal row references. It tombstones and deletes them with the same read-back check.
- Supabase blocks SQL deletion from `storage.objects`, so cleanup runs in the Edge function. It runs after a guest session is issued, at most once per 10 minutes per isolate, fenced by the maintenance lease.
- Failures leave tombstones in place and are retried, never silently dropped.
- Revised at plan review; the earlier design had `pg_cron` call the Edge function.

## 3. Testing and rollout

**Tests**, written first; each starts RED:

| Area | File(s) |
|---|---|
| Guest client: session, advance loop, backoff, error mapping, guest resolver, sessionStorage fallback | `test/guest-client.test.mjs` |
| Bridge guest forwarding, bridge-secret origin path, rejects without secret | `test/hosting-bridge.test.mjs` |
| Edge composition gated by `TRRC_GUEST_ENABLED` | `test/guest-release.test.mjs` |
| Budget-code HTTP statuses | `test/guest-http.test.mjs` |
| Automatic statement SQL and late-write-safe cleanup plus orphan sweep | `scripts/check-guest-postgres.mjs`, `scripts/check-guest-storage.mjs` (new cases) |
| Portfolio: demo link renders only with `demoUrl` | phi-analytics vitest |

Plus:
- The full isolated suite (`node scripts/check-isolated.mjs`) stays all-pass.
- Protected `raw/`, `artifacts/`, `runs/` and the default pin `2bc9bbbe…0f727` stay unchanged.

**Local walkthrough:**
1. phi-analytics dev server → Open live demo.
2. Explorer via `scripts/guest-local.mjs` (replay of preserved source bytes for automation, `--official` for one manual live check).
3. UIC `000020838` → 3-month collection → open the dataset → download the TAR.
4. Back link.

**Independent review:** a Fable review of the browser contract before wiring, and of the final diff before any hosted step.

**Rollout:** the owner approves each step separately.
1. Apply the migration.
2. Create the bucket.
3. Set secrets (`TRRC_GUEST_ENABLED`, `TRRC_GUEST_ALLOWED_ORIGIN`).
4. Enable `pg_cron` jobs.
5. Deploy the Edge function.
6. Hosted API smoke test: session → lookup → 3-month collection → archive hash.
7. Publish the Explorer on Lovable and do one live walkthrough.
8. Set `demoUrl` and the portfolio URL, push phi-analytics.

**Rollback:** unset `TRRC_GUEST_ENABLED` and redeploy, which returns the site to read-only browsing. Public datasets and pins are never touched. If guest collection must also disappear from the page, republish the Explorer from a commit whose hosting shell does not declare `trrc-mode` guest.

## Out of scope

- Hosted handoff from guest datasets to SWD Injection Analytics.
- Sign-in accounts.
- Statewide or GIS coverage.
- Changing calculations, quality rules, archive format or default pins.
