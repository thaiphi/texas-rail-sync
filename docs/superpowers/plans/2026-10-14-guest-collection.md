# Hosted Guest Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor clicks the Texas RRC card on the Phi Analytics portfolio, opens the hosted Explorer, and collects public RRC records as an anonymous guest inside Free-plan limits. They then browse and download the private result and return to the portfolio.

**Architecture:**
- The reviewed guest backend is reused unchanged in substance: `src/hosted/guest-*.mjs` plus the SQL drafts.
- New pieces:
  - A browser guest client behind the existing collection screens.
  - Bridge forwarding of `/api/guest/*`.
  - Edge composition gated by `TRRC_GUEST_ENABLED`.
  - A single migration that adds automatic platform statements, a 1-hour cleanup rule and an orphan sweep.
  - A demo link in phi-analytics.

**Tech Stack:**
- Node 24 ESM with `node:test` and no new dependencies.
- Supabase Edge (Deno), PostgREST RPC, Storage and PostgreSQL 17 with `pg_cron`.
- TanStack/Lovable host; React + vitest in phi-analytics.

**Spec:** `docs/superpowers/specs/2026-10-14-guest-collection-design.md`

**Two deliberate simplifications of the spec** (owner to confirm at plan review):
1. **Origin allowlist instead of a bridge secret.**
   - The bridge already enforces a same-origin browser `Origin`. It forwards that header, and the Edge guest handler accepts the request URL's origin or `TRRC_GUEST_ALLOWED_ORIGIN`.
   - This is the same CSRF-level check the reviewed handler uses today. Guest tokens remain the authentication.
   - No secret is needed on the Lovable host, whose secret support is unverified.
2. **Cleanup runs inside the Edge function instead of from `pg_cron`.**
   - Supabase blocks SQL deletion from `storage.objects`, so deletion must use the Storage API.
   - The Edge function runs `runCleanup` and then `runOrphanSweep` after issuing a guest session, at most once per 10 minutes per isolate.
   - The existing maintenance lease fences concurrent runs.
   - `pg_cron` still writes the platform statement every 5 minutes.

## Global Constraints

- Node ≥ 24.
- No new npm dependencies in the Explorer.
- Match the repo's compact one-line style in `src/` and `public/`.
- Never modify `raw/`, `artifacts/`, `runs/`, `public/artifact-path.json` or `public/artifact-integrity.json`. The default pin SHA-256 stays `2bc9bbbe3738d5de1112c2bfd09a094eade796b4285653e19cdb999bc5d0f727`.
- Guest token only in `Authorization: Guest <43-char base64url>`, never in URLs, logs or responses other than session issuance.
- Budgets unchanged:

| Budget | Value |
|---|---|
| Guest Storage | 250,000,000 bytes |
| Guest database | 50,000,000 bytes |
| Guest egress | 1,000,000,000 bytes per UTC month |
| Downloads | 3 per session per rolling 24 h |
| Collection envelope | 100,000,000 bytes |
| Lookup envelope | 20,000,000 bytes |

- Free-plan statement constants:

| Constant | Value |
|---|---|
| Storage limit | 1,000,000,000 bytes |
| Database limit | 500,000,000 bytes |
| Egress limit | 5,000,000,000 bytes |
| Untracked-traffic allowance | 2,000,000,000 bytes |
| Statement expiry | 600 s |
| `pg_cron` schedule | every 5 min |

- Cleanup and orphan age threshold: **1 hour**.
- Hosted guest routes exist only when `TRRC_GUEST_ENABLED === '1'`. With it unset, behavior is byte-for-byte today's read-only site.
- Hosted steps (migration apply, bucket, secrets, deploy, publish, phi-analytics push) each need the owner's explicit yes at that step.
- `gh` commands use `GH_TOKEN=$(gh auth token -u thaiphi)`; never `gh auth switch`.
- **Isolation (owner rule):** other agents work in the shared checkouts at the same time.
  - All Explorer work and commits happen in the worktree `texas-rrc-explorer/.claude/worktrees/guest-live` on branch `guest-live`.
  - All phi-analytics work happens in its own worktree, `phi-analytics/.claude/worktrees/rrc-demo-link`, on branch `rrc-demo-link`.
  - Never switch branches, commit, stash (bare) or install in the shared checkouts.
  - Merges to `main` only via PR at rollout.
- Run the full suite with `node scripts/check-isolated.mjs`. Focused runs use `node --test test/<file>.test.mjs`.

## Review Focus

- **Expired or invalid token mid-flow** (tab left open past 24 h): the next call must show "Session expired, start again" and clear the stored token, not loop or show a generic failure. Tested in Task 5.
- **Busy lane / retry wait while advancing** (`LANE_BUSY` 409, `state:'retry_wait'`): the client must wait until `nextStepAt` and continue, not fail the collection. Tested in Task 5.
- **sessionStorage throws** (private mode or blocked storage): guest mode must still work for the page lifetime with an in-memory token. Tested in Task 5.
- **Opening the guest dataset must not spend extra downloads:** fetch the archive once per job, then serve view and download from that copy. Tested in Task 5 (archive fetched exactly once).
- **Guest disabled while the page is open** (`TRRC_GUEST_ENABLED` unset, guest routes then 404 through the read handler): the user sees "Temporarily unavailable", and browsing still works. Tested in Task 3 and Task 5.

---

## File structure

| File | Responsibility |
|---|---|
| `src/hosted/guest-http.mjs` (modify) | Budget-code HTTP statuses; `allowedOrigins` option |
| `src/hosted/hosting-bridge.mjs` (modify) | Forward `/api/guest/*` with Guest auth, idempotency key, origin |
| `scripts/prepare-hosting.mjs` (modify) | Shell gets `<meta name="trrc-mode" content="guest">` and accurate notice |
| `src/hosted/edge-bootstrap.mjs` (modify) | Compose guest service when enabled; opportunistic maintenance |
| `src/hosted/evidence-store.mjs` (modify) | `listKeys` on memory store; `runOrphanSweep`; shared absence probe |
| `src/hosted/guest-journal.mjs` (modify) | 1-hour terminal rule; `orphanCandidates`/`confirmOrphans` |
| `src/hosted/guest-transport.mjs` (modify) | Map the two new RPCs |
| `docs/sql/trrc-guest-ops-DRAFT-not-applied.sql` (create) | Attestation fn, `attested_by`, 1-hour rule, orphan RPCs, cron schedule |
| `scripts/build-guest-migration.mjs` (create) | Concatenate journal + budget + ops drafts into one migration |
| `supabase/migrations/20261014000000_trrc_guest.sql` (generated, committed) | The single reviewed migration |
| `public/guest-client.js` (create) | Browser guest session, advance loop, error messages, archive cache |
| `public/collection-api.js` (create) | Legacy and guest adapters with one shape for `collection.js` |
| `public/collection.js` (modify) | Use injected `api` instead of inline `post` |
| `public/app.js` (modify) | Guest mode wiring, guest dataset resolver, portfolio back link |
| `public/portfolio-link.js` (create) | `PORTFOLIO_URL` constant (empty until published) |
| `../phi-analytics/src/lib/portfolio.ts`, `src/routes/index.tsx` (modify) | `demoUrls`, `projectStatus`, Open live demo link |

---

### Task 1: Guest HTTP budget statuses and allowed origins

**Files:**
- Modify: `src/hosted/guest-http.mjs:4` (statuses), `:20` (`sameOrigin`), `:22` (factory signature)
- Test: `test/guest-http.test.mjs`

**Interfaces:**
- Produces: `createGuestHttpHandler({service, allowedOrigins=[]})`. `allowedOrigins` is an array of exact origin strings. Budget codes map to HTTP statuses.

- [ ] **Step 1: Write the failing tests.** Append to `test/guest-http.test.mjs`:

```js
test('budget refusals keep their own codes and 429/503 statuses instead of generic unavailability',async()=>{
 for(const [code,status] of [['STORAGE_QUOTA',429],['DATABASE_QUOTA',429],['EGRESS_QUOTA',429],['DOWNLOAD_QUOTA',429],['BUDGET_UNVERIFIED',503]]){
  const handler=createGuestHttpHandler({service:{advance(){},async issueSession(){throw Object.assign(Error('refused'),{code});}}});
  const response=await handler(new Request(origin+'/api/guest/session',{method:'POST',headers:{'content-type':'application/json',origin},body:'{}'}));
  assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);
 }
});
test('a configured exact origin is accepted for bridged POSTs; others stay forbidden',async()=>{
 const service={advance(){},async issueSession(){return {token:'t'.repeat(43),expiresAt:'2026-10-15T00:00:00.000Z'};}};
 const handler=createGuestHttpHandler({service,allowedOrigins:['https://explorer.example']});
 const post=o=>handler(new Request('https://edge.example/api/guest/session',{method:'POST',headers:{'content-type':'application/json',origin:o},body:'{}'}));
 assert.equal((await post('https://explorer.example')).status,201);
 assert.equal((await post('https://evil.example')).status,403);
 assert.throws(()=>createGuestHttpHandler({service,allowedOrigins:['https://x.example/path']}));
});
```

- [ ] **Step 2: Run and verify it fails.**
Run: `node --test test/guest-http.test.mjs`
Expected: FAIL. `STORAGE_QUOTA` returns 503 `GUEST_UNAVAILABLE`, and the allowed origin returns 403.

- [ ] **Step 3: Implement.** In `guest-http.mjs`:
  - Add `STORAGE_QUOTA:429,DATABASE_QUOTA:429,EGRESS_QUOTA:429,DOWNLOAD_QUOTA:429,BUDGET_UNVERIFIED:503` to `statuses`.
  - Replace `sameOrigin` and the factory head with:

```js
function sameOrigin(request,allowed){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin&&!allowed.includes(origin))throw routeError('ORIGIN_FORBIDDEN','Same-origin request required');}
```

