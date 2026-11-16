# Replay and regression intelligence

## Capture and evidence provenance

Capture is off by default. Use `capture_mode: "full"` on a Python-only benchmark, or `?capture_mode=full` on the standalone briefing and verification endpoints. Benchmark retrieval uses the versioned fixture callback. Standalone live workflows consume Tavily results. Capturing a run never changes its scoring or retry policy.

Version 1 is a JSON object. See `Recording` and `Call` in `backend/benchify/replay.py` for the validation contract.

| Field | Retained data |
|---|---|
| Identity and time | Recording UUID, schema version, workflow revision, capture and expiry timestamps, frozen workflow clock date, and explicit workflow input. |
| Benchmark context | Original run and attempt IDs, agent, name, revision and adapter, model mode and requested model, scenario, repetition, fixture byte SHA-256, normalized task snapshot and its SHA-256, dataset kind, rubric revision and original verdict. |
| Ordered calls | Indexed invocation and settlement positions, UTC timestamps, provider or fixture, operation and schema name, request SHA-256, search window, typed result or typed failure. |
| Evidence | Normalized search results as delivered to verification, including URL, excerpt, title, publication date, primary flag and retrieval timing. |
| Trace | Allowlisted physical attempt metadata, including timing, HTTP status, requested and returned identifiers when reported, request correlation, usage, injected failures, retry and cancellation. Fixture query text stays in the original benchmark trace. Replay matches the query through its fingerprint. |
| Outcome | Structured model output in ordered calls, effective per-claim verification decisions and cited URLs, terminal outcome, and fingerprints of the allowlisted trace and successful workflow output. The normal saved run also retains the original verification decisions. |

The provider records contain typed results and metadata at the workflow boundary. They do not contain authorization headers, provider request body, raw response body or Bifrost system/user messages. Search excerpts, input text, titles and model output remain sensitive and untrusted. Use capture only for workloads authorized for retention. A credential-pattern and configured-secret check rejects suspect recordings instead of partially changing them. These checks cannot identify all customer or personal data. Disable capture for sensitive inputs and do not commit or share recordings without review. The recording can be modified by anyone who holds the file, and hashes are compatibility checks without signatures or chain-of-custody guarantees.

Each recording is capped at 192 KiB and 32 logical calls. A Python run can have up to 15 captured attempts. Set `BENCHIFY_CAPTURE_RETENTION_DAYS` to 1–30 days, default 7. Capture lives inside the current attempt JSONB record and commits in the same checkpoint transaction. No schema change or migration is required. Normal run reads return capture metadata. Dedicated endpoints return the recording while it is unexpired. The worker sweeps up to 100 expired captures every five minutes and removes only the recording field. Physical deletion can lag while the worker is stopped or a sweep has backlog. Original runs, exports, browser memory, standalone downloads and backups have independent lifecycles. Standalone captures are returned inline and are not written to Neon. Expiry is enforced during import and replay for both sources. Configure deployment-level quotas, storage monitoring and backup expiry before broad access.

## Offline replay

Replay runs existing Python workflow logic with an in-memory provider whose only inputs are the recording. The recording fixes the workflow clock. The replay response exposes the effective evidence cutoff as as_of, using the earlier of the meeting date and the frozen clock for briefings. It consumes typed search and model results at their recorded invocation and settlement positions, including recorded provider errors and cancellation. The physical request trace preserves observed timing and failures without repeating sleeps or requests. Saved-run replay reruns the existing benchmark rubric with the recorded task snapshot and checks output and verdict equality. A mismatch, expired or missing recording, incompatible version, or changed call fingerprint stops replay. Replay never calls the HTTP agent, Bifrost, Tavily or any source URL.

An offline result has new replay identifiers and timestamps, replay execution time, provenance IDs, and historical timing and usage. Its original verification output and allowlisted trace should match. The live trace can contain fields omitted by the recording policy. No performance measurements are inferred from replay duration. Provider parsing and retries are represented by their recorded results and trace. The engine does not rerun the HTTP protocol, the model, or the remote agent. An identical replay does not establish how a changed model or agent would perform. The current compatibility contract covers matching workflow and rubric versions and request fingerprints.

## API and local workflow

