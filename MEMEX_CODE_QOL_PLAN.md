# Memex Code: comprehensive desktop experience plan

Date: 2026-09-12
Status: Approved and in progress. Partial implementation is committed in `3f7fdbf`; subsequent dock/layout, recovery, accessibility, and hierarchy commits produced local installer 0.1.88. Full milestone and installed acceptance remain incomplete.
Baseline: source commit `ce1574e`; the current local installer artifact is version `0.1.88`.

Revision 2: expanded from the initial layout/QoL audit into the complete Code-mode experience backlog. The Q01–Q16 findings remain the evidence register, not the limit of scope. The workstreams and master delivery order below govern the comprehensive plan. All proposed additions require implementation approval; their inclusion is not a claim that they are missing or broken in every existing route.

## Close-out checkpoint (2026-09-22) — branch `agent-flows-ue-discovery`

Original objective for this pass: carry the uncommitted explorer, model-picker and runtime-request work on the branch into reviewable commits, with acceptance state recorded honestly, and push the branch. No release, no merge to `master`, and no packaged qualification were authorized.

Implemented and committed on the branch:

- C09 foundation: the workspace explorer is now editable — create file or folder at root or inside a directory through inline rows, inline rename, copy path, delete behind an explicit confirm, OS-file drop into the directory under the cursor, Refresh and Collapse All, and an Add / Import menu for existing files or a folder. Expansion state is a path set restored across refresh, and a tree version counter scopes re-reads to changed directories. Commits `8cdcdac` (bridge) and `3bae259` (explorer).
- C05 foundation: the model picker reports VRAM residency — a three-state trigger indicator for resident, idle-with-others-loaded, and nothing loaded; a banner with total resident footprint; per-model Unload, Unload all, and a Pre-load action that warms the selected model. Commit `da9e460`.
- C06/C16 foundation: streamed requests resolve the completions endpoint once instead of blindly appending `/v1/chat/completions`, so a profile ending in `/v1` or the full path no longer produces a doubled URL; the per-request project context now states the sandbox mount at `/workspace` and tells the model not to search for the host absolute path. Commit `b2d16e8`.
- Dead-surface cleanup: `activityPresentation` no longer carries the `detailed` parameter that stopped being read when reasoning events were exposed; `isActivityEvent` depth filtering is unchanged. Commit `27e900f`.
- Repository hygiene: CAD scratch from an unrelated sink/faucet project and the agent runtime directory are ignored instead of cluttering `git status`; the patterns are root-anchored so tracked sources stay tracked. Commit `5150f56`.

History rewrite that was required to publish the branch (C20 release integrity):

- The branch already carried `f753e05`, which had committed two complete Electron build outputs — `release-0.1.43/` and `release-0.1.44/`, 158 tracked files, ~506 MB, including two 172 MB `win-unpacked/Memex Desktop.exe` binaries. GitHub's pre-receive hook declined the push with `GH001` at its 100 MB per-file limit, so nothing on the branch could be published. `.gitignore` covered `release/` but not the versioned siblings, which is how the output reached a commit unnoticed.
- Removing the paths in a new commit cannot fix this, because the hook inspects every object in the push rather than only the tip. The range `6efc962..HEAD` was therefore rewritten with `git filter-branch --index-filter` to drop those two paths. Nine local commits changed hash, including `f753e05` → `fbf2146`. No published history changed: the remote tip was still `6efc962`, `git branch --contains f753e05` listed only this branch, and the tagged ancestors `v0.1.94`/`v0.1.95` kept their hashes, so the push stayed a plain fast-forward with no `--force`.
- Integrity was verified by diffing the pre-rewrite branch against the rewritten one: apart from the two release trees the only differences were this plan document and `package.json`, both re-created afterwards. The pre-rewrite tip is retained on `backup-pre-closeout` as the undo path, and `release*/` is now ignored in commit `b30cc88`.
- The 723 MB of build output was copied out to `C:\Users\panca\Documents\Github\memex-desktop-release-artifacts` before the rewrite, because `--index-filter` also clears the paths from the working tree, and restored from there afterwards. Nothing was deleted from disk.

Acceptance ledger for this pass — implementation and verification are separate columns and must stay that way:

| Item | Implemented | Automated verification | Packaged build | Installed acceptance |
| --- | --- | --- | --- | --- |
| C09 explorer file operations | yes | 6 DOM tests in `src/components/sidebar/FileTree.test.tsx` | **not performed** | **not performed** |
| IPC fs delete/rename/copy, `dialog:openFiles` | yes | none directly | **not performed** | **not performed** |
| C05 VRAM residency and load/unload | yes | 2 tests in `src/components/layout/ModelPickerPopover.test.tsx` | **not performed** | **not performed** |
| Runtime endpoint shaping | yes | existing suite only; no new assertion pins the doubled-URL case | **not performed** | **not performed** |
| `activityPresentation` signature | yes | `workspace-outputs.test.tsx` thought-event assertion | n/a | n/a |

Validation at this checkpoint: `npm run typecheck` clean; `npm test` 37 files, 167 tests pass; `git diff --check` clean. The first run was against the working tree whose content equals committed tree `27e900f`, and the same three checks were rerun after the history rewrite, since the rewrite touched only the two release trees.

Known gaps and blockers, none resolved by this pass:

- Delete and the create/rename paths use `window.confirm` and native dialogs. Neither has been exercised in a packaged Electron window, where dialog ownership and focus behaviour differ from the DOM harness. C09 therefore remains open on installed acceptance, and C12/C18 keyboard-only and focus-return checks were not run against the new controls.
- `fs:delete` removes directories recursively and returns false only when the target is absent; the firewall is the sole guard. No test covers the permission-denied branch, and no trash/undo path exists.
- Loaded-model polling enumerates fixed LAN Ollama hosts in code rather than reading them from runtime profiles, so the reported VRAM accounting is unverified against real hardware on this machine or a second host.
- The renderer duplicates the `/api/ps` read for non-Electron runs, so two code paths produce the residency list.
- Release integrity (C20): `package.json` carries `0.1.107` while the newest tag is `v0.1.95`, so `0.1.96`–`0.1.104` shipped without tags. `master` is 223 commits behind this branch with zero divergence, so it remains fast-forwardable. Reconcile tags before any further release.

Next action: run the C09 and C05 flows in a packaged build against a real workspace and a loaded Ollama model, record the artifact hash and executable version with the observed behaviour, then open the PR or fast-forward `master` as a separate, explicitly authorized step.

## Earlier checkpoints

### Current implementation checkpoint (2026-09-13)

Implemented locally in the working tree:

