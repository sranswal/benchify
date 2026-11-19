import asyncio
import copy
import json
import socket
import unittest
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx

from benchify.benchmark import RunRequest, attempt, fixtures, new_run
from benchify.main import app
from benchify.providers import Evidence, ProviderError, Providers
from benchify.regression import compare_runs, replay_run
from benchify.replay import CaptureProviders, ReplayError, replay_recording
from benchify.workflows import Answer, Meeting, briefing, verify_answer


class ReplayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        env = patch.dict("os.environ", {"BENCHIFY_ENV": "development", "BENCHIFY_OPERATOR_TOKEN": ""})
        env.start()
        self.addCleanup(env.stop)

    async def benchmark_recording(self, scenario, *, read_timeout=False, secret=None):
        revision = next(key for key in fixtures() if "northwind" in key)
        task, _ = fixtures()[revision]
        expected = task["expected"]
        quote = expected["statement"]
        requests = []

        def respond(request):
            requests.append(request)
            if read_timeout:
                raise httpx.ReadTimeout("read timed out", request=request)
            if len(requests) == 1:
                return httpx.Response(503, headers={"x-bf-request-id": "failed-gateway"})
            payload = json.loads(json.loads(request.content)["messages"][1]["content"])
            if "quote" in payload:
                value = {"supported": True, "date_supported": True}
            elif "claim" in payload:
                value = {"status": "supported", "explanation": "The source supports the claim.",
                         "citations": [{"id": 0, "quote": quote}]}
            else:
                value = {"findings": [{**expected, "original_span": quote, "category": "announcement",
                                       "time_sensitive": True}], "questions": [secret or "What should we test?"]}
            return httpx.Response(200, json={"model": "test", "provider": "test-provider",
                "choices": [{"message": {"content": json.dumps(value)}}]})

        with patch.dict("os.environ", {"BIFROST_MODEL": "test/model", "BIFROST_VIRTUAL_KEY": secret or "sample-private-key",
                                      "BENCHIFY_CAPTURE_RETENTION_DAYS": "7"}), patch(
            "benchify.providers.uniform", return_value=0
        ):
            run = new_run(RunRequest(agents=["python"], fixture_revision=revision, scenarios=[scenario],
                                     model_mode="live", capture_mode="full"))
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
                run["attempts"].append(await attempt(client, "python", scenario, 1, run))
        return run

    async def test_capture_and_replay_faults_without_network(self):
        for status in (429, 503):
            with self.subTest(status=status):
                run = await self.benchmark_recording(f"first_search_{status}")
                original = run["attempts"][0]
                self.assertTrue(original["success"])
                recording = json.loads(json.dumps(original["recording"]))
                self.assertNotIn("sample-private-key", json.dumps(recording))
                self.assertEqual(recording["benchmark"]["run_id"], run["id"])
                self.assertEqual(recording["benchmark"]["fixture_sha256"], run["fixture_sha256"])
                codes = [event["status_code"] for event in recording["trace"] if event.get("status_code")]
                self.assertIn(status, codes)
                self.assertIn(503, codes)
                self.assertTrue(any(event.get("attempt") == 2 for event in recording["trace"]))
                self.assertTrue(all(call["invoked_at"] <= call["settled_at"] for call in recording["calls"]))
                positions = sorted(seq for call in recording["calls"] for seq in (call["start"], call["finish"]))
                self.assertEqual(positions, list(range(2 * len(recording["calls"]))))
                with patch.object(httpx.AsyncClient, "send", side_effect=AssertionError("network access")), patch.object(
                    socket.socket, "connect", side_effect=AssertionError("socket access")
                ):
                    replay = await replay_run(run)
                self.assertEqual(replay["mode"], "replay")
                self.assertEqual(replay["attempts"][0]["output"], original["output"])
                self.assertEqual(replay["attempts"][0]["events"], recording["trace"])
                self.assertEqual(compare_runs(run, replay)["classifications"], [])

    async def test_recorded_read_timeout_replays_failure(self):
        run = await self.benchmark_recording("baseline", read_timeout=True)
        original = run["attempts"][0]
        self.assertFalse(original["success"])
        with patch.object(httpx.AsyncClient, "send", side_effect=AssertionError("network access")):
            replay = await replay_run(run)
        self.assertEqual(replay["attempts"][0]["error"], original["error"])
        self.assertEqual(replay["attempts"][0]["events"][-1]["failure_category"], "timeout")

    async def test_deadline_cancels_a_recorded_operation(self):
        class Stalled:
            async def search(self, *args):
                await asyncio.Event().wait()

        payload = Meeting(subject="Test", meeting_at=datetime(2022, 12, 1, tzinfo=timezone.utc))
        providers = CaptureProviders(Stalled(), search_source="Tavily", model_source="Bifrost")
        with self.assertRaises(TimeoutError):
            async with asyncio.timeout(0.01):
                await briefing(payload, providers, today=date(2023, 5, 1))
        recording = providers.finish(payload, date(2023, 5, 1), None, [], terminal="deadline", error="deadline")
        replay = await replay_recording(recording["recording"])
        self.assertEqual(replay["outcome"], "deadline")
        self.assertEqual(replay["recorded_clock_date"], "2023-05-01")
        self.assertEqual(replay["as_of"], "2022-12-01")

    async def test_unsafe_recording_is_omitted(self):
        run = await self.benchmark_recording("baseline", secret="a-test-credential-987654")
        attempt_result = run["attempts"][0]
        self.assertNotIn("recording", attempt_result)
        self.assertIn("credentials", attempt_result["capture_error"])

    async def test_missing_expired_or_incompatible_recordings(self):
        run = await self.benchmark_recording("baseline")
        recording = run["attempts"][0].pop("recording")
        with self.assertRaisesRegex(ReplayError, "missing"):
            await replay_run(run)
        for mutation in (
            {"version": 999},
            {"expires_at": "2023-01-02T00:00:00Z", "captured_at": "2023-01-01T00:00:00Z"},
            {"calls": recording["calls"][:-1]},
            {"result_sha256": "0" * 64},
        ):
            with self.subTest(mutation=tuple(mutation)):
                with self.assertRaises(ReplayError):
                    await replay_recording({**recording, **mutation})

    async def test_verification_capture_historical_tavily_evidence(self):
        text = "Example launched its research tool."
        quote = "The official release confirms that Example launched its research tool."
        source = "https://example.org/release"
        claim = {"original_span": text, "statement": text, "category": "announcement",
                 "time_sensitive": True, "query": "Example launch"}

        def respond(request):
            if request.url.host == "api.tavily.com":
                return httpx.Response(200, json={"results": [
                    {"url": source, "published_date": "2022-11-16T00:00:00Z", "content": quote},
                    {"url": source + "-future", "published_date": "2022-12-04", "content": quote},
                ]})
            payload = json.loads(json.loads(request.content)["messages"][1]["content"])
            result = {"claims": [claim]} if "answer" in payload else {
                "status": "supported", "explanation": "The announcement confirms the launch.",
                "citations": [{"id": 0, "quote": quote}],
            }
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(result)}}]})

        payload = Answer(text=text)
        as_of = date(2022, 12, 1)
        with patch.dict("os.environ", {"BIFROST_MODEL": "test", "TAVILY_API_KEY": "private-search-key"}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
                upstream = Providers(client, "test")
                providers = CaptureProviders(upstream, search_source="Tavily", model_source="Bifrost")
                output = await verify_answer(payload, providers, today=as_of)
                recording = providers.finish(payload, as_of, output, upstream.events)["recording"]
        self.assertNotIn("private-search-key", json.dumps(recording))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchify.test") as client:
            with patch.object(Providers, "post", side_effect=AssertionError("provider access")):
                response = await client.post("/api/v1/replay", json=recording)
                history = await client.post("/api/v1/evidence/compare", json={
                    "baseline": recording, "candidate": recording,
                })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(history.json()["claims"][0]["changes"], [])
        result = response.json()["output"]["verification"][0]
        self.assertEqual(result["evidence"][0]["url"], source)
        self.assertEqual(result["evidence"][0]["published_date"], "2022-11-16")
        self.assertEqual(result["freshness_as_of"], "2022-12-01")

    async def test_concurrent_provider_settlements_and_sibling_cancellation(self):
        class ConcurrentProviders:
            def __init__(self, fail):
                self.ready = asyncio.Event()
                self.release = asyncio.Event()
                self.fail = fail

            async def model(self, instructions, payload, schema):
                if "answer" not in payload:
                    if payload["claim"]["query"] == "second":
                        self.release.set()
                    return schema(status="unverified", explanation="Unclear evidence.", citations=[])
                return schema(claims=[
                    {"original_span": text, "statement": text, "category": "other",
                     "time_sensitive": False, "query": label}
                    for label, text in (("first", "First claim."), ("second", "Second claim."))
                ])

            async def search(self, query, window):
                if query == "first":
                    self.ready.set()
                    await self.release.wait()
                else:
                    await self.ready.wait()
                    if self.fail:
                        raise ProviderError("Tavily request failed (HTTP 503).")
                return [Evidence(url="https://example.org/source", title="Source", content="An excerpt.")]

        payload = Answer(text="First claim. Second claim.")
        as_of = date(2022, 12, 1)
        for fail in (False, True):
            with self.subTest(fail=fail):
                providers = CaptureProviders(ConcurrentProviders(fail), search_source="Tavily", model_source="Bifrost")
                if fail:
                    with self.assertRaises(ExceptionGroup) as errors:
                        await verify_answer(payload, providers, today=as_of)
                    error = str(errors.exception.exceptions[0])
                    recording = providers.finish(payload, as_of, None, [], terminal="provider_error", error=error)
                else:
                    output = await verify_answer(payload, providers, today=as_of)
                    recording = providers.finish(payload, as_of, output, [])
                data = recording["recording"]
                first, second = data["calls"][1:3]
                self.assertLess(first["start"], second["start"])
                self.assertGreater(first["finish"], second["finish"])
                replay = await replay_recording(data)
                self.assertEqual(replay["outcome"], "provider_error" if fail else "success")
                if not fail:
                    self.assertEqual(
                        [decision["claim"]["query"] for decision in replay["output"]["verification"]],
                        ["first", "second"],
                    )

    async def test_regressions_and_incompatible_datasets(self):
        before = await self.benchmark_recording("baseline")
        after = copy.deepcopy(before)
        after["id"] = "candidate"
        result = after["attempts"][0]
        result["success"] = False
        result["latency_ms"] += 1500
        result["output"]["verification"][0]["status"] = "outdated"
        result["output"]["verification"][0]["evidence"] = []
        report = compare_runs(before, after)
        self.assertEqual(set(report["classifications"]), {
            "reliability_regression", "performance_regression", "factual_regression", "evidence_change",
        })
        self.assertTrue(report["attempts"][0]["claims"][0]["sources_absent_from_current_evidence"])
        after["fixture_sha256"] = "different"
        report = compare_runs(before, after)
        self.assertIn("fixture_sha256", report["incompatible_conditions"])
        self.assertFalse(any(label.endswith("_regression") for label in report["classifications"]))
