# Memex Harness — Feature Parity and Impact Map

Reconciled 2026-08-26 against the current `memex-desktop` renderer/Electron shell and the Agent_Swarm runtime/UI.

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
| LSP diagnostics | **Shipped / scoped** | Native Electron editor surfaces publishDiagnostics for TypeScript, Python, Rust, and Go, and sends didOpen/didChange/didClose document lifecycle notifications. Full language-server coverage remains environment-dependent. |
| Notebook editing | **Shipped / scoped** | Native renderer opens `.ipynb` files as editable code/Markdown/raw cells, preserves metadata and outputs, and saves valid notebook JSON. Cell execution remains available through Terminal rather than a bundled kernel. |
| Vim editing | **Shipped / scoped** | Native file editing supports a toggleable normal/insert mode with movement, character deletion, and open-line commands; the full Vim command language is intentionally out of scope. |
| REPL tool | **Shipped / scoped** | The native Terminal pane provides a persistent PTY suitable for Python, Node, and shell REPL sessions. A separate model-call `repl` tool contract is intentionally not exposed; terminal REPL is the product choice. |

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
| Auto-start on login | **Shipped / verify** | `setLoginItemSettings` and `--startup` handling exist; the Windows NSIS package was launched successfully in `--startup` mode with the main window hidden, while installed login-item registration remains runtime-unverified. |
| Connection health loop | **Shipped / verify** | Native health probes push status to the renderer; failure/recovery behavior needs runtime smoke coverage. |
| Auto-update | **Shipped / verify** | `electron-updater`, status events, download, and install paths exist; the packaged feed metadata is generated, while live update discovery/install remains runtime-unverified. |
| File type handlers | **Shipped** | `.memex` and `.claude` associations plus open-file routing exist. |
| Native permission bridge | **Shipped / scoped** | Electron dialogs and preload APIs now forward approve/deny decisions to the DevHarness runtime, with owner/workspace-scoped auto-approve grants. Cross-runtime deployed smoke coverage remains. |
| Session export and artifacts | **Shipped** | Redacted session export, artifact store, run-linked files/diffs/reports, and artifact viewer exist. |
| Multiple windows | **Shipped / scoped** | Main and quick-entry windows coexist with tray lifecycle and workspace-safe routing; broader multi-workspace window semantics remain outside the current shell. |
| Global shortcut customization | **Shipped / scoped** | Users can configure the global quick-entry, show-window, and new-chat bindings, with live re-registration; the full shortcut surface is intentionally narrower. |
| Browser / computer-use bridge | **Shipped / scoped** | Native browser pane and allowlisted, handshake-protected Chrome native-messaging bridge exist; broader computer-use safety automation remains outside the current shell. |

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

- Run the opt-in deployed crash-recovery smoke tests covering sandbox, Task, and MCP replay; local approval/checkpoint/resume/compaction coverage now exists. The deployed ordered sandbox replay fixture passed on 2026-08-30. Direct task creation is now enabled explicitly on Turing and its authenticated create/owner-stop/durable-state/events contract passed on 2026-08-31. The deployed MCP replay fixture also passed on 2026-08-31: out-of-order replay returned 409, two allowlisted read-only calls replayed in order, and the checkpoint reached `ready_to_resume` before exact cleanup. Task merge/publish/retry remains separate follow-up coverage.
- Extend approval-policy parity checks to any additional backend runtimes as they are added.
- Run deployed smoke coverage for approval → tool execution → diff → resume → compaction.

### P1 — parity and extensibility

- Complete deployed MCP server lifecycle controls; Turing-host health/config/SSE discovery now passes, and the public authenticated direct-task create/stop/state/events smoke passes. MCP replay remains separate controlled-fixture coverage.
- Run deployed end-to-end smoke coverage for task merge/publish lifecycle and retry recovery; this still requires a controlled authenticated task fixture with a completed or reviewable run.
- Add optional native notebook kernel execution if notebook workflows require an integrated runtime.
- Keep terminal-backed REPL behavior covered by PTY lifecycle and workspace-permission tests; no separate model-call REPL tool is planned.

### P2 — product polish and optional integrations

