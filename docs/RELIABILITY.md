# Reliability and evidence correctness

## Application findings

- Bifrost previously used one fixed-delay retry. API and worker HTTP timeout settings differed. Failed calls lost gateway request IDs. Invalid model payloads could appear successful in provider telemetry.
- Historical discovery previously searched for “recent news” and verification discarded the discovery excerpts. If targeted search returned no sources, a supported draft could become insufficient evidence. Discovery now names the date window. Targeted search includes the event date, and eligible discovery and targeted excerpts are both judged. Future-dated results cannot support historical claims.
- Briefing findings still require an eligible dated publication, exact quote, explicit event date in the excerpt, and a quote-only entailment judgment. Missing publication dates, date format mismatches, truncated excerpts and model abstention can yield zero findings. Freshness is the latest eligible evidence age mapped linearly from 100 at age zero to 0 at 90 days. It is an age signal, not a probability of correctness. [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)

## Execution policy

Bifrost allows up to two client attempts within a 42-second budget, with a 20-second cap per attempt and capped exponential full jitter between attempts. The retry covers 429, 502, 503 and 504 plus connection establishment errors/timeouts. Retry-After is honored when it fits the remaining deadline. Ambiguous read and elapsed deadlines do not trigger another inference. An HTTP error response can still follow billable upstream work. Benchify does not request fallback. Gateway-side retries, cache, routing and fallback can change actual execution.

The live workflow deadline is 90 seconds, the live Python benchmark deadline is 85 seconds, and a Tavily request has a 12-second deadline. Initial briefing search retains one retry for eligible errors, including injected fixture faults. Targeted search and HTTP agent execution are single calls. Queue recovery can repeat interrupted positions.

Events expose logical operation, physical request and workflow IDs, attempt number, latency, status, failure class, requested and returned model, gateway ID when available, and supplied usage. Invalid structured results are failed events even when HTTP returned 200. Workflow failure responses include correlation and available events. Benchmark attempts preserve failed and recovered calls.

## Operational diagnosis and release checks

1. Compare serial like-for-like JSON-mode requests through Benchify and directly at the gateway. Correlate gateway ID with ingress and provider logs. Inspect configured virtual-key route, resolved model, retry/fallback/cache behavior, quota, queue depth, timeout phase, and upstream response codes. Increase concurrency only after establishing a serial baseline. An HTTP 503 alone cannot distinguish these layers. [Bifrost routing and dimensions](https://docs.getbifrost.ai/changelogs/v1.5.0)
2. Run the historical NASA case and log eligible discovery count, draft count and verification outcomes. Review exact excerpts against originals. Capture the typed workflow responses and replay them with network disabled. Run full live Northwind by scenario and report successes over attempts, retry volume and latency. A completed run means the queue finished; individual attempts own rubric success.
3. Run credential-free unit and mocked integration tests on every change. Run disposable Postgres recovery tests for crash after checkpoint, lease takeover, duplicate delivery and concurrent claims. Keep provider tests opt-in. Stage a real browser pass for enrollment, polling across reload, export, evidence and failure states.
4. Measure queue age, worker heartbeat, provider outcomes, retry volume, and coverage of model and cost telemetry. Establish a serial/concurrent baseline before introducing a shared circuit breaker. Circuit state and rejected calls would need clear benchmark provenance.

## Live spot checks

In November 2026 the historical NASA Artemis I briefing for December 1, 2022 returned one supported finding. The Northwind live Python baseline passed, and a separate serial run passed 3/3 Python attempts across baseline, injected search 503, and injected search 429. Both injected search failures recovered. The actual Bifrost and Tavily calls in these probes returned HTTP 200. No Bifrost gateway request ID was visible in these responses, so check whether the deployed gateway forwards its IDs and logs the client dimension. One Northwind model request took about 10.9 seconds. A subsequent live claim-verification smoke hit the initial 12-second deadline. The provisional cap was raised to 20 seconds in response. The next credentialed smoke passed both live API routes and produced one supported NASA finding. Reassess the cap with per-route latency distributions. These spot checks do not identify the intermittent gateway or upstream failure cause.

The scripted Neon smoke passed six attempts across Python and a separately registered HTTP agent. It restarted FastAPI after a checkpoint, preserved the completed attempt IDs, verified persisted traces and a repeat run, and checked the production Next.js proxy over loopback. Hosted browser interaction and concurrent lease takeover remain acceptance work.

See [replay, retention and comparison](REPLAY_AND_REGRESSION.md) for the versioned formats, API and operational limits.

## Gateway access check

The configured local gateway returned HTTP 200 on its health route. The logs endpoint returned 401 both without credentials and with the inference credential. One serial and two parallel synthetic inference requests each returned HTTP 200 on the first request (735, 1,125 and 2,457 ms). Returned model names matched the configured model after removing its routing prefix. Gateway request IDs and resolved provider identifiers were absent. This sample cannot establish fallback behavior, the location of an intermittent 503 or a concurrency threshold. Correlate future failed client request IDs with authorized gateway and upstream logs and record the configured retry policy and deadlines. Benchify uses a 20-second per-call cap and at most two attempts within 42 seconds.

Readiness now tracks worker access to storage, and shutdown drains an active attempt for up to 20 seconds. See [deployment and recovery](DEPLOYMENT.md) for the operational boundary.

The credentialed local Chrome historical briefing produced one verified finding. A claim-verification request hit the Bifrost timeout and displayed the failure in the UI. The client workflow ID for that failure was 9bbeaeab-9921-40cb-9c57-7d8030a522ee.

A later credentialed browser rerun returned a claim-verification review and one verified historical finding. The earlier timeout is still evidence of intermittent provider latency.

## Hosted deployment recovery

Checkpoint writes now require both the current lease token and an unexpired lease. The worker logs reclaimed leases and discarded stale results with run ID and position. Database operations use 8-second connect, 10-second statement, and 5-second lock limits. Shutdown stops new claims and can finish the current attempt within the drain window. Attempts interrupted after provider work may run again when their lease expires. Keep the provider budget below the lease and keep hosting CPU available while no HTTP request is active.

Run the [isolated recovery exercise](DEPLOYMENT.md) before release. It uses a fresh PostgreSQL container so it can expire a lease, exercise concurrent claimants, restore from a dump, and resume work without modifying application data. A hosted rollout also needs the correct Vercel scope, a reachable API host, and a managed Neon restore rehearsal.

The isolated PostgreSQL recovery drill verified that exactly one concurrent claimant received a reclaimed lease. A separate hard restart resumed after a real 120-second lease. The Neon logical restore copied two completed synthetic attempts and their recordings, then replayed them and executed the restored pending job. Managed Neon point-in-time recovery still needs control-plane access to an isolated staging branch.

In this milestone's credentialed loopback check, claim verification returned HTTP 200 and one review. Tavily returned HTTP 200 and a Bifrost 503 recovered on retry. The historical briefing returned a visible HTTP 502 after Bifrost 503 responses, with workflow ID e1850412-232e-4704-bd36-c122a8d201fb. The trace preserved failures and cancellations. These were direct loopback checks, and the 503 source still requires gateway and upstream logs.

## Native staging release gate

The November 19 deployment publication preserves the earlier 30 passing deterministic tests and local AMD64 Compose smoke. ARM64 API readiness passed under emulation, while Bifrost stopped progressing at model-catalog initialization within the test window. Native A1 startup and authenticated inference still require an approved VM. Repeat gateway persistence, lease recovery and managed Neon restoration in isolated staging. Current cloud cost, native resource use, public TLS and hosted acceptance remain unverified. See the [staging handoff](DEPLOYMENT.md).