```js
export function createGuestHttpHandler({service,allowedOrigins=[]}={}){
 if(typeof service?.advance!=='function')throw Error('Guest service required');
 // Exact bridged browser origins only (the bridge already enforced same-origin); tokens authenticate.
 if(!Array.isArray(allowedOrigins)||allowedOrigins.some(o=>typeof o!=='string'||new URL(o).origin!==o))throw Error('Allowed origins must be exact origins');
 const allowed=Object.freeze([...allowedOrigins]);
```

  Change the call site to `sameOrigin(request,allowed);`. Update the file's header comment: "Mounted by scripts/guest-local.mjs or, when TRRC_GUEST_ENABLED=1, the hosted Edge bootstrap."

- [ ] **Step 4: Run and verify it passes.**
Run: `node --test test/guest-http.test.mjs`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit.**

```bash
git add src/hosted/guest-http.mjs test/guest-http.test.mjs
git commit -m "Map guest budget refusals to explicit statuses and accept configured exact origins"
```

---

### Task 2: Bridge forwards guest routes; hosting shell declares guest mode

**Files:**
- Modify: `src/hosted/hosting-bridge.mjs:3` (`evidencePath`), `:13` (POST allowlist), `:15-21` (headers)
- Modify: `scripts/prepare-hosting.mjs` (notice and meta)
- Test: `test/hosting-bridge.test.mjs`

**Interfaces:**
- Produces:
  - The bridge forwards GET `/api/guest/history`, `/api/guest/jobs/{uuid}`, `/jobs/{uuid}/archive` and `/jobs/{uuid}/runs/{uuid}`.
  - It forwards POST `/api/guest/session`, `/lookups`, `/collections` and `/jobs/{uuid}/advance`.
  - Forwarded headers: `authorization` (only `Guest …`), `idempotency-key`, `origin`, plus `content-type`.
  - The shell `<head>` contains `<meta name="trrc-mode" content="guest">`.

- [ ] **Step 1: Write the failing tests.** Append to `test/hosting-bridge.test.mjs`. Reuse that file's existing imports of `createHostingBridge` and `prepareHosting`; add `import {readFileSync} from 'node:fs';` if absent.

```js
test('hosting bridge forwards guest routes with guest auth, idempotency key and verified origin only',async()=>{
 const seen=[];const bridge=createHostingBridge({html:'<html><head></head><body></body></html>',fetchImpl:async(url,init)=>{seen.push({url,init});return new Response('{}',{status:202,headers:{'content-type':'application/json'}});}});
 const token='a'.repeat(43),site='https://site.example';
 const post=(path,headers={})=>bridge(new Request(site+path,{method:'POST',headers:{'content-type':'application/json',origin:site,authorization:`Guest ${token}`,'idempotency-key':'k'.repeat(20),...headers},body:'{}'}));
 assert.equal((await post('/api/guest/lookups')).status,202);
 const forwarded=seen.at(-1).init.headers;
 assert.equal(forwarded.get('authorization'),`Guest ${token}`);assert.equal(forwarded.get('idempotency-key'),'k'.repeat(20));assert.equal(forwarded.get('origin'),site);
 assert.match(seen.at(-1).url,/\/functions\/v1\/trrc-explorer\/api\/guest\/lookups$/);
 assert.equal((await post('/api/guest/lookups',{origin:'https://evil.example'})).status,403);
 assert.equal((await post('/api/guest/history')).status,405);
 const get=await bridge(new Request(site+'/api/guest/jobs/'+'0'.repeat(8)+'-0000-0000-0000-'+'0'.repeat(12),{headers:{authorization:`Guest ${token}`}}));
 assert.equal(get.status,202);assert.equal(seen.at(-1).init.headers.get('authorization'),`Guest ${token}`);
 await bridge(new Request(site+'/api/guest/history',{headers:{authorization:'Bearer x.y.z'}}));
 assert.equal(seen.at(-1).init.headers.get('authorization'),null);
 assert.equal(await bridge(new Request(site+'/api/guest/../versions')),null);
});
test('hosting shell declares guest mode and no longer says collection is unavailable',()=>{
 prepareHosting();const shell=readFileSync(new URL('../tmp/hosting/shell.html',import.meta.url),'utf8');
 assert.match(shell,/<head><meta name="trrc-mode" content="guest">/);assert.doesNotMatch(shell,/not enabled yet/);
});
```

- [ ] **Step 2: Run and verify it fails.**
Run: `node --test test/hosting-bridge.test.mjs`
Expected: FAIL. `/api/guest/lookups` returns `null` (unrouted), and the shell still says "not enabled yet".

- [ ] **Step 3: Implement the bridge.** In `hosting-bridge.mjs`:

```js
const guestGet=/^\/api\/guest\/(?:history|jobs\/[a-f0-9-]{36}(?:\/archive|\/runs\/[a-f0-9-]{36})?)$/i,guestPost=/^\/api\/guest\/(?:session|lookups|collections|jobs\/[a-f0-9-]{36}\/advance)$/i;
const evidencePath=path=>guestGet.test(path)||guestPost.test(path)||/^\/api\/(?:versions(?:\/[a-z0-9._-]+\/download)?|runs(?:\/[a-f0-9-]{36})?|lookup|collect)$/i.test(path)||/^\/artifacts\/[a-z0-9._-]+\/[a-z0-9_./-]+$/i.test(path)||['/artifact-path.json','/artifact-integrity.json'].includes(path);
```

  - Replace the POST allowlist line with:

```js
  if(request.method==='POST'&&!['/api/lookup','/api/collect'].includes(url.pathname)&&!guestPost.test(url.pathname))return error(405,'METHOD_NOT_ALLOWED','Read-only endpoint.');
  if(request.method!=='POST'&&guestPost.test(url.pathname))return error(405,'METHOD_NOT_ALLOWED','Guest actions use POST.');
```

  - After `headers.set('accept-encoding','identity');` add the guest header forwarding. It applies to GET as well as POST.

```js
   // Guest credentials and keys cross only to guest routes; Bearer stays on legacy POSTs.
   if(guestGet.test(url.pathname)||guestPost.test(url.pathname)){const auth=request.headers.get('authorization');if(auth&&/^Guest [A-Za-z0-9_-]{43}$/.test(auth))headers.set('authorization',auth);const key=request.headers.get('idempotency-key');if(key&&/^[A-Za-z0-9_-]{16,128}$/.test(key))headers.set('idempotency-key',key);}
```

  - Inside the POST block, after the same-origin check passes, add `headers.set('origin',url.origin);`.
  - In that block, change the existing authorization forwarding to apply only to non-guest paths:

```js
const authorization=request.headers.get('authorization');if(authorization&&!guestPost.test(url.pathname))headers.set('authorization',authorization);
```

  - Note: `/api/guest/history` sent as POST hits the first 405, because the guest POST allowlist excludes it.

- [ ] **Step 4: Implement the shell.** In `prepare-hosting.mjs`, replace the `.replace(...)` chain with:

```js
 const html=readFileSync(resolve(root,'public/index.html'),'utf8').replace('<head>','<head><meta name="trrc-mode" content="guest">').replace(/<body([^>]*)>/,'<body$1><p class="notice" role="status">Hosted demo: browse preserved public datasets, or collect a small public dataset as a guest. Guest datasets are private to this browser tab and expire.</p>');
```

- [ ] **Step 5: Run and verify it passes.**
Run: `node --test test/hosting-bridge.test.mjs`
Expected: PASS (all tests, including the five existing ones).

- [ ] **Step 6: Commit.**

```bash
git add src/hosted/hosting-bridge.mjs scripts/prepare-hosting.mjs test/hosting-bridge.test.mjs
git commit -m "Forward guest routes through the hosting bridge and mark the hosted shell as guest mode"
```

---

### Task 3: Orphan sweep and 1-hour cleanup rule (local reference)

**Files:**
- Modify: `src/hosted/evidence-store.mjs:12-21` (memory store `listKeys`), `:91-97` (`runCleanup`, new `runOrphanSweep`)
- Modify: `src/hosted/guest-journal.mjs:25` (options), `:204` (`candidates`), `:221` (exports)
- Modify: `src/hosted/guest-transport.mjs` (operations map)
- Modify: `scripts/guest-local.mjs` (`listObjects` wiring)
- Test: `test/guest-evidence.test.mjs`

**Interfaces:**
- Produces:
  - `createMemoryObjectStore().listKeys(): Promise<Array<{key:string, createdAt:number}>>`
  - `createMemoryGuestJournal({clock, limits, listObjects})` with `listObjects: () => Promise<Array<{key,createdAt}>>`, default returns `[]`
  - `journal.orphanCandidates({lease}): Promise<string[]>` and `journal.confirmOrphans({lease, keys}): Promise<{removed:number}>`
  - `runOrphanSweep({journal, store}): Promise<{removed:number, skipped?:true}>`
  - Constant `GUEST_LIMITS.cleanupAgeMs = 3_600_000`

- [ ] **Step 1: Write the failing tests.** Append to `test/guest-evidence.test.mjs`. Add `runOrphanSweep` and `putObject` to its imports from `../src/hosted/evidence-store.mjs` if absent.

```js
test('orphan sweep deletes only unreferenced guest objects older than one hour and fences re-admission',async()=>{
 let t=Date.parse('2026-10-14T00:00:00.000Z');const clock=()=>t,store=createMemoryObjectStore({clock});
 const journal=createMemoryGuestJournal({clock,listObjects:()=>store.listKeys()});
 const orphan=await putObject(store,new Uint8Array([1,2,3]));
 assert.deepEqual(await runOrphanSweep({journal,store}),{removed:0});
 t+=3_600_001;
 assert.deepEqual(await runOrphanSweep({journal,store}),{removed:1});
 await assert.rejects(store.get(orphan.objectKey),{code:'ENOENT'});
 assert.deepEqual(await runOrphanSweep({journal,store}),{removed:0});
});
test('orphan sweep never removes an object a job references, however old',async()=>{
 let t=Date.parse('2026-10-14T00:00:00.000Z');const clock=()=>t,store=createMemoryObjectStore({clock});
 const journal=createMemoryGuestJournal({clock,listObjects:()=>store.listKeys()});
 const {token}=await (async()=>{const tokenHash='a'.repeat(64);await journal.issueToken({tokenHash});return {token:tokenHash};})();
 const {job}=await journal.enqueue({tokenHash:token,idemKey:'i'.repeat(20),kind:'lookup',requestDigest:'d'.repeat(64),request:{kind:'uic',value:'000020838'},testFixture:true});
 const {lease}=await journal.claim({tokenHash:token,jobId:job.jobId,leaseOwner:crypto.randomUUID()});
 const entry=await putReservedObject({journal,store,lease,bytes:new Uint8Array([9])});
 t+=7_200_000;
 assert.deepEqual(await runOrphanSweep({journal,store}),{removed:0});
 assert.equal((await store.get(entry.objectKey)).length,1);
});
```

  If `putReservedObject` or `enqueue` argument names differ from the file's existing fixtures, copy the exact call shapes from the existing tests in `test/guest-evidence.test.mjs` and `test/guest-journal.test.mjs` rather than guessing.

