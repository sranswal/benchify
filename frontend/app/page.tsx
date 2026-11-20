"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
  IconSun,
  IconMoon,
  IconX,
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

  // Dark/Light mode theme state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Studio Onboarding Tour state
  const [showStudioTour, setShowStudioTour] = useState(true);
  const [tourStep, setTourStep] = useState(1);

  // Hero interactive console states
  const [heroTab, setHeroTab] = useState<"chaos" | "freshness" | "briefing" | "sdk">("chaos");
  const [heroFault, setHeroFault] = useState<"503" | "429" | "jitter" | "nominal">("503");
  const [codeLang, setCodeLang] = useState<"python" | "typescript" | "curl">("python");
  const [copiedCode, setCopiedCode] = useState(false);

  // Documentation tab selector
  const [docTab, setDocTab] = useState<"quickstart" | "api" | "cicd" | "webhook">("quickstart");

  // Stage 3 Report state
  const [activeReportTab, setActiveReportTab] = useState<"telemetry" | "freshness" | "briefing">("telemetry");
  const [activeDossier] = useState<Result>(sampleDossier);

  // Freshness claim re-verify state
  const [claimInput, setClaimInput] = useState("Northwind Bio completed a $42.5M strategic capital commitment into Orchard Systems.");
  const [verifiedList, setVerifiedList] = useState<Review[]>(sampleDossier.verification);
  const [loadingVerify, setLoadingVerify] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setIsDarkMode(isDark);
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDarkMode(true);
    }
  };

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

