# Scope

Work in the independent `texas-rrc-explorer` repository. Its scope is bounded official UIC, H-10 and related RRC ODP wellbore/test records for explicitly selected wells: acquisition, normalization, source/identity/quality checks, versioned exports and browser inspection. It also covers watched official RRC documents (owner-triggered check, rrc.texas.gov only) under RRC-18.
- The related ODP datasets are BHP `qxfy-wcfs`, SRT `h54t-xnbi`, casing `u9m4-xnh6` and plugging `wfzn-9fje`. They are queried per selected well under [ADR 004](docs/adr/004-wellbore-identity-and-relations.md) and requirements RRC-11 to RRC-16. Each phase still needs its own authorized brief.
- New datasets are local only until a separate hosted-parity decision is made.
- Analytics, permitting (E05, full E12) and portfolio implementation belong to their own sibling repositories.
- Do not expand into GIS (including well bottom location `uumf-5r4y`), statewide extraction or scheduled refresh without an authorized task, and do not invent public observations.
- Locally, a Socrata app token is read from the environment (`TRRC_SOCRATA_APP_TOKEN`) and sent only as a header. Never write its value to any file, log or commit. Hosted tokens are not authorized (D7).

Read [README.md](README.md), [SPEC.md](SPEC.md), [SOURCE_PROOF.md](SOURCE_PROOF.md) and [GATES.md](GATES.md) for the current contract and evidence. Preserve raw source bytes, original identifiers, missing-versus-zero distinctions, dictionary/QC/provenance, old artifact versions and disclosed source limitations. Use direct Node checks; an acquisition or export run that changes files needs scope in the authorized brief.

## Docs map

| Topic | Where |
|---|---|
| Product contract and evidence | [SPEC.md](SPEC.md), [SOURCE_PROOF.md](SOURCE_PROOF.md), [GATES.md](GATES.md), [GLOSSARY.md](GLOSSARY.md), [DESIGN.md](DESIGN.md) |
| Requirements and status | [docs/requirements.md](docs/requirements.md), [GitHub Issues](https://github.com/thaiphi/texas-rail-sync/issues) |
| Architecture decisions | [docs/adr/](docs/adr/) |
| Agent team and process | [docs/agent-team.md](docs/agent-team.md), [docs/agent-workflow.md](docs/agent-workflow.md) |
| Designs and plans | [docs/superpowers/specs/](docs/superpowers/specs/), [docs/superpowers/plans/](docs/superpowers/plans/) |
| Running, testing and deploying | [README.md](README.md), [docs/deployment.md](docs/deployment.md) |

## Task tracker

Work is tracked publicly in [GitHub Issues](https://github.com/thaiphi/texas-rail-sync/issues): one issue per requirement row in [docs/requirements.md](docs/requirements.md) (`RRC-xx`, labelled `requirement`), and the open AI Dev Tools Zoomcamp work (`ZC-xx`, labelled `course`) in the [Zoomcamp final project milestone](https://github.com/thaiphi/texas-rail-sync/milestone/1). Before starting work, find or create its issue and work to that issue's acceptance criteria. Every brief names the issue, every PR references it (`Closes #<n>` when it completes the issue), and evidence is recorded on the issue before it is closed. `docs/requirements.md` stays the detailed evidence record; keep the two in step.

## Coordination and delegation

Read and explicitly apply [the delegation workflow](docs/agent-workflow.md) (a copy of the shared sibling workflow) and the team roles in [docs/agent-team.md](docs/agent-team.md) before delegation. This entrypoint adopts those rules; the sibling portfolio's AGENTS.md is not automatically inherited.

Use this repository's verified absolute Git root in every seven-field brief; map relevant RRC requirement IDs or explain maintenance N/A, and specify allowed files/ownership and concrete acceptance checks. Main checks slots before dispatch/reactivation: at most two active subagents including Astra, with non-overlapping write ownership. Astra works at bounded design/contract and meaningful review checkpoints, then releases its slot.

Main retains coordination, integration, Git and final verification, checks root/target paths before separately authorized staging or committing, and relays useful results/blockers promptly. Workers never stage, commit or push, revert other edits or spawn helpers. These are procedural safeguards; no scheduler or hook enforcement is established.

Keep `docs/agent-workflow.md` in step with the sibling workflow when either changes; continue independent authorized work without silently dropping these safeguards.
