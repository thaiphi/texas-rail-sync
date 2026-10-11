# Current core verification

**Latest navigation redesign:** The [preservation matrix](docs/feature-preservation-2026-10-10.md), [dated verification](docs/verification-2026-10-10-navigation-redesign.md), [independent review](docs/review-2026-10-10-navigation-redesign.md) and [screenshots](docs/screenshots-2026-10-10-navigation-redesign.md) describe the four global activities and six dataset tabs. Read the dated packet for exact frozen-source checks and unverified mobile/browser states. Historical mobile passes below do not certify this redesigned layout. Existing data/export/consumer contracts remain unchanged; no deployment or consumer adoption is performed.

**Latest integrity round:** [Three-defect repair evidence](docs/verification-2026-10-10-integrity-fixes.md) and [fresh independent review](docs/review-2026-10-10-integrity-fixes.md) supersede earlier acceptance of fixture classification, normalization output evidence and direct-builder value fidelity. Production tests pass 103/103; unchanged independent probes pass 47/47. No scoped finding remains at the recorded hashes; whole-project acceptance remains separate.

**October 10 current round:** [Validation and bounded-collection acceptance packet](docs/verification-2026-10-10-acceptance.md) supersedes earlier fixed-only collection, browser-download and pending-review statements only where it supplies explicit newer evidence. The five validation defects passed independent review. A new real public version, whole-artifact consumer verification, complete browser-saved TAR and preserved original pins are recorded there. Whole-project acceptance, production delivery and consumer adoption remain separate.

The October 9 completion window adds immutable explicit exports, actual recorded history and the read-only map/full inventory inspection. See [the current core packet](docs/verification-2026-10-09-core.md) and [criterion tracker](docs/requirements.md). Dated results below remain historical; the newer packet identifies which gaps it closes. Full integrated/independent review and delivery are still open.

# Verification record — October 9, 2026

**Current download status:** verified. The owner-confirmed saved CSV matches the pinned source byte hash; see the final follow-up below. Earlier incomplete automation attempts are historical.

Local preview is available at http://127.0.0.1:4176, command `node scripts/serve.mjs 4176`. Root restarted it after the independent Analytics check below. This is a local preview, not a deployment.

## Passed checks

| Gate | Actual command/action | Result |
|---|---|---|
| Runtime | `node --version` | PASS: v24.13.0 |
| Offline export | `node scripts/export.mjs` | PASS: five inventory records, 28 monthly rows, 28 exact UIC parent matches, zero unmatched/ambiguous/quarantined monthly rows |
| Focused tests | `node --test test/normalize.test.mjs` | PASS: 7/7, including original string identity, zero/missing/parse failure, leap year, duplicate/revision quarantine, unmatched/invalid data, source anchors and source/artifact SHA256 |
| Browser JS syntax | `node --check public/app.js` | PASS |
| Acquisition script syntax | `node --check scripts/acquire.mjs` | PASS |
| Public source acquisition | Bounded Node fetches to official ODP datasets and three official RRC documentation URLs, with sandbox escalation | PASS: actual source responses and retrieval metadata preserved; source URLs, hashes and independent anchors in SOURCE_PROOF.md |
| HTTP content | Escalated Node fetches against `/`, `/app.js`, `/style.css`, `/artifact-path.json`, `/artifacts/rrc-2026-10-09-uic000020838-v1/normalized.json`, and `/artifacts/rrc-2026-10-09-uic000020838-v1/sources/uic-manual.pdf` at port 4176 | PASS: all six HTTP 200, PDF 1,077,385 bytes |
| Chrome visual inspection | CUA Chrome opened port 4176; screenshot and accessibility state inspected | PASS: five inventory records, 28 matched monthly rows, original parent identity, separate average/max psi and Jan/Feb values visible |
| Chrome search and selection | Entered `000022085`, selected BRINE SALVAGE PLANT, then restored `000020838` | PASS: one of five filter result; explicit History not acquired message; verified parent restores 28-row history |
| Chrome mobile layout | Root inspected a 390×844 viewport and read page/table dimensions | PASS: document width 375 px with no horizontal page overflow; the 773 px monthly table is contained in a 327 px scroll region; viewport override reset |
| Chrome keyboard interactions | Typed the UIC search, used Tab through county/inventory, Space to select, then restored the acquired parent and tabbed into the monthly table | PASS: selection updates identity and shows History not acquired for the unqueried parent; restored parent has 28 rows; table takes keyboard focus and scrolls vertically |
| Deterministic re-export | Node SHA256 snapshot of all six top-level artifact files, `spawnSync(process.execPath,['scripts/export.mjs'])`, compare all six hashes | PASS: byte-identical offline re-export; no network query |

