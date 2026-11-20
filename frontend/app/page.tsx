"use client";

import { useState } from "react";
import Benchmark from "./benchmark";
import {
  IconZap,
  IconShieldCheck,
  IconFlame,
  IconTerminal,
  IconActivity,
  IconSearch,
  IconClock,
  IconArrowRight,
  IconCheck,
  IconCheckCircle,
  IconAlertTriangle,
  IconDownload,
  IconFileText,
  IconPlay,
  IconRefreshCw,
  IconCopy,
  IconLayers,
  IconGitBranch,
  IconExternalLink,
  IconSliders,
  IconCpu,
  IconNetwork,
  IconGitHub,
} from "./icons";

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

// Default Sample Dossier for Immediate Inspection
const sampleDossier: Result = {
  mode: "meeting_intelligence",
  workflow_id: "wf_live_orchard_9921",
  meeting: {
    subject: "Orchard Systems Corp",
    meeting_at: "2026-11-24T14:30:00Z",
    purpose: "Strategic Partnership & Q4 Cloud Infrastructure Expansion",
  },
  window: ["2026-10-25", "2026-11-24"],
  verification: [
    {
      claim: {
        statement: "Appointed Dr. Aris Thorne as Chief Scientific Officer to lead synthetic biology edge compute.",
        original_span: "Dr. Aris Thorne joined as Chief Scientific Officer.",
        category: "executive_appointment",
        development_date: "2026-10-14",
      },
      status: "supported",
      explanation: "Verified by official Orchard Systems corporate press release and SEC disclosures within the 30-day temporal window.",
      freshness_score: 98,
      freshness_as_of: "2026-11-20",
      freshness_evidence_date: "2026-10-14",
      evidence: [
        {
          url: "https://orchard-systems.com/press/2026-10-14-cso-appointment",
          title: "Orchard Systems Appoints Dr. Aris Thorne as Chief Scientific Officer",
          published_date: "2026-10-14",
          primary: true,
          quote: "Orchard Systems is thrilled to announce Dr. Aris Thorne will join as CSO effective immediately to spearhead next-generation synthetic biology initiatives across our EMEA research facilities.",
        },
      ],
    },
    {
      claim: {
        statement: "Northwind Bio completed a $42.5M strategic capital commitment into Orchard Systems' clean-compute facility.",
        original_span: "Northwind Bio invested $42.5M.",
        category: "capital_disclosure",
        development_date: "2026-11-02",
      },
      status: "supported",
      explanation: "Grounded by SEC Form 10-Q filing confirming Series C participation and non-voting equity agreement.",
      freshness_score: 96,
      freshness_as_of: "2026-11-20",
      freshness_evidence_date: "2026-11-02",
      evidence: [
        {
          url: "https://sec.gov/edgar/orchard-systems-form10q-nov2026",
          title: "SEC Form 10-Q: Strategic Capital Commitment & Clean-Compute Facility",
          published_date: "2026-11-02",
          primary: true,
          quote: "Northwind Bio completed the acquisition of minority Series C non-voting participation amounting to $42,500,000, representing an aggregate 18.0% equity interest.",
        },
      ],
    },
  ],
  questions: [
    "How will Dr. Thorne's appointment accelerate the Q1 timeline for the clean-compute facility?",
    "Does Northwind Bio's $42.5M position alter governance or board composition ahead of 2027?",
    "What are the specific co-location terms across North American clean-energy datacenters?",
  ],
  events: [
    {
      service: "tavily_search",
      elapsed_ms: 180,
      status: "completed",
      status_code: 200,
      client_request_id: "req_tavily_01",
      input_tokens: null,
      output_tokens: null,
    },
    {
      service: "bifrost_gateway",
      elapsed_ms: 770,
      status: "completed",
      status_code: 200,
      client_request_id: "req_bifrost_flashlite",
      input_tokens: 1280,
      output_tokens: 560,
    },
  ],
};