- [ ] **Step 2: Run and verify it fails.**
Run: `node --test test/guest-evidence.test.mjs`
Expected: FAIL with `runOrphanSweep` not exported.

- [ ] **Step 3: Implement the memory store and sweep.** In `evidence-store.mjs`:
  - Memory store: accept `clock=Date.now` and keep `const created=new Map();`.
  - In `put`, when creating, add `created.set(key,clock());`. In `delete`, add `created.delete(key);`.
  - Add the method `async listKeys(){return [...objects.keys()].sort().map(key=>({key,createdAt:created.get(key)??0}));}`.
  - Replace `runCleanup` with:

```js
// Absence probe: any returned body (even empty) means the object remains.
async function assertAbsent(store,key){try{await store.get(key,{expectedBytes:0});}catch(error){if(error?.code==='ENOENT')return;throw error;}throw failure('CLEANUP_INCOMPLETE','Object remains after deletion');}
// Bounded journal-owned cleanup under a maintenance fence; never touches trrc_archive.
export async function runCleanup({journal,store}){
 const lease=await journal.claimMaintenance({leaseOwner:randomUUID()});if(!lease)return {removed:0,skipped:true};
 const keys=await journal.cleanupCandidates({lease});
 for(const key of keys){await store.delete(key);await assertAbsent(store,key);}
 return journal.confirmCleanup({lease,keys});
}
// Objects no journal row references (late writes, abandoned uploads), older than one hour.
// Candidates are tombstoned first, so a concurrent reservation of the same key is refused.
export async function runOrphanSweep({journal,store}){
 const lease=await journal.claimMaintenance({leaseOwner:randomUUID()});if(!lease)return {removed:0,skipped:true};
 const keys=await journal.orphanCandidates({lease});
 for(const key of keys){await store.delete(key);await assertAbsent(store,key);}
 return journal.confirmOrphans({lease,keys});
}
```

  - `assertAbsent` keeps the `CLEANUP_INCOMPLETE` code distinct; the prior inline version could surface a capped-read error. This closes the minor review follow-up.

- [ ] **Step 4: Implement the journal.** In `guest-journal.mjs`:
  - Add `cleanupAgeMs:3_600_000` to `GUEST_LIMITS`.
  - Change the factory signature to `createMemoryGuestJournal({clock=Date.now,limits=GUEST_LIMITS,listObjects=async()=>[]}={})`.
  - Replace `candidates` and add the two methods after `confirmCleanup`:

```js
 // Terminal for at least cleanupAgeMs and past retention: no in-flight request can still write.
 const settled=item=>expired(item)&&item.terminalAt!==null&&item.terminalAt<=now()-limits.cleanupAgeMs;
 function candidates(){const keep=new Set(),drop=new Set();for(const item of jobs.values())for(const key of references(item))(settled(item)?drop:keep).add(key);return [...drop].filter(key=>!keep.has(key)).sort();}
 const referenced=()=>{const all=new Set();for(const item of jobs.values())for(const key of references(item))all.add(key);return all;};
 async function orphanCandidates({lease}={}){
  maintained(lease);const refs=referenced(),cutoff=now()-limits.cleanupAgeMs,keys=[];
  for(const {key,createdAt} of await listObjects())if(/^sha256\/[a-f0-9]{64}$/.test(key)&&createdAt<=cutoff&&!refs.has(key)){tombstones.add(key);keys.push(key);}
  return keys.sort();
 }
 async function confirmOrphans({lease,keys}={}){
  maintained(lease);const refs=referenced();
  if(!Array.isArray(keys)||keys.some(key=>!tombstones.has(key)||refs.has(key)))throw failure('CLEANUP_CONFLICT','Orphan references changed; nothing was released');
  for(const key of keys)tombstones.delete(key);return {removed:keys.length};
 }
```

  - Add `orphanCandidates,confirmOrphans` to the returned frozen object.
  - If `confirmCleanup` returns a shape other than `{removed}`, keep its existing shape and make `confirmOrphans` return the same shape. The first test's `{removed:0}` expectation then follows that shape, so check `confirmCleanup`'s return before asserting.

- [ ] **Step 5: Implement the transport and local server.**
  - In `guest-transport.mjs`, add `orphanCandidates:'orphan_candidates',confirmOrphans:'confirm_orphans'` to `operations` and change the comment to "The 21 journal RPCs, the 2 budget RPCs and the 2 orphan-sweep RPCs".
  - In `scripts/guest-local.mjs`, build the store first: `const store=createMemoryObjectStore();` then `journal:createMemoryGuestJournal({listObjects:()=>store.listKeys()}),store`.

- [ ] **Step 6: Run and verify it passes.**
Run: `node --test test/guest-evidence.test.mjs test/guest-journal.test.mjs test/guest-transport.test.mjs test/guest-review.test.mjs`
Expected: PASS. Existing cleanup tests still pass because retention (≥ 24 h) already exceeds 1 hour. If one fails, read it: a test that advanced the clock to exactly the expiry may need `+limits.cleanupAgeMs`, which is the intended new rule.

- [ ] **Step 7: Commit.**

```bash
git add src/hosted/evidence-store.mjs src/hosted/guest-journal.mjs src/hosted/guest-transport.mjs scripts/guest-local.mjs test/guest-evidence.test.mjs
git commit -m "Add late-write-safe orphan sweep and one-hour settled cleanup rule"
```

---

### Task 4: SQL operations draft, migration build and disposable-database gate

**Files:**
- Create: `docs/sql/trrc-guest-ops-DRAFT-not-applied.sql`
- Create: `scripts/build-guest-migration.mjs`
- Create (generated): `supabase/migrations/20261014000000_trrc_guest.sql`
- Modify: `scripts/check-guest-postgres.mjs` (load the ops draft after the budget draft; add 4 checks)

**Interfaces:**
- Produces:
  - SQL `trrc_guest.attest_platform() returns uuid`
  - RPCs `public.trrc_guest_orphan_candidates(jsonb)` and `public.trrc_guest_confirm_orphans(jsonb)`, `service_role` only
  - Column `platform_proofs.attested_by text`

- [ ] **Step 1: Write the ops draft.** Create `docs/sql/trrc-guest-ops-DRAFT-not-applied.sql`:

```sql
-- Loads after trrc-guest-journal and trrc-guest-budget drafts. Automatic Free-plan statement,
-- one-hour settled cleanup and the orphan sweep (design 2026-10-14).
begin;
alter table trrc_guest.platform_proofs add column attested_by text;
-- Free plan: Storage 1 GB (org), database 500 MB (project), egress 5 GB/month (org). The
-- ledger sees only guest egress, so 2 GB is reserved for everything else. Fails safe:
-- if this stops running, proofs expire in 600 s and admission refuses.
create function trrc_guest.attest_platform() returns uuid language plpgsql security definer set search_path = '' as $$
declare m record; t timestamptz := clock_timestamp(); db bigint := pg_database_size(current_database()); month_bytes bigint; id uuid;
begin
  select * into m from trrc_guest.storage_measure();
  select coalesce(sum(e.bytes), 0) into month_bytes from trrc_guest.egress e where e.reserved_at >= (date_trunc('month', t at time zone 'UTC') at time zone 'UTC');
  insert into trrc_guest.platform_proofs (source, attested_at, expires_at, storage_limit_bytes, storage_remaining_bytes, project_storage_bytes,
    database_limit_bytes, database_remaining_bytes, project_database_bytes, egress_limit_bytes, egress_remaining_bytes, attested_by)
  values ('operator_attested', t, t + interval '600 seconds', 1000000000, greatest(1000000000 - m.project_bytes, 0), least(m.project_bytes, 1000000000),
    500000000, greatest(500000000 - db, 0), least(db, 500000000), 5000000000, greatest(5000000000 - month_bytes - 2000000000, 0), 'pg_cron:trrc_guest_attest')
  returning proof_id into id;
  delete from trrc_guest.platform_proofs where expires_at < t - interval '1 day';
  return id;
end $$;
revoke all on function trrc_guest.attest_platform() from public, anon, authenticated, service_role;

create or replace function trrc_guest.referenced(p_key text) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from trrc_guest.evidence where object_key = p_key) or exists (select 1 from trrc_guest.staged where object_key = p_key)
      or exists (select 1 from trrc_guest.reservations where object_key = p_key) or exists (select 1 from trrc_guest.publications where archive_object_key = p_key)
$$;
-- Settled: terminal for at least one hour as well as past retention.
create or replace function trrc_guest.candidates() returns setof text language sql stable set search_path = '' as $$
  with refs as (
    select e.object_key, j from trrc_guest.evidence e join trrc_guest.jobs j using (job_id)
    union all select s.object_key, j from trrc_guest.staged s join trrc_guest.jobs j using (job_id)
    union all select r.object_key, j from trrc_guest.reservations r join trrc_guest.jobs j using (job_id)
    union all select p.archive_object_key, j from trrc_guest.publications p join trrc_guest.jobs j using (job_id))
  select object_key from refs group by object_key
  having bool_and(coalesce((j).terminal_at is not null and (j).terminal_at <= now() - interval '1 hour' and now() >= trrc_guest.expires_at(j), false))
  order by object_key collate "C"
$$;
create function public.trrc_guest_orphan_candidates(args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text; selected text[] := '{}';
begin
  perform trrc_guest.maintained(args -> 'lease');
  for k in select o.name from storage.objects o where o.bucket_id = 'trrc-guest-evidence' and o.name ~ '^sha256/[a-f0-9]{64}$'
      and o.created_at <= clock_timestamp() - interval '1 hour' and not trrc_guest.referenced(o.name) order by o.name collate "C" limit 200 loop
    perform pg_advisory_xact_lock(hashtextextended(k, 0));
    if not trrc_guest.referenced(k) then insert into trrc_guest.tombstones (object_key) values (k) on conflict do nothing; selected := selected || k; end if;
  end loop;
  return to_jsonb(selected);
end $$;
create function public.trrc_guest_confirm_orphans(args jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare keys text[]; k text;
begin
  perform trrc_guest.maintained(args -> 'lease');
  if jsonb_typeof(args -> 'keys') is distinct from 'array' then raise exception 'REQUEST_INVALID: Orphan keys required'; end if;
  select coalesce(array_agg(value order by value collate "C"), '{}') into keys from jsonb_array_elements_text(args -> 'keys');
  foreach k in array keys loop
    perform pg_advisory_xact_lock(hashtextextended(k, 0));
    if k !~ '^sha256/[a-f0-9]{64}$' or not exists (select 1 from trrc_guest.tombstones where object_key = k) or trrc_guest.referenced(k) then
      raise exception 'CLEANUP_CONFLICT: Orphan references changed; nothing was released'; end if;
  end loop;
  delete from trrc_guest.tombstones where object_key = any(keys);
  return jsonb_build_object('removed', cardinality(keys));
end $$;
revoke all on function public.trrc_guest_orphan_candidates(jsonb), public.trrc_guest_confirm_orphans(jsonb) from public, anon, authenticated;
grant execute on function public.trrc_guest_orphan_candidates(jsonb), public.trrc_guest_confirm_orphans(jsonb) to service_role;
-- Hosted only: pg_cron exists on Supabase; the disposable gate calls attest_platform() directly.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('trrc_guest_attest', '*/5 * * * *', 'select trrc_guest.attest_platform()');
  end if;
end $$;
commit;
```

  Match `confirmCleanup`'s return shape from the journal draft when writing `confirm_orphans`. If it returns something other than `{removed}`, mirror it here and in Task 3.

