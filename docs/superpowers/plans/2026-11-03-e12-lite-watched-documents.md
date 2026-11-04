# E12-lite Watched Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, owner-triggered watch list of official RRC documents. It has a Check now button, a change table with review marks, and page links from the Sources tab into Explorer's saved PDF copies.

**Architecture:**
- **Pure modules in `public/`**, shared by Node and the browser, like `public/version-compare.js`:
  - the watch-list model: address rule, state changes, status and sorting;
  - HTML-to-text and line diff;
  - the table renderer and page-link builder.
- **Node modules in `src/`** do the I/O: the store, the history seed and the check.
- **Routes:** `scripts/serve.mjs` gains `/api/watch*` routes, enabled only when the CLI passes `watchRoot`, so `guest-local.mjs` and tests get no watch routes by default.
- **The data file:** `watched-documents/watch-list.json` (schema `rrc-watch-list-v1`) is the single source the table is drawn from.

**Tech Stack:** Node (ES modules, no new dependencies), `node:test`, plain browser JS/HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-11-03-e12-lite-watched-documents-design.md` (approved 2026-11-03). Executors read both; section numbers below (§n) refer to it.

## Global Constraints

- **No new dependencies.**
  - No PDF, OCR, diff or HTML-parser library in `package.json` or any import (§7, §10.8).
  - No AI or model call anywhere in the check.
- **Address rule (§3.2):**
  - `https:` only;
  - host `rrc.texas.gov` or a subdomain ending `.rrc.texas.gov`;
  - no username or password, no non-default port;
  - the fragment is dropped;
  - the host is compared lower-case.
  - The rule is enforced when a document is added **and** again at fetch time.
- **Network only on owner action.** The only network requests happen inside a Check now run the owner started, one request per watched address, sequentially. There is no scheduler, timer, startup hook or retry loop (§4). Fetch through `fetchSource` from `src/sourceFetch.mjs` with `appToken:null`.
- **Write-once copies.** Copies under `watched-documents/copies/<sha256>.<pdf|html>` are written once and never overwritten or deleted. Files under `collected-sources/` and `artifacts/` are never written (§8, §10.7).
- **Saved HTML is never rendered.** It is served as `text/plain; charset=utf-8` with `x-content-type-options: nosniff` (§5).
- **Local only (D7).**
  - Watch routes exist only when `createExplorerServer({watchRoot})` is given a `watchRoot`.
  - `scripts/guest-local.mjs` and the hosted runtime must not pass one.
  - The nav item is hidden in guest mode (`meta[name="trrc-mode"]` = `guest`).
- **Writes:**
  - Watch POSTs use the existing `guardWrite` (same-origin loopback) and `readBody` (8192-byte JSON) rules.
  - One watch write runs at a time; anything else gets 409 `WATCH_BUSY`.
- **Stored paths** in `watch-list.json` are repo-relative with forward slashes, and must start with `watched-documents/copies/` or `collected-sources/`.
- **Exact copy (owner-facing):**
  - Status labels (§6): `Not yet checked`, `Watched since <date>`, `Unchanged`, `⚠ Changed, not reviewed`, `Changed (markup only), not reviewed`, `Reviewed <date>`, `No longer watched`.
  - Last check suffixes: `last check failed (<reason>)`, `saved copy damaged`.
  - Damaged message: `This saved copy no longer matches its recorded fingerprint`.
  - PDF change text: `Changed: the file is different. Open both copies to compare.`
  - Newer-copy note: `A newer version exists (changed between <a> and <b>). Page numbers may differ.`
  - Fallback page label: `opens at page 1; cited page <N>`.
  - Summary line: `Last check <local datetime> · <n> watched · <n> changed, not reviewed · <n> failed`.
- **Kinds:** `manual`, `guidance`, `form`, `announcements`, labelled Manual, Guidance, Form, Announcements.
- **Git:**
  - Workers never stage, commit or push (AGENTS.md); Main commits after each task's review.
  - Tests clean their `runs/` output (`git clean -fdq -- runs/`).
- **Baseline:** `node --test test/*.test.mjs` gives **508 pass / 0 fail** at `fc8563f` (2026-11-03).

## Review Focus

1. **A hand-edited or corrupt `watch-list.json`** (bad JSON, unknown `schema`, a path outside the allowed roots, an address breaking the rule): GET `/api/watch` answers 500 with code `WATCH_LIST_INVALID`, the UI shows "The watch list file can't be read", and no POST ever overwrites the file with a fresh list. Test: Task 5.
2. **A 200 response with an empty body:** RRC returns `200` but 0 bytes. This is a failed check with reason `empty response`, not a Changed document. Test: Task 4.
3. **Interrupted run:** a crash after a copy was written but before the list was saved. The next check finds the copy already on disk with matching bytes, reuses it without error and saves the list. Test: Task 4.
4. **Markup in user text:** a note, name or reason containing `<script>` or `"` renders escaped in the table and details. Notes are capped at 2000 characters and names at 120 (400 `REQUEST_INVALID`). Test: Tasks 5 and 6.
5. **Windows path separators:** paths built on Windows are stored with `/`, and a stored path with `\` or `..` is refused by the store. Test: Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `public/watch-list.js` (new) | Pure model: schema constant, address rule, add, stop, rewatch, edit, applying check outcomes, review, derived status, sorting, list validation |
| `public/html-text.js` (new) | Pure: `htmlToText`, `lineDiff` |
| `src/watchStore.mjs` (new) | Disk: read and validate the list, atomic write, write-once copies, verified copy reads, check records |
| `src/watchSeed.mjs` (new) + `scripts/seed-watch-list.mjs` (new) | One-off history seed from `collected-sources/` |
| `src/watchCheck.mjs` (new) | `checkWatchedDocuments`, the function a future scheduler would call |
| `scripts/serve.mjs` (modify) | `watchRoot` option and `/api/watch*` routes |
| `public/watch-view.js` (new) | Pure render of the table, details and Add box |
| `public/page-links.js` (new) | Pure: citation links for the Sources tab |
| `public/navigation.js`, `public/index.html`, `public/app.js`, `public/style.css` (modify) | Route `#watch`, nav item, view section, wiring, Sources links |
| `watched-documents/watch-list.json` (new, generated by the seed) | Committed seeded list |
| `SPEC.md`, `AGENTS.md`, `docs/requirements.md`, `docs/verification-<date>-e12-lite.md` | Scope and evidence (§9, §10.11) |

### Shared data shape (Task 1 defines it; every task uses it)

```js
// watch-list.json
{ schema:'rrc-watch-list-v1', documents:[Doc] }
Doc = {
  id,                  // first 12 hex of sha256(normalized url)
  url, name, kind, watched:boolean, added_at, added_via:'seed'|'owner',
  latest: null | {sha256, bytes, path, retrieved_at, last_modified, etag, source},
  history: [Event],    // append-only, oldest first
  status: {change_state, last_result}   // derived by deriveStatus(); stored for readers
}
source = {type:'collection', run_id} | {type:'check', check_id}
Event =
  {type:'baseline', at, sha256, path, source}
| {type:'same', at, sha256, source}
| {type:'change', id, at, previous_sha256, previous_path, previous_seen_at, sha256, path, markup_only, source, review:null|{at,note}}
| {type:'failed', at, reason, http_status:null|number, source}
| {type:'damaged', at, path, expected_sha256, actual_sha256, source}
| {type:'note', at, change_id, note}
| {type:'stopped', at} | {type:'rewatched', at} | {type:'edited', at, name, kind}
change_state = 'not_checked'|'watched_since'|'unchanged'|'changed'|'changed_markup'|'reviewed'
last_result  = null | {at, outcome:'ok'|'failed'|'damaged', reason?:string}
```

---

### Task 1: Watch-list model (`public/watch-list.js`)

**Files:**
- Create: `public/watch-list.js`
- Test: `test/watch-list.test.mjs`

**Interfaces:**
- Produces:
  - `WATCH_LIST_SCHEMA='rrc-watch-list-v1'`; `KINDS` (frozen map kind → label).
  - `normalizeWatchAddress(url:string) -> string`: throws an Error with code `WATCH_ADDRESS_INVALID` and a plain message.
  - `documentId(normalizedUrl) -> string`: async, uses `crypto.subtle` (works in Node and the browser).
  - `emptyWatchList()`.
  - `addDocument(list,{url,name,kind},{now,id,via='owner'}) -> list`: throws `WATCH_DUPLICATE` with `existingId`, or `REQUEST_INVALID` for a bad name or kind.
  - `stopWatching(list,id,{now})`, `rewatch(list,id,{now})`, `editDocument(list,id,{name,kind},{now})`.
  - `applyOutcome(doc,outcome) -> doc`, where `outcome` is one of:
    - `{type:'baseline'|'same'|'change'|'failed'|'damaged', ...event fields}`;
    - `{type:'repair', latest}`, which re-points `latest` after a damaged copy is matched.
  - `markReviewed(doc,{note='',now})`, `addNote(doc,{changeId,note,now})`.
  - `deriveStatus(doc) -> {change_state,last_result}`.
  - `statusLabel(doc,{formatDate}) -> string`.
  - `sortRows(docs) -> docs`.
  - `validateWatchList(value) -> list`: throws `WATCH_LIST_INVALID`.
- All functions return new objects and never mutate their inputs.

- [ ] **Step 1: Write the failing tests**

```js
test('address rule accepts only https rrc.texas.gov hosts', ()=>{
  assert.equal(normalizeWatchAddress('https://WWW.rrc.texas.gov/a/#x'), 'https://www.rrc.texas.gov/a/');
  assert.equal(normalizeWatchAddress('https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html'), 'https://webapps2.rrc.texas.gov/EWA/help/UICGeneralHowTo.html');
  assert.equal(normalizeWatchAddress('https://rrc.texas.gov/'), 'https://rrc.texas.gov/');
  for (const bad of ['http://www.rrc.texas.gov/','https://rrc.texas.gov.evil.example/','https://evilrrc.texas.gov/',
    'https://u:p@www.rrc.texas.gov/','https://www.rrc.texas.gov:8443/','ftp://www.rrc.texas.gov/','not a url',''])
    assert.throws(()=>normalizeWatchAddress(bad), {code:'WATCH_ADDRESS_INVALID'}, bad);
});
test('duplicate address is refused and names the existing row', ...);  // host case and fragment differ only → WATCH_DUPLICATE, existingId set
test('name 1-120 chars and a known kind are required', ...);           // '' and 121 chars and kind 'memo' → REQUEST_INVALID
test('status follows history', ...);
  // [] → not_checked; [baseline] → watched_since; [baseline,same] → unchanged;
  // [baseline,change] → changed; change.markup_only → changed_markup;
  // after markReviewed → reviewed; a later change → changed again
test('a failure never replaces the change state', ...);
  // [baseline,change,failed] → change_state 'changed', last_result.outcome 'failed', reason kept
  // statusLabel === '⚠ Changed, not reviewed · last check failed (HTTP 404)'
test('markReviewed covers every unreviewed change up to the newest with the same review', ...);
test('addNote appends a note event and never edits a review', ...);
test('stopWatching keeps history; rewatch restores; edit changes name/kind only', ...);  // url is never editable
test('sortRows: changed-not-reviewed, then damaged, then failed, then by name; unwatched last', ...);
test('validateWatchList refuses unknown schema, bad paths and rule-breaking addresses', ...);
  // schema 'rrc-watch-list-v2'; path 'artifacts/x.pdf'; path 'watched-documents/copies/../x'; path with '\\'; url 'http://…' → WATCH_LIST_INVALID
test('functions never mutate their inputs', ...);  // deepFreeze inputs; calls succeed
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/watch-list.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `public/watch-list.js`** to the Interfaces above.
  - `deriveStatus` reads only `history`:
    - `change_state` comes from the last baseline, same or change event, plus that change's review (and `stopped`/`rewatched` for the watched flag);
    - `last_result` comes from the last baseline, same, change, failed or damaged event (`ok` for the first three).
  - Every state-changing function recomputes `doc.status`.
  - `previous_seen_at` (for "changed between") is supplied by the caller in the change event.
- [ ] **Step 4: Run and confirm they pass.** Run `node --test test/watch-list.test.mjs`. Expected: PASS.
- [ ] **Step 5: Hand back for review and commit (Main).**

### Task 2: HTML text and line diff (`public/html-text.js`)

**Files:**
- Create: `public/html-text.js`
- Test: `test/html-text.test.mjs`

**Interfaces:**
- Produces:
  - `htmlToText(html:string) -> string[]`: non-empty, trimmed lines.
  - `lineDiff(before:string[], after:string[]) -> Array<{op:'same'|'add'|'del', line:string}>`.

- [ ] **Step 1: Write the failing tests**

```js
test('htmlToText drops script, style and comments and splits on block tags', ()=>{
  assert.deepEqual(htmlToText('<p>A &amp; B</p><script>x()</script><style>p{}</style><!-- c --><div>C&nbsp;D<br>E</div>'),
    ['A & B','C D','E']);
});
test('htmlToText decodes &lt; &gt; &quot; &#39; &#NNN; &#xHH; and collapses whitespace', ...);
test('real rrc-resources change shows the §3.15/3.58 lines as added', async ()=>{
  // read the two committed copies: collected-sources/7aecd619-…/rrc-resources.html (d8173dcf) and
  // collected-sources/a8606089-…/rrc-resources.html (237547a1); resolve the full folder names with readdir and prefix match
  const added = lineDiff(htmlToText(oldHtml), htmlToText(newHtml)).filter(d=>d.op==='add').map(d=>d.line).join('\n');
  assert.match(added, /3\.15 and 3\.58/); assert.match(added, /Senate Bill 1150/); assert.match(added, /November 13, 2026/);
});
test('markup-only change yields identical text', ...);   // '<p class="a">X</p>' vs '<p class="b">X</p>' → equal arrays
test('lineDiff is minimal on insert/delete and keeps order', ...);
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/html-text.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Block tags:** `p, div, br, li, tr, h1-h6, section, article, header, footer, table, ul, ol, td, th`.
  - **`lineDiff`** is an LCS table over lines. The inputs are small (a few hundred lines), so O(n·m) is fine; cap at 5000×5000 lines and beyond that return `[{op:'del',…all},{op:'add',…all}]`.
- [ ] **Step 4: Run and confirm they pass.** Run `node --test test/html-text.test.mjs`. Expected: PASS.
- [ ] **Step 5: Hand back for review and commit (Main).**

### Task 3: Store and history seed

**Files:**
- Create: `src/watchStore.mjs`, `src/watchSeed.mjs`, `scripts/seed-watch-list.mjs`
- Generate and commit: `watched-documents/watch-list.json`
- Test: `test/watch-store.test.mjs`, `test/watch-seed.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`validateWatchList`, `addDocument`, `applyOutcome`, `emptyWatchList`).
- Produces (`src/watchStore.mjs`; `repoRoot` is the repo root, `watchRoot` = `resolve(repoRoot,'watched-documents')`):
  - `readWatchList({repoRoot}) -> list`: `validateWatchList` on the parsed JSON; ENOENT → `WATCH_LIST_MISSING`.
  - `writeWatchList({repoRoot}, list)`: validates first, writes `watch-list.json.tmp`, then renames it.
  - `saveCopy({repoRoot}, bytes) -> {path, sha256, reused:boolean}`:
    - the extension is `.pdf` when the bytes start with `%PDF-`, else `.html`;
    - if the file already exists with the same hash it returns `reused:true`; if it exists with a different hash it throws `WATCH_COPY_CONFLICT` and never overwrites.
  - `readVerifiedCopy({repoRoot}, path, sha256) -> Buffer`: refuses a path outside the two roots, `\`, `..` or a symlink (`WATCH_PATH_INVALID`); throws `WATCH_COPY_DAMAGED` with `actualSha256` when the bytes don't match.
  - `writeCheckRecord({repoRoot}, record)`: writes `watched-documents/checks/<check_id>.json`; refuses to overwrite.
- Produces (`src/watchSeed.mjs`):
  - `SEED_DOCUMENTS`: frozen `[{file, name, kind}]` for the 8 rows of spec §3.1. `file` is the `collected-sources` basename (`uic-manual`, `rrc-resources`, `uic-query-help`, `srt-guidelines`, `bhp-permian-nto`, `wellbore-wba091`, `form-w2`, `form-w3`). Each URL comes from the sidecars, which must agree with §3.1.
  - `buildSeedList({repoRoot, now}) -> list`:
    - reads every `collected-sources/<run>/<file>.source.json` with `testFixture===false` and verifies the sibling bytes against `sha256`; a mismatch throws;
    - orders copies by `retrieved_at` per document and replays them: the first is `baseline`, an equal hash is `same`, a different hash is `change` with `markup_only` (via `htmlToText` for HTML), `previous_seen_at` = the last observation of the old hash, and source `{type:'collection',run_id}`;
    - `added_via:'seed'`, `added_at` = the first copy's `retrieved_at`.
- `scripts/seed-watch-list.mjs`:
  - refuses to run if `watched-documents/watch-list.json` exists, unless `--force` is given;
  - writes the list; makes no network request.

- [ ] **Step 1: Write the failing tests**

```js
// watch-seed.test.mjs (reads the real committed collected-sources; writes only to a temp dir)
test('seed reproduces the missed rrc-resources change with no network', async ()=>{
  const list = await buildSeedList({repoRoot, now:'2026-11-03T00:00:00.000Z'});
  assert.equal(list.documents.length, 8);
  const res = list.documents.find(d=>d.url.endsWith('/injection-storage-permits/resources/'));
  assert.equal(res.status.change_state, 'changed');
  const change = res.history.find(e=>e.type==='change');
  assert.equal(change.previous_sha256.slice(0,8), 'd8173dcf'); assert.equal(change.sha256.slice(0,8), '237547a1');
  assert.equal(change.previous_seen_at.slice(0,10), '2026-10-10'); assert.equal(change.at.slice(0,10), '2026-10-29');
  assert.equal(change.markup_only, false);
  for (const d of list.documents.filter(d=>d!==res)) assert.equal(d.status.change_state, 'unchanged', d.name);
});
test('seed never writes into collected-sources or artifacts', ...); // hash every file under both before/after buildSeedList + writeWatchList(tmp)
test('seed refuses a sidecar whose bytes do not match', ...);        // copy one run to tmp repoRoot, flip a byte → throws
test('committed watch-list.json equals a fresh seed except added/now timestamps', ...);

// watch-store.test.mjs (temp repoRoot)
test('saveCopy is write-once and reuses identical bytes', ...);       // second identical save → reused:true; different bytes at same name impossible except tamper → WATCH_COPY_CONFLICT
test('readVerifiedCopy refuses damaged bytes and bad paths', ...);    // flip a byte → WATCH_COPY_DAMAGED with actualSha256; 'artifacts/x', 'collected-sources\\a', 'watched-documents/copies/../../x' → WATCH_PATH_INVALID
test('writeWatchList is atomic and refuses an invalid list', ...);    // invalid → throws and the old file is byte-identical
test('stored paths use forward slashes on every platform', ...);
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/watch-store.test.mjs test/watch-seed.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement both modules and the script.**
- [ ] **Step 4: Run and confirm they pass**, except the "committed watch-list" test. Run `node --test test/watch-store.test.mjs test/watch-seed.test.mjs`. Expected: PASS, except that one.
- [ ] **Step 5: Generate the file.** Run `node scripts/seed-watch-list.mjs`. Expected: it writes `watched-documents/watch-list.json`; `git status` shows only that new file plus the code.
- [ ] **Step 6: Run the tests again.** Run `node --test test/watch-store.test.mjs test/watch-seed.test.mjs`. Expected: PASS (all).
- [ ] **Step 7: Hand back for review and commit (Main).**

### Task 4: The check (`src/watchCheck.mjs`)

**Files:**
- Create: `src/watchCheck.mjs`
- Modify: `src/sourceFetch.mjs:1-2` (header comment only: "Targets come only from sources.mjs or the validated watch list (src/watchCheck.mjs)")
- Test: `test/watch-check.test.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `normalizeWatchAddress`, `applyOutcome`, `deriveStatus`.
  - Task 2: `htmlToText`.
  - Task 3: `readWatchList`, `writeWatchList`, `saveCopy`, `readVerifiedCopy`, `writeCheckRecord`.
  - `fetchSource`.
- Produces:
  - `checkWatchedDocuments({repoRoot, fetchImpl=fetch, testFixture=false, now=()=>new Date().toISOString(), checkId=randomUUID(), onProgress=()=>{}}) -> {record, list}`.
  - `onProgress({done,total})` is called after each document.
  - `record = {schema:'rrc-watch-check-v1', check_id, started_at, ended_at, trigger:'owner', testFixture, results:[{doc_id,url,outcome:'baseline'|'same'|'change'|'failed'|'damaged', http_status, sha256, bytes, reason}]}`. A damaged copy that is then compared produces two results for the same document: a `damaged` one and its comparison.
- **Per watched document, in list order:**
  1. Re-run `normalizeWatchAddress(doc.url)`. A throw becomes `failed`, reason `address not allowed`, and nothing is fetched.
  2. `fetchSource({name:doc.id,url:doc.url},{fetchImpl,testFixture,appToken:null,onResponse})`.
  3. Map errors to reasons:

     | Error | Reason |
     |---|---|
     | `NETWORK_ERROR` | `unreachable` |
     | `HTTP_ERROR` | `HTTP <status>` |
     | `SOURCE_THROTTLED` | `HTTP 429` |
     | `SOURCE_LIMIT` | `too large` |
     | `TimeoutError` | `timeout` |
     | redirect refusal (a `NETWORK_ERROR` whose cause message mentions redirect, or a 3xx status) | `redirect refused` |
     | 0 bytes | `empty response` |
  4. If `doc.latest` exists, call `readVerifiedCopy` on it. On `WATCH_COPY_DAMAGED`, record a `damaged` event and keep comparing against `doc.latest.sha256`.
  5. Compare:
     - no `latest`: `baseline` (save the copy);
     - equal hash: `same` (no new copy). If the row was damaged, `saveCopy` the fresh bytes and `applyOutcome({type:'repair', latest})` to point `latest` at the new path;
     - different hash: `saveCopy`, then `change` with `markup_only`, which is `true` only when both are HTML and `htmlToText` arrays are equal; `previous_seen_at` is the last event's `at` for the old hash.
  6. Save the list once at the end with `writeWatchList`, then `writeCheckRecord`.

- [ ] **Step 1: Write the failing tests** (temp `repoRoot` with a small two-document list; `fetchImpl` returns `Response` objects; `testFixture:true`)

```js
test('first check saves a baseline; second identical check writes no new copy', ...);
test('changed html saves a copy and records the diffable change', ...);
test('markup-only change is flagged markup_only', ...);
test('pdf change is a change with markup_only false', ...);
for (const [name, fetchImpl, reason] of [
  ['404', ()=>new Response('x',{status:404}), 'HTTP 404'],
  ['429', ()=>new Response('x',{status:429}), 'HTTP 429'],
  ['empty', ()=>new Response(new Uint8Array(0),{status:200}), 'empty response'],
  ['network', ()=>{throw new TypeError('fetch failed')}, 'unreachable'],
  ['oversize', ()=>new Response('x',{status:200,headers:{'content-length':'10000001'}}), 'too large'],
]) test(`failure (${name}) keeps last good copy and change state`, ...);
  // last good copy bytes and doc.latest unchanged; status.change_state unchanged; last_result.reason === reason
test('timeout is reported as timeout', ...);   // fetchImpl rejects with DOMException TimeoutError
test('hand-edited non-RRC address is refused at fetch time and never fetched', ...); // write the list file directly; fetchImpl spy not called for it
test('damaged latest copy: reported, compared against recorded hash, damaged file untouched, matching fetch repairs', ...);
test('interrupted run: copy already on disk is reused and the list saves', ...);  // pre-write the copy file, then check
test('onProgress reports done/total for each document', ...);
test('check never sends an app token and fetches each address exactly once', ...);
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/watch-check.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement `checkWatchedDocuments`** as specified above.
- [ ] **Step 4: Run and confirm they pass.** Run `node --test test/watch-check.test.mjs test/source-fetch.test.mjs`. Expected: PASS.
- [ ] **Step 5: Hand back for review and commit (Main).**

### Task 5: Server routes

**Files:**
- Modify: `scripts/serve.mjs` (the `createExplorerServer` options, the POST branch, the GET branch, and the CLI line, which passes `watchRoot:resolve(root,'watched-documents')` and `repoRoot:root`)
- Test: `test/watch-server.test.mjs`

**Interfaces:**
- Consumes: Tasks 1, 3 and 4.
- Produces (only when `watchRoot` is set; otherwise every `/api/watch*` path is a 404 like other unknown API routes):
  - `GET /api/watch` → `200 {schemaVersion:1, list, running:null|{checkId,done,total}, lastCheck:null|{check_id,ended_at}}`. A `readWatchList` error → `500 {error:{code:'WATCH_LIST_INVALID'|'WATCH_LIST_MISSING',message}}`.
  - `GET /api/watch/copy/<docId>/<sha256>` → finds the event path with that hash in the document's history, then `readVerifiedCopy`.
    - PDF: `application/pdf`, inline. HTML: `text/plain; charset=utf-8`. Both with `nosniff` and `cache-control: no-cache`.
    - Damaged: `409 {error:{code:'WATCH_COPY_DAMAGED',message:'This saved copy no longer matches its recorded fingerprint'}}`.
    - Unknown document or hash: 404.
  - `POST /api/watch/check {}` → `202 {checkId}`. The run continues in the background, `running` updates through `onProgress`, and a run already active gets `409 WATCH_BUSY`.
  - `POST /api/watch/add {url,name,kind}` → `201 {document}`. `WATCH_ADDRESS_INVALID` → 400; `WATCH_DUPLICATE` → `409 {error, existingId}`.
  - `POST /api/watch/stop {id}`, `/api/watch/rewatch {id}`, `/api/watch/edit {id,name,kind}`, `/api/watch/review {id,note}`, `/api/watch/note {id,changeId,note}` → `200 {document}`.
  - **Rules for every POST:**
    - `guardWrite`, then `readBody`; unknown body fields → `400 REQUEST_INVALID`;
    - a note over 2000 characters or a name over 120 → 400;
    - any POST while a check or another write is active → `409 WATCH_BUSY`;
    - if the list file is invalid, every POST → 500 `WATCH_LIST_INVALID` and the file stays byte-identical.

- [ ] **Step 1: Write the failing tests.** Run `createExplorerServer({watchRoot, repoRoot:tmp, fetchImpl, testFixture:true})` in-process on port 0, with a temp `repoRoot` holding a seeded two-document list.

```js
test('no watchRoot → /api/watch is 404 (guest-local and default construction)', ...);
test('createGuestLocalServer exposes no watch route', ...);   // GET /api/watch on guest-local → 404
test('GET /api/watch returns the list and running:null', ...);
test('check → 202, progress visible while running, list updated after', ...);
test('second check while running → 409 WATCH_BUSY; add during check → 409', ...);
test('add: refused hosts → 400 WATCH_ADDRESS_INVALID; duplicate → 409 with existingId; valid → 201 Not yet checked', ...);
test('POST from another origin or non-loopback host → 403 ORIGIN_FORBIDDEN', ...);
test('review / note / stop / rewatch / edit round-trip and persist across a new server instance', ...);
test('note 2001 chars → 400; name 121 chars → 400; extra field → 400', ...);
test('copy route serves pdf inline and html as text/plain nosniff; damaged → 409 with the fixed message', ...);
test('corrupt or unknown-schema list → GET 500 WATCH_LIST_INVALID and POSTs leave the file byte-identical', ...);
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/watch-server.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement the routes in `scripts/serve.mjs`.** Use one `watchBusy` flag for checks and writes. Include `WATCH_*` codes in the error-code allow-list so their messages reach the client.
- [ ] **Step 4: Run and confirm they pass.** Run `node --test test/watch-server.test.mjs test/server.test.mjs test/guest-*.test.mjs`. Expected: PASS.
- [ ] **Step 5: Hand back for review and commit (Main).**

### Task 6: Watched documents screen

**Files:**
- Create: `public/watch-view.js`
- Modify:
  - `public/navigation.js`: `'watch'` added to the screen list in `parseRoute`.
  - `public/index.html`: a nav link `<a href="#watch" data-route="watch"><span aria-hidden="true">◎</span> Watched documents</a>` after Collection history, and a `<section id="watch-view" class="view" aria-labelledby="watch-title" hidden>`.
  - `public/app.js`: show and hide the view; fetch `/api/watch`; button handlers; poll every 1000 ms while `running`; hide the nav link and view in guest mode.
  - `public/style.css`: table, status chips and diff colours, reusing existing variables.
- Test: `test/watch-view.test.mjs`; extend `test/navigation-redesign.test.mjs` for the `#watch` route.

**Interfaces:**
- Consumes: Task 1 (`statusLabel`, `sortRows`, `KINDS`), Task 2 (`htmlToText`, `lineDiff`), and Task 5's route shapes.
- Produces:
  - `renderWatchView({list, running, lastCheck, formatDate, expanded:Set<docId>, diffs:Map<changeId,{before:string[],after:string[]}>|null}) -> string` (HTML). Pure, and every value is escaped with `escapeHtml` from `public/inspection.js`.
  - `watchSummary(list,lastCheck,formatDate) -> string`: the summary line from Global Constraints.
  - `changeDateLabel(changeEvent,formatDate) -> string`: gives `Changed between <a> and <b>`.
  - `dateCells(doc,formatDate) -> string[]`: gives `Server: <date>` from `latest.last_modified`, the change range, or `—`.
- **Behaviour:**
  - The details list the change history newest first and the last 5 check outcomes.
  - For an HTML change, app.js fetches both copies from `/api/watch/copy/...` and passes `diffs`; added lines get `class="diff-add"` and removed lines `class="diff-del"`.
  - A PDF change shows the fixed PDF text and two copy links.
  - Mark reviewed (with a note `<textarea maxlength="2000">`) appears only when an unreviewed change exists; existing reviews get an "Add note" form.
  - The Add box sits collapsed in `<details><summary>Add a document</summary>`. A refusal message from the server is shown in a `role="alert"` element.
  - **Check now:** disabled while running, with the label `Checking… <done> of <total>`.
  - **Row details controls:** Stop watching (or Watch again on an unwatched row), and Edit name/kind. The address is shown read-only with the text "To change the address, stop watching and add the new one".
  - **Duplicate refusal:** the message links to the existing row (`#watch` plus expanding that `docId`).

- [ ] **Step 1: Write the failing tests** (render from the committed `watched-documents/watch-list.json` and small fixtures)

```js
test('seeded list renders Injection-Storage Resources first as ⚠ Changed, not reviewed with its date range', ...);
  // order: first row name 'Injection-Storage Resources'; text includes 'Changed between' and the 10-10/10-29 local dates
test('summary line counts watched, changed-not-reviewed and failed', ...);   // seeded: '8 watched · 1 changed, not reviewed · 0 failed'
test('html diff marks the §3.15/3.58 lines as added', ...);
test('pdf change shows the fixed text and both copy links, no diff', ...);
test('failed check on an unreviewed change shows both', ...);   // '⚠ Changed, not reviewed · last check failed (HTTP 404)'
test('unwatched rows render last with No longer watched', ...);
test('markup in names, notes and reasons is escaped', ...);     // '<script>' never appears unescaped
test('Check now shows progress and is disabled while running', ...);
test('#watch parses to {screen:"watch"}', ...);
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/watch-view.test.mjs test/navigation-redesign.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement the view and the wiring.**
- [ ] **Step 4: Run and confirm they pass.** Run `node --test test/watch-view.test.mjs test/navigation-redesign.test.mjs`. Expected: PASS.
- [ ] **Step 5: Browser check (Main or worker, local only, no network).**
  - Run `node scripts/serve.mjs 4391` from the worktree, open `#watch` in Chrome (chrome-devtools MCP), and test with the keyboard: Tab through the rows, expand one, and run Mark reviewed on a **temp copy**. Start the server with a temp `watchRoot` via a scratch launcher, so the committed list is not touched.
  - Take screenshots at desktop and 390 px width into the scratchpad.
  - Do **not** press Check now against the committed list.
- [ ] **Step 6: Hand back for review and commit (Main).**

### Task 7: Page links in the Sources tab

**Files:**
- Create: `public/page-links.js`
- Modify: `public/app.js` (where `$('sources').innerHTML` is built, around `:140`; plus a local-only fetch of `/api/watch` for the newer-copy note)
- Test: `test/page-links.test.mjs`

**Interfaces:**
- Consumes: `data.dataDictionary.units_source` (`{url, pdf_pages, note}`), `manifest.sources[]` (`url`, `raw_file`, `sha256`), the `fileHref` and `savedView` logic in app.js, and Task 1's `normalizeWatchAddress`.
- Produces:
  - `citationLinks({dictionary, sources, hrefFor, pageJump, watchList}) -> Array<{label, href, page, fallbackLabel:null|string, newer:null|string, unavailable:null|string}>`.
  - `hrefFor(rawFile) -> string`: the inline URL (no `?download=1`). Local: `${base}${raw_file}`. Saved or guest: the blob URL.
  - `pageJump:boolean`, from Step 5's proof. When it is false, `href` has no `#page` and `fallbackLabel` = `opens at page 1; cited page N`.
  - `newer` is set only when `watchList` (local mode) has a document with the same normalized URL whose `latest.sha256` differs from the cited source's `sha256`. The text is the fixed note, with the dates from the change event whose `previous_sha256` equals the cited hash, or the latest change if none matches.
  - `unavailable` is `'The cited document is not preserved in this version'` when no `manifest.sources` entry has the citation's URL.
- **The Sources card** for the cited source gains a "Cited pages" line with one link per page and a separate `Official page ↗`. Other cards are unchanged. The "View preserved response" link keeps `download` exactly as today (§10.7: downloads unchanged).

- [ ] **Step 1: Write the failing tests**

```js
test('pinned version: three links to the preserved uic-manual.pdf at pages 18, 41, 42', ...);
  // href endsWith 'sources/uic-manual.pdf#page=18' etc., no 'download=1'
test('blob href (saved/guest) keeps #page', ...);   // hrefFor returns 'blob:x' → 'blob:x#page=41'
test('pageJump false → no fragment and the fixed fallback label', ...);
test('newer copy in the watch list shows the fixed note; same hash shows none; no watch list shows none', ...);
test('citation url missing from sources → unavailable, no link', ...);
test('Sources downloads and ledger HTML are unchanged apart from the added Cited pages line', ...); // render before/after for a fixture manifest
```

- [ ] **Step 2: Run and confirm they fail.** Run `node --test test/page-links.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement `public/page-links.js` and the app.js wiring.**
- [ ] **Step 4: Run and confirm they pass.** Run `node --test test/page-links.test.mjs`. Expected: PASS.
- [ ] **Step 5: Prove the page jump in Chrome and Edge** (local, no network).
  - Open the pinned version's Sources tab, click page 41, and screenshot the viewer at page 41. Repeat from a browser-saved copy (blob URL).
  - Set `pageJump` per mode from the result. If either browser fails a mode, that mode uses the fallback, and the verification doc says so.
  - Edge is driven by opening the same local URL in Edge by hand; ask the owner if automation can't reach Edge, and record it.
- [ ] **Step 6: Hand back for review and commit (Main).**

### Task 8: Scope, gates and full suite

**Files:**
- Modify:
  - `SPEC.md`: the scope sentence and "Deliberate cuts" (§9 wording).
  - `AGENTS.md` (Scope paragraph): add "watched official RRC documents (owner-triggered check, rrc.texas.gov only)".
  - `docs/requirements.md`: a new row `RRC-18 / P1 | **Watched official documents and page links** (E12-lite, widened by owner 2026-11-03) …`, status "Implemented 2026-11-0x (local)" once the proof passes.
- Test: `test/watch-gates.test.mjs`

- [ ] **Step 1: Write the gate tests**

```js
test('no new dependency and no PDF/OCR/diff/HTML-parser import', ...);
  // package.json dependency+devDependency names equal the baseline set at fc8563f (jsdom is already a pre-existing
  // devDependency of the app scaffold and stays allowed there); no import specifier in src/, public/, scripts/ matches
  // /pdf|ocr|tesseract|diff|cheerio|jsdom|parse5|htmlparser/i (verified 0 matches at fc8563f)
test('watch modules import nothing outside node: builtins and repo-relative files', ...);
test('no scheduler: watch modules contain no setInterval/cron/schtasks', ...); // setTimeout allowed only in public/app.js polling
test('artifacts/ and collected-sources/ hashes unchanged by the suite', ...);  // compare against a manifest captured by this test at start vs end of a seed+check run in tmp
```

- [ ] **Step 2: Run them.** Run `node --test test/watch-gates.test.mjs`. Expected: PASS.
- [ ] **Step 3: Edit the docs.**
- [ ] **Step 4: Run the full suite.** Run `node --test test/*.test.mjs; git clean -fdq -- runs/`. Expected: **508 + new tests pass, 0 fail**. Record the count.
- [ ] **Step 5: Hand back for review and commit (Main).**

### Task 9: Live proof (owner go-ahead required first)

**Files:**
- Create: `docs/verification-<date>-e12-lite.md`
- Changes from the run: `watched-documents/watch-list.json`, `watched-documents/copies/*`, `watched-documents/checks/<id>.json`

- [ ] **Step 1: Get the go-ahead.** Main asks the owner in chat: "Run one real Check now (8 requests to rrc.texas.gov)?" Wait for a yes.
- [ ] **Step 2: Run the check.** Start `node scripts/serve.mjs 4391` in the worktree, open `#watch` and press **Check now** once.
- [ ] **Step 3: Write the record** in `docs/verification-<date>-e12-lite.md`:
  - the check ID;
  - per document: HTTP status, outcome, SHA-256 (first 8) and bytes;
  - the requests made (expected 8);
  - the `artifacts/` and `collected-sources/` hash comparison (unchanged);
  - the token grep over `watched-documents/` (0 hits);
  - screenshots;
  - **Not covered:** a real failed fetch, a real PDF change, a screen reader run, the automatic check (future, RRC-08), Edge if it wasn't reachable.
- [ ] **Step 4: Mark Injection-Storage Resources reviewed** (if the owner wants it), with their own note.
- [ ] **Step 5: Final steps (Main).** Run the whole-branch review, run the full suite, set RRC-18 to Implemented, then commit, push, open the PR and merge (agent owns merge). The owner runs worktree cleanup.
