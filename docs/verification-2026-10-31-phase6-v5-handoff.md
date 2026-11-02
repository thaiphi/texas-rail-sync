# Phase 6 proof: v5 transfer to Analytics (RRC-17), 2026-10-31

Scope: the local two-window transfer and the tampered-v5 refusal under [ADR 005](adr/005-evidence-package-v2.md) §5, after Analytics merged its v5 receiver. It follows the [v4 walkthrough](verification-2026-10-30-phase6-v4-handoff.md). Hosted transfer is out of scope (ADR 005 §6).

## Setup

- **Receiver.** The Analytics receiver at `thaiphi/well-injection-insights` main `227ebab`, a fast-forward from `b48ce03`. I confirmed on GitHub that main points to this commit. The Analytics session served it on `http://127.0.0.1:4290` with `node ../node_modules/typescript/bin/tsc -p tsconfig.json && PORT=4290 node scripts/serve.mjs`. It rebuilds `evidence_relations.json` with a pinned byte copy of `src/relations.mjs` (SHA-256 `88b43327…a648`, unchanged on Explorer main).
- **Sender.** Explorer from branch `phase6/v5-gate` (`ff01f32`, `ANALYTICS_QUERY_VERSIONS = [2, 4, 5]`), served with `node scripts/serve.mjs 4391`.
- **Browser.** Chrome in a fresh isolated profile, driven by Explorer through Chrome DevTools. The Analytics session did not touch the windows.

## Results

The v2 and legacy-pin rows were added on 2026-11-02, after review noted that RRC-17's acceptance includes them. Analytics served main `9f2ce40` for that run; it adds only a walkthrough record to `227ebab` and changes no code.


| Version | Explorer button | Receiver | Adoption |
|---|---|---|---|
| TRIPPET v5 `rrc-2026-10-30-uic000109605-b7628a71-…` | enabled | "Validation passed": `rrc-odp-v2.3.0`, schema 1, 63 verified files, 16 monthly rows (16/16 accepted), 22 preserved sources | confirmed |
| Barbaro 23 v4 `rrc-2026-10-30-uic000125182-d04894d1-…` | enabled | "Validation passed": `rrc-odp-v2.2.0`, 62 verified files, the same three hashes as on 2026-10-30 | confirmed |
| 000020838 v2 `rrc-2026-10-10-uic000020838-7aecd619-…` (run on 2026-11-02) | enabled | "Validation passed": `rrc-odp-v2.0.0`, 25 verified files; package `69a93781…05f8`, manifest `7271eb48…89cc`, normalized `50c4acc8…03cf`, each matching Explorer | confirmed |
| Legacy pin `rrc-2026-10-09-uic000020838-v1` (run on 2026-11-02) | enabled | "Validation passed": `rrc-odp-v1.0.0`, 11 files; package `492ebaa6…db8a` (the same as on 2026-10-30), manifest `3a523cad…f61f`, normalized `4f243138…ca5b` | confirmed |
| 000020838 v3 `…-a8606089-…` | disabled: "Query version 3 is not sent to Analytics. Its receiver accepts query versions 2, 4 and 5 and the original pinned version (ADR 005)." | not offered | — |

**TRIPPET v5 hashes.** The receiver displayed three hashes, and each matches Explorer:

| Hash | Value | Matches |
|---|---|---|
| Package | `6bffedb175d236017b881f46bd742d91ece3a389df11c4fcff030340ad36e881` | `/api/versions/<id>/download` |
| Manifest | `89586fc14a58cb770cb282ffaf3b453728a13be8b4c643ff09a95e708b5d6308` | committed `manifest.json` |
| Normalized | `730842843acc2fd4a6ce6c169335b78d9d7fd64ddf10ef7857d3237cb886aeda` | committed `normalized.json` |

The TAR has 66 members: the 63 declared files plus `manifest.json`, `normalized.json` and `version-pins.json`. Its `evidence_relations.json` is `40ef1b1c…48d9f1`, the hash the producer contract test re-derives.

**Adoption.** The receiver reported "Adopted … for this browser session. Refresh restores the original stored pin; no server files were changed."

## Tampered v5 refusal

Both files were built from the downloaded TRIPPET v5 TAR with same-length, in-place edits, so TAR headers and sizes are unchanged. Each was chosen through the receiver's manual import ("Choose Explorer package (.tar)").

| Tampering | Receiver |
|---|---|
| One byte flipped in `evidence_relations.json` (`scope.source_api_id` `38934609` → `38934608`); nothing else changed | "Package rejected: Explorer evidence hash or byte count mismatch: evidence_relations.json. Your current dataset and stored pin are unchanged." |
| The same edit, re-hashed: `manifest.files`, the manifest inside `normalized.json`, and both hashes in `version-pins.json` updated to match | "Package rejected: evidence_relations.json contradicts its re-derivation from package records and sources. Your current dataset and stored pin are unchanged." |

The first refusal is the hash check. The second shows that a consistently re-hashed relations file is still refused, because the receiver re-derives it from the package's records and sources.

**Network.** Each page loaded resources only from its own origin (4391 or 4290).

## Not covered here

- **A v5 package for a well whose wellbore was not queried** (`source_api_id` null, `not_queried` sidecars). No such version exists; all six committed wellbore versions returned rows. Making one needs a new acquisition run, which this phase did not authorize. Analytics also has no test for it; by code reading it accepts that shape.
- **Other receiver-side v5 cases** (a v4 manifest declaring `evidence_relations.json`, a wrong last limitation, a forged link `source_api_id` with matching relations) were reported by Analytics from their own tests. They were not rerun here.
- **Hosted transfer:** deferred.
- **Screen reader:** not run.
