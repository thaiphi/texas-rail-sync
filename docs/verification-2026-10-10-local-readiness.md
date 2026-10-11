# Local readiness checkpoint — October 10, 2026

Scope: continuation of the readiness-only round authorized at 2026-10-10 23:01:08 UTC, actually begun at 23:02:00 UTC. Original hard stop remains 2026-10-11 00:01:08 UTC. This checkpoint does not declare public-release, whole-PRD or consumer acceptance. No live collection, data contract change, Analytics implementation, commit, push, deployment or permission change was performed in this round.

## Repairs and before/after evidence

| Defect | Before | After / regression |
|---|---|---|
| Failed version cannot retry through navigation | Failed request identity was treated like an in-flight request; returning from library left snapshot unavailable. | Track failed identity separately. Explicit navigation retries; internal route rendering and pending requests do not duplicate verification. `test/navigation-redesign.test.mjs`: returning-to-failed-version and in-flight verification tests. |
| Late dataset failure erases global history | Independent deferred-rejection probe reproduced `clearDataset()` after the user left for history, plus global workspace alert. | Clear associated run only while viewing workspace collection, and show workspace error only in workspace. Late-failure regression failed before repair and passes afterward. |
| Unverified dataset can retain old run selector | Browser inspection found prior run options still enabled after failed verification. New regression failed `false !== true` at selector-disabled assertion. | Clear/disable selector; block selection while dataset evidence is unverified. Invalidate pending response, restore on verified recovery, preserve independent global history. New regression and independent pending-response probe pass. |

Production changes: `public/app.js`, `public/workflow-ui.js`. Regression changes: `test/navigation-redesign.test.mjs`. Existing layout, source files, normalization, validation, export schemas and consumer contracts remain intact.

## Current gates

| Check | Result / evidence |
|---|---|
| `node --test test/navigation-redesign.test.mjs test/dataset-state.test.mjs test/version-race.test.mjs test/inspection.test.mjs test/presentation.test.mjs test/browser-artifact.test.mjs test/version-selection.test.mjs` | **PASS 34/34**, Main and independent reviewer after final repair. |
| `node --check` for every `public/*.js` | PASS; no TypeScript/lint gate is configured in package.json. |
| `node tmp/navigation-redesign-2026-10-10/preserve.mjs` | PASS: 166 protected files and 14 consumer files unchanged, with identical membership. Includes source bytes, preserved artifacts/runs and default pins. Consumer files were read only. |
| `node tmp/local-readiness-2026-10-10/download-check.mjs` | PASS: actual browser CSV byte-identical; all 13 original-version TAR entries byte-identical; failed-run JSON deep-equal to original recorded run. Evidence: `tmp/local-readiness-2026-10-10/download-check.json`. |
| `node tmp/navigation-redesign-2026-10-10/suite.mjs local-readiness` | **FAILED / environment-blocked: 86 passed, 37 failed out of 123**, before final late-failure/selector regressions were added. Existing output: `tmp/navigation-redesign-2026-10-10/local-readiness-suite.log`. `EPERM: operation not permitted, realpath 'C:\Users\thai.phi\Downloads\python\portfolio\texas-rrc-explorer\tmp\navigation-redesign-2026-10-10\local-readiness-snapshot\tmp\acquisition-mLU6zx'`; other affected temporary raw directories, including `tmp\versioning-4xSEQx\raw`. Some assertions received `STAGE_FAILED` rather than expected validation errors because path access failed first. These failures are not passes; final complete suite remains unverified. No escalation or alternate access route attempted. |
| Controlled collection browser harness | BLOCKED. Normally launched `node tmp/navigation-redesign-2026-10-10/ui-fixture-server.mjs` reported listening on 4392, but in-app browser returned connection refused, then timed out on a fresh tab. No external collection or permission escalation used to compensate. |

Current 34-test subset must not be conflated with historical full-suite passes in earlier packets. No new host approval is requested here. The dependent checks remain blocked under current permissions.

## Browser and visual evidence

All ten destinations captured at actual desktop 1280×720 and narrow 390×844: Find & collect, My datasets, Overview, Records, Data quality, Sources, Downloads, Collection details, Collection history and Help. [Screenshot gallery](screenshots-2026-10-10-local-readiness.md); metadata in `tmp/local-readiness-2026-10-10/screenshots/index.json`.

Actual browser checks: original example discoverable and opens 5 inventory rows / 28 monthly reports; workspace identity/version retained across tabs; Back/Forward and refresh preserve exact version/tab; unavailable version clears record counts/details, download links and run evidence; verified library recovery restores example without errors. Invalid nine-digit UIC and unsupported longer API inputs show precise validation. Failed history displays recorded failure/skips and unavailable counts. No new request borrows old success status.

Record selection checks: text/operator filters clear hidden selected well/report/lineage; empty results and explicit reselection after Clear filters; other inventory well says history not acquired; latest original report selected with 4,799 bbl, reported zero gas, 900 psi and calculated 159.97 bbl/calendar-day. Keyboard Enter works on links/stages; Home/End changes evidence tabs; focus outline visible; narrow table keyboard scrolling moves a 1,050px table within 330px region. All narrow page widths stay within document client width375; actual panel bounds left14/right360.67, so full-page image right-gutter clipping is a capture artifact.

Independent Astra/high reviewer reviewed current code/matrix, all ten desktop/mobile destinations and failed/skipped keyboard states, then directly compared all four supplied images. No material scoped fidelity blocker; dense horizontally scrolling evidence and long narrow pages remain usability tradeoffs. Final selector repair independently passed 34 tests and a pending-response/recovery/history probe. Reviewer changed no files.

[Recorded independent review](review-2026-10-10-local-readiness.md). Screenshot gallery generation verifies actual metadata/dimensions and existing files for all ten desktop/narrow destinations, with33 captured states in total. An initial gallery-script variable typo was corrected; the gallery check passes. Preview viewport override reset; temporary controlled harness stopped. Work completed and reported early, before the unchanged hard deadline.

## Remaining gaps / readiness decision

- **Full acceptance remains open:** current full suite is blocked, not passed.
- Current-round controlled browser checks/screenshots for multiple/no candidates, source failure, confirmation/date changes, repeated clicks, active collection, no reports and successful new-result handoff remain blocked by harness connectivity. Earlier controlled evidence is historical and does not close this round. No unnecessary live collection was run.
- Corrupt-byte retry success is regression-covered; current browser checks use an unavailable version plus verified recovery, not a newly restored corrupt response.
- Complete screen-reader/accessibility audit and broad real-user testing remain unrun. Keyboard and viewport checks are bounded evidence only.
- Public versions used in quality screenshots have zero quarantined rows; no issue counts were fabricated. Quarantine/parent-link/missing-versus-zero behaviors have focused regression evidence, not fresh public issue screenshots.
- RRC-01/02/03/04/05/06/09/10 retain mapped destinations and evidence. RRC-07/08, G3, production delivery and consumer adoption remain outside acceptance. This round is maintenance supporting RRC-06 and RRC-09/10; no new product capability was introduced.
- Lovable/external setup is excluded and stopped. Analytics continues separately; no authentication, hosting or consumer handoff implementation belongs to this checkpoint.

The repaired local example walkthrough is available for further testing; public-user release readiness is not established.