Final external manifest SHA256: `3a523cadca4c7a35d667ccd53629d63e5afc6de382be670cba1d61743baef61f`.

Final normalized.json SHA256: `4f243138c833f09a5be6a970e85f76f3f73e95040c69677a10b8c3b2fe03ca5b`.

The final manifest additionally hashes a canonical typed JSON payload excluding its embedded manifest, avoiding a circular hash. Source titles were added from official metadata. These final metadata changes did not alter CSV values or raw source bytes; main was notified to recopy and repin the artifact. The exporter reproduces these final bytes.

## Failed or incomplete attempts and corrections

- Initial sandbox public fetch FAILED: `getaddrinfo ENOTFOUND api.us.socrata.com`. Authorized escalation succeeded for bounded official public reads.
- One metadata fetch FAILED with `UND_ERR_CONNECT_TIMEOUT`; subsequent bounded acquisition succeeded and preserved actual metadata.
- Initial sandbox local HTTP fetch COULD NOT RUN: `connect EACCES 127.0.0.1:4174`; an escalated attempt to the isolated server timed out. The server was restarted outside isolation at port 4176.
- First reachable server HTTP gate FAILED: `/ 404`. Root-path containment appended a separator to an already trailing-separated Windows root. The server now resolves its root first; all six HTTP checks passed after correction.
- IAB browser inspection COULD NOT RUN: initial timeout, then subagent visibility unsupported and `net::ERR_BLOCKED_BY_CLIENT` for localhost. CUA Chrome inspection succeeded.
- Browser CSV save/download gate INCOMPLETE: CUA `waitForEvent('download')` plus click was aborted after approximately 641 seconds. No downloaded-file validation is claimed. CSV bytes and manifest hashes passed filesystem tests; local raw PDF and JSON routes passed HTTP checks.
- Root follow-up CSV download FAILED to verify: the visible link click returned without an observable file in Downloads; `downloadMedia` timed out after 10 seconds. Inspection of Chrome's internal Downloads page was blocked by browser URL policy and was not retried through another surface. Browser download completion remains unverified; the already-passed filesystem export is separate evidence.

## Coverage limits

The mobile viewport and focused keyboard interactions above passed; a complete keyboard-only accessibility audit was not performed. Horizontal table keyboard scrolling passed in the focused follow-up below. No print/export-to-PDF browser gate or production deployment was performed. Portfolio return destination remains unconfigured because no verified URL was provided. No GIS, statewide source scan, original H-10 document revision ledger, source field-measurement validation or annulus acquisition is claimed. Node tests use test-only edge fixtures for quality behavior; the real-source acceptance evidence is the preserved official responses and independent real-row anchors. No Vitest, Python, npm/npx or Git writes were attempted. Analytics consumer integration and its later final pin check belong to the orchestrator; this record reports Explorer-local checks only.

## Focused follow-up: attachment delivery and keyboard table access

The existing CSV response was HTTP 200 with 5,513 bytes and SHA256 `1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3`, byte-identical to the pinned artifact. It had no Content-Disposition filename and no explicit Content-Length. This established that source/file delivery worked; it did not establish why the browser automation could not observe a completed save.

Download links now request `?download=1` and supply their actual filename in the download attribute. Only those artifact requests receive an attachment filename; ordinary app JSON fetches remain ordinary JSON. Responses include the exact byte length. The monthly overflow table is explicitly a named region with tabindex 0, a visible keyboard-focus outline and arrow-key guidance. No raw source, parser, artifact or identity values were changed.

