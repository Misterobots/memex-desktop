# Memex Desktop — Feature Roadmap

Mapped against Claude Code (CLI + desktop) and Claude Desktop (consumer app).

---

## Native Shell (Electron)

| Feature | Claude Desktop | Memex Desktop |
|---------|---------------|---------------|
| WebContentsView architecture | ✅ Loads claude.ai | ✅ Loads memex.shivelymedia.com |
| Hidden title bar + native controls overlay | ✅ Win/Linux: titleBarOverlay | ✅ Implemented |
| macOS traffic lights | ✅ trafficLightPosition | ✅ Implemented |
| System tray + background persistence | ✅ Hide on close, balloon notif | ✅ Implemented |
| Quick entry floating window | ✅ Option+Option / global hotkey | ✅ Ctrl+Shift+Space |
| Quick entry auto-resize (skooch) | ✅ requestSkooch IPC | ✅ Implemented |
| File / folder drag-and-drop | ✅ open-file event → type routing | ✅ → desktopLocalPath + /dev |
| External link handling | ✅ openExternal in WebContentsView | ✅ setWindowOpenHandler |
| Auto-start on login | ✅ app.setLoginItemSettings | ❌ Not built |
| Connection health + offline overlay | ✅ Exponential backoff health loop | 🟡 Basic (error overlay + retry) |
| Session cookie persistence | ✅ Chromium session in userData | ✅ Authentik cookies persist |
| SSO authentication | ✅ Claude.ai account | ✅ Authentik SSO |
| Computer Use / safety kill switch | ✅ Global Escape hotkey on CU lock | ❌ Not applicable yet |
| Chrome extension native messaging | ✅ Native host + WebSocket bridge | ❌ Not built |
| gVisor VM sandbox | ✅ Hyper-V + VHDX boot | ❌ Not built (use Docker instead) |
| Office 365 MCP (MSAL auth) | ✅ Native WAM binding | ❌ Not applicable |
| Window open handler (skill/DXT files) | ✅ File type routing on open-file | ❌ Not built |
| Multiple windows | ✅ Quick + main | 🟡 Quick + main only |
| Update system | ✅ Squirrel auto-updater | ❌ Not built |

---

## Window.memex Bridge (native → web)

| Feature | window.claude equivalent | Memex Desktop |
|---------|--------------------------|---------------|
| isDesktop detection | ✅ window.claude exists | ✅ window.memex.isDesktop |
| File read/write/readDir/mkdir | ✅ Via IPC | ✅ window.memex.fs.* |
| Shell exec | ✅ Via IPC | ✅ window.memex.shell.exec |
| Native folder dialog | ✅ dialog.showOpenDialog | ✅ window.memex.dialog.openFolder |
| PTY terminal (node-pty) | ✅ Via IPC | ✅ window.memex.pty.* |
| Quick submit relay | ✅ window.claude relay | ✅ onQuickSubmit → chat:prefill |
| Open path relay | ✅ Via open-file event | ✅ onOpenPath → desktopLocalPath |
| Client identification header | ✅ Internal | ✅ X-desktop-client |
| App version | ✅ app.getVersion() | ✅ window.memex.version |
| Open external URL | ✅ shell.openExternal | ✅ window.memex.shell.openExternal |

---

## Agent Capabilities

