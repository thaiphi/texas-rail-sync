**Verdict**
PASS for the bounded Storage guards, with one MED classification defect to fix and three LOW notes. The guards do what the brief lists: single plain bucket segment refused at construction (`src/hosted/guest-transport.mjs:7,42`), object key validated before any request (`:44`), owned copy before the first await and content-address check against the key (`:60-61`), existing 80,106,496 cap on upload and download (`:9,:58,:53`), zero-length bodies accepted and verified by readback through `evidence-store.mjs:34-37`, add-only `x-upsert:false` with byte-exact comparison on conflict (`:62-68`), 404 kept distinct from service failure (`:50-51`), only `apikey` with an `sb_secret_` prefix and no JWT or publishable fallback (`:16,:43`), `redirect:'error'` and timeouts on every call, and the three maintenance RPCs mapped to their real names (`:12`). Config faults use `GUEST_UNAVAILABLE` consistently. The red log shows the three guard tests failing for the right reasons before the change and the green log shows 6/6 after; these are Main's runs, not mine.

**Fresh findings**

1. MED. A failed upload plus an unreadable object is reported as `OBJECT_CONFLICT`. On any non-OK POST, `put` falls back to `get(key).catch(()=>null)` and throws `OBJECT_CONFLICT` whenever the readback is not byte-identical, including when the readback itself failed (`:66-68`). A transient 503 on both calls therefore fails the job with a non-retryable conflict code and a misleading history entry (RRC-09). Repro: `fetchImpl` returning 503 for POST and 503 for GET; `put` rejects with `OBJECT_CONFLICT`, while the covered test (`test/guest-transport.test.mjs:39-40`) only exercises 409 plus changed bytes. Fix: keep `OBJECT_CONFLICT` only when `get` returns bytes that differ; map an `ENOENT` or `STORAGE_UNAVAILABLE` readback to `STORAGE_UNAVAILABLE`. Inspection verdict for this path: REVISE.

LOW:
- Oversized download reports `GUEST_UNAVAILABLE` from `readCapped` (`:20,:23`) rather than `STORAGE_UNAVAILABLE`; `readVerified` normalizes it to `EVIDENCE_UNAVAILABLE`, so callers are unaffected, but the test at `:30` pins the inconsistent code.
- `delete` treats only a bare 404 as already gone (`:70`); a 400 body with `statusCode:"404"`, which `get` already recognizes (`:50`), would abort cleanup with `STORAGE_UNAVAILABLE`. Fail-closed, but cleanup would never complete for such responses. Parse the detail the same way as `get`.
- A "Bucket not found" response that carries `statusCode:"404"` maps to `ENOENT` (`:50`). `requireAll` runs before every load, so this cannot produce a silent legacy load, but a misconfigured bucket will present as missing evidence instead of a service fault.

**Limitations**
Mocks only; whether hosted Storage accepts `apikey` alone for an `sb_secret_` key, the real 404 and conflict response shapes, bucket existence and quotas are unverified hosted gates. Hosted guest admission stays disabled. No executed tests, auth proof, app acceptance or billing claims are made here.

Review complete; slot released.
