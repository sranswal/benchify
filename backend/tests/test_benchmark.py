import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import httpx
from pydantic import ValidationError

from benchify.agent_registry import registry
from benchify.benchmark import RUBRIC_REVISION, RunRequest, attempt_plan, fixtures, new_run, score
from benchify.providers import ProviderError, Providers
from benchify.workflows import ExcerptCheck


class BenchmarkTests(unittest.TestCase):
    def test_operator_can_register_recorded_task_revision(self):
        fixture, _ = fixtures()["northwind-key-rotation-v1"]
        recorded = {**fixture, "revision": "recorded-northwind-v1", "kind": "recorded"}
        with TemporaryDirectory() as directory, patch.dict("os.environ", {"BENCHIFY_FIXTURE_DIRECTORY": directory}):
            Path(directory, "recorded.json").write_text(json.dumps(recorded), encoding="utf-8")
            fixtures.cache_clear()
            try:
                run = new_run(RunRequest(fixture_revision=recorded["revision"]))
                self.assertEqual(run["dataset_kind"], "recorded")
                self.assertEqual(run["meeting"]["subject"], "Northwind Cloud")
            finally:
                fixtures.cache_clear()

    def test_run_uses_selected_task_agents_and_scenarios(self):
        env = patch.dict("os.environ", {"BENCHIFY_ALLOW_LOCAL_AGENTS": "1", "BENCHIFY_ENV": "development",
                                        "BENCHIFY_HTTP_AGENT_URL": "http://127.0.0.1:8001/execute"})
        env.start()
        self.addCleanup(env.stop)
        registry.cache_clear()
        self.addCleanup(registry.cache_clear)
        request = RunRequest(
            fixture_revision="northwind-key-rotation-v1",
            agents=["http"],
            scenarios=["baseline", "first_search_429"],
            repetitions=2,
        )
        run = new_run(request)
        self.assertEqual(run["meeting"]["subject"], "Northwind Cloud")
        self.assertEqual(attempt_plan(run), [
            ("http", "baseline", 1), ("http", "first_search_429", 1),
            ("http", "baseline", 2), ("http", "first_search_429", 2),
        ])
        with self.assertRaises(ValidationError):
            RunRequest(agents=["http", "http"])

    def test_verified_paraphrase_preserves_exact_primary_evidence(self):
        task, _ = fixtures()["meeting-research-v1"]
        expected = task["expected"]
        source = next(item for item in task["sources"] if item["primary"])
        finding = {
            "claim": {
                "statement": "Orchard Systems released CSV audit-log exports on November 4, 2025.",
                "original_span": expected["statement"],
                "development_date": expected["development_date"],
            },
            "status": "supported",
            "evaluated_by": "bifrost_model",
            "evidence": [{"url": source["url"], "quote": source["content"]}],
        }
        output = {"findings": [finding], "questions": ["Which fields are exported?"]}
        self.assertTrue(score(output, "python", RUBRIC_REVISION, task))
        self.assertFalse(score(output, "python", "meeting-v1", task))
        self.assertFalse(score(output, "http", RUBRIC_REVISION, task))
        finding["evidence"][0]["quote"] = "An invented quote"
        self.assertFalse(score(output, "python", RUBRIC_REVISION, task))


class ProviderRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_model_preserves_transient_failure_and_success(self):
        statuses = iter((503, 200))

        def respond(request):
            status = next(statuses)
            if status == 503:
                return httpx.Response(status)
            return httpx.Response(status, json={
                "choices": [{"message": {"content": '{"supported": true, "date_supported": true}'}}],
            })

        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            provider = Providers(client, "test")
            with patch.dict("os.environ", {"BIFROST_MODEL": "test-model"}):
                result = await provider.model("Verify the quote.", {}, ExcerptCheck)
        self.assertTrue(result.supported)
        self.assertEqual([event.get("status_code") for event in provider.events], [503, 200])
        self.assertEqual(len(provider.event_starts), 2)

        failed, success = provider.events
        self.assertEqual(failed["failure_category"], "upstream")
        self.assertEqual(failed["operation_id"], success["operation_id"])
        self.assertNotEqual(failed["client_request_id"], success["client_request_id"])
        self.assertEqual([failed["attempt"], success["attempt"]], [1, 2])

    async def test_retry_after_outside_deadline_prevents_retry(self):
        requests = []

        def respond(request):
            requests.append(request)
            return httpx.Response(429, headers={"Retry-After": "120", "x-bf-request-id": "gateway-id"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            provider = Providers(client, "test")
            with patch.dict("os.environ", {"BIFROST_MODEL": "test-model"}):
                with self.assertRaisesRegex(ProviderError, "HTTP 429"):
                    await provider.model("Verify the quote.", {}, ExcerptCheck)
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].headers["X-Request-ID"], provider.events[0]["client_request_id"])
        self.assertEqual(provider.events[0]["request_id"], "gateway-id")
        self.assertEqual(provider.events[0]["failure_category"], "rate_limit")

    async def test_invalid_model_payload_keeps_usage_and_records_failure(self):
        def respond(request):
            return httpx.Response(200, json={"choices": [], "usage": {"prompt_tokens": 17}})

        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            provider = Providers(client, "test")
            with patch.dict("os.environ", {"BIFROST_MODEL": "test-model"}):
                with self.assertRaisesRegex(ProviderError, "invalid_response"):
                    await provider.model("Verify the quote.", {}, ExcerptCheck)
        self.assertEqual(len(provider.events), 1)
        self.assertEqual(provider.events[0]["status"], "failed")
        self.assertEqual(provider.events[0]["input_tokens"], 17)

    async def test_read_timeout_is_reported_without_duplicate_inference(self):
        def respond(request):
            raise httpx.ReadTimeout("response timed out", request=request)

        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            provider = Providers(client, "test")
            with patch.dict("os.environ", {"BIFROST_MODEL": "test-model"}):
                with self.assertRaisesRegex(ProviderError, "timeout"):
                    await provider.model("Verify the quote.", {}, ExcerptCheck)
        self.assertEqual(len(provider.events), 1)
        self.assertFalse(provider.events[0]["retryable"])
