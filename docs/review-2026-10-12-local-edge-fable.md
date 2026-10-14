No further inputs needed; the runtime log, result files, harness and generator are sufficient.

**Summary**
The local edge-runtime harness is credible as *local* evidence: limits are enforced by the runtime itself (CPU negative control killed at 2,009 ms, `runtime-events.log:10`; memory kill at 275,832,420 bytes with `exceeded:true`, `:30`), the container has no network (DNS failure `:8-11`), and all three preserved versions rebuild byte-identically to the frozen artifacts and TARs inside the worker. The run exposed one real design defect — `Buffer` is not a global in the user worker and `artifact.mjs`/`lookup.mjs` depend on it — and it bounds C8 memory: external memory grows ~6–7× evidence bytes, so the design's 80 MB evidence ceiling is infeasible for a single C8 invocation in this runtime. This is partial G0/G1 only; nothing here approves hosted guest implementation or a profiling deployment.

**Files touched**
None.

**Needs judgment**

Credibility and controls:
- Resource controls are real and worker-scoped: `main/index.ts:6-10` (256 MB, 150 s, CPU 1500/2000, `forceCreate`, `envVars:[]`, `noModuleCache`); events come from Supabase's `EventManager` (`events/index.ts:2-3`) with `cpu_time_used` and `memory_used`. Use those, not `probe-handler.ts` wall steps (correctly labelled `:9`).
- Measured (local, not hosted, not peak): v1/v2/v2 CPU 89/49/50 ms, shutdown memory 31.0/28.6/25.4 MB (`runtime-events.log:17,19,21`); fixture pad 3 MB → 182 ms/79 MB (`:26`); pad 8 MB (25.3 MB built) → 326 ms/174 MB, external 162.7 MB (`:28`, `edge-fixture-pad8m.json`); all-sources 8 MB (~57 MB evidence) → killed by Memory at 444 ms CPU (`:30`). CPU is far below 2 s at every surviving size; memory is the binding limit.

Buffer compatibility — real defect (HIGH, design):
- `edge-v1-no-shim.json`: `bufferGlobal:"undefined"`, `node:buffer` importable, failure at `load`: "Buffer is not defined". Product sources use the global: `artifact.mjs:22,83-84,99,108`, `lookup.mjs:13,33`, `acquisition.mjs:14,45`, `pipeline.mjs:33,79`, `versionArchive.mjs:18`. The probe's shim (`probe-handler.ts:13`) is probe-only. Spec §2 line 45 must change from "unverified" to "absent as a global in edge-runtime v1.77.1/Deno 2.1.4; hosted behaviour unconfirmed", and §10 must choose explicit `import {Buffer} from 'node:buffer'` in the modified modules over an entrypoint global mutation. Not a product change now.

Data/byte preservation:
- `generate.mjs` reads `src/`, `raw/`, `artifacts/`, `public/` and writes only under `tmp/…/functions` (`:7-8,11-19,32-36`); expected hashes are taken from the on-disk artifacts (`:30`) and the frozen TAR from `buildVersionArchive` on disk (`:31`), so in-worker equality (`archiveMatchesFrozen:true`, 1,325,056 / 1,393,664 / 1,377,280 bytes, hashes equal to `bundle-index.json`) is an independent check. Scratch mount was read-only. The edge run itself has no post-run fingerprint; Main's existing `git diff --quiet -- raw artifacts runs public/artifact-integrity.json` gate should be recorded for this session (tiny).
- RRC-03/04/05: `normalize` ran unchanged in-worker; quarantine/missing semantics not re-asserted here (covered by the Node probe and 44/44 tests), and no fixture became public (`provenance.classification:'test_fixture'` on padded runs; TAR equality correctly marked not applicable).

Weak assertions / scope issues:
- `probe-handler.ts:29` re-implements `pipeline.mjs:75-77` pin derivation; `exportArtifact`, `publish`, run records, `resumeRunRecorder`, Storage I/O and live `fetch` are untested (same K2 gap).
- Synthetic runs pass on classification alone (`:32`); acceptable, labelled.
- Memory multiples are inflated by the probe's base64 data module retained in memory (`:16-17`, ~1.33× evidence) but exclude production Storage fetch buffers; treat the ~6–7× factor as indicative. Shutdown `memory_used` is not peak; the kill run is the only peak-bounded datapoint.
- `@types/node` bootstrap workaround (`worker/package.json`, `deno.json nodeModulesDir:"manual"`) is a local-runtime quirk; hosted bundling of `node:` specifiers is still unverified.
- CPU control exists; no wall-clock control (not needed). All synthetic padding was whitespace, not realistic JSON rows, so `normalize` CPU at large row counts is unmeasured.

Design consequence (provisional, needs G1 confirmation): C8 cannot hold 80 MB of evidence; a single-invocation cap near ≤30 MB total evidence with margin is indicated locally. Spec §5 should record this as a local bound and keep the stricter guest cap "fail closed" as already written.

Remaining gates: export-entry/publisher/storage/run-resume parity (G0); hosted `node:`/`Buffer` behaviour and bundling; peak-memory instrumentation at finer increments; outbound reachability of the source sites from Edge; G1 hosted profiling; G2 quotas/egress; G3 migration/role proof; G6 live collection.

Next smallest step (Supabase Free, no deployment): rerun the padded series locally at finer total-evidence increments (≈15–40 MB, shim on) using realistic JSON row padding for `candidate-monthly.json`, recording `cpu_time_used`/kill threshold from events; then amend spec §2/§5/§10 for the Buffer import strategy and the local memory bound. No profiling deployment is requested or authorized.

**Gates**
- Read-only checks (actual): `main/index.ts`, `control/index.ts`, `events/index.ts`, `probe-handler.ts`, `generate.mjs`, `worker/deno.json`, `worker/package.json`, `bundle-index.json`, `runtime-events.log`, `edge-v1-no-shim.json`, `edge-v1-shim.json`, `edge-v2-uic20838.json`, `edge-v2-uic56484.json`, `edge-fixture-pad8m.json`, `edge-fixture-pad-all8m.json`; source context from earlier rounds. Not read: `edge-v1-first.json`, `edge-v1-local-types.json`, `edge-fixture-pad3m.json` (summarised by Main), embedded data modules.
- Executable gates: UNRUN by this reviewer; all runtime results are Main's. Subscription only; no paid, deploy, cloud, Git or permission action.

Bounded review complete; slot released.
