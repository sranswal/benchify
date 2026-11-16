"""Paired comparison and replay for saved benchmark runs."""
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError

from .benchmark import RUBRIC_REVISION, TaskFixture, score
from .replay import ReplayError, fingerprint, recorded_trace, replay_recording

METRICS = ("latency_ms", "input_tokens", "output_tokens", "cost_usd", "search_credits")
CONFIG = ("fixture_revision", "fixture_sha256", "dataset_kind", "rubric_revision", "model_mode", "model_name",
          "agent_revisions", "agents", "scenarios", "repetitions", "verification_revision")
CONDITIONS = ("fixture_revision", "fixture_sha256", "rubric_revision")
RULES = {
    "latency": "Candidate must exceed baseline by both 20% and 100 ms.",
    "reliability": "More failed or retried requests, or a previously successful attempt failing.",
    "factual": "A supported claim becomes outdated or contradicted under the same evaluation rules.",
    "evidence": "Source URL, publication date or exact quoted excerpt changed.",
    "replay": "Replay telemetry is historical and excluded from performance scoring.",
}


async def replay_run(run):
    if run.get("status") in {"queued", "running"} or not run.get("attempts"):
        raise ReplayError("Wait for the original run to finish with captured attempts.")
    if run.get("agents") != ["python"] or run["rubric_revision"] not in {"meeting-v1", RUBRIC_REVISION}:
        raise ReplayError("Run adapter or rubric is incompatible with replay.")
    attempts = []
    for original in run["attempts"]:
        recording = original.get("recording")
        if not recording:
            raise ReplayError("An attempt recording is missing, omitted or expired.")
        context = recording.get("benchmark") or {}
        expected = {
            "run_id": run["id"], "attempt_id": original["id"], "agent": original["agent"],
            "scenario": original["scenario"], "repetition": original["repetition"],
            "fixture_revision": run["fixture_revision"], "fixture_sha256": run["fixture_sha256"],
            "rubric_revision": run["rubric_revision"], "model_mode": run["model_mode"],
            "model_name": run.get("model_name"), "expected_success": original["success"],
        }
        if any(context.get(key) != value for key, value in expected.items()):
            raise ReplayError("Recording does not match the original run and attempt.")
        try:
            task = TaskFixture.model_validate(context.get("task")).model_dump(mode="json")
        except ValidationError as exc:
            raise ReplayError("Recorded task fixture is incompatible.") from exc
        if (task["revision"] != run["fixture_revision"] or task["meeting"] != recording["input"]
                or fingerprint(task) != context.get("task_sha256")):
            raise ReplayError("Recorded task or meeting does not match.")
        if recorded_trace(original["events"]) != recording.get("trace"):
            raise ReplayError("Recording does not match the original attempt trace.")
        replay = await replay_recording(recording)
        output = replay["output"] or {}
        searches = [event for event in replay["events"] if event.get("operation") == "search"]
        injected = any(event.get("injected") for event in searches)
        success = (
            replay["outcome"] == "success" and any(event["status"] == "ok" for event in searches)
            and (original["scenario"] == "baseline" or injected)
            and score(output, "python", context["rubric_revision"], task)
        )
        if output != original["output"] or success != original["success"] or (
            replay["error"] is not None and replay["error"] != original["error"]
        ):
            raise ReplayError("Offline attempt differs from the captured benchmark result.")
        attempt = {key: value for key, value in original.items() if key != "recording"}
        attempts.append({
            **attempt, "id": str(uuid4()), "replayed_from": original["id"], "output": output,
            "events": replay["events"], "success": success,
            "replay": {key: replay[key] for key in (
                "recording_id", "captured_at", "replayed_at", "replay_elapsed_ms", "calls_consumed", "outcome"
            )},
        })
    return {
        **run, "id": str(uuid4()), "mode": "replay", "replayed_from": run["id"],
        "created_at": datetime.now(timezone.utc).isoformat(), "attempts": attempts,
        "telemetry_provenance": "original_recording",
    }


def claim_index(attempt):
    index = {}
    output = attempt.get("output") or {}
    results = output.get("verification", output.get("findings"))
    if not isinstance(results, list):
        return index
    for result in results:
        if not isinstance(result, dict) or not isinstance(result.get("claim"), dict):
            continue
        claim = result["claim"]
        statement = claim.get("statement")
        if not isinstance(statement, str):
            continue
        evidence_items = result.get("evidence")
        if not isinstance(evidence_items, list):
            evidence_items = []
        evidence = sorted([
            {key: item.get(key) for key in ("url", "published_date", "quote")}
            for item in evidence_items if isinstance(item, dict) and isinstance(item.get("url"), str)
        ], key=lambda item: tuple(str(value or "") for value in item.values()))
        timestamp = attempt.get("finished_at") or attempt.get("started_at")
        index[" ".join(statement.casefold().split())] = {
            "claim": statement, "status": result.get("status"), "as_of": result.get("freshness_as_of"),
            "verified_at": timestamp, "evaluator": result.get("evaluated_by"), "evidence": evidence,
        }
    return index


