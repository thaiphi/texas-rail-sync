# Shared source-fetch adapter checkpoint

The owner explicitly resumed the next bounded step after the prior checkpoint closed. Start: October 13, 2026, 00:17:53 UTC (October 12, 19:17 CDT); deadline: 01:17:53 UTC. Only TRRC is writable. Supabase Free only, no hosted deployment, cloud writes, permissions/billing changes, Git writes or unnecessary live collection. Existing uncommitted work and untracked run directories are preserved; Phi Analytics is untouched.

## Implementation and ownership

Original Opus 5.5/high inspected the actual code and supplied a read-only patch proposal for `src/sourceFetch.mjs`, `src/acquisition.mjs`, `src/lookup.mjs` and `test/source-fetch.test.mjs`. Main owns integration and verification. Original Fable 5.1/high independently reviewed the actual extraction and returned **PASS for this bounded scope**, with existing low-priority issues retained. Review: `review-2026-10-12-source-fetch-fable.md`. CLI transcript confirmed `claude-fable-5-1`; high effort observed at launch. Both assignments finished and exited. No overlapping writers or child agents.

The actual fetch logic formerly duplicated in lookup and collection now lives in `src/sourceFetch.mjs`, without filesystem or Storage dependencies. Lookup re-exports the same function for existing callers. Collection uses a trusted `onResponse(status)` callback to preserve HTTP status on errors before the body is validated or written. Existing caller-generated source targets, source sidecars, fixture rules, streaming cap, timestamps, hashes and file/export formats are retained. No new URL-input endpoint or guest service is introduced.

## Passed gates

- Tests applied first: 7 new shared-entry tests failed because the module did not exist; 1 existing collection-status guard passed. Then the proposed source patch passed **8/8** (`tmp/source-fetch-red.log`, `tmp/source-fetch-green.log`).
- Full isolated direct bundled Node suite: **228/228**, zero failures/skips (`tmp/source-fetch-full.log`). Includes existing lookup, collection, source-validation, archive/export and continuation tests.
- Direct TypeScript compiler: exit 0. `git diff --check`: exit 0. `git diff --quiet -- raw artifacts runs public/artifact-integrity.json`: exit 0 for tracked preserved evidence.
- Native Node fetch and native cached local Edge fetch matched **7/7 controlled HTTP cases**. Exact binary body/hash/size/metadata and fixture flag, observed status callback, HTTP 503, HTTP 204 with no body, declared and streamed 10,000,000-byte overflow, real redirect refusal and actual 30-second TimeoutError. Equivalent loopback fixtures only, not official-source collection. Ports, retrieval timestamps and wall durations are excluded from cross-runtime equality; retrieval validity and timeout duration are separately asserted. Result: `guest-source-fetch-parity-2026-10-12.json`.
- No Edge global Buffer shim. Two isolated probes ended normally (`EarlyDrop`), CPU 86/109 ms, captured total memory approximately 11.0 MB, limit-exceeded false. The actual 30-second wait is asynchronous wall time, not CPU. Runtime evidence: `guest-source-fetch-runtime-2026-10-12.json`. These are local observations, not peak RSS, a production admission cap or hosted guarantees.
- Browser rerun: **21/21**, ephemeral local read-only server, installed Chrome/Playwright, desktop and narrow layouts, existing datasets/quality/source/run/detail/filter/error/download checks (`tmp/source-fetch-browser.log`, `screenshots-2026-10-12-backup/probe.json`). No guest/browser-save claim.

## Remaining boundaries

Independent review found no extraction regressions. Deferred low-priority issues: refusal of oversize declared length/HTTP errors without explicit response-body cancellation (`src/sourceFetch.mjs:11-12`), and no explicit chunk-type check for injected fixture streams (`:14`). These were not silently changed during extraction; native fetch streams supply Uint8Array. Before hosted use, callers must continue deriving targets from `targetsForScope`, never client-supplied URLs. The existing missing-body message changed to lookup's text, with the same `SOURCE_INVALID` code; run records map errors by code.

The reviewer read probe files before the generated comparison was saved and therefore marked that comparison blocked, and did not execute TypeScript/preservation/browser checks. Main's completed comparison, compiler exit 0, tracked-data diff exit 0 and browser 21/21 above supply those later final results. This records new evidence without rewriting the independent review or implying reviewer execution.

Hosted TLS/official-source fetch, supported hosted runtime, Storage publisher, owned/fenced SQL journals, quota/admission/retention and browser saving are unrun/unimplemented. Controlled native-fetch parity does not verify official endpoint availability, full hosted I/O or Free quota headroom. No guest acceptance.

Documentation check: the Markdown changelog endpoint could not be read by the web tool because of its content type; the HTML [Supabase changelog](https://supabase.com/changelog) was read instead. Its October 12 TLS deprecation concerns project HTTPS configurations; these isolated probes do not establish hosted TLS parity. Current [Edge limits](https://supabase.com/docs/guides/functions/limits) were checked against the design. No SDK/cloud migration was performed.

## Final handoff

- **Passed:** 228 full tests, 8 targeted adapter tests, 7 real native-fetch parity cases, 21 existing browser checks, TypeScript, whitespace, tracked preserved source/artifact/run/pin checks, independent bounded review.
- **Failed during development, resolved:** seven new shared-entry tests before extraction; no final failure in the executed checks.
- **Blocked acceptance:** hosted/complete-I/O feasibility and guest-release acceptance remain unverified under no-deployment constraints. Local native-fetch parity is complete for controlled responses, not real public endpoint/hosted parity.
- **Unrun/unimplemented:** owned/fenced journals, Storage publisher/reader and interruption tests, hosted quota/headroom and admission cap, guest browser save/recovery, hosted collection and receiver import. No cloud permission/migration changes.

Pin SHA-256 unchanged: `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`. Source changes in this session: new `src/sourceFetch.mjs`, modified `src/acquisition.mjs` and `src/lookup.mjs`, new `test/source-fetch.test.mjs`. Evidence/review/checkpoint documents added; harness edits isolated in ignored `tmp/`. No datasets or new public runs created. Test-owned container `trrc-edge-fetch-20261012` stopped and removed; unrelated Docker state untouched. No commits, pushes, deployment, billing or permission changes.

Next bounded step: build and verify the journal-backed evidence reader and staged publisher against a controlled Storage transport, retaining hash/size/path ownership and exact publication sets. This can supply local adapter evidence, but cannot certify hosted Storage/SQL ownership, Free headroom or guest acceptance without the remaining gates. Do not apply migrations or deploy to force a pass.