- [ ] **Step 2: Add the failing gate checks.** In `scripts/check-guest-postgres.mjs`:
  - Load `docs/sql/trrc-guest-ops-DRAFT-not-applied.sql` immediately after the budget draft, the same way the budget draft is loaded.
  - Add four checks in the file's existing `check(name, fn)` style:
    1. **`automatic statement admits within Free-plan room`:** `select trrc_guest.attest_platform()`, then assert the newest `platform_proofs` row has `attested_by='pg_cron:trrc_guest_attest'`, `storage_limit_bytes=1000000000`, `egress_remaining_bytes <= 3000000000`, and `expires_at - attested_at = interval '600 seconds'`. A subsequent lookup enqueue through the transport succeeds.
    2. **`expired automatic statement refuses admission`:** `update trrc_guest.platform_proofs set attested_at = attested_at - interval '20 minutes', expires_at = expires_at - interval '20 minutes'`. The next enqueue fails with `BUDGET_UNVERIFIED`.
    3. **`orphan sweep removes only old unreferenced guest objects`:**
       - Insert into the `storage.objects` stub a row with `bucket_id='trrc-guest-evidence'`, an unreferenced `sha256/<64 hex>` name and `created_at = now() - interval '2 hours'`.
       - Insert another unreferenced row with `created_at = now()`.
       - Insert a referenced key from an existing job, aged 2 hours.
       - Claim maintenance and call `orphan_candidates`. Exactly the first key is returned and tombstoned.
       - `reserve_object` for that key fails `OBJECT_BUSY`.
       - `confirm_orphans` returns `{removed:1}` and the tombstone is gone.
    4. **`cleanup waits one hour after terminal`:** a job terminal and past retention but with `terminal_at = now() - interval '30 minutes'` is not in `trrc_guest.candidates()`. After `update ... set terminal_at = now() - interval '2 hours'` it is.
  - Use the gate's existing helpers for psql and the transport. Do not add a new harness.

- [ ] **Step 3: Run the gate and verify the new checks fail before the ops draft loads.** Temporarily comment out the ops-draft load line.
Run: `node scripts/check-guest-postgres.mjs`
Expected: the 4 new checks FAIL (`function trrc_guest.attest_platform() does not exist`). Restore the load line.

- [ ] **Step 4: Run the gate and verify everything passes.**
Run: `node scripts/check-guest-postgres.mjs`
Expected: **26/26** PASS (22 existing + 4 new). Save the evidence file the script writes. If the script writes to `docs/guest-postgres-budget-results-2026-10-13.json`, change its output name to `docs/guest-postgres-ops-results-2026-10-14.json` so the 10-13 evidence is preserved.

- [ ] **Step 5: Write the migration builder.** Create `scripts/build-guest-migration.mjs`:

```js
// Builds the single guest migration from the three tested drafts. Draft headers that say
// "do not apply" are replaced by one provenance header; bodies are byte-identical.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),drafts=['trrc-guest-journal','trrc-guest-budget','trrc-guest-ops'].map(name=>`docs/sql/${name}-DRAFT-not-applied.sql`);
const body=path=>readFileSync(resolve(root,path),'utf8').replace(/^(?:--[^\n]*\n)+/,'');
const parts=drafts.map(path=>({path,sha256:createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex'),sql:body(path)}));
const header=`-- TRRC guest collection (design docs/superpowers/specs/2026-10-14-guest-collection-design.md).\n-- Generated by scripts/build-guest-migration.mjs from:\n${parts.map(p=>`--   ${p.path} sha256 ${p.sha256}`).join('\n')}\n-- Create the private bucket separately: insert into storage.buckets (id, name, public, file_size_limit) values ('trrc-guest-evidence', 'trrc-guest-evidence', false, 80106496);\n`;
writeFileSync(resolve(root,'supabase/migrations/20261014000000_trrc_guest.sql'),header+parts.map(p=>`\n-- ===== ${p.path} =====\n`+p.sql).join(''));
console.log('Wrote supabase/migrations/20261014000000_trrc_guest.sql');
```

- [ ] **Step 6: Build and sanity-check the migration.**
Run: `node scripts/build-guest-migration.mjs && grep -c "^begin;" supabase/migrations/20261014000000_trrc_guest.sql && grep -n "DRAFT ONLY\|NOT A HOSTED MIGRATION" supabase/migrations/20261014000000_trrc_guest.sql`
Expected: "Wrote …", the count `3`, and no matches from the second grep. If a draft has a non-leading "do not apply" comment, the grep shows it. Leave body comments as they are, but confirm none instruct against applying. If any does, reword that comment in the draft, re-run the gate (Step 4), then rebuild.

- [ ] **Step 7: Commit.**

```bash
git add docs/sql/trrc-guest-ops-DRAFT-not-applied.sql scripts/build-guest-migration.mjs scripts/check-guest-postgres.mjs supabase/migrations/20261014000000_trrc_guest.sql docs/guest-postgres-ops-results-2026-10-14.json
git commit -m "Add automatic platform statement, orphan sweep SQL and the generated guest migration"
```

---

### Task 5: Browser guest client and collection API adapters

**Files:**
- Create: `public/guest-client.js`
- Create: `public/collection-api.js`
- Test: `test/guest-client.test.mjs`

**Interfaces:**
- Produces:
  - `guestMessage(code: string): string`
  - `createGuestClient({fetchImpl, storage, sleep, newKey, now})`, returning:
    - `lookup({kind, value}, {onProgress})`: resolves to the lookup result object, the same fields as legacy `/api/lookup`, plus `lookupJobId`.
    - `collect({lookupJobId, sourceRecordKey, startMonth, endMonth}, {onProgress})`: resolves to `{jobId, result}`, where `result` is the job's collection result.
    - `archive(jobId)`: resolves to an `ArrayBuffer`, fetched once per job and cached.
  - `createLegacyCollectionApi({fetchImpl})` and `createGuestCollectionApi({client, onGuestPackage})`. Both return `{mode, lookup(body,{onProgress}), collect(submitted,{onProgress})}`, which resolve to `{ok, result, error}`. `result` has the legacy shape: `lookupId, status, candidates…` for lookup; `run, artifactId, scope, realHistoryStatus` for collect.
  - `onGuestPackage({artifactId, tarBytes, pins, jobId})` is called after a guest collection succeeds and its archive is fetched.