- Q01 foundation: explorer drag math is relative to the explorer pane and the separator supports arrow/Home/End keyboard resizing.
- Q08 foundation: explorer width is remembered per Code project scope rather than one global width.
- Q10 foundation: Projects has search and filters common generated/cache folders from suggested child projects while retaining explicit folder selection.
- Q05 foundation: unsent composer drafts persist by Code workspace/task scope and clear only after submission; switching projects does not leak a draft.
- Q13 foundation: desktop startup no longer clears the persisted working directory before Code can restore it.
- C03 foundation: older sessions can be revealed beyond the first 20, and destructive conversation deletion now requires explicit confirmation with its local/remote scope.
- C08 foundation: the Pioneer dock no longer truncates the active roster to three and respects an explicit user-hidden panel preference when new workers arrive.
- C12 foundation: after a terminal is opened, switching between bottom tools or hiding the split keeps its PTY mounted; explicit process termination is still a follow-up.
- Q02/Q06 foundation: the Code toolbar is horizontally scrollable at compact widths, and AgentDock clearance/max-height now track the measured composer height instead of a fixed viewport offset; active versus total Pioneer counts are explicit.
- C10 foundation: file and notebook buffers are retained in-memory by path while panes unmount, and closing modified content requires an explicit discard confirmation. Saved content remains filesystem-backed; large buffers are not written to persisted settings.
- Q09 foundation: the local Run Inspector overlay now has a native-titlebar-safe top inset, responsive width, modal semantics, and Escape dismissal; its close control is explicitly labelled.
- C06/C07 foundation: Electron SSE chunks are consumed serially so asynchronous approval handling cannot reorder activity or race the terminal `done` event; HTTP/stream failures now close the durable run once and report the failure path.
- C08 foundation: the full Pioneer panel now keeps coordinator/system context above a parent-aware worker tree, with nested children attached by their reported parent IDs and completed/failed workers remaining in a collapsible section.
- C12 foundation: Code now exposes an explicit `Stop process` terminal action; hiding or switching tools remains non-destructive, while the stop action kills the PTY and clears its retained mount.
- C03 foundation: the task/session list now supports scoped title search in addition to incremental older-history reveal, with a clear no-match state.
- C10 foundation: the native bridge now exposes guarded file metadata; file and notebook editors detect external changes, offer Reload, and require explicit confirmation before overwriting another process's edits.
- C10 foundation: DevView now applies one dirty-editor navigation guard to file switches, project/worktree changes, primary-pane changes, and cross-feature navigation.
- C03 foundation: the Code Tasks pane now provides scoped All, Active, Needs attention, and Completed filters with an explicit no-match state.
- C03 foundation: conversation removal is now labelled Archive and uses the backend's existing soft-archive endpoint; task archive remains explicitly backend-dependent because `/v1/tasks` exposes no archive/unarchive route.
- C17 foundation: the collapsed Pioneer affordance and full panel now use composer-aware clearance and central-workspace width constraints at compact sizes.
- C12 foundation: terminal sessions leave a persisted marker and explain whether a prior session exited or ended with the desktop app; reopening starts a fresh shell honestly rather than implying reattachment.
- C14/C15 foundation: the chronological conversation keeps its jump-to-latest control available after streaming completes, and interrupted or failed assistant turns offer a safe prefilled retry without auto-submitting or duplicating the original request.
- C05 foundation: the Gauntlet quality-bar draft now persists independently alongside the scoped composer text and clears only after the run is accepted for submission.
- C17 foundation: AgentDock clearance now accounts for the composer's actual viewport position and refreshes on Code pane/split transitions, preventing the dock from covering the prompt or lower project tools.
- C17 foundation: compact AgentDock width and height now have bounded resize handles and independent per-workspace persistence; the composer clearance remains the hard lower boundary. Automated geometry/resize checks pass; packaged visual acceptance remains pending.
- C14 foundation: the Code Tasks pane now distinguishes a valid empty board from an unavailable project/task request and offers an explicit retry without discarding previously loaded data. Detailed API results preserve status while compatibility list helpers remain unchanged; packaged acceptance remains pending.
- C18 foundation: the command palette now exposes an active accessible option with Arrow/Home/End navigation, Enter execution, dialog/listbox semantics, and focus return on dismissal.
- C07/C14 foundation: conversation AgentWorkTrace now preserves reported parent worker IDs and renders sub-agent work nested beneath its parent with cycle protection; source coverage includes a nested-worker fixture.
- Regression coverage: pane-relative width/clamping, scoped draft storage and project switching.

Validation at this checkpoint: `npm run typecheck`, `npm test` (31 files, 138 tests), `npm run build:renderer`, and `git diff --check` all pass; the focused approval-bridge, AgentDock geometry/resize, command-palette keyboard, task-board recovery, and nested-worker regressions are included. The 0.1.88 renderer/package artifact is built but has not replaced the installed executable. True terminal process reattachment after app restart, task archive/unarchive support, live packaged-app dock geometry, live stream/reconnect, and the rest of M1–M6 remain outstanding.

Packaged evidence (not installed acceptance): current Windows x64 NSIS installer `release/Memex Desktop Setup 0.1.88.exe`, SHA-256 `5475E74E9E0918D603E75F992B386CF73F5AF98F1A0EC8475DC1212B86F3D10C`, generated from the 0.1.88 source. Installed visual/functional checks have not been performed in this checkpoint.

## Objective and boundaries

Make Memex Code a dependable desktop workspace with the interaction quality illustrated by the user's Codex references: readable chronological work, discoverable controls, preserved work, useful agent inspection, and responsive, remembered panels across display configurations. Preserve Memex branding, Code/Chat separation, Collective and Gauntlet semantics, Pioneers, and existing functionality. This is not permission to redesign unrelated workspaces or rename features.

- This work precedes the separate desktop learning/Training/Mission Control plan.
- No backend, GPU, training, model-routing, deployment, authentication-policy, or SaltMedia changes.
- No live task submission, agent interruption, restart, installer, commit, or push during this review.
- A future fix must pass focused behavior tests AND installed-app visual verification. A green DOM test is not visual parity.
- Codex screenshots supplied by the user are the reference for interaction intent. This review is not an exhaustive comparison against the latest Codex release.

## Evidence collected

- Inspected the actual installed Memex Desktop window, not memex.shivelymedia.com or a substitute browser renderer.
- Initially no project was selected and sign-in was required. The user signed in; Connected was visibly confirmed afterward.
- Reviewed approximately 1644 x 1250 and 1123 x 803 captured window sizes. These are capture dimensions, not a calibrated physical-monitor/DPI matrix.
- Reproduced explorer resize and resulting clipping in the installed app. Restored the explorer width after the test.
- Opened Projects and selected the existing memex-desktop project. No new thread or inference request was submitted. The app was left in that project at the smaller review size.
- Targeted tests: `npx vitest run src/lib/__tests__/desktop-interactions.test.tsx src/components/swarm/PioneersView.test.ts src/components/chat/AgentWorkTrace.test.tsx src/lib/__tests__/store.test.ts` — 4 files, 32 tests passed. These are mocked interaction/event/store checks, not packaged end-to-end validation.
- Existing untracked work remains untouched. The source edits made since the baseline are listed in the current implementation checkpoint above.

