# Deployment (ZC-04, issue #40)

Explorer runs in three places. Owner decision 2026-11-05: no second hosted Supabase project; dev is a throwaway replica in GitHub Actions.

| Environment | What runs | How it updates |
|---|---|---|
| Local | `docker compose up --build`: Explorer, Analytics and Postgres ([README](../README.md#run-the-whole-system-docker)) | By hand on your machine |
| Dev | Supabase replica inside the `deploy-dev` job (Postgres, API gateway and Edge runtime from Supabase CLI 3.0.0) plus a website build | **Automatically** after `ci` passes on `main` |
| Analytics | Lovable project connected to `thaiphi/well-injection-insights` `main`; published at https://swdinjectionanalytics.lovable.app. A static browser app (calculations run in the browser) that uses Supabase `phxiqnsebqaalvkanljb` only for a read-only health check. Locally it runs in the same Docker system | Dev: Lovable editor preview follows `main` automatically. Production: manual Lovable **Publish** by the owner. No separate staging |
| Production | Website on Lovable; `trrc-explorer` Edge Function and the frozen archive in Supabase project `phxiqnsebqaalvkanljb` | **By hand**: `deploy-prod` workflow, then Lovable **Publish** |

What "dev" means here: for the website, Lovable's editor preview, which follows `main` automatically; for the backend function, the throwaway Supabase replica, which exists only while the `deploy-dev` job runs.

## Pipeline

1. Pull request: `ci` runs the Node suite with a Postgres service and the vitest suite; `compose-smoke` starts the whole Docker system.
2. Merge to `main`: when `ci` passes, `deploy-dev` deploys that commit to the replica. It applies `supabase/migrations`, applies the archive schema production already has (`docs/sql/trrc-archive.sql`, `docs/sql/trrc-archive-rpc-proposed.sql`), serves the function and checks: sign-in required for lookup and collect (401), writes refused (405), and the archive read path refused cleanly (503). The read path trusts only the frozen production snapshot over HTTPS, so a replica cannot serve it; production checks it instead. The job then builds the website that Lovable builds from `main`.
3. Release: Actions → **deploy-prod** → Run workflow with a commit on `main`. The job refuses a commit that is not on `main` or whose `test` check did not pass, deploys only the `trrc-explorer` function (`supabase functions deploy trrc-explorer --remote=<ref> --no-verify-jwt --yes`, Docker bundling), and checks the live site: `GET /api/versions` returns 200 with versions and `POST /api/collect` returns 401. Then click **Publish** in Lovable.

`deploy-prod` never runs `supabase db push`. The guest migration in `supabase/migrations` is deliberately not applied to production (guest collection stays off, D7). Database changes to production remain a separate, explicit owner action.

## Rollback

Run **deploy-prod** again with the previous good commit (each run's summary names the commit it deployed). For the website, restore the previous version in Lovable's history and Publish.

The first `deploy-prod` run is also the first CLI deploy of this function (version 2 was uploaded through the Supabase MCP), so watch it. If it breaks the function, restore version 2 from the function's history in the Supabase dashboard: re-running `deploy-prod` cannot return to a version the CLI did not make.

## One-time owner setup

- Settings → Environments → `production`: add yourself as a required reviewer and add the secret `SUPABASE_ACCESS_TOKEN` (a Supabase personal access token). Without the secret the job stops before deploying.
- Settings → Branches: require the `test` and `compose` checks on `main` so a failing test blocks the merge (ZC-03).

The first production run replaces function version 2 (October 11) with the current `main`. The archive snapshot pin is unchanged and guest routes stay unmounted unless `TRRC_GUEST_ENABLED=1`.