- [ ] **Step 1: Write the failing tests.** Create `test/guest-client.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestClient,guestMessage} from '../public/guest-client.js';
import {createGuestCollectionApi} from '../public/collection-api.js';
const TOKEN='t'.repeat(43),JOB='11111111-1111-1111-1111-111111111111',CJOB='22222222-2222-2222-2222-222222222222';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function memoryStorage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
function fakeServer(script){const calls=[];return {calls,fetchImpl:async(url,init={})=>{calls.push({url,method:init.method??'GET',headers:new Headers(init.headers),body:init.body});const next=script.shift();if(!next)throw Error('unexpected '+url);return typeof next==='function'?next(url,init):next;}};}
const lookupResult={lookupId:'L-1',status:'ok',candidates:[{sourceRecordKey:'k1',selectable:true}],sha256:'a'.repeat(64),queryUrl:'https://x',testFixture:false,retrievedAt:'2026-10-14T00:00:00.000Z',sourceRowsUpdatedAt:null};
const job=(state,extra={})=>({jobId:JOB,kind:'lookup',state,step:1,stepCount:3,stepName:'L1',due:true,nextStepAt:'2026-10-14T00:00:00.000Z',errorCode:null,result:null,...extra});
test('lookup starts a session once, stores the token, advances to success and returns legacy fields plus lookupJobId',async()=>{
 const storage=memoryStorage(),server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('queued'),replayed:false}),json(200,{job:job('running',{step:2,stepName:'L2'})}),json(200,{job:job('succeeded',{result:lookupResult})})]);
 const progress=[];const client=createGuestClient({fetchImpl:server.fetchImpl,storage,sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 const result=await client.lookup({kind:'uic',value:'000020838'},{onProgress:m=>progress.push(m)});
 assert.equal(result.lookupJobId,JOB);assert.equal(result.lookupId,'L-1');
 assert.equal(server.calls[0].url,'/api/guest/session');assert.equal(server.calls[1].headers.get('authorization'),`Guest ${TOKEN}`);assert.equal(server.calls[1].headers.get('idempotency-key'),'k'.repeat(24));
 assert.ok(server.calls.every(call=>!call.url.includes(TOKEN)));assert.match(storage.getItem('trrc-guest-session'),/t{43}/);assert.ok(progress.some(m=>/step 2 of 3/i.test(m)));
});
test('busy lanes and retry waits sleep until nextStepAt and continue',async()=>{
 const sleeps=[],server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('queued'),replayed:false}),json(409,{error:{code:'LANE_BUSY',message:'busy'}}),json(200,{job:job('retry_wait',{due:false,nextStepAt:'1970-01-01T00:00:45.000Z'})}),json(200,{job:job('succeeded',{result:lookupResult})})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:memoryStorage(),sleep:async ms=>{sleeps.push(ms);},newKey:()=>'k'.repeat(24),now:()=>0});
 await client.lookup({kind:'uic',value:'000020838'});
 assert.deepEqual(sleeps,[5000,45000]);
});
test('expired token clears storage and reports a plain session message',async()=>{
 const storage=memoryStorage();storage.setItem('trrc-guest-session',JSON.stringify({token:TOKEN,expiresAt:'2099-01-01T00:00:00.000Z'}));
 const server=fakeServer([json(401,{error:{code:'TOKEN_EXPIRED',message:'expired'}})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage,sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 await assert.rejects(client.lookup({kind:'uic',value:'000020838'}),error=>error.code==='TOKEN_EXPIRED'&&error.message===guestMessage('TOKEN_EXPIRED'));
 assert.equal(storage.getItem('trrc-guest-session'),null);
});
test('throwing sessionStorage falls back to an in-memory token for the page lifetime',async()=>{
 const broken={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
 const server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:broken,sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 await client.lookup({kind:'uic',value:'000020838'});await client.lookup({kind:'uic',value:'000020838'});
 assert.equal(server.calls.filter(call=>call.url==='/api/guest/session').length,1);
});
test('guest API collects, fetches the archive exactly once and hands the package to the app',async()=>{
 const pins={artifactId:'rrc-guest-1',manifestSha256:'m'.repeat(64),normalizedSha256:'n'.repeat(64),classification:'public_reported'};
 const collection={kind:'collection',artifactId:'rrc-guest-1',pins,runId:'33333333-3333-3333-3333-333333333333',scope:{monthly_returned:3},realHistoryStatus:'verified_bounded_linkage'};
 const tar=new Uint8Array([1,2,3]).buffer;
 const server=fakeServer([json(201,{token:TOKEN,expiresAt:'2026-10-15T00:00:00.000Z'}),json(202,{job:job('succeeded',{result:lookupResult}),replayed:false}),json(202,{job:{...job('queued'),jobId:CJOB,kind:'collection'},replayed:false}),json(200,{job:{...job('succeeded',{result:collection}),jobId:CJOB,kind:'collection',runId:collection.runId}}),json(200,{runId:collection.runId,events:[]}),new Response(tar,{status:200,headers:{'content-type':'application/x-tar'}})]);
 const client=createGuestClient({fetchImpl:server.fetchImpl,storage:memoryStorage(),sleep:async()=>{},newKey:()=>'k'.repeat(24),now:()=>0});
 const packages=[];const api=createGuestCollectionApi({client,onGuestPackage:p=>packages.push(p)});
 const lookup=await api.lookup({kind:'uic',value:'000020838'});assert.equal(lookup.ok,true);
 const outcome=await api.collect({lookupId:'L-1',sourceRecordKey:'k1',startMonth:'2024-01',endMonth:'2024-03'});
 assert.equal(outcome.ok,true);assert.equal(outcome.result.artifactId,'rrc-guest-1');assert.equal(outcome.result.run.runId,collection.runId);
 assert.deepEqual(JSON.parse(server.calls[2].body),{lookupJobId:JOB,sourceRecordKey:'k1',startMonth:'2024-01',endMonth:'2024-03'});
 assert.equal(server.calls.filter(call=>call.url.endsWith('/archive')).length,1);assert.equal(packages[0].artifactId,'rrc-guest-1');assert.equal(packages[0].tarBytes.byteLength,3);
 await client.archive(CJOB);assert.equal(server.calls.filter(call=>call.url.endsWith('/archive')).length,1);
});
test('every guest code has one plain message; unknown and disabled routes read as temporarily unavailable',()=>{
 for(const code of ['QUOTA_EXCEEDED','TOKEN_QUOTA','STORAGE_QUOTA','DATABASE_QUOTA','EGRESS_QUOTA','DOWNLOAD_QUOTA'])assert.match(guestMessage(code),/demo limit reached/i);
 assert.match(guestMessage('BUDGET_UNVERIFIED'),/paused/i);assert.match(guestMessage('EVIDENCE_EXPIRED'),/expired/i);
 assert.match(guestMessage('NOT_FOUND'),/temporarily unavailable/i);assert.match(guestMessage('WHATEVER'),/temporarily unavailable/i);
});
```

- [ ] **Step 2: Run and verify it fails.**
Run: `node --test test/guest-client.test.mjs`
Expected: FAIL with `Cannot find module '../public/guest-client.js'`.

- [ ] **Step 3: Implement `public/guest-client.js`.**

```js
// Browser guest client. The token lives only in sessionStorage (or memory when storage is
// blocked) and in the Authorization header; never in URLs. Jobs advance step by step.
const KEY='trrc-guest-session',TERMINAL=new Set(['succeeded','failed','expired','interrupted']);
const MESSAGES=Object.freeze({
 LANE_BUSY:'Busy — retrying shortly.',TOKEN_BUSY:'Busy — retrying shortly.',
 BUDGET_UNVERIFIED:'Guest collection is paused right now. Browsing saved datasets still works.',
 TOKEN_EXPIRED:'Your guest session expired. Start the lookup again.',TOKEN_INVALID:'Your guest session expired. Start the lookup again.',
 EVIDENCE_EXPIRED:'This guest dataset has expired. Collect it again to view it.'});
const LIMIT='Demo limit reached. Please try again later.',UNAVAILABLE='Guest collection is temporarily unavailable. Browsing saved datasets still works.';
export function guestMessage(code){return MESSAGES[code]??(/^(?:QUOTA_EXCEEDED|TOKEN_QUOTA|STORAGE_QUOTA|DATABASE_QUOTA|EGRESS_QUOTA|DOWNLOAD_QUOTA)$/.test(code)?LIMIT:UNAVAILABLE);}
const guestError=(code,detail)=>Object.assign(Error(guestMessage(code)),{code,detail});
export function createGuestClient({fetchImpl=globalThis.fetch.bind(globalThis),storage=globalThis.sessionStorage,sleep=ms=>new Promise(r=>setTimeout(r,ms)),newKey=()=>crypto.randomUUID().replaceAll('-',''),now=Date.now}={}){
 let memory=null;const archives=new Map();
 const read=()=>{try{const value=JSON.parse(storage.getItem(KEY)??'null');return value&&typeof value.token==='string'?value:memory;}catch{return memory;}};
 const write=value=>{memory=value;try{value?storage.setItem(KEY,JSON.stringify(value)):storage.removeItem(KEY);}catch{}};
 async function call(path,{method='GET',body,key,auth=true}={}){
  const headers={};if(body!==undefined)headers['content-type']='application/json';if(key)headers['idempotency-key']=key;
  if(auth){const session=await ensureSession();headers.authorization=`Guest ${session.token}`;}
  let response;try{response=await fetchImpl(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});}catch{throw guestError('GUEST_UNAVAILABLE');}
  if(response.ok)return response;
  let code='GUEST_UNAVAILABLE';try{code=(await response.json())?.error?.code??code;}catch{}
  if(code==='TOKEN_EXPIRED'||code==='TOKEN_INVALID')write(null);
  throw guestError(code);
 }
 async function ensureSession(){
  const current=read();if(current&&Date.parse(current.expiresAt)>now()+60_000)return current;
  const issued=await (await call('/api/guest/session',{method:'POST',body:{},auth:false})).json();write({token:issued.token,expiresAt:issued.expiresAt});return issued;
 }
 async function run(start,label,onProgress){
  let {job}=await (await start()).json(),busy=0;
  while(!TERMINAL.has(job.state)){
   onProgress?.(`${label}: step ${job.step} of ${job.stepCount}${job.state==='retry_wait'?' — waiting to retry the official source':''}…`);
   if(!job.due){await sleep(Math.min(120_000,Math.max(1_000,Date.parse(job.nextStepAt)-now())));}
   try{({job}=await (await call(`/api/guest/jobs/${job.jobId}/advance`,{method:'POST',body:{}})).json());busy=0;}
   catch(error){if((error.code==='LANE_BUSY'||error.code==='TOKEN_BUSY')&&++busy<=24){onProgress?.(guestMessage(error.code));await sleep(5_000);continue;}throw error;}
  }
  if(job.state!=='succeeded')throw guestError(job.errorCode??'GUEST_UNAVAILABLE',job);
  return job;
 }
 return Object.freeze({
  async lookup({kind,value},{onProgress}={}){const job=await run(()=>call('/api/guest/lookups',{method:'POST',body:{kind,value},key:newKey()}),'Looking up official inventory',onProgress);return {...job.result,lookupJobId:job.jobId};},
  async collect(request,{onProgress}={}){const job=await run(()=>call('/api/guest/collections',{method:'POST',body:request,key:newKey()}),'Collecting official records',onProgress);return {jobId:job.jobId,result:job.result,runId:job.runId};},
  async run(jobId,runId){return (await call(`/api/guest/jobs/${jobId}/runs/${runId}`)).json();},
  async archive(jobId){if(!archives.has(jobId))archives.set(jobId,call(`/api/guest/jobs/${jobId}/archive`).then(r=>r.arrayBuffer()).catch(error=>{archives.delete(jobId);throw error;}));return archives.get(jobId);}
 });
}
```

  Advance-loop sleep rule: when `due` is false, wait until `nextStepAt`, clamped to 1–120 s. In the test, `nextStepAt` is 45 s after `now()=0`, which gives 45000. A busy response sleeps 5000. The first test's queued job has `due:true`, so it does not sleep.

