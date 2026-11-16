"""Run with python backend/tests/smoke_release.py using the repository's .env."""

import argparse
import json
import os
import socket
import subprocess
import sys
from contextlib import ExitStack
from time import monotonic, sleep
from uuid import UUID

import httpx
from dotenv import dotenv_values


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def stop(process):
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)


def wait_for_http(client, process, path):
    deadline = monotonic() + 15
    while monotonic() < deadline and process.poll() is None:
        try:
            if client.get(path).is_success:
                return
        except httpx.TransportError:
            pass
        sleep(0.25)
    raise RuntimeError(f"The server at {client.base_url} did not start.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Exercise the live Tavily and Bifrost workflows.")
    parser.add_argument("--restart", action="store_true", help="Restart the API after the first checkpoint.")
    parser.add_argument("--task", default="meeting-research-v1")
    parser.add_argument("--registered-agent", action="store_true", help="Use a registry entry for the Node agent.")
    parser.add_argument("--web", action="store_true", help="Check the production Next.js server and benchmark proxy.")
    args = parser.parse_args()
    environment = {**dotenv_values(".env"), **os.environ}
    if not environment.get("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is required for this smoke test.")
    api_port, agent_port = free_port(), free_port()
    origin = f"http://127.0.0.1:{api_port}"
    environment.update(
        BENCHIFY_ENV="development",
        BENCHIFY_ALLOW_LOCAL_AGENTS="1",
        BENCHIFY_OPERATOR_TOKEN="",
        BENCHIFY_FIXTURE_ORIGIN=origin,
        BENCHIFY_HTTP_AGENT_URL=f"http://127.0.0.1:{agent_port}/execute",
        BENCHIFY_HTTP_AGENT_PORT=str(agent_port),
    )
    agents = ["python", "http"]
    if args.registered_agent:
        agents[1] = "smoke-node"
        environment["BENCHIFY_HTTP_AGENTS"] = json.dumps({
            agents[1]: {
                "name": "Smoke test HTTP agent", "revision": "smoke-v1",
                "endpoint": environment["BENCHIFY_HTTP_AGENT_URL"],
            },
        })
    env = {key: value for key, value in environment.items() if value is not None}
    with ExitStack() as stack:
        agent = subprocess.Popen(["node", "backend/http-agent.mjs"], env=env)
        stack.callback(stop, agent)
        api_command = [
            sys.executable, "-m", "uvicorn", "--app-dir", "backend", "benchify.main:app",
            "--host", "127.0.0.1", "--port", str(api_port), "--no-access-log",
        ]
        api = subprocess.Popen(api_command, env=env)
        stack.callback(stop, api)
        client = stack.enter_context(httpx.Client(base_url=origin, timeout=25, trust_env=False))
        wait_for_http(client, api, "/health")
        catalog = client.get("/api/v1/runs/catalog").raise_for_status().json()
        task = next(item for item in catalog["tasks"] if item["revision"] == args.task)
        assert set(agents) <= {item["id"] for item in catalog["agents"]}
        if args.live:
            verify_live_workflows(client)
        response = client.post("/api/v1/runs", json={
            "repetitions": 1, "model_mode": "live" if args.live else "scripted",
            "scenarios": ["baseline", "first_search_503", "first_search_429"],
            "fixture_revision": task["revision"],
            "agents": agents,
        })
        assert response.status_code == 202, (response.status_code, response.text[:600])
        queued = response.json()
        assert queued["status"] == "queued" and not queued["attempts"]
        run_id = UUID(queued["id"])
        saved_ids = []
        restarted = False
        deadline = monotonic() + (300 if args.restart or args.live else 75)
        while monotonic() < deadline:
            run = client.get(f"/api/v1/runs/{run_id}").raise_for_status().json()
            if run["status"] in ("completed", "failed"):
                break
            if args.restart and not restarted and run["attempts"]:
                saved_ids = [attempt["id"] for attempt in run["attempts"]]
                stop(api)
                api = subprocess.Popen(api_command, env=env)
                stack.callback(stop, api)
                wait_for_http(client, api, "/health")
                restarted = True
            sleep(1)
        else:
            raise RuntimeError(f"Run {run_id} did not finish.")
        assert run["status"] == "completed", run.get("error")
        assert run["fixture_sha256"] == task["sha256"]
        assert run["meeting"]["subject"] == task["subject"]
        assert run["completed_attempts"] == len(run["attempts"]) == 6
        assert {attempt["agent"] for attempt in run["attempts"]} == set(agents)
        if args.restart:
            assert restarted, "The run finished before the restart was exercised."
            assert [attempt["id"] for attempt in run["attempts"][:len(saved_ids)]] == saved_ids
        for attempt in run["attempts"]:
            assert attempt["success"], (attempt["agent"], attempt["scenario"], attempt["error"])
            assert attempt["events"]
            if attempt["scenario"] != "baseline":
                fault_status = int(attempt["scenario"].rsplit("_", 1)[1])
                assert attempt["recovered"] and any(
                    event.get("injected") and event["status_code"] == fault_status for event in attempt["events"]
                )
        history = client.get("/api/v1/runs").raise_for_status().json()
        assert any(item["id"] == queued["id"] and item["status"] == "completed" for item in history)
        print(f"Verified queued run {run_id}: six passing attempts and persisted traces.")
        if args.web:
            web_port = free_port()
            web = subprocess.Popen([
                "node", "frontend/node_modules/next/dist/bin/next", "start", "frontend",
                "--hostname", "127.0.0.1", "--port", str(web_port),
            ], env={**env, "BENCHIFY_API_URL": origin})
            stack.callback(stop, web)
            browser = stack.enter_context(httpx.Client(base_url=f"http://127.0.0.1:{web_port}", timeout=25))
            wait_for_http(browser, web, "/")
            assert browser.get("/api/runs/catalog").raise_for_status().json() == catalog
            assert browser.get(f"/api/runs/{run_id}").raise_for_status().json() == run
            print("Verified the production frontend and benchmark API proxy.")
        if not args.live:
            verify_rerun(client, run)


