import asyncio
import re
from calendar import month_name
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field, StringConstraints

from .providers import Evidence, ProviderError, Providers, source_data

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]
Category = Literal["pricing", "software_version", "api_docs", "leadership", "announcement", "regulation", "event", "other"]
Status = Literal["supported", "outdated", "contradicted", "unverified", "insufficient_evidence"]


class Meeting(BaseModel):
    subject: ShortText
    meeting_at: AwareDatetime
    purpose: Annotated[str, StringConstraints(max_length=500)] = ""
    context: Annotated[str, StringConstraints(max_length=1500)] = ""


class Answer(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class Claim(BaseModel):
    original_span: ShortText
    statement: ShortText
    category: Category
    time_sensitive: bool
    query: ShortText


class ClaimList(BaseModel):
    claims: list[Claim] = Field(max_length=4)


class Finding(Claim):
    development_date: date


class Draft(BaseModel):
    findings: list[Finding] = Field(max_length=3)
    questions: list[ShortText] = Field(min_length=1, max_length=3)


class Citation(BaseModel):
    id: int = Field(ge=0)
    quote: ShortText


class Judgment(BaseModel):
    status: Status
    explanation: ShortText
    correction: ShortText | None = None
    citations: list[Citation] = Field(max_length=3)


class ExcerptCheck(BaseModel):
    supported: bool
    date_supported: bool


def excerpt_contains_date(quote: str, expected: date) -> bool:
    month = month_name[expected.month]
    day = rf"0?{expected.day}"
    patterns = (
        re.escape(expected.isoformat()),
        rf"(?:{month}|{month[:3]}\.?)\s+{day}(?:st|nd|rd|th)?[,]?\s+{expected.year}",
        rf"{day}(?:st|nd|rd|th)?\s+(?:{month}|{month[:3]}\.?)\s+{expected.year}",
    )
    return any(re.search(rf"(?<!\w)(?:{pattern})(?!\w)", quote, re.IGNORECASE) for pattern in patterns)


async def verify_claim(
    claim: Claim, providers: Providers, as_of: date, window: tuple[date, date] | None = None,
    *, discovery_sources: list[Evidence] | None = None,
) -> dict:
    query = claim.query
    if isinstance(claim, Finding):
        query = f"{claim.development_date.isoformat()} {query}"[:400]
    retrieved = await providers.search(query, window)
    candidates = [*(discovery_sources or []), *retrieved]
    sources = list({
        (str(source.url), source.content): source for source in candidates
        if source.content.strip()
        and (source.published_date is None or source.published_date <= as_of)
        and (window is None or (
            source.published_date is not None and window[0] <= source.published_date <= window[1]
        ))
    }.values())
    sources.sort(key=lambda source: source.primary, reverse=True)
    evidence = []
    explanation = "Tavily returned no eligible evidence."
    status: Status = "insufficient_evidence"
    correction = None
    if sources:
        result = await providers.model(
            "Judge the claim solely against supplied evidence as of the given date. Use outdated only when "
            "the evidence establishes both a prior state and that it changed. Use contradicted for evidence "
            "directly opposing the claim. Abstain for conflicting or partial evidence. For a development, "
            "evidence must support the event, subject and development date. Prefer primary sources when "
            "they establish the claim. For dated findings include the event date in the cited excerpt. Cite exact substrings of excerpts "
            "for conclusive judgments. Any correction must be supported by those same excerpts.",
            {"claim": claim.model_dump(mode="json"), "as_of": str(as_of), "sources": source_data(sources)},
            Judgment,
        )
        seen = set()
        invalid_citation = False
        for citation in result.citations:
            if citation.id >= len(sources) or len(citation.quote) < 16:
                invalid_citation = True
                continue
            source = sources[citation.id]
            if citation.quote not in source.content:
                invalid_citation = True
                continue
            citation_key = (str(source.url), citation.quote)
            if citation_key not in seen:
                seen.add(citation_key)
                evidence.append({**source.model_dump(mode="json"), "quote": citation.quote})
        status, explanation = result.status, result.explanation
        if status in {"supported", "outdated", "contradicted"}:
            if not evidence or invalid_citation:
                status = "insufficient_evidence"
                explanation = "The model judgment lacked valid evidence excerpts."
            elif status in {"outdated", "contradicted"}:
                correction = result.correction
        if isinstance(claim, Finding) and status == "supported":
            checked = []
            for item in sorted(evidence, key=lambda source: source["primary"], reverse=True):
                if not excerpt_contains_date(item["quote"], claim.development_date):
                    continue
                audit = await providers.model(
                    "Check whether this exact quote alone entails the complete claim and explicitly ties "
                    "the development date to the event. A publication date or a different event does not count.",
                    {"statement": claim.statement, "development_date": str(claim.development_date),
                     "quote": item["quote"]}, ExcerptCheck,
                )
                if audit.supported and audit.date_supported:
                    checked.append(item)
                    if item["primary"]:
                        break
            evidence = checked
            if not evidence:
                status = "insufficient_evidence"
                explanation = "The cited excerpts did not establish both the claim and its development date."
    dates = [date.fromisoformat(item["published_date"]) for item in evidence if item["published_date"]]
    eligible = [published for published in dates if published <= as_of]
    score = None
    if claim.time_sensitive and eligible and status in {"supported", "outdated", "contradicted"}:
        score = round(max(0, 100 * (1 - (as_of - max(eligible)).days / 90)))
    return {
        "claim": claim, "status": status, "explanation": explanation, "correction": correction,
        "evidence": evidence, "freshness_score": score, "freshness_as_of": as_of,
        "freshness_evidence_date": max(eligible) if score is not None else None,
        "evaluated_by": "bifrost_model" if sources else None,
    }


async def verify_answer(answer: Answer, providers: Providers, *, today: date | None = None) -> dict:
    extracted = await providers.model(
        "Extract up to four atomic factual claims. Prioritize time-sensitive claims, mark sensitivity, "
        "and include the exact original input span for each. Form a neutral targeted search query.",
        {"answer": answer.text}, ClaimList,
    )
    claims = {item.statement.casefold(): item for item in extracted.claims if item.original_span in answer.text}
    as_of = today or datetime.now(timezone.utc).date()
    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(verify_claim(item, providers, as_of)) for item in claims.values()]
    return {"verification": [task.result() for task in tasks], "claim_limit": 4}


