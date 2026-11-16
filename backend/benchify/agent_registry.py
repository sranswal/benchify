import os
from functools import lru_cache
from typing import Annotated

from pydantic import BaseModel, Field, HttpUrl, TypeAdapter, field_validator

from .agent_http import allowed_origins, local_agents_enabled, validate_callback_origin, validate_target


class Agent(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    revision: str = Field(pattern=r"^[a-zA-Z0-9._-]{1,80}$")
    endpoint: HttpUrl | None = None
    bearer_env: str | None = Field(default=None, pattern=r"^BENCHIFY_AGENT_[A-Z0-9_]+$")

    @field_validator("endpoint")
    @classmethod
    def no_url_credentials(cls, endpoint):
        if endpoint and (endpoint.username or endpoint.password or endpoint.query or endpoint.fragment):
            raise ValueError("Agent endpoints must omit credentials, query parameters, and fragments.")
        return endpoint


AgentId = Annotated[str, Field(pattern=r"^[a-z][a-z0-9-]{0,39}$")]
registry_schema = TypeAdapter(dict[AgentId, Agent])


@lru_cache(maxsize=1)
def registry():
    allowed_origins()
    if os.getenv("BENCHIFY_ENV") == "production" and os.getenv("BENCHIFY_ALLOW_LOCAL_AGENTS") == "1":
        raise ValueError("Loopback agents cannot be enabled in production.")
    agents = {"python": Agent(name="Built-in Python", revision="briefing-v1")}
    origin = os.getenv("BENCHIFY_HTTP_AGENT_URL")
    if local_agents_enabled() or origin:
        endpoint = origin or "http://127.0.0.1:8001/execute"
        validate_target(endpoint)
        agents["http"] = Agent(name="Independent HTTP", revision="node-v1", endpoint=endpoint)
    configured = registry_schema.validate_json(os.getenv("BENCHIFY_HTTP_AGENTS", "{}"))
    for key, agent in configured.items():
        if key in {"python", "http"} or agent.endpoint is None:
            raise ValueError("Custom HTTP agents need a unique ID and an endpoint.")
        validate_target(agent.endpoint)
        if agent.bearer_env and not os.getenv(agent.bearer_env):
            raise ValueError(f"The bearer token environment variable for {key} is missing.")
        agents[key] = agent
    if len(agents) > 1:
        validate_callback_origin()
    return agents
