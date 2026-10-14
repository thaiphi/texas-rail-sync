# Real loader adapter checkpoint — October 12, 2026

Status: actual byte-reader loader and explicit Buffer imports implemented. Complete export adapter, hosted guest collection and browser saving remain unfinished. This is not acceptance of the product or of hosted feasibility.

After the owner identified the unfinished work, Opus 5.5/high proposed the narrow production patch; Main added failing regressions, applied the patch, and ran gates. Fable 5.1/high received the independent final review. Work remains TRRC-only, within the existing approximately 11:53 CDT deadline. No deployment, cloud change, permission/billing change, live collection or Git write occurred.

## Changed code

- `src/artifact.mjs`: exported trusted-server `loadSnapshotFromReader(readBytes)`; privately copy Uint8Array reader results before caching; preserve missing-object ENOENT behavior, existing private WeakMap proof, all checks and canonical output logic. Existing file loader is a wrapper around that entry.
- `src/artifact.mjs`, `src/lookup.mjs`, `src/acquisition.mjs`, `src/pipeline.mjs`, `src/versionArchive.mjs`: explicit standard `node:buffer` imports; no global mutation/shim.
- `test/reader-adapter.test.mjs`: no-global-Buffer behavior, legacy output byte equality, privately owned reader bytes after caller mutation, re-wrapped-reader brand refusal, and non-byte reader refusal.

The reader API has no new HTTP route. Future hosted services must supply trusted journal-verified bytes; no client-upload/public-branding feature was added. Input rows, calculations, quarantine rules, files/formats and pinned data remain unchanged. Filesystem export protections remain intact; its complete reader-based alternative has not been implemented.

## Gates

All executable commands used bundled `C:/Users/thai.phi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` directly.

| Gate | Result | Evidence |
|---|---|---|
| Before fix: `--test test/reader-adapter.test.mjs` | Expected FAIL, 0/3 | `tmp/reader-adapter-red.log`: absent global Buffer and reader export. Initial test path argument was corrected before establishing this baseline. |
| After fix: same command | PASS 3/3 | `tmp/reader-adapter-green.log` |
| `scripts/check-isolated.mjs` | PASS **189/189**, zero failed/skipped | `tmp/reader-adapter-full-suite.log`; complete log `tmp/v-a3kJyP/suite.log` |
| `node_modules/typescript/bin/tsc --noEmit` | PASS | Exit 0 |
| `git diff --check` | PASS | Whitespace |
| `git diff --quiet -- raw artifacts runs public/artifact-integrity.json` | PASS | Preserved tracked evidence unchanged |

UNRUN: local Edge rerun against these production changes, complete reader export/publisher/run-resume parity, full reader negative-case matrix on the production entry (earlier scratch evidence is not a fresh production run), finer realistic JSON memory profiling, hosted feasibility/quotas/migrations, browser saving and guest end-to-end. Existing scratch generators assert the old loader text and need updating to import/copy the actual new loader instead of extracting another prototype. Do not report those stale harnesses as production passes.

## Next work

Implement the shared reader-based export path while preserving every existing filesystem guard and run/failure invariant; prove outputs/pins/run evidence across real v1/v2 and fixtures. Re-run the actual adapter in the local Edge worker without a shim. Define fail-closed admission from realistic payload profiling before guest collection. The larger fixture memory failure and hosted no-deployment constraint remain open. Preserve all uncommitted work; no automatic commits or deployment.
