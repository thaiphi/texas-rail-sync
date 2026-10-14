# Export adapter implementation checkpoint — October 12, 2026

## Scope and pause

Continued the approved backup workflow: Opus proposed bounded production patches; Codex integrated and ran gates; Fable independently inspected the final core and continuation seam. Only TRRC was edited. Phi Analytics, datasets, pins, source bytes and existing export formats were preserved. No deployment, live collection, cloud writes, billing, permissions, commits or pushes occurred.

The original work window began at 17:01:18 UTC, with an 18:01:18 UTC deadline. On context restoration the clock was already past that deadline. Only correcting the outstanding test expectation, final verification, evidence saving and stopping the test-owned container were completed before pausing. Do not treat the latest `continue` as a reset of that window.

## Implemented

- `src/artifact.mjs`: byte-reader loading retains the private snapshot brand and canonical source checks; the filesystem loader delegates to it.
- `src/exportCore.mjs`: shared source/QC/build/pin derivation and verified publication/readback. Copies protect expected bytes and saved run records against callback mutation. Logical source references reject escapes.
- `src/pipeline.mjs`: existing filesystem export delegates to the same core, retaining immutable filesystem publication and run-record behavior.
- `src/runEvents.mjs`: validated resume preserves run identity and prior events; canonical UTC clock checks reject backward/noncanonical timestamps atomically.
- `prepareArtifactFromReader` produces validated staged bytes and a running journal without claiming publication. `finalizeArtifactFromReader` reconstructs source evidence, checks journal/QC/staged bytes, then commits and verifies publication. These are trusted internal seams, not guest endpoints.
- Explicit `node:buffer` imports in acquisition, artifact, lookup, pipeline and version archive remove dependence on an unavailable Edge global.

Regression coverage: `test/reader-adapter.test.mjs`, `test/export-reader.test.mjs`, `test/run-resume.test.mjs`, `test/export-continuation.test.mjs`.

## Passed

- Direct bundled Node invocation of `scripts/check-isolated.mjs`: **213/213**, zero failures or skips. Final log: `tmp/adapter-final-suite.log`; complete suite: `tmp/v-ptg6Of/suite.log`.
- Direct bundled Node invocation of `node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `git diff --check`: exit 0.
- `git diff --quiet -- raw artifacts runs public/artifact-integrity.json`: exit 0 for tracked preserved data. Previously untracked run directories remain present; they were not generated or deleted in this round.
- Integrity pin SHA-256 remains `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`.
- Actual production reader/export core ran in the cached local Supabase Edge runtime without a Buffer shim. All three preserved versions matched every output file and exact TAR bytes. The runtime's measured shutdown CPU times were 102/72/57 ms, with captured total memory about 28.4/32.3/29.3 MB. These are local worker observations, not a hosted guarantee or peak RSS.
- Explicit synthetic fixtures producing about 10.3 MB and 25.3 MB of output survived the local configured worker limits, with 226/502 ms shutdown CPU and approximately 66.4/132.1 MB captured total memory. These fixtures do not become public records and do not establish a production cap.

Durable measurement evidence: `guest-export-core-edge-results-2026-10-12.json`. The probes predate the later prepare/finalize seam. Test container `trrc-edge-core-20261012` was stopped and removed; Docker and unrelated containers were left alone.

## Failed during development, resolved

- Source-reference validation and saved-record mutation tests first reproduced failures; patches were supplied by the original implementer and then passed.
- One new continuation test expected `SOURCE_HASH_MISMATCH` after changing legacy v1 source bytes. The actual loader correctly withdrew verified provenance and returned `SOURCE_PROVENANCE_CONFLICT`. The test now asserts that exact legacy refusal and zero publication; implementation was not relaxed. Full suite subsequently passed.

## Independent review and remaining gaps

Fable's bounded reviews passed with integration gaps disclosed: `review-2026-10-12-export-core-fable.md` and `review-2026-10-12-export-continuation-fable.md`. Reviewer execution was unrun; Codex ran the gates above.

**D1 remains open:** hosted acquisition request/response evidence from C0–C7 is not yet incorporated into the preparation journal's fixed load-evidence shape. Existing local acquisition records include requests/outputs. Resolve this deliberately before wiring hosted collection; never discard that evidence to satisfy journal equality.

Publisher implementations must promote exactly the expected file set. There is no implemented Storage publisher, journal ownership service, SQL transaction, quota enforcement, guest API or browser save workflow in this checkpoint.

## Blocked and unrun

- **Blocked acceptance:** hosted guest collection cannot be accepted until acquisition evidence, owned journal/staging, storage integrity, quotas/retention and request-specific UI integration are implemented and independently reviewed.
- **Unrun:** prepare and finalize across separate actual Edge isolates; hosted CPU/memory profiling; real-source acquisition adapter parity; Storage/SQL interruption and ownership tests; guest browser walkthrough; latest browser rerun. Earlier browser results are separate evidence, not proof of guest functionality.
- **Unrun:** a new explicit v2 source-hash mutation continuation case. Existing suite/source-loader hash checks pass, but the newly added source-mutation continuation test exercises legacy provenance refusal.

Next bounded session: close D1 with preserved acquisition evidence, add the explicit v2 corruption case, run separate-isolate preparation/finalization against all preserved versions, then decide whether feasibility gates support implementing guest services. Keep Supabase Free only and do not deploy or change permissions.
