# Hosted collection: investigated options, not an approved design

Owner goal: public browsing, sign-in required to collect one explicitly selected well over the existing inclusive1–36-month window. Preserve original source bytes, calculated values, quarantine reasons, recorded stages, immutable versions and existing TAR/CSV/JSON contracts. This packet supports a runtime/cost decision; it does not enable collection or authorize deployment.

## Verified baseline

- Repository: `texas-rrc-explorer`; Analytics implementation is outside this task.
- Supabase Portfolio (`phxiqnsebqaalvkanljb`) is ACTIVE_HEALTHY, Postgres17.11. The inspected schemas contain only the private archive tables:134 chunks and1 snapshot, both with RLS. No application job tables were found in `public`.
- The frozen archive remains the independent snapshot `trrc-d6678bd4e24e4d4cd0e224c39c98aa8af9ce543dbd61545c6fa155eeefef6186`, containing3 preserved versions and29 run records.
- The working `lovableproject.com` preview was verified for the3-version library, original example records and29-run history. The older `id-preview` address returned503; the failed body was unavailable, so its origin remains unproven.
- Hosted POST lookup/collection currently verifies a real signed-in user then deliberately returns `HOSTED_COLLECTION_UNAVAILABLE`. The browser collection controller currently supplies no bearer token.
- Local source acquisition performs seven sequential requests, each capped at30 seconds and10MB. It uses filesystem loading, retained private provenance, locked staging and directory-rename publication. These guarantees cannot be replaced by ephemeral Edge files.

## Options

| Option | Existing logic retained | New work | Cost/limitation |
|---|---|---|---|
| Supabase Auth/jobs plus a durable Node worker — recommended for preservation | Collector, trusted snapshot loader, normalization/calculations, fixture proof and local staging | Worker supervision and persistent volume; durable journal/leases; verified remote publication | Worker/storage/backup provider and price are not selected. No claim of free operation. Windows publication blocker is not resolved by selecting this option. |
| Supabase-only queued short steps | Source queries and transformation/validation contracts | Trusted byte-reader/adapters; one durable source step per task; resumable normalization/publication; measured limits | More implementation change. Free-tier suitability is unproven until CPU/memory and total storage are measured. No paid upgrade authorized. |

A single long Edge request or `waitUntil` task is not recommended. Current [Edge limits](https://supabase.com/docs/guides/functions/limits) are150 seconds wall time on Free,400 on paid,2 seconds CPU and256MB. [Background tasks](https://supabase.com/docs/guides/functions/background-tasks) share those limits. [Queues](https://supabase.com/docs/guides/queues) retain messages, but their delivery guarantee is not exactly-once external source acquisition or publication. Both options need idempotency, leases/fencing and durable completion before acknowledgement.

## Additive backend migration required by either option

Proposed TRRC runtime namespace: lookups, jobs, attempts, events, evidence-file references and committed publications; a private evidence bucket; narrowly granted enqueue/claim/journal/commit operations. Exact SQL remains unwritten pending the runtime design. Leave `trrc_archive`, original bytes, old read grants, dataset pins and Analytics untouched.

User IDs come from verified Supabase identity, never caller fields. Bind lookup/selection/jobs to that user. Keep job ownership, quota bookkeeping and authentication details private; expose only verified public datasets and sanitized collection evidence. Ownership RLS and database permissions must both be reviewed. New tables are not assumed automatically exposed through the Data API.

Retries using the same user-scoped idempotency key must return the same owned job; that key with a different payload must reject. An intentional later collection with identical bounds uses a new key and a fresh attempt, preserving the existing ability to refresh. Persist each attempt separately; do not silently refetch into an old evidence set. Enforce atomic per-user/global request budgets. Claim jobs with expiring leases and fencing tokens; stale workers cannot commit a publication. Raw responses, retrieval sidecars and failed attempts remain inspectable with appropriate access.

Upload without replacement, verify original object hashes/byte counts by readback, then commit the catalog entry and terminal run evidence together. Conflicting version bytes reject; identical retries verify. Partial upload and history failures never appear as a successful version. Existing privately branded snapshot validation must not be bypassed by rebuilding a snapshot from untrusted JSON.

## Sign-in and walkthrough

Recommend Supabase [Google OAuth with PKCE](https://supabase.com/docs/guides/auth/social-login/auth-google), minimum identity scopes, exact callback allowlists and validated local return routes. Provider credentials/configuration require a secure setup step; do not ask for secrets in chat.

Email OTP is an alternative with a separate delivery-provider decision. Supabase's [default SMTP](https://supabase.com/docs/guides/auth/auth-smtp) delivers only to project-team addresses and currently allows two emails/hour. It is not suitable for general public sign-in. No email provider or paid service has been purchased.

After sign-in, preserve exact UIC/source-API validation, explicit candidate selection, refusal at the 25-candidate cap, refusal when a monthly response reaches 1,000 rows, fresh parent comparison and existing date bounds. Submit a short request returning 202/job ID, then resume polling after refresh. Show queued/retrying/interrupted job state separately from the three implemented collection stages; stage success must come from durable evidence. A completed job offers Open this dataset. Historical run selection never becomes current-request progress; opening never changes default pins.

## Required acceptance and open gaps

Map RRC-01/02 to lookup/selection/acquisition, RRC-03/04 to unchanged validation/calculations, RRC-05 to immutable verified publication/downloads, RRC-06 to coherent navigation and RRC-09/10 to actual stage evidence/history.

Required tests: forged/expired/anonymous sessions; cross-user job/lookup access; duplicate submission and quota races; identity/date/cap failures; worker death at every persistence boundary; lease fencing; interrupted uploads; publication/history failures; substituted hashes/fixture rejection; retained quarantine; frozen-byte preservation; existing TAR/Analytics compatibility; current-request stage isolation and result handoff. Measure worst-case source bytes, transform CPU/memory and end-to-end execution on the chosen worker.

The current full-suite gate remains183/186, with3 publication renameEPERM failures. This round also reproducedEPERM with a standalone synthetic filesystem probe; no application-code cause or responsible Windows component is established. No permissions, atomic-publication guarantees or tests were weakened.

Hosted sign-in/collection, durable journal and new-version publication are not implemented. Quarantined-record Analytics eligibility remains its owner's dependency. Hosted direct Analytics import/repinning/acknowledgement is not promised. Actual Deno validation and a stable full-suite run remain release gates.

## Charges and approval boundary

Current [Supabase pricing](https://supabase.com/pricing) includes500MB database and1GB Storage on Free; Pro starts at$25/month. Those published limits are not a sizing proof or project billing authorization. New source versions, downloads, polling and logs consume quotas. The smallest worker price and any SMTP charges cannot be quoted until a provider/design is selected. No additional service or upgrade was provisioned during this investigation.

Independent design checkpoint: Astra/high, read-only. Implementation requires a selected runtime/auth approach, reviewed concrete design and migration/cost disclosure. Source fixes and release checks must remain independent of deployment approval.
