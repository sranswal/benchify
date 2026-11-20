# Benchify Deployment Guide & Production Runbook

This runbook documents the deployment architecture, configuration, operational procedures, and recovery runbooks for Benchify.

---

## Architecture & Production Topology

Benchify employs a decoupled, high-availability architecture separating the edge presentation layer from the durable evaluation and inference gateway layers.

```
                      +---------------------------------------+
                      |       Vercel Edge Network             |
                      |  Next.js 14 Web Application / UI      |
                      |  - Route Handlers & Operator Gate     |
                      |  - Static Brand Assets & Reports      |
                      +-------------------+-------------------+
                                          |
                               HTTPS (Operator Token)
                                          |
                                          v
                      +---------------------------------------+
                      |       Render Web Service (API)        |
                      |  FastAPI Orchestration Engine         |
                      |  - Lease-Based Attempt Worker         |
                      |  - Chaos Injection Matrix             |
                      |  - Claim Decomposition & Rubrics      |
                      +-----------+---------------+-----------+
                                  |               |
                     Private HTTP |               | TLS / Pooled
                                  v               v
    +-------------------------------+   +-----------------------------+
    |   Render Private Service      |   |   Neon Serverless Postgres  |
    |   Bifrost LLM Gateway         |   |   - Durable State & Traces  |
    |   - Virtual Key Routing       |   |   - Lease Tokens & Runs     |
    |   - Provider Fallback/Retry   |   |   - Offline Replay Bundles  |
    +---------------+---------------+   +-----------------------------+
                    |
              HTTPS |
                    v
    +-------------------------------+   +-----------------------------+
    |   Google Gemini 3.1 Flash     |   |   Tavily Live Search API    |
    |   Upstream Model Inference    |   |   Primary-Source Retrieval  |
    +-------------------------------+   +-----------------------------+
```

| Component | Placement | Technology | Operational Function |
| :--- | :--- | :--- | :--- |
| **Web UI** | Vercel Edge | Next.js 14 App Router | Operator dashboard, report generation, and API proxy |
| **Core Engine** | Render | FastAPI (Docker) | Workflow orchestration, chaos fault injector, and durable worker |
| **LLM Gateway** | Render | Bifrost (Docker Private) | Upstream LLM proxy, credential isolation, and routing |
| **State Storage** | Neon | Serverless PostgreSQL | Run persistence, distributed leases, and trace recordings |
| **Live Search** | SaaS | Tavily Search API | Outbound HTTPS search for temporal fact verification |

---

## Configuration & Environment Variables

### 1. Backend Core API (Render Web Service)

| Environment Variable | Required | Description | Example / Recommended |
| :--- | :---: | :--- | :--- |
| `BENCHIFY_ENV` | Yes | Runtime environment mode | `production` |
| `BENCHIFY_OPERATOR_TOKEN` | Yes | Shared secret for authenticating edge proxy and CLI requests | `64-character random URL-safe token` |
| `DATABASE_URL` | Yes | Pooled PostgreSQL TLS connection string | `postgresql://user:pass@ep-xyz-pooler.neon.tech/benchify?sslmode=require` |
| `BIFROST_BASE_URL` | Yes | Origin of the Bifrost gateway (internal Render address) | `http://benchify-bifrost:8080/openai` |
| `BIFROST_MODEL` | Yes | Target model identifier | `gemini-2.0-flash` or `gemini-3.1-flash` |
| `BIFROST_VIRTUAL_KEY` | Yes | Authentication token for Bifrost inference routing | Injected from secret store |
| `TAVILY_API_KEY` | Yes | API key for live search queries | Injected from secret store |
| `BENCHIFY_ALLOW_LOCAL_AGENTS` | No | Allow loopback/non-HTTPS external agents (`0` in production) | `0` |
| `BENCHIFY_CAPTURE_RETENTION_DAYS`| No | Retention period for recorded run traces | `14` |
| `BENCHIFY_AGENT_ALLOWED_ORIGINS` | No | Comma-separated whitelist of allowed HTTPS agent endpoints | `https://agent.example.com` |
| `BENCHIFY_FIXTURE_ORIGIN` | No | Base URL exposed for external agents to query callbacks | `https://api.yourdomain.com` |

### 2. Frontend Web Application (Vercel)

| Environment Variable | Required | Description | Example / Recommended |
| :--- | :---: | :--- | :--- |
| `BENCHIFY_ENV` | Yes | Production environment identifier | `production` |
| `BENCHIFY_OPERATOR_TOKEN` | Yes | Matching token for upstream API authentication | Same as backend `BENCHIFY_OPERATOR_TOKEN` |
| `BENCHIFY_API_URL` | Yes | Public HTTPS URL of the Render API service | `https://benchify-api.onrender.com` |
| `BENCHIFY_PUBLIC_ORIGIN` | Yes | Public canonical URL of the web UI | `https://try-benchify.vercel.app` |

