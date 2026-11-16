# Benchify private deployment

## Hosted incident

On November 16, 2026, Vercel returned platform-level `NOT_FOUND` for the app, benchmark catalog and manifest at `try-benchify.vercel.app`. The authenticated Vercel CLI could inspect the `sranswal` scope. Its project and alias inventories contained no Benchify target, and the deployment lookup failed. There was no target in the accessible scope whose root, framework, build, environment, or logs could be inspected. GitHub `main` at `b07d6d6` contained only README.md. A Git deployment of that revision lacks the application source. The evidence does not establish when or why the old deployment disappeared, or whether another account owned it. [Vercel NOT_FOUND reference](https://vercel.com/docs/errors/NOT_FOUND)

## Replacement project

The Vercel project sranswal/benchify-private has been created. Verified settings are Next.js, root directory frontend, Node.js 24.x, npm ci, npm run build, and automatic output directory. Preview and Production both have BENCHIFY_ENV set to production. Vercel deployment protection excludes custom domains, so Benchify's own operator access remains mandatory. The project awaits a Git connection, an approved backend HTTPS origin, the verified frontend origin, and the shared operator token. Establish the new alias from the first Ready deployment. The previous alias still has no verified deployment.

## Production topology

| Component | Placement |
|---|---|
| Next.js | Vercel from the `frontend` project root. Browser requests use same-origin Next route handlers. |
| FastAPI and benchmark worker | One always-on Linux container, one Uvicorn process, behind an HTTPS ingress. Keep one active worker process while fixture callbacks depend on in-process state. |
| Neon | One dedicated staging branch and role, followed by a separate production branch and role after acceptance. Use a TLS connection string from Neon and runtime secret injection. |
| Bifrost | A separately operated gateway reachable from the API on the private network. Keep admin and log access off public ingress. |
| Tavily | Direct HTTPS egress from FastAPI. Keys belong only on the API host. |

The Next request enqueues work and returns a run ID. The API process hosts the durable worker, which claims and checkpoints through PostgreSQL. Vercel only serves the frontend and proxies API requests. The live verification and briefing proxy allows 95 seconds, with a 105-second configured function duration. Make sure the selected Vercel project supports this duration. An always-on backend costs more than scaling to zero and currently limits horizontal scaling. It keeps the worker available outside HTTP request lifetimes and keeps the callback state in the process that owns the active attempt. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)

## Deploy staging

1. Review and publish the full application source to the intended Git branch. Confirm the remote revision includes `frontend/package.json`, its lockfile, `frontend/vercel.json`, `backend/Dockerfile` and both source directories. Keep `.env`, local recordings and credentials out of Git.
2. On an authorized always-on backend host, allocate one container and a stable HTTPS origin. Build from the repository root with `docker build -t benchify-api:<revision> backend`. Publish the image by immutable revision/digest where the host can pull it. Inject these backend values through the host secret store.

   | API variable | Staging value |
   |---|---|
   | `BENCHIFY_ENV` | `production` |
   | `BENCHIFY_OPERATOR_TOKEN` | Random URL-safe operator token, 32–128 characters. Use the same token in Vercel. |
   | `BENCHIFY_ALLOW_LOCAL_AGENTS` | `0` or unset |
   | `DATABASE_URL` | TLS DSN for the isolated Neon staging branch |
   | `BIFROST_BASE_URL`, `BIFROST_MODEL`, `BIFROST_VIRTUAL_KEY` | Approved gateway origin and inference configuration, with the path expected by the gateway |
   | `TAVILY_API_KEY` | Staging Tavily credential |
   | `BENCHIFY_CAPTURE_RETENTION_DAYS` | Approved 1–30 day retention |

   On a Docker VM, run the image with `--restart unless-stopped --stop-timeout 55` and publish `127.0.0.1:8000:8000` for a same-host TLS reverse proxy. Attach it to the private gateway network if Bifrost runs in another container. For a managed container host, configure a fixed active replica, always-available CPU, no request-driven suspension, and at least 55 seconds of termination grace. Set `PORT` if the host requires a different container port. Allow web ingress only on the intended API path, with TLS, request-size and rate limits. Keep health checks private where possible. Probe `/health` for liveness and `/ready` for worker readiness.
