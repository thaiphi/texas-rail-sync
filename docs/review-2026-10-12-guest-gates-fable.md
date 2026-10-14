**Summary**
Rev 5 now closes the three document residuals (K8 `startedAt`, K10 role-grant proof, orphan-cleanup trigger) at the design level. Opus's isolated probe is a credible partial G0 for the loader only: it derives the reader prototype from the live `artifact.mjs` text without touching `src/`, reproduces every preserved artifact file and whole-version TAR byte-for-byte on v1 and both v2 versions (v1 TAR `492ebaa6…db8a` matches the browser evidence), and shows failure/classification/brand parity across eleven refusal paths. It does not exercise `exportArtifact`, `publish`, run records or Deno, so it is not production proof; G1 remains BLOCKED and nothing here authorizes guest implementation or a profiling deployment.

**Files touched**
None.

**Needs judgment**

Document residuals:
- K8 — **CLOSED** (spec:43): hosted `startedAt` DB-assigned; first event ≥ `startedAt`; satisfies `workflow.js:28,33`.
- K10 — **CLOSED** (spec:186): G3 must prove the `apikey: sb_secret_…` shape (`supabase-transport.mjs:12`) resolves to the intended role and that anon/authenticated cannot invoke; explicitly unrun.
- Cleanup trigger — **CLOSED with one wording nit** (spec:86-87): maintenance step claims via the same CAS predicate, rechecks references, never touches live/publication/preserved objects. Nit: "unexpired-owner/fence" could be read as requiring an unexpired *guest token*, contradicting spec:73; replace with "lease-owner/fence". MED-low.

Probe assessment (`tmp/guest-adapter-parity-2026-10-12/probe.mjs`, `first-run-output.json`):
- Credible: extraction anchors must match exactly once (probe.mjs:58-63) and `src/artifact.mjs` sha256 is recorded (output:5); positive parity compares original loader, file wrapper and memory reader, normalization, built files, preserved bytes on disk and both archive builders (probe.mjs:101-113; output:27-63, `diskOnly:[]`); legacy v1 passes through the reader with `basis: source_proof_2026_10_09_exact_bytes`, which implicitly validates the ENOENT optional-marker contract (spec:36); failure parity compares `{code,name,provenance}` for both loaders (probe.mjs:128-131); brand forgery covers JSON clone, re-wrapped reader, cross-module brands both ways and post-load body substitution (probe.mjs:178-187); alias isolation fills reader buffers after load (probe.mjs:172-177); in-process fingerprints of `src`, `raw`, pins and all artifacts unchanged (output:200-213). Node diagnostics are labelled as non-Edge (output:69,83,97) — do not quote them as a limit pass.
- Weak assertions: probe.mjs:186 accepts any `/hash|source/i` message for post-load substitution; should assert `code==='SOURCE_HASH_MISMATCH'` (`artifact.mjs:99`). probe.mjs:141 matches on message regex rather than the exact `artifact.mjs:70` string.
- Missing failure coverage via the reader: `selection.json` tamper / lookup-hash mismatch (`artifact.mjs:66-69`), acquisition scope/targets mismatch (`:38`), sidecar URL/host mismatch (`:55-58`), unknown provenance (`:75-80`, only covered for the file path by `test/provenance.test.mjs`).
- Silent gap: `publishedFiles` (probe.mjs:92-96) re-implements `pipeline.mjs:75-77` instead of calling it, so pin derivation, `publish` byte-equality (`pipeline.mjs:22-40`), run-record shape (`pipeline.mjs:47,67-80` + `workflowView`) and `saveRun` refusal are untested — exactly the K2 export couplings (`pipeline.mjs:43,45,49,58,60,63,79,87-90`).
- Log `tmp/backup-resume-targeted-2026-10-12.log`: 44/44 are existing file-path tests (validation, provenance, integrity-defects); they are regression evidence for RRC-03/04/05, not reader-path evidence.

Conclusion: design residuals CLOSED; partial G0 credible as a loader-only prototype, needs the four reader-path failure cases and the stricter code assertions before being cited; not implemented production proof.

Required remaining gates (all UNRUN): G0 export entry (every `pipeline.mjs` coupling, `resumeRunRecorder`, run-record parity under `workflowView`); Deno/Edge compatibility of `node:crypto`, `node:util`, `Buffer`, `fetch` options; G1 Edge profiling — **BLOCKED** (no Deno on PATH, Docker daemon down, no deployment authorized); G2 platform/quota/egress; G3 migration and role-grant proof; G6 live collection.

Tiny remediation (optional, scratch-only): add to probe.mjs the four missing reader mutations listed above and tighten lines 141/186 to exact codes. The export-entry gate cannot be probed until the reader-based export entry exists; that is Opus's next isolated step, not an implementation authorization.

**Gates**
- Read-only checks (actual): rev 5 spec lines 43,50,86-87,107,186 via grep; `probe.mjs` in full; `first-run-output.json` in full; targeted test log; `artifact.mjs`, `pipeline.mjs`, `archiveBytes.mjs`, `workflow.js` from prior-round context.
- Executable gates: UNRUN by this reviewer. Main's `node --check` PASS, probe 19/19 (3 Node diagnostics), 44/44 targeted tests, and fingerprint preservation are Main's results, not repeated. No runtime, deployment, migration, cloud, Git, permission or paid action taken; subscription-only.

Final bounded review complete; slot released.
