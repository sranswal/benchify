# Reuse review

| Project | Architecture and activity | License and adoption |
|---|---|---|
| [Bifrost](https://github.com/maximhq/bifrost) | Active Go gateway with routing, logs and telemetry | Apache-2.0 OSS. Direct low-complexity HTTP integration. |
| [Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/search) | Hosted Search and Extract with a [Python SDK](https://github.com/tavily-ai/tavily-python) | SDK is MIT. Hosted terms apply. Search uses the shared async HTTP client. Add Extract if excerpts prove insufficient. |
| [Agent Arena](https://github.com/AmosBunde/Agent-Arena) | Python platform with adapters, suites and migrations. Long-term cadence unverified | Apache-2.0. Reference its task and adapter approach. Forking would couple the runner and persistence model. |
| [TraceTrial-Bench](https://github.com/TraceLite-AI/TraceTrial-Bench) | Research harness with 95 tasks and failure attribution. Long-term cadence unverified | MIT. Consider selected fault cases. Medium effort to map to research tasks. |
| [DeepEval](https://github.com/confident-ai/deepeval) | Active Python test-case and metric framework | Apache-2.0. Optional evaluator behind a versioned rubric, with judge calibration and cost controls. |
| [FreshGuard](https://github.com/sidharth-cs/freshguard) | Early Go gateway plugin with claim spotting, Tavily retrieval, judgment, caching and labeled cases | Apache-2.0. Review labeled cases for adaptation with attribution. Direct use adds Go/plugin coupling. Benchify uses an explicit verifier over claims produced by agents and pasted answers, with trace-linked reports and evidence recency separated from correctness. |
| [ClaimBuster Spotter](https://github.com/utaresearch/claimbuster-spotter) | Transformer research code for check-worthiness. Current maintenance unverified | GPL-3.0 for this repository. Reference only. Temporal sensitivity needs different labels. |
| [Langfuse](https://github.com/langfuse/langfuse) | Active OTEL-based trace and evaluation platform | [MIT Expat for the core with separately licensed enterprise and third-party code](https://github.com/langfuse/langfuse/blob/main/LICENSE). Optional OTLP destination. |
| [OpenTelemetry Python](https://github.com/open-telemetry/opentelemetry-python) | Active vendor-neutral API, SDK and exporters | Apache-2.0. Add OTLP export after the runner is stable. |

The slice uses [Bifrost's OpenAI-compatible endpoint](https://docs.getbifrost.ai/integrations/openai-sdk/overview) and [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search). Benchify owns repeated task execution, fault attribution, comparison rubrics and the evidence-to-brief workflow. No source was copied from the reviewed projects.
