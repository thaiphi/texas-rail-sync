# E12-lite design: watched official RRC documents and page links

Date: 2026-11-03. Status: **draft for owner approval.** Built from the owner's brainstorming answers on 2026-11-03. Anything marked *(Main's call)* was not decided by the owner and can be overruled while reading.

- **Authority:** [PRD](../../expansion-prd-2026-10-17.md) §RRC-E12, cut to E12-lite by the [v1.1 review](../../expansion-prd-review-v1.1-2026-10-17.md) D17. Full E12 (text extraction, OCR, document index) belongs to `ai-swd-permitting` (AI-02/AI-04) and stays out. This design widens E12-lite from "page links" to "watched documents plus page links" on the owner's instruction. It needs a new tracker row (**RRC-18**, proposed) and a scope line in `SPEC.md` and `AGENTS.md` (section 9).
- **Baseline:** `origin/main` at `0933590`.
- **Model:** the Phase 4 design (pure shared module, read-only on `artifacts/`) and the existing fetch layer `src/sourceFetch.mjs`.

## 1. Why

Explorer saves official RRC documents with every collection (UIC manual, BHP guidance, SRT guidelines, WBA091, W-2, W-3, UIC query help, the Injection-Storage Resources page). It records a SHA-256 and the server's `Last-Modified` for each one, but nothing ever compares them.

**The evidence:** 11 committed collections, 2026-10-10 to 10-30. Between 10-10 and 10-29, `rrc-resources.html` changed from SHA-256 `d8173dcf…` to `237547a1…`. RRC had added a "Proposed Rule Amendments: §§ 3.15 and 3.58 … Senate Bill 1150" notice with comments due 5:00 pm, Friday, November 13, 2026. Nobody noticed. The page has no date and no `Last-Modified`. Every other document was byte-identical across all collections. The PDFs' server dates are all 2026-06-02, within one minute of each other, which points to a bulk re-upload rather than real edits.

**What follows:** the fingerprint says *whether* a document changed. The dates say *when*, but only roughly, and each date is labelled with where it came from. Documents rarely carry a usable "last updated" date of their own.

**The owner's purpose:**
- Explorer does the legwork. It keeps the list of official RRC documents, so the chat assistant project (`ai-swd-permitting`, not built yet) knows which documents to use.
- It notices when one of them changes, or when RRC announces new rules or procedures, so the team knows to update its own material.

## 2. Goals, non-goals, anti-goals

**Goals**
1. A **watch list** of official RRC documents and announcement pages, kept in one plain file that Explorer owns.
2. A **"Check now" button** that fetches every watched address once, saves each copy and marks each document Changed, Unchanged or Check failed.
3. A **table** in Explorer with one row per watched document (owner chose option B over a change feed). Details for a row show the before and after copies, the added and removed text for web pages, the dates with their sources, and the review history.
4. **Mark reviewed**, with an optional note, by the owner.
5. **Page links:** where Explorer cites a page of a saved PDF, the citation opens Explorer's saved copy at that page.
6. The same file is the **list the chat assistant reads** later.

**Non-goals (now)**
- **Automatic checks.** The owner said: "let's have the button to activate check for right now. in the future, we will do automatic check." A daily scheduled check is future work under RRC-08 (scheduled refresh, deferred under D12). The check must be one callable function so a scheduler can run it later without changes.
- **OCR, PDF text extraction, search, a document index.** The owner confirmed keeping OCR out. "What changed inside a PDF" is recorded as future work for `ai-swd-permitting`.
- **More than one reviewer, sign-in, roles.** The owner said: "just me for now."
- **Hosted or guest use.** Local only, under D7. The hosted runtime and guest paths have no watch routes.
- **Jumping to a heading inside a saved web page.** HTML links open the saved copy at the top.
- **Any change to `artifacts/`, `collected-sources/` or existing versions.**

**Anti-goals (this would be a failure even if it works)**
- Calling a document "Unchanged" when the check didn't actually succeed, or letting a failed fetch overwrite the last good copy.
- A citation that silently points at a different copy than the one it was made from.
- Explorer fetching addresses outside the RRC's own sites, or growing into a general crawler.
- Any AI or token use in checking. Checking is plain code: hash comparison and a line diff.
- Losing history. No copy, change record or review note is ever deleted.

## 3. Watch list

### 3.1 Starting list

