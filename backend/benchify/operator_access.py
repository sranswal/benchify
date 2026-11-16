"""Shared-operator access for private deployments."""
import os
import re
from hmac import compare_digest
from ipaddress import ip_address

from fastapi.responses import JSONResponse

TOKEN = re.compile(r"[A-Za-z0-9_-]{32,128}")
CALLBACK = re.compile(r"/api/v1/fixture/[0-9a-f-]{36}/search")


def operator_token():
    mode = os.getenv("BENCHIFY_ENV", "development")
    token = os.getenv("BENCHIFY_OPERATOR_TOKEN", "")
    if mode not in {"development", "production"}:
        raise ValueError("BENCHIFY_ENV must be development or production.")
    if (token or mode == "production") and not TOKEN.fullmatch(token):
        raise ValueError("Set BENCHIFY_OPERATOR_TOKEN to a URL-safe 32–128 character token.")
    return token


def is_loopback(peer):
    try:
        return ip_address(peer).is_loopback
    except ValueError:
        return False


async def protect_operator(request, call_next):
    path = request.url.path
    public = request.method == "GET" and path in {"/health", "/ready"}
    capability = request.method == "POST" and CALLBACK.fullmatch(path)
    try:
        token = operator_token()
    except ValueError:
        return JSONResponse({"detail": "Operator access is misconfigured."}, status_code=503)
    if token and not (public or capability):
        supplied = request.headers.get("Authorization", "").encode()
        if not compare_digest(supplied, ("Bearer " + token).encode()):
            return JSONResponse({"detail": "Operator authentication required."}, status_code=401,
                                headers={"WWW-Authenticate": "Bearer", "Cache-Control": "no-store"})
    if not token and not (public or capability) and (
        request.client is None or not is_loopback(request.client.host)
    ):
        return JSONResponse({"detail": "Unauthenticated access is limited to local development."},
                            status_code=403, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    if path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response