Evidence labels below: **Live** = reproduced in installed app; **Source** = confirmed code behavior/structure, not live exercised; **Verify** = acceptance risk or missing coverage, not a claimed reproduced defect.

## Consolidated action inventory

| ID | Priority / evidence | Problem and required action | Acceptance criterion |
| --- | --- | --- | --- |
| Q01 | P1 / Live + Source | Explorer divider uses viewport `clientX` as its width, ignoring the navigation offset. A small left drag expanded it to the maximum. Use pane-relative coordinates or drag deltas, pointer cancellation handling, and usable-width limits. | Divider follows pointer in both directions without a jump, at every scale and with navigation shown/hidden. |
| Q02 | P1 / Live + Source | Enlarged explorer at the compact window pushed Browser and the composer right edge off-screen. Toolbar is one inflexible row; the shell has multiple independently fixed-width regions. Introduce a shared available-space policy, container-relative breakpoints, toolbar overflow, and a protected composer area. | No hidden Send/Stop, clipped critical toolbar controls, or page-level horizontal overflow at supported minimum sizes. |
| Q03 | P1 / Source | `TerminalPane` kills its PTY on unmount; hiding bottom tools, switching Terminal to Browser, changing session IDs, or leaving Code can unmount it. Separate terminal process lifetime from visibility. | Hiding/switching panels preserves a harmless running test process and scrollback; only an explicit terminal close/stop terminates it. |
| Q04 | P1 / Source | File/notebook edits live in component state; primary-pane switching unmounts editors, file switching reloads content, and Close has no dirty guard. Preserve buffers and add explicit save/discard/cancel handling. | Unsaved edits survive view switches and cannot silently disappear on file/project/window navigation. |
| Q05 | P1 / Source | Composer text and Gauntlet bar are local component state, not scoped draft storage. Pane unmount can lose drafts; retained InputBar instances can carry drafts across scope changes. Add project/session-scoped drafts and consistent attachment/quality-bar restoration. | Draft A stays in A, draft B stays in B; switching panes/projects and restarting restores the correct draft without sending it. |
| Q06 | P1 / Source | Pioneer full panel has fixed 330–720px bounds without central-workspace protection. Dock is viewport-fixed; composer clearance uses only height, not its position above an open bottom pane. Reserve layout space or anchor within the actual workspace; support dock resize and remembered dimensions. | Full panel/dock never obscure the composer, terminal/browser controls, or native title controls; text remains readable when detail is open. |
| Q07 | P2 / Source | Live workers are truncated using `.slice(0, 3)` before hierarchy grouping. Dock counts therefore underreport larger groups. Children are separated into a flat sub-agent list rather than attached to their parents; new arrivals can reopen a user-hidden panel. | All active agents remain reachable with truthful totals; coordinator at top, children under actual parents; explicit show/hide choice survives arrivals; completed/failed remain collapsible. |
| Q08 | P2 / Source | Global navigation is fixed at 248px and shares one visibility flag with the explorer. Explorer persistence is global, contrary to Settings' per-workspace claim. Normalize persisted layout state, distinguish user preference from temporary auto-collapse, and give navigation/explorer independent controls. | Sizes, visibility, dock mode, and pane state restore per intended scope without cross-project bleed. Auto-fit never overwrites preferred wide-screen sizes. |
| Q09 | P2 / Source | Code inspector is a full-window opaque overlay with a fixed-width inner panel; close-button clearance is a hard-coded native-control allowance. No shared resizable inspector contract or keyboard/focus handling is present. | Inspector has a usable resizable surface, close/Escape/focus return, native-control-safe placement, and a narrow-screen fallback. |
| Q10 | P2 / Live + Source | Projects lists `.claude`, `.pytest_cache`, `.venv`, deployment/output folders and duplicates with similar labels. Three columns persist despite a narrow content area because breakpoints use the viewport. | Saved/recent/pinned projects are primary; explicitly browsing arbitrary folders remains possible. Search and full-path disambiguation work; columns follow container width. |
| Q11 | P2 / Source | Appearance changes root rem sizing, but many stream details and composer text use fixed px, terminal uses fontSize 13, and widths mix units. Settings claims broader scaling/resizing support than implemented. | Separate, honest text/UI-density controls; all important status and agent text scales; editor/terminal controls are explicit; examples and descriptions match actual behavior. |
| Q12 | P2 / Source | Explorer/Pioneers resize handles lack keyboard resizing; several menus/dialogs lack complete keyboard navigation/focus management; command palette has no arrow-key selection and only a small destination list. | Keyboard-only traversal, named controls, visible focus, arrow/Home/End divider handling, Escape dismissal, and focus restoration pass. |
| Q13 | P2 / Source + Verify | New-conversation global shortcut always creates Chat; palette exposes New Chat but not New Code task. Boot initialization explicitly clears cwd. Review context-aware commands and restoration of project/session/view. | Starting a Code task remains in the owning project; startup restores context or explicitly explains why restoration failed. Preserve a separately named New Chat action. |
| Q14 | P2 / Source + Verify | Conversation is fixed to a 768px maximum, jump-to-latest is available only while streaming, and session scroll restoration is not explicit. Improve readable/wide modes and per-session navigation without regressing chronology. | Long work traces, code blocks, final outputs, and terminal panes remain navigable; new background events do not steal reading position; latest is reachable after completion. |
| Q15 | P2 / Verify | Live tool/narration ordering, reasoning availability, worker drilldown, reconnect, stop/retry/resume, outputs/attachments and diff approvals still need a complete installed-app pass. Current successful tests do not prove these paths. | Scripted fixture and bounded live checks demonstrate each flow, correct ownership, no duplicate stream text, no fabricated progress, and retained context after disconnect. |
| Q16 | P2 / Source + Verify | Diff review is a fixed-width modal without complete dialog focus semantics; long file paths and long lines need explicit overflow handling. | Long paths/code fit via wrapping or contained scrolling; approve/reject remain reachable; Escape never silently approves/discards work. |

P1 means protect work or prevent a blocked primary workflow. P2 means important usability/parity work. These priorities are internal review priorities, not claims that every source finding has been reproduced live.

### Primary source locations

