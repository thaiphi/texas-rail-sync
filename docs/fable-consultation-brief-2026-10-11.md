# Fable consultation brief — October 11, 2026

Status: completed one redacted advisory consultation through Claude Code 2.1.296, Fable 5.1, high effort, authenticated to the existing Claude Team subscription. The model picker showed Fable without a usage-credit requirement, and `/usage` showed an included weekly Fable allowance (28% used before consultation). No paid-usage consent, billing-setting change or API-key billing was enabled by this task. This is not a billing-account audit or guarantee about account charges. No implementation or deployment was performed.

Dispatch boundary: automatic approval review rejected transmitting this full internal brief because it contains private repository paths and implementation details. The full brief below stayed local. The completed consultation instead received a generic, redacted description of the guest collection/browser-save/analysis-handoff scenario, with no private code, repository names, account identifiers or internal implementation state. All consultant tools, customizations and additional advisors were disabled. See `fable-consultation-result-2026-10-11.md` for conclusions and Main's corrections. This is design advice, not code review or release acceptance.

## Project

- TRRC owning repository: `C:/Users/thai.phi/Downloads/python/portfolio/texas-rrc-explorer`, private GitHub `thaiphi/texas-rail-sync`.
- Injection owning hosted repository: `C:/Users/thai.phi/Downloads/python/portfolio/swd-injection-analytics/tmp/lovable-transfer/well-injection-insights`, private GitHub `thaiphi/well-injection-insights`.
- Portfolio: `C:/Users/thai.phi/Downloads/python/portfolio/phi-analytics`; remains untouched. It is the public portfolio/entry point, not a merged application backend.

## Task class

Owner-requested independent architecture consultant: Claude Fable 5.1, exact requested model `claude-fable-5-1`, high effort. Advice only from the supplied context. Built-in and MCP tools disabled, customizations disabled for this invocation. No repository inspection by the consultant is implied. This does not replace the required independent final code reviewer.

## Brief

Recommend a concrete, practical customer demo and subsequent signed-in experience across two existing apps linked from Phi Analytics. The owner wants visitors to prove TRRC through a real bounded collection without registering, save the result in the browser, and transfer it to Injection Analytics. Challenge assumptions rather than simply agree with Main.

Relevant TRRC contracts: RRC-01/02 lookup/selection/acquisition; RRC-03/04 unchanged validation/calculations; RRC-05 immutable version/export; RRC-06 coherent browsing; RRC-09/10 actual process evidence. These mappings come from the current TRRC runtime-options packet. This is design advice; no SWD implementation requirements are claimed complete.

One bounded consultation, one model turn, aim for at most 1,000 words of final advice. Use the authenticated Claude subscription in interactive mode. No API billing, paid-credit consent, additional charges or billing-setting changes are authorized. Stop if the included allowance is exhausted or a paid-usage prompt appears. No alternate-model substitution or further consultation without reporting. Stop at the first billing/access/tool blocker.

## Scope

No code, files, services, permissions, accounts, Git operations, live collection, purchases or child agents. The snapshot below is local context for Main only; the consultant received the redacted generic scenario. Main owns the eventual report. Other owners retain all existing edits. Architecture changes are proposals requiring a later concrete design/plan and their owning repositories' acceptance checks.

### Owner intent and existing state

