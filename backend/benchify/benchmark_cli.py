import argparse
import json
import os
from time import monotonic, sleep

import httpx
from dotenv import load_dotenv


if __name__ == "__main__":
    load_dotenv()
    parser = argparse.ArgumentParser(description="Run a meeting-research benchmark.")
    parser.add_argument("--repetitions", type=int, choices=range(1, 6), default=1)
    parser.add_argument("--persist", action="store_true", help="Save the run to Neon.")
    parser.add_argument("--model-mode", choices=("live", "scripted"))
    parser.add_argument("--capture", action="store_true", help="Capture provider outcomes for a Python-only run.")
    parser.add_argument("--task", help="Task revision from /api/v1/runs/catalog.")
    args = parser.parse_args()
    base = os.getenv("BENCHIFY_API_URL", "http://127.0.0.1:8000").rstrip("/")
    path = "/api/v1/runs" if args.persist else "/api/v1/runs/preview"
    payload = {"repetitions": args.repetitions, "model_mode": args.model_mode}
    if args.capture:
        payload.update(agents=["python"], capture_mode="full")
    if args.task:
        payload["fixture_revision"] = args.task
    token = os.getenv("BENCHIFY_OPERATOR_TOKEN")
    headers = {"Authorization": "Bearer " + token} if token else {}
    with httpx.Client(headers=headers, follow_redirects=False) as client:
        response = client.post(base + path, json=payload,
                               timeout=30 if args.persist else 3600)
        result = response.json()
        if not response.is_success:
            parser.exit(1, str(result.get("detail", "Benchmark request failed.")) + "\n")
        if args.persist:
            run_url = base + path + "/" + result["id"]
            deadline = monotonic() + 3600
            while result["status"] in ("queued", "running"):
                if monotonic() >= deadline:
                    parser.exit(1, f"Timed out waiting. Run status is available at {run_url}\n")
                sleep(2)
                response = client.get(run_url, timeout=30)
                if not response.is_success:
                    parser.exit(1, f"Could not read run status at {run_url}\n")
                result = response.json()
    print(json.dumps(result, indent=2))
    if result.get("status") == "failed" or any(not attempt["success"] for attempt in result["attempts"]):
        parser.exit(1)