def verify_rerun(client, original):
    response = client.post(f"/api/v1/runs/{original['id']}/rerun")
    assert response.status_code == 202, (response.status_code, response.text[:600])
    repeated = response.json()
    assert repeated["repeated_from"] == original["id"] and repeated["id"] != original["id"]
    for key in ("fixture_sha256", "agent_revisions", "rubric_revision", "scenarios", "model_mode"):
        assert repeated[key] == original[key]
    deadline = monotonic() + 75
    while monotonic() < deadline:
        repeated = client.get(f"/api/v1/runs/{repeated['id']}").raise_for_status().json()
        if repeated["status"] in ("completed", "failed"):
            assert repeated["status"] == "completed"
            assert len(repeated["attempts"]) == len(original["attempts"])
            assert all(attempt["success"] for attempt in repeated["attempts"])
            print(f"Verified repeat run {repeated['id']} from the saved configuration.")
            return
        sleep(1)
    raise RuntimeError(f"Repeat run {repeated['id']} did not finish.")


def verify_live_workflows(client):
    response = client.post("/api/v1/verify", timeout=95, json={
        "text": "NASA launched the Artemis I mission on November 16, 2022.",
    })
    result = response.json()
    assert response.is_success, (response.status_code, result.get("detail"))
    assert result["mode"] == "live" and result["verification"]
    assert {"Bifrost", "Tavily"} <= {event["service"] for event in result["events"]}
    print("Live claim verification returned a provider trace.")
    response = client.post("/api/v1/briefings", timeout=95, json={
        "subject": "NASA Artemis I",
        "purpose": "Review the mission launch and early flight milestones.",
        "meeting_at": "2022-12-01T16:00:00Z",
    })
    result = response.json()
    assert response.is_success, (response.status_code, result.get("detail"))
    assert result["mode"] == "live" and result["window"] == ["2022-11-01", "2022-12-01"]
    assert any(event["service"] == "Tavily" for event in result["events"])
    findings = result["findings"]
    assert findings, ([item["status"] for item in result["verification"]], result.get("note"))
    assert all(item["status"] == "supported" and item["evidence"] for item in findings)
    print(f"Live briefing returned {len(findings)} verified findings.")


if __name__ == "__main__":
    main()
