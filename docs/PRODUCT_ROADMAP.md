# Benchify product roadmap

Benchify helps engineering teams prove agent behavior with repeatable evaluation, explainable evidence and observable execution. Research Intelligence supplies a reference workload for these capabilities. Current maturity is a developer MVP for trusted operators.

## Phases and release criteria

| Milestone | Scope and current state | Exit evidence |
|---|---|---|
| A. Branded, Secure Developer MVP | Original brand integrated. Private operator gate, HTTP agent outbound controls, recording lifecycle and replay/comparison are implemented within the single-operator architecture. | Deterministic tests, Neon checkpoint and restart recovery, and local browser acceptance for core workflows. |
| B. External Developer Beta | Identity provider, secure sessions, workspace isolation, scoped APIs and secure agent registration. Add hosted browser checks, monitoring, ingress quotas, and deployment recovery and rollback drills. | Tests verify cross-workspace and callback isolation. A hosted environment passes end-to-end acceptance and a restore drill. |
| C. Continuous Agent Quality | CI/CD integration, automated regression checks, schedules, evaluation suites, quality thresholds and historical analytics. Expand agent adapters and define a safe capture boundary for HTTP agents. | Engineers can reproduce a quality gate from the exact run, configuration and recorded evidence. |
| D. Team and Commercial Readiness | Organizations, usage metering, quotas, auditability, collaboration and support. Add billing when demand justifies it. | Observed repeat usage, reconciled usage data and operational ownership for customer-facing workloads. |

## Product strategy

**Verified market facts.** LangSmith offers dataset experiments, comparisons and online evaluators. Braintrust combines traces, experiments and code/model/human scoring. Evaluation plus observability is already a competitive baseline. This comparison reflects documented capabilities and makes no exclusivity claim about competitors' verification features. [LangSmith evaluation types](https://docs.langchain.com/langsmith/evaluation-types) · [Braintrust](https://www.braintrust.dev/)

**Initial user hypothesis.** Platform engineers and AI quality leads shipping web-connected agents need to explain regressions caused by changes in sources, providers, or agent behavior. That pain and willingness to adopt are unvalidated. Potential early design partners operate support, research, or policy agents whose outputs contain time-sensitive factual claims.

**Differentiation hypothesis.** Versioned evidence plus as-of-date judgments, exact cited excerpts and a trace of provider and fault behavior could make failures actionable without manually reconstructing an agent run. The combination is compelling only if teams can use it to resolve real regressions faster than their existing eval stack. Observe design partners rerunning known incidents and measure onboarding completion, investigation time, evidence correctness and repeat use.

**Minimum lovable product.** Register an existing HTTP agent, load a dated evidence dataset, run baseline and outage scenarios, reproduce them offline, compare two revisions and explain each regression with a trace and excerpt. Sell the workflow benefit before expanding into generalized research automation.

**Adoption barriers and risks.** Existing eval data and SDKs create switching costs. Live providers and search can drift, excerpts omit context, model judges can be inconsistent, and provider costs and missing telemetry can distort comparisons. Proprietary prompts and traces raise deployment and retention concerns. Offer portable datasets and exports and test representative workflows explicitly.

**Commercial hypotheses.** Consider open adapter contracts, CLI and fixture runner for adoption, paired with a paid hosted workspace for governance, managed runs and CI integration. Compare per-workspace subscription plus execution allowances, usage-based evaluation pricing, and enterprise deployment contracts with design partners. Major cost drivers include model tokens and retries, search credits, agent compute, trace retention, Postgres connections and storage, and support. Capture true costs and usage coverage before committing to prices.

**Current milestone.** Restore the private hosted deployment for the existing single operator. Publish the application source, connect the correct Vercel project and HTTPS API, run hosted acceptance on a disposable Neon branch, and complete the managed recovery rehearsal. Milestone B follows with per-user identity, workspace ownership, tenant-boundary tests, hosted egress controls and monitoring. Obtain Bifrost operator logs for an intermittent failure before attributing it upstream.

See [replay, retention and comparison](REPLAY_AND_REGRESSION.md) for the versioned formats, API and operational limits.
