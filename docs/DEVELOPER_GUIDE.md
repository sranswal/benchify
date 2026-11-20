# Benchify Developer Guide

This guide covers local development, architecture overview, testing practices, and how to integrate external autonomous agents with Benchify.

---

## Prerequisites & Local Setup

### Requirements
- **Python**: 3.11 or higher
- **Node.js**: 20.x or higher (npm 10+)
- **Git**

### 1. Clone & Configure
```bash
git clone https://github.com/sranswal/benchify.git
cd benchify
cp .env.example .env
```

Edit `.env` to configure your development settings:
```dotenv
BENCHIFY_ENV=development
BENCHIFY_ALLOW_LOCAL_AGENTS=1
BIFROST_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
BIFROST_MODEL=gemini-2.0-flash
BIFROST_VIRTUAL_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
BENCHIFY_API_URL=http://127.0.0.1:8000
DATABASE_URL=
```
*(Leaving `DATABASE_URL` empty automatically enables fast in-memory execution mode).*

### 2. Start the Backend API (FastAPI)
```bash
# Set up Python virtual environment
python -m venv .venv

# Activate on Windows:
.venv\Scripts\Activate.ps1
# Or on macOS/Linux:
# source .venv/bin/activate

# Install dependencies and start server
pip install -r backend/requirements.txt
python -m uvicorn --app-dir backend benchify.main:app --host 127.0.0.1 --port 8000 --reload
```
Check health: `http://127.0.0.1:8000/ready`

### 3. Start the Frontend (Next.js 14)
In a second terminal:
```bash
cd frontend
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```
Open `http://localhost:3000` in your browser.

---

## Core API Endpoints

The FastAPI backend exposes RESTful endpoints for discovering fixtures, enqueueing benchmarks, and querying telemetry:

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/ready` | Readiness probe (verifies database and worker connectivity) |
| `GET` | `/health` | Liveness probe |
| `GET` | `/api/v1/runs/catalog` | Lists available benchmark datasets, agents, and task revisions |
| `POST` | `/api/v1/runs/preview` | Runs a synchronous, inline benchmark evaluation |
| `POST` | `/api/v1/runs` | Enqueues an asynchronous, durable evaluation run (returns `HTTP 202`) |
| `GET` | `/api/v1/runs/{id}` | Retrieves execution state, attempt traces, and rubric scores |
| `POST` | `/api/v1/runs/{id}/rerun` | Triggers a re-execution of a completed or failed benchmark run |
| `GET` | `/api/v1/runs/{id}/recording` | Downloads the self-contained JSON offline replay bundle |

*(Interactive OpenAPI Swagger documentation is available at `http://127.0.0.1:8000/docs` in development mode).*

---

## Integrating Custom Agents (HTTP Adapter Contract)

Benchify can benchmark any external autonomous agent (built with LangChain, AutoGen, CrewAI, or custom code) through its **HTTP Adapter Protocol**.

### Reference Implementation
A working Node.js agent implementation is provided at `backend/http-agent.mjs`:
```bash
node --env-file=.env backend/http-agent.mjs
```

### Agent Registration
Register external agents by setting `BENCHIFY_HTTP_AGENTS` in your `.env`:
```json
BENCHIFY_HTTP_AGENTS=[{"id":"my-agent","name":"Production Research Agent","revision":"1.0.0","url":"http://127.0.0.1:8088/task"}]
```

### Protocol Specification
1. **Task Dispatch**: Benchify sends a `POST` request to your agent's endpoint with JSON payload:
   ```json
   {
     "meeting": "Northwind Cloud Strategic Review",
     "window": "2026-11-01 to 2026-11-30",
     "search_url": "http://127.0.0.1:8000/api/v1/fixtures/callbacks/xyz"
   }
   ```
2. **Tool Search Queries**: The agent makes `POST` requests to `search_url` containing the query string (1–400 characters).
3. **Chaos Fault Handling**: The callback may inject `HTTP 503` or `HTTP 429` responses based on the active scenario. The agent must handle retries and backoff.
4. **Structured Agent Response**: The agent returns its findings and execution metadata:
   ```json
   {
     "findings": [
       {
         "claim": "Northwind Cloud released Enterprise Gateway v2.4",
         "status": "supported",
         "evidence": "Primary excerpt from source..."
       }
     ],
     "questions": [
       "What is the migration timeline for existing customers?"
     ],
     "usage": {
       "input_tokens": 1250,
       "output_tokens": 340,
       "cost_usd": 0.0012
     }
   }
   ```

---

## Command Line Interface (CLI)

Benchify provides a headless CLI for CI/CD pipelines and automated regressions:

```bash
# Set PYTHONPATH to backend
$env:PYTHONPATH="backend"   # Windows PowerShell
# export PYTHONPATH="backend" # Linux/macOS

# Standard benchmark run (3 repetitions across scenarios)
python -m benchify.benchmark_cli --repetitions 3

# Deterministic scripted mode (Zero token cost, runs offline)
python -m benchify.benchmark_cli --repetitions 1 --model-mode scripted

# Persistent run saving checkpoints to PostgreSQL with trace capture
python -m benchify.benchmark_cli --repetitions 2 --persist --capture
```

---

## Automated Test Suite

Ensure system stability by running the complete test suite:

```bash
# 1. Run unit and contract tests (30 passing tests)
$env:PYTHONPATH="backend"
python -m unittest discover -s backend/tests -v

# 2. Run release smoke test (loopback API, worker restart recovery)
python backend/tests/smoke_release.py

# 3. Verify frontend production build and types
cd frontend
npm run build
```