- `src/components/views/DevView.tsx`: explorer drag calculation, toolbar, conditional editor/composer/terminal mounts, saved bottom height.
- `src/components/layout/TabBar.tsx`: fixed navigation width and coupled visibility.
- `src/components/dev/TerminalPane.tsx`: PTY lifecycle and terminal typography.
- `src/components/dev/FileEditor.tsx`, `NotebookEditor.tsx`: local buffers and unguarded navigation.
- `src/components/layout/InputBar.tsx`: local draft/quality-bar state and fixed-pixel input text.
- `src/components/swarm/PioneersView.tsx`, `src/index.css`: panel persistence, active-worker cap, hierarchy and floating-dock clearance.
- `src/components/chat/MessageBubble.tsx`, `RunInspectorPanel.tsx`: local Code inspector overlay and native-control clearance.
- `src/components/dev/WorkspaceProjectsPanel.tsx`: folder discovery and viewport grid breakpoints.
- `src/components/layout/AppShell.tsx`, `src/components/views/SettingsView.tsx`: scaling and advertised layout controls.
- `src/components/shared/CommandPalette.tsx`, `src/App.tsx`, `electron/windows.ts`: commands, startup and shortcut ownership.
- `src/components/chat/ConversationPane.tsx`, `src/components/shared/DiffReviewModal.tsx`: reading/inspection surfaces.

## Complete Code-mode workstreams

Every workstream includes its happy path, empty/loading/error/offline states, keyboard behavior, compact layout, persistence, and recovery. Inspect existing implementations before replacing them. Preserve working features and use one implementation for shared controls rather than building parallel menus or state stores.

Classification: **Repair** links to observed/source defects; **Verify** closes evidence gaps; **Extend** proposes an additional capability or a more complete interaction. Verify items become implementation tickets only when a gap is established. Extensions are part of the proposed scope, not silently approved changes.

### C01. Information architecture and Code shell

- Repair/extend: establish one stable project/task header that identifies workspace, task, branch/worktree, run state and relevant actions without duplicating every action across the title bar, sidebar and toolbar.
- Keep Memex Chat / Memex Code at top left. Preserve Code, Skills, Routines, Eval, Pull requests and shared Design access; keep Sites under Design. Do not rename these during this work.
- Distinguish task conversation, editor, task board, tools and inspection. The UI must explain the difference between a task-board item, its execution/run, and its conversation without forcing users to understand backend IDs.
- Provide predictable back/return navigation, independently controlled navigation/explorer, searchable projects, and context-aware commands. Maintain access to Settings and account/routing without resetting the task.
- Acceptance: users can identify where work will execute, switch views, and return to the same task in three routine navigation actions or fewer; no essential action exists only behind a hover affordance.

### C02. Projects, workspaces and startup

- Repair Q10/Q13: recent/pinned projects first, search, path disambiguation, missing-folder recovery and restoration of the last valid project. Hidden/config folders should not dominate suggested projects; explicit folder browsing remains available.
- Verify local, non-Git, Git, nested-root, worktree, Unicode, long-path and unavailable-drive cases. Normalize Windows path case/separators and select the most specific matching root.
- Show workspace trust and execution location separately. An unrecognized local project should have an actionable registration path, not a confusing empty task board.
- Extend: remove a project from recents without deleting its files; offer workspace-specific defaults without changing global defaults silently.
- Acceptance: a project can be opened, recognized, switched and restored without losing drafts or choosing a different execution directory.

### C03. Task/session library and navigation

- Repair: the current `SessionList` renders `scoped.slice(0, 20)` with no older-history control. Add complete searchable history with pagination or virtualization, selected-task reveal, and meaningful timestamps/state indicators.
- Extend/verify: rename, pin, archive/unarchive, filter active/needs-attention/completed, and search within the current project or explicitly across projects. Keep destructive deletion separate from archive.
- Repair: current delete action immediately calls local and remote deletion. Add a clear scope/confirmation and recoverable archive or undo where supported; show remote deletion failures rather than silently implying sync success.
- Verify simultaneous tasks, unread updates, ordering, duplicate titles, offline history, and reconnect reconciliation. A background task must not take focus from the user's current task.
- Acceptance: older than 20 tasks remain reachable; task switching preserves draft, scroll and selected inspection state; destructive actions cannot occur through an accidental hover click.

### C04. Composer, attachments and context selection

- Repair Q05: per-project/per-task drafts, quality bar and pending attachment metadata; explicit recovery if a referenced local file is missing. Do not encode large binaries directly into the UI settings store.
- Verify typing/paste, multiline growth, long prompts, Enter vs Shift+Enter, input method composition, file/image paste and drag/drop, removal, size/type limits, and retry after attachment errors.
- Extend/verify explicit file/folder/selection context, searchable mentions, attachment previews and visible context scope before sending. Show whether an item is attached, uploading, ready, failed or merely referenced.
- Keep model, effort, mode and run controls accessible without expanding into the response stream. Never hide Send/Stop or consume the whole conversation height with a draft.
- Acceptance: a composed request arrives with the selected context and settings exactly once; removing an attachment removes it from the outgoing request; navigation cannot lose or misroute the draft.

### C05. Models, modes, permissions and request preferences

- Preserve Collective/Gauntlet and the quality-bar requirement. Show the selected model and explain automatic routing or fallback when it occurs; do not promise controls unsupported by the provider.
- Separate output length/detail, reasoning effort, reasoning-summary display and activity verbosity. Store defaults by explicit scope and show per-task overrides; unsupported settings should be explained rather than ignored.
- Display model capability, context capacity, actual token usage and unavailable metrics honestly. Distinguish time waiting/loading from generation; do not label character counts as tokens.
- Verify permissions/approval presets and workspace trust presentation, keeping runtime enforcement unchanged. Settings dialogs must not silently grant permissions, change routes or interrupt work.
- Acceptance: controls match the serialized request and effective runtime settings; changing a default does not mutate a running turn retroactively.

### C06. Conversation, narration and tool stream

- Repair/verify Q14/Q15: one ordered timeline of assistant communication, tool actions/results, reasoning content supported for display by the provider, approvals, and lifecycle updates. No triplication between answer and activity components.
- Default presentation: readable assistant prose, concise status, compact expandable tool groups; detailed presentation exposes available extra detail without substituting raw tool output for narration.
- Include tool name, meaningful target/command, actor, running/completed/failed state, duration where known, output drilldown, truncation indication and a route to full logs. Group repetitions without hiding failures or pending approvals.
- Separate queue wait, model loading, inference, external tool execution, reconnect and completed/failed/stopped states. Connection loss is not completion; worker failure is not automatically coordinator failure.
- Preserve selection and scroll position, offer jump-to-latest after completion, retain collapsed states, support find-in-task and readable/wide code layouts. Virtualization must not break search, copying or screen-reader use.
- Acceptance: event replay produces the same chronology without duplicates; long runs remain readable; no fabricated thinking or unearned success state fills missing runtime information.

