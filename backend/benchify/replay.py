"""Versioned workflow recordings. Playback uses only validated typed values."""
import asyncio
import hashlib
import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from time import perf_counter
from typing import Literal
from uuid import UUID, uuid4

from fastapi.encoders import jsonable_encoder
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError, model_validator

from .providers import Evidence, ProviderError
from .workflows import Answer, Meeting, briefing, verify_answer

CaptureMode = Literal["off", "full"]
MAX_RECORDING_BYTES = 192 * 1024
MAX_CALLS = 32
WORKFLOW_REVISION = "research-v1"
SECRET_PATTERN = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|"
    r"\b(?:sk-(?:proj-|bf-)?|tvly-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{8,}|"
    r"(?i:postgres(?:ql)?://[^\s/]+:[^\s/]+@|https?://[^\s/]+@|"
    r"[?&](?:token|api[_-]?key|access_token|password|signature|x-amz-signature|x-amz-credential|sig|code|secret|credentials)=)"
)
TRACE_FIELDS = {
    "operation", "timestamp", "offset_ms", "elapsed_ms", "status", "status_code", "injected",
    "service", "workflow_id", "operation_id", "client_request_id", "request_id", "attempt",
    "requested_model", "requested_provider", "model", "provider", "response_format", "max_completion_tokens", "retry", "input_tokens", "output_tokens", "search_credits",
    "cost_usd", "failure", "failure_category", "retryable", "retry_delay_ms", "provenance",
}


class ReplayError(ValueError):
    pass


class RecordedCancellation(asyncio.CancelledError):
    pass


