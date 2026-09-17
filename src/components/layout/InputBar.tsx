import { useRef, useState, useCallback, useEffect } from "react";
import { defaultRunPreferences, sessionScopeKey, useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { desktop, type GauntletHandoff } from "../../lib/desktop";
import { pushSession } from "../../lib/conv-sync";
import { extractConversationMemory } from "../../lib/memex-client";
import { MODE_FLAGS, MODE_LABELS, type ExperienceId, type MemexMode, type ChatMessage, type MessageEvent } from "../../types/memex";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { ContextMeter } from "./ContextMeter";
import { RunControls } from "../chat/VerbosityControl";

/** General conversation intentionally excludes production-only Gauntlet work. */
export const CHAT_MODES: MemexMode[] = ["chat", "swarm", "research", "design", "think", "plan"];
/** Code owns the Pioneer Gauntlet because its output is a reviewed project change. */
export const CODE_MODES: MemexMode[] = ["swarm", "gauntlet"];

const MODE_DOT: Record<MemexMode, string> = {
  chat:     "bg-muted",
  swarm:    "bg-accent",
  research: "bg-green",
  design:   "bg-yellow",
  think:    "bg-accent2",
  plan:     "bg-yellow",
  gauntlet: "bg-red-400",
  workshop: "bg-accent",
};

// One-line descriptions so the picker makes clear which mode does what — e.g.
// Code tasks belong in Collective, not Research (which forces a research pipeline).
const MODE_DESC: Record<MemexMode, string> = {
  chat:     "General conversation & Q&A",
  swarm:    "Build & write code with agents",
  research: "Web/doc research & synthesis",
  design:   "Generate UI / HTML mockups",
  think:    "Extended step-by-step reasoning",
  plan:     "Plan a build before executing",
  gauntlet: "Pioneer builders and critics iterate against a quality bar",
  workshop: "Refine an idea into a brief",
};

function syncSessionById(sessionId: string): void {
  const session = useStore.getState().sessions.find((item) => item.id === sessionId);
  if (session) pushSession(session);
}

export interface SlashCommand {
  cmd: string;
  label: string;
  category: "Flow" | "Workflow" | "Utility";
  description: string;
  targetMode?: MemexMode;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Agent Flows
  {
    cmd: "/flow-blockout",
    label: "Blockout Flow",
    category: "Flow",
    description: "Rough, rapid first-pass draft of nonexistent structure (schemas, folder layouts, configs). Output is judged/refined by human.",
    targetMode: "plan",
  },
  {
    cmd: "/flow-batch-edit",
    label: "Batch Edit Flow",
    category: "Flow",
    description: "Apply one mechanical change across N existing files/records matching a predicate. Always states rollback before first write.",
    targetMode: "chat",
  },
  {
    cmd: "/flow-audit",
    label: "Audit Flow",
    category: "Flow",
    description: "Read-only sweep checking a large set against explicit rules (dead links, broken exports, policy violations). Never mutates.",
    targetMode: "swarm",
  },
  {
    cmd: "/flow-scaffold",
    label: "Scaffold Flow",
    category: "Flow",
    description: "Generate boilerplate skeleton for one new unit (component, service, route, module) with structure in place but logic empty.",
    targetMode: "swarm",
  },
  {
    cmd: "/flow-variants",
    label: "Variants Flow",
    category: "Flow",
    description: "Generate N named derivatives from one parent template plus a parameter table. Pattern is identical, only values change.",
    targetMode: "chat",
  },
  {
    cmd: "/agent-flows",
    label: "Agent Flows Guide",
    category: "Flow",
    description: "Routing guide and 3-part selection gate (enumerable, mechanical, verifiable) for picking the right agent flow.",
    targetMode: "chat",
  },

  // Memex Workflows
  {
    cmd: "/build",
    label: "Collective Build",
    category: "Workflow",
    description: "Multi-agent swarm coordination to plan, write, and verify code across files.",
    targetMode: "swarm",
  },
  {
    cmd: "/swarm",
    label: "Swarm Mode",
    category: "Workflow",
    description: "Alias for Collective build: coordinate specialists to execute project tasks.",
    targetMode: "swarm",
  },
  {
    cmd: "/plan",
    label: "Plan Mode",
    category: "Workflow",
    description: "Explicit planning and exploration phase with ultraplan before modifying files.",
    targetMode: "plan",
  },
  {
    cmd: "/workshop",
    label: "Product Workshop",
    category: "Workflow",
    description: "Two-phase discovery: interactive grill-me questions → Product Brief → pipeline actions.",
    targetMode: "workshop",
  },
  {
    cmd: "/grill",
    label: "Grill Me",
    category: "Workflow",
    description: "Deep discovery interview to align on requirements and eliminate ambiguity.",
    targetMode: "workshop",
  },
  {
    cmd: "/design",
    label: "Design Studio",
    category: "Workflow",
    description: "Generate self-contained UI/HTML mockups and Open Design projects.",
    targetMode: "design",
  },
  {
    cmd: "/research",
    label: "Deep Research",
    category: "Workflow",
    description: "Deep web and documentation research with perspective synthesis.",
    targetMode: "research",
  },
  {
    cmd: "/think",
    label: "Extended Thinking",
    category: "Workflow",
    description: "Extended step-by-step reasoning for difficult problems before responding.",
    targetMode: "think",
  },
  {
    cmd: "/gauntlet",
    label: "Pioneer Gauntlet",
    category: "Workflow",
    description: "Pioneer builders and critics iterate against an explicit quality bar.",
    targetMode: "gauntlet",
  },
  {
    cmd: "/cad",
    label: "CAD Modeling",
    category: "Workflow",
    description: "Generate OpenSCAD 3D models with 2D preview renders and STL export.",
    targetMode: "chat",
  },

  // Utilities
  {
    cmd: "/compact",
    label: "Compact Context",
    category: "Utility",
    description: "Summarize earlier conversation turns to reclaim token budget.",
  },
  {
    cmd: "/clear",
    label: "Clear Thread",
    category: "Utility",
    description: "Clear active conversation messages and reset thread state.",
  },
  {
    cmd: "/model",
    label: "Model Info / Switch",
    category: "Utility",
    description: "Show active model and context window or switch model.",
  },
  {
    cmd: "/help",
    label: "Help",
    category: "Utility",
    description: "List all available slash commands, workflows, and shortcuts.",
  },
];

interface InputBarProps {
  /** Extra request flags merged into every send (e.g. { dev_mode: true }). */
  extraFlags?: Record<string, boolean>;
  /** When set, the composer is locked to this mode and the mode pill is hidden. */
  lockMode?: MemexMode;
  lockModeLabel?: string;
  /** Placeholder override. */
  placeholder?: string;
  /** Routes messages into the owning product history, not the last app-wide chat. */
  experience?: ExperienceId;
  /** Further isolates Code conversations to the open project. */
  workspaceKey?: string;
  /** Prevents submission while preserving an explanatory composer state. */
  disabledReason?: string;
  /** Drops example/starter text into the composer (e.g. an empty-state suggestion click). */
  prefillText?: string;
  /** Limits the composer to modes appropriate for its owning workspace. */
  modeOptions?: MemexMode[];
  /** Used when the global picker selection does not belong to this workspace. */
  defaultMode?: MemexMode;
}

export function InputBar({ extraFlags = {}, lockMode, lockModeLabel, placeholder, experience = "chat", workspaceKey, disabledReason, prefillText, modeOptions, defaultMode }: InputBarProps) {
  const [text, setText] = useState("");
  const [modeOpen, setModeOpen] = useState(false);
  const [gauntletBar, setGauntletBar] = useState("");
  const [gauntletError, setGauntletError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const {
    mode: globalMode, setMode, createSession,
    addMessage, appendEvent, updateMessageContent, updateMessageRunId, setMessageUsage,
    setStreaming, streamingSessions, stopStreams, activeSession, selectedModel, workspaceRunPreferences,
  } = useStore();

  const availableModes = modeOptions ?? CHAT_MODES;
  const mode = lockMode ?? (availableModes.includes(globalMode) ? globalMode : (defaultMode ?? availableModes[0]));
  const currentSession = activeSession(experience, workspaceKey);
  const currentSessionId = currentSession?.id;
  const streaming = currentSessionId ? !!streamingSessions[currentSessionId] : false;
  const stopStream = currentSessionId ? stopStreams[currentSessionId] : undefined;
  const runPreferences = workspaceRunPreferences[sessionScopeKey(experience, workspaceKey)] ?? defaultRunPreferences;
  const draftKey = `${sessionScopeKey(experience, workspaceKey)}:${currentSessionId ?? "new"}`;
  const gauntletDraftKey = `${draftKey}:gauntlet-bar`;
  const draftKeyRef = useRef("");
  const gauntletDraftKeyRef = useRef("");
  const skipDraftPersistRef = useRef(true);
  const skipGauntletDraftPersistRef = useRef(true);

  // Drafts follow the active task rather than the mounted composer. This keeps
  // a partially written request intact when the user opens the editor, tasks,
  // terminal, or another project, while keeping separate Code tasks isolated.
  useEffect(() => {
    draftKeyRef.current = draftKey;
    skipDraftPersistRef.current = true;
    setText(useStore.getState().workspaceDrafts[draftKey] ?? "");
  }, [draftKey]);
  useEffect(() => {
    gauntletDraftKeyRef.current = gauntletDraftKey;
    skipGauntletDraftPersistRef.current = true;
    setGauntletBar(useStore.getState().workspaceDrafts[gauntletDraftKey] ?? "");
  }, [gauntletDraftKey]);
  useEffect(() => {
    if (draftKeyRef.current !== draftKey || skipDraftPersistRef.current) {
      skipDraftPersistRef.current = false;
      return;
    }
    useStore.getState().setWorkspaceDraft(draftKey, text);
  }, [draftKey, text]);
  useEffect(() => {
    if (gauntletDraftKeyRef.current !== gauntletDraftKey || skipGauntletDraftPersistRef.current) {
      skipGauntletDraftPersistRef.current = false;
      return;
    }
    useStore.getState().setWorkspaceDraft(gauntletDraftKey, gauntletBar);
  }, [gauntletDraftKey, gauntletBar]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);

  useEffect(() => {
    if (!prefillText) return;
    setText(prefillText);
    textareaRef.current?.focus();
  }, [prefillText]);

  // Native quick-entry and capability-recovery cards hand off a proposed
  // follow-up through this event. Prefill rather than auto-send so the user
  // reviews the action before a local tool or workspace is used.
  useEffect(() => {
    const receivePrefill = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string" || !detail.trim()) return;
      setText(detail);
      textareaRef.current?.focus();
    };
    window.addEventListener("chat:prefill", receivePrefill);
    return () => window.removeEventListener("chat:prefill", receivePrefill);
  }, []);

  useEffect(() => {
    if (!modeOpen) return;
    const h = (e: MouseEvent) => { if (!modeRef.current?.contains(e.target as Node)) setModeOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [modeOpen]);

  const submit = useCallback(async () => {
    const content = text.trim();
    if (!content || streaming || disabledReason) return;
    // Browser/dev mode has no durable desktop checkpoint to resolve a resume
    // request from, so it still requires the bar up front.
    if (mode === "gauntlet" && !gauntletBar.trim() && !desktop()?.gauntlet) {
      setGauntletError("Choose a named, fetchable reference for the quality bar before starting the Gauntlet.");
      return;
    }
    useStore.getState().clearWorkspaceDraft(draftKey);
    useStore.getState().clearWorkspaceDraft(gauntletDraftKey);
    setText("");
    setGauntletBar("");

    const session = activeSession(experience, workspaceKey);
    const sessionId = session?.id ?? createSession(experience, workspaceKey);

    addMessage(sessionId, {
      id: `msg-${Date.now()}-u`, role: "user", content,
      events: [], timestamp: Date.now(), mode,
    } as ChatMessage);

    const assistantId = `msg-${Date.now()}-a`;
    addMessage(sessionId, {
      id: assistantId, role: "assistant", content: "",
      events: [], timestamp: Date.now(), mode,
    } as ChatMessage);
    const activityLabel = experience === "code" ? "Starting Code agent…"
      : experience === "sites" ? "Request sent — preparing the site workspace…"
      : experience === "product_design" ? "Request sent — preparing the design workspace…"
      : experience === "research" ? "Request sent — preparing research…"
      : "Request sent — preparing Memex…";
    appendEvent(sessionId, assistantId, { type: "status", content: activityLabel, receivedAt: Date.now(), data: { type: "stream_started" } });

    // Persist an initial turn checkpoint before the first model token. The
    // debounced/retrying sync queue coalesces subsequent stream updates, so a
    // browser or runtime interruption still leaves the in-flight turn
    // resumable remotely instead of only in localStorage.
    const syncSession = () => syncSessionById(sessionId);
    syncSession();

    const history = (session?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content });

    let accumulated = "";
    // Create the durable contract before streaming. The hosted runtime gets a
    // copy, but resuming is always based on this desktop-owned record.
    let handoffId: string | undefined;
    let handoffPacket: GauntletHandoff | null = null;
    const bridge = desktop();
    if (mode === "gauntlet" && bridge?.gauntlet) {
      const mentionedId = content.match(/Resume Gauntlet checkpoint\s+([\w-]+)/i)?.[1];
      const continuationText = content.replace(/^\s*start\s+fresh\s*[:,-]?\s*/i, "").trim() || content;
      const sessionPackets = await bridge.gauntlet.forSession(sessionId);
      const startFresh = /\bstart\s+fresh\b/i.test(content);
      const stopped = sessionPackets.find((candidate) => candidate.status === "cancelled") ?? null;
      const previous = mentionedId
        ? await bridge.gauntlet.get(mentionedId)
        : startFresh ? null
        : stopped ?? (/\bresume\b/i.test(content) ? sessionPackets.find((candidate) => candidate.status === "ready" || candidate.status === "accepted") ?? null : null);
      if (!previous && !gauntletBar.trim()) {
        setText(content);
        setGauntletError("Choose a named, fetchable reference for the quality bar before starting the Gauntlet.");
        return;
      }
      const created = previous?.status === "cancelled"
        ? await bridge.gauntlet.resume(previous.id, content) ?? previous
        : previous ?? await bridge.gauntlet.create({
        sessionId, workspaceKey, role: "coordinator", goal: continuationText, qualityBar: gauntletBar.trim(),
        effort: { model: selectedModel ?? "swarm", outputDetail: runPreferences.outputDetail, reasoningSummary: runPreferences.reasoningSummary, reasoningEffort: runPreferences.reasoningEffort },
      });
      // Coordinator ownership is bookkeeping for durable recovery, not a
      // decision the user should have to make before their requested work can
      // start.  Record it as soon as a new desktop checkpoint exists.
      const packet = !previous && created.status === "ready"
        ? await bridge.gauntlet.accept(created.id, "desktop coordinator") ?? created
        : created;
      handoffId = packet.id;
      handoffPacket = packet;
      appendEvent(sessionId, assistantId, {
        type: "status",
          content: previous
            ? `Resumed Gauntlet checkpoint ${packet.id.slice(0, 8)} — your added context is attached to the preserved original goal, quality bar, and effort policy.`
            : `Gauntlet checkpoint ${packet.id.slice(0, 8)} saved — coordinator ownership, goal, quality bar, and effort policy are preserved locally.`,
        receivedAt: Date.now(), data: { type: "gauntlet_checkpoint", handoffId: packet.id },
      });
      syncSession();
    }
    const stop = streamChat({
      messages: history,
      mode,
      model: selectedModel,
      // Routines are ordinary repeatable-work requests, not Product Workshop
      // discovery sessions. Tell the router to keep this workspace in the
      // conversational path even when the prompt is ambiguous.
      skill: experience === "goals" ? "general" : undefined,
      style: runPreferences.outputDetail === "low" ? "concise" : runPreferences.outputDetail === "high" ? "explanatory" : undefined,
      gauntletBar: handoffPacket?.qualityBar ?? (mode === "gauntlet" ? gauntletBar.trim() : undefined),
      gauntletHandoff: mode === "gauntlet" && handoffId ? {
        id: handoffId, role: "coordinator", phase: "scope",
        goal: handoffPacket?.goal ?? content,
        qualityBar: handoffPacket?.qualityBar ?? gauntletBar.trim(),
          effort: {
          model: handoffPacket?.effort.model ?? selectedModel ?? "swarm",
          outputDetail: handoffPacket?.effort.outputDetail ?? runPreferences.outputDetail,
          reasoningSummary: handoffPacket?.effort.reasoningSummary ?? runPreferences.reasoningSummary,
          reasoningEffort: handoffPacket?.effort.reasoningEffort ?? runPreferences.reasoningEffort,
          },
          clarifications: handoffPacket?.clarifications ?? [],
      } : undefined,
      modeFlags: { ...MODE_FLAGS[mode], ...extraFlags, ...(runPreferences.reasoningEffort === "high" ? { ultrathink_mode: true } : {}) },
      sessionId,
      workspaceKey,
      runMeta: { profile: "default" },
      onRunStarted: (runId) => {
        updateMessageRunId(sessionId, assistantId, runId);
        if (handoffId && bridge?.gauntlet) {
          void bridge.gauntlet.patch(handoffId, { runId, phase: "scope", nextAction: "Coordinator is preparing the first builder handoff against the preserved quality bar." });
        }
        syncSession();
      },
      onUsage: (usage) => {
        setMessageUsage(sessionId, assistantId, usage);
        syncSession();
      },
      onEvent: (event) => {
        appendEvent(sessionId, assistantId, { ...event, receivedAt: Date.now() } as MessageEvent);
        if (event.type === "message" || event.type === "response") {
          accumulated += event.content;
          updateMessageContent(sessionId, assistantId, accumulated);
        }
        syncSession();
      },
      onDone: () => {
        appendEvent(sessionId, assistantId, { type: "status", content: "Response stream ended.", receivedAt: Date.now(), data: { type: "stream_complete" } });
        setStreaming(sessionId, false);
        // Code runs through DevHarness, which deliberately bypasses the
        // standard chat router's memory extraction hook. Mirror the completed
        // turn directly to MemPalace so Code has the same durable memory
        // behavior without double-extracting standard routes.
        if (extraFlags.dev_mode && accumulated.trim()) {
          void (async () => {
            const ownerId = await bridge?.identity.get().catch(() => "desktop") ?? "desktop";
            const count = await extractConversationMemory(`User: ${content}\nAssistant: ${accumulated}`, ownerId);
            if (count > 0) {
              appendEvent(sessionId, assistantId, { type: "status", content: `MemPalace stored ${count} durable memor${count === 1 ? "y" : "ies"}.`, receivedAt: Date.now(), data: { type: "memory_extract_complete", count } });
              syncSession();
            }
          })();
        }
        if (handoffId && bridge?.gauntlet) {
          const producedAnswer = accumulated.trim().length > 0;
          const needsCoordinatorInput = useStore.getState().activeSession(experience, workspaceKey)?.messages
            .find((message) => message.id === assistantId)?.events
            .some((event) => event.type === "clarification_card");
          void bridge.gauntlet.patch(handoffId, needsCoordinatorInput ? {
            status: "needs_input", phase: "scope",
            pending: ["Answer the coordinator's project-routing question", "Continue with the same quality bar and effort policy"],
            nextAction: "The coordinator needs a project decision. Answer its card; the original Gauntlet contract will be retained.",
          } : producedAnswer ? {
            // A finished SSE transport is not proof that the remote critic or
            // verification loop completed. Keep the durable run active and
            // let the automatic coordinator reconciliation report the actual
            // phase/completion state.
            nextAction: "Response stream ended; refreshing the durable coordinator state automatically.",
          } : {
            nextAction: "No response arrived on this transport; checking the durable coordinator state automatically before treating the run as blocked.",
          });
        }
        syncSession();
      },
      onError: (err) => {
        appendEvent(sessionId, assistantId, { type: "log", content: `Error: ${err.message}` });
        setStreaming(sessionId, false);
        if (handoffId && bridge?.gauntlet) {
          void bridge.gauntlet.patch(handoffId, {
            nextAction: "The connection ended unexpectedly; refreshing durable coordinator status automatically before any resume is offered.",
          });
        }
        syncSession();
      },
    });
    setStreaming(sessionId, true, stop);
  }, [text, streaming, disabledReason, mode, experience, workspaceKey, extraFlags, runPreferences, gauntletBar, draftKey, gauntletDraftKey]);

  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);

  const isSlash = text.startsWith("/") && !text.trimStart().includes(" ") && !slashDismissed;
  const slashQuery = isSlash ? text.trimStart().slice(1).toLowerCase() : "";
  const slashMatches = isSlash
    ? SLASH_COMMANDS.filter((c) => c.cmd.slice(1).toLowerCase().startsWith(slashQuery) || c.label.toLowerCase().includes(slashQuery))
    : [];

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setText(cmd.cmd + " ");
    if (cmd.targetMode && availableModes.includes(cmd.targetMode)) {
      setMode(cmd.targetMode);
    }
    setSlashDismissed(true);
    textareaRef.current?.focus();
  }, [availableModes, setMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isSlash && slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        selectSlashCommand(slashMatches[slashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    // Enter sends; Shift+Enter inserts a newline. Skip while an IME composition
    // is active so Enter can confirm candidates instead of sending.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && streaming && stopStream) {
      stopStream();
      if (currentSessionId) {
        const message = useStore.getState().activeSession(experience, workspaceKey)?.messages.at(-1);
        if (message) appendEvent(currentSessionId, message.id, { type: "status", content: "Stopped by you.", data: { type: "cancelled" } });
        setStreaming(currentSessionId, false);
        syncSessionById(currentSessionId);
      }
    }
  };

  return (
    <div className="memex-composer px-6 pb-5 pt-2 flex-shrink-0">
      <div className="max-w-conversation mx-auto">
        <div className="bg-surface border border-border rounded-2xl px-3 pt-3 pb-2 focus-within:border-accent/50 transition-colors shadow-lg shadow-black/10 relative">
          {isSlash && slashMatches.length > 0 && (
            <div
              className="absolute bottom-full mb-2 left-0 right-0 max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-surface shadow-2xl z-50 py-1 divide-y divide-border/20 backdrop-blur-md"
              role="listbox"
              aria-label="Slash commands"
            >
              {slashMatches.map((cmd, idx) => (
                <button
                  key={cmd.cmd}
                  type="button"
                  role="option"
                  aria-selected={idx === slashIndex}
                  onMouseEnter={() => setSlashIndex(idx)}
                  onClick={() => selectSlashCommand(cmd)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-start gap-2.5 group ${
                    idx === slashIndex ? "bg-accent/15 text-text" : "text-text/85 hover:bg-surface2/60"
                  }`}
                  title={cmd.description}
                >
                  <span className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-accent">{cmd.cmd}</span>
                      <span className="font-medium text-text/90">{cmd.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        cmd.category === "Flow"
                          ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                          : cmd.category === "Workflow"
                          ? "bg-accent/15 text-accent border border-accent/30"
                          : "bg-surface2 text-muted border border-border/50"
                      }`}>
                        {cmd.category}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted leading-relaxed line-clamp-2 group-hover:text-text/80">
                      {cmd.description}
                    </p>
                  </span>
                  <span className="text-[10px] font-mono text-muted/60 px-1.5 py-0.5 rounded bg-surface2/80 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    Tab ↹
                  </span>
                </button>
              ))}
            </div>
          )}
          {mode === "gauntlet" && <label className="mb-2 block px-2 text-xs text-muted">Quality bar
            <input aria-label="Gauntlet quality bar" value={gauntletBar} onChange={(event) => { setGauntletBar(event.target.value); setGauntletError(""); }} placeholder="A named, fetchable reference — URL, product, repo, or publication" className="mt-1 w-full rounded-md border border-border/60 bg-canvas px-2 py-1.5 text-xs text-text placeholder-faint focus:outline-none focus:border-accent" />
            {gauntletError && <span role="alert" className="mt-1 block text-xs text-yellow">{gauntletError}</span>}
          </label>}
          <textarea
            ref={textareaRef}
            value={text}
            disabled={!!disabledReason}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value.startsWith("/")) {
                setSlashDismissed(false);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={disabledReason ?? placeholder ?? (streaming ? "Streaming… (Esc to stop)" : "Message Memex…")}
            rows={1}
            className="w-full bg-transparent px-2 text-text text-[15px] resize-none focus:outline-none placeholder-faint min-h-[24px] leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1.5">
            {/* Mode selector + model picker */}
            <div className="flex items-center gap-1">
              {lockMode ? (
                <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted">
                  <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[mode]}`} />
                  {lockModeLabel ?? MODE_LABELS[mode]}
                </span>
              ) : (
                <div ref={modeRef} className="relative">
                  <button
                    onClick={() => setModeOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors
                      ${modeOpen ? "bg-surface2 text-text" : "text-muted hover:text-text hover:bg-surface2"}`}
                    title="Select mode"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[mode]}`} />
                    {MODE_LABELS[mode]}
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3.5l3 3 3-3" />
                    </svg>
                  </button>
                  {modeOpen && (
                    <div className="absolute bottom-full mb-2 left-0 w-60 bg-canvas border border-border/60 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                      {availableModes.map((m) => (
                        <button
                          key={m}
                          onClick={() => { setMode(m); setModeOpen(false); }}
                          className={`w-full text-left flex items-start gap-2 px-3 py-1.5 text-xs transition-colors
                            ${m === globalMode ? "bg-accent/10 text-text" : "text-text/80 hover:bg-surface2/60"}`}
                        >
                          <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${MODE_DOT[m]}`} />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium">{MODE_LABELS[m]}</span>
                              {m === globalMode && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-accent">
                                  <path d="M1.5 5l3 3 4-5" />
                                </svg>
                              )}
                            </span>
                            <span className="block text-[10px] text-muted leading-snug">{MODE_DESC[m]}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <ModelPickerPopover />
              <RunControls experience={experience} workspaceKey={workspaceKey} />
              <ContextMeter />
            </div>

            <button
              onClick={streaming ? () => {
                stopStream?.();
                if (currentSessionId) {
                  const message = useStore.getState().activeSession(experience, workspaceKey)?.messages.at(-1);
                  if (message) appendEvent(currentSessionId, message.id, { type: "status", content: "Stopped by you.", data: { type: "cancelled" } });
                  setStreaming(currentSessionId, false);
                  syncSessionById(currentSessionId);
                }
              } : submit}
              disabled={!streaming && (!text.trim() || !!disabledReason)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                streaming
                  ? "bg-red/90 text-white hover:bg-red"
                  : "bg-accent text-canvas hover:bg-accentdim disabled:bg-surface2 disabled:text-faint disabled:cursor-not-allowed"
              }`}
              title={streaming ? "Stop" : "Send"}
            >
              {streaming ? (
                <span className="w-2.5 h-2.5 bg-current rounded-sm" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 13V3M8 3L4 7M8 3l4 4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
