# Guest adapter and feasibility gates — October 12, 2026

Later owner-triggered continuation: Docker became available. A cached local Supabase Edge image executed isolated prototype/resource tests; see `verification-2026-10-12-local-edge.md` and `guest-edge-local-results-2026-10-12.json`. The earlier daemon-startup blocker below is historical. Hosted profiling remains unverified; unmodified Buffer compatibility and a larger fixture's memory fit failed. No guest implementation began.

Status: independent design review completed with corrections; isolated Node loader parity passes. Complete hosted export parity and actual Edge feasibility remain unverified. Guest implementation is blocked, not accepted. Work resumed at approximately 10:53 CDT with a one-hour limit; the blocking gate was established earlier.

## Scope and roles

Owner selected the existing Supabase Free setup and prohibited deployment, billing and permission changes. Phi Analytics remains untouched. Production code, data contracts, calculations, quarantine reasons, source bytes, immutable versions, pins and exports were not changed. No collection, migration, cloud write, Git write, software installation or service startup occurred.

The backup workflow used Opus 5.5/high to prepare an isolated parity probe, Fable 5.1/high for independent document/evidence reviews, and Codex for integration and executable verification. At most two read-only CLI assignments were active concurrently. Main saved documents and the scratch probe; workers did not write product files. Existing subscription access was used without accepting paid credits or API billing.

## Design review and corrections

- Revision 4: independent **REVISE** verdict in `review-2026-10-12-guest-design-fable-revision4.md`. The exact reviewed design is preserved in `superpowers/specs/2026-10-12-guest-collection-browser-save-revision4-reviewed.md`.
- Revision 5: complete filesystem export couplings, JavaScript/Storage versus SQL boundaries, side-effect-free GET status, explicit POST advancement, live-lease fencing, lazy expired-lane cleanup, ENOENT semantics, frozen acquisition-marker mapping, database chronology, replay order, storage/egress admission and terminal run inspection were specified. These are proposed contracts, not implemented behavior.
- Independent revision-5 review is saved in `review-2026-10-12-guest-design-fable-revision5.md`. Its remaining chronology, service-role proof and orphan-cleanup sentences were added. Quotas remain provisional pending actual platform checks; no upgrade or cost assumption is authorized.
- Definitive G1 profiling is still blocked by the no-deployment boundary. Node figures do not establish production Edge feasibility.
- Final independent evidence review is in `review-2026-10-12-guest-gates-fable.md`: document residuals closed, loader-only partial G0 credible, full export/runtime gates unrun. Main clarified the maintenance lease wording. The original Opus probe author supplied the review's six additional negative cases and exact-code assertions; Main applied them only to scratch and reran. They passed; the reviewer inspected the earlier 19-check version, not this final 25-check rerun. No hosted/feature acceptance is claimed.

## Executed checks

All Node commands used `C:/Users/thai.phi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` directly. No npm/npx, Python or Vitest workaround was used.

| Check | Result | Evidence |
|---|---|---|
| `--check tmp/guest-adapter-parity-2026-10-12/probe.mjs` | PASS | Scratch probe syntax |
| `tmp/guest-adapter-parity-2026-10-12/probe.mjs` | PASS 25/25 checks, zero failures | Includes three Node diagnostic measurements; remaining 22 are parity/refusal/preservation checks. Initial 19/19 also passed; six review cases were then added. Durable output: `guest-loader-parity-results-2026-10-12.json`; scratch final output: `tmp/guest-adapter-parity-2026-10-12/final-run-output.json` |
| `--test --test-concurrency=1 test/validation.test.mjs test/provenance.test.mjs test/integrity-defects.test.mjs` | PASS 44/44, zero skipped | `tmp/backup-resume-targeted-2026-10-12.log` |
| `node_modules/typescript/bin/tsc --noEmit` | PASS, exit 0 | Direct compiler invocation |
| `git diff --quiet -- src public raw artifacts runs supabase` | PASS, exit 0 | Production and tracked preserved files unchanged |
| Scratch in-process fingerprints of `src/`, `raw/`, public pin/path files and all three tested artifact directories | PASS | Checks file names and bytes before/after; does not inventory unrelated ignored files |
| `git diff --check` | PASS | Documentation whitespace |

The loader prototype is extracted into a temporary module from the exact current `artifact.mjs`, with asserted transformation anchors. It retains that module's private WeakMap proof and canonical build logic, adds owned reader-result copies, and uses a file-loader wrapper. Network access is disabled. Only probe-owned paths under `tmp/guest-adapter-parity-2026-10-12/` are written; transient work directories are removed after their resolved boundary check. The official module is unchanged.

## Byte identity evidence