### C07. Run lifecycle, intervention and recovery

- Verify send/queue/start, stop, follow-up during work, steering questions, retry and resume. Explain which action creates a new run, resumes an existing run, or submits a new user instruction.
- Show durable ownership and latest-update time, recovery progress, preserved brief and reconnect failure. Automatic refresh/reconnect is primary; a compact manual recovery action is secondary.
- Guard duplicate submission and retry. Disable only invalid actions with reasons; retain the user's draft while the runtime is unavailable.
- Show explicit distinctions among disconnected, waiting for input, paused, stopping, cancelled, failed and complete. Restore authoritative status after app restart without restarting a cancelled run.
- Acceptance: scripted disconnect/reconnect and stop/steer/resume preserve task ownership and context; users can tell whether work continues without repeated checking.

### C08. Pioneers, coordinator and agent inspection

- Repair Q06/Q07: coordinator/system at the top, spawned agents below, sub-agents attached to actual parents. Do not fabricate hierarchy for events lacking parent information; show unassigned relationships honestly.
- Restore and retain Pioneer identity, lanyard/badge presentation and live work inspection. One canonical identity must connect badge, sidebar, activity, task and result.
- Independent visibility toggle and full-panel/dock-mode toggle; dock shows live work with truthful totals and access to overflow; full panel groups active, queued and collapsible completed/failed agents.
- Show task, model when reported, current activity, output, failure/recovery and handoff status; preserve selection and hidden state across arrivals. A failure must indicate whether coordinator continuation is known, unknown or blocked.
- Acceptance: six-plus workers and nested children remain reachable at compact sizes; agent detail is useful, resizable and recoverable without taking over the composer.

### C09. File explorer, search and file operations

- Repair Q01/Q08: independent explorer sizing and remembered state, stable selected-file reveal, reliable pointer and keyboard resizing.
- Verify tree expansion persistence, loading/error/retry, large directories, hidden-file filters, symlinks and workspace-boundary messaging. Keep exclusion defaults configurable and do not silently hide user files.
- Extend/verify quick-open and project text search with path, line and match navigation; file actions such as copy path, reveal in Explorer and open externally. Creating/renaming/deleting files needs explicit error and conflict handling.
- Show Git status/dirty buffers where supported without visually overloading every row. File selection as prompt context must be distinct from opening a file in the editor.
- Acceptance: navigate a large repository and search results without UI stalls; destructive actions are scoped; search cannot mutate files.

### C10. Editor and notebooks

- Repair Q04: durable multi-file buffers, dirty markers and save/discard/cancel handling across close, project change, task change and app exit. Detect external modification before overwriting.
- Extend/verify multiple file tabs, preview versus pinned tabs, line navigation, find/replace, line numbers, syntax rendering, wrap, font controls, diagnostics and copy-selection context. Decide whether to extend the current editor or adopt an editor component only after footprint, license, accessibility and Electron checks.
- Preserve existing Vim and language-server behavior; errors must not masquerade as an empty file. Notebook saves must preserve metadata, outputs and cell order.
- Scope: a capable task-adjacent editor, not a full debugger/IDE replacement. A debugging suite is a separate future proposal.
- Acceptance: edit two files, switch views, receive external file changes, cancel a close and recover the exact buffers; save only after conflict resolution.

### C11. Changes, diff review, Git and worktrees

- Repair Q16 and verify all entry points use coherent review behavior: changed-file list, file counts/additions/deletions, inline and side-by-side views where useful, contained long-line scrolling and next/previous file navigation.
- Distinguish proposed agent edits, actual working-tree changes, staged changes and committed changes. Show untracked/binary/renamed/deleted files rather than silently omitting them.
- Extend/verify review, selective staging, commit message, branch selection and explicit push/PR actions according to available native APIs. Preserve unrelated changes; no automatic commit/push implied by task completion.
- Review worktree creation/switch/merge/removal, dirty-worktree safeguards, branch conflict recovery and task ownership. Force removal is a separately confirmed destructive action, not a convenience next to normal navigation.
- Acceptance: multi-file changes can be inspected and approved without losing context; the UI identifies exactly which files/ref an action will affect and handles Git errors without claiming success.

### C12. Terminal and process workspace

- Repair Q03: terminal sessions belong to workspace/task identities independently of view mounts. Hiding, resizing or switching to Browser must not kill them.
- Extend/verify named terminal tabs, create/select/close, shell/cwd identity, process-running/exited state, search/copy, scrollback, font/wrap behavior and resize fitting.
- Distinguish a persistent user terminal from agent command execution logs. Allow navigation from a command event to its output without implying the user terminal ran it.
- Define reconnect/exit behavior accurately: app restart cannot promise process reattachment unless the backend actually supports it. Show ended sessions and retained output clearly.
- Acceptance: harmless long-running process survives panel transitions; explicit termination affects only its process/session; no background process is killed by a layout reset.

### C13. Browser, previews and delivered artifacts

- Verify project browser navigation, address, back/forward/reload/stop, loading/error states, safe external opening and workspace ownership. Keep browser visibility separate from server/process lifetime.
- Provide useful HTML/site preview and source access, resizable preview space, refresh and generated-output history. Do not require opening a second demonstration app/webview to access a desktop feature.
- Verify actual native file save/download, save cancellation/errors, reveal/open/copy path, missing files and unavailable preview support. A requested download is not a verified saved file.
- Cover text/code, HTML, image, audio, video, generic binary and file-only outputs. Show provenance and relation to the task; retain fallback download/open options for unsupported media.
- Acceptance: every claimed artifact has a reachable preview or honest fallback and a verifiable native file action; untrusted preview content cannot control privileged desktop APIs.

### C14. Tasks board, milestones and handoff

- Verify relation among project, task, coordinator run, child work and conversation. Make the selected task's current objective, progress, blockers and outputs navigable from the board and conversation.
- Repair/verify `ProjectTasksPane` project matching, rejected-load handling, retry, freshness and polling behavior. Current initial load lacks an error branch; initial failure must not leave a permanent unexplained spinner.
- Extend/verify filters, long lists, detail resizing, task creation/edit/cancel and handoff receipts; no action should create a task against an unintended project when project matching fails.
- For handoff, show source/destination, branch/worktree or execution location, preserved brief, pending/accepted/failed status and a return link. Backend capability gaps become explicit dependencies rather than UI-only simulated success.
- Acceptance: a task can be followed from request to worker output to reviewed deliverable; stale status and failed transfers are visible and recoverable.

