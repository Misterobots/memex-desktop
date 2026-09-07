import { useRef, useState, useCallback, useEffect } from "react";
import { defaultRunPreferences, sessionScopeKey, useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { desktop, type GauntletHandoff } from "../../lib/desktop";
import { pushSession } from "../../lib/conv-sync";
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
    setText("");

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
      const sessionPackets = await bridge.gauntlet.forSession(sessionId);
      const previous = mentionedId
        ? await bridge.gauntlet.get(mentionedId)
        : /\bresume\b/i.test(content) ? sessionPackets.find((candidate) => candidate.status === "ready" || candidate.status === "accepted") ?? null : null;
      if (!previous && !gauntletBar.trim()) {
        setText(content);
        setGauntletError("Choose a named, fetchable reference for the quality bar before starting the Gauntlet.");
        return;
      }
      const packet = previous ?? await bridge.gauntlet.create({
        sessionId, workspaceKey, role: "coordinator", goal: content, qualityBar: gauntletBar.trim(),
        effort: { model: selectedModel ?? "swarm", outputDetail: runPreferences.outputDetail, reasoningSummary: runPreferences.reasoningSummary, reasoningEffort: runPreferences.reasoningEffort },
      });
      handoffId = packet.id;
      handoffPacket = packet;
      appendEvent(sessionId, assistantId, {
        type: "status",
          content: previous
            ? `Resumed Gauntlet checkpoint ${packet.id.slice(0, 8)} — using the preserved original goal, quality bar, and effort policy.`
            : `Gauntlet checkpoint ${packet.id.slice(0, 8)} saved — goal, quality bar, and effort policy are preserved locally.`,
        receivedAt: Date.now(), data: { type: "gauntlet_checkpoint", handoffId: packet.id },
      });
      syncSession();
    }
    const stop = streamChat({
      messages: history,
      mode,
      model: selectedModel,
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
      } : undefined,
      modeFlags: { ...MODE_FLAGS[mode], ...extraFlags, ...(runPreferences.reasoningEffort === "high" ? { ultrathink_mode: true } : {}) },
      sessionId,
      workspaceKey,
      runMeta: { profile: "default" },
      onRunStarted: (runId) => {
        updateMessageRunId(sessionId, assistantId, runId);
        if (handoffId && bridge?.gauntlet) {
          void bridge.gauntlet.patch(handoffId, { runId, phase: "build", nextAction: "Review the builder output against the quality bar, then explicitly assign a critic." });
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
        if (handoffId && bridge?.gauntlet) {
          const producedAnswer = accumulated.trim().length > 0;
          void bridge.gauntlet.patch(handoffId, producedAnswer ? {
            status: "ready", phase: "critic",
            pending: ["Assign an independent critic", "Compare the output to the named quality bar", "Repair all documented deficits", "Verify before final review"],
            nextAction: "The builder turn ended. Assign a critic; do not mark the Gauntlet complete yet.",
          } : {
            status: "blocked", phase: "build",
            deficits: ["The runtime ended without a model response or builder artifact."],
            pending: ["Resolve the runtime/model queue failure", "Resume the preserved checkpoint", "Verify a builder artifact is actually produced"],
            nextAction: "No builder output arrived. Resolve the runtime failure, then resume this exact checkpoint.",
          });
        }
        syncSession();
      },
      onError: (err) => {
        appendEvent(sessionId, assistantId, { type: "log", content: `Error: ${err.message}` });
        setStreaming(sessionId, false);
        syncSession();
      },
    });
    setStreaming(sessionId, true, stop);
  }, [text, streaming, disabledReason, mode, experience, workspaceKey, extraFlags, runPreferences, gauntletBar]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <div className="px-6 pb-5 pt-2 flex-shrink-0">
      <div className="max-w-conversation mx-auto">
        <div className="bg-surface border border-border rounded-2xl px-3 pt-3 pb-2 focus-within:border-accent/50 transition-colors shadow-lg shadow-black/10">
          {mode === "gauntlet" && <label className="mb-2 block px-2 text-xs text-muted">Quality bar
            <input aria-label="Gauntlet quality bar" value={gauntletBar} onChange={(event) => { setGauntletBar(event.target.value); setGauntletError(""); }} placeholder="A named, fetchable reference — URL, product, repo, or publication" className="mt-1 w-full rounded-md border border-border/60 bg-canvas px-2 py-1.5 text-xs text-text placeholder-faint focus:outline-none focus:border-accent" />
            {gauntletError && <span role="alert" className="mt-1 block text-xs text-yellow">{gauntletError}</span>}
          </label>}
          <textarea
            ref={textareaRef}
            value={text}
            disabled={!!disabledReason}
            onChange={(e) => setText(e.target.value)}
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