---

## Deployment Procedures

### Step 1: Database Provisioning (Neon)

1. Create a dedicated project in Neon.
2. Create separate branches for `staging` and `production`.
3. Enable connection pooling and copy the pooled connection string (`sslmode=require`).
4. Schema migrations are applied automatically by the backend worker upon startup.

### Step 2: LLM Gateway Deployment (Bifrost on Render)

1. Deploy Bifrost as a **Private Service** in the same Render region as the API service.
2. Use the container definition at `deploy/render/bifrost.Dockerfile` and configuration from `deploy/bifrost.config.json`.
3. Configure the virtual key, upstream model routing (Gemini), and administrative secrets in Render's environment settings.
4. Keep all administrative ports and dashboards off public ingress; Bifrost should only be accessible via the Render private network.

### Step 3: Backend API Deployment (Render Web Service)

1. Create a new **Web Service** on Render pointing to your repository.
2. Configure settings:
   - **Environment**: Docker (Root directory: `backend`, Dockerfile: `Dockerfile`).
   - **Health Check Path**: `/ready`
   - **Instance Type**: 0.5+ vCPU, 512+ MiB RAM (always-on, scaling to zero disabled).
   - **Graceful Shutdown**: Set `maxShutdownDelaySeconds` to `60` to allow running worker attempts to drain.
3. Populate all required backend environment variables.
4. Verify deployment liveness:
   ```bash
   curl -i https://<your-api-host>/ready
   # Expected: HTTP 200 {"status": "ready"}
   ```

### Step 4: Frontend Web App Deployment (Vercel)

1. Connect the repository in Vercel.
2. Configure settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Node.js Version**: `20.x` or `24.x`
   - **Build Command**: `npm run build`
   - **Install Command**: `npm ci`
3. Configure frontend environment variables (`BENCHIFY_ENV`, `BENCHIFY_OPERATOR_TOKEN`, `BENCHIFY_API_URL`, `BENCHIFY_PUBLIC_ORIGIN`).
4. Deploy and verify that the custom domain or production alias is healthy.

---

## Verification & Acceptance Testing

Run automated acceptance tests to verify that the deployed infrastructure behaves correctly under real workloads:

```bash
# 1. Read-only verification
node frontend/tests/browser_acceptance.mjs --hosted=https://<your-web-host>

# 2. Comprehensive end-to-end acceptance (synthetic runs, live search & briefings)
node frontend/tests/browser_acceptance.mjs --hosted=https://<your-web-host> --exercise --live
```

### Verification Checklist:
- [ ] Anonymous access to `/api/v1/runs` returns `HTTP 401 Unauthorized`.
- [ ] Direct backend calls using `Authorization: Bearer <BENCHIFY_OPERATOR_TOKEN>` return `HTTP 200`.
- [ ] Web UI prompts for operator authentication (HTTP Basic credentials: username `benchify`).
- [ ] Production disables `/docs`, `/redoc`, and `/openapi.json` Swagger endpoints.
- [ ] End-to-end benchmark run completes with traces and score breakdown.
- [ ] Injected HTTP 503 and 429 chaos scenarios properly trigger agent backoff and recovery.

---

## Operations, Recovery & Rollbacks

### Worker Drain & Graceful Shutdown
When terminating or redeploying the backend API container:
- The worker listens for `SIGTERM` signals.
- New benchmark queue claims are halted immediately.
- Active in-progress attempts are given up to 55 seconds to finalize their checkpoints before shutdown.

### Distributed Lease Recovery
- All background evaluation jobs rely on a PostgreSQL lease token with a TTL (default: 120 seconds).
- If a container crashes or is abruptly killed, the expired lease is safely reclaimed by another active worker.
- Fencing tokens prevent stale writers from corrupting checkpoint state.

### Disaster Recovery Runbook
1. **Neon Point-in-Time Restore**: Restore from a Neon database recovery point to an isolated recovery branch.
2. **Configuration Verification**: Point a staging API instance to the restored branch to verify run counts, recording integrity, and pending attempt execution.
3. **Traffic Promotion**: Update `DATABASE_URL` on the primary Render service once verified.
4. **Service Rollback**: If rolling back code revisions, redeploy the previous tagged Docker image commit. Ensure the rollback build includes the operator authentication gate.
