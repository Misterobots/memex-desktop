# Model Arena implementation scope

Requested 2026-09-05. Not implemented yet; existing Eval cases must remain readable.

## Prerequisites

- Repair MCP protocol compatibility and expose genuine high-level research tooling. Current production MCP lists legacy hive tools, not memex_research/perspectives/swarm. Do not equate a web-search tool with the missing orchestration pipeline.
- Honor explicit Design model selection, validate catalog membership, and persist actual provider model identity. Mismatches invalidate model-comparison rankings.

## Arena modes

- Output comparison: same prompt and supplied inputs, two or more selected installed models, independently isolated sessions, side-by-side Markdown and sandboxed HTML/media artifacts. Optional blind labels and human rubric scores; reveal names after voting.
- Task comparison: shared task specification, fixed starting fixture, identical tool permissions and budgets, separate disposable workspaces. Evaluate produced artifacts and explicit acceptance checks, not only assistant prose. Never run contestants against the same writable user checkout or auto-publish their outputs.

## Measurements and controls

Sequential execution by default for this single-GPU comparison. Record requested/actual model, context and thinking settings, cold/warm state when known, wall time, first-output latency, provider tokens/s, token usage, errors, and artifact availability. Unknown measurements remain unavailable. Do not infer tokens from characters or manufacture VRAM samples.

Persist contestants, individual attempts, rubric scores, win/tie decisions, and settings snapshots. Support cancel, explicit retry, results after reload, and export. Cancel must distinguish disconnected client from confirmed server cancellation. Keep existing Eval storage identifiers compatible rather than destructively migrating cases.

## First benchmark

Qwen3 14B versus installed Gemma4 E4B: landing page, responsive dashboard, then constrained revision. Match context initially at 8K, test compatible model-specific prompting, inspect mobile/desktop output and actual interaction behavior. Benchmark results determine the default; no winner is presumed.

## Acceptance coverage

Test session and workspace isolation, model mismatch rejection, structured artifacts, missing metrics, sequential scheduling, cancellation/retry, persistence, blind/reveal scoring, keyboard labels, and unchanged legacy case loading. Run CLI checks visibly and verify the actual Arena UI in both browser and native desktop where supported.