### C15. Skills, MCP, Routines, Eval, Pull requests and Design integration

- Inventory existing Code entry points and return routes for every feature; preserve them while simplifying navigation. Shared Design/Sites and Print/CAD workflows stay reachable without becoming competing Code landing pages.
- Verify skill/MCP discovery, enablement/capability status, scoped settings, tool availability/errors and selected context. A disconnected integration should explain affected actions without marking unrelated capabilities failed.
- Verify project-aware Routines/Scheduled execution, Eval/model-comparison entry points and PR review/open actions. Make remote/network side effects explicit and preserve the originating Code task when returning.
- Keep training and Mission Control modernization in the separate learning plan; this work supplies consistent navigation, status and panel contracts only.
- Acceptance: no existing capability is orphaned by the shell changes; navigation returns to the same project/task/draft. New backend functionality is not smuggled into this UI scope.

### C16. Connection, account, setup and diagnostics

- Verify persistent Settings/account access at every window size. Keep Memex Anywhere and Local LLMs naming intact; show identity, authentication and service capability health separately.
- Preserve editable drafts and local work while offline; identify which actions are unavailable and why. Last-known status must include freshness rather than appearing current indefinitely.
- Verify local setup/dependency recovery entry points, actionable tool-not-found guidance, cancelled setup, invalid path correction and retry without redirect loops. Do not install software during UI review.
- Extend/verify a compact diagnostic view with app/runtime versions, routing summary, request/run identifiers and redacted support export. No secrets in screenshots, clipboard exports or logs.
- Acceptance: authentication success is not confused with runtime readiness; users can diagnose a problem without leaving or losing their Code task.

### C17. Adaptive layout and window management

- Apply Q01/Q02/Q06/Q08/Q09 to every workspace panel, including task details, file preview, browser, diff, inspector and agent detail—not only explorer and dock.
- One versioned layout contract: preferred size, rendered size, visibility, dock mode, placement, selected content and intended persistence scope. Separate view state from run/process state.
- Use actual container size and native-control insets; preserve central task/composer minimums, prioritize essential controls, and use recoverable drawers/overflow at constrained sizes.
- Support resizing, maximizing/restoring, high DPI, mixed-DPI monitor moves, taskbar/work-area changes, display removal and long/tall windows. Bring restored windows back onto available displays.
- Proposed presets: focused conversation, code review, agent monitoring; customizable panel arrangements can follow the common state contract. Arbitrary drag-anywhere layout configuration is a later extension, not a prerequisite for dependable resizing.
- Acceptance: every panel obeys the same sizing/persistence rule; adaptive collapse never destroys user preferences; actual supported minimum is documented.

### C18. Visual system, accessibility and input

- Define reusable typography, spacing/density, borders, icons, semantic colors and interaction states. Use a coherent icon set for UI chrome, not decorative emoji substitutes for tool status.
- Repair Q11/Q12: separate text scaling from density and editor/terminal font settings; avoid tiny fixed-pixel activity/agent text. Validate contrast rather than relying on dark-theme appearance alone.
- Keyboard-complete menus, command palette, dialogs, lists, resize handles, tabs and search; predictable Escape/focus return; screen-reader labels/status and reduced-motion support.
- Tooltips explain unfamiliar controls; disabled states explain unavailable actions. Ensure hover-only actions are discoverable through focus/touch. Check IME composition and non-English/long labels without assuming English string length.
- Acceptance: core task workflow is usable without a mouse; text scaling preserves legibility and access to every primary action; status is not communicated by color alone.

### C19. Performance, notifications and durability

- Measure time to usable workspace, project/task switch, input latency and scroll/resize responsiveness with large histories and agent-event bursts. Establish machine-relative budgets before optimization; do not invent universal timing claims.
- Reduce unnecessary rerenders, bound DOM growth/log payloads, batch stream presentation and avoid resize/layout feedback loops. Virtualize only with preserved selection, accessibility and scroll anchors.
- Proposed notifications: completion, approval needed, blocker, meaningful failure; no toast for each token/tool event. Keep in-app attention indicators, unread states and configurable native notifications consistent.
- Test offline recovery, renderer reload, app update migration, malformed persisted layout, missing files and interrupted saves using isolated profiles. User data and task buffers must migrate without destructive resets.
- Acceptance: long sessions remain responsive, failure/attention is visible without spam, and malformed layout state falls back safely without deleting history.

### C20. Verification, documentation and release integrity

- Maintain a feature/surface matrix and a requirement-to-test ledger. Each ticket records evidence, expected behavior, affected entry points, ownership, dependencies, migration needs, tests and packaged verification.
- Use component/state tests plus isolated Electron functional tests and visual/geometry checks. Keep live model runs bounded and separately authorized; use deterministic fixtures for large agent/disconnect histories.
- Verify shortcut help, settings descriptions, empty-state copy, release notes and upgrade onboarding against actual implemented behavior. Remove no feature merely because its test is difficult.
- Package only after acceptance gates; increment installer version, verify installed version and update metadata, provide exact installer location, and retain a rollback route. No push/release without explicit direction.
- Acceptance: each workstream is passed, explicitly deferred with reason, or blocked with a named dependency. No blanket parity claim based on partial coverage.

## Proposed whole-workspace interaction model

This is a design proposal for approval, not an implemented redesign.

- **Left navigation:** Memex Code switch, Code destinations, project/task navigation and attention indicators. Explorer is independently available; its visibility should not remove the workspace switch or all task navigation.
- **Task header:** current project/task, execution location and branch/worktree context; compact actions for task operations and opening tools/inspection. Secondary actions move into an overflow menu based on actual available width.
- **Central work area:** conversation remains the primary task surface. Editor, changes and output review can be brought alongside it when space permits or selected as a full-width view when constrained. Switching surfaces retains all underlying state.
- **Composer:** anchored within the central task area, with context attachments above input and model/mode/preferences beneath. It remains usable when tools or agents are open; it does not compete with a fixed overlay for the same pixels.
- **Right inspection area:** agent detail, run inspection, changes/output context use a consistent resizable surface. Switching an inspector remembers its prior selection. Pioneers retains its distinct badge/tree presentation; it is not reduced to a generic activity list.
- **Pioneer dock:** coordinator at top, agent hierarchy below, compact current-work summaries with an explicit path to full detail. Visibility and dock/full-panel are separate controls. Its placement is constrained by the workspace's reserved space rather than arbitrary viewport offsets.
- **Bottom tools:** terminal/browser within a remembered split. Hiding is not closing; closing is not terminating without a clear process-lifecycle action. A maximized tool view has an obvious restore action.
- **Compact configuration:** central task and composer take precedence. Secondary surfaces open in explicitly dismissible drawers/full-width views with return controls. Auto-collapse is temporary presentation state; returning to a larger window restores preferred layout.
- **Large configuration:** use extra width for optional editor/review/inspection splits, not only wider empty margins. Preserve a readable prose measure while letting code, tables and diffs use more space.

