import { useState } from "react";
import { useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { MODE_FLAGS } from "../../types/memex";

interface Option { label: string; value: string; description?: string; }

interface Props {
  content: string;
  messageId: string;
}

function parseCard(content: string): { question: string; options: Option[] } {
  // Try to extract structured question + options from raw text
  const lines = content.split("\n").filter(Boolean);
  const question = lines[0] ?? content;
  const options: Option[] = lines
    .slice(1)
    .filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => {
      const val = l.replace(/^\d+\.\s*/, "").trim();
      return { label: val, value: val };
    });
  return { question, options };
}

export function SteeringCard({ content, messageId }: Props) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { mode, activeSessionId, addMessage, appendEvent, updateMessageContent, setStreaming, activeSession } = useStore();
  const { question, options } = parseCard(content);

  const submit = (val?: string) => {
    const finalAnswer = val ?? answer.trim();
    if (!finalAnswer) return;
    setSubmitted(true);

    const sessionId = activeSessionId!;
    const session = activeSession();
    const history = (session?.messages ?? []).map((m) => ({ role: m.role, content: m.content }));

    const assistantId = `msg-${Date.now()}-a`;
    addMessage(sessionId, {
      id: assistantId, role: "assistant", content: "",
      events: [], timestamp: Date.now(), mode,
    });

    let accumulated = "";
    const stop = streamChat({
      messages: history,
      mode,
      modeFlags: MODE_FLAGS[mode],
      sessionId,
      alreadySteered: true,
      onEvent: (e) => {
        appendEvent(sessionId, assistantId, e as any);
        if (e.type === "message" || e.type === "response") {
          accumulated += e.content;
          updateMessageContent(sessionId, assistantId, accumulated);
        }
      },
      onDone: () => setStreaming(false),
      onError: () => setStreaming(false),
    });
    setStreaming(true, stop);
  };

  if (submitted) {
    return (
      <div className="text-xs text-muted font-mono border border-border rounded px-3 py-2">
        Answer submitted — swarm proceeding.
      </div>
    );
  }

  return (
    <div className="border border-yellow rounded-lg bg-surface overflow-hidden text-sm">
      <div className="px-4 py-2.5 border-b border-border bg-canvas">
        <p className="text-yellow text-xs font-mono mb-0.5">Swarm needs clarification</p>
        <p className="text-text">{question}</p>
      </div>
      <div className="px-4 py-3 space-y-2">
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => submit(opt.value)}
                className="px-3 py-1 text-xs border border-border rounded hover:border-accent hover:text-accent transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Or type your answer…"
            className="flex-1 bg-canvas border border-border rounded px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => submit()}
            disabled={!answer.trim()}
            className="px-3 py-1.5 text-xs bg-accent text-canvas rounded hover:opacity-80 disabled:opacity-30"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
