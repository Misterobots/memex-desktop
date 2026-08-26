# Memex Harness — Feature Parity and Impact Map

Reconciled 2026-08-21 against the current `memex-desktop` renderer/Electron shell and the Agent_Swarm runtime/UI.

This document is the current feature baseline. It distinguishes:

- **Shipped** — implementation exists in the current source and has a clear product surface.
- **Partial** — an equivalent exists, but it is incomplete, cross-surface, or lacks production hardening.
- **Gap** — no meaningful implementation was found.
- **Not applicable** — a Claude Desktop-specific capability that is not part of Memex's product direction.

## Executive status

The harness already has the high-value core: streaming agent execution, multi-agent coordination, sandboxed coding, session persistence, context compaction, approvals, task planning, tracing, memory, and a native desktop shell.

The remaining parity work is concentrated in five areas:

1. durable recovery and event-contract consistency;
2. true worktree isolation rather than container isolation alone;
3. complete MCP and Markdown skill compatibility;
4. fail-closed, durable permission policy;
5. closing capability differences between the native desktop renderer and the Agent_Swarm web UI.

## Wins grouped by impact and functionality

### 1. Highest impact — safe, resumable agent execution

| Capability | Status | Evidence / notes |
|---|---|---|
| Streaming agent loop | **Shipped** | `church.py` / SSE pipeline and the desktop stream consumer are active. |
| Multi-agent swarm coordination | **Shipped** | Lamport coordination, role-based workers, synthesis, and run persistence exist. |
| Per-session Docker sandbox | **Shipped** | Agent_Swarm creates disposable session containers and routes sandbox calls through session identity. |
| Workspace firewall | **Shipped** | Native file, shell, PTY, and workspace operations are guarded. |
| Tool approval prompts | **Shipped / scoped** | Native approve-once/session/workspace dialogs and backend approval events exist. `plan`, `acceptEdits`, and admin-gated `bypass` have distinct runtime semantics, pending approval IDs are owner-bound, and durable owner/workspace-scoped policy fails closed. |
| Session resume | **Shipped / scoped** | Conversations resume from Postgres; desktop and Agent_Swarm checkpoints persist owner-scoped neutral history. Explicit, ordered replay and continuation cover direct sandbox, read-only MCP, and Task calls; end-to-end crash recovery smoke coverage remains. |
| Context compaction | **Shipped / verify** | Manual and automatic compaction, compacting UI state, summaries, and context meters exist. Needs an end-to-end recovery test. |
| Token usage display | **Shipped** | Prompt/completion/total token counts appear in the chat/status surfaces. USD estimates are not implemented for local-model usage. |
| Run/event inspection | **Shipped** | Run inspector, tool lifecycle events, approvals, artifacts, agent graph, and Langfuse tracing exist. |

### 2. High impact — coding workflow and developer productivity

| Capability | Status | Evidence / notes |
|---|---|---|
| File read/write/edit tools | **Shipped** | DevHarness supports read, write, exact edit, directory listing, glob, grep, and file-change events. |
| Shell/terminal execution | **Shipped** | PTY and WebSocket terminal paths exist in the desktop and Agent_Swarm UI. |
| Git operations | **Shipped** | Status, diff, branch, commit, and related operations are available. |
| Diff review | **Shipped** | Desktop line diff/review modal and task/web diff views exist. |
| Task planning / TodoWrite | **Shipped** | TodoWrite-style events and task cards render in the Agent_Swarm UI. |
| Task board and task composer | **Shipped / scoped** | Backend and desktop share create/update/get/list/stop/approval/diff/push task routes, stable event history, and owner-scoped merge/publish state. Deployed end-to-end recovery smoke coverage remains. |
| Project-scoped workspaces | **Shipped** | Dev projects, blank projects, live-repo selection, and project-scoped task routing exist. |
| Git worktree isolation | **Shipped / scoped** | Desktop has an explicit owner-scoped worktree manager with generated branches, clean-tree protection, list/create/remove/merge operations, conflict aborts, and cleanup controls; backend live-repo locks are project-scoped and publish status is explicit. Deployed smoke coverage remains. |
| LSP diagnostics | **Partial** | Native Electron LSP manager exists; Agent_Swarm's web editor consumes LSP diagnostics. The native desktop renderer does not yet expose the same editor integration. |
| Notebook editing | **Partial** | Agent_Swarm web UI has a notebook viewer/editor; the native `memex-desktop` renderer does not. |
| REPL tool | **Gap** | A terminal can run a REPL, but there is no dedicated REPL lifecycle/state/tool contract. |

### 3. High impact — extensibility and model context

| Capability | Status | Evidence / notes |
|---|---|---|
| MCP bridge | **Shipped / contract complete** | `MCPBridgeServer` exposes HTTP, SSE, WebSocket, and stdio JSON-RPC transports, standard resources/prompts, capability metadata, truthful health, and client configuration. |
| Built-in skills | **Shipped** | Skill registry, resolution, MCP descriptors, web tools, bash parsing, and fabrication skills exist. |
| Claude-style Markdown skills | **Shipped / scoped** | User/project Markdown skill discovery, CRLF-safe frontmatter parsing, deterministic project-over-user precedence, and reload-safe enablement are implemented. |
| Persistent memory | **Shipped** | MemPalace plus owner-aware session summaries and memory recall are integrated. |
| Hooks | **Partial** | Desktop hooks have consent and audit paths; cross-runtime lifecycle coverage and durable policy parity remain incomplete. |
| Slash commands | **Shipped / narrower surface** | `/swarm`, `/plan`, `/research`, `/design`, `/workshop`, `/think`, `/compact`, `/memory`, and related commands exist. Claude Code's full command surface is intentionally not replicated. |
| Multi-provider routing | **Shipped / scoped** | Ollama multi-node, GitHub Models, and Anthropic adapters exist. Direct Codex/Claude account login and provider-native session semantics are not part of the current shell. |

