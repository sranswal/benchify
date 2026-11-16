import asyncio
import hashlib
import os
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Literal
from time import perf_counter
from uuid import uuid4

import httpx
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, field_validator, model_validator

from .agent_http import AgentPolicyError, execute_agent, validate_callback_origin
from .agent_registry import AgentId, registry
from .providers import Evidence, ProviderError, Providers
from .replay import WORKFLOW_REVISION, CaptureMode, CaptureProviders, fingerprint, workflow_date
from .workflows import Draft, ExcerptCheck, Judgment, Meeting, briefing

DEFAULT_FIXTURE = "meeting-research-v1"
ACTIVE_SEARCHES = {}
DEFAULT_AGENTS = ("python", "http")
RUBRIC_REVISION = "meeting-v2"
SCENARIOS = ("baseline", "first_search_503", "first_search_429")
FAULT_STATUS = {"first_search_503": 503, "first_search_429": 429}


class ExpectedFinding(BaseModel):
    statement: str = Field(min_length=16, max_length=1800)
    development_date: date
    query: str = Field(min_length=1, max_length=400)


class TaskFixture(BaseModel):
    revision: str = Field(pattern=r"^[a-z][a-z0-9-]{0,79}$")
    kind: Literal["synthetic", "recorded"] = "synthetic"
    meeting: Meeting
    window: tuple[date, date]
    expected: ExpectedFinding
    sources: list[Evidence] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def validate_rubric_inputs(self):
        meeting_date = self.meeting.meeting_at.date()
        if self.window != (meeting_date - timedelta(days=30), meeting_date):
            raise ValueError("The fixture window must cover the 30 days leading up to the meeting.")
        start, end = self.window
        if not start <= self.expected.development_date <= end:
            raise ValueError("The expected development date must be inside the window.")
        primary = [source for source in self.sources if source.primary]
        if (len(primary) != 1 or primary[0].content != self.expected.statement
                or primary[0].published_date is None or not start <= primary[0].published_date <= end):
            raise ValueError("Provide one dated primary source with the exact expected sentence as its content.")
        return self


@lru_cache(maxsize=1)
def fixtures():
    paths = [Path(__file__).with_name(name) for name in ("meeting-fixture.json", "meeting-fixture-northwind.json")]
    if directory := os.getenv("BENCHIFY_FIXTURE_DIRECTORY"):
        folder = Path(directory)
        if not folder.is_dir():
            raise ValueError("BENCHIFY_FIXTURE_DIRECTORY must be an existing directory.")
        paths.extend(sorted(folder.glob("*.json")))
    catalog = {}
    for path in paths:
        content = path.read_bytes()
        task = TaskFixture.model_validate_json(content)
        if task.revision in catalog:
            raise ValueError(f"Duplicate fixture revision: {task.revision}")
        catalog[task.revision] = (task.model_dump(mode="json"), hashlib.sha256(content).hexdigest())
    return catalog


