# ADR 005 — Evidence package v2: additive files, unchanged v1 contract

Date: 2026-10-30. Status: accepted for Phase 6 (RRC-17, E06). Owner rulings 2026-10-30: local only, the package is the existing v4/v5 file sets, and the sender gate lifts only after Analytics merges its receiver. Builds on [ADR 003](003-local-analytics-browser-handoff.md) (transport) and [ADR 004](004-wellbore-identity-and-relations.md) §3 (relations), and applies D10 as revised in the v1.1 review.

## Context

The Analytics transfer (ADR 003) was agreed for query version 2. Query versions 3 to 5 add files for test reports, wellbore records and relations, and the sender has refused them as "local only" since Phase 2.

The Analytics receiver pins the v2 acquisition exactly: its targets, its scope keys, its source list and `transformation_version`. So a newer package fails there even though every one of its files is declared in `manifest.files`. The problem is a pinned contract per query version, not tolerance of extra files.

On 2026-10-30 Analytics reported an unmerged receiver (`well-injection-insights`, branch `feature/phase-1b-test-records`, commit `b48ce03`). It accepts the legacy pin, v2 and v4. It refuses v3 and v5 with "Unsupported Explorer query version: <n>". It accepted the real Barbaro 23 v4 package (`rrc-2026-10-30-uic000125182-d04894d1-…`), re-deriving the test files from hashed raw rows.

## Decision

### 1. What package v2 is

Evidence package v2 is the whole-version TAR of a query version 4 or 5 artifact, exactly as committed. Nothing new is collected or added for Phase 6.

- `manifest.schema_version` and `normalized.schemaVersion` stay `1`. `normalized.json` keeps exactly its seven v1 keys.
- Every TAR member is `manifest.json`, `normalized.json`, `version-pins.json` (all non-legacy versions), or a file declared in `manifest.files` or `manifest.sources[].raw_file` with its SHA-256 and byte count. There are at most 100 declared files; v5 has 63.
- The additive files are the v3 test files (`tests.json`, `tests_bhp.csv`, `tests_srt.csv`, `tests_dictionary.json`), the v4 wellbore files (`casing.json`, `casing.csv`, `plugging.json`, `plugging.csv`, `wellbore_dictionary.json`) and the v5 `evidence_relations.json`, together with their raw `sources/` files.
- Stable keys are the source record and row keys and the kind-tagged relation keys already in these files. No selection state, page anchors or layout enters a package (D10 revised).
- The PRD's other E06 contents wait for the phases that produce them: area-of-review settings (Phase 5), page anchors (E12-lite) and a missing-prerequisites list.

### 2. Transport is unchanged

The channel stays `swd-explorer-handoff` version 1. The `offer` already carries the package, manifest and normalized hashes and the whole-version scope, so no message, field or timeout changes. Nobody bumps `version:1` for Phase 6.

### 3. Who verifies what

Explorer guarantees and tests the package shape (`test/package-contract.test.mjs`):
- members equal the declared set, and hashes and byte counts match;
- each query version carries its own `transformation_version`, and its true query version in every sidecar;
- v5 differs from v4 only by the closed delta in §4;
- `evidence_relations.json` is re-derived byte for byte from the package members alone.

Analytics owns acceptance. Each query version it accepts must be verified against its own pinned contract, and every other version must be refused. Explorer never asks Analytics to "allow extra files".

### 4. Query version 5 contract (sent to Analytics on 2026-10-30)

v5 is v4 with this closed delta. Everything else is structurally identical to v4. Fields that belong to one collection differ as they do between any two collections: `artifact_id`, `selection`, the normalized payload hash, per-source retrieval data (`retrieved_at`, `sha256`, `bytes`) and values bound to the UIC, API or reporting window.

| Field | v4 | v5 |
|---|---|---|
| `manifest.scope.query_version`, acquisition `scope.queryVersion` | 4 | 5 |
| `manifest.transformation_version` | `rrc-odp-v2.2.0` | `rrc-odp-v2.3.0` |
| `manifest.limitations` | v4 list | v4 list plus one appended string (`src/artifact.mjs`, v5 block) |
| `manifest.files` | v4 entries | v4 entries plus `evidence_relations.json`, appended last |
| `tests.json`, `casing.json`, `plugging.json` `scope.query_version` | 4 | 5 |

The scope keys, the 21 acquisition targets and the 22 `manifest.sources` entries keep the same names and order. For the same well and window, the target URLs and the scope values other than the query version are equal. This was checked on 000109605 v4 and v5.

**Re-deriving the relations.** Run `src/relations.mjs` (pure, no imports; file SHA-256 `88b43327612adc584119ae430588151bd3a7394ff3919d159d83c3984795a648` at `b67fe5c`):

```
buildRelations({
  artifactId: manifest.artifact_id,
  scope: <sources/acquisition.json>.scope,
  inventory: normalized.inventory,
  monthly: normalized.injectionMonthly,
  testRows: {bhp: <tests.json>.bhp, srt: <tests.json>.srt},
  wellboreRows: {
    casing: {link: <casing.json>.link, rows: <casing.json>.rows},
    plugging: {link: <plugging.json>.link, rows: <plugging.json>.rows}
  },
  sources: manifest.sources
})
```

Serialize the result as `JSON.stringify(result, null, 2) + "\n"` and compare those bytes with the file. On TRIPPET v5 (`rrc-2026-10-30-uic000109605-b7628a71-…`) this gives SHA-256 `40ef1b1c9fd7c7fae5807d88188240b2d914303d98d0da37428e946c5248d9f1`, matching the manifest.

### 5. Sender gate

`localOnlyVersion` (`public/app.js`) currently refuses every query version of 3 or more. It becomes an allow list of the query versions the merged receiver accepts: the legacy pin and 2 today; 4 once Analytics merges `b48ce03` or its successor; 5 once Analytics merges its v5 delta. v3 stays local only. The receiver refuses it, and every UIC collected at v3 also has a newer v4. The gate changes in its own PR, followed by a real two-window walkthrough.

**2026-10-30:** Analytics merged and pushed receiver `b48ce03` (`well-injection-insights` main, a fast-forward; confirmed on GitHub). The sender now offers `ANALYTICS_QUERY_VERSIONS = [2, 4]` plus the legacy pin.

### 6. Local only

The hosted site keeps v2 only. `scripts/prepare-supabase-archive.mjs` keeps skipping versions of query version 3 or more (D7), and ADR 003 keeps its fixed local origins. A hosted transfer needs its own decision, a hosted origin contract and a review of D7.

## Consequences

- No committed artifact, source pin or query version changes.
- Analytics can verify v5 with no Explorer code beyond one pure module, copied verbatim and pinned by hash. That is the same pattern it already uses for the test normalizer.
- Until the receiver is merged, new local collections (v5) still cannot be sent to Analytics. Barbaro 23 (v4) can be sent as soon as the v4 gate lifts.
- Acceptance is complete when, on the real receiver: the legacy pin and a v2 package open unchanged; v4 and v5 packages are accepted; a tampered v5 is refused; and the local transfer is walked through in a browser with recorded evidence. Hosted acceptance is deferred (§6).
