# ADR 001: Preserve the independent runtime and pinned artifact contract

Date: October 9, 2026. Status: implemented within the bounded core scope; independent review pending.

The official sample already reconciles five inventory records and 28 linked monthly reports and is independently pinned by Analytics. Refresh reliability and execution inspection must not change those bytes or require a shared service/database.

Keep the dependency-free Node 24 pipeline and browser ES modules. Extract artifact construction into reusable functions while retaining the existing schema, transformation version and original artifact bytes. Pass snapshot directory and artifact ID explicitly. Refuse conflicting versions; compare identical repeats; stage/readback-check new publication under a per-version lock. Retain failed collection sources rather than presenting partial output as verified.

Use a single fixed three-stage recorder for live collection and offline processing. Combined boundaries match the actual code; input/output evidence retains the underlying acquisition, raw preservation, parsing, parent linkage and QC detail. A fourth display node marks the external consumer boundary. Historical timing/status stays unrecorded. Persist separate terminal invocation records and expose them through read-only local routes; there is no authoring, trigger, retry or schedule interface.

Keep browser pin curation independent from new exports. Verify external manifest and normalized payload SHA256 before showing the pinned data. Selecting an execution does not change the displayed inventory, and the interface says so. Analytics continues to consume a local copied pin with Explorer stopped.

Consequences: no additional package/install service or schema migration; original exhibit reproducibility is preserved. Filesystem locking does not provide crash recovery: interrupted publication can retain a stale lock/staging directory, and terminal-only recording can omit an interrupted run. Scheduling/statewide completeness and optional GIS retain their original P2/P1 scope and remain open. A future journal or scheduler needs its own reviewed design.

Ticket convention: cite the owning RRC requirement ID and completion-plan work package (for example, RRC-05 / E1); retain acceptance evidence and explicit gaps in `docs/requirements.md`. This convention documents work without claiming that an external ticket service exists.