class Call(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: Literal["search", "model"]
    request_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    name: str = Field(max_length=100)
    source: Literal["fixture", "Tavily", "Bifrost", "scripted"]
    invoked_at: AwareDatetime
    settled_at: AwareDatetime
    start: int = Field(ge=0, lt=2 * MAX_CALLS)
    finish: int = Field(ge=1, lt=2 * MAX_CALLS)
    outcome: Literal["returned", "failed", "cancelled"]
    value: dict | list | None = None
    error: str | None = Field(default=None, max_length=600)
    retryable: bool = False
    window: tuple[date, date] | None = None

    @model_validator(mode="after")
    def validate_outcome(self):
        if self.start >= self.finish or self.invoked_at > self.settled_at:
            raise ValueError("Invalid call chronology.")
        if self.outcome == "returned" and not isinstance(
            self.value, list if self.operation == "search" else dict
        ):
            raise ValueError("Invalid recorded result.")
        if self.outcome != "returned" and self.value is not None:
            raise ValueError("Invalid value on failed call.")
        if self.outcome == "failed" and not self.error:
            raise ValueError("Missing provider failure.")
        return self


class VerificationDecision(BaseModel):
    claim: str
    status: str
    as_of: date
    evidence_urls: list[str]


class Recording(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    complete: Literal[True] = True
    workflow_revision: Literal["research-v1"] = WORKFLOW_REVISION
    id: UUID
    captured_at: AwareDatetime
    expires_at: AwareDatetime
    workflow: Literal["briefing", "verify"]
    as_of: date
    input: Meeting | Answer
    calls: list[Call] = Field(max_length=MAX_CALLS)
    trace: list[dict] = Field(max_length=2 * MAX_CALLS)
    trace_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    verification: list[VerificationDecision] = Field(max_length=4)
    terminal: Literal["success", "provider_error", "deadline"]
    result_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    error: str | None = Field(default=None, max_length=600)
    benchmark: dict | None = None

    @model_validator(mode="after")
    def validate_recording(self):
        positions = sorted(position for call in self.calls for position in (call.start, call.finish))
        if positions != list(range(len(positions))) or self.expires_at <= self.captured_at:
            raise ValueError("Invalid capture sequence or expiry.")
        if (self.workflow == "briefing") != isinstance(self.input, Meeting):
            raise ValueError("Workflow input does not match.")
        if self.terminal == "success" and not self.result_sha256:
            raise ValueError("Missing workflow result fingerprint.")
        return self


def now():
    return datetime.now(timezone.utc)


def workflow_date(payload):
    return datetime.now(payload.meeting_at.tzinfo).date() if isinstance(payload, Meeting) else now().date()


def encode(value):
    return json.dumps(jsonable_encoder(value), sort_keys=True, separators=(",", ":"), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


def recorded_trace(events):
    return [
        {key: value for key, value in event.items()
         if key in TRACE_FIELDS and (value is None or type(value) in (str, bool, int, float))}
        for event in events
    ]


def verification_decisions(output):
    return [
        VerificationDecision(
            claim=item["claim"]["statement"], status=item["status"], as_of=item["freshness_as_of"],
            evidence_urls=[str(evidence["url"]) for evidence in item["evidence"]],
        )
        for item in output.get("verification", [])
    ]


def retention_days():
    try:
        days = int(os.getenv("BENCHIFY_CAPTURE_RETENTION_DAYS", "7"))
    except ValueError as exc:
        raise ReplayError("Capture retention must be an integer from 1 to 30 days.") from exc
    if not 1 <= days <= 30:
        raise ReplayError("Capture retention must be an integer from 1 to 30 days.")
    return days


def ensure_safe(encoded):
    secrets = [value for key, value in os.environ.items() if len(value) >= 8 and (
        key in {"DATABASE_URL", "BIFROST_VIRTUAL_KEY", "TAVILY_API_KEY", "BENCHIFY_OPERATOR_TOKEN"} or key.startswith("BENCHIFY_AGENT_")
    )]
    if SECRET_PATTERN.search(encoded) or any(
        json.dumps(secret, ensure_ascii=True)[1:-1] in encoded for secret in secrets
    ):
        raise ReplayError("Capture omitted because it may contain credentials.")
    if len(encoded.encode()) > MAX_RECORDING_BYTES:
        raise ReplayError("Capture omitted because it exceeds the recording size limit.")


class CaptureProviders:
    def __init__(self, providers, *, search_source, model_source):
        self.providers = providers
        self.search_source = search_source
        self.model_source = model_source
        self.calls = []
        self.position = 0

    def tick(self):
        position = self.position
        self.position += 1
        return position

    async def call(self, operation, name, source, request, invoke, window=None):
        record = {
            "start": self.tick(), "invoked_at": now(), "operation": operation, "name": name,
            "source": source, "request_sha256": fingerprint(request), "window": window,
        }
        self.calls.append(record)
        try:
            value = await invoke()
            record.update(outcome="returned", value=jsonable_encoder(value))
            return value
        except ProviderError as exc:
            record.update(outcome="failed", error=str(exc), retryable=exc.retryable)
            raise
        except asyncio.CancelledError:
            record.update(outcome="cancelled")
            raise
        finally:
            record.update(finish=self.tick(), settled_at=now())

    async def search(self, query, window=None):
        return await self.call(
            "search", "evidence", self.search_source, [query, window],
            lambda: self.providers.search(query, window), window,
        )

    async def model(self, instructions, payload, schema):
        return await self.call(
            "model", schema.__name__, self.model_source, [instructions, payload, schema.model_json_schema()],
            lambda: self.providers.model(instructions, payload, schema),
        )

    def finish(self, payload, as_of, result, trace, *, terminal="success", error=None, benchmark=None, capture_id=None):
        captured = now()
        try:
            if len(self.calls) > MAX_CALLS or len(trace) > 2 * MAX_CALLS:
                raise ReplayError("Capture omitted because it exceeds the call limit.")
            sanitized_trace = recorded_trace(trace)
            recording = Recording(
                id=capture_id or uuid4(), captured_at=captured, expires_at=captured + timedelta(days=retention_days()),
                workflow="briefing" if isinstance(payload, Meeting) else "verify",
                input=payload, as_of=as_of, calls=self.calls, terminal=terminal, error=error, benchmark=benchmark,
                result_sha256=fingerprint(result) if terminal == "success" else None,
                trace=sanitized_trace, trace_sha256=fingerprint(sanitized_trace),
                verification=verification_decisions(jsonable_encoder(result)) if terminal == "success" else [],
            )
            data = recording.model_dump(mode="json")
            ensure_safe(encode(data))
        except (TypeError, ValueError, RecursionError) as exc:
            return {"capture_status": "rejected",
                    "capture_error": str(exc) if isinstance(exc, ReplayError) else "Capture is incomplete or oversized."}
        return {"capture_status": "complete", "recording": data}


class ReplayProviders:
    def __init__(self, calls):
        self.steps = {index: (call, kind) for call in calls for index, kind in (
            (call.start, "start"), (call.finish, "finish")
        )}
        self.position = 0
        self.condition = asyncio.Condition()

    def advance(self):
        self.position += 1
        self.condition.notify_all()

    async def call(self, kind, name, request):
        request_hash = fingerprint(request)

        def eligible():
            step = self.steps.get(self.position)
            return step is None or (step[1] == "start" and (
                step[0].operation, step[0].name, step[0].request_sha256
            ) == (kind, name, request_hash))

        async with self.condition:
            if not any(call.start >= self.position and (
                call.operation, call.name, call.request_sha256
            ) == (kind, name, request_hash) for call, step in self.steps.values() if step == "start"):
                raise ReplayError(f"No compatible recorded call for {kind} {name}.")
            await self.condition.wait_for(eligible)
            step = self.steps.get(self.position)
            if step is None:
                raise ReplayError(f"Missing recorded call for {kind} {name}.")
            call = step[0]
            self.advance()
            try:
                await self.condition.wait_for(lambda: self.position >= call.finish)
            except asyncio.CancelledError:
                if call.outcome == "cancelled":
                    await self.condition.wait_for(lambda: self.position >= call.finish)
                    self.advance()
                raise
            self.advance()

        if call.outcome == "failed":
            raise ProviderError(call.error, retryable=call.retryable)
        if call.outcome == "cancelled":
            raise RecordedCancellation
        return call.value

    async def search(self, query, window=None):
        values = await self.call("search", "evidence", [query, window])
        return [Evidence.model_validate(value) for value in values]

    async def model(self, instructions, payload, schema):
        result = await self.call("model", schema.__name__, [instructions, payload, schema.model_json_schema()])
        return schema.model_validate(result)


def first_error(group):
    error = group
    while isinstance(error, BaseExceptionGroup):
        error = error.exceptions[0]
    return error


async def replay_recording(data):
    try:
        ensure_safe(encode(data))
        recording = Recording.model_validate(data)
    except (TypeError, ValueError, RecursionError) as exc:
        raise ReplayError("Recording is invalid, sensitive, oversized or incompatible.") from exc
    if (recorded_trace(recording.trace) != recording.trace
            or fingerprint(recording.trace) != recording.trace_sha256):
        raise ReplayError("Recorded trace fields or fingerprint are incompatible.")
    if recording.expires_at <= now():
        raise ReplayError("Recording has expired.")
    providers = ReplayProviders(recording.calls)
    started = perf_counter()
    workflow = briefing if recording.workflow == "briefing" else verify_answer
    output, error, terminal = None, None, "success"
    try:
        async with asyncio.timeout(2):
            output = jsonable_encoder(await workflow(recording.input, providers, today=recording.as_of))
    except* ProviderError as exc:
        terminal, error = "provider_error", str(first_error(exc))
    except* (ReplayError, ValidationError, TimeoutError) as exc:
        raise ReplayError("Recording does not match workflow execution or call order.") from exc
    except* RecordedCancellation:
        if recording.terminal != "deadline":
            raise ReplayError("Unexpected cancellation in recording.")
    observed_cancellation = any(call.outcome == "cancelled" for call in recording.calls)
    if recording.terminal == "deadline" and observed_cancellation and providers.position == len(providers.steps):
        output, error, terminal = None, recording.error, "deadline"
    if providers.position != len(providers.steps) or terminal != recording.terminal:
        raise ReplayError("Recording has unused calls or a different terminal outcome.")
    if terminal == "provider_error" and error != recording.error:
        raise ReplayError("Recorded provider error differs from the replayed failure.")
    if terminal == "success" and (
        fingerprint(output) != recording.result_sha256 or verification_decisions(output) != recording.verification
    ):
        raise ReplayError("Replay output differs from the recorded workflow result.")
    effective_as_of = (
        min(recording.as_of, recording.input.meeting_at.date())
        if isinstance(recording.input, Meeting) else recording.as_of
    )
    return {
        "mode": "replay", "recording_id": str(recording.id), "workflow": recording.workflow,
        "workflow_revision": recording.workflow_revision, "captured_at": recording.captured_at.isoformat(),
        "as_of": effective_as_of.isoformat(), "recorded_clock_date": recording.as_of.isoformat(),
        "replayed_at": now().isoformat(),
        "replay_elapsed_ms": round((perf_counter() - started) * 1000, 2),
        "outcome": terminal, "output": output, "error": error, "events": recording.trace,
        "calls_consumed": providers.position // 2,
    }


if __name__ == "__main__":
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Replay a Benchify recording offline.")
    parser.add_argument("recording", type=Path)
    args = parser.parse_args()
    try:
        with args.recording.open("rb") as stream:
            body = stream.read(MAX_RECORDING_BYTES + 1)
        if len(body) > MAX_RECORDING_BYTES:
            raise ReplayError("Recording exceeds the size limit.")
        result = asyncio.run(replay_recording(json.loads(body)))
    except (OSError, ValueError, RecursionError) as exc:
        parser.exit(1, f"{exc}\n")
    print(json.dumps(result, indent=2))
