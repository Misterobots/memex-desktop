import { useState } from "react";
import { useStore } from "../../lib/store";
import { streamChat } from "../../lib/sse-stream";
import { MODE_FLAGS, type ClarificationCard, type ChatMessage, type ExperienceId, type MessageEvent } from "../../types/memex";
import { desktop, type GauntletHandoff } from "../../lib/desktop";

interface Props {
  card: ClarificationCard;
  messageId: string;
  sessionId: string;
  experience?: ExperienceId;
  workspaceKey?: string;
  gauntletHandoffId?: string;
}

/**
 * Renders a Collective clarification_card (structured: question + context + options)
 * and, on answer, sends the chosen option `value` as the next user message.
 * The backend loads the saved pending-context on that message (church.py →
 * routing/gates.py) and resumes the coordination with skip_project_gate=True.
 */
export function SteeringCard({ card, sessionId, experience = "chat", workspaceKey, gauntletHandoffId }: Props) {
  const [freetext, setFreetext]   = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const {
    addMessage, appendEvent,
    updateMessageContent, setStreaming, activeSession,
  } = useStore();

  const options = card.options ?? [];

  const submit = async (value: string, label?: string) => {
    const v = value.trim();
    const session = activeSession(experience, workspaceKey);
    if (!v || submitted || !session || session.id !== sessionId) return;
    setSubmitted(label ?? v);

    const targetSessionId = session.id;
    const mode = [...session.messages].reverse().find((message) => message.role === "assistant")?.mode ?? "chat";
    const history = session.messages.map((m) => ({ role: m.role, content: m.content }));
    const now = Date.now();

    // Show the choice as a user turn and send it — the backend picks up the
    // pending clarification context on this next message and routes accordingly.
    addMessage(targetSessionId, { id: `msg-${now}-u`, role: "user", content: v, events: [], timestamp: now, mode } as ChatMessage);
    const assistantId = `msg-${now}-a`;
    addMessage(targetSessionId, { id: assistantId, role: "assistant", content: "", events: [], timestamp: now, mode } as ChatMessage);
    history.push({ role: "user", content: v });

    let acc = "";
    // A coordinator clarification is part of the same run, not a new generic
    // chat turn.  Reload the desktop-owned contract so a project-routing card
    // cannot silently discard the quality bar, selected effort, or checkpoint.
    const packet: GauntletHandoff | null = gauntletHandoffId
      ? await desktop()?.gauntlet?.get(gauntletHandoffId) ?? null
      : null;
    if (packet?.status === "needs_input") {
      await desktop()?.gauntlet?.patch(packet.id, {
        status: "accepted",
        nextAction: "Coordinator is applying the project decision to the preserved Gauntlet contract.",
      });
    }
    const stop = streamChat({
      messages: history,
      mode,
      // The selected model is part of the immutable Gauntlet effort policy.
      // Without it, streamChat defaults to the compatibility alias "swarm",
      // which the runtime correctly rejects as not user-selectable.
      model: packet?.effort.model,
      gauntletBar: packet?.qualityBar,
      gauntletHandoff: packet ? {
        id: packet.id,
        role: packet.role,
        phase: packet.phase,
        goal: packet.goal,
        qualityBar: packet.qualityBar,
        effort: packet.effort,
      } : undefined,
      modeFlags: { ...MODE_FLAGS[mode], ...(packet ? { gauntlet_mode: true, swarm_mode: true, dev_mode: true } : {}) },
      sessionId: targetSessionId,
      workspaceKey,
      onEvent: (e) => {
        appendEvent(targetSessionId, assistantId, e as MessageEvent);
        if (e.type === "message" || e.type === "response") {
          acc += e.content;
          updateMessageContent(targetSessionId, assistantId, acc);
        }
      },
      onDone: () => setStreaming(targetSessionId, false),
      onError: () => setStreaming(targetSessionId, false),
    });
    setStreaming(targetSessionId, true, stop);
  };

  if (submitted) {
    return (
      <div className="text-xs text-muted font-mono border border-border/60 rounded-lg px-3 py-2">
        ✓ {submitted} — Collective proceeding…
      </div>
    );
  }

  return (
    <div className="border border-yellow/50 rounded-xl bg-surface overflow-hidden text-sm">
      <div className="px-4 py-2.5 border-b border-border/60 bg-canvas">
        <p className="text-yellow text-[11px] font-mono mb-0.5 uppercase tracking-wide">Collective needs input</p>
        <p className="text-text">{card.question}</p>
        {card.context && <p className="text-muted text-xs mt-1">{card.context}</p>}
      </div>
      <div className="px-4 py-3 space-y-2">
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => void submit(opt.value, opt.label)}
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
              onKeyDown={(e) => e.key === "Enter" && void submit(freetext)}
              placeholder="Or type your answer…"
              className="flex-1 bg-canvas border border-border/60 rounded-lg px-3 py-1.5 text-xs text-text
                placeholder-muted focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => void submit(freetext)}
              disabled={!freetext.trim()}
              className="px-3 py-1.5 text-xs bg-accent text-canvas rounded-lg hover:bg-accentdim disabled:opacity-30"
            >Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
