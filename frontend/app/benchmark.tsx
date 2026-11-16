"use client";

import { FormEvent, useEffect, useState } from "react";

type Agent = string;
type Scenario = "baseline" | "first_search_503" | "first_search_429";
type Trace = {
  operation: string; offset_ms: number; elapsed_ms: number; status: string;
  query?: string; injected?: boolean; model?: string; request_id?: string; provenance?: string;
  status_code?: number | null; failure?: string; error?: string;
  failure_category?: string; client_request_id?: string; requested_model?: string;
  attempt?: number; retry_delay_ms?: number;
  input_tokens?: number | null; output_tokens?: number | null; cost_usd?: number | null;
};
type Attempt = {
  id: string; agent: Agent; scenario: Scenario; repetition: number; success: boolean; recovered: boolean | null;
  latency_ms: number; tool_calls: number; input_tokens: number | null; output_tokens: number | null;
  cost_usd: number | null; search_credits: number | null; events: Trace[]; error: string | null;
  capture?: { id: string; captured_at: string; expires_at: string };
  capture_error?: string;
  capture_status?: "complete" | "rejected" | "expired" | "deleted";
};
type RunSummary = {
  id: string; created_at: string; fixture_revision: string; fixture_sha256: string;
  model_mode: string; model_name?: string | null; repetitions: number; meeting: { subject: string };
  status?: "queued" | "running" | "completed" | "failed";
  completed_attempts?: number;
  error?: string;
  agents?: Agent[];
  agent_names?: Record<Agent, string>;
  repeated_from?: string;
  dataset_kind?: string;
  scenarios?: Scenario[];
};
type Run = RunSummary & { attempts: Attempt[] };
type ClaimSnapshot = {
  claim: string; status: string; as_of?: string; verified_at?: string;
  evidence: { url: string; published_date: string | null; quote: string | null }[];
};
type ClaimChange = {
  previous: ClaimSnapshot | null;
  current: ClaimSnapshot | null;
  changes: string[];
};
type Regression = {
  candidate_run_id: string; candidate_mode: string; historical_telemetry: boolean;
  classifications: string[]; incompatible_conditions: string[];
  configuration: Record<string, { previous: unknown; current: unknown }>;
  success: { baseline: { passed: number; total: number }; candidate: { passed: number; total: number } };
  attempts: { agent: Agent; scenario: Scenario; repetition: number; classifications: string[];
    claims: ClaimChange[]; telemetry: { delta: Record<string, number | null> } }[];
};
type Catalog = {
  tasks: { revision: string; subject: string; kind: string }[];
  agents: { id: Agent; name: string; revision: string }[];
};

const defaultAgents = ["python", "http"];
const defaultScenarios: Scenario[] = ["baseline", "first_search_503"];
const scenarios: Scenario[] = [...defaultScenarios, "first_search_429"];
const agentLabel: Record<Agent, string> = { python: "Built-in Python", http: "Independent HTTP" };
const scenarioLabel = {
  baseline: "Baseline", first_search_503: "First search returns 503", first_search_429: "First search returns 429",
};
const display = (value: number | null | undefined) => value == null ? "—" : String(value);
const pending = (run: RunSummary) => run.status === "queued" || run.status === "running";
const nameFor = (run: RunSummary, agent: Agent) =>
  run.agent_names?.[agent] ?? agentLabel[agent] ?? agent;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api/runs" + path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Benchmark request failed.");
  return payload;
}

const message = (error: unknown) => error instanceof Error ? error.message : "Benchmark request failed.";

function mean(attempts: Attempt[], key: "latency_ms" | "tool_calls") {
  return attempts.reduce((sum, attempt) => sum + attempt[key], 0) / attempts.length;
}