async def briefing(meeting: Meeting, providers: Providers, *, today: date | None = None) -> dict:
    local_today = today or datetime.now(meeting.meeting_at.tzinfo).date()
    meeting_date = meeting.meeting_at.date()
    start, end = meeting_date - timedelta(days=30), min(meeting_date, local_today)
    if end < start:
        return {"meeting": meeting, "window": [start, end], "verification": [], "findings": [],
                "questions": [], "note": "The meeting's research window has not started."}
    query = f"{start} to {end} {meeting.subject} announcements launches leadership changes"
    try:
        sources: list[Evidence] = await providers.search(query, (start, end))
    except ProviderError as exc:
        if not exc.retryable:
            raise
        sources = await providers.search(query, (start, end))
    if not sources:
        return {"meeting": meeting, "window": [start, end], "verification": [], "findings": [],
                "questions": [], "note": "No dated sources were found in the research window."}
    draft = await providers.model(
        "Draft up to three concise atomic findings, with explicit dates of developments inside the window. "
        "Include only findings grounded in supplied excerpts and prefer primary sources when available. "
        "Suggest meeting questions without unsourced "
        "factual premises. Focus on launches, hires, leadership changes, or other significant news.",
        {"meeting": meeting.model_dump(mode="json"), "window": [str(start), str(end)],
         "sources": source_data(sources)}, Draft,
    )
    async with asyncio.TaskGroup() as group:
        tasks = [
            group.create_task(verify_claim(finding, providers, end, (start, end), discovery_sources=sources))
            for finding in draft.findings if start <= finding.development_date <= end
        ]
    checked = [task.result() for task in tasks]
    return {
        "meeting": meeting, "window": [start, end], "verification": checked,
        "findings": [report for report in checked if report["status"] == "supported"],
        "questions": draft.questions,
        **({"note": "No findings met the date and evidence requirements."}
           if not any(report["status"] == "supported" for report in checked) else {}),
    }