# Route your agent's search and LLM calls through Benchify Bifrost Gateway
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
    <div className="min-h-screen bg-[var(--canvas-bg)] text-[var(--text-main)] antialiased font-sans selection:bg-zinc-800 selection:text-white transition-colors duration-200">
      {/* =========================================================================
          APPLICATION HEADER
          ========================================================================= */}
      <header className="app-header">
        <div className="max-w-[1440px] w-full mx-auto flex items-center justify-between">
          {/* Left: Official Brand Logo & Main Nav */}
          <div className="flex items-center gap-6">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setCurrentStep("landing")}
            >
              <Image
                src="/brand/benchify-icon.svg"
                alt="Benchify Logo"
                width={30}
                height={30}
                className="rounded-lg shadow-sm group-hover:scale-105 transition-transform"
                unoptimized
              />
              <span className="font-bold text-base tracking-tight">Benchify</span>
              <span className="tag-version">v1.0</span>
            </div>

            {/* Middle Nav Links (Only on Landing Page) */}
            {currentStep === "landing" && (
              <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-[var(--text-muted)]">
                <a href="#features" className="hover:text-[var(--text-main)] transition-colors">
                  Features
                </a>
                <a href="#chaos-engine" className="hover:text-[var(--text-main)] transition-colors">
                  Chaos Engine
                </a>
                <a href="#freshness" className="hover:text-[var(--text-main)] transition-colors">
                  Freshness (PS06)
                </a>
                <a href="#pre-meeting" className="hover:text-[var(--text-main)] transition-colors">
                  Pre-Meeting (PS05)
                </a>
                <a href="#architecture" className="hover:text-[var(--text-main)] transition-colors">
                  Architecture
                </a>
                <a href="#docs" className="hover:text-[var(--text-main)] transition-colors">
                  Docs & Spec
                </a>
              </nav>
            )}

            {/* Stepper Indicator (Only when inside Studio or Reports) */}
            {currentStep !== "landing" && (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  className="btn-secondary-zinc px-2.5 py-1 text-xs"
                  onClick={() => setCurrentStep("landing")}
                >
                  <span>← Back to Overview</span>
                </button>
                <span className="text-[var(--text-faint)]">/</span>
                <span className="text-xs font-mono font-semibold text-[var(--text-main)]">
                  {currentStep === "benchmark" ? "Benchmark Studio" : "Certified Intelligence Dossier"}
                </span>
              </div>
            )}
          </div>

          {/* Right Header Navigation */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle (Dark/Light) */}
            <button
              className="btn-secondary-zinc p-2 text-xs rounded-lg"
              onClick={toggleTheme}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle Theme"
            >
              {isDarkMode ? <IconSun className="w-4 h-4 text-amber-400" /> : <IconMoon className="w-4 h-4 text-zinc-700" />}
            </button>

            {/* GitHub Repository */}
            <a
              href="https://github.com/sranswal/benchify"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary-zinc px-3 py-1.5 text-xs hidden sm:inline-flex"
            >
              <IconGitHub className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </a>

            {/* Primary Action Button */}
            {currentStep === "landing" ? (
              <button
                className="btn-primary-white px-4 py-2 text-xs"
                onClick={() => {
                  setCurrentStep("benchmark");
                  setShowStudioTour(true);
                  setTourStep(1);
                }}
              >
                <span>Start Benchmarking</span>
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
        </div>
      </header>

      {/* =========================================================================
          MAIN CONTAINER (FULL-PAGE WIDTH WITH BALANCED MARGINS)
          ========================================================================= */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <div className="hero-radial-glow"></div>

        {/* =========================================================================
            STAGE 1: HIGH-CONVERTING DEVELOPER PLATFORM LANDING PAGE
            ========================================================================= */}
        {currentStep === "landing" && (
          <div className="space-y-32 relative z-10 animate-fade-in">
            {/* HERO SECTION */}
            <section className="text-center pt-8 pb-4 max-w-4xl mx-auto space-y-6">
              {/* Product Release Pill */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--surface-dim)] border border-[var(--surface-border)] text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-medium text-[var(--text-main)]">
                  Benchify Platform • Automated Reliability Gateway for AI Agents
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-[var(--text-main)] leading-[1.12]">
                Stop guessing if your AI agents <br />
                <span className="text-[var(--text-muted)]">will survive production.</span>
              </h1>

              {/* Subheadline */}
              <p className="text-base sm:text-lg text-[var(--text-muted)] max-w-2xl mx-auto leading-relaxed">
                Benchify is the automated chaos testing & factual freshness harness built specifically for LLM agents.
                Inject deterministic HTTP 503/429 outages, benchmark recovery loops, verify real-time search grounding with Tavily, and certify resilience before merging.
              </p>

              {/* Main Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <button
                  className="btn-primary-white py-3.5 px-7 text-sm font-semibold"
                  onClick={() => {
                    setCurrentStep("benchmark");
                    setShowStudioTour(true);
                    setTourStep(1);
                  }}
                >
                  <IconPlay className="w-4 h-4 fill-current" />
                  <span>Start Benchmarking Free</span>
                  <IconArrowRight className="w-4 h-4" />
                </button>
                <button
                  className="btn-secondary-zinc py-3.5 px-6 text-sm"
                  onClick={() => setCurrentStep("reports")}
                >
                  <IconFileText className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>Explore Sample Telemetry Dossier</span>
                </button>
              </div>

              {/* Framework Ecosystem Badges */}
              <div className="pt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-[var(--text-muted)]">
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">LangGraph</span>
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">CrewAI</span>
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">AutoGen</span>
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">LlamaIndex</span>
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">OpenAI Assistants</span>
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">Claude SDK</span>
                <span className="px-3 py-1 rounded-md bg-[var(--surface-dim)] border border-[var(--surface-border)]">Custom HTTP Webhooks</span>
              </div>
            </section>

            {/* 1. INTERACTIVE CHAOS ENGINE CONSOLE */}
            <section id="chaos-engine" className="devtools-card p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-500 font-bold">
                      FAULT INJECTION
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
                      Deterministic Chaos Simulator
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Inject upstream service drops and test agent self-healing loops under real network pressure.
                  </p>
                </div>

                {/* Console Tabs */}
                <div className="flex items-center gap-1 bg-[var(--surface-dim)] p-1 rounded-lg border border-[var(--surface-border)] font-mono text-xs">
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${
                      heroTab === "chaos" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                    onClick={() => setHeroTab("chaos")}
                  >
                    Chaos Simulation
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${
                      heroTab === "freshness" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                    onClick={() => setHeroTab("freshness")}
                  >
                    Tavily Freshness
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${
                      heroTab === "briefing" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                    onClick={() => setHeroTab("briefing")}
                  >
                    Executive Dossier
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${
                      heroTab === "sdk" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <IconFlame className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold text-[var(--text-main)]">Inject Failure Scenario:</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          heroFault === "503"
                            ? "bg-rose-500/20 text-rose-500 dark:text-rose-300 font-bold border border-rose-500/40"
                            : "bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--surface-border)]"
                        }`}
                        onClick={() => setHeroFault("503")}
                      >
                        HTTP 503 Outage
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          heroFault === "429"
                            ? "bg-amber-500/20 text-amber-500 dark:text-amber-300 font-bold border border-amber-500/40"
                            : "bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--surface-border)]"
                        }`}
                        onClick={() => setHeroFault("429")}
                      >
                        HTTP 429 Throttle
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          heroFault === "jitter"
                            ? "bg-indigo-500/20 text-indigo-500 dark:text-indigo-300 font-bold border border-indigo-500/40"
                            : "bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--surface-border)]"
                        }`}
                        onClick={() => setHeroFault("jitter")}
                      >
                        +2,500ms Jitter
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          heroFault === "nominal"
                            ? "bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 font-bold border border-emerald-500/40"
                            : "bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--surface-border)]"
                        }`}
                        onClick={() => setHeroFault("nominal")}
                      >
                        Nominal Baseline
                      </button>
                    </div>
                  </div>

                  {/* Fault Diagnostic Alert Banner */}
                  <div className="p-3.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <IconAlertTriangle
                        className={`w-4 h-4 ${
                          heroFault === "503"
                            ? "text-rose-500"
                            : heroFault === "429"
                            ? "text-amber-500"
                            : heroFault === "jitter"
                            ? "text-indigo-500"
                            : "text-emerald-500"
                        }`}
                      />
                      <span className="font-semibold text-[var(--text-main)]">
                        {heroFault === "503" && "[FAULT INJECTED: HTTP 503 Service Unavailable (Tavily Search Node)]"}
                        {heroFault === "429" && "[FAULT INJECTED: HTTP 429 Rate Limit Exhaustion (Retry-After: 2.0s)]"}
                        {heroFault === "jitter" && "[FAULT INJECTED: Artificial +2,500ms Socket Read Delay]"}
                        {heroFault === "nominal" && "[BASELINE SCENARIO: All Upstream Search & Gateway Dependencies Nominal]"}
                      </span>
                    </div>
                    <span className="text-[var(--text-muted)]">
                      {heroFault === "503" && "Exponential Backoff (jitter=0.25) Triggered • Restored in 410ms"}
                      {heroFault === "429" && "Rate-Limit Buffer Activated • Quota re-allocated without loop"}
                      {heroFault === "jitter" && "TaskGroup Socket Timeout Guard Protected Memory Pool"}
                      {heroFault === "nominal" && "Zero packet drops • p95 Latency 980ms"}
                    </span>
                  </div>

                  {/* Split Telemetry Preview: Python Native Async vs Node.js Scripted */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Python Agent Card */}
                    <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
                            Python Agent (Native Async)
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 border border-emerald-500/30">
                              PASS
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">langgraph-taskgroup-v2</div>
                        </div>
                        <span className="font-mono text-xs text-emerald-500 dark:text-emerald-400 font-bold">100% Reliability</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                        <div className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)]">
                          <div className="text-[var(--text-muted)] text-[10px]">p95 Latency</div>
                          <div className="text-[var(--text-main)] font-bold mt-0.5">
                            {heroFault === "503" ? "1,120ms" : heroFault === "429" ? "1,340ms" : heroFault === "jitter" ? "3,480ms" : "940ms"}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)]">
                          <div className="text-[var(--text-muted)] text-[10px]">Recovery Time</div>
                          <div className="text-[var(--text-main)] font-bold mt-0.5">
                            {heroFault === "503" ? "410ms" : heroFault === "429" ? "820ms" : heroFault === "jitter" ? "120ms" : "0ms"}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)]">
                          <div className="text-[var(--text-muted)] text-[10px]">Compute Burn</div>
                          <div className="text-emerald-500 dark:text-emerald-400 font-bold mt-0.5">$0.0018</div>
                        </div>
                      </div>

                      <div className="space-y-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                        <div className="flex items-center justify-between">
                          <span>Circuit Breaker State</span>
                          <span className="text-emerald-500 font-bold">CLOSED (Healthy)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Retry Exhaustion Risk</span>
                          <span className="text-[var(--text-main)]">0.0% (Zero Loops)</span>
                        </div>
                      </div>
                    </div>

                    {/* Node.js Agent Card */}
                    <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2">
                            Node.js Agent (Microservice)
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-500 dark:text-amber-300 border border-amber-500/30">
                              DEGRADED
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">express-sync-adapter</div>
                        </div>
                        <span className="font-mono text-xs text-amber-500 dark:text-amber-400 font-bold">80% Reliability</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                        <div className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)]">
                          <div className="text-[var(--text-muted)] text-[10px]">p95 Latency</div>
                          <div className="text-amber-500 dark:text-amber-400 font-bold mt-0.5">
                            {heroFault === "503" ? "2,840ms" : heroFault === "429" ? "3,120ms" : heroFault === "jitter" ? "6,200ms" : "1,420ms"}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)]">
                          <div className="text-[var(--text-muted)] text-[10px]">Recovery Time</div>
                          <div className="text-amber-500 dark:text-amber-400 font-bold mt-0.5">
                            {heroFault === "503" ? "1,220ms" : heroFault === "429" ? "1,980ms" : heroFault === "jitter" ? "840ms" : "0ms"}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)]">
                          <div className="text-[var(--text-muted)] text-[10px]">Compute Burn</div>
                          <div className="text-amber-500 dark:text-amber-400 font-bold mt-0.5">$0.0039</div>
                        </div>
                      </div>

                      <div className="space-y-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                        <div className="flex items-center justify-between">
                          <span>Circuit Breaker State</span>
                          <span className="text-amber-500 font-bold">HALF-OPEN (Tripped Once)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Blocking I/O Drag</span>
                          <span className="text-rose-500">+1,720ms latency drag</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2, 3, 4 */}
              {heroTab === "freshness" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Temporal Grounding Window:</span>
                      <span className="text-emerald-500 font-bold">Last 30 Days (Oct 25 – Nov 24, 2026)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">Verification Pipeline:</span>
                      <span className="text-[var(--text-main)]">Tavily Live Web + SEC EDGAR Form 10-Q</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {sampleDossier.verification.map((v, i) => (
                      <div key={i} className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-[var(--text-muted)] uppercase">
                            Claim #{i + 1} • {v.claim.category.replaceAll("_", " ")}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold">
                            {v.freshness_score}/100 FRESHNESS • GROUNDED
                          </span>
                        </div>
                        <div className="text-sm text-[var(--text-main)] font-semibold">{v.claim.statement}</div>
                        <div className="text-xs text-[var(--text-muted)]">{v.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {heroTab === "briefing" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[var(--text-muted)]">Meeting Target:</span>
                      <span className="text-[var(--text-main)] font-bold">Orchard Systems Corp (Nov 24, 2026)</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Purpose: Strategic Partnership & Q4 Cloud Infrastructure Expansion
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                    <div className="text-xs font-mono font-bold text-[var(--text-main)]">
                      Strategic Discussion Questions:
                    </div>
                    <ul className="space-y-2 text-xs text-[var(--text-main)]">
                      {sampleDossier.questions?.map((q, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[var(--text-muted)] font-mono">{idx + 1}.</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {heroTab === "sdk" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center gap-1 font-mono text-xs">
                      <button
                        className={`px-3 py-1 rounded transition-colors ${codeLang === "python" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
                        onClick={() => setCodeLang("python")}
                      >
                        Python
                      </button>
                      <button
                        className={`px-3 py-1 rounded transition-colors ${codeLang === "typescript" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
                        onClick={() => setCodeLang("typescript")}
                      >
                        TypeScript
                      </button>
                      <button
                        className={`px-3 py-1 rounded transition-colors ${codeLang === "curl" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
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
                      {copiedCode ? <IconCheck className="w-3.5 h-3.5 text-emerald-500" /> : <IconCopy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  <pre className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] text-xs font-mono text-[var(--text-main)] overflow-x-auto leading-relaxed">
                    {codeLang === "python" ? pythonSnippet : codeLang === "typescript" ? tsSnippet : curlSnippet}
                  </pre>
                </div>
              )}
            </section>

            {/* 2. CORE FEATURES / WHY AGENTS FAIL */}
            <section id="features" className="space-y-6">
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest font-semibold">
                  Platform Architecture
                </span>
                <h2 className="text-3xl font-bold tracking-tight text-[var(--text-main)]">
                  Why AI Agents Fail in Production
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Static evals like MMLU only measure model memorization. They cannot predict how multi-turn agents behave when search APIs drop connections or return stale temporal facts.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Feature 1 */}
                <div className="devtools-card p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                    <IconFlame className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">Cascading Upstream Outages</h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    When Tavily or downstream tools return HTTP 503 or 429, unbenchmarked agents trigger retry storms, locking async event loops and exhausting token quotas.
                  </p>
                  <div className="pt-2 text-xs font-mono text-rose-500">
                    • Injected 503 & 429 backoff testing
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="devtools-card p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                    <IconClock className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">Temporal Hallucination & Drift</h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Agents frequently cite outdated knowledge from pre-training memory when responding to current corporate leadership changes or recent SEC 10-Q disclosures.
                  </p>
                  <div className="pt-2 text-xs font-mono text-amber-500">
                    • 30-day bounded research freshness audit (PS06)
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="devtools-card p-6 space-y-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                    <IconActivity className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">Silent Latency & Cost Blowups</h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    A single unmanaged synchronous call causes agent p95 latency to jump from 1.2s to 18s under real traffic. Benchify profiles compute cost and p95 latency.
                  </p>
                  <div className="pt-2 text-xs font-mono text-indigo-500">
                    • p95/p99 profiling & token spend audit
                  </div>
                </div>
              </div>
            </section>

            {/* 3. DEDICATED FRESHNESS AUDITOR SECTION (PS06) */}
            <section id="freshness" className="devtools-card p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold">
                      PS06 BENCHMARK
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
                      Freshness & Grounding Auditor
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Eliminate temporal hallucinations with atomic claim decomposition, 30-day bounded search, and SEC 10-Q grounding.
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-3 py-1 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)] text-emerald-500 font-semibold">
                    Live Tavily Verification Active
                  </span>
                </div>
              </div>

              {/* Explanatory 3-Pillar Cards for PS06 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                  <div className="text-xs font-mono font-bold text-[var(--text-main)] flex items-center gap-2">
                    <IconCpu className="w-4 h-4 text-emerald-500" />
                    <span>Atomic Claim Splitting</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Decomposes long-form agent briefing prose into discrete, falsifiable claims (e.g. executive hires, funding rounds, revenue figures).
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                  <div className="text-xs font-mono font-bold text-[var(--text-main)] flex items-center gap-2">
                    <IconSearch className="w-4 h-4 text-indigo-500" />
                    <span>Dual-Source Grounding</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Validates each claim against real-time Tavily search index results and official SEC EDGAR 10-Q/8-K regulatory filings.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                  <div className="text-xs font-mono font-bold text-[var(--text-main)] flex items-center gap-2">
                    <IconClock className="w-4 h-4 text-amber-500" />
                    <span>Temporal Decay Curve</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Scores freshness from 0 to 100 based on event publication dates versus the requested 30-day research window.
                  </p>
                </div>
              </div>

              {/* Interactive Live Claim Auditor */}
              <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                <label className="block text-xs font-mono font-semibold text-[var(--text-main)]">
                  Try Live Claim Verification (Tavily Grounded):
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 rounded bg-[var(--surface-base)] border border-[var(--surface-border)] text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-zinc-500 font-mono"
                    value={claimInput}
                    onChange={(e) => setClaimInput(e.target.value)}
                    placeholder="Enter factual claim to verify..."
                  />
                  <button
                    className="btn-primary-white px-4 py-2 text-xs whitespace-nowrap"
                    onClick={handleVerifyClaim}
                    disabled={loadingVerify}
                  >
                    {loadingVerify ? <IconRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <IconSearch className="w-3.5 h-3.5" />}
                    <span>{loadingVerify ? "Verifying..." : "Verify Claim Grounding"}</span>
                  </button>
                </div>
              </div>

              {/* Verified Claims List */}
              <div className="space-y-3">
                {verifiedList.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-mono text-[var(--text-muted)] uppercase">
                        Claim #{idx + 1} • {item.claim.category.replaceAll("_", " ")}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold self-start sm:self-auto">
                        {item.freshness_score}/100 FRESHNESS • SUPPORTED
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-[var(--text-main)]">{item.claim.statement}</div>
                    <div className="text-xs text-[var(--text-muted)] leading-relaxed">{item.explanation}</div>

                    {item.evidence.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[var(--surface-border)]">
                        <span className="text-[11px] font-mono text-[var(--text-muted)]">Grounded Primary Sources:</span>
                        {item.evidence.map((ev, eIdx) => (
                          <div key={eIdx} className="p-2.5 rounded bg-[var(--surface-base)] border border-[var(--surface-border)] text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <a
                                href={ev.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-[var(--text-main)] hover:underline flex items-center gap-1.5"
                              >
                                <span>{ev.title}</span>
                                <IconExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                              </a>
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                {ev.published_date || "verified"}
                              </span>
                            </div>
                            <blockquote className="text-[11px] text-[var(--text-muted)] italic">
                              "{ev.quote}"
                            </blockquote>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 4. DEDICATED PRE-MEETING EXECUTIVE BRIEFING SECTION (PS05) */}
            <section id="pre-meeting" className="devtools-card p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-500 font-bold">
                      PS05 REFERENCE WORKLOAD
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
                      Pre-Meeting Executive Intelligence
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Autonomous briefing workload that delivers corporate dossiers, recent 30-day developments, and strategic discussion questions.
                  </p>
                </div>

                <button
                  className="btn-secondary-zinc px-3 py-1.5 text-xs font-mono"
                  onClick={() => downloadMarkdown(sampleDossier)}
                >
                  <IconDownload className="w-3.5 h-3.5" />
                  <span>Download Sample Dossier (.MD)</span>
                </button>
              </div>

              {/* Workload Showcase Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase">
                      Target Meeting Scenario
                    </div>
                    <div className="text-sm font-bold text-[var(--text-main)]">
                      Orchard Systems Corp — Q4 Partnership & Expansion
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Window: October 25 to November 24, 2026 (Strict 30-Day Bounded Temporal Range)
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase">
                      Key Grounded Developments
                    </div>
                    <ul className="space-y-2 text-xs text-[var(--text-main)]">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>Appointed Dr. Aris Thorne as CSO to lead synthetic biology edge compute.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>Closed $42.5M strategic Series C non-voting participation from Northwind Bio.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                  <div className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase">
                    Suggested C-Level Discussion Questions
                  </div>
                  <div className="space-y-2.5 font-mono text-xs">
                    {sampleDossier.questions?.map((q, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-[var(--surface-base)] border border-[var(--surface-border)] flex items-start gap-2 text-[var(--text-main)]">
                        <span className="text-[var(--text-muted)] font-bold">{idx + 1}.</span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 5. AUTHORITATIVE RESILIENCE ARCHITECTURE */}
            <section id="architecture" className="devtools-card p-6 sm:p-8 space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-500 font-bold">
                      SYSTEM ARCHITECTURE
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
                      Bifrost Gateway & Resilience Pipeline
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    How Benchify routes, stress-tests, and verifies agent workloads between client harnesses and upstream providers.
                  </p>
                </div>
              </div>

              {/* 4-Tier Architectural Diagram & Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono text-xs">
                {/* Layer 1 */}
                <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">TIER 1 • HARNESS</div>
                  <div className="text-sm font-bold text-[var(--text-main)]">Agent Client Layer</div>
                  <p className="text-xs font-sans text-[var(--text-muted)] leading-relaxed">
                    LangGraph, CrewAI, AutoGen, LlamaIndex, or custom HTTP REST webhooks running local or cloud agents.
                  </p>
                  <div className="pt-2 text-[10px] text-indigo-500">
                    → Sends search & inference requests
                  </div>
                </div>

                {/* Layer 2 */}
                <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-indigo-500/40 space-y-3 shadow-sm">
                  <div className="text-[10px] text-indigo-500 font-bold uppercase">TIER 2 • GATEWAY</div>
                  <div className="text-sm font-bold text-[var(--text-main)]">Bifrost Proxy</div>
                  <p className="text-xs font-sans text-[var(--text-muted)] leading-relaxed">
                    Deterministic fault injector, circuit breaker (Closed/Open), and jittered exponential backoff scheduler.
                  </p>
                  <div className="pt-2 text-[10px] text-emerald-500">
                    → Injects 503 / 429 / Jitter chaos
                  </div>
                </div>

                {/* Layer 3 */}
                <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">TIER 3 • INGESTION</div>
                  <div className="text-sm font-bold text-[var(--text-main)]">Search & LLM Nodes</div>
                  <p className="text-xs font-sans text-[var(--text-muted)] leading-relaxed">
                    Tavily Live Web Search API, SEC EDGAR 10-Q disclosures, Gemini Flash-Lite, GPT-4o, and Claude 3.5 Sonnet.
                  </p>
                  <div className="pt-2 text-[10px] text-amber-500">
                    → High-fidelity grounded facts
                  </div>
                </div>

                {/* Layer 4 */}
                <div className="p-5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                  <div className="text-[10px] text-zinc-500 font-bold uppercase">TIER 4 • EVALS</div>
                  <div className="text-sm font-bold text-[var(--text-main)]">Certification Engine</div>
                  <p className="text-xs font-sans text-[var(--text-muted)] leading-relaxed">
                    Freshness decay calculation (PS06), p95 latency profiling, deterministic JSON replay recording, and CI blocker.
                  </p>
                  <div className="pt-2 text-[10px] text-emerald-500">
                    → Certified Intelligence Dossier
                  </div>
                </div>
              </div>
            </section>

            {/* 6. DEDICATED DOCUMENTATION & API SPECIFICATION */}
            <section id="docs" className="devtools-card p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold">
                      DOCUMENTATION & SPEC
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
                      Developer Reference & API Specification
                    </h2>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Complete integration specs, gateway API schemas, and CI/CD workflow recipes.
                  </p>
                </div>

                {/* Doc Tabs */}
                <div className="flex items-center gap-1 bg-[var(--surface-dim)] p-1 rounded-lg border border-[var(--surface-border)] font-mono text-xs">
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${docTab === "quickstart" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
                    onClick={() => setDocTab("quickstart")}
                  >
                    Quickstart
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${docTab === "api" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
                    onClick={() => setDocTab("api")}
                  >
                    Gateway API
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${docTab === "cicd" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
                    onClick={() => setDocTab("cicd")}
                  >
                    GitHub Actions
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded transition-all ${docTab === "webhook" ? "bg-[var(--surface-base)] text-[var(--text-main)] font-semibold shadow-sm" : "text-[var(--text-muted)]"}`}
                    onClick={() => setDocTab("webhook")}
                  >
                    Agent Webhook Spec
                  </button>
                </div>
              </div>

              {/* DOC CONTENT: QUICKSTART */}
              {docTab === "quickstart" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-[var(--text-main)] font-mono">
                    3-Step Local Quickstart
                  </h3>
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="text-[var(--text-muted)] font-bold">1. Install Benchify Harness CLI</div>
                      <pre className="text-emerald-500">npm install -g benchify-cli</pre>
                    </div>

                    <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="text-[var(--text-muted)] font-bold">2. Run Local Benchmark against Your Agent</div>
                      <pre className="text-[var(--text-main)]">benchify run --agent http://localhost:8001/execute --scenarios 503,429 --reps 3</pre>
                    </div>

                    <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="text-[var(--text-muted)] font-bold">3. Inspect Certified Telemetry Dossier</div>
                      <pre className="text-[var(--text-main)]">benchify report --run latest --format json,markdown</pre>
                    </div>
                  </div>
                </div>
              )}

              {/* DOC CONTENT: GATEWAY API */}
              {docTab === "api" && (
                <div className="space-y-4 font-mono text-xs">
                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-500 font-bold">POST</span>
                      <span className="font-bold text-[var(--text-main)]">/v1/gateway/search</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-sans">
                      Proxy Tavily search queries through Bifrost Gateway with injected chaos profiles and temporal bounding.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="text-[var(--text-muted)] font-bold">Request Payload Schema</div>
                    <pre className="text-[var(--text-main)] leading-relaxed">
{`{
  "query": "string (required, search query to evaluate)",
  "temporal_window_days": 30, // integer (default 30, limits grounding to recent window)
  "chaos_profile": "resilient_eval", // "nominal" | "first_search_503" | "first_search_429"
  "max_retries": 3,
  "backoff_jitter": 0.25
}`}
                    </pre>
                  </div>
                </div>
              )}

              {/* DOC CONTENT: CI/CD */}
              {docTab === "cicd" && (
                <div className="space-y-4 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text-main)]">.github/workflows/benchify-ci.yml</span>
                    <button
                      className="btn-secondary-zinc px-3 py-1 text-xs"
                      onClick={() =>
                        copyCodeSnippet(
`name: Benchify Agent Regression Gate
on: [push, pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Benchify Resilience Harness
        run: |
          npx benchify run \\
            --agent ./agent.py \\
            --scenarios baseline,first_search_503,first_search_429 \\
            --assert-pass-rate 95 \\
            --assert-p95-latency 2000`
                        )
                      }
                    >
                      <IconCopy className="w-3.5 h-3.5" />
                      <span>Copy Workflow</span>
                    </button>
                  </div>

                  <pre className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] text-[var(--text-main)] overflow-x-auto leading-relaxed">
{`name: Benchify Agent Regression Gate
on: [push, pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Benchify Resilience Harness
        run: |
          npx benchify run \\
            --agent ./agent.py \\
            --scenarios baseline,first_search_503,first_search_429 \\
            --assert-pass-rate 95 \\
            --assert-p95-latency 2000`}
                  </pre>
                </div>
              )}

              {/* DOC CONTENT: WEBHOOK CONTRACT */}
              {docTab === "webhook" && (
                <div className="space-y-4 font-mono text-xs">
                  <p className="text-xs text-[var(--text-muted)] font-sans">
                    Any agent microservice can connect to Benchify by exposing a single POST endpoint matching this contract:
                  </p>
                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="text-[var(--text-muted)] font-bold">Input Payload Sent by Benchify to Your Agent:</div>
                    <pre className="text-[var(--text-main)] leading-relaxed">
{`{
  "subject": "Orchard Systems Corp",
  "window": ["2026-10-25", "2026-11-24"],
  "meeting": {
    "subject": "Orchard Systems Corp",
    "meeting_at": "2026-11-24T14:30:00Z",
    "purpose": "Strategic Partnership & Q4 Cloud Infrastructure Expansion"
  }
}`}
                    </pre>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                    <div className="text-[var(--text-muted)] font-bold">Output Response Expected from Your Agent:</div>
                    <pre className="text-emerald-500 leading-relaxed">
{`{
  "findings": [
    {
      "claim": "Orchard Systems appointed Dr. Aris Thorne as CSO.",
      "category": "executive_appointment",
      "evidence": "https://orchard-systems.com/press"
    }
  ],
  "questions": [
    "How does the CSO appointment impact Q1 roadmap?"
  ]
}`}
                    </pre>
                  </div>
                </div>
              )}
            </section>

            {/* 7. BOTTOM CALL TO ACTION BANNER */}
            <section className="text-center py-12 space-y-6">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-main)]">
                Ready to Stress-Test Your Agent?
              </h2>
              <p className="text-[var(--text-muted)] max-w-lg mx-auto text-sm">
                No credit card, no complex config. Run a certified benchmark test in under 30 seconds.
              </p>
              <button
                className="btn-primary-white py-3.5 px-8 text-sm font-semibold"
                onClick={() => {
                  setCurrentStep("benchmark");
                  setShowStudioTour(true);
                  setTourStep(1);
                }}
              >
                <span>Start Benchmarking Free</span>
                <IconArrowRight className="w-4 h-4" />
              </button>
            </section>
          </div>
        )}

        {/* =========================================================================
            STAGE 2: BENCHMARK STUDIO WITH INTERACTIVE ONBOARDING TOUR
            ========================================================================= */}
        {currentStep === "benchmark" && (
          <div className="space-y-6 relative z-10 animate-fade-in">
            {/* Header with Back button and Tour trigger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] mb-2 transition-colors"
                  onClick={() => setCurrentStep("landing")}
                >
                  <span>← Back to Overview</span>
                </button>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">Benchmark Studio</h1>
                  <span className="tag-version">STUDIO</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Configure chaos scenarios, select agent targets, and test error-recovery resilience.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary-zinc px-3 py-1.5 text-xs"
                  onClick={() => {
                    setShowStudioTour(true);
                    setTourStep(1);
                  }}
                >
                  <IconSliders className="w-3.5 h-3.5" />
                  <span>Interactive Guide</span>
                </button>
                <button
                  className="btn-secondary-zinc px-3 py-1.5 text-xs"
                  onClick={() => setCurrentStep("reports")}
                >
                  <span>Skip to Sample Dossier →</span>
                </button>
              </div>
            </div>

            {/* FIRST-TIME INTERACTIVE ONBOARDING TOUR MODAL */}
            {showStudioTour && (
              <div className="modal-overlay" onClick={() => setShowStudioTour(false)}>
                <div className="modal-content p-6 max-w-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--surface-border)]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <h3 className="font-bold text-sm text-[var(--text-main)]">
                        Quick Onboarding Guide — Step {tourStep} of 3
                      </h3>
                    </div>
                    <button
                      className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1"
                      onClick={() => setShowStudioTour(false)}
                    >
                      <IconX className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="py-4 space-y-4">
                    {tourStep === 1 && (
                      <div className="space-y-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex items-center justify-center text-emerald-500">
                          <IconCpu className="w-5 h-5" />
                        </div>
                        <h4 className="text-base font-bold text-[var(--text-main)]">
                          1. Select or Connect Your Agent
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Choose from our reference agents (Python Native Async or Node.js Microservice) or connect your own agent by clicking <strong className="text-[var(--text-main)]">+ Connect Custom Agent via HTTP</strong>. Benchify sends a research task payload with query parameters and measures responses.
                        </p>
                      </div>
                    )}

                    {tourStep === 2 && (
                      <div className="space-y-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex items-center justify-center text-amber-500">
                          <IconFlame className="w-5 h-5" />
                        </div>
                        <h4 className="text-base font-bold text-[var(--text-main)]">
                          2. Configure Upstream Chaos Scenarios
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Pick the real-world failure modes to inject: simulate Tavily search <strong className="text-[var(--text-main)]">HTTP 503 Outages</strong>, API <strong className="text-[var(--text-main)]">HTTP 429 Rate Limits</strong>, or network latency jitter. Configure iterations (1x, 3x, 5x) to guarantee deterministic recovery.
                        </p>
                      </div>
                    )}

                    {tourStep === 3 && (
                      <div className="space-y-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex items-center justify-center text-indigo-500">
                          <IconShieldCheck className="w-5 h-5" />
                        </div>
                        <h4 className="text-base font-bold text-[var(--text-main)]">
                          3. Execute Benchmark & Unlock Intelligence Dossier
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          Click <strong className="text-[var(--text-main)]">Launch Suite</strong>. Benchify routes requests through Bifrost Gateway, verifies backoff loops, audits factual claim freshness with Tavily, and unlocks the full certified intelligence dossier.
                        </p>
                      </div>
                    )}

                    {/* Progress Dots */}
                    <div className="flex items-center justify-center gap-1.5 pt-2">
                      <span className={`w-2 h-2 rounded-full transition-all ${tourStep === 1 ? "w-6 bg-[var(--text-main)]" : "bg-[var(--surface-border)]"}`}></span>
                      <span className={`w-2 h-2 rounded-full transition-all ${tourStep === 2 ? "w-6 bg-[var(--text-main)]" : "bg-[var(--surface-border)]"}`}></span>
                      <span className={`w-2 h-2 rounded-full transition-all ${tourStep === 3 ? "w-6 bg-[var(--text-main)]" : "bg-[var(--surface-border)]"}`}></span>
                    </div>
                  </div>

                  {/* Tour Action Buttons */}
                  <div className="pt-3 border-t border-[var(--surface-border)] flex items-center justify-between text-xs">
                    <button
                      className="text-[var(--text-muted)] hover:text-[var(--text-main)] font-mono"
                      onClick={() => setShowStudioTour(false)}
                    >
                      Skip Guide
                    </button>

                    <div className="flex items-center gap-2">
                      {tourStep > 1 && (
                        <button
                          className="btn-secondary-zinc px-3 py-1.5"
                          onClick={() => setTourStep(tourStep - 1)}
                        >
                          ← Previous
                        </button>
                      )}
                      {tourStep < 3 ? (
                        <button
                          className="btn-primary-white px-4 py-1.5"
                          onClick={() => setTourStep(tourStep + 1)}
                        >
                          <span>Next Step</span>
                          <IconArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          className="btn-primary-white px-4 py-1.5"
                          onClick={() => setShowStudioTour(false)}
                        >
                          <span>Launch Studio</span>
                          <IconCheck className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Benchmark onRunSelect={() => setCurrentStep("reports")} />
          </div>
        )}

        {/* =========================================================================
            STAGE 3: INTELLIGENCE REPORTS & DOSSIER
            ========================================================================= */}
        {currentStep === "reports" && (
          <div className="space-y-8 relative z-10 animate-fade-in">
            {/* Header with Breadcrumb & Export Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[var(--surface-border)]">
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] mb-2 transition-colors"
                  onClick={() => setCurrentStep("benchmark")}
                >
                  <span>← Back to Benchmark Studio</span>
                </button>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-main)]">
                    {activeDossier.meeting?.subject || "Orchard Systems"} — Intelligence Dossier
                  </h1>
                  <span className="px-2.5 py-1 rounded text-xs font-mono bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 font-bold border border-emerald-500/30">
                    CERTIFIED RELIABLE
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">
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
            <div className="flex items-center gap-2 border-b border-[var(--surface-border)] pb-2 font-mono text-xs">
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
                    <div className="text-[var(--text-muted)] text-xs font-mono">Pass Rate</div>
                    <div className="text-2xl font-bold text-emerald-500">100%</div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono">2 of 2 attempts passed</div>
                  </div>
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-[var(--text-muted)] text-xs font-mono">Recovery Rate</div>
                    <div className="text-2xl font-bold text-[var(--text-main)]">100%</div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono">Self-healed 503 outage</div>
                  </div>
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-[var(--text-muted)] text-xs font-mono">p95 Latency</div>
                    <div className="text-2xl font-bold text-[var(--text-main)]">1,120ms</div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono">Python Async: 1.1s | Node: 2.8s</div>
                  </div>
                  <div className="devtools-card p-4 space-y-1">
                    <div className="text-[var(--text-muted)] text-xs font-mono">Token Spend</div>
                    <div className="text-2xl font-bold text-emerald-500">$0.0018</div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono">1,840 total tokens</div>
                  </div>
                </div>

                {/* Head-to-Head Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Python Agent Card */}
                  <div className="devtools-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
                          Python Agent (Native Async)
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold border border-emerald-500/30">
                            GRADE A+
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[var(--text-muted)] mt-0.5">TaskGroup Async • briefing-v1</div>
                      </div>
                      <span className="text-xs font-mono text-emerald-500 font-bold">Passed 2/2</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                      <div className="p-2.5 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                        <div className="text-[var(--text-muted)] text-[10px]">p95 Latency</div>
                        <div className="text-[var(--text-main)] font-bold mt-0.5">1,120ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                        <div className="text-[var(--text-muted)] text-[10px]">Recovery Time</div>
                        <div className="text-[var(--text-main)] font-bold mt-0.5">410ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                        <div className="text-[var(--text-muted)] text-[10px]">Total Cost</div>
                        <div className="text-emerald-500 font-bold mt-0.5">$0.0018</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-mono text-[var(--text-muted)] border-t border-[var(--surface-border)] pt-3">
                      <div className="flex items-center justify-between">
                        <span>Circuit Breaker</span>
                        <span className="text-emerald-500 font-bold">Healthy (Closed)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Tool Calls Executed</span>
                        <span className="text-[var(--text-main)]">2 (Search + Summarize)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Fault Injected</span>
                        <span className="text-[var(--text-main)]">HTTP 503 on Attempt #1</span>
                      </div>
                    </div>
                  </div>

                  {/* Node.js Agent Card */}
                  <div className="devtools-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
                          Node.js Agent (Microservice)
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-500 font-bold border border-amber-500/30">
                            GRADE B-
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[var(--text-muted)] mt-0.5">Microservice Adapter • port: 8001</div>
                      </div>
                      <span className="text-xs font-mono text-amber-500 font-bold">Passed 2/2</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs">
                      <div className="p-2.5 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                        <div className="text-[var(--text-muted)] text-[10px]">p95 Latency</div>
                        <div className="text-amber-500 font-bold mt-0.5">2,840ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                        <div className="text-[var(--text-muted)] text-[10px]">Recovery Time</div>
                        <div className="text-amber-500 font-bold mt-0.5">1,220ms</div>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--surface-dim)] border border-[var(--surface-border)]">
                        <div className="text-[var(--text-muted)] text-[10px]">Total Cost</div>
                        <div className="text-amber-500 font-bold mt-0.5">$0.0039</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs font-mono text-[var(--text-muted)] border-t border-[var(--surface-border)] pt-3">
                      <div className="flex items-center justify-between">
                        <span>Circuit Breaker</span>
                        <span className="text-amber-500 font-bold">Degraded (Half-Open)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Tool Calls Executed</span>
                        <span className="text-[var(--text-main)]">4 (2 Retries on 503)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Blocking Drag</span>
                        <span className="text-rose-500">+1,720ms latency drag</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chronological Chaos Waterfall */}
                <div className="devtools-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--text-main)] font-mono flex items-center gap-2">
                    <IconActivity className="w-4 h-4 text-emerald-500" />
                    <span>Chronological Gateway Execution Stream</span>
                  </h3>

                  <div className="space-y-3 font-mono text-xs">
                    {/* Event 1 */}
                    <div className="p-3.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-500 font-bold">
                            503 ERROR
                          </span>
                          <span className="text-[var(--text-main)] font-semibold">Tavily Search API — Injected Chaos</span>
                        </div>
                        <span className="text-[var(--text-muted)] text-[11px]">Offset: 0ms • Elapsed: 18ms</span>
                      </div>
                      <div className="text-[var(--text-muted)] text-[11px]">
                        Fault injected: HTTP 503 upstream gateway outage. Simulated transient network failure.
                      </div>
                    </div>

                    {/* Event 2 */}
                    <div className="p-3.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-500 font-bold">
                            RECOVERY
                          </span>
                          <span className="text-[var(--text-main)] font-semibold">Exponential Backoff & Jitter</span>
                        </div>
                        <span className="text-[var(--text-muted)] text-[11px]">Offset: 18ms • Delay: 410ms</span>
                      </div>
                      <div className="text-[var(--text-muted)] text-[11px]">
                        TaskGroup async scheduler caught 503, applied jittered backoff, and re-scheduled search call.
                      </div>
                    </div>

                    {/* Event 3 */}
                    <div className="p-3.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-500 font-bold">
                            200 OK
                          </span>
                          <span className="text-[var(--text-main)] font-semibold">Tavily Live Grounding Query</span>
                        </div>
                        <span className="text-[var(--text-muted)] text-[11px]">Offset: 428ms • Elapsed: 180ms</span>
                      </div>
                      <div className="text-[var(--text-muted)] text-[11px]">
                        Search resolved successfully. Captured 2 verified primary SEC Form 10-Q documents.
                      </div>
                    </div>

                    {/* Event 4 */}
                    <div className="p-3.5 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-500 font-bold">
                            200 OK
                          </span>
                          <span className="text-[var(--text-main)] font-semibold">Bifrost LLM Routing & Synthesis</span>
                        </div>
                        <span className="text-[var(--text-muted)] text-[11px]">Offset: 608ms • Elapsed: 512ms</span>
                      </div>
                      <div className="text-[var(--text-muted)] text-[11px]">
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--surface-border)]">
                    <div>
                      <h2 className="text-base font-bold text-[var(--text-main)] tracking-tight flex items-center gap-2">
                        <IconSearch className="w-4 h-4 text-emerald-500" />
                        <span>Freshness & Grounding Engine (PS06 Benchmark)</span>
                      </h2>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Decomposes agent output into atomic claims, audits decay curves, and grounds against live Tavily search.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 font-mono text-xs font-bold">
                      98% FRESHNESS RATING
                    </span>
                  </div>

                  <div className="space-y-4 pt-2">
                    {verifiedList.map((item, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-xs font-mono text-[var(--text-muted)] uppercase">
                            Claim #{idx + 1} • {item.claim.category.replaceAll("_", " ")}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold self-start sm:self-auto">
                            {item.freshness_score}/100 FRESHNESS • SUPPORTED
                          </span>
                        </div>

                        <div className="text-sm font-semibold text-[var(--text-main)]">{item.claim.statement}</div>
                        <div className="text-xs text-[var(--text-muted)] leading-relaxed">{item.explanation}</div>

                        {item.evidence.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-[var(--surface-border)]">
                            <span className="text-[11px] font-mono text-[var(--text-muted)]">Tavily Grounded Evidence:</span>
                            {item.evidence.map((ev, eIdx) => (
                              <div key={eIdx} className="p-3 rounded bg-[var(--surface-base)] border border-[var(--surface-border)] text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <a
                                    href={ev.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold text-[var(--text-main)] hover:underline flex items-center gap-1.5"
                                  >
                                    <span>{ev.title}</span>
                                    <IconExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                                  </a>
                                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                    {ev.published_date || "date verified"}
                                  </span>
                                </div>
                                <blockquote className="text-[11px] text-[var(--text-muted)] italic">
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
                  <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
                    <div>
                      <div className="text-[var(--text-muted)] text-[10px]">SUBJECT</div>
                      <div className="text-base font-bold text-[var(--text-main)] mt-0.5">{activeDossier.meeting?.subject}</div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)] text-[10px]">MEETING WINDOW</div>
                      <div className="text-[var(--text-main)] mt-0.5">{activeDossier.meeting?.meeting_at}</div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)] text-[10px]">RESEARCH WINDOW</div>
                      <div className="text-emerald-500 mt-0.5 font-bold">
                        {activeDossier.window ? `${activeDossier.window[0]} to ${activeDossier.window[1]}` : "Last 30 Days"}
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Executive Snapshot */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      1. Executive Snapshot & Purpose
                    </h3>
                    <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] text-xs text-[var(--text-main)] leading-relaxed font-sans">
                      {activeDossier.meeting?.purpose}. Orchard Systems Corp has accelerated its Q4 trajectory toward synthetic biology edge compute, capitalizing on novel distributed biological data orchestration nodes.
                    </div>
                  </div>

                  {/* Section 2: Recent 30-Day Verified Findings */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      2. Grounded Findings within 30-Day Window
                    </h3>
                    <div className="space-y-3">
                      {(activeDossier.findings || activeDossier.verification).map((item, idx) => (
                        <div key={idx} className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-[var(--text-muted)]">
                              {item.claim.development_date || "Recent Update"} • {item.claim.category.replaceAll("_", " ").toUpperCase()}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-500 font-bold">
                              GROUNDED
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-[var(--text-main)]">{item.claim.statement}</div>
                          <div className="text-xs text-[var(--text-muted)]">{item.explanation}</div>
                          {item.evidence[0] && (
                            <div className="pt-1 flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
                              <IconExternalLink className="w-3.5 h-3.5" />
                              <a href={item.evidence[0].url} target="_blank" rel="noreferrer" className="text-[var(--text-main)] hover:underline">
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
                    <h3 className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      3. Recommended Strategic Questions for Meeting
                    </h3>
                    <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-2 font-mono text-xs">
                      {activeDossier.questions?.map((q, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-[var(--text-main)] py-1 border-b border-[var(--surface-border)] last:border-b-0">
                          <span className="text-[var(--text-muted)] font-bold">{idx + 1}.</span>
                          <span>{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 4: Gateway Execution Traces */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      4. Upstream Gateway Traces
                    </h3>
                    <div className="p-4 rounded-lg bg-[var(--surface-dim)] border border-[var(--surface-border)] space-y-1.5 font-mono text-xs">
                      {activeDossier.events.map((ev, i) => (
                        <div key={i} className="flex items-center justify-between text-[var(--text-muted)] py-1">
                          <span>• {ev.service} (HTTP {ev.status_code || 200})</span>
                          <span className="text-[var(--text-main)] font-semibold">
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

      {/* =========================================================================
          COMPREHENSIVE PROFESSIONAL FOOTER
          ========================================================================= */}
      <footer className="mt-28 border-t border-[var(--surface-border)] bg-[var(--surface-dim)] py-14 text-xs text-[var(--text-muted)]">
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Col 1: Brand & Status */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/brand/benchify-icon.svg"
                  alt="Benchify Logo"
                  width={28}
                  height={28}
                  className="rounded-md"
                  unoptimized
                />
                <span className="font-bold text-sm text-[var(--text-main)]">Benchify</span>
                <span className="tag-version">v1.0</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                The automated reliability gateway and chaos benchmark harness for autonomous AI agents. Grounded with Tavily search and Bifrost routing.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-base)] border border-[var(--surface-border)] text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[var(--text-main)] font-medium">All Gateway Systems Operational</span>
              </div>
            </div>

            {/* Col 2: Platform Capabilities */}
            <div className="space-y-3 font-mono">
              <h4 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Platform
              </h4>
              <ul className="space-y-2 text-xs">
                <li><a href="#chaos-engine" className="hover:text-[var(--text-main)] transition-colors">Deterministic Chaos Matrix</a></li>
                <li><a href="#freshness" className="hover:text-[var(--text-main)] transition-colors">Freshness Auditor (PS06)</a></li>
                <li><a href="#pre-meeting" className="hover:text-[var(--text-main)] transition-colors">Pre-Meeting Intelligence (PS05)</a></li>
                <li><a href="#architecture" className="hover:text-[var(--text-main)] transition-colors">Bifrost Inference Gateway</a></li>
                <li><a href="#docs" className="hover:text-[var(--text-main)] transition-colors">API & Webhook Specification</a></li>
              </ul>
            </div>

            {/* Col 3: Supported Frameworks */}
            <div className="space-y-3 font-mono">
              <h4 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Ecosystem
              </h4>
              <ul className="space-y-2 text-xs">
                <li><span>LangGraph & LangChain</span></li>
                <li><span>CrewAI Multi-Agent</span></li>
                <li><span>Microsoft AutoGen</span></li>
                <li><span>LlamaIndex Workflows</span></li>
                <li><span>OpenAI Assistants API</span></li>
                <li><span>Anthropic Claude SDK</span></li>
              </ul>
            </div>

            {/* Col 4: Open Source & Links */}
            <div className="space-y-3 font-mono">
              <h4 className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                Open Source & Resources
              </h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <a
                    href="https://github.com/sranswal/benchify"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--text-main)] transition-colors flex items-center gap-1.5"
                  >
                    <IconGitHub className="w-3.5 h-3.5" />
                    <span>GitHub: sranswal/benchify</span>
                  </a>
                </li>
                <li><a href="#architecture" className="hover:text-[var(--text-main)] transition-colors">Architecture Specification</a></li>
                <li><a href="#docs" className="hover:text-[var(--text-main)] transition-colors">HTTP Webhook Protocol</a></li>
                <li><span>Apache 2.0 Open Source</span></li>
              </ul>
            </div>
          </div>

          {/* Bottom Copyright Bar */}
          <div className="pt-8 border-t border-[var(--surface-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-[11px] text-[var(--text-muted)]">
            <div>
              © 2026 Benchify Platform. Open source under Apache 2.0 License.
            </div>
            <div className="flex items-center gap-4">
              <a href="https://github.com/sranswal/benchify" target="_blank" rel="noreferrer" className="hover:text-[var(--text-main)] transition-colors">
                GitHub Repository
              </a>
              <span>•</span>
              <a href="#docs" className="hover:text-[var(--text-main)] transition-colors">
                Documentation
              </a>
              <span>•</span>
              <span className="text-[var(--text-main)]">v1.0.0-release</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