3. Start with Python only. Leave `BENCHIFY_HTTP_AGENT_URL` unset and `BENCHIFY_HTTP_AGENTS` empty. When testing HTTP agents, add exact HTTPS origins to `BENCHIFY_AGENT_ALLOWED_ORIGINS` and expose only the scoped callback path on the explicit HTTPS `BENCHIFY_FIXTURE_ORIGIN`. Keep callback URLs out of access logs. Bifrost and Tavily remain backend-only.
4. In the **sranswal Vercel scope**, connect the reviewed GitHub branch to benchify-private after adding the staging environment values in step 5. Confirm GitHub authorizes the Vercel integration to access the repository. Set **Root Directory** to `frontend`, **Framework Preset** to **Next.js**, and **Node.js Version** to **24.x**. Use `npm ci` and `npm run build` from the checked-in config. Leave Output Directory at the framework default. Set the staging branch and GitHub integration to the exact reviewed revision. Review build logs and confirm a Ready deployment on that revision. [Vercel project settings](https://vercel.com/docs/project-configuration/general-settings)
5. Set Vercel's **server-side** staging values before deploying. Use `BENCHIFY_ENV=production`, the shared `BENCHIFY_OPERATOR_TOKEN`, `BENCHIFY_PUBLIC_ORIGIN=https://<staging-web-host>`, and `BENCHIFY_API_URL=https://<staging-api-host>`. Use complete HTTPS origins without paths or credentials. Do not add a generic rewrite that forwards browser authorization. The checked-in Next handlers validate the operator and deliberately forward a Bearer credential over HTTPS. Vercel needs no Neon, Bifrost or Tavily secrets.
6. Assign the intended staging alias to the verified Ready deployment. Verify the correct URL and operator challenge. If reusing `try-benchify.vercel.app`, verify alias ownership and deployment mapping in the owning scope before assigning it. A deployment protected by an additional Vercel gate must also give the acceptance runner an approved access path.
7. Verify anonymous requests to the web app, catalog and recording endpoint return 401. Operator browser username is `benchify`. Direct backend callers use the operator token as Bearer. Production `/docs`, `/redoc` and `/openapi.json` are disabled. The edge can expose static brand assets and the manifest. It must protect all private data routes.

## Backend host selection

The production API image is approximately 212 MiB uncompressed. In a disposable PostgreSQL test with a 0.5-vCPU and 512-MiB container limit, the API used 55.17 MiB idle and 67.07 MiB after 15 captured scripted attempts. These are point-in-time measurements. Live provider latency, large concurrent responses, Bifrost resource use, and peak memory were outside this sizing check.

A paid Render Docker web service is a practical starting point for the API alone if it can reach a hosted Bifrost gateway. Choose one always-on instance with at least 0.5 vCPU and 512 MiB, preferably near the staging Neon region. Set the service root to backend, use its Dockerfile and default command, set /ready as the health check, disable auto-deploys, and set a 60-second shutdown window using Render's maxShutdownDelaySeconds setting. Start with the Python agent on staging. Drain the active worker before replacing instances when using in-process HTTP fixture callbacks. Approve the host and plan before provisioning. [Render service configuration](https://render.com/docs/blueprint-spec) · [Render pricing](https://render.com/pricing)

If the existing Bifrost gateway is only reachable on the development machine, provide a hosted gateway first. A dedicated Linux VM can run the API and Bifrost on a private container network behind one TLS ingress, with the API health checks and stop timeout described above. Measure Bifrost before setting capacity. Keep its administrative interfaces private.

## Acceptance

Use a dedicated hosted staging URL and a disposable Neon branch. Inject `BENCHIFY_HOSTED_OPERATOR_TOKEN` into the shell from the secret store. Run from the repository root:

```powershell
node frontend/tests/browser_acceptance.mjs --hosted=https://<staging-web-host>
node frontend/tests/browser_acceptance.mjs --hosted=https://<staging-web-host> --exercise --live
```

The first check is read-only. The second creates synthetic Northwind runs, downloads a recording, compares replay and saved runs, and exercises credentialed verification and briefing. Chrome only answers the Benchify Basic challenge at the exact configured HTTPS origin. Check the hosted trace for the injected search 503 and document any real provider failure separately. The local build and tests do not count as hosted acceptance.

## Recovery and rollback

Run the disposable PostgreSQL exercise locally. It never uses the workspace Neon DSN.

```powershell
npm.cmd --prefix frontend run build
docker build -t benchify-api:milestone-1 backend
$env:PYTHONPATH = "backend"
.venv\Scripts\python.exe backend/tests/recovery_drill.py --image benchify-api:milestone-1 --release --browser
```

The drill tests competing claims, expired-token and stale-writer rejection, preserving completed attempts, worker drain, recording pruning, container probes and termination, PostgreSQL dump and restore, and the execution of a restored pending job. The release smoke hard-restarts the API after a checkpoint. A live lease can take up to 120 seconds to expire. One callback process is still required in hosted operation.

For **Neon managed recovery**, first create an isolated branch with synthetic runs and a role restricted to staging. Record a recovery point after a completed run and a pending job, then create a restore branch from that point within the configured restore window. Keep the original branch intact. Start a separate backend against the restore branch. Verify counts, recording expiry, replay, and pending-job completion, then record recovery time and the recovered timestamp. Optionally repeat a logical dump and restore using a separate destination and restricted PostgreSQL service profiles. Test deletion and lease interruption only on disposable branches. A local PostgreSQL restore does not certify Neon managed recovery. [Neon branch management](https://neon.com/docs/manage/branches)

Drain submissions and attempts before replacing the API. Switch one active backend at a time and require readiness before promoting the frontend alias. If rollback is needed, restore the last validated image and frontend revision with compatible secrets and a verified database branch. Never route traffic to a rollback build that lacks the current access gate. Keep Bifrost logs and callback capabilities out of public ingress and application access logs.

## Recorded validation

The production Next.js build passed. Four synthetic server secrets were absent from all 13 browser asset files. Local Chrome passed the catalog, benchmark, refresh, capture download, offline replay and comparison flow against the restored disposable PostgreSQL database. Actual hosted Chrome received HTTP 404 on all three checks.

The Docker PostgreSQL drill verified one winner across two concurrent lease claimants, rejected expired and replaced leases, drained an active worker and resumed the next position. The hard-restart smoke recovered a real expired lease and passed all six attempts plus repeat execution. The production API container passed readiness, probe and authorization checks, debug-route removal and SIGTERM shutdown.

A separate Neon logical backup and restore passed using two fresh synthetic-only databases on the configured service. A PostgreSQL 18 client dumped the source and restored it to the isolated destination. Two finished attempts, their events, and recordings matched after restore. Offline replay passed and a restored pending job completed. Only the two new test databases were removed. Managed point-in-time restore to an isolated branch is still outstanding.