### Persistence and scope contract

| State | Proposed owner | Rule |
| --- | --- | --- |
| Global text/density/default preferences | Desktop user profile | Workspace override is explicit; no silent default changes. |
| Window bounds/display placement | Desktop window | Restore into the current display work area; handle removed monitors. |
| Panel sizes/visibility/mode | Workspace layout | Keep preferred sizes separate from transient auto-fit; version and migrate safely. |
| Task scroll/collapse/inspection selection | Task view | Switching task restores its own view without changing execution state. |
| Draft, attachments, quality bar and per-task overrides | Project + task, including an unsent-task identity | No cross-task leakage; verify referenced attachments still exist. |
| Unsaved editor buffers | Canonical file/workspace identity | Independent of mounted view; conflict-aware save and safe close. |
| Terminal process and retained output | Terminal session + workspace | View changes cannot terminate it; reconnect support must be real. |
| Run/worker state and event cursor | Authoritative run identity | Renderer caches and reconciles; it cannot infer success from losing the connection. |

## Master delivery order and dependencies

The detailed tactical gates below support this order; they do not restrict scope to Q01–Q16.

| Milestone | Workstreams | Deliverable and exit gate |
| --- | --- | --- |
| M0 — Full baseline and design agreement | All C01–C20 | Surface inventory, capability map, scoped task journeys, existing behavior screenshots and backlog classification. Approve desired navigation and state semantics before production changes. |
| M1 — Preserve work and ownership | C02–C05, C07, C10, C12, C19 | Durable drafts/buffers/process lifetimes, safe task actions and restoration. No silent loss/misrouting in navigation and recovery tests. |
| M2 — Unified shell and adaptive panels | C01, C09, C17, C18 foundation | Consistent shell/panel components, sizing/persistence, native-safe overlays and container-aware toolbars. Geometry matrix passes for essential controls. |
| M3 — Complete task and agent interaction | C03–C08, C14 | Discoverable history, composer/context controls, chronological stream, usable Pioneers, lifecycle/board/handoff states. Fixture task journeys pass. |
| M4 — Work product and developer tools | C09–C13, C15 | Explorer/search, editor, terminal, changes/review/worktree, browser/artifacts, integration return routes. End-to-end local work-product journey passes. |
| M5 — Whole-experience polish and hardening | C16, C18–C19 plus all earlier surfaces | Connectivity/setup, accessibility, notifications, performance, errors, display transitions and migrations qualified. No unresolved work-loss or inaccessible-control defect. |
| M6 — Packaged acceptance and release | C20 and all | Full ledger reviewed, actual installed behavior verified, justified deferrals listed, versioned installer/update handoff after approval. |

Dependency rules: establish ownership/persistence before visual refactors; establish panel contracts before rebuilding each panel; stabilize event/state contracts before stream/agent presentation; preserve developer-tool process/buffer lifetimes before adding tabs; test runtime-dependent UI with fixtures until the native/runtime contract is verified. Shared components require regression coverage in Chat/Design without redesigning those modes.

## Complete task journeys to qualify

1. Fresh install/open Code → choose local project → understand execution location/trust → create task → attach context → choose mode/model/preferences → send → observe work → inspect tools/agents → review result → save/open output.
2. Existing user → reopen last project/task → recover unsent draft and open buffers → find an old task beyond the first 20 → switch between concurrent tasks without moving drafts or stealing focus.
3. Change request → inspect multiple proposed/actual edits → compare files → edit/save safely → test in a persistent terminal → stage/commit deliberately → optionally push/open PR only when explicitly chosen.
4. Long Gauntlet → provide quality bar → monitor coordinator/builders/critic → inspect failure and continuation → answer steering question → stop → add context → resume preserved work without duplicate execution.
5. Runtime disconnect → preserve visible history/draft → distinguish stale from failed → reconnect automatically → reconcile authoritative state → show explicit recovery if it cannot continue.
6. Large working session → resize/maximize/restore → change text scale → open Pioneers/detail/inspector/terminal → move across displays → recover off-screen window → retain preferred layout and accessible composer.
7. Generated artifact → preview/source → download/save → cancel/save failure → retry → reveal/open actual saved file; unsupported media retains a useful fallback.
8. Permission/tool/setup problem → understand blocked action → open relevant settings/setup → correct configuration or cancel → return to unchanged task; no implicit privilege or route change.
9. Skills/Routine/Eval/PR/Design entry from Code → inspect/use supported feature → return to original task, project, draft and panel arrangement.
10. App upgrade/restart → migrate layout/drafts/history → retain recoverable work → identify processes/runs that can and cannot reattach → verify version/update source without pretending an old installed build has new code.

## Scope decisions and explicit deferrals

- Required: full Code workflow and all existing surfaces; dependable responsive layout, Pioneers, task history, context controls, outputs, safety and recovery. These are not optional cosmetic follow-ups.
- Proposed extensions to review as a bundle: richer task organization, quick-open/search, multi-file editing, expanded Git review and notification preferences. Audit existing capabilities first and reuse them.
- Later unless separately approved: arbitrary drag-anywhere workspace designer, detached cross-window panel synchronization, full debugger/IDE replacement, new provider/training engines and changes to remote execution infrastructure.
- API gaps: record the missing capability and a Core/native bridge contract request. This plan does not authorize backend changes, fake a successful action, or remove the UI capability to make a test pass.
- Do not assign dates or claim a complete implementation estimate until M0 has verified native/runtime capabilities and the extension scope. Deliver in testable milestones rather than repeated installer-sized cosmetic tweaks.

## Supporting tactical regression sequence and gates

### 1. Establish acceptance fixtures before changing UI

Cover empty project, many sessions, long project/file names, long code/output, multiline composer with attachments and Gauntlet bar, at least six live Pioneers including nested children, completed/failed agents, and active/reconnecting/completed/stopped runs. Use synthetic content and isolated test user data; do not populate the user's real history.

Add failing regression tests for Q01–Q05 first. Capture baseline layout measurements/screenshots. Record capabilities and shortcuts already offered so later work cannot quietly remove them. Finalize the supported minimum at the existing 900 x 600 logical-pixel window floor before claiming smaller split-screen support.

Gate: reproducible tests and explicit expected behavior, with no production edits yet beyond approved test infrastructure.

### 2. Protect user work and session ownership

Implement Q03–Q05 and Q13: durable terminal sessions, editor buffers and dirty guards, scoped drafts, project/session restoration, and context-aware new-task commands. Audit switching code panes, switching whole app workspaces, switching project/session, and closing/reopening windows separately.