class RunRequest(BaseModel):
    capture_mode: CaptureMode = "off"
    repetitions: int = Field(default=1, ge=1, le=5)
    model_mode: Literal["live", "scripted"] | None = None
    fixture_revision: str = DEFAULT_FIXTURE
    agents: list[AgentId] = Field(default_factory=lambda: [agent for agent in DEFAULT_AGENTS if agent in registry()], min_length=1, max_length=5)
    scenarios: list[Literal["baseline", "first_search_503", "first_search_429"]] = Field(
        default_factory=lambda: list(SCENARIOS[:2]), min_length=1, max_length=3,
    )

    @model_validator(mode="after")
    def capture_supported(self):
        if self.capture_mode == "full" and self.agents != ["python"]:
            raise ValueError("Evidence capture currently supports Python-only runs.")
        return self

    @field_validator("agents", "scenarios")
    @classmethod
    def unique_choices(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("Select each agent and scenario at most once.")
        return values

    @field_validator("agents")
    @classmethod
    def registered_agents(cls, values):
        if any(agent not in registry() for agent in values):
            raise ValueError("Select registered agents.")
        return values

    @field_validator("fixture_revision")
    @classmethod
    def existing_fixture(cls, value):
        if value not in fixtures():
            raise ValueError("Select an available task revision.")
        return value


class FixtureSearch:
    def __init__(self, scenario, task):
        self.task = task
        self.fault_status = FAULT_STATUS.get(scenario)
        self.started = perf_counter()
        self.events = []
        self.searches = 0

    def record(self, operation, started, outcome, **details):
        self.events.append({
            "operation": operation,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "offset_ms": round((started - self.started) * 1000, 2),
            "elapsed_ms": round((perf_counter() - started) * 1000, 2),
            **details,
            "status": outcome,
        })

    def search(self, query):
        started = perf_counter()
        self.searches += 1
        fault = self.fault_status is not None and self.searches == 1
        self.record("search", started, "failed" if fault else "ok",
                    status_code=self.fault_status if fault else 200, injected=fault, query=query,
                    retry=self.fault_status is not None and self.searches == 2)
        if fault:
            raise ProviderError(f"Fixture search returned HTTP {self.fault_status}.", retryable=True)
        return self.task["sources"]


class FixtureProviders(Providers):
    def __init__(self, search, client, attempt_id, model_mode):
        super().__init__(client, attempt_id)
        self.fixture = search
        self.use_live_model = model_mode == "live"

    async def search(self, query, window=None):
        evidence = [Evidence.model_validate(item) for item in self.fixture.search(query)]
        return sorted(evidence, key=lambda item: item.primary, reverse=True)

    async def model(self, instructions, payload, schema):
        started = perf_counter()
        if self.use_live_model:
            provider = Providers(self.client, self.workflow_id)
            if schema is Draft:
                instructions += " Include the exact supporting sentence in original_span."
            try:
                result = await provider.model(instructions, payload, schema)
            except (ProviderError, asyncio.CancelledError) as exc:
                message = str(exc) if isinstance(exc, ProviderError) else "The attempt deadline expired."
                self.record_model_events(provider)
                if not provider.events or provider.events[-1].get("status") != "failed":
                    self.fixture.record("model_result", started, "failed", error=message)
                raise
            self.record_model_events(provider)
            return result

        expected = self.fixture.task["expected"]
        quote = expected["statement"]
        if schema is Draft:
            result = Draft.model_validate({
                "findings": [{**expected, "original_span": quote,
                              "category": "announcement", "time_sensitive": True}],
                "questions": ["What would we need to validate before adoption?"],
            })
        elif schema is Judgment:
            source = next(item for item in payload["sources"] if item["primary"])
            result = Judgment(status="supported", explanation="The release notes confirm the launch.",
                              citations=[{"id": source["id"], "quote": quote}])
        elif schema is ExcerptCheck:
            result = ExcerptCheck(supported=payload["quote"] == quote,
                                  date_supported=payload["development_date"] == expected["development_date"])
        else:
            raise ProviderError("No scripted response exists for this model step.")
        self.fixture.record("model", started, "ok", provenance="scripted fixture response",
                            input_tokens=0, output_tokens=0)
        return result

    def record_model_events(self, provider):
        for started, event in zip(provider.event_starts, provider.events, strict=True):
            details = {key: value for key, value in event.items() if key not in {"status", "elapsed_ms"}}
            self.fixture.record("model", started, event["status"], **details)
            self.fixture.events[-1]["elapsed_ms"] = event["elapsed_ms"]


def score(output, agent, rubric_revision, task):
    expected = task["expected"]
    primary = next(item for item in task["sources"] if item["primary"])
    findings = output.get("findings", [])
    questions = output.get("questions", [])
    if not isinstance(findings, list) or len(findings) != 1 or not isinstance(questions, list):
        return False
    finding = findings[0]
    if not isinstance(finding, dict) or not isinstance(finding.get("claim"), dict):
        return False
    claim = finding["claim"]
    statement = claim.get("statement")
    canonical = statement == expected["statement"]
    verified_paraphrase = (
        rubric_revision == RUBRIC_REVISION
        and agent == "python"
        and isinstance(statement, str)
        and bool(statement.strip())
        and claim.get("original_span") == expected["statement"]
        and finding.get("evaluated_by") == "bifrost_model"
    )
    evidence = finding.get("evidence")
    return (
        (canonical or verified_paraphrase)
        and claim.get("development_date") == expected["development_date"]
        and finding.get("status") == "supported"
        and isinstance(evidence, list)
        and any(isinstance(item, dict) and item.get("url") == primary["url"]
                and item.get("quote") == primary["content"] for item in evidence)
        and bool(questions) and all(isinstance(question, str) and question.strip() for question in questions)
    )


def total(events, key):
    values = [event[key] for event in events if event.get(key) is not None]
    return sum(values) if values else None


async def attempt(client, agent, scenario, repetition, run):
    task, _ = fixtures()[run["fixture_revision"]]
    model_mode = run["model_mode"]
    attempt_id = str(uuid4())
    callback_id = str(uuid4())
    fixture = FixtureSearch(scenario, task)
    output, error, terminal = {}, None, "success"
    capture = None
    started_at = datetime.now(timezone.utc).isoformat()
    try:
        live_python = agent == "python" and model_mode == "live"
        async with asyncio.timeout(85 if live_python else 30):
            meeting = Meeting.model_validate(task["meeting"])
            if agent == "python":
                providers = FixtureProviders(fixture, client, attempt_id, model_mode)
                as_of = workflow_date(meeting)
                if run.get("capture_mode") == "full":
                    capture = CaptureProviders(
                        providers, search_source="fixture", model_source="Bifrost" if live_python else "scripted",
                    )
                output = jsonable_encoder(await briefing(meeting, capture or providers, today=as_of))
            else:
                ACTIVE_SEARCHES[callback_id] = fixture
                adapter = registry()[agent]
                origin = validate_callback_origin()
                started = perf_counter()
                try:
                    headers = {}
                    if adapter.bearer_env:
                        headers["Authorization"] = f"Bearer {os.environ[adapter.bearer_env]}"
                    output = await execute_agent(adapter.endpoint, headers, {
                        "meeting": task["meeting"], "window": task["window"],
                        "search_url": f"{origin}/api/v1/fixture/{callback_id}/search",
                    })
                    if not isinstance(output, dict):
                        output = {}
                        raise ValueError("Invalid agent response.")
                except AgentPolicyError as exc:
                    fixture.record("http_agent", started, "failed", failure_category="outbound_policy")
                    raise ProviderError(str(exc)) from exc
                except httpx.HTTPStatusError as exc:
                    fixture.record("http_agent", started, "failed", status_code=exc.response.status_code)
                    raise
                except (httpx.HTTPError, ValueError, asyncio.CancelledError):
                    fixture.record("http_agent", started, "failed")
                    raise
                usage = output.pop("usage", None)
                metrics = {}
                if isinstance(usage, dict):
                    for key in ("input_tokens", "output_tokens"):
                        value = usage.get(key)
                        if type(value) is int and value >= 0:
                            metrics[key] = value
                    cost = usage.get("cost_usd")
                    if type(cost) in (float, int) and 0 <= cost < float("inf"):
                        metrics["cost_usd"] = cost
                fixture.record("http_agent", started, "ok", provenance="agent response", **metrics)
    except* ProviderError as errors:
        cause = errors
        while isinstance(cause, BaseExceptionGroup):
            cause = cause.exceptions[0]
        terminal, error = "provider_error", str(cause)
    except* TimeoutError:
        terminal, error = "deadline", "The benchmark attempt exceeded its deadline."
    except* (httpx.HTTPError, ValueError):
        error = "The HTTP agent did not return a successful, valid response."
    finally:
        ACTIVE_SEARCHES.pop(callback_id, None)
    finished_at = datetime.now(timezone.utc).isoformat()
    latency = round((perf_counter() - fixture.started) * 1000, 2)
    injected = any(event.get("injected") for event in fixture.events)
    searched = any(event["operation"] == "search" and event["status"] == "ok" for event in fixture.events)
    success = (
        error is None and searched and (fixture.fault_status is None or injected)
        and score(output, agent, run["rubric_revision"], task)
    )
    events = sorted(fixture.events, key=lambda event: event["offset_ms"])
    capture_fields = {}
    if capture is not None:
        capture_fields = capture.finish(
            meeting, as_of, output, events, terminal=terminal, error=error,
            benchmark={
                "run_id": run["id"], "attempt_id": attempt_id, "agent": agent, "scenario": scenario,
                "repetition": repetition, "agent_config": {
                    "name": run.get("agent_names", {}).get(agent), "revision": run["agent_revisions"][agent],
                    "adapter": "native-python",
                },
                "fixture_revision": run["fixture_revision"], "fixture_sha256": run["fixture_sha256"],
                "dataset_kind": run.get("dataset_kind"), "rubric_revision": run["rubric_revision"],
                "task": task, "task_sha256": fingerprint(task), "model_mode": model_mode,
                "model_name": run.get("model_name"),
                "expected_success": success,
            },
        )
    return {
        "id": attempt_id, "agent": agent, "scenario": scenario, "repetition": repetition,
        "started_at": started_at, "finished_at": finished_at, "success": success, "fault_injected": injected,
        "recovered": success if injected else None,
        "latency_ms": latency, "tool_calls": fixture.searches,
        "input_tokens": total(fixture.events, "input_tokens"),
        "output_tokens": total(fixture.events, "output_tokens"),
        "cost_usd": total(fixture.events, "cost_usd"),
        "search_credits": total(fixture.events, "search_credits"),
        "error": error or (None if success else "Output did not pass the fixture rubric."),
        "output": output, "events": events, **capture_fields,
    }


def new_run(request: RunRequest):
    task, digest = fixtures()[request.fixture_revision]
    agents = registry()
    model_mode = request.model_mode or (
        "scripted" if os.getenv("BENCHIFY_BENCHMARK_MODEL") == "scripted" else "live"
    )
    return {
        "id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(),
        "fixture_revision": request.fixture_revision, "fixture_sha256": digest,
        "dataset_kind": task["kind"],
        "rubric_revision": RUBRIC_REVISION,
        "verification_revision": WORKFLOW_REVISION,
        "agent_revisions": {agent: agents[agent].revision for agent in request.agents},
        "agent_names": {agent: agents[agent].name for agent in request.agents},
        "capture_mode": request.capture_mode,
        "model_mode": model_mode,
        "model_name": os.getenv("BIFROST_MODEL") if model_mode == "live" and "python" in request.agents else None,
        "meeting": task["meeting"], "repetitions": request.repetitions,
        "agents": request.agents, "scenarios": request.scenarios, "attempts": [],
    }


def attempt_plan(run):
    return [
        (agent, scenario, repetition)
        for repetition in range(1, run["repetitions"] + 1)
        for scenario in run.get("scenarios", SCENARIOS[:2])
        for agent in run.get("agents", DEFAULT_AGENTS)
    ]


async def run_benchmark(request: RunRequest):
    run = new_run(request)
    async with httpx.AsyncClient(timeout=40, trust_env=False) as client:
        for agent, scenario, repetition in attempt_plan(run):
            result = await attempt(client, agent, scenario, repetition, run)
            run["attempts"].append(result)
    return run