- [ ] **Step 4: Implement `public/collection-api.js`.**

```js
// One shape for collection.js: {ok,result,error}. Legacy calls the loopback API; guest calls
// the hosted guest client and returns legacy field names so the screens stay unchanged.
import {guestMessage} from './guest-client.js';
export function createLegacyCollectionApi({fetchImpl=globalThis.fetch.bind(globalThis)}={}){
 const post=async(path,body)=>{const response=await fetchImpl(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();return {ok:response.ok,result,error:result.error??null};};
 return Object.freeze({mode:'local',lookup:body=>post('/api/lookup',body),collect:body=>post('/api/collect',body)});
}
export function createGuestCollectionApi({client,onGuestPackage}){
 const lookupJobs=new Map();
 const failed=error=>({ok:false,result:{},error:{code:error.code??'GUEST_UNAVAILABLE',message:error.message||guestMessage('GUEST_UNAVAILABLE')}});
 return Object.freeze({mode:'guest',
  async lookup(body,{onProgress}={}){try{const result=await client.lookup(body,{onProgress});lookupJobs.set(result.lookupId,result.lookupJobId);return {ok:true,result,error:null};}catch(error){return failed(error);}},
  async collect({lookupId,sourceRecordKey,startMonth,endMonth},{onProgress}={}){
   try{
    const lookupJobId=lookupJobs.get(lookupId);if(!lookupJobId)return failed({code:'LOOKUP_UNAVAILABLE',message:'Look up the well again before collecting.'});
    const {jobId,result,runId}=await client.collect({lookupJobId,sourceRecordKey,startMonth,endMonth},{onProgress});
    const run=runId?await client.run(jobId,runId):null;onProgress?.('Preparing your private dataset…');
    await onGuestPackage?.({artifactId:result.artifactId,tarBytes:await client.archive(jobId),pins:result.pins,jobId});
    return {ok:true,result:{...result,run},error:null};
   }catch(error){return failed(error);}
  }});
}
```

- [ ] **Step 5: Run and verify it passes.**
Run: `node --test test/guest-client.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit.**

```bash
git add public/guest-client.js public/collection-api.js test/guest-client.test.mjs
git commit -m "Add browser guest client and collection API adapters"
```

---

### Task 6: Wire the collection screens and guest datasets into the Explorer

**Files:**
- Modify: `public/collection.js:4` (signature), `:10` (remove `post`), `:22` (lookup call), `:38-39` (collect call and progress)
- Modify: `public/app.js` (imports; `openDataset`; mount; guest view)
- Create: `public/portfolio-link.js`
- Modify: `public/index.html` (header back-link slot)
- Test: `test/guest-wiring.test.mjs`

**Interfaces:**
- Consumes:
  - `createLegacyCollectionApi`, `createGuestCollectionApi`, `createGuestClient`
  - `verifyVersionPackage({tarBytes,pins})` from `browser-library.js`
- Produces:
  - `mountCollection({onRun, onVersions, onOpen, onDownload, api})`
  - `PORTFOLIO_URL` (string; `''` hides the link)

- [ ] **Step 1: Write the failing tests.** Create `test/guest-wiring.test.mjs`. These are source-level contract checks; behavior is covered in Task 5 and Task 9.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=name=>readFileSync(new URL(`../public/${name}`,import.meta.url),'utf8');
test('collection screens call only the injected api, never fixed legacy URLs',()=>{
 const collection=src('collection.js');
 assert.match(collection,/export function mountCollection\(\{onRun,onVersions,onOpen,onDownload,api\}\)/);
 assert.doesNotMatch(collection,/'\/api\/lookup'|'\/api\/collect'/);
});
test('app selects guest mode only from the hosted shell meta and keeps guest packages out of the public registry',()=>{
 const app=src('app.js');
 assert.match(app,/meta\[name="trrc-mode"\]/);assert.match(app,/guestPackages\.get\(id\)/);
 assert.doesNotMatch(app,/availableVersions\.push\([^)]*guest/i);
});
test('portfolio link is hidden until a published URL is configured',async()=>{
 const {PORTFOLIO_URL}=await import('../public/portfolio-link.js');assert.equal(PORTFOLIO_URL,'');
 assert.match(src('index.html'),/id="portfolio-link"[^>]*hidden/);
});
```

- [ ] **Step 2: Run and verify it fails.**
Run: `node --test test/guest-wiring.test.mjs`
Expected: FAIL. The signature lacks `api`, and `portfolio-link.js` is missing.

- [ ] **Step 3: Modify `collection.js`.**
  - Signature: `export function mountCollection({onRun,onVersions,onOpen,onDownload,api}){`
  - Delete the `const post=...` line.
  - Replace the lookup call and the `!response.ok` check with:

```js
   const {ok,result,error}=await api.lookup({kind:$('lookup-kind').value,value:$('lookup-value').value},{onProgress:status});if(!latest.isCurrent(ticket))return;
   if(!ok)throw Error(error?.message??'Lookup failed');lookup=result;
```

  - Replace the collect call and its `!response.ok` handling with:

```js
   const {ok,result,error}=await api.collect(submitted,{onProgress:status});
   if(result.run)await onRun?.(result.run);
   if(!ok){const code=result.run?.events?.find(event=>event.status==='failed')?.error?.code??error?.code;throw Error(api.mode==='guest'?(error?.message??'Collection failed'):`${code??'Failed'}: ${error?.message??'Collection failed'}`);}
```

  - The status message before collecting currently says "live sub-stage events are unavailable". Make it mode-aware: `api.mode==='guest'?'Collecting UIC … as a guest. Progress updates as each official source is preserved.':` followed by the existing text.

- [ ] **Step 4: Create `public/portfolio-link.js`.**

```js
// Published Phi Analytics portfolio URL. Empty until the portfolio is published; the link stays hidden.
export const PORTFOLIO_URL='';
```

- [ ] **Step 5: Modify `public/index.html`.** Immediately after the opening of the page header element (the element containing "Texas RRC Explorer" / "Bounded public injection records"), add:

```html
<a id="portfolio-link" class="portfolio-link" hidden rel="noopener">← Thai Phi portfolio</a>
```

- [ ] **Step 6: Modify `app.js`.**
  - Imports:

```js
import {createLegacyCollectionApi,createGuestCollectionApi} from './collection-api.js';
import {createGuestClient} from './guest-client.js';
import {PORTFOLIO_URL} from './portfolio-link.js';
```

  - After `const savedPackages=new Map();let savedView=null;` add:

```js
const guestMode=document.querySelector('meta[name="trrc-mode"]')?.getAttribute('content')==='guest';
// Guest datasets: private, verified on open, never listed in the public registry or pinned.
const guestPackages=new Map();
if(PORTFOLIO_URL){const link=$('portfolio-link');link.href=PORTFOLIO_URL;link.hidden=false;}
```

  - In `openDataset`, change the resolver line to:

```js
const ticket=versionRequest.begin(),guest=guestPackages.get(id),pins=guest?null:availableVersions.find(version=>version.artifactId===id),saved=pins||guest?null:savedPackages.get(id);
```

  - Change the guard to `if(!pins&&!saved&&!guest)throw Error('Requested publication pins unavailable');`.
  - Before the `if(saved){` branch insert:

```js
if(guest){const opened=await openSavedDataset(guest);if(!versionRequest.isCurrent(ticket)||requestedVersionId!==id){for(const url of opened.urls.values())URL.revokeObjectURL(url);URL.revokeObjectURL(opened.tarUrl);return;}savedView=opened;displayDataset(opened.artifact,{...guest.pins,path:`/artifacts/${id}/`});markGuestView();return;}
```

  - Add next to `markSavedView`:

```js
function markGuestView(){
 resetAnalytics();$('analytics-status').textContent='Analytics transfer is unavailable for private guest datasets. Download the complete archive instead.';
 const recordClass=$('version-details').querySelector('dd');if(recordClass)recordClass.textContent='Guest dataset — private to this tab, expires; integrity verified on open';
 $('workspace-version').textContent=`${data.artifactId} · Guest dataset — private, expires`;const button=$('save-browser');if(button)button.disabled=true;
}
```

  - Replace the `mountCollection({...})` call with:

```js
const collectionApi=guestMode?createGuestCollectionApi({client:createGuestClient(),onGuestPackage:({artifactId,tarBytes,pins})=>{guestPackages.set(artifactId,{artifactId,tarBytes,pins});}}):createLegacyCollectionApi();
mountCollection({api:collectionApi,onRun:()=>workflow.refresh(),onVersions:guestMode?async()=>{}:refreshVersions,onOpen:id=>{location.hash=datasetRoute(id,'overview');},onDownload:id=>{location.hash=datasetRoute(id,'downloads');}});
```

- [ ] **Step 7: Add the link style.** Append to `public/style.css`:

```css
.portfolio-link{display:inline-block;margin-bottom:.5rem;font-size:.875rem;color:inherit;text-decoration:underline}
```

- [ ] **Step 8: Run and verify it passes.**
Run: `node --test test/guest-wiring.test.mjs test/navigation-redesign.test.mjs test/browser-library.test.mjs test/version-selection.test.mjs`
Expected: PASS. If an existing source-contract test asserts the old `mountCollection(` call text or the old status copy, update that assertion to the new text. Do not weaken it. Report each such change in the commit message.

