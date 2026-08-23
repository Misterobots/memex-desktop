import type { ChatDisplayMode, ChatMessage } from "../../types/memex";
import { StatusEvent }  from "./StatusEvent";
import { AgentTrace }   from "./AgentTrace";
import { SteeringCard } from "./SteeringCard";

// Lazy import to avoid hard dep on ChatView context when used outside it
import { useInspector } from "../views/ChatView";

interface Props {
  message: ChatMessage;
  /** True only for the single message currently being streamed. */
  isActive?: boolean;
  displayMode?: ChatDisplayMode;
}

function RunButton({ runId }: { runId: string }) {
  const inspector = useInspector(); // returns null when outside ChatView
  if (!inspector) return null;

  const { open, activeRunId } = inspector;
  const isActive = activeRunId === runId;

  return (
    <button
      onClick={() => open(runId)}
      title="Inspect run"
      className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors
        ${isActive
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border/40 bg-surface2/30 text-muted hover:text-text hover:border-border/70"}`}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="4.5" />
        <path d="M6 3.5v3l2 1" />
      </svg>
      Run
    </button>
  );
}

export function MessageBubble({ message, isActive = false, displayMode = "normal" }: Props) {
  const isUser = message.role === "user";
  // Waiting for the first token on the message that's actively streaming.
  const isWaiting = isActive && !message.content;

  const events = message.events ?? [];
  const statusEvents = events.filter(
    (e) => e.type === "status"
  );
  const agentEvents   = displayMode === "summary" ? [] : events.filter((e) => e.type === "agent_event");
  const clarification = events.find((e) => e.type === "clarification_card");

  if (isUser) {
    return (
      <div className="flex justify-end fade-up">
        <div className="bg-userbubble rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[85%] text-text text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 fade-up">
      {/* Assistant avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center mt-0.5">
        <span className="sr-only">Assistant</span>
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {statusEvents.length > 0 && (
          <div className="space-y-1">
            {statusEvents.map((e, i) => <StatusEvent key={i} event={e} />)}
          </div>
        )}

        {agentEvents.length > 0 && (
          <div className="space-y-1.5">
            {agentEvents.map((e, i) => <AgentTrace key={i} event={e} />)}
          </div>
        )}

        {clarification?.clarification && (
          <SteeringCard card={clarification.clarification} messageId={message.id} />
        )}

        {(message.content || isWaiting) && (
          <div className={`text-text text-[15px] leading-relaxed whitespace-pre-wrap ${isWaiting ? "cursor-blink" : ""}`}>
            {message.content}
            {isActive && message.content && <span className="cursor-blink" />}
          </div>
        )}

        {/* Run inspector button — only shown when run is attached and not mid-stream */}
        {message.runId && !isActive && (
          <div className="pt-0.5">
            <RunButton runId={message.runId} />
          </div>
        )}
      </div>
    </div>
  );
}
