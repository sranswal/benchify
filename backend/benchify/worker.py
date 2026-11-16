import asyncio
import logging
import os
from contextlib import suppress
from time import monotonic

import httpx
from fastapi import HTTPException

from . import run_store
from .agent_registry import registry
from .benchmark import RUBRIC_REVISION, attempt, attempt_plan, fixtures

logger = logging.getLogger(__name__)


async def pause(stop, seconds):
    with suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


async def work(stop, ready):
    initialized = False
    next_purge = 0.0
    async with httpx.AsyncClient(timeout=40, trust_env=False) as client:
        while not stop.is_set():
            try:
                if not initialized:
                    await asyncio.to_thread(run_store.prepare)
                    initialized = True
                if monotonic() >= next_purge:
                    next_purge = monotonic() + 300
                    try:
                        await asyncio.to_thread(run_store.purge_expired_recordings)
                    except HTTPException:
                        logger.warning("Benchmark recording cleanup failed; retrying on the next sweep.")
                if stop.is_set():
                    break
                job = await asyncio.to_thread(run_store.claim)
                ready.set()
                if job is None:
                    await pause(stop, 2)
                    continue
                if stop.is_set():
                    run_id, position, _, token = job
                    await asyncio.to_thread(run_store.checkpoint, run_id, position, token)
                    break
                await execute_job(client, job)
            except HTTPException:
                ready.clear()
                logger.warning("Benchmark worker could not access storage. Retrying.")
                initialized = False
                await pause(stop, 10)


async def execute_job(client, job):
    run_id, position, run, token = job
    plan = attempt_plan(run)
    fixture = fixtures().get(run["fixture_revision"])
    revisions = {key: agent.revision for key, agent in registry().items()}
    if (fixture is None or run["fixture_sha256"] != fixture[1]
            or run["rubric_revision"] not in {"meeting-v1", RUBRIC_REVISION}
            or any(revisions.get(agent) != revision for agent, revision in run["agent_revisions"].items())):
        await asyncio.to_thread(run_store.checkpoint, run_id, position, token,
                                error="The queued benchmark revision is unavailable.")
        return
    if run.get("model_name") and run["model_name"] != os.getenv("BIFROST_MODEL"):
        await asyncio.to_thread(run_store.checkpoint, run_id, position, token,
                                error="The queued Bifrost model differs from the configured model.")
        return
    try:
        agent, scenario, repetition = plan[position]
        result = await attempt(client, agent, scenario, repetition, run)
    except Exception:
        logger.exception("Unexpected failure executing benchmark run %s at attempt %s", run_id, position)
        await asyncio.to_thread(run_store.checkpoint, run_id, position, token,
                                error="An internal error interrupted execution.")
        return
    committed = await asyncio.to_thread(
        run_store.checkpoint, run_id, position, token, result=result, finished=position + 1 == len(plan),
    )
    if not committed:
        logger.warning("Discarded stale benchmark result run_id=%s position=%s", run_id, position)