Gate: no lost unsaved content or accidental process termination in isolated tests and packaged-app checks.

### 3. Repair adaptive layout as a coherent system

Implement Q01–Q02, Q06, Q08–Q09. Use one layout-state contract for sizes/visibility and a measured available-content rectangle. Clamp rendered dimensions without destroying stored preferences. Keep composer and primary task controls usable first; secondary panels can collapse into recoverable drawers/dock views. Do not merely add viewport-fixed offsets.

Preserve separate controls for Pioneers visibility and full-panel/dock mode. Provide explicit reset for the current workspace, with any reset-all action separately labeled. Respect native title-bar insets and window scale.

Gate: geometry assertions and screenshots show no unintended overlapping surfaces, hidden primary controls, or unreachable panel toggles.

### 4. Complete Pioneer and work-stream usability

Implement Q07 and Q14, then verify Q15. Preserve identities and parent IDs, truthful running/queued/finished totals, user-selected hiding, useful per-agent detail, and final outputs. Keep narration, tool events, and status chronological and distinguishable. Display provider-supported reasoning content according to available data and user controls; never fabricate a reasoning stream to fill missing events.

Gate: six-plus-agent fixture, nested worker drilldown, lifecycle transitions, session switching, and interrupted/replayed streams pass without duplicate identities or text.

### 5. Polish navigation, accessibility, text and review surfaces

Implement Q10–Q12 and Q16. Improve Projects discovery, narrow menus/toolbars, keyboard operation, readable scalable text, inspector/diff navigation, and clear empty/error states. Keep Memex terminology unchanged. Optional conversation width preferences should not become another competing layout system.

Gate: keyboard-only and 90/100/110/125 percent text-scale checks pass. Settings accurately describes what is resizable and persisted.

### 6. Installed-app qualification and release decision

Run the matrix below on an isolated packaged build. Only after visual and functional qualification, increment the build and provide the installer with the exact verified path. Commit/release/push only under the user's explicit release direction. A source test result is never described as an installed fix.

## Display and interaction validation matrix

| Axis | Required cases |
| --- | --- |
| Logical app window | 900x600 minimum, 1280x720, 1366x768, 1920x1080, large/ultrawide, narrow/tall window at supported minimum width |
| OS display scale | 100%, 125%, 150%, 200%; physical mixed-DPI monitor move when hardware is available |
| App text scale | 90%, 100%, 110%, 125%; comfortable and compact density |
| Panel combinations | Navigation/explorer independently shown/hidden; Pioneers hidden/full/dock; worker detail; inspector; terminal/browser; multiline composer |
| Navigation | Project and session switching, Agent/Editor/Tasks/Projects, leaving Code and returning, restored window/restart |
| Work safety | Unsaved text/notebook edit, draft with attachment/bar, running terminal process, active agent run |
| Run states | Queued/loading, streaming, awaiting approval, reconnecting, retry, stop, resume, worker failure, completed output |
| Accessibility | Keyboard-only, visible focus, Escape behavior, resize separators, long labels, accessible names, contrast and reduced motion |

Use all sizes for critical geometry; use pairwise combinations for the larger matrix and explicit worst cases (minimum size + largest text + multiple panels). Do not claim full mixed-DPI or physical-display coverage from viewport emulation. OS settings will not be changed during review without coordination.

Required automated layers: pure layout/state tests; component lifecycle and keyboard tests; Electron interaction tests against isolated data; screenshot and rectangle assertions in packaged Electron. Existing 32 tests remain baseline coverage, not the new acceptance suite.

## Unverified areas and decision boundary

The installed live review so far covers navigation, project selection, connection indication and resizing. It did not start inference, exercise active Pioneers, open/close a running terminal process, edit a user file, test approvals, restart the app, or complete a full display matrix. Those areas have explicit planned checks above; source findings are not mislabeled as live results.

The user approved implementation and requested continued execution with milestone updates. Continue the agreed sequence without requesting approval again for already authorized work. Training/Mission Control work remains separate.

## Acceptance ledger and continuation contract

Follow `AGENTS.md`. This ledger supersedes earlier conversational claims that numbered small patches were completed milestones. The delivery milestones remain M0–M6. Historical test results above are evidence of automated checks only.

| Milestone | Implementation | Acceptance verification | Evidence / next required action |
| --- | --- | --- | --- |
| M0 | Baseline and plan recorded; approved | Partial baseline only | Existing source inventory and limited installed review above; missing native capability checks remain explicit |
| M1 | Partial | Pending | `3f7fdbf`; reported 129 automated tests do not close lifecycle, recovery, draft and work-loss journeys; reproduce each required journey |
| M2 | Partial | Failed / incomplete | `3f7fdbf`, `f76d3e3`; user reports unacceptable dock/stream layout after packaging; verify reserved layout space against reference and full geometry matrix |
| M3 | Partial | Pending | History/filter/agent/stream changes exist; verify identity, hierarchy, chronology, drilldown and six-agent fixtures; do not infer missing backend events solely from screenshots |
| M4 | Partial | Pending | Editor/terminal foundations exist; qualify work-product journey, native save, review and process preservation |
| M5 | Partial | Pending | Command-palette keyboard semantics and task-board recovery are covered in source tests; complete accessibility, recovery, scaling and cross-surface qualification remains |
| M6 | Local installer 0.1.88 generated | Pending | Packaging is recorded; full installed acceptance and release qualification have not passed |

For each item being worked, append or link an evidence record with:

- Original criterion ID and expected user behavior.
- Implementation status: pending, partial, or implemented.
- Verification status: pending, passed, failed, blocked, or stale; include each required check and its actual result.
- Tested commit/diff, app version and environment. For packaged checks: artifact SHA-256 and verified executable/bundle identity.
- Evidence paths and commands, distinguishing automated, browser, packaged and installed checks.
- Outstanding criteria, dependencies, blocker if any, and concrete next action.

Do not mark a milestone accepted until its exit gate and all mandatory item checks pass. User-approved deferrals must be explicit. Preserve historical evidence but mark it stale when affected code changes.

Current handoff: source work now includes the AgentDock geometry/persistence slice, task-board recovery state, keyboard-complete command palette, and parent-aware conversation worker hierarchy. The Code-mode UI plan is unfinished. Next action is installed-app verification of `0.1.88` at the supported window/layout matrix, including dock/composer non-overlap and task-board retry behavior, then continue the remaining M1–M6 criteria. Native UI access is unavailable in this session because no targetable Memex Desktop window is exposed; source/tests/package evidence must not be reported as installed visual acceptance. No additional installer should be described as resolving an issue without that verification.
