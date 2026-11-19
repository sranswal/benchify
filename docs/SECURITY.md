# Security and tenant boundaries

Benchify is an operator-only developer MVP. Production mode requires a shared operator credential. One credential grants access to the full deployment. Workspace ownership, per-user authorization, ingress quotas and public tenant access remain unimplemented.

## Threat model and current controls

| Surface | Current boundary and controls | Remaining work |
|---|---|---|
| API and UI | Production requires an operator token. FastAPI authenticates Bearer requests. Next authenticates Basic credentials, blocks cross-origin browser writes, and forwards the token only after authentication. Liveness and readiness expose generic status. | Use TLS and private ingress. Add rate limits, per-user identities, audit events and workspace authorization before inviting external developers. |
| Agent registration and execution | Registry configuration is operator-owned. HTTP targets require an exact HTTPS origin allowlist entry. Every DNS answer is checked for public routability before a connection uses a selected numeric IP. TLS SNI and the HTTP Host preserve the configured hostname. Redirects, proxy environment and compressed responses are disabled. Response size and time are capped. | Enforce network-level outbound restrictions as defense in depth. Keep DNS, routing, and agent ownership under operator control. |
| Local agent and fixtures | Loopback requires BENCHIFY_ENV=development and BENCHIFY_ALLOW_LOCAL_AGENTS=1. The exception accepts loopback DNS answers alone and cannot be enabled in production. Fixture callbacks use a separate random in-memory capability valid for an active attempt. Each is bounded to 16 searches and 2 KiB per request. | Keep callback URLs out of logs and expose only the callback path when external agents need it. Multi-process callbacks require a shared or routable capability. |
| Credentials and provider traffic | Provider and agent credentials are server-side environment secrets. Provider URLs are operator configuration. Benchify disables redirects for Bifrost, Tavily and agent requests. | Use scoped, rotated credentials. Limit network routes and secure gateway access logs. |
| Recordings and downloads | Opt-in typed capture excludes headers and raw HTTP bodies. Known credential patterns and configured secrets cause rejection. Limits are 192 KiB, 32 logical calls and 1–30 days retention. Over-limit captures are marked rejected with no replayable partial object. Recording reads and deletion share the operator gate. Downloads are no-store attachments. | Captures still retain input text, excerpts and model outputs. Apply data classification and backup/output retention. Add workspace ownership and auditability. |
| Datasets and evidence | Dataset files are supplied by the operator and validated as versioned fixture JSON. There is no public dataset upload. Provider excerpts are untrusted data and are rendered as text or validated HTTP(S) links. Replay uses typed recordings and opens no URLs. | Add upload scanning and authenticated ownership before supporting uploads. Verification models can still make mistakes or be influenced by source text. |
| Queue and storage | Transactional checkpointing uses leased jobs and fenced writes. A PostgreSQL role accesses a shared dataset. | Add queue admission, per-workspace quotas, narrower runtime roles, scoped data queries and recovery tests. |

### Recording deletion

DELETE /api/v1/runs/{run_id}/attempts/{attempt_id}/recording removes the saved capture. Expiry blocks downloads and replay immediately. The worker prunes expired recording bodies in batches and keeps the original attempt and verification result. Pruning cannot revoke previously downloaded copies or control database backup retention. See [capture and replay](REPLAY_AND_REGRESSION.md) for data contents.

### External beta

Use an identity provider and secure server-managed sessions. Introduce workspace ownership to runs, agents, datasets, recordings, events and jobs. Enforce ownership during both enqueue and execution. Use tenant-scoped queries and, where suitable, row-level security with transaction-scoped identity. Verify cross-workspace read/write denial, callback isolation, secret scoping, worker context cleanup and exports. Introduce scoped API tokens, quotas and an audit trail as developer access expands. [OWASP SSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

## Hosted release checks

The production web proxy requires an explicit HTTPS backend origin and does not follow redirects. Keep Neon, Bifrost and Tavily credentials on the API service. The Vercel runtime receives only its server-side operator token and the approved origins. Production disables FastAPI's docs and schema routes. Check anonymous denial for the application, catalog and recordings. Verify the public bundle contains no secret values and use the production container's authenticated probes to confirm the debug routes return 404. Treat platform deployment logs and control-plane access as private. See [hosted configuration and validation](DEPLOYMENT.md).

## OCI co-hosting

The Compose stack publishes only the reverse proxy on TCP 80 and 443. The proxy shares an edge network with FastAPI. The API and gateway communicate on a separate internal network, and the gateway has a separate provider-egress bridge. Gateway port 8080, FastAPI port 8000, probes, and the dashboard have no public proxy route. Use the OCI NSG/security list and an administrator-only SSH tunnel for management.

Bifrost's config seed requires dashboard and inference authentication, keeps request metadata and resolves credentials from runtime environment references. Protect the stable encryption key, setup token, provider key and admin password in a restricted host secret directory. Docker administrators can inspect the container environment. Limit Docker access and keep secret files, volume archives and database backups outside Git. Verify the deployed listeners and live auth behavior before connecting Vercel.

## Render private staging

The gateway is a private service and exposes no public URL. Private networking is shared within the workspace and region. Require dashboard and virtual-key authentication independently. The API uses Render HTTPS and the existing operator gate. Credentials are entered directly into service settings, with only the operator token shared with Vercel. The gateway prepares its data directory before dropping to UID 1000. The disk and its backups contain sensitive encrypted configuration and request metadata. See the [Render runbook](RENDER.md) for rotation and access checks.