*(Main's call: seed from what Explorer already saves)*

| Name | Kind | Address |
|---|---|---|
| UIC manual (UIA010) | Manual | `https://www.rrc.texas.gov/media/v3onmigl/uic_manual_uia010_3116.pdf` |
| Injection-Storage Resources | Announcements | `https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/resources/` |
| UIC query help | Guidance | `https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html` |
| Step-rate test guidelines | Guidance | `https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/oil-and-gas-waste-disposal/injection-disposal-permit-procedures/technical-review/step-rate-test-guidelines/` |
| BHP monitoring NTO (Permian) | Guidance | `https://www.rrc.texas.gov/media/sm5bzzpg/nto-disposal-well-monitoring-reporting-requirements-in-the-permian-basin-12-19-2023.pdf` |
| Wellbore database manual (WBA091) | Manual | `https://www.rrc.texas.gov/media/cx2i4xrm/wba091_well-bore-database.pdf` |
| Form W-2 | Form | `https://www.rrc.texas.gov/media/sdbph42m/w-2-0114.pdf` |
| Form W-3 | Form | `https://www.rrc.texas.gov/media/lw0bmny4/w-3p.pdf` |

The owner wanted pages "where RRC announces new rules and procedures" on the list too. Main suggested the RRC Proposed Rules page but has **not verified its address**. *(Main's call:)* it is not seeded. The owner adds it through the Add box (section 3.2) as the first real use of that feature, after checking the address in a browser.

**History seed** *(Main's call)*: on first use, Explorer builds each seeded document's history from the copies already committed under `collected-sources/` (11 collections, matched by URL), using their existing `.source.json` sidecars. It does this without any network request. The table then opens already showing the real 10-10 → 10-29 change to Injection-Storage Resources as "Changed, not reviewed". Seeded copies are referenced where they already sit and are never copied or modified. Each history entry's source is labelled "from collection `<run id>`" rather than "from Check now".

### 3.2 Adding, removing and duplicates

- **Adding (owner's choice: "type its address into Explorer yourself"):**
  - An Add box above the table takes the address, a short name and a kind (Manual, Guidance, Form or Announcements).
  - The new row reads "Not yet checked". Adding fetches nothing; the next Check now saves its first copy.
- **Only RRC addresses:**
  - The address must be `https:` with host `rrc.texas.gov` or a subdomain of it (`www.`, `webapps2.`).
  - No credentials, no non-default port, and no fragment (it is stripped).
  - Anything else gets a plain refusal message. This keeps Explorer inside its scope (AGENTS.md "Do not expand…").
- **Duplicates:** an address already on the list (after normalizing case of the host and dropping a fragment) is refused, and the message points to the existing row.
- **Stop watching:** the row is marked "No longer watched", is left out of checks, and is shown greyed at the bottom. Its copies and history stay. It can be watched again.
- **No editing of an address.** To change one, stop watching the old address and add the new one, so history is never re-attributed. Name and kind can be edited.

## 4. Check now

- **Trigger:** only the owner pressing **Check now** in the local app. The press is the authorization for that run's requests. The run fetches only the watched addresses, one at a time, each once. Today that is 8 requests, or 9 with Proposed Rules.
- **Fetch:** use the existing `fetchSource` behaviour:
  - redirects refused, 30 s timeout, 10 MB cap, the SHA-256 and sidecar fields, `testFixture` for tests;
  - the Socrata app token is never sent, since no watched address is `data.texas.gov`.
  - `src/sourceFetch.mjs` currently says "Targets come only from sources.mjs". The builder extends that rule to "…or from the validated watch list (section 3.2)". The address check must run again at fetch time, not only when a document is added.
- **No retry loop.** A 429 or any failure marks the row **Check failed** with a plain reason (unreachable, HTTP status, too large, redirect refused, timeout). The last good copy and status stay as they were, and the failure is recorded in history.
- **Comparison, per document:**
  - Same SHA-256 as the latest good copy: **Unchanged**. The new bytes are not stored again; the history records "checked, same".
  - Different SHA-256: save the new copy and mark the row **Changed, not reviewed**.
  - First copy ever: **Watched since** (a baseline, not a change).
  - For web pages, Explorer also compares the visible text (section 5). If the raw bytes changed but the visible text is identical, the status is **Changed (markup only)** *(Main's call)*. It still counts as a change, but the table shows it more quietly.
- **Run behaviour:**
  - One check runs at a time; pressing again while one runs does nothing.
  - The table shows progress ("3 of 9").
  - A finished run writes one run record: start and end time, and per document: outcome, HTTP status, hash, bytes.
- **Callable without the browser:** the check is one exported function (for example `checkWatchedDocuments({fetchImpl, now})`). A later scheduler calls the same function. No scheduler, timer or startup hook is added now.

## 5. Text comparison for web pages

- **Plain code, no dependencies:**
  - Remove `<script>`, `<style>` and comments.
  - Turn block tags into line breaks, then drop the remaining tags.
  - Decode common entities and collapse spaces.
  - Line-diff old against new, with added lines shown green and removed lines red.
- The saved HTML is **never rendered as a web page**. It is shown as text, the way the Sources tab already serves `.html` as `text/plain`, so RRC's scripts never run inside Explorer.
- The diff is computed when it is viewed and is not stored. It is a derived view; the saved bytes are the evidence.
- **PDFs get no text diff.** The details show "Changed: the file is different. Open both copies to compare." with links to the before and after copies.

## 6. The table and its details

**Placement** *(Main's call)*: a new top-level navigation item, **Watched documents**, next to Find & collect, My datasets, Collection history and Help. It is about RRC's documents, not about one dataset.

**Header:**
- the title and the **Check now** button;
- a summary line: "Last check 2026-11-03 14:02 · 9 watched · 1 changed, not reviewed · 0 failed";
- the Add box, collapsed under "Add a document".

**Columns:** Document (name, with a link to the official page ↗), Kind, Status, Dates, Last checked.

- **Status** is one of:
  - Not yet checked
  - Watched since `<date>`
  - Unchanged
  - ⚠ Changed, not reviewed
  - Changed (markup only), not reviewed
  - Reviewed `<date>`
  - Check failed
  - No longer watched
- **Rows needing attention sort first.** That means changed and not reviewed, then failed; the rest follow by name.
- **Dates:** each date is labelled with its source.
  - "Server: 2026-06-02" (`Last-Modified`).
  - "Changed between 10-10 and 10-29": the last check that saw the old copy and the first check that saw the new one.
  - "—" when there is nothing.
  - *(Main's call)* No date is read from inside a document: that would be text extraction (D17). The owner can put a printed date in a review note.

**Details** (a row expands):
- the change history, newest first: date range, old and new hash, before and after copies, the text diff for web pages, review mark and note;
- the last few check outcomes, including failures with their reason.

**Mark reviewed:**
- The button sits on the newest unreviewed change. It takes an optional note and records the time.
- The row shows "Reviewed `<date>`" until a later check finds a new change, which flips it back to "⚠ Changed, not reviewed".
- Each change keeps its own review.
- A review can't be edited or removed *(Main's call)*. A follow-up note is added instead.

**Opening a saved copy:**
- Explorer verifies the copy's SHA-256 against the recorded one before showing it.
- A mismatch shows "This saved copy no longer matches its recorded fingerprint" and the copy is not opened. This is the tamper case.

## 7. Page links into saved PDFs

- **Where they appear:**
  - In the dataset **Sources** tab, every recorded page citation becomes a link. Today that is the dictionary's `units_source: {url, pdf_pages: [18, 41, 42]}` for the UIC manual.
  - In the watched-document details, the copy links.
- **What a click opens:**
  - Explorer's saved copy in the browser's PDF viewer, at the cited page (`#page=N`), never RRC's live file. The official address stays a separate "Official page ↗" link.
- **Which copy:**
  - A citation is tied to the copy it was made from, by SHA-256: the version's own preserved `uic-manual.pdf`.
  - If the watch list knows a newer copy of that document with a different hash, the link still opens the cited copy. Beside it, a note reads "A newer version exists (changed between `<a>` and `<b>`). Page numbers may differ."
  - A citation is never re-pointed to a different copy.
- **Truthful fallback:** the review notes that `#page=N` is unverified for the `blob:` URLs the Sources tab uses today.
  - The builder must prove page opening in Chrome and Edge, whether through the existing blob URL or a new local route serving the verified copy.
  - Where it can't be proven, the link opens the copy at the top and the label says "opens at page 1; cited page N" rather than claiming a jump.
- **Web pages:** open the saved text copy at the top (no heading anchors, section 2).
- **Nothing is read out of the PDFs.** Page numbers come only from citations someone wrote down.
- **No PDF library may be added.** The acceptance checks include a grep gate over `package.json` and imports, as the v1.1 review requires.

## 8. The watch-list file (what the chat assistant reads)

*(Main's call: format and location. `ai-swd-permitting` does not exist yet, so there is no consumer to match.)*

- **Location:** a new top-level folder `watched-documents/`.
  - `watch-list.json`: the single source the table is drawn from.
  - `copies/<sha256>.<pdf|html>`: content-addressed saved copies, written once and never overwritten.
  - `checks/<check-id>.json`: one record per Check now run.
  - Seeded history points at the existing `collected-sources/` files instead of copying them.
- **`watch-list.json`** has `schema: "rrc-watch-list-v1"`. For each document it holds:
  - id, address, name, kind and watched state;
  - current status;
  - the latest good copy: hash, bytes, path, retrieved time, server date and ETag;
  - the change history with review marks and notes;
  - the last check outcome.
- **Writes:** the file is written atomically, to a temp file that is then renamed.
- **Readers:** a reader needs only this file plus the copies it names. Explorer sends nothing anywhere and doesn't know the assistant exists.
- **Layout changes:** any change to the layout bumps the schema name (`-v2`), the same way query versions work. Readers must refuse a schema they don't know.
- **Tracked in git** *(Main's call)*, like `collected-sources/`, so the history is evidence that survives the machine. Committing it stays the agent's or the owner's normal Git step; the check never runs Git.
- **Not part of any dataset version or the Analytics handoff.** Nothing in `artifacts/` or the evidence package changes.

## 9. Scope and paperwork

- **New tracker row RRC-18 / P1** in `docs/requirements.md`: "Watched official documents and page links (E12-lite, widened by owner 2026-11-03)".
- **`SPEC.md` scope:** add "a local, owner-triggered check of a watch list of official RRC documents (rrc.texas.gov only)". Under "Deliberate cuts", record "no scheduled check (RRC-08), no extraction/OCR (D17)".
- **`AGENTS.md` scope sentence:** add "watched official RRC documents" to the list of in-scope work. The owner's approval of this design is the authorization.
- **Running it:** the builder's live proof (one real Check now) needs the owner's go-ahead in chat at that time. That run changes tracked files under `watched-documents/`.

## 10. Acceptance

1. **Seeding:** the history seed alone, with no network, produces the table with Injection-Storage Resources "⚠ Changed, not reviewed", dated "between 2026-10-10 and 2026-10-29", and with the §3.15/3.58 lines in the added text. The other 7 documents are Unchanged.
2. **Fixture checks** (`testFixture`, injected fetch) cover each case:
   - Unchanged: no new copy written.
   - Changed: new copy, diff shown.
   - Markup-only change.
   - First copy.
   - HTTP 404, 429, timeout, redirect and over-cap: each gives Check failed with the reason, and the last good copy is kept byte-identical.
   - A second press during a run is ignored.
3. **Address rule:**
   - Refused: `http:`, other hosts, look-alikes (`rrc.texas.gov.evil.example`, `evilrrc.texas.gov`), credentials, ports and duplicates.
   - Accepted: `www.` and `webapps2.` addresses.
   - The rule is enforced again at fetch time, even if the file is edited by hand.
4. **Review:**
   - Mark reviewed persists across restarts.
   - A later change flips the row back to "Changed, not reviewed".
   - History keeps both changes and the note.
5. **Tamper:** altering a saved copy's bytes makes opening it refuse with the fingerprint message, and the check reports it rather than treating the copy as the baseline.
6. **Page links:**
   - Each UIC manual citation (18, 41, 42) opens the version's own saved copy at that page in Chrome and Edge, or shows the truthful "opens at page 1" label (section 7).
   - The "newer version exists" note appears when a fixture adds a different-hash UIC manual copy.
7. **Untouched files:** `artifacts/` and `collected-sources/` are byte-identical before and after all tests and the live proof (hash comparison). The Sources tab ledger and downloads are unchanged.
8. **No extraction:** no PDF or OCR library in `package.json` or imports (grep gate). No AI or network call other than the watched addresses during a check.
9. **Local only:** the guest and hosted runtime expose no watch route, and the existing guest tests still pass.
10. **Full suite:** `node --test test/*.test.mjs` passes. The suite's baseline count is recorded before the work starts.
11. **Live proof** (with owner go-ahead): one real Check now. It is recorded in `docs/verification-<date>-e12-lite.md` with requests made, outcomes and hashes. The proof states what wasn't covered.

## 11. Left to the builder

- Module split and file names, beyond `watched-documents/` and `rrc-watch-list-v1`.
- Route names for the local server, and whether copies are served by route or blob, provided section 7's page proof holds.
- The line-diff algorithm and the HTML-to-text details within section 5's rules.
- Table styling within the existing `public/style.css` patterns, plus keyboard and mobile behaviour matching the other tables.
- How many past check outcomes the details show.

## 12. Future work (recorded, not built)

- **Automatic daily check** (RRC-08): a scheduler, for example a Windows scheduled task, calls the same check function.
- **"What changed inside this PDF"**, provided by `ai-swd-permitting` once it extracts text (D17).
- More reviewers or sign-in, if the team grows.
- Heading anchors inside saved web pages.