| Gate | Actual command/action | Result |
|---|---|---|
| Regression before fix | `node --test test/server.test.mjs` | FAILED as expected: attachment header was null instead of `attachment; filename="inventory.csv"` |
| Complete Explorer suite after fix | `node --test test/normalize.test.mjs test/server.test.mjs` (escalated for local HTTP) | PASS 8/8; five CSV/JSON/PDF attachment responses match pinned bytes and length; ordinary JSON still parses with 28 monthly rows; HEAD has filename headers and no body |
| Syntax | `node --check scripts/serve.mjs`; `node --check public/app.js` | PASS |
| Running preview HTTP | Escalated Node fetch of port 4176 `injection_monthly.csv?download=1`, comparing Buffer bytes to the pinned file | PASS HTTP 200, 5,513 bytes, `attachment; filename="injection_monthly.csv"` |
| Immutable pin check | Node SHA256 of external manifest and normalized.json compared to the two pinned hashes above | PASS; both unchanged |
| Fresh browser state | CUA Chrome reload, read visible artifact DOM | PASS; six named download links use `?download=1`; named table region has tabindex 0 and 28 rows; no load error |
| Browser native attachment click | CUA link click with 3-second action timeout and 10-second tool cap; immediate page-state inspection | PASS interaction in 0.49 seconds; URL remains the Explorer preview, 28 rows remain and no app error. Final saved-file completion remains UNVERIFIED |
| Narrow keyboard overflow | CUA viewport 390×844; focus named table region and press ArrowRight then ArrowDown | PASS; table scrollLeft 40 px and scrollTop 40 px; active element names UIC 000020838 and visible solid focus outline. Document width 375 px, region width 327 px, content width 773 px. Viewport reset afterward |

Expected failing-test evidence before the fix:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected
+ null
- 'attachment; filename="inventory.csv"'
at TestContext.<anonymous> (test/server.test.mjs:14:10)
```

One inline Node HTTP/pin-check command FAILED before execution because PowerShell altered nested quote escaping: `SyntaxError: Unexpected identifier 'node'`. The corrected command completed PASS; this was a verification-command quoting failure, not an application result.

No unsupported download event wait or browser-internal Downloads inspection was retried. The browser automation still provides no verified saved-file path, so final browser save completion is explicitly open. HTTP attachment semantics, exact file bytes, source hashes and native link interaction are verified separately. The focused change does not claim a complete accessibility audit or deployment.

## Astra P2 follow-up: selected route-root containment

The old guard constrained decoded paths to the repository root, so Windows encoded-parent paths could escape `public/` or `artifacts/` and read a repository file. The server now selects the appropriate route root first, resolves the decoded relative path inside it, and requires that resolved target to remain under that exact root plus separator. Source/artifact bytes and hashes were not changed.

- Before-fix `node --test test/server.test.mjs` (escalated) — FAILED as expected: `/artifacts/%2e%2e%5cpackage.json?download=1` returned 200 instead of 404. Last failure details:

```text
AssertionError [ERR_ASSERTION]: decoded traversal must stay inside its selected route root
200 !== 404
at TestContext.<anonymous> (test/server.test.mjs:13:10)
generatedMessage: false
code: 'ERR_ASSERTION'
actual: 200
expected: 404
operator: 'strictEqual'
diff: 'simple'
```

- After-fix `node --test test/normalize.test.mjs test/server.test.mjs` (escalated for localhost) — PASS 8/8. Six encoded slash/backslash parent and cross-root cases return 404 without attachment headers. Normal CSV/JSON/PDF attachments remain byte-identical to the pinned files; ordinary JSON and download HEAD behavior pass.
- `node --check scripts/serve.mjs` — PASS.
- Escalated Node HTTP check against restarted port 4176 — PASS: `/` and the normal CSV attachment return 200; both reported encoded backslash traversal URLs return 404.
- Prior preview session 74630 was no longer registered (`Unknown process id 74630`). A process/listener check found no port 4176 listener or matching server process; no unrelated process was terminated. Preview was restored as session 57025.

Astra's earlier un-escalated server test could not bind port 4187 (`EACCES`); this worker ran the required network gate escalated and observed the PASS above. No additional browser save, accessibility, deployment or source-scope claims are made by this fix.

## Final connected check

Root stopped the identified Explorer preview process and verified port 4176 returned `ECONNREFUSED`. A fresh Chrome reload of Analytics at port 4173 still loaded all 28 public rows from its local pin and enabled JSON/CSV/SVG exports. The Explorer server was then restored. This verifies the two app runtimes are independent after the artifact handoff.

After all server/export changes, root ran `node --test test/normalize.test.mjs test/server.test.mjs` with localhost access: PASS 8/8. The real pinned artifact and all source hashes remain unchanged. Browser final save completion remains unverified; HTTP attachment bytes and named keyboard table scrolling passed.

## Owner-confirmed download follow-up

The owner subsequently supplied the actual browser-saved file at `C:\Users\thai.phi\Downloads\injection_monthly.csv`. Root verified its SHA256 equals the pinned artifact CSV: `1831e77daa33af7bcb49ee62d36d170c40031e2603b1e0015ae20144fe94f3a3`. The browser save completion gap above is now CLOSED. Earlier failed automation attempts remain historical evidence, not the current status.
