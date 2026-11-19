"""Exercise the ARM64 VM stack on a disposable Docker project and synthetic providers."""
import json
import os
import secrets
import ssl
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import httpx

DEPLOY = Path(__file__).resolve().parent
PROJECT = "benchify-arm-test-" + uuid4().hex[:10]
IMAGE = "benchify-api:arm64"

MOCK = """
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        content = json.dumps({"supported": True, "date_supported": True})
        result = {"candidates": [{"content": {"role": "model", "parts": [{"text": content}]},
                  "finishReason": "STOP", "index": 0}],
                  "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 8, "totalTokenCount": 13},
                  "modelVersion": "gemini-3.1-flash-lite"}
        payload = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"models":[]}' if "models" in self.path else b'{}')
HTTPServer(("0.0.0.0",8090), Handler).serve_forever()
"""
PROBE = """
import asyncio, os, platform
import httpx
from benchify.providers import Providers
from benchify.workflows import ExcerptCheck
async def main():
    assert platform.machine() == os.environ["BENCHIFY_TEST_MACHINE"]
    # Docker exec gets configured container env, independent of PID 1's shell exports.
    if host := os.getenv("BIFROST_HOST"):
        os.environ["BIFROST_BASE_URL"] = f"http://{host}:8080/openai"
    async with httpx.AsyncClient(timeout=12,trust_env=False) as c:
        assert (await c.get("http://bifrost:8080/health")).is_success
        admin = await c.get("http://bifrost:8080/api/logs")
        assert admin.status_code in (401,403), admin.status_code
        anonymous = await c.post("http://bifrost:8080/openai/chat/completions", json={
            "model":os.environ["BIFROST_MODEL"],"messages":[{"role":"user","content":"test"}]})
        assert anonymous.status_code in (401,403), anonymous.status_code
        p = Providers(c,"arm64-compose-proof")
        result = await p.model("Verify the synthetic excerpt.",{},ExcerptCheck)
        assert result.supported and result.date_supported
        assert p.events[0]["status_code"] == 200 and p.events[0]["client_request_id"]
asyncio.run(main())
"""


