# Supabase preserved-data copy

This completes an exact private archive copy, not the application backend migration or release acceptance.

## Destination and scope

Portfolio project `phxiqnsebqaalvkanljb`, private schema `trrc_archive`. Created through Supabase MCP migration `create_private_trrc_migration_archive`; SQL source is `sql/trrc-archive.sql`.

Copied 166 files / 8,507,295 original bytes: all three artifact directories, raw evidence, collected source directories, lookup evidence, 29 retained run records and both browser pin files. These are original file bytes; normalization, classifications, quarantine reasons, counts and identifiers were not recalculated or relabeled. Shared byte-identical blocks are stored once, while the manifest retains each original path and ordered block references. This is a Postgres bytea archive, not a Supabase Storage bucket or a new web-facing records schema.

Snapshot ID: `trrc-d6678bd4e24e4d4cd0e224c39c98aa8af9ce543dbd61545c6fa155eeefef6186`.

Local manifest: `tmp/supabase-archive-2026-10-11/manifest.json`. Local preparation script: `scripts/prepare-supabase-archive.mjs`. Re-running preparation only writes scratch transfer files; it does not collect data, publish versions, record runs or change pins.

## Verification

- PASS: database reconstructed every original file from ordered blocks and calculated SHA-256 and byte counts: 166 files, 166 valid, 8,507,295 bytes, no failures. Reusable query: `sql/verify-trrc-archive.sql`.
- PASS: snapshot marked verified only after all file checks and exact manifest comparison succeeded; database `verified_at` is `2026-10-11 05:22:55.205159+00`.
- PASS: both archive tables have RLS enabled; anon and authenticated roles have neither schema usage nor table SELECT privileges. No browser policy or privileged client key was introduced. Existing application permissions were not changed.
- PASS: local preparation repeated after transfer produced the same content-derived snapshot ID.
- PASS: `node --check scripts/prepare-supabase-archive.mjs`.
- PASS: `node tmp/navigation-redesign-2026-10-10/preserve.mjs` reported all 166 protected Explorer files and 14 consumer evidence/pin files unchanged. Other listed UI/test changes predate this migration; they were not reverted.
- NOT RUN: full application test suite in this round; application runtime code was unchanged. Prior full-suite environment failures and Analytics handoff gaps remain unresolved.
- BLOCKED: GitHub CLI could not reach api.github.com; no Git changes, commits or pushes attempted.

One verification orchestration call failed to parse before executing any operation; the corrected call passed. No data transfer or integrity check failed.

## Remaining work

The live app still reads local files. This archive does not enable hosted lookup, collection, downloads or Analytics transfer. Next implement and review a runtime/storage adapter and access model, verify hosted collection and immutable publication, and rerun release gates before any preview deployment. Use the existing feature-preservation matrix and hosting migration checkpoint. No new subscription, paid upgrade, deployment, Eye clinic changes or phi-analytics edits were made.
