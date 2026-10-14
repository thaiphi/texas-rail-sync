No further reads are needed: `pipeline.mjs`, `artifact.mjs` and `hosting-bridge.mjs` are already in context from the earlier rounds and the rev 5 text is complete.

**Summary**
Rev 5 addresses K2–K12 at the design level with text that matches the actual source lines; K1 is correctly recorded as BLOCKED with no deployment and no local Edge runtime, and Node figures are explicitly disallowed as an Edge pass. Two residuals remain (K8 `startedAt` ordering, K10 role-resolution proof) plus three newly introduced provisional caps that have no platform basis yet. Design-level verdict: **ACCEPT with residuals**; implementation verdict: **BLOCKED** (K1). No guest acceptance is granted.

**Files touched**
None.

**Needs judgment**

Per finding:
- K1 — **OPEN/BLOCKED, correctly stated** (§11 G1, spec:179). No Deno on PATH, Docker daemon unreachable, deployment forbidden; local `edge-runtime` later would be provisional only. Nothing in rev 5 may be read as runtime feasibility.
- K2 — **CLOSED** (§2 "Export entry", spec:41; §10 spec:165). Listed couplings verified against `pipeline.mjs:43,45,49,58,60,63,79,87-90`; `publish` at `:78` falls under the publisher. G0 (spec:177) now requires byte-identical artifacts/pins across every coupling.
- K3 — **CLOSED** (§3 spec:62-64; §4 spec:85). JS/Storage validation declared outside SQL; RPC re-checks atomically; orphan objects never served; post-commit reads re-verify.
- K4 — **CLOSED** (§4 spec:93,97; §3 spec:68; §6 spec:121,124). GET is read-only; `POST …/advance` claims only with no live lease; bridge allowlist change acknowledged (`hosting-bridge.mjs:3,12,17` constraints respected).
- K5 — **CLOSED** (§3 spec:73). Lazy reaping in enqueue and claim, reclaim only after lease expiry, finalization independent of the expired token.
- K6 — **CLOSED** (§2 spec:36). `ENOENT` contract matches `artifact.mjs:30-32`; owned byte copies stated.
- K7 — **CLOSED** (§4 spec:86). Markers are distinct content-hash objects; path mapping advances only under the fenced transition; `runId` equals the resumed recorder's (`artifact.mjs:79`).
- K8 — **CLOSED with MED residual** (§2 spec:42). DB-assigned timestamps are monotonic against the last event, but `workflow.js:28,33` also requires the first event ≥ `record.startedAt` (`runEvents.mjs:7`, set by JS at C0). Add: `startedAt` is also DB-assigned or the first DB timestamp is clamped ≥ `startedAt`.
- K9 — **CLOSED** (§3 spec:62). Token validity precedes replay; replay precedes the aged-lookup check and never charges quota.
- K10 — **OPEN (MED)**. §3 spec:49 and G3 spec:183 cover grants/`SECURITY DEFINER`, but nothing requires proof that the `apikey: sb_secret_…`-only request shape in `supabase-transport.mjs:12` resolves to `service_role` for the new functions. Add that proof to G3 before the migration is reviewed.
- K11 — **CLOSED, provisional** (§5 spec:105,112). `storage.objects` measurement reconciled with reservations; downloads disabled if egress cannot be verified. The 1 GB/month guest egress, 3 archives/token/day and "hard global token cap" are new scope with no platform figure behind them — treat as placeholders pending G2, not limits.
- K12 — **CLOSED** (§6 spec:121; §7 spec:132). Run routes serve only the committed terminal record.

New provisional scope flagged:
- Orphan deletion (§4 spec:85 "bounded lazy cleanup … removes unreferenced guest objects"). Trigger, fence condition and the rule that cleanup never runs under a stale lease are unspecified. MED: name the step that performs it and require the same CAS predicate as commit.
- G0 wording (spec:177) correctly limits Opus's scratch Node probe to partial parity; Edge built-in compatibility stays separate.

Residual verdict: no further REVISE round is required for the design text once K8/K10 sentences and the cleanup trigger are added; guest implementation remains blocked by K1 and by the unrun G0–G3.

Next smallest step within the no-deployment constraint: Main adds the K8, K10 and orphan-cleanup sentences; Opus's isolated parity probe proceeds as partial G0 only. Unblocking K1 requires a separate owner decision on a narrowly scoped profiling deployment; none is authorized here.

**Gates**
- Read-only checks (actual): rev 5 spec in full; `pipeline.mjs`, `artifact.mjs`, `hosting-bridge.mjs`, `workflow.js`, `runEvents.mjs`, `supabase-transport.mjs` from prior-round context. Not re-read: the rev 4 review file (own output), `SPEC.md`, `AGENTS.md`.
- Executable gates: all UNRUN (G0–G6). Main's 186/186, TypeScript, 21 browser checks and baseline-preservation diff PASS are Main's results, not repeated. No runtime, Docker, Deno, migration, cloud or Git action taken.

Bounded re-review complete; slot released.