def main():
    test_platform = os.environ.get("BENCHIFY_SMOKE_PLATFORM", "linux/arm64")
    if test_platform not in {"linux/arm64", "linux/amd64"}:
        raise ValueError("Unsupported smoke platform.")
    expected = "aarch64" if test_platform == "linux/arm64" else "x86_64"
    api_image = os.environ.get("BENCHIFY_SMOKE_IMAGE", IMAGE)
    work = DEPLOY.parent / ".benchify"
    work.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="arm64-smoke-", dir=work) as directory:
        d = Path(directory)
        password = secrets.token_hex(20)
        operator = secrets.token_urlsafe(32)
        vk = "sk-bf-" + secrets.token_hex(24)
        config = json.loads((DEPLOY / "bifrost.config.json").read_text(encoding="utf8"))
        config["providers"]["gemini"]["network_config"] = {
            "base_url": "http://provider-fixture:8090", "allow_private_network": True,
        }
        (d / "config.json").write_text(json.dumps(config), encoding="utf8")
        (d / "mock.py").write_text(MOCK, encoding="utf8")
        (d / "api.env").write_text(
            f"BENCHIFY_OPERATOR_TOKEN={operator}\nDATABASE_URL=postgresql://postgres:{password}@test-db/postgres\n"
            f"BIFROST_VIRTUAL_KEY={vk}\nBIFROST_MODEL=gemini/gemini-3.1-flash-lite\n", encoding="utf8",
        )
        (d / "bifrost.env").write_text(
            f"BIFROST_VIRTUAL_KEY={vk}\nBIFROST_ENCRYPTION_KEY={secrets.token_hex(32)}\n"
            f"BIFROST_SETUP_TOKEN={secrets.token_hex(32)}\nBIFROST_ADMIN_USERNAME=smoke-admin\n"
            f"BIFROST_ADMIN_PASSWORD={secrets.token_hex(20)}\nBIFROST_PROVIDER_API_KEY=synthetic-provider-key\n",
            encoding="utf8",
        )
        overlay = {"services": {
            "benchify-api": {"platform": test_platform, "environment": {"BENCHIFY_TEST_MACHINE": expected}},
            "bifrost": {"platform": test_platform},
            "reverse-proxy": {"platform": test_platform},
            "test-db": {"image": "postgres:16-alpine", "environment": {"POSTGRES_PASSWORD": password},
                        "networks": ["gateway"]},
            "provider-fixture": {
                "platform": test_platform, "image": api_image, "entrypoint": ["python", "/mock.py"],
                "volumes": [d.joinpath("mock.py").as_posix() + ":/mock.py:ro"], "networks": ["provider-egress"],
            },
        }}
        if os.environ.get("BENCHIFY_SMOKE_EMULATED") == "1":
            overlay["services"]["benchify-api"].update(cpus="2", healthcheck={
                "test": ["CMD", "python", "-c",
                         "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=15).close()"],
                "timeout": "25s", "start_period": "140s",
            })
            overlay["services"]["bifrost"]["cpus"] = "3"
        (d / "override.json").write_text(json.dumps(overlay), encoding="utf8")
        env = {**os.environ, "BENCHIFY_API_IMAGE": api_image, "BENCHIFY_SECRETS_DIR": d.as_posix(),
               "BIFROST_CONFIG_PATH": d.joinpath("config.json").as_posix(),
               "BENCHIFY_API_DOMAIN": "localhost", "ACME_EMAIL": "test@example.invalid",
               "PUBLIC_BIND_IP": "127.0.0.1", "PUBLIC_HTTP_PORT": "0", "PUBLIC_HTTPS_PORT": "0"}
        base = ["docker", "compose", "-p", PROJECT, "-f", str(DEPLOY / "compose.yaml"),
                "-f", str(d / "override.json")]

        def compose(*args, capture=False):
            return subprocess.run([*base, *args], env=env, check=True, text=True, capture_output=capture)

        if os.environ.get("BENCHIFY_SMOKE_RENDER") == "1":
            # Resolve the VM test stack, then replace the gateway with the Render image.
            # The generated file contains disposable credentials and stays inside TemporaryDirectory.
            resolved = json.loads(compose("config", "--format", "json", capture=True).stdout)
            import shlex
            import yaml
            blueprint = yaml.safe_load((DEPLOY.parent / "render.yaml").read_text(encoding="utf8"))
            api = resolved["services"]["benchify-api"]
            api["command"] = [part.replace("$", "$$") for part in
                              shlex.split(blueprint["services"][0]["dockerCommand"])]
            api["environment"]["BIFROST_HOST"] = "bifrost"
            api["environment"].pop("BIFROST_BASE_URL", None)
            gateway = resolved["services"]["bifrost"]
            gateway.update(image="benchify-bifrost:render", cpus=0.5, mem_limit="512m",
                           entrypoint=["/bin/sh", "/etc/benchify/render-start.sh"])
            # Match the bootstrap capabilities supplied by a standard Docker runtime.
            gateway["cap_add"] = ["CHOWN", "FOWNER", "DAC_OVERRIDE", "SETUID", "SETGID"]
            gateway["environment"]["GOMEMLIMIT"] = "384MiB"
            gateway["volumes"] = [
                {"type": "volume", "source": "bifrost-data", "target": "/app/data"},
                {"type": "bind", "source": d.joinpath("config.json").as_posix(),
                 "target": "/etc/benchify/config.json", "read_only": True},
            ]
            (d / "render.json").write_text(json.dumps(resolved), encoding="utf8")
            base = ["docker", "compose", "-p", PROJECT, "-f", str(d / "render.json")]

        try:
            compose("up", "--no-build", "-d", "--wait", "--wait-timeout", "240")
            compose("exec", "-T", "benchify-api", "python", "-c", PROBE)
            if os.environ.get("BENCHIFY_SMOKE_RENDER") == "1":
                status = compose("exec", "-T", "bifrost", "cat", "/proc/1/status", capture=True).stdout
                assert "Uid:\t1000\t1000\t1000\t1000" in status
                permissions = compose("exec", "-T", "bifrost", "stat", "-c", "%a",
                                      "/app/data", "/app/data/config.json", capture=True).stdout.split()
                assert permissions == ["700", "600"], permissions
            cert = compose("exec", "-T", "reverse-proxy", "cat",
                           "/data/caddy/pki/authorities/local/root.crt", capture=True).stdout
            host = compose("port", "reverse-proxy", "443", capture=True).stdout.strip().rsplit(":", 1)[1]
            with httpx.Client(base_url=f"https://localhost:{host}", timeout=15, trust_env=False,
                              verify=ssl.create_default_context(cadata=cert)) as client:
                catalog = "/api/v1/runs/catalog"
                assert client.get(catalog).status_code == 401
                assert client.get("/health").status_code == 404
                assert client.get("/api/logs").status_code == 404
                auth = {"Authorization": "Bearer " + operator}
                assert client.get(catalog, headers=auth).is_success
                compose("stop", "bifrost")
                run = client.post("/api/v1/runs", headers=auth, json={
                    "agents": ["python"], "model_mode": "scripted", "capture_mode": "full",
                    "scenarios": ["baseline", "first_search_503"],
                }).raise_for_status().json()
                path = "/api/v1/runs/" + run["id"]
                for _ in range(50):
                    result = client.get(path, headers=auth).raise_for_status().json()
                    if result["status"] == "completed":
                        break
                    time.sleep(0.5)
                else:
                    raise AssertionError("Worker did not complete while Bifrost was stopped.")
                assert len(result["attempts"]) == 2
                assert all(attempt["success"] for attempt in result["attempts"])
                capture = path + "/attempts/" + result["attempts"][0]["id"] + "/recording"
                assert client.get(capture, headers=auth).raise_for_status().json()["complete"]
                report = client.post(path + "/compare", headers=auth, json={"replay": True}).raise_for_status().json()
                assert report["classifications"] == []
            compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "240")
            compose("exec", "-T", "benchify-api", "python", "-c", PROBE)
            compose("ps")
            ids = compose("ps", "-q", "benchify-api", "bifrost", "reverse-proxy", capture=True).stdout.split()
            subprocess.run(["docker", "stats", "--no-stream", "--format", "{{.Name}} {{.MemUsage}}", *ids], check=True)
            print(test_platform, "Compose passed private inference, TLS, durable queue, recording and replay.", flush=True)
        except Exception:
            compose("logs", "--tail", "20")
            raise
        finally:
            compose("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    main()
