# ADR 003 — Local browser transfer to Injection Analytics

Status: agreed transport v1, producer implemented; coordinated browser acceptance pending. Owner authorization2026-10-11 01:34:58UTC, Explorer actual start01:36:31UTC; fixed hard stop02:34:58UTC. Supports RRC-05/RRC-06 without changing artifact schemas, source pins or default dataset selection.

## Boundaries

Explorer owns only its producer UI/controller and tests. Analytics owns its independent receiver, validation, explicit confirmation and session adoption. Coordinator owns browser walkthrough. No cloud/authentication, CORS, deployment, permission change or shared storage is needed. Sender URLs and origins are exact local constants; changing hosting is a separate contract.

Explorer `http://127.0.0.1:4391` synchronously opens a new uniquely named window on user click: `http://127.0.0.1:4290/?rrcHandoff=<crypto.randomUUID()>#data/data`. Existing Analytics windows are preserved. No arbitrary destination or received fetch URL is supported. Popup failure leaves portable file downloads available.

## Wire contract

Every message has top-level `{channel:"swd-explorer-handoff",version:1,type,transferId,receiverId,...typeFields}`. Both IDs are primitive UUIDv4 strings. Both sides check exact origin and window source, exact channel/version/transfer binding and permitted fields. Wrong origins/sources are ignored; malformed messages from the bound window are rejected. Receiver creates a fresh receiverId per document and captures its opener. Sender pins the first receiverId; a changed receiverId invalidates transfer and never triggers automatic resending.

| Type | Direction | Additional fields |
|---|---|---|
| ready | Analytics → Explorer | none |
| offer | Explorer → Analytics | artifactId, packageBytes, hashes:{packageSha256,manifestSha256,normalizedSha256}, scope:{kind:"whole-version",inventoryUics,historyUics,periodStart,periodEnd} |
| request-package | Analytics → Explorer | none |
| package | Explorer → Analytics | bytes:ArrayBuffer, transferred copy |
| status | Analytics → Explorer | state:receiving/validating/previewed/adopted/rejected/cancelled, optional bounded code/message |
| cancel | Explorer → Analytics | optional bounded code/message |

Whole-version scope is independent of Records filters or selected well. UIC arrays are sorted/unique from normalized inventory/monthly rows. Period bounds are min/max actual `period_start`, not requested query dates. Empty history has null bounds. Current strict sender scope validation refuses invalid source UIC/date values before opening a receiver; coordination is required before defining a broader projection for quarantined invalid identities/months. It never silently discards or repairs those records; portable exports preserve them. The three current public versions satisfy the strict projection. The [bounded repair packet](../verification-2026-10-11-bounded-handoff-fixes.md) documents dense-record/nonzero-year/byte-chunk validation and an absolute60-second sender validation deadline from first receiver progress. It also confirms that the current receiver's all-accepted validator and scope constraints prevent claiming quarantine or empty-history interoperability from sender behavior alone.

Sender fetches only `/api/versions/<artifactId>/download` using verified version pins, rejects redirects and enforces streaming size bounds before accumulation. TAR length must be1024–80,106,496 bytes inclusive,512-byte aligned, and match declared content length when present. Existing archive source/member/hash/provenance rules remain unchanged. Sender computes package SHA256 and includes externally verified manifest/normalized hashes. Receiver independently enforces the archive's existing member/file/JSON bounds, all source/schema/fixture/hash checks, all three offered hashes and exact computed scope before preview. Neither producer origin nor sender metadata substitutes for public provenance validation.

## Lifecycle and user experience

One active transfer; duplicate clicks/messages do not redeliver or adopt. Ready deadline15s; archive preparation30s; offered-package request30s; delivery acknowledgement30s; validation60s. Preview has no adoption timeout: only user confirmation permits `adopted`. Sender requires delivery and validated preview before accepting adoption acknowledgement. Preview/delivery do not alter recorded collection evidence or pins.

Cancellation, replacement, file fallback, leaving Downloads, changing version and pagehide invalidate pending work; late fetch/digest/message responses cannot revive it. Pagehide cancels rather than permanently destroying a controller so back/forward-cached pages remain usable. Receiver document reload/navigation must invalidate its preview; a new receiverId is refused, and closure is monitored. Producer cannot independently observe every cross-origin navigation after preview; receiver lifecycle enforcement is required. Cancellation is not a remote rollback guarantee if confirmation/acknowledgement was already in flight.

Downloads identifies exact version and whole-version counts/coverage, provides the primary Use in Injection Analytics action, a Cancel transfer action, accessible status and portable file fallback. Receiver must show exact dataset/version/wells/coverage/provenance/quality, preserve the existing case until explicit confirmation, and adopt only for its current session. No automatic pin change, composition or engineering eligibility is implied.

## Evidence and unresolved checks

Producer security/lifecycle regressions and existing UI/version/integrity checks are recorded in [the producer checkpoint](../verification-2026-10-11-analytics-handoff.md). Independent review is required after repairs. Integrated browser preview/adoption, downloaded lineage, real receiver-origin verification and receiver case-preservation evidence belong to coordinator/Analytics and remain pending here. Shell network verification was permission-blocked; no escalation or denied-access retry is authorized. Earlier sandbox realpath failures block whole archive/full-suite execution in this context; current focused passes must not be described as full-suite acceptance.

## Note 2026-10-30 (Phase 6)

Packages of query versions 4 and 5 use this transport unchanged: same channel, version 1 and the same `offer` fields. Which query versions the sender offers, and what the receiver must verify for each, is set in [ADR 005](005-evidence-package-v2.md). This ADR's local origins are unchanged; hosted transfer stays out of scope.
