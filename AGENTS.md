# Scope

Work in the independent `texas-rrc-explorer` repository. Its scope is bounded official UIC, H-10 and related RRC ODP wellbore/test records for explicitly selected wells: acquisition, normalization, source/identity/quality checks, versioned exports and browser inspection.
- The related ODP datasets are BHP `qxfy-wcfs`, SRT `h54t-xnbi`, casing `u9m4-xnh6` and plugging `wfzn-9fje`. They are queried per selected well under [ADR 004](docs/adr/004-wellbore-identity-and-relations.md) and requirements RRC-11 to RRC-16. Each phase still needs its own authorized brief.
- New datasets are local only until a separate hosted-parity decision is made.
- Analytics, permitting (E05, full E12) and portfolio implementation belong to their own sibling repositories.
- Do not expand into GIS (including well bottom location `uumf-5r4y`), statewide extraction or scheduled refresh without an authorized task, and do not invent public observations.
- Locally, a Socrata app token is read from the environment (`SOCRATA_APP_TOKEN`) and sent only as a header. Never write its value to any file, log or commit. Hosted tokens are not authorized (D7).

Read [README.md](README.md), [SPEC.md](SPEC.md), [SOURCE_PROOF.md](SOURCE_PROOF.md) and [GATES.md](GATES.md) for the current contract and evidence. Preserve raw source bytes, original identifiers, missing-versus-zero distinctions, dictionary/QC/provenance, old artifact versions and disclosed source limitations. Use direct Node checks; an acquisition or export run that changes files needs scope in the authorized brief.

## Coordination and delegation

Read and explicitly apply [the shared delegation workflow](../phi-analytics/docs/swd-intelligence-lab/agent-workflow.md) before delegation. This entrypoint adopts those rules; the sibling portfolio's AGENTS.md is not automatically inherited.

Use this repository's verified absolute Git root in every seven-field brief; map relevant RRC requirement IDs or explain maintenance N/A, and specify allowed files/ownership and concrete acceptance checks. Main checks slots before dispatch/reactivation: at most two active subagents including Astra, with non-overlapping write ownership. Astra works at bounded design/contract and meaningful review checkpoints, then releases its slot.

Main retains coordination, integration, Git and final verification, checks root/target paths before separately authorized staging or committing, and relays useful results/blockers promptly. Workers never stage, commit or push, revert other edits or spawn helpers. These are procedural safeguards; no scheduler or hook enforcement is established.

If the shared reference is unavailable, Main supplies an accessible copy before delegation; continue independent authorized work without silently dropping these safeguards.
