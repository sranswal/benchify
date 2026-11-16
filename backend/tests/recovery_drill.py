"""Run real queue and restore tests in a disposable Docker Postgres container."""
import argparse
import asyncio
import os
import secrets
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import monotonic, sleep
from uuid import UUID, uuid4
from unittest.mock import patch

import httpx

from benchify import run_store
from benchify.benchmark import RunRequest, new_run
from benchify.worker import execute_job, work
from benchify.benchmark import attempt


def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, capture_output=True, text=True)


def wait_database(container):
    deadline = monotonic() + 35
    while monotonic() < deadline:
        if docker("exec", container, "pg_isready", "-h", "127.0.0.1", check=False).returncode == 0:
            return
        sleep(0.5)
    raise RuntimeError("Disposable PostgreSQL did not become ready.")


async def finish(claim):
    async with httpx.AsyncClient(trust_env=False) as client:
        await execute_job(client, claim)


def claim_simultaneously():
    barrier = Barrier(2)

    def compete():
        barrier.wait(timeout=10)
        return run_store.claim()

    with ThreadPoolExecutor(max_workers=2) as threads:
        futures = [threads.submit(compete) for _ in range(2)]
        return [lease for future in futures if (lease := future.result()) is not None]


def drill(container, dsn):
    # These URLs always use the disposable container's dynamically assigned loopback port.
    os.environ["DATABASE_URL"] = dsn + "/benchify"
    run = new_run(RunRequest(agents=["python"], scenarios=["baseline", "first_search_503"],
                             model_mode="scripted", capture_mode="full"))
    run_id = UUID(run_store.enqueue(run)["id"])
    asyncio.run(finish(run_store.claim()))
    before_crash = run_store.get(run_id)
    assert before_crash["completed_attempts"] == 1
    stale = run_store.claim()
    assert stale[1] == 1
    assert run_store.claim() is None
    with run_store.connect() as connection:
        connection.execute(
            "UPDATE benchify_jobs SET lease_until = now() - interval '1 second' WHERE run_id = %s", (run_id,)
        )
    assert run_store.checkpoint(run_id, stale[1], stale[3], finished=True) is False
    [winner] = claim_simultaneously()
    assert winner[0:2] == stale[0:2] and winner[3] != stale[3]
    assert run_store.checkpoint(run_id, stale[1], stale[3], finished=True) is False
    asyncio.run(finish(winner))
    complete = run_store.get(run_id, include_recordings=True)
    assert complete["status"] == "completed" and complete["completed_attempts"] == 2
    assert complete["attempts"][0]["id"] == before_crash["attempts"][0]["id"]
    assert complete["attempts"][0]["events"] == before_crash["attempts"][0]["events"]
    assert complete["attempts"][1]["recovered"]
    assert all(attempt["success"] and attempt["recording"]["complete"] for attempt in complete["attempts"])
    print("Two concurrent claimants produced one winner; expired/stale writes were rejected.", flush=True)

    with run_store.connect() as connection:
        connection.execute("""
            UPDATE benchify_attempts SET record = jsonb_set(
                record, '{recording,expires_at}', '"2000-01-01T00:00:00Z"'::jsonb
            ) WHERE run_id = %s AND position = 1
        """, (run_id,))
    run_store.purge_expired_recordings()
    snapshot = run_store.get(run_id, include_recordings=True)
    assert snapshot["attempts"][1]["capture_status"] == "expired"
    assert "recording" not in snapshot["attempts"][1]
    pending = run_store.enqueue(new_run(RunRequest(agents=["python"], scenarios=["baseline"], model_mode="scripted")))

    docker("exec", container, "pg_dump", "-U", "postgres", "-Fc", "-f", "/tmp/benchify.dump", "benchify")
    docker("exec", container, "createdb", "-U", "postgres", "benchify_restore")
    docker("exec", container, "pg_restore", "-U", "postgres", "--exit-on-error",
           "-d", "benchify_restore", "/tmp/benchify.dump")
    os.environ["DATABASE_URL"] = dsn + "/benchify_restore"
    assert run_store.get(run_id, include_recordings=True) == snapshot
    restored = run_store.claim()
    assert str(restored[0]) == pending["id"]
    asyncio.run(finish(restored))
    assert run_store.get(UUID(pending["id"]))["status"] == "completed"
    assert run_store.claim() is None
    print("PostgreSQL dump and restore preserved attempts, traces, retention and a runnable queued job.", flush=True)


