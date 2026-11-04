# E12-lite proof: watched documents live check and page links (RRC-18), 2026-11-04

Scope: the first real **Check now** on the watched-documents list, and the page-jump proof for cited UIC manual pages. Both were run under the [design](superpowers/specs/2026-11-03-e12-lite-watched-documents-design.md) §10.6 and §10.11. The owner gave the go-ahead in chat on 2026-11-04 ("go ahead with check now").

## Setup

- **Explorer:** branch `e12-lite/watched-documents` at `dd92373`, served with `node scripts/serve.mjs 4391` from the worktree.
- **List:** the committed list, seeded from the 11 collections of 2026-10-10 to 10-30, with 8 watched documents. No document had been added by the owner.
- **Browser:** Chrome in a fresh isolated profile, driven through Chrome DevTools. Check now was pressed once, from the Watched documents screen.

## Live Check now

Check `81fdb838-2462-4612-bedb-dee7b6a51b02`:
- **Time:** started 2026-11-04T09:41:49.423Z and ended 09:41:51.707Z.
- **Record fields:** `trigger: owner`, `testFixture: false`.
- **Requests:** 8, one per watched address, made one after another. All returned HTTP 200.

| Document | Outcome | SHA-256 (first 8) | Bytes |
|---|---|---|---|
| UIC manual (UIA010) | same | `09f3744d` | 1,077,385 |
| Injection-Storage Resources | **change** (`237547a1` → `1f774515`) | `1f774515` | 48,540 |
| UIC query help | same | `563b33af` | 42,272 |
| Step-rate test guidelines | **change** (`caef891d` → `ab2108db`) | `ab2108db` | 45,893 |
| BHP monitoring NTO (Permian) | same | `728baacd` | 183,088 |
| Wellbore database manual (WBA091) | same | `71891d48` | 804,319 |
| Form W-2 | same | `46e753d3` | 59,078 |
| Form W-3 | same | `c4a6d982` | 117,481 |

**What changed.** Both changes are the same edit: RRC removed a site-wide banner. The text diff for each page shows only three removed lines and no added lines:
- "Important Messages:"
- "Texas.Gov Payments General Maintenance"
- "Notice to Operators: RRC Online Payments will be intermittently unavailable October 29, 2026, from 10:00 PM to 11:00 PM CT. …"

No rule or procedure text changed. The §§ 3.15 and 3.58 notice on Injection-Storage Resources is still present.

**How the rows read.** Both rows now show "⚠ Changed, not reviewed" with "Changed between Oct 29, 2026 and Nov 4, 2026", and they sort first. Injection-Storage Resources keeps its earlier, still unreviewed 10-10 → 10-29 change below the new one. The summary reads "Last check Nov 4, 2026, 3:41 AM CST · 8 watched · 2 changed, not reviewed · 0 failed". Screenshot: [live-check-details.png](screenshots-2026-11-04-e12-lite/live-check-details.png).

**Files written by the check:**
- `watched-documents/watch-list.json`, with events appended;
- `watched-documents/checks/81fdb838-….json`;
- two new copies, `watched-documents/copies/1f774515….html` and `ab2108db….html`.

The six unchanged documents wrote no new copy.

**Untouched files:**
- `artifacts/` and `collected-sources/`: each tree was hashed (sorted `sha256sum` of every file) before and after the check, and both are byte-identical.
- App token: a search of `watched-documents/` and this proof's screenshots for the value of `TRRC_SOCRATA_APP_TOKEN` finds 0 hits. The value was never printed. No watched address is `data.texas.gov`, so the check sends no token.

## Page links

The cited UIC manual pages (18, 41, 42; `units_source` in the data dictionary) are labelled "PDF page N". They are the PDF file's own page numbers, not the manual's printed numbering; for example, PDF page 41 is printed page II.34.

| Browser | Copy | Result |
|---|---|---|
| Chrome 156 | Local server copy (`/artifacts/…/sources/uic-manual.pdf#page=41`) | Opens at 41 / 97 (automation) |
| Chrome 156 | Browser-saved copy (`blob:` URL) | Opens at 41 / 97 (automation) |
| Edge | Local server copy | Opens at page 41 (checked by the owner, 2026-11-04) |
| Edge | Browser-saved copy | Not checked |

## Not covered

- **A real failed fetch.** The live run had none. Failed fetches are covered only by fixture tests.
- **A real PDF change.** No PDF changed. A changed PDF shows "Changed: the file is different. Open both copies to compare." (fixture tests only).
- **A real damaged copy or repair.** Covered by fixture tests only.
- **Edge with a browser-saved copy, and guest mode in either browser.**
- **The automatic daily check.** It is future work (RRC-08) and was not built.
- **A screen reader run.**
- **Two Explorer servers running Check now on the same document at the same time.** The final review left this as a follow-up. Owner reviews and notes are kept either way, but a spurious second "Changed" entry is possible.

## Observation for follow-up

Site-wide banners on rrc.texas.gov change every RRC web page at once. Each banner therefore shows up as a change on every watched HTML page, and the owner has to review it per page. The diff makes such a change easy to spot. Telling banner text apart from page content would be a future refinement; it is not part of E12-lite.
