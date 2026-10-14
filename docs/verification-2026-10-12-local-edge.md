# Local Edge measurements after Docker startup — October 12, 2026

Status: Docker startup blocker resolved. Local prototype compatibility/resource tests ran; hosted feasibility and complete hosted export remain unverified. No guest implementation, deployment or migration occurred.

Owner said Docker was on after the prior blocked handoff. Testing stayed within the earlier approximately 11:53 CDT deadline. Existing Supabase Free remains selected. Phi Analytics, all product files, datasets, pins and export bytes remain untouched.

## Actual environment and isolation

- Docker server 29.1.3 responded. Cached image `public.ecr.aws/supabase/edge-runtime:v1.77.1`, digest `sha256:645d0e45446181f3e9d87efeef637b494615f32365befff00e2d2b0fe8535fef`; runtime reports compatible Deno 2.1.4. No image or package download occurred.
- Test container `trrc-edge-probe-20261012` had network mode `none`, no host ports, only the TRRC scratch directory mounted read-only, no account/environment credentials, and no production-repository mount. Cached curl containers shared only its isolated network namespace to send loopback requests.
- Container memory ceiling was 512 MiB for the runtime process. Each fresh **user worker** separately had `memoryLimitMb:256`, CPU soft/hard limits 1,500/2,000 ms and wall limit 150,000 ms. Main service forwarded into that worker using the documented [`EdgeRuntime.userWorkers.create` API](https://github.com/supabase/edge-runtime/blob/v1.77.1/examples/main/index.ts); policy was `oneshot`, maximum parallelism one.
- A deliberate five-second CPU loop was terminated by the supervisor, with an event reporting 2,009 ms CPU and cancellation. The large fixture separately caused an explicit `Memory` shutdown. These negative controls substantiate local enforcement; a generic HTTP 500 alone would not establish the reason.
- Event-manager shutdown CPU values are actual runtime measurements, corroborated by the CPU control. Handler `performance.now()` values are wall time, not CPU. Memory samples and shutdown values are **not peak process RSS**; local `Deno.memoryUsage().rss` returned zero and is not usable as a memory measurement.
- No official-source acquisition, cloud API call, permission/billing change, installation, commit or push occurred. Only scratch test modules and documentation/evidence files were written.

## Harness and compatibility findings

Opus 5.5/high prepared the generator/handler read-only; Main integrated and executed it. Fable 5.1/high independently reviews actual harness/results. The generator copies a minimal module graph into scratch, preserves private loader-brand/copy/canonical-validation code and embeds preserved public evidence. Node generates expected output hashes/TAR digests from the preserved versions. The Edge worker performs the same isolated byte-reader load, canonical normalization, artifact build and runtime-neutral TAR rebuild. `exportArtifact`, filesystem publisher, Storage, SQL journal and resumed run records are not exercised.

Independent review completed in `review-2026-10-12-local-edge-fable.md`: local controls/measurements and byte identity are credible, Buffer absence is a real adapter defect, and the larger memory failure prevents claiming full-size feasibility. The reviewer did not execute the tests or approve guest implementation. Its suggested finer-size/realistic JSON series remains unrun; a production cap has not been chosen.

Startup failures were recorded rather than concealed:

1. Cached image did not contain the guessed `examples/main` directory. Official source supplied the verified worker API; no stubs were substituted for collector modules.
2. Boot tried to retrieve `@types/node`; networking blocked it. Existing local `@types/node` 22.20.5 and `undici-types` were copied into scratch with manual `nodeModulesDir`, avoiding downloads. Read-only mount remained enforced.
3. Template-based dynamic data imports were absent from the compiled module graph. Literal import paths fixed only the test handler's graph discovery.
4. **Unmodified prototype failed: `Buffer is not defined` at load.** Node built-ins (`node:buffer`, `node:crypto`, `node:util`, `node:fs/promises`, `node:path`) imported successfully, but no global Buffer was provided. An explicit test-only bridge from `node:buffer` allowed the subsequent measurements. This bridge is not a product fix or proof of unchanged code compatibility; a future runtime adapter needs explicit imports and regression checks.

## Local results

Durable responses, image identity, configured limits and worker events: `guest-edge-local-results-2026-10-12.json`. Raw scratch outputs and event logs: `tmp/guest-edge-2026-10-12/`.

| Case | Result | Runtime CPU ms | Shutdown heap + external bytes | Meaning |
|---|---|---:|---:|---|
| Five-second CPU negative control | Expected supervisor termination | 2,009 | Not reported as a success | CPU hard limit enforced |
| Original v1, without Buffer bridge | FAIL: Buffer undefined | 32 | 16,821,000 | Real compatibility gap |
| Original v1, test-only bridge | PASS, 13 files and TAR exact | 89 | 30,991,902 | 1,325,056-byte TAR matches frozen `492ebaa6…db8a` |
| Preserved v2 UIC 000020838, bridge | PASS, 28 files and TAR exact | 49 | 28,608,860 | 1,393,664-byte TAR matches `69a93781…605f8` |
| Preserved v2 UIC 000056484, bridge | PASS, 28 files and TAR exact | 50 | 25,375,094 | 1,377,280-byte TAR matches `377721ac…6b9d` |
| Fixture: 3 MB added to each of three documentation files | PASS, fixture build only | 182 | 79,422,623 | 10,314,821 built bytes; no fixture TAR/public claim |
| Fixture: 8 MB added to each of three documentation files | PASS, fixture build only | 326 | 174,278,735 | 25,314,821 built bytes; no fixture TAR/public claim |
| Fixture: 8 MB added to each of seven source files | FAIL: supervisor `Memory` shutdown | 444 | 275,832,420 | Approximately 57.25 MB source evidence; per-source 10 MB bounds respected, but this in-memory design exceeded its local memory limit |

Synthetic inputs are temporary, explicitly classified fixtures. JSON padding is whitespace; source hashes/byte sidecars are updated only inside the fixture copies. They are not observations, accepted public results or evidence of collection. The archive builder's refusal of fixtures was not bypassed. Large-payload C9 TAR memory remains unmeasured because no preserved public version of that size is available.

## Passed, failed, blocked and unrun

**PASS:** Docker connectivity, isolated user-worker dispatch, CPU negative control, three preserved version builds/TAR byte identities with the test-only bridge, two larger fixture builds, read-only container mount/network checks and tracked production/data/pin preservation. The default-pin file remains SHA-256 `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`.

**FAIL:** unmodified prototype Buffer compatibility; approximately 57 MB fixture memory fit. Earlier offline graph boot/type and dynamic-import failures were harness/environment failures corrected locally as described. No product guard was weakened.

**BLOCKED/UNVERIFIED:** hosted Edge measurements remain unavailable under no-deployment instructions. Cached local runtime version/behavior is not established as identical to the hosted project. The original blanket size allowance cannot be declared Free-feasible from these results. Smaller verified cases do not select a safe production cap or authorize public collection.

**UNRUN:** complete reader-based export entry and publisher/readback behavior, run recorder/resume, Storage lineage, SQL ownership/leases/quotas/migrations, actual remaining platform egress/invocation/storage budgets, source reachability from hosted Edge, larger public TARs, cold/warm/concurrent load margins, browser-local save, guest end-to-end and Analytics receiver quarantine eligibility. Existing production Node/TypeScript/browser results are earlier evidence; no new UI gate is claimed.

## Handoff

Next isolated engineering work is explicit Buffer imports plus complete export-adapter parity and a conservative payload-admission design informed by these failures, then independent review. Do not implement guest collection, raise limits, relabel fixtures or deploy to overcome the failing gate. Preserve Supabase Free and the owner's current boundaries.

The test-owned container was stopped and removed after logs were saved; Docker and unrelated containers were left running. External Claude probe/review sessions are closed at handoff. Changed paths in this continuation are documentation/evidence plus ignored scratch only.
