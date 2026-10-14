**Summary**
The loader change is minimal and correct in scope: `loadSnapshotFromReader` (`artifact.mjs:34-37`) accepts only a byte callback, refuses non-`Uint8Array` results (`:26-29`), copies once into a private `Buffer`, caches the promise, and keeps the WeakMap brand and ENOENT optional-marker contract unchanged (`:16,25,43`); `loadSnapshot` is now a thin filesystem wrapper (`:31-33`). Explicit `node:buffer` imports replace the global in all five modules, with no global shim. Verdict for this bounded scope: **PASS** (design-level, Main's 3/3 regressions; reviewer executable UNRUN). Not feature acceptance.

**Files touched**
None.

**Needs judgment**
- Trust boundary: the new callback is a server-internal entry (`artifact.mjs:25` comment); it is not HTTP-exposed and must stay reachable only from `createVerifiedEvidenceReader`-style trusted code. No finding.
- Security/brand: `readCopy` copies before caching (`:29,37`), so caller buffers cannot alias cached evidence; brand re-wrapping is refused (`reader-adapter.test.mjs:29`). No finding.
- Fixture classification: unchanged path (`:40-43` allSettled + ENOENT). No finding.
- Memory/CPU: one extra copy per file at `:29` on top of existing `:82-84,108` copies — negligible for ≤1.4 MB; relevant to the still-open 57 MB Edge memory failure, not new risk.
- Test gaps (MED, tests only): `reader-adapter.test.mjs` covers legacy v1 only; add one v2 version (selection replay `:65-73`), and an ENOENT-vs-other-error reader case. Line 13 sets `globalThis.Buffer=undefined` in-process — acceptable but note it does not prove Deno behaviour.
- Open: complete export entry/run-resume (K2), Edge 57 MB memory failure, hosted `node:` compatibility.

**Gates**
- Read (actual): `artifact.mjs:1-45`, `test/reader-adapter.test.mjs`, Buffer-import grep across `src/` (five modules, line 2 or 7). Executable: UNRUN by reviewer; Main's 3/3, TypeScript, diff PASS not repeated; full isolated suite pending Main. No paid, deploy, Git or permission action.

Bounded review complete; slot released before 11:53 CDT.
