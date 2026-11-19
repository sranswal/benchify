# Private staging on Render

## Status and approved budget

On November 19, 2026 the operator approved two 0.5c-512mb services and a 1 GiB Bifrost disk, with a $14.25/month base ceiling. No workspace upgrade or larger instance is authorized. Published prices are $7/month per service and $0.25/GiB/month for disk capacity. Compute is prorated. Workspace fees, taxes, build/bandwidth overages and external Neon, Gemini, Tavily and Vercel usage are additional. Review the account estimate before creation. Render credits normally apply to all workspace charges, including compute and storage, unless the specific promotion excludes them. Credits apply at billing-period end, and any shortfall is charged to the workspace payment method. Credit expiry depends on the promotion.

The Render connection was restored and service inventory was inspected in the operator-confirmed My Workspace. The operator confirmed credits are redeemed in that workspace. The connected tools expose no billing balance or expiry. Browser automation failed to initialize, so credit balance, expiry, promotion restrictions, workspace plan fees and actual charges remain unverified. No Benchify services existed in the inspected inventory. Hosted acceptance remains pending.

[Pricing](https://render.com/pricing) Â· [Credit terms](https://render.com/docs/credits) Â· [Disk persistence](https://render.com/docs/disks)

## Service configuration

| Service | Blueprint | Runtime | Compute | Storage |
| --- | --- | --- | --- | --- |
| benchify-bifrost-staging | deploy/render/bifrost.yaml | Docker, pinned Bifrost v2.5.1 base | 0.5 CPU, 512 MiB | 1 GiB at /app/data |
| benchify-api-staging | render.yaml | Existing Docker backend with pinned Python base | 0.5 CPU, 512 MiB | Durable state in Neon |

Both definitions use the review branch codex/private-hosted-mvp, one instance and manual deploys. Singapore is a proposed staging region because the operator is in India. Confirm it against the existing Neon region before creation and keep both services in the same workspace and region. Region cannot be changed in place. Inspect existing service names before importing a Blueprint because names can match existing resources.

Render terminates public TLS for the API. The gateway is a private service with no public URL. Next.js stays on Vercel. Render's private network is shared with other services in the same workspace and region, so gateway admin and inference authentication remain required. The starter workspace does not provide a dedicated network boundary for this pair.

The gateway starts briefly as root to prepare the disk, applies a restrictive umask and directory permissions, then execs as UID 1000. Configuration is copied from the image on each boot. SQLite state remains on disk. Edit the checked-in seed for desired configuration changes and verify reconciliation against the existing database. Preserve the stable encryption key separately from volume backups. Request content logging is disabled and metadata retention is seven days. Container stdout retention is managed by Render. Inspect the workspace log-retention policy and avoid paid log drains without approval. Metadata retention bounds time, while the 1 GiB disk bounds capacity. Monitor disk growth and export only incident metadata.

## Verify billing before creation

1. Select the intended Render workspace and inspect Billing privately. Record credit amount, expiry, exclusions and whether credits cover compute and disk. Keep payment details out of logs and Git.
2. Confirm the current workspace plan, resource usage and remaining included build/bandwidth allowances. Estimate days covered from the available balance and this workload plus existing usage. Set usage alerts where available. Credit exhaustion can generate charges.
3. Confirm the creation estimate stays within the approved $14.25 monthly base. Stop for approval if workspace fees or service configuration change that estimate.

## Deploy the gateway first

Import a Blueprint from https://github.com/sranswal/benchify, branch codex/private-hosted-mvp, with path deploy/render/bifrost.yaml. Create only this gateway Blueprint first. The root render.yaml references the existing private service and is applied after validation.

Set these secret values directly in Render's environment settings. Use fresh credentials and the templates under deploy/examples as the variable reference. Never migrate the Windows databases or historical logs.

| Variable | Requirement |
| --- | --- |
| BIFROST_PROVIDER_API_KEY | Fresh Gemini key with the approved model access |
| BIFROST_VIRTUAL_KEY | High-entropy sk-bf- key, shared only with the API |
| BIFROST_ADMIN_USERNAME | Dedicated gateway administrator |
| BIFROST_ADMIN_PASSWORD | Strong secret, at least 16 characters |
| BIFROST_ENCRYPTION_KEY | Stable secret, at least 32 characters, backed up separately |
| BIFROST_SETUP_TOKEN | Independent random secret, at least 32 characters |

The image uses the official digest-pinned v2.5.1 gateway and the existing config seed. su-exec is pinned to 0.3-r0 for privilege dropping. GOMEMLIMIT is 384MiB, which is a Go runtime target rather than a hard total-memory limit. The Render compute tier supplies the 512 MiB limit. Low-volume AMD64 measurements previously observed roughly 267 MiB for the gateway. Startup peaks and real load on Render remain to be measured. Monitor memory, CPU, startup time, restarts and disk usage before increasing concurrency.

From the gateway shell check wget -qO- http://127.0.0.1:8080/health. Render's Blueprint healthCheckPath applies to web services, so the private gateway uses an image health check and explicit operational probes. Do not assume Docker health status alone triggers Render recovery. Verify service lifecycle behavior and add platform monitoring using existing workspace capabilities.

Verify management and inference endpoints reject anonymous access. Use the authenticated dashboard through an authorized private-network tunnel if available, and verify login plus provider scope. Never create a public gateway service or public dashboard proxy. Record the actual Internal address from Connect in the dashboard. Render's assigned hostname may include a suffix.

## Deploy the API

After gateway health and auth checks, import the root render.yaml as a second Blueprint in the same workspace and region. It references the gateway's private hostname and virtual-key environment variable using fromService. BIFROST_HOST is the private hostname; the pinned gateway listens on port 8080. The startup command constructs BIFROST_BASE_URL as http://<assigned-private-host>:<port>/openai and execs one Uvicorn process with the embedded durable worker.

Set DATABASE_URL to an isolated Neon staging DSN with TLS, TAVILY_API_KEY to the approved server credential, and BENCHIFY_OPERATOR_TOKEN to a random URL-safe 32â€“128 character value. Copy the same operator token into Vercel's server-side configuration. BENCHIFY_ENV=production disables API docs. BENCHIFY_ALLOW_LOCAL_AGENTS=0 keeps outbound-agent protections enabled. Recording retention is seven days. The API readiness route checks worker storage access. Render uses /ready for public-service health, and /health returns only liveness. These routes intentionally disclose minimal status without credentials.

The API has a 55-second Render shutdown allowance, a 25-second Uvicorn graceful timeout and a 20-second worker drain. Render rejects a custom shutdown delay for a service with a disk. The gateway uses the platform default and its termination behavior must be verified in staging. Maintain one API instance during initial staging. Render may briefly overlap instances during deploys, so Neon lease fencing remains necessary. A disk-backed gateway has deployment downtime and cannot scale across multiple instances with this SQLite volume.

## Live acceptance and Vercel

Use the internal health and live inference probe in DEPLOYMENT.md from the API shell, replacing its Compose invocation with Render shell access. Verify the model is gemini-3.1-flash-lite, virtual-key auth is enforced, and Benchify client request IDs correlate with gateway metadata. Save status, timing and IDs with secret values removed. Keep provider failures visible.

Then verify the API's actual assigned HTTPS URL, public certificate, /ready, unauthorized catalog and recording denial, authorized catalog, a live Python benchmark with Neon persistence, recording download, offline replay and comparison. Perform offline replay with external socket access blocked in an isolated test process. A scripted benchmark proves fixture behavior separately from live Gemini and Tavily. Verify Tavily claim verification and the historical NASA briefing using the staging runbook. Preserve transparent failure traces for any timeout, 429 or 503.

In sranswal/benchify-private keep frontend/ as the root, Next.js detection, npm ci and npm run build. Configure server-side BENCHIFY_ENV=production, BENCHIFY_API_URL=https://<assigned-api-host>, BENCHIFY_PUBLIC_ORIGIN=https://<assigned-web-host> and the matching BENCHIFY_OPERATOR_TOKEN. Provider keys and the Neon DSN stay on Render. Reauthenticate Vercel if the existing login still returns 403. Preserve private deployment protection and the application operator gate. Verify the actual assigned Ready URL before updating aliases.

Run the existing hosted browser suite from the repository root with the staging token supplied through the local process environment.

```bash
node frontend/tests/browser_acceptance.mjs --hosted=https://<assigned-web-host> --exercise --live
```

Inspect catalog, benchmark progress, persistence after refresh, recordings, replay, comparison, verification, historical briefing, visible provider failures and mobile navigation. A local build or synthetic smoke does not satisfy hosted acceptance.

## Recovery and operations

Drain submissions before controlled restarts. Restart Bifrost while a staging run is active, inspect visible provider failures, verify completed attempt IDs survive and confirm gateway configuration survives. Restart the API after a checkpoint, wait for lease expiry where applicable and confirm recovery without duplicated completed attempts. Run concurrent lease takeover and restore drills only against disposable staging data. Use the isolated Neon branch restoration procedure in DEPLOYMENT.md and record the restore point, recovery duration and replay result.

Stop the gateway for a consistent SQLite snapshot or use SQLite's online backup API. Encrypt off-service backups and preserve the matching image digest and encryption-key version. Render disk snapshots supplement this process. Restore into an isolated service before relying on recovery. Prune expired Benchify recordings through the existing worker and verify records lose their replay material at expiry. Monitor the gateway's seven-day cleanup and disk free space.

For gateway upgrades, back up the volume and test a disposable copy before changing the pinned base digest. Roll back with the matching database snapshot if the new gateway migrated SQLite. Retain the old encryption key until restoration is verified. Rotate provider, virtual, operator and admin credentials in the relevant service settings, check database reconciliation, and redeploy manually. Synchronize the virtual key between gateway and API and the operator token between API and Vercel.

Use Render Events and Logs for process crashes and platform restarts, API workflow IDs for provider failures, and Metrics for CPU, memory and disk. Avoid logging request content or secrets. An attached disk remains billable while a service is suspended. Record stopped-resource charges and delete disposable staging resources only with operator authorization after preserving required backups.

## Local configuration checks

Both Blueprints can be checked against https://render.com/schema/render.yaml.json. Account-aware API validation and actual provisioning remain separate checks. Build both images, then run the disposable smoke on an AMD64 Docker host. The Render test option requires PyYAML in addition to HTTPX.

```bash
docker build --platform linux/amd64 -t benchify-api:render backend
docker build --platform linux/amd64 -f deploy/render/bifrost.Dockerfile -t benchify-bifrost:render .
BENCHIFY_SMOKE_RENDER=1 BENCHIFY_SMOKE_PLATFORM=linux/amd64 BENCHIFY_SMOKE_IMAGE=benchify-api:render python deploy/smoke_arm64.py
```

This local check uses synthetic Gemini, isolated PostgreSQL and local TLS, exercising the exact API Blueprint command and the gateway disk bootstrap at 512 MiB. The Caddy container belongs to the disposable local test harness. The Render Blueprints provision only the API and gateway.

## Executed local checks, November 19, 2026

Both Blueprints passed the current public Render JSON Schema. Both AMD64 Docker images built successfully. The Render smoke passed at 0.5 CPU and 512 MiB for each service. It verified the Blueprint API command, Bifrost UID 1000 and 700/600 data-directory/config permissions, anonymous denial, synthetic authenticated inference, queue execution while the gateway was stopped, full recording download, replay comparison and inference after restart. The final resource snapshot was 49.27 MiB for FastAPI and 286.5 MiB for Bifrost. These are local observations with synthetic traffic. Real Render startup peaks and provider traffic remain unmeasured. All 30 deterministic backend tests passed.

The first account-aware gateway plan rejected maxShutdownDelaySeconds because it is unsupported for disk-backed services. The gateway Blueprint removes that field, while the disk-free API retains its 55-second setting. Public schema validation alone did not catch this platform rule.

## Account-aware gateway plan

The gateway Blueprint is exs-dbvhritg1s2s73f8s7p0 in the operator-confirmed My Workspace, with autoSync disabled. Planning succeeded against commit 8ba80f3 and proposes one new private service, benchify-bifrost-staging, at 0.5c-512mb in Singapore with a 1 GiB disk at /app/data. Existing service inventory contained no Benchify services. The plan leaves those existing applications unchanged. The sync requires six manual gateway secrets before approval. Its review page is https://dashboard.render.com/blueprint/exs-dbvhritg1s2s73f8s7p0/sync/exe-dbvhrsqjnfac73dmgdhg. A successful plan does not provision resources or demonstrate service health.

The operator confirmed credits are redeemed in this workspace. Balance, expiry and promotion exclusions remain unverified because the connected account tools expose no billing endpoint. Base estimated gateway cost is $7.25/month, leaving $7/month of the approved total for the API. Vercel project API access was retried and returned HTTP 403. Reauthenticate Vercel before frontend integration. Native hosted service startup, live inference, Neon integration, hosted browser acceptance and staging recovery have not run.

## Hosted gateway verification

Render marked gateway deploy dep-dbvi0fh5efls738pticg live after the operator populated all six environment values and redeployed. Logs confirm successful startup at 0.0.0.0:8080 and seven-day retention. The private service is srv-dbvhuj95efls738pqkb0, with a 1 GiB disk at /app/data, in Singapore on 0.5c-512mb. It has no public URL. The original deploy failed before the missing secrets were supplied.

The Render service-details response reports a private URL with port 10000 even though the service's detected open port and application logs report 8080. The API Blueprint uses fromService property host and explicitly selects the known gateway port 8080. Confirm this path with an authenticated inference request from the API after deployment. Render SSH denied access to the current local key, so direct HTTP health, dashboard login and live Gemini inference remain unverified. Add an approved SSH public key to Render or use the authorized dashboard shell for these checks.

## API approval handoff

The API Blueprint exs-dbvi2s2vcj2c73d0kuqg planned successfully at commit 409560d. The review URL is https://dashboard.render.com/blueprint/exs-dbvi2s2vcj2c73d0kuqg/sync/exe-dbvi2savcj2c73d0kvn0. It creates benchify-api-staging on 0.5c-512mb in Singapore, references the existing private gateway hostname and virtual key, sets /ready as its health check, and requires DATABASE_URL, TAVILY_API_KEY and BENCHIFY_OPERATOR_TOKEN. The DSN must use an isolated Neon staging branch. Keep the operator token for Vercel's server-side proxy. Approval and these secret values remain operator actions. No API service has been provisioned by this plan.

The local smoke with the corrected hostname and port passed synthetic authenticated inference, queue execution, recording, replay comparison and gateway restart. The final resource snapshot was 48.29 MiB for the API and 299.2 MiB for Bifrost. Hosted live inference and staging database workflows remain open.

## Startup command correction

The first API deployments exited 127 before starting Python. Render interpreted the inline shell program in dockerCommand as a command name. The previous local smoke used shlex splitting and did not reproduce Render's command parsing. Startup now lives in backend/start.sh and both the Docker image default and Blueprint command use /bin/sh /app/start.sh. This removes the nested command quoting and keeps the private gateway URL construction and one-worker settings in one executable script.

DATABASE_URL, TAVILY_API_KEY and BENCHIFY_OPERATOR_TOKEN belong to benchify-api-staging. The gateway service needs its six BIFROST_* settings. Adding API variables to the gateway does not supply them to the API. Extra API variables on the gateway can be removed from that service after confirming the API is configured, preserving the six gateway values. The operator token must also be configured server-side in Vercel when connecting the frontend.

## Live API startup fix verified

API deploy dep-dbvi70l9el5s739r9nqg became live at source commit d97797c after applying the script-based startup correction. The URL is https://benchify-api-staging.onrender.com. External HTTPS probes returned /health 200, /ready 200 with status ready, anonymous /api/v1/runs/catalog 401, /docs 401 and /openapi.json 401. Runtime logs confirm Uvicorn started on 0.0.0.0:10000 and application startup completed. The readiness response confirms the durable worker has accessed its configured storage. It does not establish isolated branch ownership or completion of a live benchmark.

The corrected image also passed the disposable local Render smoke. Authenticated hosted inference, benchmark, recording, replay, comparison and live Tavily checks remain pending because the operator token is currently available only in Render. The three API secrets were also entered on the gateway by the operator. Remove DATABASE_URL, TAVILY_API_KEY and BENCHIFY_OPERATOR_TOKEN from the gateway Environment page after confirming they exist on the API. Retain its six BIFROST_* values and PORT.
