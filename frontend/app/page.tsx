"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import Benchmark from "./benchmark";

type Evidence = { url: string; title: string; published_date: string | null; primary?: boolean; quote: string };
type Review = {
  claim: { statement: string; original_span: string; category: string; development_date?: string };
  status: string;
  explanation: string;
  correction?: string;
  freshness_score: number | null;
  freshness_as_of: string;
  freshness_evidence_date: string | null;
  evidence: Evidence[];
};
type ProviderEvent = {
  service: string;
  elapsed_ms: number;
  status: string;
  status_code?: number;
  failure_category?: string;
  client_request_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
};
type Activity = { workflow_id: string; events: ProviderEvent[] };
type Result = Activity & {
  mode: string;
  verification: Review[];
  findings?: Review[];
  questions?: string[];
  meeting?: { subject: string; meeting_at: string; purpose: string };
  window?: [string, string];
  note?: string;
};

function ReviewCard({ item }: { item: Review }) {
  return <article className="review">
    <div className="reviewMeta"><span>{item.claim.development_date || item.claim.category.replaceAll("_", " ")}</span>
      <span data-status={item.status}>{item.status.replaceAll("_", " ")}</span></div>
    <h3>{item.claim.statement}</h3>
    {item.claim.original_span !== item.claim.statement && <p className="muted">Original text · {item.claim.original_span}</p>}
    <p>{item.explanation}</p>
    {item.correction && <p>Suggested correction · {item.correction}</p>}
    {item.freshness_score !== null && <p className="muted">Evidence freshness {item.freshness_score}/100 · {item.freshness_evidence_date} evaluated {item.freshness_as_of}</p>}
    {item.evidence.map((source) => <blockquote key={source.url + "\n" + source.quote}>
      <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>
      {source.published_date && <span> · {source.published_date}</span>}
      {source.primary && <span> Â· Primary source</span>}
      <p>{source.quote}</p>
    </blockquote>)}
  </article>;
}

function ProviderActivity({ activity }: { activity: Activity }) {
  return <details><summary>Provider activity · {activity.events.length} calls</summary>
    <p className="muted">Workflow ID {activity.workflow_id}</p>
    <ul>{activity.events.map((item) => <li key={item.client_request_id}>{item.service} · {item.elapsed_ms} ms
      {item.status_code && " · HTTP " + item.status_code}
      {item.status === "failed" && " · " + (item.failure_category || "failed").replaceAll("_", " ")}
      {item.input_tokens != null && " · " + item.input_tokens + " input tokens"}
      {item.output_tokens != null && " · " + item.output_tokens + " output tokens"}
    </li>)}</ul>
  </details>;
}

export default function Benchify() {
  const [view, setView] = useState<"briefings" | "verify" | "runs">("briefings");
  const [theme, setTheme] = useState("dark");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [failedActivity, setFailedActivity] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const isMeeting = view === "briefings";
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("run")) setView("runs");
  }, []);

  function changeView(next: typeof view) {
    if (next !== "runs") {
      const url = new URL(window.location.href);
      url.searchParams.delete("run");
      window.history.replaceState(null, "", url);
    }
    setView(next);
    setResult(null);
    setError("");
    setFailedActivity(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setResult(null);
    setError("");
    setFailedActivity(null);
    setBusy(true);
    try {
      let body: Record<string, unknown> = { text: data.get("text") };
      if (isMeeting) {
        const local = new Date(String(data.get("meeting_at")));
        const offset = -local.getTimezoneOffset();
        const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
        const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
        body = { subject: data.get("subject"), purpose: data.get("purpose"),
          context: data.get("context"), meeting_at: String(data.get("meeting_at")) + ":00" + (offset >= 0 ? "+" : "-") + hours + ":" + minutes };
      }
      const response = await fetch("/api/" + view, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (typeof payload.workflow_id === "string" && Array.isArray(payload.events)) {
          setFailedActivity(payload);
        }
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Check the highlighted input requirements and try again.");
      }
      setResult(payload);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="shell" data-theme={theme}>
    <header className="appHeader">
      <Image className="brand" src="/brand/benchify-wordmark.svg" alt="Benchify" width={112} height={32} unoptimized />
      <nav aria-label="Workflows">{(["briefings", "verify", "runs"] as const).map((item) =>
        <button key={item} type="button" disabled={busy} aria-current={view === item ? "page" : undefined}
          onClick={() => changeView(item)}>
          {item === "briefings" ? "Meeting Intelligence" : item === "verify" ? "Freshness Lab" : "Benchmarks"}
        </button>)}</nav>
      <button className="theme" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light mode" : "Dark mode"}</button>
    </header>
    {view === "runs" ? <Benchmark /> : <main>
      <div className="hero"><div className="line" /><h1>{isMeeting ? "Meeting Intelligence" : "Freshness Lab"}</h1>
        <p>{isMeeting ? "A source-backed briefing for your next meeting." : "Check time-sensitive claims against live web evidence."}</p></div>
      <div className="workspace">
        <form onSubmit={submit} key={view}>
          <h2>{isMeeting ? "Meeting details" : "Answer to verify"}</h2>
          {isMeeting ? <>
            <label>Company or person<input name="subject" required maxLength={400} placeholder="Company or full name" /></label>
            <label>Meeting time <small>Local time</small><input name="meeting_at" required type="datetime-local" /></label>
            <label>Purpose <small>Optional</small><input name="purpose" maxLength={500} /></label>
            <label>Context <small>Optional</small><textarea name="context" rows={3} maxLength={1500} /></label>
          </> : <label>Paste an AI-generated answer<textarea name="text" rows={10} required maxLength={5000} /></label>}
          <button className="primary" disabled={busy}>{busy ? "Working…" : isMeeting ? "Generate briefing" : "Verify claims"}</button>
        </form>

        <section className="report" aria-label="Results" aria-busy={busy}>
          {busy && <p role="status">Checking live sources and evaluating evidence…</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {failedActivity && <ProviderActivity activity={failedActivity} />}
          {!busy && !error && !result && <p className="empty">{isMeeting ? "Your briefing and verification details will appear here." : "Claim verdicts and cited evidence will appear here."}</p>}
          {result && <>
            <div className="reportHead"><span>◉ {result.mode} research</span>
              <h2>{result.meeting?.subject || "Claim verification"}</h2>
              {result.meeting && <p>Meeting · {new Date(result.meeting.meeting_at).toLocaleString()}{result.meeting.purpose && " · " + result.meeting.purpose}</p>}
              {result.window && <p>Research window · {result.window.join(" to ")}</p>}</div>
            {result.note && <p>{result.note}</p>}
            {(result.findings || result.verification).map((item, index) => <ReviewCard key={index} item={item} />)}
            {!result.note && !(result.findings || result.verification).length && <p>{isMeeting ? "No findings passed verification." : "No eligible factual claims were extracted."}</p>}
            {Boolean(result.questions?.length) && <><h3>Questions for the meeting</h3><ul>{result.questions?.map((question) => <li key={question}>{question}</li>)}</ul></>}
            {isMeeting && Boolean(result.verification.length) && <details><summary>Claim verification · {result.verification.length}</summary>{result.verification.map((item, index) => <ReviewCard key={index} item={item} />)}</details>}
            <ProviderActivity activity={result} />
          </>}
        </section>
      </div>
    </main>}
  </div>;
}