- [ ] **Step 9: Commit.**

```bash
git add public/collection.js public/app.js public/portfolio-link.js public/index.html public/style.css test/guest-wiring.test.mjs
git commit -m "Wire guest collection and private guest datasets into the Explorer screens"
```

---

### Task 7: Hosted Edge composition behind TRRC_GUEST_ENABLED

**Files:**
- Modify: `src/hosted/edge-bootstrap.mjs`
- Test: `test/guest-release.test.mjs`

**Interfaces:**
- Consumes:
  - `createSupabaseGuestJournal`, `createSupabaseObjectStore` (Task 3 operations)
  - `createJournalAdmission`
  - `createGuestService`, `createGuestHttpHandler({service, allowedOrigins})` (Task 1)
  - `runCleanup`, `runOrphanSweep` (Task 3)
- Produces: `createHostedEdgeHandler({getEnv, fetchImpl, createTransport, guest, createGuest, waitUntil})`.
  - Without an explicit `guest`, guest routes are composed only when `getEnv('TRRC_GUEST_ENABLED')==='1'`.
  - `createGuest` is a test seam with the default production factory.
  - `waitUntil` defaults to `globalThis.EdgeRuntime?.waitUntil` or an awaited no-op.

- [ ] **Step 1: Write the failing tests.** Append to `test/guest-release.test.mjs`:

```js
test('hosted Edge mounts guest routes only when TRRC_GUEST_ENABLED is exactly 1',async()=>{
 const env=extra=>name=>({SUPABASE_URL:'https://p.supabase.co',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_x'}),SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_x'}),...extra})[name];
 let built=0;const createGuest=()=>{built++;return {handle:async()=>new Response('{}',{status:201}),maintain:async()=>{}};};
 const off=createHostedEdgeHandler({getEnv:env({}),createGuest,createTransport:()=>{throw Error('no reads');}});
 assert.equal((await off(new Request('https://p.supabase.co/functions/v1/trrc-explorer/api/guest/session',{method:'POST'}))).status,405);assert.equal(built,0);
 const on=createHostedEdgeHandler({getEnv:env({TRRC_GUEST_ENABLED:'1',TRRC_GUEST_ALLOWED_ORIGIN:'https://explorer.example'}),createGuest,createTransport:()=>{throw Error('no reads');}});
 assert.equal((await on(new Request('https://p.supabase.co/functions/v1/trrc-explorer/api/guest/session',{method:'POST'}))).status,201);assert.equal(built,1);
 assert.equal((await createHostedEdgeHandler({getEnv:env({TRRC_GUEST_ENABLED:'true'}),createGuest,createTransport:()=>{throw Error('no reads');}})(new Request('https://p.supabase.co/trrc-explorer/api/guest/session',{method:'POST'}))).status,405);
});
test('a guest session schedules maintenance at most once per ten minutes and never fails the response',async()=>{
 let maint=0,t=0;const scheduled=[];
 const createGuest=()=>({handle:async()=>new Response('{}',{status:201}),maintain:async()=>{maint++;throw Error('storage down');}});
 const env=name=>({SUPABASE_URL:'https://p.supabase.co',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_x'}),TRRC_GUEST_ENABLED:'1',TRRC_GUEST_ALLOWED_ORIGIN:'https://explorer.example'})[name];
 const handler=createHostedEdgeHandler({getEnv:env,createGuest,clock:()=>t,waitUntil:p=>scheduled.push(p),createTransport:()=>{throw Error('no reads');}});
 const session=()=>handler(new Request('https://p.supabase.co/trrc-explorer/api/guest/session',{method:'POST'}));
 assert.equal((await session()).status,201);await Promise.allSettled(scheduled);assert.equal(maint,1);
 t+=60_000;await session();await Promise.allSettled(scheduled);assert.equal(maint,1);
 t+=600_001;await session();await Promise.allSettled(scheduled);assert.equal(maint,2);
});
```

  Add `import {createHostedEdgeHandler} from '../src/hosted/edge-bootstrap.mjs';` if absent.

- [ ] **Step 2: Run and verify it fails.**
Run: `node --test test/guest-release.test.mjs`
Expected: FAIL. With guest enabled, the session POST returns 405.

- [ ] **Step 3: Implement.** In `edge-bootstrap.mjs`, add the imports:

```js
import {createSupabaseGuestJournal,createSupabaseObjectStore} from './guest-transport.mjs';
import {createJournalAdmission} from './guest-admission.mjs';
import {createGuestService} from './guest-steps.mjs';
import {createGuestHttpHandler} from './guest-http.mjs';
import {runCleanup,runOrphanSweep} from './evidence-store.mjs';
```

  Add the production factory above `createHostedEdgeHandler`:

```js
// Production guest composition: service journal over RPC, private bucket, journal-metered
// admission and real official-source fetch. Constructed only when TRRC_GUEST_ENABLED=1.
export function createProductionGuest({url,secretKey,allowedOrigin,fetchImpl}){
 const journal=createSupabaseGuestJournal({url,secretKey,fetchImpl}),store=createSupabaseObjectStore({url,secretKey,fetchImpl});
 const service=createGuestService({journal,store,admission:createJournalAdmission(journal)});
 const handle=createGuestHttpHandler({service,allowedOrigins:allowedOrigin?[allowedOrigin]:[]});
 return {handle,maintain:async()=>{await runCleanup({journal,store});await runOrphanSweep({journal,store});}};
}
```

  - `createGuestService` takes no `fetchImpl` here. Production uses global `fetch`; an injected `fetchImpl` is reserved for fixtures (`guest-steps.mjs:42`).
  - Inside `createHostedEdgeHandler`, extend destructuring with `createGuest=createProductionGuest,clock=Date.now,waitUntil=globalThis.EdgeRuntime?.waitUntil?.bind(globalThis.EdgeRuntime)??(promise=>promise)`. Keep `guest=null`.
  - After the validation `if`, add:

```js
 let composed=null,lastMaintenance=-Infinity;
 function guestRoutes(){
  if(guest)return {handle:guest,maintain:null};
  if(getEnv('TRRC_GUEST_ENABLED')!=='1')return null;
  if(!composed){const allowedOrigin=getEnv('TRRC_GUEST_ALLOWED_ORIGIN');if(allowedOrigin!==undefined&&(typeof allowedOrigin!=='string'||new URL(allowedOrigin).origin!==allowedOrigin))throw unavailable();composed=createGuest({url:origin(getEnv),secretKey:defaultKey(getEnv,'SUPABASE_SECRET_KEYS','sb_secret_'),allowedOrigin,fetchImpl});}
  return composed;
 }
```

  - Replace the guest dispatch line with:

```js
   const routes=(path==='/api/guest'||path.startsWith('/api/guest/'))?guestRoutes():null;
   if(routes){
    // The gateway may present the function path; guest-http matches /api/guest/* only.
    const response=await routes.handle(new Request(new URL(path+url.search,url.origin),request),path);
    if(response){
     if(routes.maintain&&request.method==='POST'&&path==='/api/guest/session'&&response.status===201&&clock()-lastMaintenance>600_000){lastMaintenance=clock();waitUntil(routes.maintain().catch(()=>{}));}
     return response;
    }
   }
```

  - Update the `guest` JSDoc: "Explicit guest route handler (tests). Production composes guest routes only when TRRC_GUEST_ENABLED=1."
  - Rebuilding the `Request` with the stripped path keeps `guest-http`'s same-origin check comparing the gateway origin. The bridged browser origin is accepted through `allowedOrigins`.

- [ ] **Step 4: Run and verify it passes.**
Run: `node --test test/guest-release.test.mjs test/hosted-edge.test.mjs test/guest-http.test.mjs`
Expected: PASS. Existing `hosted-edge` tests stay green: without the env flag, routing is unchanged.

- [ ] **Step 5: Re-run the actual local Edge probe.**
Run: `node scripts/probe-guest-edge.mjs`
Expected: the five positive cases plus the CPU-control termination, as recorded on 10-13. The probe bundles production modules, which now import more files, so this catches Deno incompatibilities. Save the new results JSON with a `2026-10-14` name.

- [ ] **Step 6: Commit.**

```bash
git add src/hosted/edge-bootstrap.mjs test/guest-release.test.mjs docs/guest-*-2026-10-14.json
git commit -m "Compose hosted guest routes behind TRRC_GUEST_ENABLED with opportunistic maintenance"
```

---

### Task 8: Native Storage gate for the orphan sweep

**Files:**
- Modify: `scripts/check-guest-storage.mjs` (load the ops draft; add 1 check)

- [ ] **Step 1: Add the failing check.**
  - Load `docs/sql/trrc-guest-ops-DRAFT-not-applied.sql` after the budget draft, as Task 4 did for the Postgres gate.
  - Add the check `orphan sweep deletes an aged unreferenced object through the real Storage API and verifies absence`:
    1. Upload bytes `[7,7,7]` to their `sha256/<hash>` key through `createSupabaseObjectStore`.
    2. `update storage.objects set created_at = now() - interval '2 hours' where name = '<key>'`.
    3. Call `runOrphanSweep({journal, store})` with the gate's service journal transport. Expect `{removed:1}`.
    4. A subsequent `store.get(key)` rejects with `ENOENT`.

- [ ] **Step 2: Run and verify it fails before the load line.**
Run: `node scripts/check-guest-storage.mjs` with the ops-draft load commented out.
Expected: the new check FAILS (`trrc_guest_orphan_candidates` missing). Restore the load.

- [ ] **Step 3: Run and verify it passes.**
Run: `node scripts/check-guest-storage.mjs`
Expected: **9/9** PASS. Save the results JSON as `docs/guest-storage-orphan-results-2026-10-14.json`. Do not overwrite the 10-13 files.

- [ ] **Step 4: Commit.**

```bash
git add scripts/check-guest-storage.mjs docs/guest-storage-orphan-results-2026-10-14.json
git commit -m "Verify the orphan sweep against real local Storage"
```

---

### Task 9: Phi Analytics live-demo link

