# ZC-02: one-command Docker Compose for Explorer + Analytics + Postgres

Issue [#38](https://github.com/thaiphi/texas-rail-sync/issues/38). The owner said "go" on 2026-11-05. This is part of the AI Dev Tools Zoomcamp final project: Explorer and SWD Injection Analytics are submitted as one system.

## Goal

`docker compose up --build` starts the whole system with no other setup:

| Service | Address |
|---|---|
| Explorer | `http://127.0.0.1:4391` |
| Analytics | `http://127.0.0.1:4290` |
| Postgres | internal only |

The browser handoff from Explorer to Analytics (ADR 003) keeps its exact origins.

## Decisions

1. **Ports are published on the host's loopback only.**
   - ADR 003 pins both origins to `127.0.0.1:4391` and `127.0.0.1:4290`, so the containers publish exactly those ports.
   - Nothing is published on other interfaces.
2. **Explorer's write guard gets an explicit opt-in.**
   - Inside a container the server listens on `0.0.0.0` (`TRRC_LISTEN_HOST`). Published-port traffic arrives from the network gateway, not from loopback.
   - `TRRC_TRUSTED_REMOTE_ADDRESSES` adds named IP addresses to the loopback set. Values that aren't IP addresses are refused at startup.
   - The compose pins the subnet and passes only its gateway, `172.30.0.1`.
   - The Host and Origin checks are unchanged.
   - The default is the old behaviour exactly.
   - An IPv4-mapped peer (`::ffff:a.b.c.d`) matches its IPv4 entry.
   - With a configured list, a refused write logs the peer address, so a gateway mismatch (for example on Docker Desktop) is visible.
   - Listening on anything other than loopback prints a warning.
   - The subnet and gateway can be overridden with `SWD_SUBNET` / `SWD_GATEWAY` if `172.30.0.0/24` clashes with your network.
   - This is security-relevant. It is safe only while the port is published on loopback, and the compose file says so.
3. **Postgres holds an index, not the record.**
   - Postgres keeps `explorer_runs` and `explorer_versions`.
   - The index is rebuilt from `runs/` and the verified version pins at startup and after every collection. It can be dropped at any time.
   - Without `DATABASE_URL`, nothing changes and `pg` is never imported (dynamic import).
   - An index failure never fails a request. `/api/health` reports `off`, `ok`, `degraded` or `error`, with counts only.
   - Collection history shows the index line when it's available.
   - Each refresh mirrors the files exactly. Rows whose run or version is gone are deleted in the same transaction, and run ids that aren't UUIDs are skipped.
   - A dropped database connection is absorbed: the pool `error` handler stops the server from crashing.
   - Queries time out after 10 s, and the index refresh never holds an HTTP response.
   - Every service restarts unless stopped.
4. **`pg` is the one new dependency** (8.16.3, exact).
   - `test/watch-gates.test.mjs` pins the dependency set, so its baseline now adds `pg` with a dated ruling.
   - Observability (ZC-05) will need its own deliberate addition.
5. **The Analytics image is interim.**
   - It is built from a pinned commit of `thaiphi/well-injection-insights`.
   - That repo's `serve.mjs` listens on `127.0.0.1` and is a preserved file there. So the image runs it unchanged on `:4291`, and a socat relay serves `:4290`. The server is GET and HEAD only, so the relay adds no write path.
   - When the Analytics session adds a `HOST` setting and its own Dockerfile, the compose switches to those and the relay goes.
6. **Data is baked in.** The Explorer image copies the preserved evidence (`artifacts/`, `collected-sources/`, `runs/`, `watched-documents/`, `lookups/`). Collections made inside a container last only as long as that container; the repository stays the record.
7. **Proof runs in CI.** `.github/workflows/compose-smoke.yml` builds and starts the stack on every PR and makes no live RRC request. It checks:
   - health;
   - index counts, both through the API and in `psql`;
   - that a same-origin write through the published port passes the guard, and a foreign origin is refused;
   - that Analytics is reachable.

## Not covered here

- **Local run on the owner's PC:** deferred because of low memory.
- **The browser handoff inside the composed stack:** it uses the same origins, but there is no automated browser check yet.
- **Deploy:** ZC-04.
- **Telemetry:** ZC-05.