function percentile(sorted: number[], fraction: number) {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function downloadJson(data: unknown, fileName: string, pretty = true) {
  const file = new Blob([JSON.stringify(data, null, pretty ? 2 : undefined)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function linkToRun(id?: string) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("run", id);
  else url.searchParams.delete("run");
  window.history.replaceState(null, "", url);
}

function Comparison({ run }: { run: Run }) {
  const runAgents = run.agents ?? defaultAgents;
  const runScenarios = run.scenarios ?? defaultScenarios;
  return <div className="benchmarkTable"><table>
    <thead><tr><th scope="col">Scenario</th>{runAgents.map(agent =>
      <th scope="col" key={agent}>{nameFor(run, agent)}</th>)}</tr></thead>
    <tbody>{runScenarios.map(scenario => <tr key={scenario}>
      <th scope="row">{scenarioLabel[scenario]}</th>
      {runAgents.map(agent => {
        const baseline = run.attempts.filter(attempt => attempt.agent === agent && attempt.scenario === "baseline");
        const attempts = run.attempts.filter(attempt => attempt.agent === agent && attempt.scenario === scenario);
        if (!attempts.length) return <td key={agent}>Awaiting results</td>;
        const injected = attempts.filter(attempt => attempt.recovered !== null);
        const passed = attempts.filter(attempt => attempt.success).length;
        const measuredCosts = attempts.flatMap(attempt => attempt.cost_usd == null ? [] : [attempt.cost_usd]);
        const costPerSuccess = passed > 0 && measuredCosts.length === attempts.length
          ? measuredCosts.reduce((sum, cost) => sum + cost, 0) / passed : null;
        const sortedLatencies = attempts.map(attempt => attempt.latency_ms).sort((a, b) => a - b);
        const latency = mean(attempts, "latency_ms");
        const delta = latency - mean(baseline, "latency_ms");
        return <td key={agent}>
          <strong>{passed}/{attempts.length} passed</strong><br />
          {latency.toFixed(2)} ms mean latency<br />
          {percentile(sortedLatencies, 0.5)} / {percentile(sortedLatencies, 0.95)} ms p50 / p95
          {scenario !== "baseline" && <>{baseline.length > 0 && <><br />{delta >= 0 ? "+" : ""}{delta.toFixed(2)} ms vs baseline</>}
            <br />{injected.filter(attempt => attempt.recovered).length}/{injected.length} recovered
            {injected.length < attempts.length && <> · {attempts.length - injected.length} never reached injection</>}</>}
          <br />{mean(attempts, "tool_calls").toFixed(1)} mean search calls
          <br />{costPerSuccess?.toFixed(6) ?? "—"} USD per success
          {" · "}{measuredCosts.length}/{attempts.length} attempts reported cost
        </td>;
      })}
    </tr>)}</tbody>
  </table></div>;
}

function Timeline({ runId, attempt, agentName }: { runId: string; attempt: Attempt; agentName: string }) {
  const [recording, setRecording] = useState<unknown>(null);
  const [recordingError, setRecordingError] = useState("");
  const [loading, setLoading] = useState(false);

  async function showRecording() {
    setLoading(true);
    setRecordingError("");
    try {
      setRecording(await request("/" + runId + "/attempts/" + attempt.id + "/recording"));
    } catch (error) {
      setRecordingError(message(error));
    } finally {
      setLoading(false);
    }
  }
  return <details className="review">
    <summary>{agentName} · {scenarioLabel[attempt.scenario]} · Attempt {attempt.repetition}</summary>
    <p><strong>{attempt.success ? "Passed" : "Failed"}</strong> · {attempt.latency_ms} ms · {attempt.tool_calls} search calls</p>
    {attempt.error && <p>{attempt.error}</p>}
    {attempt.capture_error && <p>{attempt.capture_error}</p>}
    {(attempt.capture_status === "expired" || attempt.capture_status === "deleted") &&
      <p>Recording {attempt.capture_status}.</p>}
    {attempt.capture && <p>Recording expires {new Date(attempt.capture.expires_at).toLocaleString()}{" "}
      <button disabled={loading} type="button" onClick={showRecording}>{loading ? "Loading…" : "Inspect recording"}</button>
    </p>}
    {recordingError && <p role="alert">{recordingError}</p>}
    {recording !== null && <details open><summary>Captured evidence and provider results</summary>
      <button type="button" onClick={() => downloadJson(recording, "benchify-recording-" + attempt.id + ".json", false)}>
        Download recording JSON
      </button>
      <pre style={{ maxHeight: "22rem", overflow: "auto" }}>{JSON.stringify(recording, null, 2)}</pre>
    </details>}
    <p className="muted">Input / output tokens {display(attempt.input_tokens)} / {display(attempt.output_tokens)}
      {" · USD "}{display(attempt.cost_usd)}{" · Search credits "}{display(attempt.search_credits)}</p>
    <ol className="trace">{attempt.events.map((event, index) => <li key={index}>
      <strong>+{event.offset_ms} ms</strong> · {event.operation.replaceAll("_", " ")} · {event.status} · {event.elapsed_ms} ms
      {event.injected && ` · Injected HTTP ${event.status_code}`}
      {event.query && <div className="muted">{event.query}</div>}
      {!event.injected && event.status_code && " · HTTP " + event.status_code}
      {event.attempt != null && " · Request attempt " + event.attempt}
      {event.retry_delay_ms != null && " · Retry after " + event.retry_delay_ms + " ms"}
      {(event.error || event.failure_category || event.failure) &&
        <div className="muted">{[event.error, event.failure_category?.replaceAll("_", " ") || event.failure]
          .filter(Boolean).join(" · ")}</div>}
      {event.requested_model && <div className="muted">Requested model {event.requested_model}</div>}
      {event.model && <div className="muted">Returned model {event.model}</div>}
      {event.client_request_id && <div className="muted">Client request ID {event.client_request_id}</div>}
      {event.request_id && <div className="muted">Provider request ID {event.request_id}</div>}
      {event.provenance && <div className="muted">{event.provenance}</div>}
      {(event.input_tokens != null || event.output_tokens != null || event.cost_usd != null) &&
        <div className="muted">{display(event.input_tokens)} / {display(event.output_tokens)} tokens · USD {display(event.cost_usd)}</div>}
    </li>)}</ol>
  </details>;
}

export default function Benchmark() {
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [repetitions, setRepetitions] = useState(1);
  const [capture, setCapture] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [report, setReport] = useState<Regression | null>(null);
  const [modelMode, setModelMode] = useState<"live" | "scripted">("live");
  const [tasks, setTasks] = useState<Catalog["tasks"]>([]);
  const [agents, setAgents] = useState<Catalog["agents"]>([]);
  const [fixtureRevision, setFixtureRevision] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Agent[]>(defaultAgents);
  const pythonOnly = selectedAgents.length === 1 && selectedAgents[0] === "python";
  const [selectedScenarios, setSelectedScenarios] = useState<Scenario[]>(defaultScenarios);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    request<RunSummary[]>("", { signal: controller.signal })
      .then(setHistory)
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    request<Catalog>("/catalog", { signal: controller.signal })
      .then(catalog => {
        if (controller.signal.aborted) return;
        setTasks(catalog.tasks);
        setAgents(catalog.agents);
        setSelectedAgents(current => current.filter(id => catalog.agents.some(agent => agent.id === id)));
        setFixtureRevision(catalog.tasks[0]?.revision ?? "");
      })
      .catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    const linkedRun = new URLSearchParams(window.location.search).get("run");
    if (linkedRun && /^[0-9a-f-]{36}$/i.test(linkedRun)) {
      request<Run>("/" + linkedRun, { signal: controller.signal })
        .then(run => { if (!controller.signal.aborted) setSelected(run); })
        .catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    }
    return () => controller.abort();
  }, []);

  const activeId = selected && pending(selected) ? selected.id : null;
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      try {
        const run = await request<Run>("/" + activeId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSelected(current => current?.id === activeId ? run : current);
        setHistory(history => history.map(item => item.id === run.id ? run : item));
        setError("");
      } catch (error) {
        if (!controller.signal.aborted) setError(message(error));
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 2000);
    }

    timer = setTimeout(refresh, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeId]);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setReport(null);
    setError("");
    try {
      const run = await request<Run>("", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repetitions, model_mode: modelMode, agents: selectedAgents, scenarios: selectedScenarios,
          fixture_revision: fixtureRevision, capture_mode: capture && pythonOnly ? "full" : "off",
        }),
      });
      setSelected(run);
      linkToRun(run.id);
      setHistory(history => [run, ...history].slice(0, 30));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    if (!id) { linkToRun(); setSelected(null); setReport(null); return; }
    setBusy(true);
    setReport(null);
    setError("");
    try {
      const run = await request<Run>("/" + id);
      setSelected(run);
      linkToRun(run.id);
      setHistory(history => history.some(item => item.id === id) ? history : [run, ...history].slice(0, 30));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function repeat(id: string) {
    setBusy(true);
    setReport(null);
    setError("");
    try {
      const run = await request<Run>("/" + id + "/rerun", { method: "POST" });
      setSelected(run);
      linkToRun(run.id);
      setHistory(history => [run, ...history].slice(0, 30));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function compare(id: string, replay: boolean) {
    setBusy(true);
    setReport(null);
    setError("");
    try {
      setReport(await request<Regression>("/" + id + "/compare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replay ? { replay: true } : { candidate_run_id: candidateId }),
      }));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <main className="benchmark">
    <div className="hero"><div className="line" /><h1>Meeting research benchmark</h1>
      <p>Compare agents on versioned research tasks under baseline and search failure scenarios.</p></div>
    <form className="benchmarkControls" onSubmit={start}>
      <h2>Configure a run</h2>
      <label>Research task<select value={fixtureRevision} disabled={busy || !tasks.length}
        onChange={event => setFixtureRevision(event.target.value)}>
        {!tasks.length && <option value="">No tasks loaded</option>}
        {tasks.map(task => <option key={task.revision} value={task.revision}>
          {task.subject} · {task.kind}
        </option>)}
      </select></label>
      <label>Repetitions<input type="number" min={1} max={5} required value={repetitions}
        onChange={event => setRepetitions(event.target.valueAsNumber || 1)} disabled={busy} /></label>
      <label>Python model<select value={modelMode} disabled={busy}
        onChange={event => setModelMode(event.target.value === "scripted" ? "scripted" : "live")}>
        <option value="live">Live via Bifrost</option>
        <option value="scripted">Scripted test</option>
      </select></label>
      <fieldset disabled={busy}>
        <legend>Agents</legend>
        {agents.map(agent => <label key={agent.id}>
          <input type="checkbox" checked={selectedAgents.includes(agent.id)}
            disabled={selectedAgents.length >= 5 && !selectedAgents.includes(agent.id)}
            onChange={event => setSelectedAgents(agents.map(value => value.id).filter(id =>
              id === agent.id ? event.target.checked : selectedAgents.includes(id)))} />{agent.name}
        </label>)}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Scenarios</legend>
        {scenarios.map(scenario => <label key={scenario}>
          <input type="checkbox" checked={selectedScenarios.includes(scenario)}
            onChange={event => setSelectedScenarios(scenarios.filter(value =>
              value === scenario ? event.target.checked : selectedScenarios.includes(value)))} />{scenarioLabel[scenario]}
        </label>)}
      </fieldset>
      <label className="captureOption"><input type="checkbox" checked={capture && pythonOnly} disabled={busy || !pythonOnly}
        onChange={event => setCapture(event.target.checked)} />
        Capture provider results and evidence (Python only)
      </label>
      <button className="primary"
        disabled={busy || !fixtureRevision || !selectedAgents.length || !selectedScenarios.length}>
        Run benchmark
      </button>
      <label>Saved runs<select disabled={busy} value={selected?.id ?? ""} onChange={event => open(event.target.value)}>
        <option value="">Select a run</option>
        {history.map(run => <option key={run.id} value={run.id}>
          {new Date(run.created_at).toLocaleString()} · {run.model_mode} · {run.status ?? "completed"}
        </option>)}
      </select></label>
    </form>
    {busy && <p role="status">Working…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {selected && <section aria-label="Benchmark results" aria-busy={busy}>
      <div className="reportHead"><h2>{selected.meeting.subject}</h2>
        <p>{selected.fixture_revision} · {selected.dataset_kind ?? "synthetic"} ·
          {" "}{selected.model_name ?? selected.model_mode} · <span title={selected.fixture_sha256}>
          Fixture {selected.fixture_sha256.slice(0, 12)}</span></p></div>
      <p role="status">{selected.status ?? "completed"} · {selected.completed_attempts ?? selected.attempts.length}
        {" / "}{selected.repetitions * (selected.agents ?? defaultAgents).length
          * (selected.scenarios ?? defaultScenarios).length} attempts finished</p>
      {selected.error && <p className="error" role="alert">{selected.error}</p>}
      {selected.repeated_from && <button type="button" disabled={busy}
        onClick={() => open(selected.repeated_from ?? "")}>
        Open original run
      </button>}
      {selected.attempts.length > 0 && <Comparison run={selected} />}
      {!pending(selected) && <div className="benchmarkControls">
        <button type="button" disabled={busy} onClick={() => repeat(selected.id)}>Repeat run</button>
        <button type="button" onClick={() => downloadJson(selected, "benchify-" + selected.id + ".json")}>Download run JSON</button>
        {selected.status === "completed" && selected.attempts.length > 0 && selected.attempts.every(attempt => attempt.capture) &&
          <button type="button" disabled={busy} onClick={() => compare(selected.id, true)}>Replay offline and compare</button>}
        <label>Compare with saved run<select disabled={busy} value={candidateId} onChange={event => setCandidateId(event.target.value)}>
          <option value="">Select candidate</option>
          {history.filter(item => item.id !== selected.id && item.status === "completed").map(item =>
            <option key={item.id} value={item.id}>{item.meeting.subject} · {new Date(item.created_at).toLocaleString()}</option>)}
        </select></label>
        <button type="button" disabled={busy || !candidateId || candidateId === selected.id}
          onClick={() => compare(selected.id, false)}>Compare runs</button>
      </div>}
      {report && <section aria-label="Regression comparison">
        <h2>{report.candidate_mode === "replay" ? "Offline replay comparison" : "Regression comparison"}</h2>
        <p>Baseline {report.success.baseline.passed}/{report.success.baseline.total} passed · Candidate{" "}
          {report.success.candidate.passed}/{report.success.candidate.total} passed</p>
        {report.historical_telemetry && <p>Replay uses original timing and usage measurements.</p>}
        {report.incompatible_conditions.length > 0 && <p>Incompatible conditions · {report.incompatible_conditions.join(", ")}</p>}
        <p>{report.classifications.length ? report.classifications.join(", ").replaceAll("_", " ") : "No classified differences"}</p>
        {Object.keys(report.configuration).length > 0 && <details>
          <summary>Configuration changes</summary>
          <dl>{Object.entries(report.configuration).map(([field, change]) => <div key={field}>
            <dt>{field.replaceAll("_", " ")}</dt><dd>{JSON.stringify(change.previous)} → {JSON.stringify(change.current)}</dd>
          </div>)}</dl>
        </details>}
        <button type="button" onClick={() => downloadJson(report, "benchify-comparison-" + report.candidate_run_id + ".json")}>
          Export comparison JSON
        </button>
        {report.attempts.map(pair => <details className="review" key={[pair.agent, pair.scenario, pair.repetition].join("/")}>
          <summary>{nameFor(selected, pair.agent)} · {scenarioLabel[pair.scenario]} · Attempt {pair.repetition}</summary>
          <dl>{Object.entries(pair.telemetry.delta).map(([metric, delta]) =>
            <div key={metric}><dt>{metric.replaceAll("_", " ")}</dt><dd>{display(delta)}</dd></div>)}</dl>
          {pair.claims.filter(claim => claim.changes.length).map(claim =>
            <details key={claim.current?.claim ?? claim.previous?.claim}>
              <summary>
                {claim.current?.claim ?? claim.previous?.claim} · {claim.previous?.status ?? "absent"} → {claim.current?.status ?? "absent"}
              </summary>
              <p>{claim.changes.join(", ").replaceAll("_", " ")}</p>
              {(["previous", "current"] as const).map(side => {
                const snapshot = claim[side];
                if (!snapshot) return null;
                return <div key={side}>
                  <p>{side === "previous" ? "Previous evidence" : "Current evidence"}
                    {snapshot.verified_at && " · " + new Date(snapshot.verified_at).toLocaleString()}</p>
                  <ul>{snapshot.evidence.map(source => <li key={source.url + source.quote}>
                    {source.url}{source.published_date && " · " + source.published_date}
                    {source.quote && <blockquote>{source.quote}</blockquote>}
                  </li>)}</ul>
                </div>;
              })}
            </details>)}
        </details>)}
      </section>}
      {selected.attempts.length > 0 && <>
        <h2>Execution timeline</h2>
        <p className="muted">Times are relative to each attempt. A dash indicates unavailable usage telemetry.</p>
        <div className="attempts">{selected.attempts.map(attempt =>
          <Timeline key={attempt.id} runId={selected.id} attempt={attempt} agentName={nameFor(selected, attempt.agent)} />)}</div>
      </>}
    </section>}
  </main>;
}
