# Published site verification after republish (October 29, 2026)

Site: https://texasrrcexplorer.lovable.app. Deployed from `main` at `a1433d3` (PR #4), as the owner reported after republishing.

Checks ran 2026-10-29 04:24–04:29 UTC, from a machine with outbound network access. Expansion PRD item RRC-E00, which overlaps the G3 deployment gate.

## Result: read-only browsing works on the published site

The data routes had returned 503 since at least October 11. They now return 200, and every published download is byte-identical to the repository.

## Cause of the 503 (fixed in PR #4)

The published build runs on Cloudflare Workers. Workers does not implement `fetch(..., {redirect: 'error'})`: it throws a `TypeError` before sending the request ([Workers Request docs](https://developers.cloudflare.com/workers/runtime-apis/request/)). The bridge had used that mode since `373bd83` (October 11).

After the PR #3 republish, the 503 body changed to `BACKEND_FETCH_FAILED`. That code identifies a throw before any upstream response, which ruled out the October 16 gzip diagnosis as the cause. The gzip pass-through from PR #3 stays; it is harmless.

PR #4 switches the bridge to `redirect: 'manual'` and refuses any 3xx or opaque redirect with `502 BACKEND_REDIRECT_REFUSED`. Tests: bridge 13/13, isolated suite 325/325.

## Verified

| Check | Result |
|---|---|
| `GET /` | 200 |
| `GET /api/versions` | 200: 3 versions (`rrc-2026-10-09-uic000020838-v1` default-pinned, `…uic000056484-df804201…`, `…uic000020838-7aecd619…`) |
| `GET /api/runs` | 200: 29 recorded runs |
| `GET /artifact-path.json` | 200: `rrc-2026-10-09-uic000020838-v1` |
| `GET /artifact-integrity.json` | 200; SHA-256 `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`, identical to `main` (default pin unchanged) |
| Each version's served `manifest.json` | SHA-256 equals the registry's `manifestSha256` for all 3 versions |
| TAR downloads, published origin vs Edge direct | Byte-identical for all 3: `492ebaa6…81db8a` (v1, 1,325,056 B), `377721ac…2dbf6b9d` (000056484, 1,377,280 B), `69a93781…f605f8` (000020838 Oct 10, 1,393,664 B) |
| TAR contents vs `main:artifacts/<id>/` | Every file byte-identical: 13/13, 28/28, 28/28; no extra or missing files |
| Browser (Chrome, isolated profile): My datasets | 3 preserved public versions listed; all three passed in-page verification and show source identity (UIC 000020838 5 inventory/28 monthly; UIC 000056484 1/16; UIC 000020838 1/28; 0 quarantined); default pin unchanged |
| Browser console | One 404, almost certainly `/favicon.ico` (the page declares no icon, and that URL returns 404). Cosmetic. |

Full SHA-256 values:
- `rrc-2026-10-09-uic000020838-v1`: `492ebaa6b5f7c9353c39416dc72a1cf5180d1e9ba7a3af21d4b063c20e81db8a`
- `rrc-2026-10-10-uic000056484-df804201-eb4a-4aa5-8ef2-c550c6a70627`: `377721ac93c47313a9f5b58df2f581c9133cf9920ef74e390fef88392dbf6b9d`
- `rrc-2026-10-10-uic000020838-7aecd619-c19b-48ad-b354-832f5cc0cca0`: `69a9378185df7a1ecd8fe357d7d984eaf1b6258f4cc0b402c5f679f133f605f8`

## Not verified

- **Guest collection.** It is off: `TRRC_GUEST_ENABLED` was deleted on October 16. The page banner still offers guest collection. That is the owner-accepted behaviour (final review I1): the form answers "temporarily unavailable". No guest request was made.
- **Mobile layout and keyboard navigation** on the published site.
- **The deployed bundle's commit.** It was inferred from the new behaviour and the owner's report; Lovable was not queried.
