# Phase 6 proof: v4 transfer to Analytics (RRC-17), 2026-10-30

Scope: the local two-window transfer under [ADR 005](adr/005-evidence-package-v2.md) §5, after Analytics merged its v4 receiver. Hosted transfer is out of scope (ADR 005 §6).

## Setup

- **Receiver.** The Analytics receiver at `thaiphi/well-injection-insights` main `b48ce03`. I confirmed on GitHub that main points to this commit. The Analytics session served it on `http://127.0.0.1:4290` with `node ../node_modules/typescript/bin/tsc -p tsconfig.json && PORT=4290 node scripts/serve.mjs`.
- **Sender.** Explorer from branch `phase6/v4-gate` (`f9bc159`), served with `node scripts/serve.mjs 4391`. It listed all 12 preserved versions.
- **Browser.** Chrome, driven by Explorer through Chrome DevTools. The Analytics session did not touch the windows.

## Results

| Version | Explorer button | Receiver | Adoption |
|---|---|---|---|
| Barbaro 23 v4 `rrc-2026-10-30-uic000125182-d04894d1-…` | enabled | "Validation passed": `rrc-odp-v2.2.0`, schema 1, 62 verified files, 31 monthly rows (31/31 accepted), 22 preserved sources | confirmed |
| Legacy pin `rrc-2026-10-09-uic000020838-v1` | enabled | "Validation passed": `rrc-odp-v1.0.0`, 11 files, matches the trusted pinned digests | confirmed |
| TRIPPET v5 `rrc-2026-10-30-uic000109605-b7628a71-…` | disabled: "Query version 5 is not sent to Analytics. Its receiver accepts query versions 2 and 4 and the original pinned version (ADR 005)." | not offered | — |
| 000111186 v3 `…-fbee3ba0-…` | disabled, with the same message for query version 3 | not offered | — |
| 000111186 v4 `…-b477a317-…`, TRIPPET v4 `…-70983258-…` | enabled | not transferred | — |

**Hashes.** For Barbaro 23, the receiver displayed three hashes, and each matches Explorer:

| Hash | Value | Matches |
|---|---|---|
| Package | `d92ae4fd7af1f3021fd64b272641d80758a2f505c049ec9d8d2099c1a86553c3` | `/api/versions/<id>/download` |
| Manifest | `aada0de51b1827bf2a957a412ed2e3866e6e77bf56dfeaa6d35187493a43af12` | committed `manifest.json` |
| Normalized | `08614422a5ce15285529e93602be66e94fcbc46822f4ca17c76820c2a0a7c06d` | committed `normalized.json` |

**Adoption.**
- The receiver reported "Adopted … for this browser session. Refresh restores the original stored pin; no server files were changed."
- Explorer reported "Analytics reports that you confirmed this version for the current session. Default pins and recorded collection evidence are unchanged."

**Network.** Neither page loaded a resource from any origin other than its own (4391 or 4290).

## Not covered here

- **v5 acceptance and tampered-v5 refusal on the real receiver.** These wait for the Analytics v5 receiver, which its owner has not yet approved. Receiver-side tampering cases for v4 (an undeclared file, a tampered `tests_bhp.csv`, and a `tests.json` that contradicts its raw rows) were reported by Analytics from their own tests. They were not rerun here.
- **Hosted transfer:** deferred.
- **Screen reader:** not run.
