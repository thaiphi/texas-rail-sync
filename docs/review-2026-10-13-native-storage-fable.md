**Verdict**
PASS for the supported deletion handling and the native harness evidence, with one LOW hardening suggestion. No correctness blocker found.

**Deletion handling, by inspection (`src/hosted/guest-transport.mjs:73-82`)**
- Exact key: `objectUrl(key)` validates the full content address before any request (`:77`), and the body is `{prefixes:[key]}` with exactly one validated key (`:78`). The Storage remove endpoint matches listed names exactly, so no wildcard or prefix deletion is possible from this call.
- Status and body types: 404 returns after cancelling the body (`:79`); any other status reads at most 65,536 bytes with fatal UTF-8 decoding and requires JSON (`:80`); success requires status 200 and an array that is empty or names only this key (`:81`). Non-200, non-array, oversized, undecodable or foreign-name responses all map to `STORAGE_UNAVAILABLE`, so cleanup aborts rather than releasing rows.
- Absence verification: the transport never claims deletion on its own. `evidence-store.mjs:93` re-reads the key and raises `CLEANUP_INCOMPLETE` unless `ENOENT` comes back, so a 200 `[]` for an object that still exists, or a late write landing after the delete, fails closed and keeps the journal reference.
- Headers and transport: `apikey` only plus JSON content type, `redirect:'error'`, 30 s timeout; no JWT or publishable fallback exists in production code.
- Unit coverage: `test/guest-transport.test.mjs:54-61` pins the path, method, content type and exact body; the red log documents the earlier per-object route failing and the green log shows 8/8 (Main's runs).

LOW, optional hardening: `:79` treats every 404 as "already absent" without reading the body. An unsupported route also answers 404, which is exactly the class of fault just fixed; it was caught only by the GET-verify step. Minimal correction: read the capped body and return only when it carries Storage's JSON error shape (a `statusCode` of 404 or a `not_found` error), otherwise throw `STORAGE_UNAVAILABLE`. Not blocking because absence verification already prevents a false release.

**Harness evidence (`scripts/check-guest-storage.mjs`, `tmp/storage-native-final.log`)**
- Isolation and cleanup: unique `--internal` network with no published ports, disposable PostgreSQL and Storage containers, curl in throwaway containers, containers and network removed in `finally` with the Storage log captured first (`:73-74`). The run directory under `tmp/storage-native-*` retains request bodies, which are preserved public source bytes only, plus `results.json`.
- Fixture gateway disclaimer: the transport is asserted to send only `apikey` and then the harness appends a disposable local JWT (`:32-35`); the file header, the report scope string and the verification doc all state this is not `sb_secret` gateway proof.
- Owned bytes and caps: curl output is sliced into a `Response`, and the transport's `readCapped` copies into a fresh `Uint8Array` under the 80,106,496 cap, so the returned bytes are owned; the gate compares them byte for byte and across a Storage restart.
- Private bucket and local JWT checks: bucket created private only in the disposable service; reads with no header, a bare `apikey`, or an anon JWT are refused locally.
- Deletion gate: delete, `ENOENT` on re-read, then an idempotent second delete, all passed in the final 8/8 log. The `storage.objects` size sum is recorded as metadata only.

**Unverified coverage**
Hosted Storage behavior with an `sb_secret_` key and no `Authorization` header for GET, POST and the batch DELETE; hosted response shapes, including whether a policy-denied remove returns 200 `[]`; hosted private-bucket policies and bucket creation; billing, egress and physical usage; orphan reconciliation beyond the fail-closed re-read. Per-step wall times in the harness include container launches and are not request latency. Hosted guest admission remains disabled.

Checkpoint complete; stopping here for Main to read the transcript and close the session.
