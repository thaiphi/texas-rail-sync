**Summary**
Rev 4 is coherent with the selected Supabase-Free direction and correctly refuses to call itself feasible, but it cannot be marked PASS: its G1 feasibility gate has no executable path that does not deploy, the adapter-parity scope omits filesystem couplings in `exportArtifact` that would break C8/C9, and the JS-versus-SQL transaction boundary, GET-mutation claim predicate and lane reaping are under-specified in ways that would be implemented wrong. Verdict: **REVISE**. Prior Node-revision reviews confer no approval on rev 4.

**Files touched**
None.

**Needs judgment**

BLOCK
- K1. G1 has no non-deploying execution path (spec §11 G1; §5 line 110-111). The spec's own sizing says realistic archives exceed 256 MB in C8 (loader cache `artifact.mjs:25-26`, `files` copy `:82-84`, `loadedEvidence` copy `:84`, `buildArtifact` private copy `:108`, returned `{...snapshot.bodies}` `:142`), so C8/C9 fit is the gating fact. Local Deno/edge-runtime numbers are indicative only and Node benchmarks are inadmissible; a platform measurement needs a throwaway function on the existing project, which the brief forbids. Correction: name the G1 executable (local `edge-runtime` as provisional; deployed profiling function as the real gate) and record that the owner must authorize that one deployment, or the design stays unproven.
- K2. Adapter parity scope is incomplete (spec §2 lines 37-41; §10). `exportArtifact` is filesystem-bound beyond `publish`: `pipeline.mjs:43` reads `acquisition.json` from disk, `:45` computes `relative(repositoryRoot,resolve(sourceDir))`, `:58` runs `bounded/realBounded(sourceDir)` unconditionally even with `providedSnapshot`, `:63` reads the manifest pin from disk, `:79` builds output paths from `outputRoot`. A `publisher` option alone cannot run C8/C9 on Edge. Correction: list every `exportArtifact` change (or a reader-based export entry) in §2/§10 and add them to G0 byte-identity checks.

HIGH
- K3. Transaction boundary (spec §3 lines 59-66). Steps 2-3 run in JS (`lookupTarget`, `validateSelectionEvidence` reading Storage via `lookup.mjs:42-57`); a `SECURITY DEFINER` RPC cannot execute them, so "all of this happens in one transaction" is false. Correction: Edge validates and reads evidence first; the RPC atomically re-checks token, replay, owner/age of `lookup_job_id`, quotas and reservation, and inserts; C0 re-validates selection under the lease. Same for C9 (§4 line 84): Storage objects are outside the SQL commit; state that a failed commit leaves private orphans never served, and reads after commit fail closed if an object is missing.
- K4. GET-mutation claim predicate (spec §4 line 91; §3 lines 69-73). A step may exceed the bridge's 120 s (`hosting-bridge.mjs:25`) while Edge runs to 150 s under a 180 s lease; the browser's retry GET must not bump `fence` or start a second step. Correction: claim only when no live lease (`lease_expires_at<now()`); an in-flight job returns state without claiming; prefer a POST advance route so the bridge's GET path (`hosting-bridge.mjs:3`) stays side-effect-free.
- K5. Lane liveness (spec §4 line 92). With no `pg_cron` (confirmed not enabled) nothing transitions an abandoned `running` job past `lane_deadline`; the single global lane blocks every guest. Correction: lazy reaping inside `enqueue`/claim before the partial-unique-index check.

MED
- K6. Reader error contract. `artifact.mjs:30-32` tolerates only `error.code==='ENOENT'`; the hosted reader must throw `ENOENT`-coded errors for absent journal entries or fixture/legacy branches diverge (G0).
- K7. Marker immutability (spec §4 lines 81,83; §5 line 98). `acquisition.json` is written twice (running→succeeded, `acquisition.mjs:33-34,52`) with a `runId` that must equal the resumed recorder's id (`artifact.mjs:79`); specify per-`(attempt_id,path)` journal mapping with latest-wins for the marker only.
- K8. Resumed recorder chronology. `workflow.js:33` rejects `time<lastTime`; cross-isolate clock skew can break `resumeRunRecorder`. Use DB `now()` for event timestamps.
- K9. Replay ordering (spec §3 step 4 after step 3). A valid replay whose lookup has aged past 24 h returns `LOOKUP_EXPIRED` instead of job state; move replay before the owned-lookup check.
- K10. RPC role resolution. `supabase-transport.mjs:12` sends only `apikey: sb_secret_…`; G3 must confirm `service_role`-only `SECURITY DEFINER` grants resolve for that key shape before relying on them.
- K11. Storage/egress. Name the usage source (e.g., `storage.objects` size sum) for spec line 101; add a per-token archive-download count, since 80 MB streams against an unstated Free egress allowance.
- K12. Run routes (spec §6). State that `GET …/runs/:runId` serves only the committed terminal record; journal `load running` events are never exposed as stage progress (RRC-10 terminal-only preserved).

Verified, no finding: fixed boundaries (§1) preserve pinned bytes and `trrc_archive` (`edge-bootstrap.mjs:7`); routing before the JWT check matches `edge-bootstrap.mjs:83-87` and `config.toml:6`; `index.ts:1-6` imports `src/` directly, so `src/archiveBytes.mjs` bundling is plausible but still G0; `normalize.mjs:1` `node:crypto` claim correct; browser §8 trust/handoff rules and limits match `archiveBytes.mjs:12,21`, `analytics-handoff.js:5,81`; §7 stages match `collection.js:37` semantics.

Blockers: K1, K2. Next smallest step (no deployment, no code): Main/Opus amend §2/§10/§11 for K2-K5 and name the G1 execution path; owner decides whether a single throwaway profiling function on the existing Free project is authorized for G1.

**Gates**
- Read-only checks (actual): rev 4 spec in full; `docs/verification-2026-10-12-backup-resume.md`; `GATES.md`; `supabase/config.toml`; `supabase/functions/trrc-explorer/index.ts`; `src/normalize.mjs:1-12`; prior-round reads of `src/*.mjs`, `src/hosted/*.mjs`, `public/*.js` and cited tests reused unchanged. Not read this round: `AGENTS.md`, `SPEC.md`, `SOURCE_PROOF.md`, the two prior Fable review files (own output), test bodies beyond earlier citations.
- Executable gates: all UNRUN here (G0–G6; Node suite, TypeScript, browser, Edge profiling, platform quota checks). Main's 186/186, TypeScript and 21 browser checks were not rerun.

Bounded review complete; slot released.
