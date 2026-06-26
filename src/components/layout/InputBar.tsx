import { useRef, useState, useCallback, useEffect } from "react";
import { useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { MODE_FLAGS, MODE_LABELS, type MemexMode, type ChatMessage, type MessageEvent } from "../../types/memex";

const MODES: MemexMode[] = ["chat", "swarm", "research", "design", "think", "plan"];

const MODE_DOT: Record<MemexMode, string> = {
  chat:     "bg-muted",
  swarm:    "bg-accent",
  research: "bg-green",
  design:   "bg-yellow",
  think:    "bg-[#b48ead]",
  plan:     "bg-[#d4a85f]",
  workshop: "bg-accent",
};

interface InputBarProps {
  /** Extra request flags merged into every send (e.g. { dev_mode: true }). */
  extraFlags?: Record<string, boolean>;
  /** When set, the composer is locked to this mode and the mode pill is hidden. */
  lockMode?: MemexMode;
  /** Placeholder override. */
  placeholder?: string;
}

export function InputBar({ extraFlags = {}, lockMode, placeholder }: InputBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    mode: globalMode, setMode, activeSessionId, createSession,
    addMessage, appendEvent, updateMessageContent, updateMessageRunId,
    setStreaming, streaming, stopStream, activeSession, selectedModel,
  } = useStore();

  const mode = lockMode ?? globalMode;

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);

  const cycleMode = () => {
    const idx = MODES.indexOf(globalMode);
    setMode(MODES[(idx + 1) % MODES.length]);
  };

  const submit = useCallback(() => {
    const content = text.trim();
    if (!content || streaming) return;
    setText("");

    const sessionId = activeSessionId ?? createSession();
    const session = activeSession();

    addMessage(sessionId, {
      id: `msg-${Date.now()}-u`, role: "user", content,
      events: [], timestamp: Date.now(), mode,
    } as ChatMessage);

    const assistantId = `msg-${Date.now()}-a`;
    addMessage(sessionId, {
      id: assistantId, role: "assistant", content: "",
      events: [], timestamp: Date.now(), mode,
    } as ChatMessage);

    const history = (session?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content });

    let accumulated = "";
    const stop = streamChat({
      messages: history,
      mode,
      model: selectedModel,
      modeFlags: { ...MODE_FLAGS[mode], ...extraFlags },
      sessionId,
      runMeta: { profile: "default" },
      onRunStarted: (runId) => updateMessageRunId(sessionId, assistantId, runId),
      onEvent: (event) => {
        appendEvent(sessionId, assistantId, event as MessageEvent);
        if (event.type === "message" || event.type === "response") {
          accumulated += event.content;
          updateMessageContent(sessionId, assistantId, accumulated);
        }
      },
      onDone: () => setStreaming(false),
      onError: (err) => {
        appendEvent(sessionId, assistantId, { type: "log", content: `Error: ${err.message}` });
        setStreaming(false);
      },
    });
    setStreaming(true, stop);
  }, [text, streaming, mode, activeSessionId, extraFlags]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.shiftKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && streaming && stopStream) {
      stopStream();
      setStreaming(false);
    }
  };

  return (
    <div className="px-6 pb-5 pt-2 flex-shrink-0">
      <div className="max-w-conversation mx-auto">
        <div className="bg-surface border border-border rounded-2xl px-3 pt-3 pb-2 focus-within:border-accent/50 transition-colors shadow-lg shadow-black/10">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? (streaming ? "Streaming… (Esc to stop)" : "Message Memex…")}
            rows={1}
            className="w-full bg-transparent px-2 text-text text-[15px] resize-none focus:outline-none placeholder-faint min-h-[24px] leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1.5">
            {/* Mode selector */}
            {lockMode ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted">
                <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[mode]}`} />
                {MODE_LABELS[mode]}
              </span>
            ) : (
              <button
                onClick={cycleMode}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted hover:text-text hover:bg-surface2 transition-colors"
                title="Click to cycle mode"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${MODE_DOT[mode]}`} />
                {MODE_LABELS[mode]}
              </button>
            )}

            <button
              onClick={streaming ? () => { stopStream?.(); setStreaming(false); } : submit}
              disabled={!streaming && !text.trim()}
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
