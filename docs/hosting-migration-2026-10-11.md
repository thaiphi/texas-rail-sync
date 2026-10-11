# Hosted migration checkpoint — October 11, 2026

Status: runtime migration remains a design checkpoint. A subsequent exact private database archive copy is complete; see `verification-2026-10-11-supabase-data-copy.md`. Runtime, pins and deployment are unchanged.

## Verified destinations

- GitHub destination supplied by owner: `thaiphi/texas-rail-sync`. GitHub CLI access failed twice with `error connecting to api.github.com`; privacy, branch and synchronization are not independently verified.
- Lovable Texas Rail Sync: `f0e9357f-02d2-4f69-8979-05a2e7bda2b3`, inspected commit `dd90523d5703d39918c41e792cf3429bf18b80c1`. It contains a TanStack Start starter, not the existing Explorer implementation. It is unpublished. Its current “official project home” metadata must be replaced with independent-app wording during transfer.
- Supabase Portfolio: `phxiqnsebqaalvkanljb`, thaiphi's Org (`qrhxxtjtjatfumoqdorh`), us-east-1, ACTIVE_HEALTHY. Public schema inspection returned no tables. Organization reports the Free plan; no paid upgrade authorized.
- Eye clinic and phi-analytics are outside the write scope.

## Preservation and migration boundary

The existing feature inventory in `feature-preservation-2026-10-10.md` remains the acceptance checklist. Preserve browser assets, source acquisition/normalization logic, tests, original source bytes, artifact IDs, manifests, dictionaries, quality reports, run evidence, CSV/JSON/TAR formats and independent pins. Transfer source without regenerating the app or rewriting either repository's history.

`src/pipeline.mjs` currently publishes through exclusive filesystem locks, staged byte verification and atomic directory rename. `scripts/serve.mjs` enforces same-origin loopback writes. Neither contract can be replaced by a bucket URL or a permissive CORS rule.

Proposed storage adapter: retain local publication for existing offline use; add a separate remote publication path. Store original artifact/source/run bytes in private Storage objects without replacement. Store an indexed version catalog and run references in Postgres. Publish a catalog entry only after every required object hash and byte count verifies. Use a unique version identity and transactional catalog publication to prevent conflicting concurrent publication. Identical retries verify existing bytes; conflicting retries reject. Failed upload sets must remain unavailable as completed versions. Object storage has no assumed atomic directory rename.

Keep normalization, calculations, fixture classification, source-scope validation and whole-version export verification shared with the existing implementation. Do not reconstitute evidence from database fields or mark missing run evidence successful. Existing versions are copied byte for byte and verified before becoming visible; opening them never repins Explorer or Analytics.

Hosted request authorization needs an explicit access model before public collection is enabled. Do not expose privileged keys in browser code or make evidence buckets public by default. Use a TRRC-specific namespace in Portfolio to avoid collisions with other applications. RLS/policies must follow the chosen ownership/access model, not grant arbitrary authenticated users access to everything.

## Runtime and charges requiring a decision

Retaining the existing Node 24 collector minimizes changes but requires a verified Node hosting destination and its cost. Moving execution to Supabase Edge Functions requires compatibility and resource-limit validation; their temporary filesystem resets between invocations. A storage mount is not evidence that the existing lock/rename semantics remain equivalent. No runtime option is implemented or selected by this checkpoint. No additional charges have been incurred by these read-only checks.

Hosted Analytics handoff additionally requires coordination with its owner: current transport origins are local and quarantined-record eligibility remains unresolved. Do not loosen receiver validation or change phi-analytics here.

## Release gates

1. Obtain repository access and verify owner/privacy/connected branch before integrating code; preserve both histories.
2. Review access model, remote publication contract and runtime/cost choice before applying migrations.
3. Exercise duplicate/concurrent publication, interrupted upload, tampered/missing objects, fixture rejection, retained quarantine and unavailable evidence.
4. Run existing validation, provenance, browser, archive and compatibility checks; distinguish environment blocks from passes. Prior full-suite failures remain open until rerun successfully.
5. Verify protected data/pins unchanged; test all preserved routes and collection-to-result navigation against the feature matrix.
6. Independently review implementation and evidence before preview deployment.

## Current official references

- https://supabase.com/docs/guides/functions/ephemeral-storage
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/docs/guides/platform/manage-your-usage/storage-size

These were retrieved through Supabase MCP documentation search on October 11. They support persistent Storage and private downloads; they do not establish drop-in compatibility with Explorer's filesystem publisher.