async def drain_drill():
    run = run_store.enqueue(new_run(RunRequest(
        agents=["python"], scenarios=["baseline", "first_search_429"], model_mode="scripted",
    )))
    started, release, stop, ready = (asyncio.Event() for _ in range(4))

    async def paused_attempt(*args):
        started.set()
        await release.wait()
        return await attempt(*args)

    with patch("benchify.worker.attempt", new=paused_attempt):
        worker = asyncio.create_task(work(stop, ready))
        try:
            await asyncio.wait_for(started.wait(), 10)
            assert ready.is_set()
            stop.set()
            release.set()
            await asyncio.wait_for(worker, 10)
        finally:
            if not worker.done():
                worker.cancel()

    run_id = UUID(run["id"])
    partial = run_store.get(run_id)
    assert partial["completed_attempts"] == 1
    remaining = run_store.claim()
    assert remaining[:2] == (run_id, 1)
    await finish(remaining)
    assert run_store.get(run_id)["status"] == "completed"
    print("Worker drained one active attempt, stopped claiming, and resumed at the next checkpoint.", flush=True)


def container_smoke(database, password, image):
    token = secrets.token_urlsafe(36)
    container = docker(
        "run", "-d", "--network", "container:" + database,
        "-e", "BENCHIFY_OPERATOR_TOKEN=" + token,
        "-e", "DATABASE_URL=postgresql://postgres:" + password + "@127.0.0.1:5432/benchify_restore",
        image,
    ).stdout.strip()
    try:
        docker("exec", container, "python", "-c", """
import httpx, os, time
url = "http://127.0.0.1:8000"
with httpx.Client(base_url=url, trust_env=False) as client:
    for _ in range(60):
        try:
            if client.get("/ready").status_code == 200:
                break
        except httpx.TransportError:
            pass
        time.sleep(.25)
    else:
        raise AssertionError("Container readiness did not pass.")
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/runs/catalog").status_code == 401
    auth = {"Authorization": "Bearer " + os.environ["BENCHIFY_OPERATOR_TOKEN"]}
    assert client.get("/api/v1/runs/catalog", headers=auth).status_code == 200
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path, headers=auth).status_code == 404
    record = "/api/v1/runs/00000000-0000-0000-0000-000000000000/attempts/00000000-0000-0000-0000-000000000000/recording"
    assert client.get(record).status_code == 401
""")
        docker("stop", "--time", "55", container)
        assert docker("inspect", "--format", "{{.State.ExitCode}}", container).stdout.strip() in {"0", "143"}
        logs = docker("logs", container)
        assert "Application shutdown complete." in logs.stdout + logs.stderr
        print("Production container passed health, readiness, authentication, debug-route removal and SIGTERM shutdown.",
              flush=True)
    finally:
        docker("rm", "-f", container, check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", action="store_true", help="Also run the API restart and Next.js proxy smoke.")
    parser.add_argument("--image", help="Smoke test a locally built production API image.")
    parser.add_argument("--browser", action="store_true", help="Run local Chrome against the restored database.")
    args = parser.parse_args()
    password = secrets.token_hex(20)
    name = "benchify-recovery-" + uuid4().hex[:12]
    container = docker("run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::5432",
                       "-e", "POSTGRES_DB=benchify", "-e", "POSTGRES_PASSWORD=" + password,
                       "postgres:16-alpine").stdout.strip()
    try:
        wait_database(container)
        port = int(docker("port", container, "5432/tcp").stdout.strip().rsplit(":", 1)[1])
        dsn = f"postgresql://postgres:{password}@127.0.0.1:{port}"
        drill(container, dsn)
        asyncio.run(drain_drill())
        if args.image:
            container_smoke(container, password, args.image)
        if args.release:
            env = {**os.environ, "DATABASE_URL": dsn + "/benchify_restore"}
            subprocess.run([sys.executable, "backend/tests/smoke_release.py", "--restart",
                            "--registered-agent", "--web"], env=env, check=True)
        if args.browser:
            env = {**os.environ, "DATABASE_URL": dsn + "/benchify_restore"}
            subprocess.run(["node", "frontend/tests/browser_acceptance.mjs"], env=env, check=True)
    finally:
        docker("rm", "-f", container, check=False)


if __name__ == "__main__":
    main()