No committed P2 implementation gaps remain in the current product scope. Runtime-reported provider pricing, scoped Vim editing, configurable global shortcuts, main/quick-entry windows, and the allowlisted browser bridge are implemented. Broader multi-workspace windows, a full Vim command language, deeper computer-use automation, and direct Codex/Claude account login remain future options only if product requirements change.

## Reconciliation notes

The previous roadmap incorrectly marked these as missing: auto-start, health monitoring, updater, file handlers, native permission dialogs, session resume, context/token UI, and diff review. They are now implemented or substantially implemented in the current source.

The remaining scope is now concentrated in higher-level integration and parity:

- **Worktree isolation** has first-class create/remove/merge lifecycle support; live-repo concurrency is project-scoped and publish state is explicit, with deployed smoke coverage remaining.
- **MCP integration** has all four configured transports and capability-backed resources/prompts; deployed health/config and ordered read-only replay now pass. SPIRE socket mounting, Docker PID attestation, and X.509 SVID capability-token signing/verification now pass on Turing.
- **Skills** support deterministic user/project Markdown loading; native notebook editing, scoped LSP diagnostics, and scoped Vim editing are available, while integrated notebook kernel execution remains outside the renderer.
- **Cost tracking** includes token totals and provider-reported USD estimates; local Ollama runs explicitly report zero cost and unknown provider prices remain unlabeled.

## Validation snapshot

- `memex-desktop`: renderer and Electron typechecks passed; 55 tests passed across 17 files on 2026-08-31; the Windows NSIS installer was produced as `release/Memex Desktop Setup 0.1.25.exe`; and the unpacked packaged app initialized responsively in `--startup` mode with no visible main window. The authenticated deployed `/dev` review confirmed the editor, terminal, goals, notes, workspace selector, and status controls render; the existing fixture did not exercise TodoCard, diff-chip, pioneer-activity, or trace rendering.
- `Agent_Swarm`: the full suite passes with `796 passed, 7 skipped, 7 warnings`, including all six backend handoff-contract tests. Agent storage initialization is lazy, so importing the runtime no longer requires a live PostgreSQL login; actual agent execution still uses the configured database.
- Deployed checks: after deploying the lazy-storage fix and restarting Turing's `agent_runtime`, the live PostgreSQL credential authenticated as `agno` to `agno_memory`, runtime import completed successfully, and MCP health remained healthy with 19 tools, 2 resources, and 2 prompts. The authenticated public DevHarness checkpoint list is reachable and currently empty. On 2026-08-30, an isolated durable checkpoint replay fixture executed the first ordered read-only sandbox call, returned `recovery_required` with the next call ID, and was removed afterward; no production data was changed. On 2026-08-31, direct task creation was enabled explicitly on Turing after adding scoped-dispatch compatibility; an authenticated no-tools task returned 202, owner stop returned 200, durable state became `cancelled`, events were present, and fresh runtime logs were clean. The same day, an isolated MCP replay fixture rejected an out-of-order call with 409, replayed `web_search` and `web_fetch` in order, reached `ready_to_resume`, and deleted exactly one synthetic checkpoint row. The SPIRE follow-up then verified the live socket mount, `pid: host` attestation, and an authenticated token-backed `web_fetch` with `SPIRE signing enabled`, valid SVID verification, and no fallback/error path. Task merge/publish/retry remains separate controlled-fixture coverage.
- Dependency audit: production dependencies report 0 vulnerabilities after the `js-yaml` 4.3.1 lockfile update. The safe lockfile refresh plus the Vite 6.4.3 upgrade reduced the development audit to 10 findings (1 critical, 9 high); all remaining fixes require major Electron/electron-builder upgrades.
- Security-upgrade trial: Electron 41.10.3 and electron-builder 26.15.3 reached 0 audit findings with Vite 6.4.3, PostCSS 8.5.26, and shell-quote 1.10.0 under the bundled Node 24.19.0 runtime, but packaging could not rebuild `node-pty` without Visual Studio Spectre-mitigated libraries. The Electron/electron-builder candidate was reverted; the release baseline now keeps Electron 31/electron-builder 24 while using the verified Vite 6.4.3 tranche.
- Both repositories are clean after their current checkpoint commits; desktop and backend `main` refs are pushed, and the backend runtime is deployed on Turing.
