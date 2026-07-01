import { useState } from "react";
import { useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { MODE_FLAGS, type ClarificationCard, type ChatMessage, type MessageEvent } from "../../types/memex";

interface Props {
  card: ClarificationCard;
  messageId: string;
}

/**
 * Renders a swarm clarification_card (structured: question + context + options)
 * and, on answer, sends the chosen option `value` as the next user message.
 * The backend loads the saved pending-context on that message (church.py →
 * routing/gates.py) and resumes the coordination with skip_project_gate=True.
 */
export function SteeringCard({ card }: Props) {
  const [freetext, setFreetext]   = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const {
    mode, activeSessionId, addMessage, appendEvent,
    updateMessageContent, setStreaming, activeSession,
  } = useStore();

  const options = card.options ?? [];

  const submit = (value: string, label?: string) => {
    const v = value.trim();
    if (!v || submitted || !activeSessionId) return;
    setSubmitted(label ?? v);

    const sessionId = activeSessionId;
    const history = (activeSession()?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));
    const now = Date.now();

    // Show the choice as a user turn and send it — the backend picks up the
    // pending clarification context on this next message and routes accordingly.
    addMessage(sessionId, { id: `msg-${now}-u`, role: "user", content: v, events: [], timestamp: now, mode } as ChatMessage);
    const assistantId = `msg-${now}-a`;
    addMessage(sessionId, { id: assistantId, role: "assistant", content: "", events: [], timestamp: now, mode } as ChatMessage);
    history.push({ role: "user", content: v });

    let acc = "";
    const stop = streamChat({
      messages: history,
      mode,
      modeFlags: MODE_FLAGS[mode],
      sessionId,
      onEvent: (e) => {
        appendEvent(sessionId, assistantId, e as MessageEvent);
        if (e.type === "message" || e.type === "response") {
          acc += e.content;
          updateMessageContent(sessionId, assistantId, acc);
        }
      },
      onDone: () => setStreaming(false),
      onError: () => setStreaming(false),
    });
    setStreaming(true, stop);
  };

  if (submitted) {
    return (
      <div className="text-xs text-muted font-mono border border-border/60 rounded-lg px-3 py-2">
        ✓ {submitted} — swarm proceeding…
      </div>
    );
  }

  return (
    <div className="border border-yellow/50 rounded-xl bg-surface overflow-hidden text-sm">
      <div className="px-4 py-2.5 border-b border-border/60 bg-canvas">
        <p className="text-yellow text-[11px] font-mono mb-0.5 uppercase tracking-wide">Swarm needs input</p>
        <p className="text-text">{card.question}</p>
        {card.context && <p className="text-muted text-xs mt-1">{card.context}</p>}
      </div>
      <div className="px-4 py-3 space-y-2">
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => submit(opt.value, opt.label)}
                className="w-full text-left px-3 py-2 rounded-lg border border-border/60 hover:border-accent hover:bg-accent/5 transition-colors"
              >
                <div className="text-text text-sm">{opt.label}</div>
                {opt.description && <div className="text-muted text-[11px] mt-0.5">{opt.description}</div>}
              </button>
            ))}
          </div>
        )}
        {card.allow_freetext !== false && (
          <div className="flex gap-2 pt-1">
            <input
              value={freetext}
              onChange={(e) => setFreetext(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(freetext)}
              placeholder="Or type your answer…"
              className="flex-1 bg-canvas border border-border/60 rounded-lg px-3 py-1.5 text-xs text-text
                placeholder-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => submit(freetext)}
              disabled={!freetext.trim()}
              className="px-3 py-1.5 text-xs bg-accent text-canvas rounded-lg hover:bg-accentdim disabled:opacity-30"
            >Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
