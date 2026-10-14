**Summary**
`exportCore.runExport` reproduces the original `exportArtifact` sequence step-for-step (load/fixture override/provenance/`checkSource`/id regex/`checkOutput`/pin/normalize-qc/build/pins/publish/outputs/record, including the load-succeeded-handoff catch rule), and the filesystem wrapper injects the same `bounded`/`realBounded`/`publish`/`saveRun` protections at the same points. The one deliberate addition — core-owned expected bytes plus per-file readback before export success (`exportCore.mjs:51-57`) — strengthens RRC-05 without changing bytes, counts, pins or run states. Bounded verdict: **PASS** with two MED hardening items and known open gaps. Reviewer executable UNRUN; not feature, Storage, journal or guest acceptance.

**Files touched**
None.

**Needs judgment**

Preservation checks (no finding):
- I/O order and stages: `pipeline.mjs:43-51` ↔ original `:43-90`; `exportCore.mjs:17-30,38-44,62-69` match original transitions; `checkSource` runs both inside `load()` and again at `:28` as before.
- Bytes: strings become `Buffer.from` copies (`:51-52`); `writeFile`/`sha256`/`equals` on Buffer vs utf-8 string are byte-identical, so legacy outputs are unchanged (`export-reader.test.mjs:25-41,43-52` assert this against preserved v1/v2).
- Publisher isolation: publisher gets separate copies; evidence hashes/sizes derive from core-owned `expected` (`:51-58`); mutation and bad readback fail at the export stage with `EXPORT_MISMATCH` (`:53-56`; tests `:54-66`).
- Record observability: `saveRecord` and `error.record` receive `run.snapshot()` clones; fixtures never saved (`:67,69`; test `:74`).
- Provided-snapshot brand: unknown/foreign brand fails `SOURCE_PROVENANCE_UNVERIFIED` at `:26` before any publish; fixture override at `:22` unchanged.
- Readback TOCTOU on filesystem (`pipeline.mjs:49`): `id` is regex-validated at `:29` before any `readPublished`; `name` is an internal key; the byte-equality check binds content regardless of a post-lock swap. Acceptable.
- Not HTTP-exposed: `exportArtifactFromReader` is a trusted-server entry (`:72-75`), consistent with the reader callback contract.

MED
- M1 `exportCore.mjs:77`: `sourceReference` regex admits `..` segments and leading `/`. It is label-only (no I/O), but it lands in public run-record `inputs[].path` (`:38,80`); reject `..`/empty segments and leading `/` as `archive-store.mjs:9-11` does, and document that it must be a logical label (job/attempt), never a Storage object key or token.
- M2 Tests: add (a) a forged/foreign-brand `snapshot` passed to `exportArtifactFromReader` expecting `SOURCE_PROVENANCE_UNVERIFIED` with stages `['failed','skipped','skipped']`; (b) `checkSource` failure on the filesystem wrapper (source outside repo) preserving the load-stage failure; (c) `publish` throwing mid-way yielding export-stage `failed`.

Low
- `:79` pre-reads `acquisition.json` outside the loader cache (one extra reader call); same semantics as `pipeline.mjs:43`, note for Storage I/O accounting only.

Open (not this scope): C8/C9 continuation — `runExport` is single-invocation (load→publish→readback); a resumed-recorder commit seam for C9 does not exist yet. Deno/Edge end-to-end and the 57 MB memory bound remain unverified; no Node-as-Edge claim.

**Gates**
- Read (actual): `src/exportCore.mjs`, `src/pipeline.mjs`, `test/export-reader.test.mjs`, `test/reader-adapter.test.mjs`; `artifact.mjs:1-45`, `runEvents.mjs`, `workflow.js`, original `pipeline.mjs` from earlier context.
- Executable: UNRUN by reviewer. Main's 5+5 PASS, TypeScript, diff and 189 baseline are Main's results; broader regressions pending Main. No deploy, cloud, Git, permission or paid action.

Bounded review complete; slot released.
