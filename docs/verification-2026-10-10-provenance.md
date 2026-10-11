# Fixture provenance correction — October 10, 2026

This separately authorized fix closes the fixture-to-public promotion defect recorded by the independent review and left open by the October 9 UI revision. It does not close full application acceptance or the other parser/QC findings. The fixed stop deadline is **2026-10-10 02:02:41 UTC**; work completed before that deadline, without restarting it.

## Scope and contract

The before-edit allowlist was `src/artifact.mjs`, `src/pipeline.mjs`, `src/acquisition.mjs`, `src/runEvents.mjs`, `public/workflow.js`, focused `test/provenance.test.mjs`, this dated report, and isolated evidence under `tmp/provenance-verification/`. No normalization, UI layout, sibling source, original raw/artifact/run file, or pin was changed. No helper agent, live refresh, commit, push, deployment or permission-setting change was performed.

Read inputs: owning AGENTS/README/SPEC/SOURCE_PROOF/GATES, the shared delegation workflow, approved Explorer PRD and architecture contract, completion-plan E1/E3, the independent review's `fixtureTag`/probe implementation, and `docs/verification-2026-10-09-ui.md`. Systematic debugging, test-driven development and verification-before-completion skills were applied.

| Requirement | Narrow correction |
|---|---|
| RRC-01 | Acquisition preserves fixture classification in each retrieval sidecar; injected responses still require fixture mode. |
| RRC-04 | Fixture dictionaries label source fields synthetic; calculated fields retain their formulas and fixture input provenance. Existing row/QC calculations are unchanged. |
| RRC-05 | New immutable manifests carry classification. Fixture exports cannot advertise verified public history; the actual Analytics validator rejects them. |
| RRC-10 | Loaded source classification reaches stage evidence and the terminal run record; fixture invocations, including separate CLI replays and failed loads, stay outside actual history. |
| RRC-06 / RRC-09 | Latest UI preserved; workflow validation accepts truthful added provenance and redacts the two new safe error messages. No map stages or controls added. |

## Reproduction and resulting classification

Before the fix, an injected-response collection with `testFixture:true` wrote its acquisition marker. A separate `exportArtifact` invocation with default options lost that marker in `loadSnapshot`; its manifest claimed `verified_bounded_linkage`, dictionary fields claimed `public reported`, and its recorder used `testFixture:false`. The independent review recorded the same direct load/build loss.

Eight focused regressions now exercise actual loading, normalization, construction, publication/comparison, CLI and history paths:

1. Fixture acquisition followed by separate default API and CLI exports: `test_fixture`, manifest `testFixture:true`, dictionary `synthetic`, calculated fields `calculated`, no actual-history record.
2. Older explicit fixture acquisition marker: retained through direct load/build.
3. Approved legacy public sample: `public_reported`; every rebuilt artifact byte matches the existing version; its scratch history is public.
4. Unknown retrieval evidence and contradictory classifications: export refused. Unknown direct construction is also refused.
5. Removed fixture acquisition marker with classified sidecars: still a fixture.
6. Failed fixture acquisition replay: failed fixture record returned, no actual-history entry.
7. Removed marker plus malformed response body: sidecars are examined before response parsing; failure remains a fixture.
8. Complete public acquisition evidence replay, grounded in the SOURCE_PROOF sample: public new version and identical separate replay; removing its acquisition marker makes its provenance unknown and export fails.

Unknown evidence is never inferred public from an official-looking URL, identifier, row count or successful linkage. A mixed true/false marker/sidecar classification is a conflict. Explicit caller fixture mode may restrict an export; caller false/default cannot override recorded fixture evidence. A failed invocation with unknown provenance may remain a diagnostic attempt, but cannot publish a dataset or persist a successful public run.

The approved pre-instrumentation public sample has no acquisition marker. Its compatibility exception requires the exact SHA256 of the sorted fourteen `[filename, SHA256(bytes)]` pairs (seven responses and seven retrieval sidecars): `d7ba231188dfcc5afb182933247fbbc648d4eaa22aa12b73b67233c7da8ffc62`. Individual evidence hashes are retained in `tmp/provenance-verification/preservation.json`. Only the original artifact ID with this exact public evidence omits the added manifest fields, preserving its existing immutable bytes. Other legacy/unknown evidence requires review rather than automatic public classification.

