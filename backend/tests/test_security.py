import os
import socket
import unittest
from datetime import date
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx

from benchify.agent_http import AgentPolicyError, execute_agent, safe_address, validate_target
from benchify.benchmark import ACTIVE_SEARCHES, FixtureSearch, fixtures
from benchify.main import app
from benchify.replay import CaptureProviders, ReplayError, replay_recording
from benchify.workflows import Answer

TOKEN = "test-operator-token-" + "a" * 24
ORIGIN = "https://agent.example"


def dns(*addresses):
    return [(socket.AF_INET6 if ":" in address else socket.AF_INET, socket.SOCK_STREAM,
             6, "", (address, 443)) for address in addresses]


class OutboundTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"BENCHIFY_ENV": "production", "BENCHIFY_ALLOW_LOCAL_AGENTS": "0",
                                     "BENCHIFY_AGENT_ALLOWED_ORIGINS": ORIGIN})
        env.start()
        self.addCleanup(env.stop)

    def test_exact_origins_and_local_exception(self):
        for url in ("http://agent.example", "https://agent.example.evil", "https://agent.example:8443",
                    "https://user@agent.example", "https://agent.example/path?token=x", "file:///config",
                    "http://127.0.0.1:8001/run"):
            with self.subTest(url=url), self.assertRaises(AgentPolicyError):
                validate_target(url)
        self.assertFalse(validate_target(ORIGIN + "/run")[1])
        with patch.dict(os.environ, {"BENCHIFY_ALLOW_LOCAL_AGENTS": "1"}):
            with self.assertRaises(AgentPolicyError):
                validate_target("http://127.0.0.1:8001/run")
        with patch.dict(os.environ, {"BENCHIFY_ENV": "development", "BENCHIFY_ALLOW_LOCAL_AGENTS": "1"}):
            self.assertTrue(validate_target("http://127.0.0.1:8001/run")[1])

    def test_blocks_special_addresses(self):
        for address in ("127.0.0.1", "10.0.0.1", "192.168.1.2", "172.16.0.1",
                        "169.254.169.254", "100.100.100.200", "224.0.0.1", "::1",
                        "::ffff:127.0.0.1", "64:ff9b::a00:1", "fd00:ec2::254", "fe80::1", "fec0::1"):
            with self.subTest(address=address):
                self.assertFalse(safe_address(address, local=False))
        self.assertTrue(safe_address("8.8.8.8", local=False))
        self.assertTrue(safe_address("2606:4700:4700::1111", local=False))

    async def test_mixed_resolution_rejected_before_http(self):
        with patch("asyncio.BaseEventLoop.getaddrinfo", new=AsyncMock(return_value=dns("8.8.8.8", "10.0.0.1"))):
            with patch("benchify.agent_http.httpx.AsyncClient", side_effect=AssertionError("Outbound connection")):
                with self.assertRaisesRegex(AgentPolicyError, "blocked network"):
                    await execute_agent(ORIGIN + "/run", {}, {})

    async def test_pinned_ip_keeps_host_and_sni_and_blocks_redirect(self):
        requests = []
        real_client = httpx.AsyncClient

        def respond(request):
            requests.append(request)
            return httpx.Response(302, headers={"Location": "http://169.254.169.254/metadata"})

        resolver = AsyncMock(return_value=dns("8.8.8.8"))
        with patch("asyncio.BaseEventLoop.getaddrinfo", new=resolver), patch(
            "benchify.agent_http.httpx.AsyncClient",
            side_effect=lambda **options: real_client(transport=httpx.MockTransport(respond), **options),
        ):
            with self.assertRaises(httpx.HTTPStatusError):
                await execute_agent(ORIGIN + "/run", {"Authorization": "Bearer test"}, {})
        resolver.assert_awaited_once()
        self.assertEqual(len(requests), 1)
        request = requests[0]
        self.assertEqual(request.url.host, "8.8.8.8")
        self.assertEqual(request.headers["Host"], "agent.example")
        self.assertEqual(request.extensions["sni_hostname"], "agent.example")

    async def test_response_size_limit(self):
        real_client = httpx.AsyncClient
        transport = httpx.MockTransport(lambda _: httpx.Response(200, content=b"x" * (256 * 1024 + 1)))
        with patch("asyncio.BaseEventLoop.getaddrinfo", new=AsyncMock(return_value=dns("8.8.8.8"))), patch(
            "benchify.agent_http.httpx.AsyncClient",
            side_effect=lambda **options: real_client(transport=transport, **options),
        ):
            with self.assertRaisesRegex(AgentPolicyError, "size limit"):
                await execute_agent(ORIGIN + "/run", {}, {})


class AccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_operator_gate_readiness_and_callback_scope(self):
        with patch.dict(os.environ, {"BENCHIFY_ENV": "production", "BENCHIFY_OPERATOR_TOKEN": TOKEN}):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchify.test") as client:
                self.assertEqual((await client.get("/health")).status_code, 200)
                self.assertEqual((await client.get("/ready")).status_code, 503)
                download = f"/api/v1/runs/{uuid4()}/attempts/{uuid4()}/recording"
                for method, path in (("GET", download), ("DELETE", download), ("POST", "/api/v1/replay")):
                    response = await client.request(method, path)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                authorized = {"Authorization": "Bearer " + TOKEN}
                with patch("benchify.main.run_store.get_recording", return_value={"version": 1}):
                    response = await client.get(download, headers=authorized)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    self.assertIn("attachment", response.headers["Content-Disposition"])
                with patch("benchify.main.run_store.delete_recording") as delete:
                    self.assertEqual((await client.delete(download, headers=authorized)).status_code, 204)
                    delete.assert_called_once()
                self.assertEqual((await client.post(f"/api/v1/fixture/{uuid4()}/search", json={})).status_code, 404)
                self.assertEqual((await client.get("/api/v1/runs/catalog")).status_code, 401)

    async def test_unauthenticated_network_peer_is_blocked(self):
        with patch.dict(os.environ, {"BENCHIFY_ENV": "development", "BENCHIFY_OPERATOR_TOKEN": ""}):
            transport = httpx.ASGITransport(app=app, client=("192.168.1.10", 1000))
            async with httpx.AsyncClient(transport=transport, base_url="http://benchify.test") as client:
                self.assertEqual((await client.get("/api/v1/runs/catalog")).status_code, 403)

    async def test_live_callback_is_bounded_and_has_no_other_permissions(self):
        key = str(uuid4())
        path = f"/api/v1/fixture/{key}/search"
        fixture = FixtureSearch("baseline", fixtures()["meeting-research-v1"][0])
        with patch.dict(os.environ, {"BENCHIFY_ENV": "production", "BENCHIFY_OPERATOR_TOKEN": TOKEN}), patch.dict(
            ACTIVE_SEARCHES, {key: fixture}
        ):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchify.test") as client:
                self.assertEqual((await client.get(path)).status_code, 401)
                self.assertEqual((await client.post(path, json={"query": "x" * 3000})).status_code, 413)
                self.assertEqual((await client.post(path, json={"query": "fixture"})).status_code, 200)
                fixture.searches = 16
                self.assertEqual((await client.post(path, json={"query": "fixture"})).status_code, 429)
                self.assertEqual((await client.post("/api/v1/runs", json={"query": key})).status_code, 401)

    async def test_production_missing_token_fails_closed(self):
        with patch.dict(os.environ, {"BENCHIFY_ENV": "production", "BENCHIFY_OPERATOR_TOKEN": ""}):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://benchify.test") as client:
                self.assertEqual((await client.get("/api/v1/runs/catalog")).status_code, 503)


class CaptureLimits(unittest.IsolatedAsyncioTestCase):
    async def test_limit_rejections_and_incomplete_import(self):
        class Sources:
            async def search(self, query, window):
                return []

        providers = CaptureProviders(Sources(), search_source="Tavily", model_source="Bifrost")
        payload, today = Answer(text="A claim."), date(2025, 1, 1)
        result = {"verification": []}
        with patch("benchify.replay.MAX_RECORDING_BYTES", 50):
            rejected = providers.finish(payload, today, result, [])
        self.assertEqual(rejected["capture_status"], "rejected")
        self.assertIn("size limit", rejected["capture_error"])
        self.assertNotIn("recording", rejected)
        recording = providers.finish(payload, today, result, [])["recording"]
        self.assertIs(recording["complete"], True)
        with self.assertRaises(ReplayError):
            await replay_recording({**recording, "complete": False})
        for index in range(33):
            await providers.search(f"call {index}")
        rejected = providers.finish(payload, today, result, [])
        self.assertIn("call limit", rejected["capture_error"])
        self.assertNotIn("recording", rejected)
