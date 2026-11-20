# Reliability Engineering & Fault Tolerance

Benchify is built to evaluate and enforce reliability in autonomous AI agents. In production, agents encounter transient network failures, rate limiting, and shifting web information. This document outlines the reliability policies, chaos engineering matrix, lease-based worker architecture, and verification engine that power Benchify.

---

## Core Reliability Architecture

```
                          +--------------------------------+
                          |   Operator / CI Runner / UI    |
                          +---------------+----------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Benchify Evaluation Engine                                                        |
|                                                                                   |
|  +--------------------+     +-----------------------+     +--------------------+  |
|  |   Lease Worker     | --> |     Chaos Engine      | --> |  Telemetry Tracer  |  |
|  | - Fencing Tokens   |     | - HTTP 503 Injection  |     | - Latency & Costs  |  |
|  | - 120s TTL Leases  |     | - HTTP 429 Injection  |     | - Audit Request ID |  |
|  | - Graceful Drain   |     | - Latency Jitter      |     | - Waterfall Events |  |
|  +--------------------+     +-----------------------+     +--------------------+  |
+-----------------------------------------------------------------------------------+
             |                                    |
             v                                    v
+------------------------+           +---------------------------------------------+
|  Evaluated Agents      |           | Verification Engine                         |
| - Python ReAct Agent   |           | - Claim Decomposition (Atomic Statements)   |
| - HTTP Adapter Agents  |           | - 30-Day Temporal Boundary Enforcement      |
+------------------------+           | - Strict Two-Stage Entailment Checking      |
                                     +---------------------------------------------+
```

---

## Execution Budgets & Retry Policies

To prevent runaway cascades and costly inference loops, Benchify enforces strict execution budgets across all pipeline stages:

| Operation | Timeout / Budget | Retry Policy | Failure Handling |
| :--- | :---: | :--- | :--- |
| **Bifrost Inference Call** | 20s per attempt | Up to 2 attempts within 42s budget; exponential full-jitter backoff | Fails fast on persistent 5xx/4xx errors |
| **Tavily Live Search** | 12s per call | Single call (one retry for initial briefing on eligible errors) | Returns empty source set with error event |
| **Overall Workflow Run** | 90s deadline | Enforced at workflow lifecycle coordinator | Cancels pending tasks, records failure |
| **Python Benchmark Task** | 85s deadline | Single attempt per scenario slot | Evaluates graceful failure handling |
| **HTTP Agent Execution** | 60s per task | Single dispatch to external HTTPS agent | Captures response or records timeout |

### Gateway Retry Strategy
- **Eligible Codes**: HTTP 429 (Rate Limit), 502 (Bad Gateway), 503 (Service Unavailable), and 504 (Gateway Timeout), plus transport connection timeouts.
- **Backoff Algorithm**: Capped exponential backoff with full jitter to avoid synchronization spikes against upstream providers.
- **Retry-After Header**: Automatically honored when provided by the upstream service, provided it fits within the remaining execution budget.
- **Idempotency**: Ambiguous read timeouts do not trigger re-inference unless explicitly marked safe, preventing duplicate billing.

---

## Chaos Engineering & Fault Injection Matrix

Benchify validates agent fault tolerance by injecting controlled real-world failure modes during execution:

### 1. Injected HTTP 503 (Service Unavailable)
- **Mechanism**: The callback fixture intercepts the agent's first search request and returns an immediate `HTTP 503 Service Unavailable`.
- **Expected Behavior**: A resilient agent must catch the 503 error, initiate an exponential backoff or retry mechanism, and successfully complete the task on attempt 2.
- **Failure Condition**: The agent crashes, halts execution, or returns an unhandled exception.

### 2. Injected HTTP 429 (Rate Limit Exceeded)
- **Mechanism**: The fixture returns an `HTTP 429 Too Many Requests` status with an optional `Retry-After` header.
- **Expected Behavior**: The agent respects the rate-limit window, pauses outbound requests, and retries once the window has elapsed.
- **Failure Condition**: The agent spams immediate follow-up requests or terminates prematurely.

### 3. Latency Jitter
- **Mechanism**: Introduces synthetic 2,000–5,000ms delay into tool callbacks and search queries.
- **Expected Behavior**: Agent async task managers maintain connection state and proceed without timing out prematurely.

---

## Distributed Lease Worker & Checkpoint Durability

Benchify decouples benchmark dispatching from attempt execution using a durable, lease-based worker queue backed by PostgreSQL:

```
[ Worker 1 ] ----( Claim Job: Token A, TTL 120s )----> [ Neon PostgreSQL ]
     |                                                         ^
(Executes Task)                                                |
     |                                                         |
     +-------------( Write Checkpoint + Verify Token A )-------+
```

1. **Distributed Lease Protocol**:
   - Workers query pending jobs and acquire exclusive execution leases.
   - Each claim receives a cryptographically unique `lease_token` and an expiration timestamp (120s TTL).
2. **Fencing Tokens (Stale-Writer Protection)**:
   - Checkpoint updates require matching the active `lease_token` AND an unexpired TTL.
   - If a worker stalls (e.g. prolonged network partition), another worker claims the expired job. The former worker's subsequent write attempts are rejected, preventing data corruption.
3. **Graceful Worker Drain**:
   - On shutdown (`SIGTERM`), the worker halts new claims and allows up to 55 seconds for active in-flight attempts to persist their checkpoints.
4. **Resilience to Restarts**:
   - If the API process restarts mid-benchmark, all completed attempt checkpoints remain committed, and unfinished positions are resumed upon lease expiry.

---

## Freshness & Entailment Verification Engine

To eliminate hallucination and stale data in autonomous research tasks, Benchify implements a two-stage verification pipeline:

### 1. Claim Decomposition
- Multi-paragraph agent responses are parsed and split into discrete, testable atomic factual statements.
- Non-factual narrative styling and opinions are stripped out.

### 2. 30-Day Temporal Boundary
- For real-time and news-sensitive tasks, evidence must carry an explicit publication timestamp within a 30-day window of the event date.
- Sources lacking publication dates or published outside the temporal boundary are excluded from scoring.

### 3. Two-Stage Quote Entailment
- **Source Verification**: The factual statement is evaluated strictly against exact, unedited quotes from primary sources retrieved during the run.
- **Entailment Scoring**: A claim is classified as:
  - **Supported**: Directly entailed by the cited primary-source quote.
  - **Refuted**: Contradicted by the source evidence.
  - **Insufficient Evidence**: Cited source does not contain adequate text to prove the claim.

---

## Telemetry & Trace Observability

Every execution step generates structured audit telemetry:

- **Trace Correlation**: Each run assigns a unique `run_id`, `workflow_id`, and `client_request_id` passed through headers to downstream gateways.
- **Waterfall Telemetry**: The UI and API render exact step-by-step latency breakdowns (fixture retrieval time vs. model inference latency).
- **Financial Accounting**: Precise input/output token counts and calculated USD costs are recorded per attempt.
- **Offline Replay**: Full request/response payloads can be exported into self-contained JSON replay files, allowing deterministic regression testing with zero network access.