| Feature | Claude Code | Memex / Memex Desktop |
|---------|-------------|----------------------|
| Streaming agent loop | ✅ QueryEngine + StreamingToolExecutor | ✅ church.py + SSE pipeline |
| Multi-agent swarm | ✅ AgentTool + autonomous task claiming | ✅ coordinate_task + Lamport |
| Sub-agent roles | ✅ coder, reviewer, researcher | ✅ 6 roles (coder, devops, researcher, analyst, verifier, architect) |
| Planning mode | ✅ EnterPlanMode / ExitPlanMode | ✅ ultraplan_mode flag |
| Extended reasoning | ✅ Extended thinking toggle | ✅ ultrathink_mode |
| Research mode | ✅ WebSearch + synthesis | ✅ research_mode + perspective matrix |
| Design / mockup | ❌ | ✅ design_mode → HTML generation |
| Workshop / discovery | ❌ | ✅ workshop_mode → Product Brief |
| Git worktree isolation | ✅ EnterWorktree / ExitWorktree | ✅ DevHarness sandbox |
| DevHarness (code execution) | ✅ BashTool sandbox | ✅ devharness_worker.py |
| Task board | ✅ TaskCreate/Update/Get/List/Stop | ✅ Backend exists, UI partial |
| Session persistence / resume | ✅ Append-only JSONL | 🟡 Postgres session storage |
| Context compression | ✅ autoCompact / snipCompact | ❌ Not implemented |
| Persistent memory | ✅ CLAUDE.md injection + 7-layer | ✅ MemPalace (semantic vector store) |
| MCP server integration | ✅ stdio, SSE, HTTP, WebSocket | ✅ MCPBridgeServer + /api/v1/mcp/rpc |
| Permission system | ✅ ask / allow / deny + ML classifier | 🟡 Governance + tool approval (partial) |
| Cost / token tracking | ✅ Per-session USD estimates | ❌ Not surfaced in UI |
| Telemetry | ✅ Anthropic + Datadog dual-sink | ✅ Langfuse tracing |
| Skills system | ✅ Markdown skill definitions | ✅ skill_registry + SkillTool |
| Slash commands | ✅ ~87 commands | ✅ /swarm /workshop /design /think /plan /research |
| Voice mode | ✅ Audio input | ✅ BMO voice agent (separate) |
| Multi-provider models | ✅ Anthropic + 10+ providers | ✅ Ollama multi-node + GitHub Models + Anthropic |
| GPU queue management | ❌ | ✅ gpu_queue.py + circuit breaker |

---

## Development Tools (UI)

| Feature | Claude Code | Memex Desktop |
|---------|-------------|--------------|
| File tree explorer | ✅ (via GlobTool) | ✅ component/dev/file-tree.tsx |
| File editor (open/edit/save) | ✅ FileEditTool | ✅ editor-pane.tsx + tabbed-editor.tsx |
| Terminal (PTY) | ✅ BashTool | ✅ terminal-pane.tsx — dual backend (PTY/WS) |
| Git integration | ✅ Diffs, status, commit | ✅ git-panel.tsx (partial) |
| Preview pane | ❌ | ✅ output-preview.tsx / preview-canvas.tsx |
| Task board UI | ✅ TodoWrite display | 🟡 tasks/ directory (partial) |
| Log viewer | ❌ | ✅ log-viewer.tsx |
| Notes panel | ❌ | ✅ notes-panel.tsx |
| Agent trace viewer | 🟡 Tool call display | ✅ Pioneer traces in chat |
| Resizable panels | ✅ | ✅ resizable-divider.tsx |
| LSP support | ✅ LSPTool | ❌ Not built |
| REPL | ✅ REPLTool | ❌ Not built |
| Diff viewer | ✅ Red/green inline diffs | ❌ Not built |
| Notebook editing | ✅ NotebookEditTool | ❌ Not built |

---

## Desktop-Specific (to build next)

Priority items that Claude Desktop/Code has and Memex Desktop needs:

### High priority
- [ ] **Auto-start on login** — `app.setLoginItemSettings` + `--startup` arg
- [ ] **Connection health loop** — exponential backoff, health polling, auto-recovery (like Claude Desktop's `Ce()` function)
- [ ] **Cost / token display** — show token usage and USD estimate per session in status bar
- [ ] **Permission prompts** — surface tool approval requests from agent_runtime in native dialogs
- [ ] **Session resume** — load previous session from Postgres/JSONL on startup

### Medium priority
- [ ] **Update system** — Squirrel-based auto-updater, version check on launch
- [ ] **Global shortcuts** — customizable hotkeys (beyond Ctrl+Shift+Space)
- [ ] **File type handlers** — register `.memex` / `.claude` skill file associations
- [ ] **Context window indicator** — token count visible in UI
- [ ] **Diff viewer** — inline before/after diffs for file edits

### Lower priority
- [ ] **LSP integration** — connect to language servers for code intelligence
- [ ] **Chrome extension bridge** — control browser from desktop
- [ ] **Vim mode** — modal editing in chat input
- [ ] **Notebook support** — Jupyter notebook editing
- [ ] **Remote pairing** — connect to another Memex instance

---

## Summary

**Memex Desktop already matches or exceeds Claude Desktop on:**
- WebContentsView architecture, native chrome, SSO, tray, quick entry
- Agent capabilities (swarm, research, design, workshop — unique to Memex)
- MemPalace memory, multi-node GPU routing, Langfuse tracing

**Gaps vs Claude Code:**
- Context compression (token management)
- Native permission prompts in the desktop shell
- Auto-start, update system
- LSP / REPL / diff viewer
- Cost tracking visible in UI
