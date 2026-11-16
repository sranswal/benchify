# Developer guide

## First benchmark

Follow the [local setup](../README.md), start FastAPI and the included Node agent, then run benchify.benchmark_cli with --model-mode scripted --repetitions 1 using PYTHONPATH=backend. Scripted preview requires neither model credentials nor Postgres. Add --persist to queue and poll a saved run with DATABASE_URL configured.

- GET /api/v1/runs/catalog returns agent IDs and task revisions.
- POST /api/v1/runs/preview and POST /api/v1/runs accept agents, fixture_revision, model_mode, repetitions and scenarios. Preview runs inline and create returns HTTP 202.
- Poll GET /api/v1/runs/{id} and use POST /api/v1/runs/{id}/rerun to request another execution against available revisions.
- FastAPI serves current request schemas at /docs. Pin the app version for integrations while the persisted result contract evolves.

## HTTP adapter

Use backend/http-agent.mjs as the working reference. Register a stable ID, name, revision and endpoint in BENCHIFY_HTTP_AGENTS, then restart FastAPI. Optionally configure a per-agent bearer environment variable. Advance the revision when endpoint behavior changes.

The runner posts meeting, window and search_url. POST a query string of 1–400 characters to the callback and consume its sources. Expect a one-shot 429 or 503 in matching scenarios. Return findings and questions. Each finding carries claim, status and evidence. The HTTP rubric expects the canonical claim text, correct development date, exact primary excerpt and a meeting question. Optional usage includes input_tokens, output_tokens and cost_usd. Nonlocal endpoints need HTTPS and a reachable callback origin inside the trusted deployment boundary.

Set BENCHIFY_FIXTURE_DIRECTORY to add fixture JSON. Use the Northwind file as a schema example and keep bytes stable per revision. Recorded fixtures capture dataset evidence. Opt-in recordings can replay the native Python workflow using the actual typed model outputs and search results consumed by Benchify.

## Integration planning

The built-in Python workload is native; the runner has no public Python plugin interface yet. Stabilize a typed adapter and persisted schemas before issuing versioned Python and TypeScript SDKs. Extend the existing CLI for headless integration first. A Docker setup should package the single-process API and agent with explicit callback reachability and separate secrets.

Run credential-free tests via the README. Point smoke_release.py at a disposable database. Use --restart to test checkpoint recovery, --web for the production proxy, and --live for billable external calls. The proxy smoke is an HTTP test. Real browser acceptance remains an independent milestone.

See [replay, retention and comparison](REPLAY_AND_REGRESSION.md) for the versioned formats, API and operational limits.

## Local HTTP and client access

Enable the local Node agent with BENCHIFY_ENV=development and BENCHIFY_ALLOW_LOCAL_AGENTS=1. For public endpoints, configure their exact HTTPS origins and a reachable callback origin. Agent registration is operator configuration, so restart to reload changes. The product catalog exposes the resulting agents and dataset revisions.

With an operator token configured, use it as a Bearer credential for direct API and CLI access. For a private web deployment, sign in to the browser challenge as benchify. See [deployment](DEPLOYMENT.md) and [security](SECURITY.md).