**Files** (repo `C:/Users/thai.phi/Downloads/python/portfolio/phi-analytics`). Never touch the shared phi-analytics checkout's branch. First create an isolated worktree:

```bash
cd C:/Users/thai.phi/Downloads/python/portfolio/phi-analytics
mkdir -p .git/info && (grep -qx "/.claude/worktrees/" .git/info/exclude || echo "/.claude/worktrees/" >> .git/info/exclude)
git fetch -q origin && git worktree add .claude/worktrees/rrc-demo-link -b rrc-demo-link origin/main
cd .claude/worktrees/rrc-demo-link && npm install
```

Then run every step below from that worktree directory. This session is pinned to the Explorer worktree, so dispatch this task to a subagent whose working directory is the phi-analytics worktree.
- Modify: `src/lib/portfolio.ts`
- Modify: `src/routes/index.tsx:259-262` (status), `:468-472` (dialog copy and link)
- Test: `src/test/portfolio.test.ts`, `src/test/landing-page.test.tsx`

**Interfaces:**
- Produces:
  - `demoUrls: Partial<Record<ProjectId, string>>`, empty until rollout
  - `projectStatus(project)`: returns `"Live prototype"` when a demo URL is set, otherwise `project.status`

- [ ] **Step 1: Write the failing tests.** Append to `src/test/portfolio.test.ts`:

```ts
import { demoUrls, projectStatus } from "@/lib/portfolio";
describe("Live demo links", () => {
  it("shows no live demo until a published URL is configured", () => {
    expect(demoUrls.rrc).toBeUndefined();
    expect(projectStatus(projects.find((p) => p.id === "rrc")!)).toBe("In Development");
  });
  it("labels a project Live prototype once its demo URL is set", () => {
    const rrc = projects.find((p) => p.id === "rrc")!;
    expect(projectStatus(rrc, { rrc: "https://example.test" })).toBe("Live prototype");
  });
});
```

  Append to `src/test/landing-page.test.tsx`, reusing that file's render setup:

```tsx
it("keeps the in-development copy and no demo link while no URL is configured", () => {
  // render as the existing tests do, open the RRC card dialog
  // expect(within(dialog).queryByRole("link", { name: /open live demo/i })).toBeNull();
});
```

  Write the body using the same render and `fireEvent.click(... "Explore Project")` lines as the existing dialog test at `landing-page.test.tsx:26-29`, but target the RRC card (index 1).

- [ ] **Step 2: Run and verify it fails.**
Run (in the phi-analytics worktree): `npx vitest run src/test/portfolio.test.ts`
Expected: FAIL. `demoUrls` and `projectStatus` are not exported.

- [ ] **Step 3: Implement.** Append to `src/lib/portfolio.ts`:

```ts
export type ProjectId = (typeof projects)[number]["id"];
// Published demo URLs only; never invent one. Set during rollout after the app is published.
export const demoUrls: Partial<Record<ProjectId, string>> = {};
export function projectStatus(
  project: (typeof projects)[number],
  urls: Partial<Record<ProjectId, string>> = demoUrls,
): string {
  return urls[project.id] ? "Live prototype" : project.status;
}
```

  In `src/routes/index.tsx`:
  - Import `demoUrls, projectStatus`.
  - In the card status, use `{projectStatus(project)}` instead of `{project.status}`.
  - In the dialog, the eyebrow becomes `{projectStatus(selected)}`.
  - Replace the paragraph's non-reservoir branch with:

```tsx
                  : demoUrls[selected.id]
                    ? "A working prototype. Collect a small public dataset as a guest; results are private to your browser tab and expire."
                    : "This project is in development. No working demonstration or validated results are available yet."}
              </p>
              {demoUrls[selected.id] && (
                <a className="project-link" href={demoUrls[selected.id]} target="_blank" rel="noopener">
                  Open live demo <ArrowUpRight />
                </a>
              )}
```

- [ ] **Step 4: Run and verify it passes.**
Run (in the phi-analytics worktree): `npx vitest run`
Expected: PASS (all, including the existing "labels all three … In Development").

- [ ] **Step 5: Commit on the branch.** Do not push; pushing syncs to Lovable and is a rollout step.

```bash
git add src/lib/portfolio.ts src/routes/index.tsx src/test/portfolio.test.ts src/test/landing-page.test.tsx && git commit -m "Add configurable live-demo link for portfolio projects"
```

---

### Task 10: Full verification, local walkthrough and independent review

- [ ] **Step 1: Full Explorer suite.**
Run: `node scripts/check-isolated.mjs`
Expected: all pass, 0 fail. The count is ≥ 291 plus the new tests.

- [ ] **Step 2: Protected data unchanged.**
Run: `git diff --quiet origin/main -- raw artifacts runs public/artifact-path.json public/artifact-integrity.json && echo PROTECTED_CLEAN`
Expected: `PROTECTED_CLEAN`.

- [ ] **Step 3: Type and lint checks.**
Run: `npx tsc --noEmit && npx eslint public/guest-client.js public/collection-api.js public/collection.js public/app.js src/hosted`
Expected: no errors.

- [ ] **Step 4: Local guest walkthrough** (browser, owner-visible):
  1. Run `node scripts/guest-local.mjs --fixture 4175` in the background.
  2. Temporarily add `<meta name="trrc-mode" content="guest">` to the served page only, through a local query switch. Simplest: open DevTools and run `document.head.prepend(Object.assign(document.createElement('meta'),{name:'trrc-mode',content:'guest'}))`, then reload the module. Alternatively serve `tmp/hosting/shell.html`.
  3. Flow: Find UIC `000020838` → choose the candidate → collect `2024-01`–`2024-03` → see step progress → Open this dataset → it shows "Guest dataset — private, expires" → Downloads → TAR downloads once.
  4. Record a GIF with `gif_creator` named `guest-walkthrough-local.gif`.
  5. Fixture mode labels everything as a test fixture, which is expected. Then run one manual `--official` collection with the owner watching, since it fetches from RRC.
  6. Write results to `docs/verification-2026-10-14-guest-local.md`.

- [ ] **Step 5: Independent review.** Dispatch a review subagent (`superpowers:requesting-code-review`) over `git diff origin/main...guest-live` plus the phi-analytics branch. Focus areas:
  - The token never appearing in URLs or logs.
  - Bridge header forwarding.
  - The orphan sweep's tombstone fence.
  - Admission still failing safe.
  - Statement constants.

  Fix confirmed findings with a test first, then re-run Step 1.

- [ ] **Step 6: Update docs.**
  - README "Release status": guest collection is built and locally verified; the hosted rollout is pending.
  - Add `docs/verification-2026-10-14-guest-local.md` with counts and logs.
  - Commit: `git add README.md docs/verification-2026-10-14-guest-local.md && git commit -m "Record local guest collection verification"`.

---

### Task 11: Hosted rollout — each step needs the owner's explicit yes

Before each step, show the owner exactly what will change and wait for yes. Stop on any failure; the rollback is in the spec.

- [ ] **Step 1: Merge and push the Explorer branch.** Use a PR from `guest-live` to `main` with `GH_TOKEN=$(gh auth token -u thaiphi)`, then merge. Lovable syncs from `main`; guest stays off because the env flag is unset.
- [ ] **Step 2: Apply the migration.** Apply `supabase/migrations/20261014000000_trrc_guest.sql` to project `phxiqnsebqaalvkanljb` with the Supabase MCP `apply_migration`. Verify:
  - `select count(*) from cron.job where jobname='trrc_guest_attest'` returns 1.
  - After 5 minutes, `select attested_by from trrc_guest.platform_proofs order by attested_at desc limit 1` returns `pg_cron:trrc_guest_attest`.
  - `get_advisors` (security) reports no new public exposure of `trrc_guest`.
- [ ] **Step 3: Create the private bucket.** Run `insert into storage.buckets (id, name, public, file_size_limit) values ('trrc-guest-evidence','trrc-guest-evidence',false,80106496);`.
- [ ] **Step 4: Set the Edge secrets.** `TRRC_GUEST_ENABLED=1` and `TRRC_GUEST_ALLOWED_ORIGIN=https://texasrrcexplorer.lovable.app`. This is the published Explorer origin, already live with the read-only site, as confirmed on 2026-10-14. Secrets are set with `supabase secrets set` or the MCP; the owner may need to run `! supabase secrets set ...` themselves.
- [ ] **Step 5: Deploy the Edge function.** Deploy `trrc-explorer` with the MCP `deploy_edge_function` (`verify_jwt=false` per `supabase/config.toml`). Smoke test through the published Explorer origin:
  1. Session → 201.
  2. Lookup `000020838` → succeeded with ≥ 1 candidate.
  3. Collection `2024-01`–`2024-03` → succeeded.
  4. Archive → TAR whose SHA-256 equals `job.result.archiveSha256`.
  5. A second session's history is empty (isolation).

  Record the results in `docs/verification-2026-10-14-guest-hosted.md`.
- [ ] **Step 6: Republish the Explorer on Lovable.**
  - Use `mcp__lovable__deploy_project` for project `f0e9357f-02d2-4f69-8979-05a2e7bda2b3` so `https://texasrrcexplorer.lovable.app` serves the guest-mode shell from merged `main`.
  - Confirm the served HTML contains `<meta name="trrc-mode" content="guest">`.
  - Do one live browser walkthrough there with a GIF, `guest-walkthrough-hosted.gif`.
- [ ] **Step 7: Portfolio link.**
  - In phi-analytics: set `demoUrls.rrc` to `"https://texasrrcexplorer.lovable.app/"`. Update `portfolio.test.ts` expectations (RRC is now "Live prototype"). Set the Explorer's `PORTFOLIO_URL` to the portfolio's published URL and update `guest-wiring.test.mjs`.
  - Run both test suites. Push phi-analytics `rrc-demo-link` → PR → merge with `GH_TOKEN=$(gh auth token -u thaiphi)`, then push the Explorer change.
  - Verify on the live portfolio: card → Open live demo → Explorer → ← Thai Phi portfolio.
- [ ] **Step 8: Update the README release status** to describe the live guest collection, with links to the hosted verification. Commit and push.
