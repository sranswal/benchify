import json
import os
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

import httpx

from benchify.main import app
from benchify.providers import Providers
from benchify.workflows import Claim, Finding, Meeting, briefing, verify_claim


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        env = patch.dict(os.environ, {
            "BIFROST_BASE_URL": "http://gateway.test/openai",
            "BIFROST_MODEL": "openai/test",
            "BIFROST_VIRTUAL_KEY": "test-gateway-token",
            "TAVILY_API_KEY": "test-search-token",
        })
        env.start()
        self.addCleanup(env.stop)

    async def run_workflow(self, handler, workflow, argument):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            providers = Providers(client, "test-workflow")
            result = await workflow(argument, providers)
            return result, providers.events

    def gateway(self, request, result):
        self.assertEqual(request.url.path, "/openai/chat/completions")
        self.assertEqual(request.headers["x-bf-dim-benchify-workflow"], "test-workflow")
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps(result)}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 40},
        })

    async def test_briefing_runs_retrieval_draft_and_shared_verifier(self):
        quote = "Example Co launched a research tool on November 4, 2025."
        claim = {
            "original_span": quote, "statement": quote, "category": "announcement",
            "time_sensitive": True, "query": "Example Co research tool launch November 4 2025",
            "development_date": "2025-11-04",
        }

        def handler(request):
            body = json.loads(request.content)
            if request.url.host == "api.tavily.com":
                self.assertEqual(body["start_date"], "2025-10-16")
                self.assertEqual(body["end_date"], "2025-11-15")
                self.assertTrue(body["filter_by_published_date"])
                if body["query"].startswith("2025-11-04"):
                    return httpx.Response(200, json={"results": []})
                self.assertIn("2025-10-16 to 2025-11-15", body["query"])
                return httpx.Response(200, json={"results": [{
                    "url": "https://industry.example/article", "title": "Coverage",
                    "published_date": "2025-11-05", "content": quote,
                }, {
                    "url": "https://example.com/news", "title": "Launch",
                    "published_date": "Tue, 04 Nov 2025 00:00:00 GMT", "content": quote,
                }, {
                    "url": "https://example.com/late", "title": "Outside window",
                    "published_date": "2025-11-16", "content": "This should be excluded.",
                }]})
            payload = json.loads(body["messages"][1]["content"])
            if "quote" in payload:
                return self.gateway(request, {"supported": True, "date_supported": True})
            self.assertEqual(len(payload["sources"]), 2)
            self.assertTrue(payload["sources"][0]["primary"])
            self.assertEqual(payload["sources"][0]["url"], "https://example.com/news")
            if "claim" not in payload:
                return self.gateway(request, {"findings": [claim], "questions": ["What comes next?"]})
            return self.gateway(request, {
                "status": "supported", "explanation": "The excerpt identifies the launch.",
                "citations": [{"id": 1, "quote": quote}, {"id": 0, "quote": quote}],
            })

        meeting = Meeting(subject="Example Co", meeting_at=datetime(2025, 11, 15, tzinfo=timezone.utc))
        with patch.dict(os.environ, {"BENCHIFY_PRIMARY_DOMAINS": "example.com"}):
            result, events = await self.run_workflow(handler, briefing, meeting)
        self.assertEqual(len(result["findings"]), 1)
        self.assertEqual([item["url"] for item in result["findings"][0]["evidence"]], ["https://example.com/news"])
        self.assertEqual(result["verification"][0]["freshness_score"], 88)
        self.assertEqual([event["service"] for event in events], ["Tavily", "Bifrost", "Tavily", "Bifrost", "Bifrost"])

    async def test_invented_quote_cannot_support_claim(self):
        def handler(request):
            if request.url.host == "api.tavily.com":
                return httpx.Response(200, json={"results": [{
                    "url": "https://example.com/news", "title": "Launch",
                    "published_date": "2025-11-04", "content": "An unrelated announcement.",
                }]})
            return self.gateway(request, {"status": "supported", "explanation": "Model assertion.",
                                          "citations": [{"id": 0, "quote": "An invented supporting statement."}]})

        claim = Claim(original_span="Example Co launched a tool.", statement="Example Co launched a tool.",
                      category="announcement", time_sensitive=True, query="Example Co launch")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await verify_claim(claim, Providers(client, "test-workflow"), date(2025, 11, 15))
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertIsNone(result["freshness_score"])

    async def test_briefing_requires_the_event_date_and_semantic_support(self):
        claim = Finding(
            original_span="Example Co launched a research tool on November 4, 2025.",
            statement="Example Co launched a research tool on November 4, 2025.",
            category="announcement", time_sensitive=True, query="Example Co tool",
            development_date=date(2025, 11, 4),
        )
        for quote in (
            "Example Co launched a research tool on November 3, 2025.",
            "Example Co canceled the planned launch on November 4, 2025.",
        ):
            with self.subTest(quote=quote):
                def handler(request):
                    if request.url.host == "api.tavily.com":
                        return httpx.Response(200, json={"results": [{
                            "url": "https://example.com/news", "title": "Release notes",
                            "published_date": "2025-11-04", "content": quote,
                        }]})
                    body = json.loads(request.content)
                    payload = json.loads(body["messages"][1]["content"])
                    if "quote" in payload:
                        self.assertEqual(payload["quote"], quote)
                        self.assertIn("canceled", quote)
                        return self.gateway(request, {"supported": False, "date_supported": False})
                    return self.gateway(request, {
                        "status": "supported", "explanation": "Initial judgment.",
                        "citations": [{"id": 0, "quote": quote}],
                    })

                async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                    result = await verify_claim(claim, Providers(client, "test-workflow"), date(2025, 11, 15))
                self.assertEqual(result["status"], "insufficient_evidence")
                self.assertEqual(result["evidence"], [])

    async def test_missing_configuration_is_explicit(self):
        with patch.dict(os.environ, {"BIFROST_MODEL": ""}):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchify.test") as client:
                response = await client.post("/api/v1/verify", json={"text": "Example claim."})
        self.assertEqual(response.status_code, 502)
        self.assertIn("BIFROST_MODEL", response.json()["detail"])
        self.assertEqual(response.headers["X-Request-ID"], response.json()["workflow_id"])
        self.assertEqual(response.json()["events"], [])


    async def test_future_source_cannot_support_historical_claim(self):
        def handler(request):
            self.assertEqual(request.url.host, "api.tavily.com")
            return httpx.Response(200, json={"results": [{
                "url": "https://example.com/news", "published_date": "2025-11-16",
                "content": "Example Co launched a new tool on November 4, 2025.",
            }]})

        claim = Claim(original_span="Example Co launched a tool.", statement="Example Co launched a tool.",
                      category="announcement", time_sensitive=True, query="Example Co launch")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await verify_claim(claim, Providers(client, "test-workflow"), date(2025, 11, 15))
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(result["evidence"], [])
