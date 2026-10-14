**Summary**
The connected browser-save path is sound for its scope. `public/browser-library.js` stores only server-fetched TAR bytes plus live registry pins, verifies by strict parse, canonical rebuild with the shared builder (`public/archive-bytes.js`, re-exported by `src/archiveBytes.mjs:2`) and byte equality, then re-runs the existing integrity loader over in-memory files. Every open re-verifies; saved copies never enable Analytics, never show a default-pin badge, and open only when the server does not list the version. The three first-run failures were real (aliased Buffer memory, single pagehide listener) and the fixes are correct at `browser-library.js:10` and `app.js:31`. Verdict: **PASS** for browser-local Save→Library→Reload→Outage→Inspect→Download, with one MED usability defect and LOW notes. No hosted release and no backend approval.

**Files touched**
None.

**Needs judgment**

MED (fix before calling the browser milestone closed; not security):
- **Back-forward restore leaves dead links in a saved view.** `app.js:31` revokes all saved blob URLs on `pagehide` and nulls `savedView`; there is no `pageshow` handler. After a bfcache restore of a saved-only dataset, the rendered download links still point at revoked `blob:` URLs and `fileHref`/`tarHref` (`app.js:207-208`) now return server paths that are unavailable in the outage case. Analytics stays disabled because `markSavedView` nulled `analyticsPins` (`app.js:28,229`), so there is no trust escalation. Fix: on `pageshow` with `event.persisted`, re-open `currentRoute.artifactId` when `data` was a saved view, or skip revocation when the page may be persisted. Not covered by `test/navigation-redesign.test.mjs:73`.

Verified, no finding:
- Strict TAR: size, alignment, two zero end blocks, no trailing bytes, 103-entry cap, NUL-terminated safe names, regular files only, ustar magic, checksum, 10,000,000-byte entry cap, duplicates (`browser-library.js:17-34`). Header fields the parser does not inspect (mode, mtime, prefix) are covered by full-byte equality with the canonical rebuild (`:41-42`).
- Provenance and fixtures: `archive-bytes.js:6,18` refuse non-public pins and fixture manifests regardless of the stored legacy flag; `artifact-integrity.js:3,10` refuse again at load. Legacy `defaultPinned` only relaxes the manifest-provenance and version-pins requirements for self-consistency; it never becomes a badge (`app.js:146` badge comes only from `availableVersions`) or live proof (`:217-218,231`).
- Save: pins only from `livePinsFor` (`app.js:234`), TAR from the server (`:238`), verified before `add()`; `ConstraintError` re-hashes stored bytes and compares normalized pins before reporting `already_saved`, otherwise `VERSION_CONFLICT` with no overwrite (`browser-library.js:60-67`); quota or other abort reports `SAVE_FAILED` with nothing stored. Concurrent two-tab saves converge via the same path.
- Ownership: `ownedBytes` copies `ArrayBuffer` and `Uint8Array` inputs (`:10`), entries are `slice` copies (`:34`), stored `tarBytes` is a fresh buffer (`:57`); tests `:43-56` cover caller and returned-buffer mutation and Buffer views over larger memory.
- Saved view: `analyticsReady` requires `!savedView` (`app.js:24`); `openDataset` prefers the live version and uses the saved copy only when unlisted (`:172,176`); conflicting saved copies lose their Open button (`:219`); stale tickets revoke their own URLs (`:176`).
- Content types: HTML served as `text/plain` from blob URLs (`app.js:209`), so saved source pages cannot execute as same-origin documents.
- Calculations and QC: the displayed artifact is the verified `normalized.json` from the package; nothing is recomputed.

LOW:
- `app.js:246` revokes the backup blob URL on a zero-delay timer after `click()`. Chrome tolerates this; some browsers can cancel the download. Revoke on a short delay or on `focus`.
- SHA-256 equality is used as byte identity for `already_saved` (`browser-library.js:66`). Acceptable; a direct byte compare would be cheaper to reason about.
- The 100-character name test now exercises a trailing-empty-segment path (`test/browser-library.test.mjs:65`); a true 100-character name is covered by the first assertion. Production is not relaxed.

Excluded: backend guest files (separate follow-up review), two-tab and legacy-browser checks still running.

**Gates**
- Read (actual): `public/browser-library.js`, `public/archive-bytes.js`, `src/archiveBytes.mjs`, `public/app.js` save/library regions, `public/index.html`, `public/artifact-integrity.js`, `test/browser-library.test.mjs`, `docs/screenshots-2026-10-13-connected/save-probe.json`, targeted log, first full log failures, final full log summary.
- Main's results (reviewer UNRUN): first full 230/233 with the two hash-mismatch and one pagehide failures as described; targeted 7/7; final full 235/235 (two new tests, consistent); Chrome save probe 10/10 including reload exact hash, corrupt same-ID conflict, quota atomicity, outage open, Analytics disabled, 29 blob links, no errors, default pin unchanged. The "fixed full" log contains no summary lines I could parse, so I relied on the final full log.
- Not approved here: hosted release, guest backend, live collection, deployment, migration, billing.

Bounded review complete; slot released.
