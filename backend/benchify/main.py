import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager, suppress
from uuid import UUID, uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, model_validator

from . import run_store
from .agent_registry import registry
from .operator_access import operator_token, protect_operator
from .benchmark import (
    ACTIVE_SEARCHES, DEFAULT_AGENTS, RUBRIC_REVISION, SCENARIOS, RunRequest, fixtures, new_run, run_benchmark,
)
from .providers import ProviderError, Providers
from .regression import compare_claims, compare_runs, model_provenance, replay_run
from .replay import (
    MAX_RECORDING_BYTES, CaptureMode, CaptureProviders, ReplayError, replay_recording, workflow_date,
)
from .workflows import Answer, Meeting, briefing, verify_answer
from .worker import work

load_dotenv()


@asynccontextmanager
async def lifespan(app):
    operator_token()
    registry()
    fixtures()
    stop = asyncio.Event()
    app.state.worker_ready = asyncio.Event()
    worker = asyncio.create_task(work(stop, app.state.worker_ready)) if os.getenv("DATABASE_URL") else None
    app.state.worker = worker
    try:
        yield
    finally:
        if worker:
            stop.set()
            try:
                await asyncio.wait_for(asyncio.shield(worker), timeout=20)
            except TimeoutError:
                worker.cancel()
                with suppress(asyncio.CancelledError):
                    await worker


production = os.getenv("BENCHIFY_ENV") == "production"
app = FastAPI(
    title="Benchify", version="0.1.0", lifespan=lifespan, debug=False,
    docs_url=None if production else "/docs",
    redoc_url=None if production else "/redoc",
    openapi_url=None if production else "/openapi.json",
)
app.middleware("http")(protect_operator)
logger = logging.getLogger(__name__)
capacity = asyncio.Semaphore(4)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready(request: Request):
    task = getattr(request.app.state, "worker", None)
    database_required = bool(os.getenv("DATABASE_URL")) or os.getenv("BENCHIFY_ENV") == "production"
    if database_required and (not task or task.done() or not request.app.state.worker_ready.is_set()):
        return JSONResponse({"status": "not_ready"}, status_code=503, headers={"Cache-Control": "no-store"})
    return JSONResponse({"status": "ready"}, headers={"Cache-Control": "no-store"})


async def execute(workflow, payload, capture_mode: CaptureMode = "off"):
    workflow_id = str(uuid4())
    if capacity.locked():
        raise HTTPException(429, "Benchify is busy. Try again in a moment.")
    failure = None
    capture = None
    as_of = workflow_date(payload)
    try:
        async with capacity, asyncio.timeout(90), httpx.AsyncClient(timeout=25, trust_env=False) as client:
            providers = Providers(client, workflow_id)
            if capture_mode == "full":
                capture = CaptureProviders(providers, search_source="Tavily", model_source="Bifrost")
            result = await workflow(payload, capture or providers, today=as_of)
    except* ProviderError as errors:
        logger.warning("Provider failure for workflow %s", workflow_id)
        error = errors
        while isinstance(error, BaseExceptionGroup):
            error = error.exceptions[0]
        failure = (502, str(error))
    except* TimeoutError:
        failure = (504, "The research workflow timed out.")
    capture_fields = {}
    if capture is not None:
        capture_fields = capture.finish(
            payload, as_of, None if failure else result, providers.events,
            terminal="deadline" if failure and failure[0] == 504 else "provider_error" if failure else "success",
            error=failure[1] if failure else None, capture_id=workflow_id,
        )
    if failure:
        status, detail = failure
        return JSONResponse(status_code=status, content={
            "detail": detail, "workflow_id": workflow_id, "events": providers.events, **capture_fields,
        }, headers={"X-Request-ID": workflow_id})
    return {"workflow_id": workflow_id, "mode": "live", "events": providers.events, **result, **capture_fields}


@app.post("/api/v1/briefings")
async def create_briefing(meeting: Meeting, capture_mode: CaptureMode = "off"):
    return await execute(briefing, meeting, capture_mode)


@app.post("/api/v1/verify")
async def verify(answer: Answer, capture_mode: CaptureMode = "off"):
    return await execute(verify_answer, answer, capture_mode)


async def read_recording_body(request, max_bytes):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_bytes:
            raise HTTPException(413, "Recording exceeds the size limit.")
        body.extend(chunk)
    try:
        result = json.loads(body)
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise HTTPException(422, "Expected a JSON recording.") from exc
    if not isinstance(result, dict):
        raise HTTPException(422, "Expected a JSON recording object.")
    return result


@app.post("/api/v1/replay")
async def replay_uploaded_recording(request: Request):
    recording = await read_recording_body(request, MAX_RECORDING_BYTES)
    try:
        return await replay_recording(recording)
    except ReplayError as exc:
        raise HTTPException(409, str(exc)) from exc


@app.post("/api/v1/evidence/compare")
async def compare_historical_evidence(request: Request):
    pair = await read_recording_body(request, 2 * MAX_RECORDING_BYTES + 64)
    try:
        before = await replay_recording(pair.get("baseline"))
        after = await replay_recording(pair.get("candidate"))
    except ReplayError as exc:
        raise HTTPException(409, str(exc)) from exc
    if any(result["outcome"] != "success" for result in (before, after)):
        raise HTTPException(409, "Both recorded workflows must have completed verification.")
    if before["workflow"] != after["workflow"] or before["workflow_revision"] != after["workflow_revision"]:
        raise HTTPException(409, "Recorded verification methods are incompatible.")
    before_models, after_models = model_provenance(before), model_provenance(after)
    claims = compare_claims(
        {"started_at": before["captured_at"], "output": before["output"]},
        {"started_at": after["captured_at"], "output": after["output"]},
        methodology_changed=before_models != after_models,
    )
    return {
        "version": 1, "baseline_recording_id": before["recording_id"], "candidate_recording_id": after["recording_id"],
        "claims": claims, "source_availability_checked": False,
        "methodology": {"previous": before_models, "current": after_models},
    }



