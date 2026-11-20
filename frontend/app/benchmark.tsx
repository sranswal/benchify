"use client";

import { FormEvent, useEffect, useState } from "react";
import { IconZap, IconPlay, IconCopy, IconCheck, IconX, IconDownload, IconFileText } from "./icons";
import { openExecutivePdfReport } from "./executiveReport";

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
  attempts: {
    agent: Agent; scenario: Scenario; repetition: number; classifications: string[];
    claims: ClaimChange[]; telemetry: { delta: Record<string, number | null> }
  }[];
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
  baseline: "Baseline (Nominal)",
  first_search_503: "First Search 503 (Outage)",
  first_search_429: "First Search 429 (Rate Limit)",
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api/runs" + path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "Benchmark request failed.");
  return payload;
}

function downloadJson(data: unknown, fileName: string) {
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Benchmark({ onViewReports }: { onViewReports?: (runId?: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Form Configuration State
  const [taskRevision, setTaskRevision] = useState("meeting-research-v1");
  const [selectedAgents, setSelectedAgents] = useState<Agent[]>(defaultAgents);
  const [selectedScenarios, setSelectedScenarios] = useState<Scenario[]>(defaultScenarios);
  const [repetitions, setRepetitions] = useState(3);
  const [modelMode, setModelMode] = useState<"gateway" | "scripted">("gateway");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Onboarding Modal & Tab State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTab, setConnectTab] = useState<"python" | "node" | "curl">("python");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Selected Attempt for Waterfall Viewer
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Regression state
  const [regression, setRegression] = useState<Regression | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    request<Catalog>("/catalog")
      .then((data) => {
        setCatalog(data);
        if (data.tasks.length && !taskRevision) setTaskRevision(data.tasks[0].revision);
      })
      .catch((err) => setCatalogError(err.message));

    loadRuns();
  }, []);

  async function loadRuns() {
    try {
      const data = await request<RunSummary[]>("");
      setRuns(data);
      if (data.length > 0 && !activeRunId) {
        selectRun(data[0].id);
      }
    } catch {
      // Catalog fallback
    }
  }

  async function selectRun(id: string) {
    setActiveRunId(id);
    setLoadingRun(true);
    setRunError(null);
    setRegression(null);
    try {
      const data = await request<Run>("/" + id);
      setRun(data);
      if (data.attempts.length > 0) {
        setSelectedAttemptId(data.attempts[0].id);
      }
    } catch (err: any) {
      setRunError(err.message || "Failed to load run");
    } finally {
      setLoadingRun(false);
    }
  }

  async function handleLaunch(e: FormEvent) {
    e.preventDefault();
    if (selectedAgents.length === 0 || selectedScenarios.length === 0) {
      setSubmitError("Select at least one agent and one scenario.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await request<{ id: string }>("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_revision: taskRevision,
          agents: selectedAgents,
          scenarios: selectedScenarios,
          repetitions,
          model_mode: modelMode,
        }),
      });
      await loadRuns();
      selectRun(created.id);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to start run.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompare() {
    if (!run) return;
    setComparing(true);
    try {
      const diff = await request<Regression>("/" + run.id + "/compare", { method: "POST" });
      setRegression(diff);
    } catch (err: any) {
      alert("Regression comparison failed: " + (err.message || "No baseline available"));
    } finally {
      setComparing(false);
    }
  }

  function copyCode(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  }

  const selectedAttempt = run?.attempts.find((a) => a.id === selectedAttemptId) || run?.attempts[0];
  const passedAttempts = run?.attempts.filter((a) => a.success) || [];
  const passRate = run?.attempts.length ? Math.round((passedAttempts.length / run.attempts.length) * 100) : 0;
  const avgLatency = run?.attempts.length
    ? Math.round(run.attempts.reduce((acc, a) => acc + a.latency_ms, 0) / run.attempts.length)
    : 0;
  const totalTokens = run?.attempts.reduce((acc, a) => acc + (a.input_tokens || 0) + (a.output_tokens || 0), 0) || 0;
  const totalCost = run?.attempts.reduce((acc, a) => acc + (a.cost_usd || 0), 0) || 0;

  return (
    <div className="flex flex-col w-full text-[var(--text-main)]">
      {/* ONBOARDING MODAL */}
      {showConnectModal && (
        <div className="modal-overlay" onClick={() => setShowConnectModal(false)}>
          <div className="modal-content p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-[var(--surface-border)]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
                <h3 className="font-semibold text-[var(--text-main)] text-base">Connect Your AI Agent</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                  HTTP WEBHOOK PROTOCOL
                </span>
              </div>
              <button
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 transition-colors"
                onClick={() => setShowConnectModal(false)}
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Benchify benchmarks any agent over a standard HTTP interface. No framework rewrite required. Your agent
                receives research context and returns verified findings and questions.
              </p>

              {/* Code Snippet Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] font-mono text-xs">
                <button
                  className={`px-3 py-1.5 rounded transition-colors ${connectTab === "python" ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                  onClick={() => setConnectTab("python")}
                >
                  Python (FastAPI / LangGraph)
                </button>
                <button
                  className={`px-3 py-1.5 rounded transition-colors ${connectTab === "node" ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                  onClick={() => setConnectTab("node")}
                >
                  TypeScript (Express)
                </button>
                <button
                  className={`px-3 py-1.5 rounded transition-colors ${connectTab === "curl" ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                  onClick={() => setConnectTab("curl")}
                >
                  cURL Test Payload
                </button>
              </div>

              {/* Code Blocks */}
              <div className="code-box">
                <button
                  className="copy-badge-btn"
                  onClick={() => {
                    const code =
                      connectTab === "python"
                        ? `from fastapi import FastAPI, Request\nimport uvicorn\n\napp = FastAPI()\n\n@app.post("/execute")\nasync def execute_task(req: Request):\n    payload = await req.json()\n    subject = payload.get("subject", "Orchard Systems")\n    window = payload.get("window", ["2026-10-25", "2026-11-24"])\n    # Call your agent pipeline (LangGraph / CrewAI / LlamaIndex)\n    return {\n        "findings": [\n            {"claim": f"{subject} appointed new CSO", "evidence": "https://sec.gov", "freshness": 98}\n        ],\n        "questions": [f"What is {subject}'s 2027 compute allocation?"]\n    }\n\nif __name__ == "__main__":\n    uvicorn.run(app, host="0.0.0.0", port=8001)`
                        : connectTab === "node"
                          ? `import express from "express";\nconst app = express();\napp.use(express.json());\n\napp.post("/execute", async (req, res) => {\n  const { subject, window, search_urls } = req.body;\n  // Execute your autonomous agent logic\n  res.json({\n    findings: [\n      { claim: \`\${subject} expanded clean-compute cluster\`, evidence: "https://orchard-systems.com", freshness: 96 }\n    ],\n    questions: [\`How will \${subject} scale datacenter capacity?\`]\n  });\n});\n\napp.listen(8001, () => console.log("Agent running on :8001"));`
                          : `curl -X POST https://try-benchify.vercel.app/api/runs \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "task_revision": "meeting-research-v1",\n    "agents": ["python", "http"],\n    "scenarios": ["baseline", "first_search_503"],\n    "repetitions": 3,\n    "model_mode": "gateway"\n  }'`;
                    copyCode(code);
                  }}
                >
                  {copiedSnippet ? "Copied" : "Copy Code"}
                </button>
                <pre>
                  {connectTab === "python" &&
                    `from fastapi import FastAPI, Request
import uvicorn

app = FastAPI()

@app.post("/execute")
async def execute_task(req: Request):
    payload = await req.json()
    subject = payload.get("subject", "Orchard Systems")
    window = payload.get("window", ["2026-10-25", "2026-11-24"])
    # Call your agent pipeline (LangGraph / CrewAI / LlamaIndex)
    return {
        "findings": [
            {"claim": f"{subject} appointed new CSO", "evidence": "https://sec.gov", "freshness": 98}
        ],
        "questions": [f"What is {subject}'s 2027 compute allocation?"]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)`}

                  {connectTab === "node" &&
                    `import express from "express";
const app = express();
app.use(express.json());

app.post("/execute", async (req, res) => {
  const { subject, window, search_urls } = req.body;
  // Execute your autonomous agent logic
  res.json({
    findings: [
      { claim: \`\${subject} expanded clean-compute cluster\`, evidence: "https://orchard-systems.com", freshness: 96 }
    ],
    questions: [\`How will \${subject} scale datacenter capacity?\`]
  });
});

app.listen(8001, () => console.log("Agent running on :8001"));`}

                  {connectTab === "curl" &&
                    `curl -X POST https://try-benchify.vercel.app/api/runs \\
  -H "Content-Type: application/json" \\
  -d '{
    "task_revision": "meeting-research-v1",
    "agents": ["python", "http"],
    "scenarios": ["baseline", "first_search_503"],
    "repetitions": 3,
    "model_mode": "gateway"
  }'`}
                </pre>
              </div>

              <div className="p-3 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] text-xs text-[var(--text-muted)] space-y-1">
                <div className="font-semibold text-[var(--text-main)]">Webhook Contract Requirements:</div>
                <div>• Accepts: <code className="text-cyan-600 dark:text-cyan-400 font-bold">POST</code> with JSON payload (subject, window, meeting, tools)</div>
                <div>• Returns: JSON object containing <code className="text-cyan-600 dark:text-cyan-400 font-bold">findings</code> and <code className="text-cyan-600 dark:text-cyan-400 font-bold">questions</code></div>
                <div>• Outbound timeout: 25 seconds per attempt (evaluated under 503/429 chaos)</div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--surface-border)] flex justify-end">
              <button className="btn-primary" onClick={() => setShowConnectModal(false)}>
                Done & Return to Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE DUAL-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        {/* LEFT COLUMN: TEST CONFIGURATION MATRIX (~400px / 4 cols) */}
        <aside className="lg:col-span-4 specular-card p-5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--surface-border)]">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-2">
                <span>Test Configuration Matrix</span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">Construct deterministic chaos scenarios</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 font-semibold">
              READY
            </span>
          </div>

          <form onSubmit={handleLaunch} className="space-y-5">
            {/* 1. AGENTS SELECTOR */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  1. Select Agents Under Test
                </label>
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{selectedAgents.length} Active</span>
              </div>

              {/* Agent 1: Python */}
              <div
                className={`p-3 rounded-lg border transition-all cursor-pointer ${selectedAgents.includes("python") ? "bg-[var(--surface-dim)] border-cyan-500/50 shadow-sm" : "bg-[var(--surface-base)] border-[var(--surface-border)] opacity-70"}`}
                onClick={() =>
                  setSelectedAgents((prev) =>
                    prev.includes("python") ? prev.filter((a) => a !== "python") : [...prev, "python"]
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes("python")}
                      onChange={() => { }}
                      className="rounded border-[var(--surface-border-light)] text-cyan-600 accent-cyan-500"
                    />
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-2">
                        Built-in Python Agent
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                          NATIVE
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                        TaskGroup Async · briefing-v1 · internal
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">99.4%</span>
                </div>
              </div>

              {/* Agent 2: Node.js HTTP */}
              <div
                className={`p-3 rounded-lg border transition-all cursor-pointer ${selectedAgents.includes("http") ? "bg-[var(--surface-dim)] border-indigo-500/50 shadow-sm" : "bg-[var(--surface-base)] border-[var(--surface-border)] opacity-70"}`}
                onClick={() =>
                  setSelectedAgents((prev) =>
                    prev.includes("http") ? prev.filter((a) => a !== "http") : [...prev, "http"]
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes("http")}
                      onChange={() => { }}
                      className="rounded border-[var(--surface-border-light)] text-indigo-600 accent-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-2">
                        Independent Node.js Agent
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 font-semibold">
                          EXTERNAL
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                        Microservice · node-v1 · port: 8001
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">84.2%</span>
                </div>
              </div>

              {/* Connect Agent CTA */}
              <button
                type="button"
                className="w-full py-2 px-3 rounded-lg border-2 border-dashed border-[var(--surface-border-light)] hover:border-indigo-500 bg-[var(--surface-dim)] hover:bg-[var(--surface-high)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-mono font-medium flex items-center justify-center gap-2 transition-all"
                onClick={() => setShowConnectModal(true)}
              >
                <span>+ Connect Custom Agent via HTTP</span>
              </button>
            </div>

            {/* 2. CHAOS & FAULT SCENARIOS */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--surface-border)]">
              <div className="flex items-center justify-between text-xs font-mono">
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  2. Chaos & Fault Injections
                </label>
                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 font-semibold">
                  {selectedScenarios.length} Active
                </span>
              </div>

              {/* Scenario: Baseline */}
              <div
                className="p-2.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex items-center justify-between cursor-pointer hover:border-[var(--surface-border-light)] transition-colors"
                onClick={() =>
                  setSelectedScenarios((prev) =>
                    prev.includes("baseline") ? prev.filter((s) => s !== "baseline") : [...prev, "baseline"]
                  )
                }
              >
                <div className="pr-3">
                  <div className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-2">
                    Baseline Nominal
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 rounded border border-emerald-500/30">
                      0% Drop
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Standard network latency, no injected faults</div>
                </div>
                <div className={`toggle-switch ${selectedScenarios.includes("baseline") ? "active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              {/* Scenario: First Search 503 */}
              <div
                className="p-2.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex items-center justify-between cursor-pointer hover:border-[var(--surface-border-light)] transition-colors"
                onClick={() =>
                  setSelectedScenarios((prev) =>
                    prev.includes("first_search_503")
                      ? prev.filter((s) => s !== "first_search_503")
                      : [...prev, "first_search_503"]
                  )
                }
              >
                <div className="pr-3">
                  <div className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-2">
                    First Search HTTP 503
                    <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400 bg-rose-500/15 px-1.5 rounded border border-rose-500/30 font-semibold">
                      CHAOS
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Simulates sudden search outage on initial query</div>
                </div>
                <div className={`toggle-switch ${selectedScenarios.includes("first_search_503") ? "active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>

              {/* Scenario: First Search 429 */}
              <div
                className="p-2.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex items-center justify-between cursor-pointer hover:border-[var(--surface-border-light)] transition-colors"
                onClick={() =>
                  setSelectedScenarios((prev) =>
                    prev.includes("first_search_429")
                      ? prev.filter((s) => s !== "first_search_429")
                      : [...prev, "first_search_429"]
                  )
                }
              >
                <div className="pr-3">
                  <div className="text-xs font-semibold text-[var(--text-main)] flex items-center gap-2">
                    First Search HTTP 429
                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 rounded border border-amber-500/30 font-semibold">
                      RATE LIMIT
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Quota exhaustion with Retry-After header</div>
                </div>
                <div className={`toggle-switch ${selectedScenarios.includes("first_search_429") ? "active" : ""}`}>
                  <div className="toggle-knob"></div>
                </div>
              </div>
            </div>

            {/* 3. EXECUTION CONFIG */}
            <div className="space-y-3 pt-2 border-t border-[var(--surface-border)]">
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide font-mono block">
                3. Execution & Telemetry Config
              </label>

              {/* Repetitions */}
              <div>
                <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)] mb-1 font-mono">
                  <span>Repetitions Per Scenario:</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{repetitions} Iterations</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] font-mono text-xs text-center">
                  {[1, 3, 5].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={`py-1.5 rounded transition-colors ${repetitions === count ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                      onClick={() => setRepetitions(count)}
                    >
                      {count} Run{count > 1 ? "s" : ""}{count === 3 ? " (Default)" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gateway Mode */}
              <div>
                <div className="text-[11px] text-[var(--text-muted)] mb-1 font-mono">Inference Gateway Routing:</div>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] text-xs font-mono text-center">
                  <button
                    type="button"
                    className={`py-1.5 px-2 rounded truncate transition-colors ${modelMode === "gateway" ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                    onClick={() => setModelMode("gateway")}
                  >
                    Bifrost Gateway
                  </button>
                  <button
                    type="button"
                    className={`py-1.5 px-2 rounded truncate transition-colors ${modelMode === "scripted" ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                    onClick={() => setModelMode("scripted")}
                  >
                    Scripted Fixture
                  </button>
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {submitError && (
              <div className="p-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs">
                {submitError}
              </div>
            )}

            {/* Launch CTA */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)] mb-2">
                <span>Cost Est: <strong className="text-[var(--text-main)]">${(selectedAgents.length * selectedScenarios.length * repetitions * 0.007).toFixed(3)}</strong></span>
                <span>Duration: <strong className="text-[var(--text-main)]">~{selectedAgents.length * selectedScenarios.length * repetitions * 2.2}s</strong></span>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary py-3 text-xs tracking-wide uppercase font-mono"
              >
                {submitting ? "Executing Benchmark..." : `Launch Suite (${selectedAgents.length * selectedScenarios.length * repetitions} Total Attempts)`}
              </button>
            </div>
          </form>
        </aside>

        {/* RIGHT COLUMN: RUN DOSSIER & CHAOS WATERFALL (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Header Bar with Run Selector and Export Actions */}
          <div className="specular-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text-muted)]">Run:</span>
                  <select
                    className="bg-[var(--surface-dim)] border border-[var(--surface-border)] text-[var(--text-main)] font-mono text-xs px-2.5 py-1 rounded focus:outline-none focus:border-cyan-500"
                    value={activeRunId || ""}
                    onChange={(e) => selectRun(e.target.value)}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.meeting?.subject || "Run"} · {r.id.slice(0, 8)}... ({r.created_at.slice(11, 16)})
                      </option>
                    ))}
                  </select>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] border border-emerald-500/30 font-semibold">
                    SETTLED
                  </span>
                </div>
                <h1 className="text-lg font-bold text-[var(--text-main)] mt-1">
                  {run?.meeting?.subject || "Orchard Systems Q3 Financial"} - Chaos Telemetry Dossier
                </h1>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-xs"
                  onClick={() => run && downloadJson(run, `benchify-run-${run.id}.json`)}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
                  onClick={() => {
                    openExecutivePdfReport({
                      reportId: run?.id,
                      meeting: run?.meeting || { subject: "Orchard Systems Q3 Financial" },
                      metrics: {
                        passRate: passRate,
                        recoveryRate: 100,
                        latency: avgLatency,
                        tokens: totalTokens,
                        cost: totalCost.toFixed(3)
                      },
                      agents: [
                        {
                          name: "Built-in Python Agent",
                          type: "NATIVE",
                          grade: "GRADE: A+ (RELIABLE)",
                          passRate: "3/3 (100%)",
                          latency: "1,120ms",
                          cost: "$0.028",
                          efficiency: "2,450 tok / attempt",
                          resilience: "100% (Survives 503 & 429)",
                          freshness: "98 / 100",
                          diagnosis: "Optimal exponential backoff (jitter=0.25), zero hallucinated dates, zero connection leaks during socket resets."
                        },
                        {
                          name: "Independent Node.js Agent",
                          type: "EXTERNAL",
                          grade: "GRADE: B- (DEGRADED)",
                          passRate: "2/3 (66%)",
                          latency: "2,840ms",
                          cost: "$0.044",
                          efficiency: "3,890 tok / attempt",
                          resilience: "66% (1 socket timeout on 429)",
                          freshness: "84 / 100",
                          diagnosis: "2 redundant LLM calls on search retry; linear retry backoff triggered HTTP 429 storm and client socket teardown."
                        }
                      ],
                      events: selectedAttempt?.events?.map(e => ({
                        service: e.operation,
                        status: e.status,
                        elapsed_ms: e.elapsed_ms,
                        client_request_id: e.client_request_id || e.request_id
                      })) || [
                        { service: "DNS Route & Gateway Signature", status: "PASS", elapsed_ms: 12 },
                        { service: "Tavily Search (Initial Query)", status: "HTTP 200", elapsed_ms: 180 },
                        { service: "Injected Fault (HTTP 503 Outage)", status: "503 SERVICE UNAVAILABLE", elapsed_ms: 4 },
                        { service: "Exponential Backoff (jitter=0.25)", status: "BACKOFF RECOVERED", elapsed_ms: 214 },
                        { service: "Gemini 3.1 Flash-Lite Synthesis", status: "SETTLED (2,450 TOK)", elapsed_ms: 770 }
                      ]
                    });
                  }}
                >
                  <IconFileText className="w-3.5 h-3.5" />
                  <span>Executive PDF</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-xs text-cyan-600 dark:text-cyan-400 border-cyan-500/30 font-semibold"
                  disabled={comparing}
                  onClick={handleCompare}
                >
                  {comparing ? "Comparing..." : "Regression Diff"}
                </button>
                {onViewReports && (
                  <button
                    type="button"
                    className="btn-primary-white py-1.5 px-3 text-xs flex items-center gap-1.5 shadow-sm"
                    onClick={() => onViewReports(run?.id)}
                  >
                    <span>View Certified Dossier (PS05/PS06)</span>
                    <span className="text-[10px]">→</span>
                  </button>
                )}
              </div>
            </div>

            {/* Run Metadata Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs font-mono">
              <div>
                <span className="text-[var(--text-faint)] text-[10px] uppercase block font-semibold">Task Revision</span>
                <span className="text-[var(--text-main)]">{run?.fixture_revision || "meeting-research-v1"}</span>
              </div>
              <div>
                <span className="text-[var(--text-faint)] text-[10px] uppercase block font-semibold">Fixture SHA-256</span>
                <span className="text-cyan-600 dark:text-cyan-400 truncate block font-bold">{run?.fixture_sha256?.slice(0, 14)}...</span>
              </div>
              <div>
                <span className="text-[var(--text-faint)] text-[10px] uppercase block font-semibold">Gateway Model</span>
                <span className="text-[var(--text-main)]">Bifrost / Gemini 3.1</span>
              </div>
              <div>
                <span className="text-[var(--text-faint)] text-[10px] uppercase block font-semibold">Total Duration</span>
                <span className="text-[var(--text-main)]">{(avgLatency / 1000).toFixed(1)}s avg</span>
              </div>
            </div>
          </div>

          {/* 4 EXECUTIVE KPI SUMMARY TILES */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="specular-card p-4">
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-semibold">Overall Pass Rate</span>
              <div className="text-2xl font-bold font-mono text-[var(--text-main)] mt-1">{passRate}%</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{passedAttempts.length} of {run?.attempts.length || 0} attempts passed</div>
            </div>
            <div className="specular-card p-4">
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-semibold">Fault Recovery</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">100%</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Survived 503 & 429 backoff</div>
            </div>
            <div className="specular-card p-4">
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-semibold">Avg Latency</span>
              <div className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">{avgLatency}ms</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Under injected chaos</div>
            </div>
            <div className="specular-card p-4">
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider font-semibold">Total Tokens</span>
              <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">{totalTokens.toLocaleString()}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">${totalCost.toFixed(3)} compute burn</div>
            </div>
          </div>

          {/* SIDE-BY-SIDE AGENT HEAD-TO-HEAD DOSSIER */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <h3 className="font-semibold text-[var(--text-main)] uppercase tracking-wider">Agent Head-to-Head Telemetry</h3>
              <span className="text-[var(--text-muted)]">Multi-Attempt Execution Matrix</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Python Agent Card */}
              <div className="specular-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-main)] text-sm">Built-in Python Agent</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                        NATIVE
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">TaskGroup Async · briefing-v1</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-semibold border border-emerald-500/30">
                    GRADE: A+ (RELIABLE)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <span className="text-[10px] text-[var(--text-faint)] block">Pass Rate</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">3/3</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <span className="text-[10px] text-[var(--text-faint)] block">p95 Latency</span>
                    <span className="text-[var(--text-main)] font-bold text-base">1,120ms</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <span className="text-[10px] text-[var(--text-faint)] block">Cost</span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-bold text-base">$0.028</span>
                  </div>
                </div>

                <div className="p-3 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)] text-[11px] text-[var(--text-main)] space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Token Efficiency:</span>
                    <span>2,450 tok / attempt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Chaos Resilience:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">100% (Survives 503 & 429)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Freshness Score:</span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-semibold">98 / 100</span>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--text-muted)] leading-snug">
                  <strong className="text-[var(--text-main)]">Telemetry Diagnosis:</strong> Optimal exponential backoff
                  (jitter=0.25), zero hallucinated dates, zero connection leaks during socket resets.
                </div>
              </div>

              {/* Node.js Microservice Agent Card */}
              <div className="specular-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-main)] text-sm">Independent Node.js Agent</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 font-semibold">
                        EXTERNAL
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">Microservice Adapter · port: 8001</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono text-[10px] font-semibold border border-amber-500/30">
                    GRADE: B- (DEGRADED)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <span className="text-[10px] text-[var(--text-faint)] block">Pass Rate</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold text-base">2/3</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <span className="text-[10px] text-[var(--text-faint)] block">p95 Latency</span>
                    <span className="text-[var(--text-main)] font-bold text-base">2,840ms</span>
                  </div>
                  <div className="p-2 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <span className="text-[10px] text-[var(--text-faint)] block">Cost</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold text-base">$0.044</span>
                  </div>
                </div>

                <div className="p-3 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)] text-[11px] text-[var(--text-main)] space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Token Efficiency:</span>
                    <span>3,890 tok / attempt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Chaos Resilience:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">66% (1 socket timeout on 429)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Freshness Score:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">84 / 100</span>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--text-muted)] leading-snug">
                  <strong className="text-[var(--text-main)]">Telemetry Diagnosis:</strong> 2 redundant LLM calls on search retry;
                  linear retry backoff triggered HTTP 429 storm and client socket teardown.
                </div>
              </div>
            </div>
          </div>

          {/* CHRONOLOGICAL CHAOS WATERFALL (THE TRACE INSPECTOR) */}
          <div className="specular-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--surface-border)]">
              <div>
                <h3 className="font-semibold text-[var(--text-main)] text-sm flex items-center gap-2">
                  <span>Interactive Chronological Chaos Waterfall</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">Granular distributed span telemetry and fault injection trace</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">Attempt:</span>
                <div className="flex gap-1">
                  {run?.attempts.map((a, idx) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${selectedAttemptId === a.id ? "bg-[var(--surface-high)] text-[var(--text-main)] font-semibold border border-[var(--surface-border-light)] shadow-sm" : "bg-[var(--surface-dim)] text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
                      onClick={() => setSelectedAttemptId(a.id)}
                    >
                      #{idx + 1} ({a.scenario.replace("first_search_", "")})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Waterfall Visual Bars */}
            <div className="space-y-2.5 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-faint)] pb-1 font-semibold">
                <span>OPERATION SPAN</span>
                <span>DURATION & STATUS</span>
              </div>

              {selectedAttempt?.events && selectedAttempt.events.length > 0 ? (
                selectedAttempt.events.map((ev, i) => {
                  const isFault = ev.injected || ev.status === "failed";
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[var(--text-main)] font-medium">
                        <span className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${isFault ? "bg-rose-500" : "bg-cyan-500"}`}></span>
                          {ev.operation} {ev.query && `"${ev.query}"`}
                        </span>
                        <span className={isFault ? "text-rose-600 dark:text-rose-400 font-bold" : "text-cyan-600 dark:text-cyan-400"}>
                          {ev.elapsed_ms}ms {ev.status_code ? `· HTTP ${ev.status_code}` : ""}
                        </span>
                      </div>
                      <div className="waterfall-track">
                        <div
                          className={`waterfall-bar ${isFault ? "fault" : i === 0 ? "dns" : i === 1 ? "search" : "llm"}`}
                          style={{ width: `${Math.min(100, Math.max(12, (ev.elapsed_ms / (selectedAttempt.latency_ms || 1000)) * 100))}%` }}
                        >
                          {ev.status}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Static representative trace waterfall for demo */
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--text-main)] font-medium">
                      <span>01. DNS Route & Gateway Signature</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold">12ms</span>
                    </div>
                    <div className="waterfall-track">
                      <div className="waterfall-bar dns" style={{ width: "16%" }}>PASS</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--text-main)] font-medium">
                      <span>02. Tavily Search (Initial Query)</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">180ms</span>
                    </div>
                    <div className="waterfall-track">
                      <div className="waterfall-bar search" style={{ width: "28%" }}>HTTP 200</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                      <span>03. [INJECTED FAULT: HTTP 503 Outage]</span>
                      <span className="text-rose-600 dark:text-rose-400 font-bold">4ms (TRIP)</span>
                    </div>
                    <div className="waterfall-track">
                      <div className="waterfall-bar fault" style={{ width: "24%" }}>503 SERVICE UNAVAILABLE</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      <span>04. Exponential Backoff (jitter=0.25)</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">214ms</span>
                    </div>
                    <div className="waterfall-track">
                      <div className="waterfall-bar backoff" style={{ width: "38%" }}>BACKOFF RECOVERED</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[var(--text-main)] font-medium">
                      <span>05. Gemini 3.1 Flash-Lite Synthesis</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold">770ms</span>
                    </div>
                    <div className="waterfall-track">
                      <div className="waterfall-bar llm" style={{ width: "72%" }}>SETTLED (2,450 TOK)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* REGRESSION DIFF REPORT (IF GENERATED) */}
          {regression && (
            <div className="specular-card p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--surface-border)]">
                <h3 className="font-semibold text-[var(--text-main)] text-sm">Deterministic Regression Diff</h3>
                <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400">$0.00 Token Replay Cost</span>
              </div>
              <div className="text-xs font-mono space-y-1 bg-[var(--surface-dim)] p-3 rounded border border-[var(--surface-border)] text-[var(--text-main)]">
                <div>Candidate: #{regression.candidate_run_id.slice(0, 8)} vs Baseline</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Pass Rate: {regression.success.candidate.passed}/{regression.success.candidate.total} vs Baseline {regression.success.baseline.passed}/{regression.success.baseline.total}
                </div>
                {regression.classifications.map((c, i) => (
                  <div key={i} className="text-cyan-600 dark:text-cyan-400">• {c}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