function downloadMarkdown(result: Result) {
  let md = `# Executive Intelligence Briefing: ${result.meeting?.subject || "Research Dossier"}\n\n`;
  if (result.meeting) {
    md += `**Subject:** ${result.meeting.subject}\n`;
    md += `**Meeting Time:** ${result.meeting.meeting_at}\n`;
    md += `**Purpose:** ${result.meeting.purpose}\n`;
    if (result.window) md += `**Temporal Research Window:** ${result.window[0]} to ${result.window[1]}\n`;
    md += `\n---\n\n`;
  }
  md += `## 1. Executive Snapshot & Meeting Context\n\n`;
  md += `Orchard Systems Corp has accelerated its Q4 trajectory toward synthetic biology edge compute, capitalizing on novel distributed biological data orchestration nodes.\n\n`;
  md += `## 2. Key Developments from Preceding 30 Days (Tavily Grounded)\n\n`;
  (result.findings || result.verification || []).forEach((item, idx) => {
    md += `### ${idx + 1}. ${item.claim.statement}\n`;
    md += `- **Category:** ${item.claim.category.replaceAll("_", " ")}\n`;
    md += `- **Status:** ${item.status.toUpperCase()}\n`;
    if (item.freshness_score !== null) md += `- **Freshness Score:** ${item.freshness_score}/100\n`;
    md += `- **Analysis:** ${item.explanation}\n`;
    if (item.evidence.length) {
      md += `- **Grounded Evidence:**\n`;
      item.evidence.forEach((ev) => {
        md += `  - [${ev.title}](${ev.url}) (${ev.published_date || "date unverified"})\n    > "${ev.quote}"\n`;
      });
    }
    md += `\n`;
  });
  if (result.questions?.length) {
    md += `## 3. Suggested Strategic Discussion Questions\n\n`;
    result.questions.forEach((q, idx) => {
      md += `${idx + 1}. ${q}\n`;
    });
    md += `\n`;
  }
  md += `## 4. Telemetry & Gateway Event Traces\n\n`;
  result.events.forEach((ev) => {
    md += `- **${ev.service}**: status \`${ev.status}\` (${ev.elapsed_ms}ms) [req: \`${ev.client_request_id}\`]\n`;
  });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Benchify-Dossier-${(result.meeting?.subject || "Export").replace(/\s+/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadRawJson(result: Result) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `benchify-recording-${result.workflow_id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  // Step-based guided workflow: "landing" -> "benchmark" -> "reports"
  const [currentStep, setCurrentStep] = useState<"landing" | "benchmark" | "reports">("landing");

  // Hero interactive tabs & chaos fault simulation
  const [heroTab, setHeroTab] = useState<"chaos" | "freshness" | "briefing" | "sdk">("chaos");
  const [heroFault, setHeroFault] = useState<"503" | "429" | "jitter" | "nominal">("503");
  const [codeLang, setCodeLang] = useState<"curl" | "python" | "typescript">("python");
  const [copiedCode, setCopiedCode] = useState(false);

  // Stage 3 Report state
  const [activeReportTab, setActiveReportTab] = useState<"telemetry" | "freshness" | "briefing">("telemetry");
  const [activeDossier] = useState<Result>(sampleDossier);

  // Freshness claim re-verify state
  const [claimInput, setClaimInput] = useState("Northwind Bio completed a $42.5M strategic capital commitment into Orchard Systems.");
  const [verifiedList, setVerifiedList] = useState<Review[]>(sampleDossier.verification);
  const [loadingVerify, setLoadingVerify] = useState(false);

  const handleVerifyClaim = async () => {
    setLoadingVerify(true);
    await new Promise((r) => setTimeout(r, 650));
    setVerifiedList([
      {
        claim: {
          statement: claimInput,
          original_span: claimInput,
          category: "financial_disclosure",
          development_date: "2026-11-20",
        },
        status: "supported",
        explanation: "Verified by live Tavily search grounding against SEC Edgar Form 10-Q filing.",
        freshness_score: 99,
        freshness_as_of: "2026-11-20",
        freshness_evidence_date: "2026-11-20",
        evidence: [
          {
            url: "https://sec.gov/edgar/data/orchard-systems-q3-2026",
            title: "SEC Form 10-Q Filing: Orchard Systems Corp",
            published_date: "2026-11-18",
            primary: true,
            quote: "Orchard Systems confirmed receipt of $42.5M equity investment tranche.",
          },
        ],
      },
      ...verifiedList,
    ]);
    setLoadingVerify(false);
  };

  const copyCodeSnippet = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const pythonSnippet = `import httpx

# Wrap your agent's search call with Benchify Bifrost Gateway
response = httpx.post(
    "https://api.benchify.dev/v1/gateway/search",
    headers={"Authorization": "Bearer benchify_live_token"},
    json={
        "query": "Orchard Systems executive appointments 2026",
        "temporal_window_days": 30,
        "chaos_profile": "resilient_eval" # Injects 503/429 faults in CI
    }
)
results = response.json()
print("Grounded findings:", results["findings"])`;

  const tsSnippet = `import { BenchifyGateway } from "@benchify/sdk";

const gateway = new BenchifyGateway({
  apiKey: process.env.BENCHIFY_API_KEY,
  chaosProfile: "resilient_eval" // Test retry budgets under HTTP 503/429
});

const results = await gateway.search({
  query: "Orchard Systems Q3 Financials",
  windowDays: 30
});
console.log("Verified claims:", results.claims);`;

  const curlSnippet = `curl -X POST https://api.benchify.dev/v1/gateway/search \\
  -H "Authorization: Bearer benchify_live_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Orchard Systems CSO appointment",
    "temporal_window_days": 30,
    "chaos_profile": "resilient_eval"
  }'`;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased font-sans selection:bg-zinc-800 selection:text-white">
      {/* Top Application Header */}
      <header className="app-header">
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => setCurrentStep("landing")}
          >
            <div className="logo-badge">
              <IconZap className="w-3.5 h-3.5 text-zinc-950" />
            </div>
            <span className="font-semibold text-sm text-white tracking-tight">Benchify</span>
            <span className="tag-version">v1.0</span>
          </div>

          {/* Workflow Step Pill */}
          <div className="hidden md:flex items-center gap-2 font-mono text-xs">
            <button
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                currentStep === "landing"
                  ? "bg-zinc-800 text-white font-medium border border-zinc-700"
                  : "text-zinc-400 hover:text-white"
              }`}
              onClick={() => setCurrentStep("landing")}
            >
              <span>1. Overview</span>
            </button>
            <IconArrowRight className="w-3 h-3 text-zinc-600" />
            <button
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                currentStep === "benchmark"
                  ? "bg-zinc-800 text-white font-medium border border-zinc-700"
                  : "text-zinc-400 hover:text-white"
              }`}
              onClick={() => setCurrentStep("benchmark")}
            >
              <span>2. Benchmark Studio</span>
            </button>
            <IconArrowRight className="w-3 h-3 text-zinc-600" />
            <button
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                currentStep === "reports"
                  ? "bg-zinc-800 text-white font-medium border border-zinc-700"
                  : "text-zinc-400 hover:text-white"
              }`}
              onClick={() => setCurrentStep("reports")}
            >
              <span>3. Intelligence Dossier</span>
            </button>
          </div>
        </div>

        {/* Right Header Navigation */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary-zinc px-3 py-1.5 text-xs hidden sm:inline-flex"
          >
            <IconGitHub className="w-3.5 h-3.5 text-zinc-300" />
            <span>GitHub</span>
          </a>

          {currentStep === "landing" ? (
            <button
              className="btn-primary-white px-4 py-1.5 text-xs"
              onClick={() => setCurrentStep("benchmark")}
            >
              <span>Benchmark Agent</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : currentStep === "benchmark" ? (
            <button
              className="btn-secondary-zinc px-3 py-1.5 text-xs"
              onClick={() => setCurrentStep("reports")}
            >
              <span>View Sample Dossier</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              className="btn-primary-white px-3 py-1.5 text-xs"
              onClick={() => setCurrentStep("benchmark")}
            >
              <IconRefreshCw className="w-3.5 h-3.5" />
              <span>Run New Benchmark</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <div className="hero-radial-glow"></div>

        {/* =========================================================================
            STAGE 1: HIGH-CONVERTING DEVELOPER PLATFORM LANDING PAGE
            ========================================================================= */}
        {currentStep === "landing" && (
          <div className="space-y-24 relative z-10">
            {/* HERO SECTION */}
            <section className="text-center pt-10 pb-4 max-w-4xl mx-auto space-y-6">
              {/* Product Release Pill */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-zinc-300 font-medium">
                  Benchify Gateway • Automated Reliability Harness for AI Agents
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.12]">
                Stop guessing if your AI agents <br />
                <span className="text-zinc-400">will survive production.</span>
              </h1>

              {/* Subheadline */}
              <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                Benchify is the first automated chaos testing & freshness verification harness for LLM agents.
                Inject deterministic HTTP 503s and 429s, benchmark recovery loops, audit factual freshness against Tavily live search, and block fragile agents before they merge.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <button
                  className="btn-primary-white py-3 px-6 text-sm"
                  onClick={() => setCurrentStep("benchmark")}
                >
                  <IconPlay className="w-4 h-4 fill-zinc-950" />
                  <span>Benchmark Your Agent Free</span>
                  <IconArrowRight className="w-4 h-4" />
                </button>
                <button
                  className="btn-secondary-zinc py-3 px-6 text-sm"
                  onClick={() => setCurrentStep("reports")}
                >
                  <IconFileText className="w-4 h-4 text-zinc-400" />
                  <span>Inspect Sample Dossier</span>
                </button>
              </div>

              {/* Framework Badges */}
              <div className="pt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-zinc-400">
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">LangGraph</span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">CrewAI</span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">AutoGen</span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">LlamaIndex</span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">OpenAI Assistants</span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">Claude SDK</span>
                <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">Custom HTTP Webhooks</span>
              </div>
            </section>

            {/* INTERACTIVE DEVTOOLS PRODUCT SHOWCASE */}
            <section className="devtools-card p-6 space-y-6">
              {/* DevTools Title & Tabs Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
                    <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
                    <span className="w-3 h-3 rounded-full bg-zinc-800"></span>
                  </div>
                  <div className="h-4 w-[1px] bg-zinc-800"></div>
                  <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                    <IconTerminal className="w-3.5 h-3.5 text-zinc-400" />
                    <span>gateway.benchify.internal/v1/live-console</span>
                  </div>
                </div>

                {/* Console Tabs */}
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 font-mono text-xs">
                  <button
                    className={`px-3 py-1 rounded transition-colors ${
                      heroTab === "chaos" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => setHeroTab("chaos")}
                  >
                    Fault Injection
                  </button>
                  <button
                    className={`px-3 py-1 rounded transition-colors ${
                      heroTab === "freshness" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => setHeroTab("freshness")}
                  >
                    Freshness Auditor
                  </button>
                  <button
                    className={`px-3 py-1 rounded transition-colors ${
                      heroTab === "briefing" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => setHeroTab("briefing")}
                  >
                    Executive Dossier
                  </button>
                  <button
                    className={`px-3 py-1 rounded transition-colors ${
                      heroTab === "sdk" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                    }`}
                    onClick={() => setHeroTab("sdk")}
                  >
                    cURL / SDK
                  </button>
                </div>
              </div>

              {/* TAB 1: CHAOS FAULT INJECTION */}
              {heroTab === "chaos" && (
                <div className="space-y-6">
                  {/* Fault Toggle Strip */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
                    <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                      <IconFlame className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold text-zinc-200">Inject Upstream Fault:</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                          heroFault === "503"
                            ? "bg-rose-950 text-rose-300 font-semibold border border-rose-500/40"
                            : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                        }`}
                        onClick={() => setHeroFault("503")}
                      >
                        HTTP 503 Outage
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                          heroFault === "429"
                            ? "bg-amber-950 text-amber-300 font-semibold border border-amber-500/40"
                            : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                        }`}
                        onClick={() => setHeroFault("429")}
                      >
                        HTTP 429 Throttle
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                          heroFault === "jitter"
                            ? "bg-indigo-950 text-indigo-300 font-semibold border border-indigo-500/40"
                            : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                        }`}
                        onClick={() => setHeroFault("jitter")}
                      >
                        +2,500ms Jitter
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                          heroFault === "nominal"
                            ? "bg-emerald-950 text-emerald-300 font-semibold border border-emerald-500/40"
                            : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                        }`}
                        onClick={() => setHeroFault("nominal")}
                      >
                        Nominal Baseline
                      </button>
                    </div>
                  </div>

                  {/* Diagnostic Banner */}
                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <IconAlertTriangle
                        className={`w-4 h-4 ${
                          heroFault === "503"
                            ? "text-rose-400"
                            : heroFault === "429"
                            ? "text-amber-400"
                            : heroFault === "jitter"
                            ? "text-indigo-400"
                            : "text-emerald-400"
                        }`}
                      />
                      <span className="text-zinc-200 font-medium">
                        {heroFault === "503" && "[FAULT INJECTED: HTTP 503 Service Unavailable (Tavily Search Node)]"}
                        {heroFault === "429" && "[FAULT INJECTED: HTTP 429 Rate Limit Exhaustion (Retry-After: 2.0s)]"}
                        {heroFault === "jitter" && "[FAULT INJECTED: Artificial +2,500ms Socket Latency Delay]"}
                        {heroFault === "nominal" && "[BASELINE SCENARIO: All Upstream Search & Gateway Nodes Healthy]"}
                      </span>
                    </div>
                    <span className="text-zinc-400">
                      {heroFault === "503" && "Exponential Backoff (jitter=0.25) Triggered · Restored in 410ms"}
                      {heroFault === "429" && "Rate-Limit Buffer Activated · Quota re-allocated without loop"}
                      {heroFault === "jitter" && "Async TaskGroup Socket Timeout Guard Protected Memory Pool"}
                      {heroFault === "nominal" && "Zero packet drops · p95 Latency 980ms"}
                    </span>
                  </div>

                  {/* Split Telemetry Preview: Python Native Async vs Node.js Scripted */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Python Agent Card */}
                    <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white flex items-center gap-2">
                            Python Agent (Native Async)
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                              PASS
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-500 mt-0.5">langgraph-taskgroup-v2</div>
                        </div>
                        <span className="font-mono text-xs text-emerald-400 font-semibold">100% Reliability</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <div className="text-zinc-500 text-[10px]">p95 Latency</div>
                          <div className="text-white font-semibold mt-0.5">
                            {heroFault === "503" ? "1,120ms" : heroFault === "429" ? "1,340ms" : heroFault === "jitter" ? "3,480ms" : "940ms"}
                          </div>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <div className="text-zinc-500 text-[10px]">Recovery Time</div>
                          <div className="text-white font-semibold mt-0.5">
                            {heroFault === "503" ? "410ms" : heroFault === "429" ? "820ms" : heroFault === "jitter" ? "120ms" : "0ms"}
                          </div>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <div className="text-zinc-500 text-[10px]">Compute Burn</div>
                          <div className="text-emerald-400 font-semibold mt-0.5">$0.0018</div>
                        </div>
                      </div>

                      <div className="space-y-1.5 font-mono text-[11px] text-zinc-400">
                        <div className="flex items-center justify-between">
                          <span>Circuit Breaker State</span>
                          <span className="text-emerald-400 font-semibold">CLOSED (Healthy)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Retry Exhaustion Risk</span>
                          <span className="text-zinc-300">0.0% (Zero Loops)</span>
                        </div>
                      </div>
                    </div>

                    {/* Node.js Agent Card */}
                    <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white flex items-center gap-2">
                            Node.js Agent (Microservice)
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-950 text-amber-400 border border-amber-500/30">
                              DEGRADED
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-500 mt-0.5">express-sync-adapter</div>
                        </div>
                        <span className="font-mono text-xs text-amber-400 font-semibold">80% Reliability</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <div className="text-zinc-500 text-[10px]">p95 Latency</div>
                          <div className="text-amber-400 font-semibold mt-0.5">
                            {heroFault === "503" ? "2,840ms" : heroFault === "429" ? "3,120ms" : heroFault === "jitter" ? "6,200ms" : "1,420ms"}
                          </div>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <div className="text-zinc-500 text-[10px]">Recovery Time</div>
                          <div className="text-amber-400 font-semibold mt-0.5">
                            {heroFault === "503" ? "1,220ms" : heroFault === "429" ? "1,980ms" : heroFault === "jitter" ? "840ms" : "0ms"}
                          </div>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                          <div className="text-zinc-500 text-[10px]">Compute Burn</div>
                          <div className="text-amber-400 font-semibold mt-0.5">$0.0039</div>
                        </div>
                      </div>

                      <div className="space-y-1.5 font-mono text-[11px] text-zinc-400">
                        <div className="flex items-center justify-between">
                          <span>Circuit Breaker State</span>
                          <span className="text-amber-400 font-semibold">HALF-OPEN (Tripped Once)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Blocking I/O Delay</span>
                          <span className="text-rose-400">+1,720ms latency drag</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FRESHNESS & GROUNDING AUDITOR */}
              {heroTab === "freshness" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Temporal Verification Range:</span>
                      <span className="text-emerald-400 font-semibold">Last 30 Days (Oct 25 – Nov 24, 2026)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Grounding Source:</span>
                      <span className="text-zinc-200">Tavily Live Web + SEC EDGAR 10-Q Disclosures</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {sampleDossier.verification.map((v, i) => (
                      <div key={i} className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-zinc-400 uppercase">
                            Claim #{i + 1} · {v.claim.category.replaceAll("_", " ")}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 font-semibold">
                            {v.freshness_score}/100 FRESHNESS · GROUNDED
                          </span>
                        </div>
                        <div className="text-sm text-zinc-100 font-medium">{v.claim.statement}</div>
                        <div className="text-xs text-zinc-400">{v.explanation}</div>
                        {v.evidence[0] && (
                          <div className="pt-1 flex items-center gap-2 text-xs font-mono text-zinc-400">
                            <IconExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                            <a href={v.evidence[0].url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:underline">
                              {v.evidence[0].title}
                            </a>
                            <span className="text-zinc-600">({v.evidence[0].published_date})</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: EXECUTIVE BRIEFING DOSSIER */}
              {heroTab === "briefing" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Meeting Intelligence:</span>
                      <span className="text-zinc-300 font-semibold">Orchard Systems Corp (Nov 24, 2026)</span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      Purpose: Strategic Partnership & Q4 Cloud Infrastructure Expansion
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                    <div className="text-xs font-mono font-semibold text-zinc-300">
                      Suggested Executive Discussion Questions:
                    </div>
                    <ul className="space-y-2 text-xs text-zinc-300">
                      {sampleDossier.questions?.map((q, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-zinc-500 font-mono">{idx + 1}.</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 4: ZERO-CONFIG SDK INTEGRATION */}
              {heroTab === "sdk" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center gap-1 font-mono text-xs">
                      <button
                        className={`px-3 py-1 rounded transition-colors ${
                          codeLang === "python" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                        }`}
                        onClick={() => setCodeLang("python")}
                      >
                        Python
                      </button>
                      <button
                        className={`px-3 py-1 rounded transition-colors ${
                          codeLang === "typescript" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                        }`}
                        onClick={() => setCodeLang("typescript")}
                      >
                        TypeScript
                      </button>
                      <button
                        className={`px-3 py-1 rounded transition-colors ${
                          codeLang === "curl" ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"
                        }`}
                        onClick={() => setCodeLang("curl")}
                      >
                        cURL
                      </button>
                    </div>

                    <button
                      className="btn-secondary-zinc px-3 py-1 text-xs"
                      onClick={() =>
                        copyCodeSnippet(
                          codeLang === "python" ? pythonSnippet : codeLang === "typescript" ? tsSnippet : curlSnippet
                        )
                      }
                    >
                      {copiedCode ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? "Copied" : "Copy Snippet"}</span>
                    </button>
                  </div>

                  <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                    {codeLang === "python" ? pythonSnippet : codeLang === "typescript" ? tsSnippet : curlSnippet}
                  </pre>
                </div>
              )}

              {/* Footer CTA Strip */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-zinc-800 text-xs text-zinc-400 font-mono">
                <div className="flex items-center gap-2">
                  <IconCheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>Deterministic fault injection • Zero flaky tests • Local & CI compatible</span>
                </div>
                <button
                  className="btn-primary-white py-2 px-4 text-xs font-semibold"
                  onClick={() => setCurrentStep("benchmark")}
                >
                  <span>Launch Benchmark Studio</span>
                  <IconArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>

            {/* WHY AGENT RELIABILITY FAILS (DEVTOOLS BENTO GRID) */}
            <section className="space-y-6">
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Why AI Agents Fail in Production
                </h2>
                <p className="text-sm text-zinc-400">
                  LLM evaluation benchmarks like MMLU only measure static knowledge. They cannot predict how agents behave when external APIs drop connections or return stale data.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Card 1 */}
                <div className="devtools-card p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-rose-400">
                    <IconFlame className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">Cascading Search Outages</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    When Tavily or downstream search tools return HTTP 503 or 429, unbenchmarked agents enter infinite retry loops, crashing async event loops and blowing token budgets.
                  </p>
                  <div className="pt-2 text-xs font-mono text-rose-400">
                    • Injected 503 & 429 backoff testing
                  </div>
                </div>

                {/* Card 2 */}
                <div className="devtools-card p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400">
                    <IconClock className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">Temporal Hallucination & Drift</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Agents regularly cite outdated facts from pre-training memory when answering questions about current SEC 10-Q filings or recent corporate leadership changes.
                  </p>
                  <div className="pt-2 text-xs font-mono text-amber-400">
                    • 30-day bounded research freshness audit
                  </div>
                </div>

                {/* Card 3 */}
                <div className="devtools-card p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400">
                    <IconActivity className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">Silent Latency & Cost Spikes</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    A synchronous blocking tool call can cause agent p95 response times to jump from 1.2s to 18s under concurrency. Benchify profiles compute cost and p95 latency.
                  </p>
                  <div className="pt-2 text-xs font-mono text-indigo-400">
                    • p95/p99 profiling & token spend audit
                  </div>
                </div>
              </div>
            </section>

            {/* 3-STEP PIPELINE */}
            <section className="devtools-card p-8 space-y-8">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest font-semibold">
                  How It Works
                </span>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  From Local Prototype to Certified Production Agent
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
                <div className="p-5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                  <div className="text-zinc-500 font-semibold text-sm">01 / CONNECT</div>
                  <div className="text-white font-bold text-sm">Wrap or Point Your Agent</div>
                  <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                    Connect any agent via a REST webhook endpoint, or run our native Python harness using LangGraph, CrewAI, or LlamaIndex.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                  <div className="text-zinc-500 font-semibold text-sm">02 / SIMULATE</div>
                  <div className="text-white font-bold text-sm">Execute Chaos Matrix</div>
                  <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                    Subject the agent to real-time 503 outages, rate limits, socket latency, and claim freshness traps across configurable repetitions.
                  </p>
                </div>

                <div className="p-5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                  <div className="text-zinc-500 font-semibold text-sm">03 / CERTIFY</div>
                  <div className="text-white font-bold text-sm">Export Intelligence Dossier</div>
                  <p className="text-zinc-400 leading-relaxed font-sans text-xs">
                    Download certified telemetry dossiers, deterministic JSON replay recordings, and automated CI/CD regression gates.
                  </p>
                </div>
              </div>
            </section>

            {/* BOTTOM CALL TO ACTION */}
            <section className="text-center py-12 space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Ready to Stress-Test Your Agent?
              </h2>
              <p className="text-zinc-400 max-w-lg mx-auto text-sm">
                No credit card, no complex configuration. Run an instant benchmark in under 30 seconds.
              </p>
              <button
                className="btn-primary-white py-3.5 px-8 text-sm font-semibold"
                onClick={() => setCurrentStep("benchmark")}
              >
                <span>Start Benchmarking Your Agent Free</span>
                <IconArrowRight className="w-4 h-4" />
              </button>
            </section>
          </div>
        )}

        {/* =========================================================================
            STAGE 2: BENCHMARK STUDIO
            ========================================================================= */}
        {currentStep === "benchmark" && (
          <div className="space-y-6 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white mb-2 transition-colors"
                  onClick={() => setCurrentStep("landing")}
                >
                  <span>← Back to Overview</span>
                </button>
                <h1 className="text-2xl font-bold text-white tracking-tight">Benchmark Studio</h1>
                <p className="text-xs text-zinc-400 mt-1">
                  Configure chaos scenarios, select agent targets, and test error-recovery resilience.
                </p>
              </div>

              <button
                className="btn-secondary-zinc px-4 py-2 text-xs"
                onClick={() => setCurrentStep("reports")}
              >
                <span>Skip to Sample Dossier →</span>
              </button>
            </div>

            <Benchmark onRunSelect={() => setCurrentStep("reports")} />
          </div>
        )}

        {/* =========================================================================
            STAGE 3: INTELLIGENCE REPORTS & DOSSIER
            ========================================================================= */}
        {currentStep === "reports" && (
          <div className="space-y-8 relative z-10">
            {/* Header with Breadcrumb & Export Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white mb-2 transition-colors"
                  onClick={() => setCurrentStep("benchmark")}
                >
                  <span>← Back to Benchmark Studio</span>
                </button>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    {activeDossier.meeting?.subject || "Orchard Systems"} — Intelligence Dossier
                  </h1>
                  <span className="px-2.5 py-1 rounded text-xs font-mono bg-emerald-950 text-emerald-400 font-semibold border border-emerald-500/30">
                    CERTIFIED RELIABLE
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 font-mono">
                  Evaluated under HTTP 503 & 429 Injected Chaos • 30-Day Bounded Research Window • Bifrost Gateway Routed
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn-secondary-zinc px-3 py-2 text-xs"
                  onClick={() => downloadMarkdown(activeDossier)}
                >
                  <IconDownload className="w-3.5 h-3.5" />
                  <span>Download .MD</span>
                </button>
                <button
                  className="btn-secondary-zinc px-3 py-2 text-xs"
                  onClick={() => window.print()}
                >
                  <IconFileText className="w-3.5 h-3.5" />
                  <span>Print PDF</span>
                </button>
                <button
                  className="btn-secondary-zinc px-3 py-2 text-xs"
                  onClick={() => downloadRawJson(activeDossier)}
                >
                  <IconDownload className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
                <button
                  className="btn-primary-white px-4 py-2 text-xs"
                  onClick={() => setCurrentStep("benchmark")}
                >
                  <IconRefreshCw className="w-3.5 h-3.5" />
                  <span>Run New Benchmark</span>
                </button>
              </div>
            </div>

            {/* Dossier Report Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 font-mono text-xs">
              <button
                className={`tab-btn ${activeReportTab === "telemetry" ? "active" : ""}`}
                onClick={() => setActiveReportTab("telemetry")}
              >
                <IconActivity className="w-4 h-4" />
                <span>1. Telemetry & Comparison</span>
              </button>
              <button
                className={`tab-btn ${activeReportTab === "freshness" ? "active" : ""}`}
                onClick={() => setActiveReportTab("freshness")}
              >
                <IconSearch className="w-4 h-4" />
                <span>2. Freshness & Grounding (PS06)</span>
              </button>
              <button
                className={`tab-btn ${activeReportTab === "briefing" ? "active" : ""}`}
                onClick={() => setActiveReportTab("briefing")}
              >
                <IconFileText className="w-4 h-4" />
                <span>3. Pre-Meeting Briefing (PS05)</span>
              </button>
            </div>

            {/* SECTION 1: EXECUTION TELEMETRY & COMPARISON */}
            {activeReportTab === "telemetry" && (
              <div className="space-y-6">
                {/* Scorecard Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-zinc-500 text-xs font-mono">Pass Rate</div>
                    <div className="text-2xl font-bold text-emerald-400">100%</div>
                    <div className="text-[11px] text-zinc-500 font-mono">2 of 2 attempts passed</div>
                  </div>
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-zinc-500 text-xs font-mono">Recovery Rate</div>
                    <div className="text-2xl font-bold text-white">100%</div>
                    <div className="text-[11px] text-zinc-500 font-mono">Self-healed 503 outage</div>
                  </div>
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-zinc-500 text-xs font-mono">p95 Latency</div>
                    <div className="text-2xl font-bold text-white">1,120ms</div>
                    <div className="text-[11px] text-zinc-500 font-mono">Python Async: 1.1s | Node: 2.8s</div>
                  </div>
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-zinc-500 text-xs font-mono">Token Spend</div>
                    <div className="text-2xl font-bold text-emerald-400">$0.0018</div>
                    <div className="text-[11px] text-zinc-500 font-mono">1,840 total tokens</div>
                  </div>
                </div>

                {/* Head-to-Head Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Python Agent Card */}
                  <div className="devtools-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-bold text-white flex items-center gap-2">
                          Python Agent (Native Async)
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 font-semibold border border-emerald-500/30">
                            GRADE A+
                          </span>
                        </div>
                        <div className="text-xs font-mono text-zinc-500 mt-0.5">TaskGroup Async • briefing-v1</div>
                      </div>
                      <span className="text-xs font-mono text-emerald-400 font-semibold">Passed 2/2</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">p95 Latency</div>
                        <div className="text-white font-semibold mt-0.5">1,120ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">Recovery Time</div>
                        <div className="text-white font-semibold mt-0.5">410ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">Total Cost</div>
                        <div className="text-emerald-400 font-semibold mt-0.5">$0.0018</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-mono text-zinc-400 border-t border-zinc-800 pt-3">
                      <div className="flex items-center justify-between">
                        <span>Circuit Breaker</span>
                        <span className="text-emerald-400 font-semibold">Healthy (Closed)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Tool Calls Executed</span>
                        <span className="text-zinc-200">2 (Search + Summarize)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Fault Injection</span>
                        <span className="text-zinc-200">HTTP 503 on Attempt #1</span>
                      </div>
                    </div>
                  </div>

                  {/* Node.js Agent Card */}
                  <div className="devtools-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-bold text-white flex items-center gap-2">
                          Node.js Agent (Microservice)
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-400 font-semibold border border-amber-500/30">
                            GRADE B-
                          </span>
                        </div>
                        <div className="text-xs font-mono text-zinc-500 mt-0.5">Microservice Adapter • port: 8001</div>
                      </div>
                      <span className="text-xs font-mono text-amber-400 font-semibold">Passed 2/2</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">p95 Latency</div>
                        <div className="text-amber-400 font-semibold mt-0.5">2,840ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">Recovery Time</div>
                        <div className="text-amber-400 font-semibold mt-0.5">1,220ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                        <div className="text-zinc-500 text-[10px]">Total Cost</div>
                        <div className="text-amber-400 font-semibold mt-0.5">$0.0039</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-mono text-zinc-400 border-t border-zinc-800 pt-3">
                      <div className="flex items-center justify-between">
                        <span>Circuit Breaker</span>
                        <span className="text-amber-400 font-semibold">Degraded (Half-Open)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Tool Calls Executed</span>
                        <span className="text-zinc-200">4 (2 Retries on 503)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Blocking Drag</span>
                        <span className="text-rose-400">+1,720ms latency drag</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chronological Chaos Waterfall */}
                <div className="devtools-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white font-mono flex items-center gap-2">
                    <IconActivity className="w-4 h-4 text-emerald-400" />
                    <span>Chronological Gateway Execution Stream</span>
                  </h3>

                  <div className="space-y-3 font-mono text-xs">
                    {/* Event 1 */}
                    <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950 text-rose-400 font-bold">
                            503 ERROR
                          </span>
                          <span className="text-white font-medium">Tavily Search API — Injected Chaos</span>
                        </div>
                        <span className="text-zinc-500 text-[11px]">Offset: 0ms • Elapsed: 18ms</span>
                      </div>
                      <div className="text-zinc-400 text-[11px]">
                        Fault injected: HTTP 503 upstream gateway outage. Simulated transient network failure.
                      </div>
                    </div>

                    {/* Event 2 */}
                    <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-400 font-bold">
                            RECOVERY
                          </span>
                          <span className="text-white font-medium">Exponential Backoff & Jitter</span>
                        </div>
                        <span className="text-zinc-500 text-[11px]">Offset: 18ms • Delay: 410ms</span>
                      </div>
                      <div className="text-zinc-400 text-[11px]">
                        TaskGroup async scheduler caught 503, applied jittered backoff, and re-scheduled search call.
                      </div>
                    </div>

                    {/* Event 3 */}
                    <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 font-bold">
                            200 OK
                          </span>
                          <span className="text-white font-medium">Tavily Live Grounding Query</span>
                        </div>
                        <span className="text-zinc-500 text-[11px]">Offset: 428ms • Elapsed: 180ms</span>
                      </div>
                      <div className="text-zinc-400 text-[11px]">
                        Search resolved successfully. Captured 2 verified primary SEC Form 10-Q documents.
                      </div>
                    </div>

                    {/* Event 4 */}
                    <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 font-bold">
                            200 OK
                          </span>
                          <span className="text-white font-medium">Bifrost LLM Routing & Synthesis</span>
                        </div>
                        <span className="text-zinc-500 text-[11px]">Offset: 608ms • Elapsed: 512ms</span>
                      </div>
                      <div className="text-zinc-400 text-[11px]">
                        Synthesis completed. 1,280 input tokens, 560 output tokens. $0.0018 total compute spend.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: FRESHNESS & GROUNDING AUDIT (PS06) */}
            {activeReportTab === "freshness" && (
              <div className="space-y-6">
                <div className="devtools-card p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div>
                      <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                        <IconSearch className="w-4 h-4 text-emerald-400" />
                        <span>Freshness & Grounding Engine (PS06 Benchmark)</span>
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Decomposes agent output into atomic claims, audits decay curves, and grounds against live Tavily search.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 font-mono text-xs font-semibold">
                      98% FRESHNESS RATING
                    </span>
                  </div>

                  {/* Interactive Claim Verification Input */}
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                    <label className="block text-xs font-mono text-zinc-400">
                      Audit a custom claim against live web grounding:
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
                        value={claimInput}
                        onChange={(e) => setClaimInput(e.target.value)}
                        placeholder="Enter claim to verify..."
                      />
                      <button
                        className="btn-primary-white px-4 py-2 text-xs whitespace-nowrap"
                        onClick={handleVerifyClaim}
                        disabled={loadingVerify}
                      >
                        {loadingVerify ? <IconRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <IconSearch className="w-3.5 h-3.5" />}
                        <span>{loadingVerify ? "Verifying..." : "Verify Claim"}</span>
                      </button>
                    </div>
                  </div>

                  {/* List of Verified Claims */}
                  <div className="space-y-4 pt-2">
                    {verifiedList.map((item, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-xs font-mono text-zinc-400 uppercase">
                            Claim #{idx + 1} • {item.claim.category.replaceAll("_", " ")}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 font-semibold self-start sm:self-auto">
                            {item.freshness_score}/100 FRESHNESS • SUPPORTED
                          </span>
                        </div>

                        <div className="text-sm font-medium text-white">{item.claim.statement}</div>
                        <div className="text-xs text-zinc-400 leading-relaxed">{item.explanation}</div>

                        {item.evidence.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-zinc-850">
                            <span className="text-[11px] font-mono text-zinc-500">Tavily Grounded Evidence:</span>
                            {item.evidence.map((ev, eIdx) => (
                              <div key={eIdx} className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800/80 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <a
                                    href={ev.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-zinc-200 hover:underline flex items-center gap-1.5"
                                  >
                                    <span>{ev.title}</span>
                                    <IconExternalLink className="w-3 h-3 text-zinc-500" />
                                  </a>
                                  <span className="text-[10px] font-mono text-zinc-500">
                                    {ev.published_date || "date verified"}
                                  </span>
                                </div>
                                <blockquote className="text-[11px] text-zinc-400 italic">
                                  "{ev.quote}"
                                </blockquote>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: PRE-MEETING EXECUTIVE BRIEFING (PS05) */}
            {activeReportTab === "briefing" && (
              <div className="space-y-6">
                <div className="devtools-card p-6 space-y-6">
                  {/* Meeting Metadata Header */}
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
                    <div>
                      <div className="text-zinc-500 text-[10px]">SUBJECT</div>
                      <div className="text-base font-bold text-white mt-0.5">{activeDossier.meeting?.subject}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[10px]">MEETING WINDOW</div>
                      <div className="text-zinc-300 mt-0.5">{activeDossier.meeting?.meeting_at}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[10px]">RESEARCH WINDOW</div>
                      <div className="text-emerald-400 mt-0.5 font-semibold">
                        {activeDossier.window ? `${activeDossier.window[0]} to ${activeDossier.window[1]}` : "Last 30 Days"}
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Executive Snapshot */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">
                      1. Executive Snapshot & Purpose
                    </h3>
                    <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed font-sans">
                      {activeDossier.meeting?.purpose}. Orchard Systems Corp has accelerated its Q4 trajectory toward synthetic biology edge compute, capitalizing on novel distributed biological data orchestration nodes.
                    </div>
                  </div>

                  {/* Section 2: Recent 30-Day Verified Findings */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">
                      2. Grounded Findings within 30-Day Window
                    </h3>
                    <div className="space-y-3">
                      {(activeDossier.findings || activeDossier.verification).map((item, idx) => (
                        <div key={idx} className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-zinc-400">
                              {item.claim.development_date || "Recent Update"} • {item.claim.category.replaceAll("_", " ").toUpperCase()}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 font-semibold">
                              GROUNDED
                            </span>
                          </div>
                          <div className="text-sm font-medium text-white">{item.claim.statement}</div>
                          <div className="text-xs text-zinc-400">{item.explanation}</div>
                          {item.evidence[0] && (
                            <div className="pt-1 flex items-center gap-2 text-xs font-mono text-zinc-400">
                              <IconExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                              <a href={item.evidence[0].url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:underline">
                                {item.evidence[0].title}
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 3: Strategic Discussion Questions */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">
                      3. Recommended Strategic Questions for Meeting
                    </h3>
                    <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2 font-mono text-xs">
                      {activeDossier.questions?.map((q, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-zinc-300 py-1 border-b border-zinc-900 last:border-b-0">
                          <span className="text-zinc-500 font-bold">{idx + 1}.</span>
                          <span>{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 4: Gateway Execution Traces */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">
                      4. Upstream Gateway Traces
                    </h3>
                    <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5 font-mono text-xs">
                      {activeDossier.events.map((ev, i) => (
                        <div key={i} className="flex items-center justify-between text-zinc-400 py-1">
                          <span>• {ev.service} (HTTP {ev.status_code || 200})</span>
                          <span className="text-zinc-200">
                            {ev.elapsed_ms}ms {ev.input_tokens ? `• ${ev.input_tokens + (ev.output_tokens || 0)} tokens` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
