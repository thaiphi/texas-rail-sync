**Verdict**
PASS for the harness correction.

**Verified by inspection (`scripts/check-guest-storage.mjs`)**
- One disposable helper: a single `curlimages/curl` container is started with the cached image, `--pull=never`, on the same `--internal` network, no published ports, a read-only bind of the task directory at `/probe`, and an idle `sleep 3600` entrypoint (`:49`). Every request is a `docker exec` of `curl` inside it with the same flags as before (`:29-32`), reaching `http://storage:5000` only by network alias.
- Request bodies: written to the task directory on the host and read through the live read-only mount (`:31`), so no body is injected via arguments and the helper cannot write back.
- Cleanup: the helper is removed in `finally` alongside Storage, PostgreSQL and the network (`:82-83`), with the Storage log captured first; `startedHttp` guards the removal.
- Isolation unchanged: no host ports, no grants, `supabase_admin` bootstrap identity retained (`:24,:54-56`), fixture JWT translation still labeled as not `sb_secret` proof (`:1-3,:20`).
- Production code untouched: leases, byte caps and transport behavior are unchanged; only the measured wall times lose the per-request container start, and the comment at `:27-28` says so. Per-step `wallMs` still include `docker exec` overhead and remain unsuitable as request latency.
- Response parsing is byte-exact as before (`encoding:null`, header split, 204/205/304 handling).

**Minor, non-blocking**
- Add `--rm` to the helper's `run` (`:49`) so an abnormal harness exit before `finally` leaves no stopped container after the one-hour sleep ends. The PostgreSQL and Storage containers have the same exposure, so this is hygiene, not a defect.

**Unverified coverage**
Execution results of this corrected harness are Main's; nothing here changes the hosted authorization, physical-orphan or billed-egress gates.

Checkpoint complete; slot released.