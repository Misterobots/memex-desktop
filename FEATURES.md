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
| Tool approval prompts | **Partial** | Native approve-once/session/workspace dialogs and backend approval events exist. `plan`, `acceptEdits`, and admin-gated `bypass` now have distinct runtime semantics, and pending approval IDs are owner-bound; durable owner-scoped policy and fail-closed enforcement still need hardening. |
| Session resume | **Partial** | Conversations resume from Postgres; desktop checkpoints turns before and during streaming, while Agent_Swarm persists owner-scoped neutral-history checkpoints. Explicit, ordered replay and continuation now work for direct sandbox tools; Task/MCP replay remains intentionally unsupported. |
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
| Task board and task composer | **Partial** | Backend task APIs and desktop task UI exist; the full TaskCreate/Update/Get/List/Stop lifecycle is not yet one consistent contract. |
| Project-scoped workspaces | **Shipped** | Dev projects, blank projects, live-repo selection, and project-scoped task routing exist. |
| Git worktree isolation | **Gap / partial equivalent** | Containers isolate most work; explicit EnterWorktree/ExitWorktree, branch lifecycle, cleanup, and merge semantics are not implemented as first-class tools. |
| LSP diagnostics | **Partial** | Native Electron LSP manager exists; Agent_Swarm's web editor consumes LSP diagnostics. The native desktop renderer does not yet expose the same editor integration. |
| Notebook editing | **Partial** | Agent_Swarm web UI has a notebook viewer/editor; the native `memex-desktop` renderer does not. |
| REPL tool | **Gap** | A terminal can run a REPL, but there is no dedicated REPL lifecycle/state/tool contract. |

### 3. High impact — extensibility and model context

| Capability | Status | Evidence / notes |
|---|---|---|
| MCP bridge | **Partial** | `MCPBridgeServer` exposes HTTP JSON-RPC tools/skills with capability checks. It is not yet a full stdio/SSE/WebSocket MCP host and lacks broad resource/prompt compatibility. |
| Built-in skills | **Shipped** | Skill registry, resolution, MCP descriptors, web tools, bash parsing, and fabrication skills exist. |
| Claude-style Markdown skills | **Gap / partial equivalent** | Built-in Python skills are registered; user/project Markdown skill discovery, precedence, and scope rules are not yet equivalent. |
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

- Unify the desktop and Agent_Swarm event schema for tool start, approval, result, file change, todo, usage, continuation, and error events.
- Extend explicit, ordered replay to Task/MCP calls; direct sandbox-tool replay, recovery inspection, and continuation are now in place.
- Move approval policy toward one durable, owner-scoped, fail-closed enforcement layer; retain native dialogs as the presentation layer.
- Finish per-project concurrency, branch cleanup, and explicit worktree semantics for live-repo work.
- Add end-to-end smoke tests covering approval → tool execution → diff → resume → compaction.

### P1 — parity and extensibility

- Implement full MCP host compatibility: stdio, SSE, WebSocket, configuration discovery, resources, prompts, and server lifecycle.
- Add user/project Markdown skill discovery with deterministic precedence and reload behavior.
- Complete the task lifecycle contract: create, update, get, list, stop, approval, diff, and completion/publish.
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

The previous roadmap also overstated these capabilities:

- **Worktree isolation** is currently stronger as container isolation than as Git worktree management.
- **MCP integration** is a useful HTTP bridge, not yet full transport-level MCP compatibility.
- **Skills** are primarily registry/built-in skills, not yet full Claude-style Markdown skill loading.
- **LSP and notebooks** exist in the Agent_Swarm web UI but are not feature-complete across the native desktop renderer.
- **Cost tracking** means token tracking today; per-session USD estimates are still absent.

## Validation snapshot

- `memex-desktop`: TypeScript typecheck passed; 30 tests passed, including conversation-sync retry/coalescing coverage and streaming checkpoint integration changes.
- `Agent_Swarm`: neutral history checkpoint round-trip, AST, and permission behavior checks passed; repository pytest remains blocked by the existing `uv` trampoline permission error.
- Both repositories contain uncommitted work; treat current implementation status as a working-tree audit, not a release tag.
- Agent_Swarm's broad compile check was blocked by existing `__pycache__` filesystem permissions; this did not establish a source syntax failure.