For the same artifact ID, original file loader, prototype file wrapper and prototype byte reader agree on raw bytes, inventory/monthly fields, sources, provenance, scope, normalized calculations, QC and output bytes. Rebuilt files also match the preserved files, with no extra on-disk files omitted.

| Version | Rebuilt files | Inventory / reports | TAR bytes | TAR SHA-256 |
|---|---:|---:|---:|---|
| Original pinned `rrc-2026-10-09-uic000020838-v1` | 13 | 5 / 28 | 1,325,056 | `492ebaa6b5f7c9353c39416dc72a1cf5180d1e9ba7a3af21d4b063c20e81db8a` |
| Preserved v2 UIC 000020838 (`7aecd619…`) | 28 | 1 / 28 | 1,393,664 | `69a9378185df7a1ecd8fe357d7d984eaf1b6258f4cc0b402c5f679f133f605f8` |
| Preserved v2 UIC 000056484 (`df804201…`) | 28 | 1 / 16 | 1,377,280 | `377721ac93c47313a9f5b58df2f581c9133cf9920ef74e390fef88392dbf6b9d` |

Negative cases retain fixture classification on failed loads, reject mixed classification and corrupt hashes, enforce fresh-parent identity and row caps, quarantine then refuse out-of-scope source rows, preserve missing values/duplicate months/invalid permit reasons, refuse fixture archives, reject non-byte readers, isolate mutated reader buffers and refuse JSON-forged/re-wrapped/cross-module brands or substituted bodies. Missing report-ID and quality-count regression coverage is in the 44 existing tests; the scratch fixture case tests a missing volume, not a missing report ID.

The final rerun additionally compares original-versus-reader refusal for selection ordinal tampering, selected lookup-hash mismatch, acquisition-target mismatch, sidecar host mismatch and sidecar query mismatch. Unknown provenance agrees at load and is refused by both builders. Fresh-parent and post-load substitution assertions now require the actual exact code/message rather than broad regex matches.

## Failed, blocked and unrun

**Failed environment probe:** installed `docker.exe version --format '{{.Server.Version}}'` exited 1: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine ... The system cannot find the file specified.` No daemon was started. Deno was absent from PATH and inspected bundled runtime directories. This is not a collector failure.

**Failed investigative reads:** `test/artifact.test.mjs` does not exist; the guessed path was not reused. A literal `test/bounded*.mjs` search was rejected on Windows; subsequent file inventory found the actual existing bounded tests. No stubs were invented. Web retrieval of Supabase's Markdown changelog was rejected for content type; read-only HTTP retrieval succeeded to ignored scratch. The local-development documentation page timed out. These failures do not imply runtime checks passed.

**BLOCKED — G1:** actual Supabase Edge CPU/memory/compatibility. Official limits remain 2 seconds CPU, 256 MB memory, and 150 seconds wall duration on Free: [Supabase limits](https://supabase.com/docs/guides/functions/limits). No existing local runtime is ready, and definitive platform profiling would require a separately authorized deployment. None is performed or requested as implicit approval. A later local Edge probe would be provisional, not hosted acceptance.

**UNRUN — remaining G0:** complete reader-based export entry, run recorder/resume equivalence, publisher/readback behavior, all filesystem coupling separation, Deno import/global compatibility, larger/cap-sized evidence and hosted storage-reader authorization. Passing the loader prototype does not waive these gates.

**UNRUN:** G2 actual remaining Storage/invocation/egress allowance and official-source reachability from Edge; G3 new private schema/RPC grants, real service-role resolution, migrations and quota/fencing races; G5 browser-local library; G6 hosted guest end-to-end collection and Analytics receiver handoff. No live collection was run. Existing receiver quarantine eligibility remains open.

The full 186-test suite and 21 browser checks in `verification-2026-10-12-backup-resume.md` are earlier baseline evidence, not rerun results from this phase. No UI changed, and no new browser acceptance or screenshots are claimed.

## Next step

Stopped early at approximately 11:13 CDT because the required Edge gate is blocked. All external Claude review/probe sessions were closed; no background assignment remains. No scope or timebox was silently extended.

Changed this continuation: selected design (revision 5), exact revision-4 design archive, revision-4/revision-5/final Fable review documents, this verification report, durable parity-result JSON, resume-status pointers in `verification-2026-10-12-backup-resume.md` and `CLAUDE-FALLBACK.md`. Ignored scratch contains probe code, transcripts/briefs and logs. The scratch harness is not a production adapter or a committed test addition; Git was not written. Pre-existing README/handover/hosting edits remain preserved.

Keep guest implementation paused. Finish any isolated complete-export adapter parity work independently of deployment, then obtain an executable Edge profiling path consistent with the owner's constraints. Do not replace a blocked gate with Node timing, weaken calculations/provenance, migrate, change permissions or enable paid resources. The selected design and this handoff preserve what remains unproven.
