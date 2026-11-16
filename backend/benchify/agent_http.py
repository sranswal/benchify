"""Outbound policy for operator-registered HTTP agents."""
import asyncio
import ipaddress
import json
import os
import socket

import httpx

MAX_AGENT_RESPONSE = 256 * 1024
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
TRANSITION_RANGES = tuple(ipaddress.ip_network(network) for network in (
    "64:ff9b::/96", "64:ff9b:1::/48", "2001::/32", "2002::/16",
))


class AgentPolicyError(ValueError):
    pass


def local_agents_enabled():
    return os.getenv("BENCHIFY_ENV") == "development" and os.getenv("BENCHIFY_ALLOW_LOCAL_AGENTS") == "1"


def origin(url):
    return url.scheme, url.host, url.port or (443 if url.scheme == "https" else 80)


def allowed_origins():
    origins = set()
    for value in os.getenv("BENCHIFY_AGENT_ALLOWED_ORIGINS", "").split(","):
        if not value.strip():
            continue
        url = httpx.URL(value.strip())
        if (url.scheme != "https" or not url.host or url.raw_path != b"/"
                or url.userinfo or url.fragment):
            raise AgentPolicyError("Agent allowlist entries must be exact HTTPS origins.")
        origins.add(origin(url))
    return origins


def validate_target(endpoint):
    url = httpx.URL(str(endpoint))
    if (url.scheme not in {"http", "https"} or not url.host or url.userinfo
            or url.query or url.fragment or "%" in url.host or url.host.endswith(".")):
        raise AgentPolicyError("Agent endpoint is not a supported HTTP URL.")
    if url.host in LOOPBACK_HOSTS and local_agents_enabled():
        return url, True
    if url.scheme != "https" or origin(url) not in allowed_origins():
        raise AgentPolicyError("Agent endpoint must match an explicitly allowed HTTPS origin.")
    return url, False


def validate_callback_origin():
    configured = os.getenv("BENCHIFY_FIXTURE_ORIGIN")
    url = httpx.URL(configured or "http://127.0.0.1:8000")
    production = os.getenv("BENCHIFY_ENV") == "production"
    if (url.scheme not in {"http", "https"} or not url.host or url.raw_path != b"/"
            or url.userinfo or url.fragment or (production and (not configured or url.scheme != "https"))):
        raise AgentPolicyError("Configure a valid fixture origin. Production HTTP agents require HTTPS.")
    return str(url).rstrip("/")


def safe_address(address, *, local):
    ip = ipaddress.ip_address(address)
    if local:
        return ip.is_loopback
    if isinstance(ip, ipaddress.IPv6Address) and (
        ip.ipv4_mapped is not None or ip.is_site_local or any(ip in network for network in TRANSITION_RANGES)
    ):
        return False
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local)


async def pinned_address(url, local):
    try:
        async with asyncio.timeout(5):
            results = await asyncio.get_running_loop().getaddrinfo(
                url.host, origin(url)[2], family=socket.AF_UNSPEC, type=socket.SOCK_STREAM,
            )
    except (OSError, TimeoutError) as exc:
        raise AgentPolicyError("Agent DNS lookup failed or timed out.") from exc
    addresses = list(dict.fromkeys(result[4][0] for result in results))
    if not addresses or any(not safe_address(address, local=local) for address in addresses):
        raise AgentPolicyError("Agent DNS resolved to a blocked network address.")
    return addresses[0]


async def execute_agent(endpoint, headers, payload):
    url, local = validate_target(endpoint)
    address = await pinned_address(url, local)
    # The pool is scoped to this request. TLS validates the configured DNS name
    # while the connection target is the validated numeric address.
    async with httpx.AsyncClient(timeout=25, follow_redirects=False, trust_env=False) as client:
        async with client.stream(
            "POST", url.copy_with(host=address),
            headers={**headers, "Host": url.netloc.decode("ascii"), "Accept-Encoding": "identity"},
            extensions={"sni_hostname": url.host}, json=payload,
        ) as response:
            response.raise_for_status()
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise AgentPolicyError("Compressed agent responses are unsupported.")
            body = bytearray()
            async for chunk in response.aiter_bytes(chunk_size=65536):
                body.extend(chunk)
                if len(body) > MAX_AGENT_RESPONSE:
                    raise AgentPolicyError("Agent response exceeds the size limit.")
            return json.loads(body)
