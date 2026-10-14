**Summary**
The extraction is faithful. `src/sourceFetch.mjs:7-17` is the former `lookup.fetchSource` byte-for-byte in behavior (fixture guard before any request, 30 s `AbortSignal.timeout`, `redirect:'error'`, header and streamed 10,000,000-byte cap with cancel then release, per-chunk `Buffer.from` copies, identical metadata key order) plus one optional `onResponse(status)` hook. Acquisition now reaches the same callback-before-body status recording it had inline (`src/acquisition.mjs:34-41`: `httpStatus` set on arrival, `status:'failed'` in the catch, no `httpStatus` when fetch itself rejects). Lookup re-exports the same function object (`src/lookup.mjs:7-8`), and no other caller or the removed `boundedBytes` helper remains. Node and local Edge loopback runs agree on all seven cases. Verdict for the bounded extraction: **PASS**. Nothing here approves hosted guest fetching, ownership, Storage, SQL or browser saving, all still unimplemented.

**Files touched**
None.

**Needs judgment**

No extraction regressions found. Verified against the removed hunks in `tmp/opus-source-fetch-proposal.txt:56-65,79-90`:
- Status ordering: `onResponse` fires at `sourceFetch.mjs:10` before the `ok` check, the content-length check and any body read, matching the old `request.httpStatus=response.status` placement. Tests `test/source-fetch.test.mjs:42-43` (503 and 204 report status) and `:55-62` (collection journal keeps `['url','name','status','httpStatus']` order with 503 on the failed request; aborted fetch leaves no `httpStatus`).
- Fixture guard: `sourceFetch.mjs:8` rejects injected `fetchImpl` without fixture mode before calling it (test `:18-20`); acquisition keeps its own earlier guard at `:11`. The Edge and Node probes use native `fetch` with `testFixture:true`, so the guard is not bypassed.
- Copies, cancellation, release: `:14` copies each chunk, cancels on overflow, releases in `finally` on overflow and on stream error (tests `:27-30`, `:35-39`, `:44`). Exact 10,000,000 bytes is accepted.
- Metadata: key order and `sha256`/`bytes` from the owned body unchanged (`:15`, test `:31-33`); acquisition's output evidence reads `metadata.sha256` and `body.length`, the same values as before.
- Imports: dropped `Buffer`/`sha256` in acquisition are genuinely unused; lookup still uses `sha256` and `Buffer`.

Pre-existing defects carried over unchanged, LOW, not required for this scope:
- Header-cap (`:12`) and HTTP-error (`:11`) exits do not cancel the response body. Unread bodies hold the connection until GC in Node undici and in Deno. Fix is one `response.body?.cancel()` before each throw.
- No chunk type check at `:14`; only injected fixture streams can deliver non-bytes, and the test's `pulled` helper always enqueues bytes.
- No-body message text changed from "Source response has no body" to "Source response body unavailable". Code stays `SOURCE_INVALID`; `public/workflow.js:13-16` maps journal messages by code, so records are unaffected.

Design note for later hosted work, not a finding now: `fetchSource` trusts `target.url` entirely. Both current callers pass `sources.mjs` targets, but a hosted C1–C7 caller should either pass only `targetsForScope` output or the module should enforce the same host allowlist `artifact.mjs:69` applies at load.

**Gates**
- Read (actual): `src/sourceFetch.mjs`, `src/lookup.mjs`, `src/acquisition.mjs`, `test/source-fetch.test.mjs`, the proposal, red/green/full logs, `node-fetch-results.json`, `edge-fetch-results.json`, both probe sources, `compare-fetch-probes.mjs`. Grep confirmed no other `fetchSource`/`boundedBytes` references.
- Passed (Main's logs, UNRUN by me): red 1/8 (seven failures all "module missing", the collection guard already green), green 8/8, isolated full suite 228/228.
- Parity: `source-fetch-parity.json` does not exist yet, so the generated comparison is BLOCKED. My own comparison of the two result files: all 7 cases equal on body bytes, sha256, metadata, codes and observed status; both time out with `TimeoutError` at 30,002 ms; redirect rejects with `TypeError` and no status; Edge `Buffer` global absent. Observed-status final probe still running per brief, not assessed.
- Unverified claims: TypeScript PASS, pins/raw/artifacts unchanged, browser rerun pending. No live collection, network, Git, cloud, deployment, agents or writes by reviewer.

Bounded review complete; slot released.
