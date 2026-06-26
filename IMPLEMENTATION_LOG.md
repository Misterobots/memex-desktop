# Memex Desktop — Hardening Playbook Implementation Log

Branch: `hardening-playbook`

---

## Pivot: Local React Renderer (pre-hardening baseline)

**Commit:** (see below)

### Summary

Rewrote Electron main process and preload for local React renderer architecture.
Removed WebContentsView / website wrapper. App now loads local React build (Vite dev
server in dev, `dist/index.html` in prod) and talks directly to `agent_runtime` at
`http://192.168.2.101:8008`.

### Changed files

- `electron/main.ts` — full rewrite: safeStorage identity, `webRequest` header injection, local URL load
- `electron/preload-memex.ts` — full rewrite: full `window.memex` bridge (pty, fs, shell, lsp, browser, identity, updater, permissions)
- `package.json` / `package-lock.json` — restored React 18, Zustand, Tailwind, vite-plugin-electron deps
- `vite.config.ts` — restored for local React + Electron build
- `src/App.tsx` — updated to use `desktop()` bridge + health polling
- `src/lib/ipc.ts` — rewritten to use `desktop()` helper
- `src/lib/desktop.ts` — NEW: typed bridge interface, `isDesktop()`, `desktop()` helpers
- `src/lib/hooks/use-desktop.ts` — NEW: `useDesktop()` React hook

---

## HR-1: Fix Terminal Bridge

**Rollback tag:** `rollback/hr-1-terminal-bridge-before`
**Commit:** (see below)

### Summary

Updated `TerminalPane.tsx` to use `window.memex.pty` via `desktop()` helper.
Removed all `window.electron.pty` references. Terminal now uses `onData` (not `onKey`)
to capture paste and control sequences correctly.

### Changed files

- `src/components/dev/TerminalPane.tsx`

### Verification

- `npm run build:electron` passes
- Manual smoke: PTY creates, data flows, resize, kill on unmount

### Known risks

None — purely a bridge reference update.

---

## HR-7: Make Model Selection Functional

**Rollback tag:** `rollback/hr-7-model-selection-before`
**Commit:** (see below)

### Summary

Added `model?: string` to `StreamOptions`. `InputBar` passes `selectedModel` from
Zustand store into `streamChat()`. Removed hard-coded `model: "swarm"` — model now
comes from the UI selector.

### Changed files

- `src/lib/sse-stream.ts`
- `src/components/layout/InputBar.tsx`

### Verification

- `npm run build:electron` passes
- Outgoing request payload contains `model: selectedModel`

### Known risks

None — model field was previously hard-coded; now store-driven.

---

## HR-5: Fix LSP Stream Parser

**Rollback tag:** `rollback/hr-5-lsp-parser-before`
**Commit:** (see below)

### Summary

Fixed buffer reset bug in LSP message parser. The old code called
`this.buf = Buffer.alloc(0)` inside the generator loop, which discarded partial
trailing data after each parsed message. Changed `parseMessages` from a generator
to a function returning `[messages, remainder]`. The remainder is preserved and
prepended to the next chunk. Also surfaced stderr to `console.warn` instead of
silently discarding it.

### Changed files

- `electron/lsp-manager.ts`

### Verification

- `npm run build:electron` passes
- Multi-message TCP chunk correctly parsed without data loss

### Known risks

None — pure bug fix; no API surface changes.

---

## HR-2: Add Runtime Configuration Profiles

**Rollback tag:** _pending_
**Commit:** _pending_

---

## HR-3: Add Workspace Capability Firewall

**Rollback tag:** _pending_
**Commit:** _pending_

---

## HR-4: Wire Native Health Loop

**Rollback tag:** _pending_
**Commit:** _pending_

---

## HR-6: Rework Browser Bridge Contract

**Rollback tag:** _pending_
**Commit:** harden browser native bridge — `93f79a67`

---

## TI-1: Run & Audit Data Model

**Commit:** `5496d0d1`

---

## TI-2: Diff Review Path for File Writes

**Commit:** `3020cf75`

---

## TI-3: Run Inspector + Agent Graph

**Commits:** `92444b5a` (run inspector), `9d456b72` (agent graph)

---

## TI-4: Eval Bench

**Commit:** `060646dc`

---

## TI-5: Settings View

**Commit:** `e787ac17`

---

## FA-1: Prompt & Skill Registry

**Commit:** `970cacc5`

---

## FA-2 → FA-4: (see individual commits)

---

## FA-5: Workspace Safety Mode

**Commit:** `78959c50`

---

## FA-6: Model Router UI

**Commit:** `c3899dec`

---

## FA-7: Setup Wizard

**Commit:** `9f275b20`

---

## FA-8: Artifact System

**Commit:** `60685f2d`

---

## FA-9: Memory Management UI

**Commit:** `f78bd2f2`

---

## FA-10: Share and Export Flow

**Commit:** `ae301770`
