# Phase 4 proof: version comparison (RRC-16), 2026-10-30

Scope: [Phase 4 design](superpowers/specs/2026-10-30-phase4-version-comparison-design.md) §10. No network and no acquisition: the comparison runs over committed versions only.

## Real pairs

All nine same-UIC pairs of committed versions are compared in `test/version-compare.test.mjs`. That covers v1 to v5 for UIC 000020838, 000109605, 000111186 and 000119875. Outcomes not listed are 0.

| Pair | Inventory | H-10 | Other datasets |
|---|---|---|---|
| 000020838 v1 → v2 | 1 same, 4 outside the other version's scope | 28 same | not collected in either |
| 000020838 v1 → v3 / v4 | 1 same, 4 outside the other version's scope | 28 same values, different report identity | not collected in A |
| 000020838 v2 → v3 / v4 | 1 same | 28 same values, different report identity | not collected in A |
| 000020838 v3 → v4 | 1 same | 28 same | BHP/SRT 0/0; casing and plugging not collected in A |
| 000109605 v4 → v5 | 1 same | 16 same | casing 9 same, plugging 7 same; relations not collected in A |
| 000111186 v3 → v4 | 1 same | 23 same | BHP 8 same; casing and plugging not collected in A |
| 000119875 v3 → v4 | 1 same | 28 same | BHP 1 same, SRT 98 same (22 quarantined on both sides) |

- **Report IDs reissued without value changes.** Between 2026-10-10 and 2026-10-29 the state's open-data portal gave all 28 H-10 report IDs for 000020838 new numbers, for example 3775425 became 3777861. Period and values stayed identical. Pairing by UIC + `period_start` shows this as "Same values, different report identity". Pairing by report ID would have shown 28 rows gone and 28 rows new.
- **v1's extra inventory rows.** v1's inventory query returned four other UICs: 000022085, 000039655, 000039709 and 000048561. Later exact-UIC queries cannot return them, so they are reported as outside the other version's scope, not as missing.
- **No real value changes.** No real pair has a changed value or a QC change. Changed values, duplicates, incomplete keys and window edges are covered by constructed fixtures.
- **Symmetry.** Comparing B with A gives the exact mirror of comparing A with B on all nine pairs.

## Protected-clean

A test hashes every file under `artifacts/` before and after comparing all pairs in both orders, and the hashes match. After the full suite, `git status --porcelain -- artifacts` is empty. The diff from `main` touches no file under `src/`, `scripts/` or `artifacts/`, and the committed-replay test passes unchanged.

## Tests

`node --test test/*.test.mjs` passes 499/499: the 465 baseline tests plus 34 new ones.

## Browser check (Chrome, local server)

- **Side order.** 000020838 opened as `#compare/<v3>/<v2>` was rewritten to `#compare/<v2>/<v3>`, so A is the earlier collection (OD-5). The page states that it does not say which version is correct.
- **H-10 rows.** All 28 show "Same values, different report identity", keyed by `uic_number` + `period_start`, with each side's row reference.
- **Accessibility.**
  - All 20 tables have captions, and no header cell lacks `scope`.
  - The 20 scroll regions are focusable and named.
  - Focus moves to the comparison title.
  - There is no download link.
- **Refusals.** A different-UIC pair (000020838 against 000056484) is refused with no rows. A version not listed by the server is refused with "Only preserved versions listed by this server can be compared." (A double full stop in that sentence was fixed in `31e9488`.)
- **TRIPPET v4 → v5** renders 156 rows.
- **Keyboard path.** From a version page: version picker summary, then "Open comparison", then Enter. The comparison opens with focus on its title.
- **Network and console.** The page made no external requests. The only console error is the existing `/favicon.ico` 404.
- **Not done.** No screen-reader session was run.

## Independent review

An Opus reviewer ran a read-only review at `7885c2f` and gave a PASS, with no critical or important findings. It ran mutation checks on keys, multiplicity, scope, comparability, refusals and the stale-result guard.

Fixed in `31e9488`:
- **Minor 1.** Mirror order could differ when keys of different JSON types tied as strings.
- **Minor 3.** No test covered the stale-result guard. Two tests now hold verification open to cover it.

Recorded, not fixed:
- **Minor 2.** A field absent on one side and `null` on the other shows as `null → null`, and `-0` shows as `0`. Neither occurs in committed data.
- **Minor 4.** The wording test strips two `source_revisions` key names globally.

Ruling: banned words that appear only inside verbatim source names or values, such as `updated` in `inventory_rows_updated_at` or text inside an ETag, are acceptable (spec §7.3).