def compare_claims(before, after, *, methodology_changed=False):
    old, new = claim_index(before), claim_index(after)
    changes = []
    for key in sorted(old.keys() | new.keys()):
        previous, current = old.get(key), new.get(key)
        old_evidence = previous["evidence"] if previous else []
        new_evidence = current["evidence"] if current else []
        reasons = []
        if not previous or not current:
            reasons.append("claim_added" if current else "claim_absent")
        if old_evidence != new_evidence:
            reasons.append("evidence_changed")
        missing_urls = sorted({
            item["url"] for item in old_evidence if item["url"]
        } - {item["url"] for item in new_evidence if item["url"]})
        if missing_urls:
            reasons.append("source_absent_from_recorded_evidence")
        if previous and current:
            if methodology_changed or previous["evaluator"] != current["evaluator"]:
                reasons.append("verification_method_changed")
            if previous["status"] != current["status"]:
                if previous["status"] == "supported" and current["status"] in {"outdated", "contradicted"}:
                    reasons.append("marked_" + current["status"])
                else:
                    reasons.append("verification_status_changed")
            if previous["as_of"] != current["as_of"]:
                reasons.append("verification_date_changed")
        changes.append({"previous": previous, "current": current, "changes": reasons,
                        "sources_absent_from_current_evidence": missing_urls})
    return changes


def telemetry(attempt):
    events = attempt.get("events", [])
    return {
        **{key: attempt.get(key) for key in METRICS},
        "retries": sum(bool(event.get("retry")) or event.get("attempt", 1) > 1 for event in events),
        "failures": sum(event.get("status") == "failed" for event in events),
    }


def model_provenance(attempt):
    events = attempt.get("events", [])
    return {
        key: sorted({event[key] for event in events if isinstance(event.get(key), str)})
        for key in ("requested_model", "model", "provider", "requested_provider")
    }


def pair_key(attempt):
    return attempt["agent"], attempt["scenario"], attempt["repetition"]


def compare_runs(baseline, candidate):
    config = {
        key: {"previous": baseline.get(key), "current": candidate.get(key)}
        for key in CONFIG if baseline.get(key) != candidate.get(key)
    }
    incompatible = [
        key for key in CONDITIONS if not baseline.get(key) or not candidate.get(key) or key in config
    ]
    if "model_mode" in config:
        incompatible.append("model_mode")
    if any(run.get("status") in {"queued", "running", "failed"} for run in (baseline, candidate)):
        incompatible.append("incomplete_run")
    old_attempts = {pair_key(attempt): attempt for attempt in baseline.get("attempts", [])}
    new_attempts = {pair_key(attempt): attempt for attempt in candidate.get("attempts", [])}
    if not old_attempts.keys() & new_attempts.keys():
        incompatible.append("no_paired_attempts")
    replay = any(run.get("mode") == "replay" for run in (baseline, candidate))
    pairs = []
    for key in sorted(old_attempts.keys() & new_attempts.keys()):
        old, new = old_attempts[key], new_attempts[key]
        before, after = telemetry(old), telemetry(new)
        old_models, new_models = model_provenance(old), model_provenance(new)
        methodology_changed = (
            "verification_revision" in config or "model_name" in config
            or old_models != new_models
        )
        claims = compare_claims(old, new, methodology_changed=methodology_changed)
        classifications = set()
        if incompatible:
            classifications.add("incomparable_run_conditions")
        if config or old_models != new_models:
            classifications.add("configuration_change")
        if any("evidence_changed" in claim["changes"] for claim in claims):
            classifications.add("evidence_change")
        if not incompatible:
            if not replay and before["latency_ms"] is not None and after["latency_ms"] is not None:
                if after["latency_ms"] > max(before["latency_ms"] * 1.2, before["latency_ms"] + 100):
                    classifications.add("performance_regression")
            if (old["success"] and not new["success"]) or any(after[k] > before[k] for k in ("retries", "failures")):
                classifications.add("reliability_regression")
            if any(
                {"marked_outdated", "marked_contradicted"} & set(claim["changes"])
                and "verification_method_changed" not in claim["changes"]
                and claim["current"]["evaluator"] == "bifrost_model"
                for claim in claims
            ):
                classifications.add("factual_regression")
        pairs.append({
            "agent": key[0], "scenario": key[1], "repetition": key[2],
            "baseline_attempt_id": old["id"], "candidate_attempt_id": new["id"],
            "previous_success": old["success"], "current_success": new["success"],
            "previous_error": old.get("error"), "current_error": new.get("error"),
            "classifications": sorted(classifications), "claims": claims,
            "telemetry": {"previous": before, "current": after, "delta": {
                metric: after[metric] - value if value is not None and after[metric] is not None else None
                for metric, value in before.items()
            }},
            "models": {"previous": old_models, "current": new_models},
            **({"replay": new["replay"]} if new.get("replay") else {}),
        })
    classifications = {label for pair in pairs for label in pair["classifications"]}
    if incompatible or old_attempts.keys() != new_attempts.keys():
        classifications.add("incomparable_run_conditions")
    if config:
        classifications.add("configuration_change")
    return {
        "version": 1, "baseline_run_id": baseline["id"], "candidate_run_id": candidate["id"],
        "candidate_mode": "replay" if candidate.get("mode") == "replay" else candidate.get("model_mode"),
        "rules": RULES, "classifications": sorted(classifications), "configuration": config,
        "incompatible_conditions": incompatible, "historical_telemetry": replay,
        "success": {
            "baseline": {"passed": sum(bool(a["success"]) for a in old_attempts.values()), "total": len(old_attempts)},
            "candidate": {"passed": sum(bool(a["success"]) for a in new_attempts.values()), "total": len(new_attempts)},
        },
        "unpaired": {
            "baseline": sorted(old_attempts.keys() - new_attempts.keys()),
            "candidate": sorted(new_attempts.keys() - old_attempts.keys()),
        },
        "attempts": pairs,
    }