@app.post("/api/v1/fixture/{attempt_id}/search")
async def fixture_search(attempt_id: UUID, request: Request):
    fixture = ACTIVE_SEARCHES.get(str(attempt_id))
    if fixture is None:
        raise HTTPException(404, "Fixture attempt is unavailable.")
    if fixture.searches >= 16:
        raise HTTPException(429, "Fixture callback search limit reached.")
    payload = await read_recording_body(request, 2048)
    if ACTIVE_SEARCHES.get(str(attempt_id)) is not fixture:
        raise HTTPException(404, "Fixture attempt is unavailable.")
    query = payload.get("query")
    if not isinstance(query, str) or not 0 < len(query) <= 400:
        raise HTTPException(422, "Provide a search query.")
    if fixture.searches >= 16:
        raise HTTPException(429, "Fixture callback search limit reached.")
    try:
        return {"sources": fixture.search(query)}
    except ProviderError as exc:
        raise HTTPException(fixture.fault_status or 503, str(exc)) from exc


@app.post("/api/v1/runs/preview")
async def preview_run(request: RunRequest):
    if capacity.locked():
        raise HTTPException(429, "Benchify is busy. Try again in a moment.")
    async with capacity:
        return await run_benchmark(request)


@app.post("/api/v1/runs", status_code=202)
async def create_run(request: RunRequest):
    return await asyncio.to_thread(run_store.enqueue, new_run(request))


@app.get("/api/v1/runs")
def list_runs():
    return run_store.history()


@app.get("/api/v1/runs/catalog")
def benchmark_catalog():
    return {
        "tasks": [
            {"revision": revision, "sha256": digest, "subject": task["meeting"]["subject"], "kind": task["kind"]}
            for revision, (task, digest) in fixtures().items()
        ],
        "agents": [
            {"id": key, "name": agent.name, "revision": agent.revision}
            for key, agent in registry().items()
        ],
    }


@app.get("/api/v1/runs/{run_id}")
def get_run(run_id: UUID):
    return run_store.get(run_id)


@app.post("/api/v1/runs/{run_id}/rerun", status_code=202)
async def rerun(run_id: UUID):
    source = await asyncio.to_thread(run_store.get, run_id)
    if source.get("status") in {"queued", "running"}:
        raise HTTPException(409, "Wait for this run to finish before repeating it.")
    revisions = {key: agent.revision for key, agent in registry().items()}
    fixture = fixtures().get(source["fixture_revision"])
    if (fixture is None or fixture[1] != source["fixture_sha256"]
            or source["rubric_revision"] not in {"meeting-v1", RUBRIC_REVISION}
            or any(revisions.get(key) != value for key, value in source["agent_revisions"].items())
            or (source.get("model_name") and source["model_name"] != os.getenv("BIFROST_MODEL"))):
        raise HTTPException(409, "One or more revisions from this run are unavailable.")
    request = RunRequest(
        repetitions=source["repetitions"], fixture_revision=source["fixture_revision"],
        capture_mode=source.get("capture_mode", "off"),
        model_mode=source["model_mode"], agents=source.get("agents", list(DEFAULT_AGENTS)),
        scenarios=source.get("scenarios", list(SCENARIOS[:2])),
    )
    run = new_run(request)
    run["rubric_revision"] = source["rubric_revision"]
    run["repeated_from"] = str(run_id)
    return await asyncio.to_thread(run_store.enqueue, run)



@app.get("/api/v1/runs/{run_id}/attempts/{attempt_id}/recording")
def get_attempt_recording(run_id: UUID, attempt_id: UUID):
    recording = run_store.get_recording(run_id, attempt_id)
    return JSONResponse(recording, headers={
        "Content-Disposition": f'attachment; filename="benchify-recording-{attempt_id}.json"',
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "sandbox",
    })


@app.delete("/api/v1/runs/{run_id}/attempts/{attempt_id}/recording", status_code=204)
def delete_attempt_recording(run_id: UUID, attempt_id: UUID):
    run_store.delete_recording(run_id, attempt_id)
    return Response(status_code=204)


@app.post("/api/v1/runs/{run_id}/replay")
async def replay_saved_run(run_id: UUID):
    source = await asyncio.to_thread(run_store.get, run_id, include_recordings=True)
    try:
        return await replay_run(source)
    except ReplayError as exc:
        raise HTTPException(409, str(exc)) from exc


class CompareRequest(BaseModel):
    candidate_run_id: UUID | None = None
    replay: bool = False

    @model_validator(mode="after")
    def candidate_required(self):
        if self.replay == (self.candidate_run_id is not None):
            raise ValueError("Specify a candidate run ID or compare with offline replay.")
        return self


@app.post("/api/v1/runs/{run_id}/compare")
async def compare_saved_runs(run_id: UUID, request: CompareRequest):
    if request.replay:
        baseline = await asyncio.to_thread(run_store.get, run_id, include_recordings=True)
        try:
            candidate = await replay_run(baseline)
        except ReplayError as exc:
            raise HTTPException(409, str(exc)) from exc
    else:
        baseline, candidate = await asyncio.gather(
            asyncio.to_thread(run_store.get, run_id),
            asyncio.to_thread(run_store.get, request.candidate_run_id),
        )
    return compare_runs(baseline, candidate)