## Gates and preserved evidence

The faithful test copy is `tmp/provenance-verification/snapshot`. Test-generated source directories, artifacts and runs remain isolated there. The initial sandbox reproduction encountered `EPERM realpath`; normal approved local execution was used for actual filesystem/localhost gates. No filesystem permissions or security controls were modified or bypassed.

| Check | Result / evidence |
|---|---|
| Before-fix `node --test test/provenance.test.mjs` | **FAILED as expected: 0/5.** Missing fixture/source classification and missing unknown-provenance rejection; `tmp/provenance-verification/before.txt`. |
| Initial sandbox version of that command | **FAILED: 0/5.** Includes `EPERM realpath`; not passing application evidence; `before-sandbox.txt`. A subsequent sandbox attempt also hit that restriction (`after-sandbox.txt`). |
| `node --test --test-name-pattern='failed fixture replay' test/provenance.test.mjs`, before error-path fix | **FAILED as expected: 0/1**, `false !== true`; `failed-fixture-before.txt`. |
| `node --test --test-name-pattern='markerless replay' test/provenance.test.mjs`, before early-sidecar fix | **FAILED as expected: 0/1**, `false !== true`; `markerless-before.txt`. |
| Final full direct-Node suite below | **PASS: 46/46**, including all eight provenance regressions and the separate fixture CLI invocation; `full-suite.txt`. |
| `node ../consumer-check.mjs` from the test copy | **PASS.** Actual Analytics source validator rejects the fixture, accepts the unchanged approved public artifact and a public replay; actual consumer pin and all eleven inventoried files verify; `consumer-check.json`. No sibling writes. |
| `node --check` on four changed source modules, `public/workflow.js`, `test/provenance.test.mjs` | **PASS: 6/6.** No dependency/type-check/lint setup is introduced. |
| `node tmp/provenance-verification/verify-preservation.mjs` from owning root | **PASS.** 77/78 baseline files unchanged; the only expected baseline change is `public/workflow.js`. All 54 original raw/artifact/run files retain exact bytes and file membership; both browser pins, seven other UI files, thirteen consumer artifact files and its pin also retain exact bytes. |

Full suite command, run from the isolated snapshot:

```powershell
node --test test/acquisition.test.mjs test/browser-artifact.test.mjs test/history.test.mjs test/inspection.test.mjs test/normalize.test.mjs test/run-events.test.mjs test/server.test.mjs test/versioning.test.mjs test/presentation.test.mjs test/provenance.test.mjs
```

Unchanged public pins:

- Artifact: `rrc-2026-10-09-uic000020838-v1`.
- External manifest: `3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f`.
- Normalized JSON: `4f243138c833f09a5be6a970e85f76f3f73e95040c69677a10b8c3b2fe03ca5b`.
- Monthly CSV: `1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3`.
- Public anchors remain 5 inventory rows / 28 reports, January 2024 17,173 bbl and February 2024 17,927 bbl / 29 days.

Tooling corrections: an early shared-document read used the umbrella working directory and failed; it was corrected to the owning root. Two scratch copy/move commands used the wrong working directory and failed without changing application files; corrected calls succeeded. The initial sandbox log was briefly written in the umbrella directory and moved into the owning evidence directory. Preservation checks confirm no original data/run file was added or changed.

## Remaining judgment and coverage

- Review the intentional, exact-byte legacy exception in `src/artifact.mjs:8` and the new-public evidence rule. Local acquisition/sidecar metadata is evidence, not a cryptographic assertion from the remote publisher.
- Protected existing artifacts and history were not migrated or repinned. A conflicting earlier fixture artifact version must receive a new ID; this fix refuses replacement. No fresh public acquisition or browser screenshot round was performed. The previous UI screenshots/evidence remain available, and the seven visual/presentation files are byte-identical.
- Other independent-review findings remain open: equivalent reporting timestamps can evade duplicate-period detection, missing report IDs, permit/depth validation, incomplete query-predicate validation, and weak QC-count shape checks. This focused change does not claim full correctness or integrated acceptance. Independent review/integration remains Main's gate; this implementer did not spawn reviewers.
