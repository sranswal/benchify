# Benchify

Don't just deploy AI agents. Prove they work.

Benchify's first slice is a local developer application for evidence-backed meeting research and standalone claim verification. Tavily finds evidence, Bifrost handles structured model calls, and Benchify validates evidence references before rendering a result.

## Local setup

Install Python 3.11+ and Node.js 20.9+. Start a Bifrost gateway with a provider and a model that supports JSON-mode Chat Completions. Copy .env.example to .env. Set BIFROST_MODEL to your configured model, BIFROST_VIRTUAL_KEY if required, and TAVILY_API_KEY. Keep the API and web UI on loopback for this local slice.

From the workspace root in PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.venv\Scripts\python.exe -m uvicorn --app-dir backend benchify.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. Use Meeting Intelligence to research a subject before a meeting. Open claim verification and provider activity to inspect the evidence and executed calls. Freshness Lab takes pasted text and evaluates up to four atomic claims. Review provider logs using the workflow correlation identifier. Browser print produces a clean briefing view.

## Verification and milestones

Run the mocked provider contract and workflow tests from the repository root:

```powershell
$env:PYTHONPATH = "backend"
.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
npm.cmd --prefix frontend run build
```

For the credentialed smoke, generate a briefing for a company with recent announcements and paste a dated claim about that same company into Freshness Lab. Check each quoted excerpt against its source, and compare provider activity against Bifrost logs. No sample response is served as live evidence.

## Meeting research benchmark

Set `DATABASE_URL` in the root `.env` to a TLS-enabled Neon PostgreSQL connection string. The database role needs permission to create tables in its default schema. Start FastAPI with one process as shown above, then start the independent Node agent in another terminal.

```powershell
node --env-file=.env backend/http-agent.mjs
```

Open **Benchmarks** in the UI, choose one to five repetitions, and run the benchmark. Each repetition runs both agents against the same versioned Orchard Systems fixture once at baseline and once with a 503 on the first search. The result and its trace are saved together and can be reopened from **Saved runs**. The fixture callbacks are scoped to an active attempt in the local API process.

The CLI can run the same benchmark against the running API. Add `--persist` to save the run to Neon. Without that flag, the API returns the run and trace without requiring a database.

```powershell
$env:PYTHONPATH = "backend"
.venv\Scripts\python.exe -m benchify.benchmark_cli --repetitions 3
```

By default, Python uses scripted model responses through the regular briefing workflow. The independent Node service uses its own rules to extract the dated finding from the primary fixture excerpt. Set `BENCHIFY_BENCHMARK_MODEL=live` to run the Python model steps through Bifrost with the same search fixture. That mode can incur provider charges.

The rubric requires the canonical finding text and event date, an exact primary-source excerpt, and a meeting question. Latency covers the full attempt, including the HTTP round trip for the Node agent. Tool calls count fixture search requests, including the failed call. Model calls appear separately in the trace. Usage totals sum values supplied by agents and providers. Scripted and rule-based calls use zero model tokens. Missing telemetry is recorded as null. USD cost is populated when a provider response includes numeric `usage.cost_usd`. Bifrost request IDs, when present, can be used to inspect gateway logs.

For live briefings, set `BENCHIFY_PRIMARY_DOMAINS` to a comma-separated list of trusted official source hostnames. Benchify gives matching sources priority. A supported development needs an exact excerpt with the event date and an excerpt-only model check that the text entails both the claim and the date.

See the [architecture and milestone checklist](docs/architecture.md) and [reuse review](docs/reuse-review.md).

