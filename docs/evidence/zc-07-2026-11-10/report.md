## Alert
- **Name:** Explorer collection failed (rule `explorer-collect-failed`, folder Explorer, labels `journey=collect`, `service=explorer`)
- **Status:** firing
- **Start time:** 2026-11-10T14:34:50Z
- **Summary:** An Explorer well collection failed in the last 5 minutes (outcome=failed; rejected requests are not counted). Values A=1, B=1, C=1.

## Evidence
- **Loki** (`{service_name="explorer"} |~ "(?i)fail|error"`, last 15 min): one ERROR line, `stage failed`, with `run_id=53f15cd0-6a23-4877-ae6d-681895339228`, `trace_id=7f5fc095c2cc0b4ea7681541d09fdf97`, `stage=load`, `error_code=SOURCE_LIMIT`, `outcome=failed`.
- **Loki, same trace id:** `collect started` (INFO, `test_fixture=true`), then `stage failed` and `run finished` (ERROR, SOURCE_LIMIT, load).
- **Prometheus** (`sum by (stage, error_code) (rrc_collect_runs_total{outcome="failed"})`): `{stage="load", error_code="SOURCE_LIMIT"} = 1`.
- **Offline reproduction** (`node scripts/collect-fixture.mjs`, before the fix): `status 502, outcome "failed", stage "load", errorCode "SOURCE_LIMIT"`. This matches Grafana.
- **Error message:** `Source byte cap exceeded`, raised in `src/sourceFetch.mjs` `fetchOnce` (line 44, the streamed-size check). It is reached through `collectPublicSnapshot` (`src/acquisition.mjs:38`) and `fetchSourceWithThrottleRetry`.

## Root cause
The latest commit on the demo branch, `cd9e5e2 Tighten source download cap`, changed both byte-cap checks in `src/sourceFetch.mjs` `fetchOnce` (the declared `content-length` check and the streamed-size check) from `10_000_000` to `1_000_000`. Every source response over 1 MB, including the canned fixture data, is now refused with `SOURCE_LIMIT` at the load stage, so the collection fails.

The documented contract is a 10 MB cap per response: README ("a 10 MB response cap") and ADR 002 ("individual files at 10 MB"). `test/source-fetch.test.mjs` ("declared and streamed byte caps … exact cap is accepted") also pins 10,000,000 bytes as the accepted maximum.

## Fix
Set both thresholds in `src/sourceFetch.mjs` back to `10_000_000`, reverting cd9e5e2's two-line change. This is the smallest change that brings the code back in line with the documented cap and the existing tests. The existing test already proves the cap, so I added none and changed none.

## Tests
| | Fixture collection | `npm test` |
|---|---|---|
| Before | `outcome: "failed"`, stage `load`, `SOURCE_LIMIT` (502) | 722 tests: 664 pass, **57 fail**, 1 skipped |
| After | `outcome: "succeeded"`, stage `none`, errorCode `none` (201) | 722 tests: 721 pass, **0 fail**, 1 skipped |

Before the fix, most of the 57 failures threw `Source byte cap exceeded` (SOURCE_LIMIT) directly from `fetchOnce`, for example in `test/wellbore-pipeline.test.mjs`, `test/bounded-collection.test.mjs` and the cap test in `test/source-fetch.test.mjs`. The rest were assertions failing on downstream effects of that error. For example, `test/collect-fixture.test.mjs` got `502 !== 201`, and some `assert.rejects` validators caught the cap error instead of the error they expected. All 57 pass once the cap is restored and nothing else changes. (The PR body says "all" failures were the cap error. This corrected wording is the accurate one.)

## Pull request
https://github.com/thaiphi/texas-rail-sync/pull/59: `oncall-fix/20261110T143455112Z` into `oncall-demo/20261110T143326889Z`, commit `e8d9129`. It has not been merged and is waiting for human review.

## Notes
- One compound Bash command (`npm test … ; grep …`) was refused by the permission list. I reran it as separate permitted steps (`npm test` on its own, then the Grep tool), so no evidence was lost.
- The test runs left untracked run records in `runs/`. I did not commit them.
- To confirm the documented 10 MB cap, I searched `README.md` and `docs/adr/` in addition to `src/` and `test/`. I read only permitted docs.
- Full test logs are in `npm-test-before.txt` and `npm-test-after.txt` in this directory.
