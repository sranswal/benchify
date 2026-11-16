# Benchify architecture

Benchify is an early single-operator agent quality engineering platform. Meeting research is its reference workload. Keep Next.js and the FastAPI modular monolith, with Neon/Postgres for durable run storage, Bifrost for model execution and Tavily for evidence retrieval.

| Boundary | Implementation |
|---|---|
| Next.js | Same-origin API proxy, benchmark setup, polling, results and JSON export, research and claim inspection. |
| FastAPI | Pydantic inputs, operator registry, task catalog, live workflows, inline preview and durable run API. |
| Benchmark | Expands agents, scenarios and repetitions. Injects one search 429/503 per selected attempt. Captures fixture SHA-256, rubric, agent revision labels, model mode and configured model name. |
| Worker and Postgres | Enqueue commits run and job together. Claim uses SELECT FOR UPDATE SKIP LOCKED and a 120-second tokenized lease. Checkpoint locks the leased position and commits attempt, events and progress together. |
| Provider and verification | Typed model results, exact citation substrings, publication-date windows, and an excerpt-only entailment check for supported dated findings. |

## Evidence and debt

- Checkpoint transactions and primary keys protect completed positions. A crash before commit can repeat outbound work. Create and rerun have no caller idempotency key. Takeover fences the previous checkpoint token but can overlap outbound work. Queue processing is at least once.
- The worker usually runs one attempt per process. The API capacity semaphore is process-local and excludes queued work. Enqueue has no admission control. The health route checks liveness alone. An unexpected failure outside the job execution catch can end the worker task.
- Fixture callbacks live in an in-memory map in benchmark.py. Use one FastAPI process for HTTP fixture runs until callbacks can route to their owner or share durable state.
- run_store.py calls initialize() from enqueue, detail and history, taking an advisory lock and issuing DDL on request paths. Introduce versioned migrations and remove runtime DDL. Measure queue age, query latency and connection pressure before tuning pools or changing worker topology.
- History caps at 30 rows and detail loads all attempt events. Introduce pagination and versioned response contracts. Agent revision labels are operator supplied, and provider policy and prompt versions are not snapshotted. Compare runs across builds only with this limitation in view.
- The Python branch and HTTP invocation are embedded in the attempt runner. When adding a second independent implementation, define a typed adapter protocol and preserve scheduling, scoring, failure accounting and persistence in the runner. Formalize versioned task, dataset, agent, run, attempt, tool, model, evidence and failure contracts.
- The binary fixture rubric checks the canonical date, canonical statement or verified Python paraphrase, exact primary excerpt and a meeting question. Fault scenarios also require injection and successful retrieval. Cost and token totals sum supplied measurements. Unknown telemetry is nullable and can understate totals.

Separate worker lifecycle only after callback affinity and lease/fencing tests are in place. Keep inference outside database transactions. Add readiness, migrations, queue/provider instrumentation and staged acceptance ahead of horizontal scaling.

## Evidence recording and replay

Opt-in capture wraps the workflow provider interface and writes a versioned recording alongside the attempt in the existing checkpoint transaction. Typed values and a separate ordered trace preserve evidence without storing raw HTTP bodies or credentials. The replay engine reruns the workflow and rubric with an in-memory provider, and rejects call fingerprint or output mismatches. Saved-run reads include only capture metadata unless the recording is requested. A bounded worker sweep removes expired recordings.

See [replay, retention and comparison](REPLAY_AND_REGRESSION.md) for the versioned formats, API and operational limits.

## Private deployment boundaries

The Next.js proxy and FastAPI share an operator token in production. Agent execution validates an explicit HTTPS origin, checks DNS answers, and pins the TCP connection while preserving the trusted TLS hostname. Each fixture callback has a separate short-lived capability. These controls maintain a single operator boundary. Workspace scoping requires introducing ownership to the API and database, including worker claims.

See [deployment](DEPLOYMENT.md) for readiness, draining, restore and rollback, and [security](SECURITY.md) for the threat model.