| API | Use |
|---|---|
| POST /api/v1/runs | Enqueue with capture mode full and agents containing only python. Use preview for an inline run without Neon. |
| GET /api/v1/runs/{id}/attempts/{attempt_id}/recording | Fetch one unexpired saved recording. |
| POST /api/v1/runs/{id}/replay | Replay all captured attempts of a saved run in memory. The response is transient. |
| POST /api/v1/replay | Submit a single recording JSON object. Reproduce the workflow result and trace without provider access. |
| POST /api/v1/runs/{id}/compare | Send candidate_run_id for a saved run or replay set to true for an offline replay comparison. |
| POST /api/v1/briefings?capture_mode=full or POST /api/v1/verify?capture_mode=full | Run live, then receive a recording or a capture omission reason inline. |
| POST /api/v1/evidence/compare | Send baseline and candidate recording objects for two successful workflows. Replays both and reports per-claim evidence history. |

Start with a scripted capture to verify the integration without provider credentials. To capture live Northwind, use its revision from the catalog and change the model mode to live. The command below uses a running loopback API and the repository Python environment.

```powershell
$env:PYTHONPATH = "backend"
.venv\Scripts\python.exe -m benchify.benchmark_cli --capture --persist --model-mode scripted
$api = "http://127.0.0.1:8000/api/v1"
$run = "<saved-run-id>"
$attempt = "<captured-attempt-id>"
New-Item -ItemType Directory -Force .benchify | Out-Null
Invoke-WebRequest "$api/runs/$run/attempts/$attempt/recording" -OutFile .benchify/recording.json
.venv\Scripts\python.exe -m benchify.replay .benchify/recording.json
Invoke-RestMethod -Method Post "$api/runs/$run/compare" -ContentType application/json -Body '{"replay":true}'
```

The saved benchmark screen offers capture with only Python selected. Open a saved run to inspect or download the recording, replay and compare offline, select another completed run, or export the comparison report.

## Regression and historical evidence rules

Comparisons pair attempts by agent ID, scenario, and repetition. Reports include success denominators, missing pairs, field-level configuration changes, observed model/provider selection, prior and current measurements with deltas, error changes and claim evidence. Benchmark scoring is unchanged.

- Dataset revision, fixture hash and rubric must match for regression classifications. Live and scripted conditions are incompatible. Partial or unfinished runs and absent pairs are surfaced rather than treated as successful controls.
- Performance flags are per matched execution with measured latency. Candidate latency must increase by both 20% and 100 ms. Replay timing and usage are original observations. Token, cost and search-credit deltas use only values observed on both attempts. No significance test or aggregate score is implied.
- Reliability flags indicate a successful attempt beginning to fail, more recorded failures, or more recorded retries. Counts include deliberate fault events. Scenario matching separates their expected baseline from new failures.
- A factual regression requires a matched, previously supported claim becoming outdated or contradicted under the same verification methodology. A weaker or unverified result remains visible. Pairing normalizes whitespace and capitalization; rewritten claims can appear as added or absent.
- Evidence changes compare URL, publication date and quoted excerpt. Reports expose earlier and current claim status, evaluation date, verification timestamp and supporting sources. Older benchmark records without a completion timestamp use attempt start. A missing URL is absent from the recorded evidence, with availability unknown. Search disappearance cannot prove a source is offline. Evidence selected later still requires a verification judgment.
- Configuration differences are classified separately. The report identifies changes in methodology and suppresses factual regression labels when a recorded verification revision differs.

A live Northwind capture of an injected fixture 503 followed by a Bifrost timeout replayed the same failure and allowlisted trace with HTTP and sockets blocked. Its comparison had zero classifications because offline playback reproduced the failed attempt. Replay success is reported separately from task success.

A second live Northwind capture used the baseline scenario and passed 1/1. Both saved-run replay and standalone file replay reproduced the output and five recorded calls. The comparison reported no differences. The standalone process had no provider or database credentials.

The credentialed historical NASA briefing probe returned a provider error. Its recording replayed the same failure and consumed all nine calls with sockets blocked. The deterministic historical Tavily fixture covers positive verification and exclusion of future-dated evidence.

## Access and completeness

A complete v1 artifact is marked complete. Exceeding size or call limits yields a rejected capture, with no downloadable artifact. Normal saved-run reads show capture lifecycle status. Recording GET uses no-store and attachment headers. A shared operator token protects recording access in production. Use the authenticated recording DELETE endpoint to remove the retained recording while keeping the original attempt. See [security and deletion](SECURITY.md).