### 4. Medium impact — native desktop product surface

| Capability | Status | Evidence / notes |
|---|---|---|
| Electron native shell | **Shipped** | Local React renderer, tray behavior, quick entry, native controls, authenticated IPC, and PTY bridge exist. |
| Auto-start on login | **Shipped / verify** | `setLoginItemSettings` and `--startup` handling exist; packaging smoke test remains useful. |
| Connection health loop | **Shipped / verify** | Native health probes push status to the renderer; failure/recovery behavior needs runtime smoke coverage. |
| Auto-update | **Shipped / verify** | `electron-updater`, status events, download, and install paths exist. |
| File type handlers | **Shipped** | `.memex` and `.claude` associations plus open-file routing exist. |
| Native permission bridge | **Shipped / partial policy** | Electron dialogs and preload APIs exist; backend policy still needs one canonical enforcement path. |
| Session export and artifacts | **Shipped** | Redacted session export, artifact store, run-linked files/diffs/reports, and artifact viewer exist. |
| Multiple windows | **Partial** | Main and quick-entry windows exist; broader multi-window workspace semantics are not implemented. |
| Global shortcut customization | **Partial** | Configurable shortcut plumbing exists, but parity with the full desktop shortcut surface is incomplete. |
| Browser / computer-use bridge | **Partial** | Browser bridge and browser pane exist; full computer-use safety controls and extension-native messaging are not implemented. |

### 5. Memex differentiators — functionality beyond baseline parity

| Capability | Status | Impact |
|---|---|---|
| Research mode and perspective matrix | **Shipped** | Multi-lens research and synthesis workflow. |
| Design and mockup mode | **Shipped** | HTML visual generation and design workflow. |
| Product workshop / discovery mode | **Shipped** | Guided product brief and follow-up continuation. |
| MemPalace semantic memory | **Shipped** | Durable semantic recall beyond a single project. |
| Multi-node GPU routing and queueing | **Shipped** | Model routing, queue management, and circuit-breaker behavior. |
| Langfuse observability | **Shipped** | Traces, token usage, latency, and process-reward visibility. |
| CAD / fabrication workflow | **Shipped / specialized** | CAD render/export, approval-gated print workflow, and paired remote review. |
| Goals and scheduled tasks | **Shipped / specialized** | Persistent goals, plans, scheduled triggers, and task continuation. |

## Remaining work, grouped by impact

### P0 — reliability and safety

- Add deployed crash-recovery smoke tests covering sandbox, Task, and MCP replay; local approval/checkpoint/resume/compaction coverage now exists.
- Keep approval policy enforcement and native dialogs aligned as additional backend runtimes are added.
- Add deployed smoke coverage for approval → tool execution → diff → resume → compaction.

### P1 — parity and extensibility

- Add transport integration tests against the deployed MCP runtime and complete server lifecycle controls.
- Add deployed end-to-end smoke coverage for task merge/publish lifecycle and retry recovery.
- Decide whether notebook editing and LSP diagnostics should be brought into the native desktop renderer or remain web-UI capabilities.
- Add a first-class REPL tool, or explicitly document terminal-based REPL support as the product choice.

### P2 — product polish and optional integrations

- USD cost estimates where provider pricing is available.
- Broader shortcut and multi-window behavior.
- Vim mode.
- Chrome extension/native messaging.
- Provider-native Codex/Claude authentication if direct account-backed model sessions become a requirement.

## Reconciliation notes

The previous roadmap incorrectly marked these as missing: auto-start, health monitoring, updater, file handlers, native permission dialogs, session resume, context/token UI, and diff review. They are now implemented or substantially implemented in the current source.

The remaining scope is now concentrated in higher-level integration and parity:

- **Worktree isolation** has first-class create/remove/merge lifecycle support; live-repo concurrency is project-scoped and publish state is explicit, with deployed smoke coverage remaining.
- **MCP integration** has all four configured transports and capability-backed resources/prompts; deployed-runtime lifecycle testing remains.
- **Skills** support deterministic user/project Markdown loading; LSP and notebooks remain web-UI capabilities that are not feature-complete in the native renderer.
- **Cost tracking** means token tracking today; per-session USD estimates are still absent.

## Validation snapshot

- `memex-desktop`: TypeScript typecheck passed; 47 tests passed across 12 files, including conversation-sync retry/coalescing coverage and streaming checkpoint integration changes.
- `Agent_Swarm`: neutral history checkpoint round-trip, AST, permission, event-recovery, queue, publish, and MCP transport checks passed; repository pytest collection remains blocked by the optional `modelscope` dependency.
- Targeted Agent_Swarm regression tests passed for stable event persistence/recovery, approved tool checkpoint/resume/compaction flow, scoped task queues, idempotent publish confirmation, MCP transports, DevHarness history, and permissions; the full suite remains blocked by the optional `modelscope` dependency, and the full handoff contract module is skipped when `prometheus_client` is unavailable.
- Both repositories are clean after their current checkpoint commits; pushes remain intentionally unperformed.
