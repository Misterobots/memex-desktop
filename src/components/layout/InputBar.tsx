import { useRef, useState, useCallback, useEffect } from "react";
import { useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { MODE_FLAGS, MODE_LABELS, type MemexMode, type ChatMessage, type MessageEvent } from "../../types/memex";

const MODES: MemexMode[] = ["chat", "swarm", "research", "design", "think", "plan"];

const MODE_COLORS: Record<MemexMode, string> = {
  chat:     "text-muted border-border",
  swarm:    "text-accent border-accent",
  research: "text-green border-green",
  design:   "text-yellow border-yellow",
  think:    "text-purple-400 border-purple-400",
  plan:     "text-orange-400 border-orange-400",
};

export function InputBar() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    mode, setMode, activeSessionId, createSession,
    addMessage, appendEvent, updateMessageContent,
    setStreaming, streaming, stopStream, activeSession,
  } = useStore();

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const cycleMode = () => {
    const idx = MODES.indexOf(mode);
    setMode(MODES[(idx + 1) % MODES.length]);
  };

  const submit = useCallback(() => {
    const content = text.trim();
    if (!content || streaming) return;
    setText("");

    const sessionId = activeSessionId ?? createSession();
    const session = activeSession();

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: "user",
      content,
      events: [],
      timestamp: Date.now(),
      mode,
    };
    addMessage(sessionId, userMsg);

    const assistantId = `msg-${Date.now()}-a`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      events: [],
      timestamp: Date.now(),
      mode,
    };
    addMessage(sessionId, assistantMsg);

    const history = (session?.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    history.push({ role: "user", content });

    let accumulated = "";

    const stop = streamChat({
      messages: history,
      mode,
      modeFlags: MODE_FLAGS[mode],
      sessionId,
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
  }, [text, streaming, mode, activeSessionId]);

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
    <div className="border-t border-border bg-surface px-4 py-3 flex-shrink-0">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        {/* Mode pill */}
        <button
          onClick={cycleMode}
          className={`flex-shrink-0 px-2 py-1 rounded border text-xs font-mono mb-1 transition-colors hover:opacity-80 ${MODE_COLORS[mode]}`}
          title="Click to cycle mode"
        >
          {MODE_LABELS[mode]}
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={streaming ? "Streaming… (Esc to stop)" : "Message Memex (Shift+Enter to send)"}
          disabled={false}
          rows={1}
          className="flex-1 bg-canvas border border-border rounded-lg px-3 py-2 text-text text-sm resize-none focus:outline-none focus:border-accent placeholder-muted transition-colors min-h-[36px]"
        />

        {/* Send / Stop */}
        <button
          onClick={streaming ? () => { stopStream?.(); setStreaming(false); } : submit}
          disabled={!streaming && !text.trim()}
          className={`flex-shrink-0 mb-1 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            streaming
              ? "bg-red text-white hover:opacity-80"
              : "bg-accent text-canvas hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
          }`}
        >
          {streaming ? "Stop" : "Send"}
        </button>
      </div>
      <p className="text-center text-muted text-xs mt-1.5">
        Ctrl+K — command palette · Shift+Enter — send · Esc — stop
      </p>
    </div>
  );
}