- Phi Analytics should remain publicly accessible, with links to the two applications and a working no-login demonstration.
- Injection Analytics already runs calculations, synthetic examples and customer file imports in browser-session state. Its hosted Portfolio connection check works. Sign-in and cloud saving are not implemented. Preserve its existing unauthenticated local workflows, units, numerical tests and stale-output guards. The separate receiver owner handles its code.
- TRRC preserved dataset browsing works on the authenticated working preview. That does not prove public customer access or live hosted collection. The older preview host's 503 origin remains unresolved.
- Local TRRC lookup/collection is implemented using Node and filesystem evidence. Hosted POST lookup/collection presently checks authentication then returns unavailable. Its browser controller does not yet supply an auth token. Browser saving alone cannot make this collector run online.
- Identifiers remain exact nine-digit UIC/eight-digit supported source API strings. Candidate selection is explicit. Existing date bound is 1–36 inclusive months; candidate cap 25 and monthly-response cap 1,000 are completeness refusals. Proposed guest limits must be explicitly narrower policy, not a claim of new source support.
- Collector preserves official response bytes, retrieval sidecars, lookup/selection proof, fixture/public classification, normalized records, quality reasons, immutable version and hashes. Sources have per-response 30-second/10MB caps; source acquisition currently involves seven sequential requests.
- Three real stage boundaries are `load`, `normalize-qc`, `export`. Show actual evidence, failed/skipped states and current-request progress independently from old runs. No fake stages or execution animation.
- Current tests remain 183/186 passing with three directory-rename EPERM failures. A standalone synthetic filesystem probe reproduced EPERM outside app code; responsible Windows component is unproven. Do not weaken publication guarantees or change permissions to pass. No release acceptance until blockers and missing checks are addressed.
- Existing Supabase Portfolio project serves the frozen TRRC archive. No new job schema/worker or shared login is implemented. Existing data, pins and archive bytes must not change during migration.
- Private uploaded/derived analyses must never become public just because upstream RRC records are public. Demo synthetic, public reported, assumed and calculated values remain distinct. Quarantine reasons remain visible and unfit data cannot become analysis-eligible merely by dismissing warnings.
- Browser-local durable saving would use IndexedDB, with explicit quota/failure/clearing behavior and a portable download. Different app origins cannot directly read one another's IndexedDB.
- The injection receiver's handover documents supported Explorer TAR/pinned imports. Preserve real schema and integrity checks; do not invent an already implemented automatic cross-app import, repinning, acknowledgement or cross-origin session sharing. First practical handoff can remain package download/import, with deliberate user adoption of an exact version.
- Previously proposed runtime: Supabase Auth/private jobs plus a durable Node worker to preserve the existing collector. Alternative: queued Supabase-only short steps with new trusted storage adapters and resource measurement. Single long Edge execution is not established safe: current documented Free wall time 150 seconds, CPU 2 seconds, memory 256MB. No provider/storage/backup costs or free-tier fit have been proved.
- Guest collection is the owner's newly proposed extension to the prior sign-in-to-collect policy. Define server-enforced bounded quotas, ownership/resume of requests, idempotency and retention. Browser counters alone cannot enforce abuse budgets. No unattended expensive/global acquisition.
- Sign-in could be reserved for cloud saving, access from other devices and agreed larger allowances. Same account across both tools is proposed through Portfolio Supabase Auth; a tested sign-in/return flow is required between separate origins.
- Customer-facing public app URLs must be tested separately from Lovable editor/private-preview authentication. Publishing, visibility changes, new costs and infrastructure remain separate decisions.

## Validation

No executable checks are permitted in this advice-only request. Treat Main's snapshot as reported evidence, not your independently verified code audit. Clearly mark feasibility that needs source inspection or measurements. Preserve the distinct dataset, well/report, recorded-run and collection-request selections.

Define the acceptance checks for a fresh visitor: actual candidate lookup, explicit identity/date confirmation, fresh collection, recorded progress, verified browser save, refresh/reopen, source/quality inspection, complete package export and receiver validation. Include source failure/no reports, duplicate clicks, interrupted job/storage, tampering, fixtures, quarantine and cross-request access. Define a separate signed-in cloud-save/cross-device test; do not conflate it with guest success.

## Report

Give a recommendation and tradeoffs between bounded real guest collection plus browser saving, a cached/replay demo honestly labeled as such, and a Supabase-only rewrite. Explain transient server evidence/job retention versus browser-only customer library; what must run on a backend; which operations require sign-in; ownership/privacy/quota implications; origin-safe Analytics handoff; migration and cost unknowns; and a short staged delivery sequence. Identify any proposal that changes a current contract or access policy. Do not claim deployment or implementation.

## Return

Return ONLY: (1) Summary, 2–4 sentences; (2) Files touched: none; (3) Needs judgment, including skipped/unverified evidence and concrete decisions; (4) Gates: advisory-only, executable gates unrun, proposed acceptance checks. Say the consultation is complete and its slot can be released. Main will translate the advice for the owner.
