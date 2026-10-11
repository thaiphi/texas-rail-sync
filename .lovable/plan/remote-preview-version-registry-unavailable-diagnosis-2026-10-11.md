# Remote preview: "Version registry unavailable" — diagnosis

## Evidence gathered (no edits)

Anonymous requests from the sandbox to the remote preview host:

| Path | Status | Content-Type | Body |
|---|---|---|---|
| `/` | 401 | text/plain | `Unauthorized` |
| `/app.js` | 401 | text/plain | `Unauthorized` |
| `/api/versions` | 401 | text/plain | `Unauthorized` |
| `/artifact-integrity.json` | 401 | text/plain | `Unauthorized` |
| `/api/runs` | 401 | text/plain | `Unauthorized` |
| `/nonexistent-xyz` | 401 | text/plain | `Unauthorized` |

- Every path gets the same Cloudflare `text/plain` 401. That includes the HTML page, a static script and a path that doesn't exist.
- The app never answers with that format. The app's own errors are JSON shaped like `{error:{code,message}}` and carry `cache-control: no-store`.
- Conclusion: the 401 comes from Lovable's preview access gate in front of the app. It does not come from the app or from its server routes.
- The `id-preview--` host is a private editor preview by design. Outside anonymous 401s are expected there and say nothing about routing.
- Preview telemetry has no record of requests to `/api/versions`, `/api/runs` or `/artifact-integrity.json`. So the response your signed-in browser received for `/api/versions` was not captured.
- On the sandbox's own server (localhost:8080), which runs the same code, `/api/versions` returns 3 versions. The page fetches `/api/versions` same-origin with default credentials (`public/app.js:161`).

## What is not yet proven

- Whether your signed-in browser's `/api/versions` request got the gate's 401, a 200 HTML page, or a 503 from the bridge.
- Whether the preview host runs the custom server entry (`src/server.ts`) or only static output plus TanStack SSR.

The app reports one message, "Version registry unavailable", for any non-OK status (see `app.js:161`). That hides which case happened.

## Supported way to identify the cause (read-only)

1. In your signed-in browser, open DevTools → Network on the remote preview. Reload `#datasets`.
2. Record status, content-type and the first 200 bytes for `/api/versions`, `/api/runs`, `/artifact-integrity.json` and `/app.js`.
3. Read the result:
   - **401 text/plain `Unauthorized` on the `/api/*` requests only:** the gate accepts the page load but not those same-origin fetches. This is a platform preview-session issue. Remedy: test on a published or shared URL. That needs your publish/visibility decision; I won't change it.
   - **200 HTML for `/api/versions`:** a static asset or the SPA fallback is answering. The custom server entry isn't running for that path on the preview. Remedy: move the proxy into TanStack server routes (`src/routes/api/versions.ts`, `runs.ts`, and file routes for `artifact-*.json` and `artifacts/$`). Each route calls the existing `createHostingBridge`. This works on every deployment target.
   - **JSON `BACKEND_UNAVAILABLE` 503:** routing works and the upstream fetch from the preview runtime failed. Next, inspect the server function logs.
   - **404 JSON or HTML from TanStack:** the request reached the app router but `src/server.ts` was bypassed. Use the same remedy as the 200 HTML case.
4. Separate from routing: the app shows the same error for every failure. The UI could show the status code next to the message. This is optional and needs approval to change.

## Limits

- No files edited, nothing published, no visibility or permission changes.
- I can't authenticate to the remote preview host from the sandbox, so the authenticated remote response is still unconfirmed.
