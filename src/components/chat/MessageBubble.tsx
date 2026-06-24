import { useStore } from "../../lib/store";
import type { ChatMessage } from "../../types/memex";
import { StatusEvent } from "./StatusEvent";
import { AgentTrace } from "./AgentTrace";
import { SteeringCard } from "./SteeringCard";

interface Props { message: ChatMessage; }

export function MessageBubble({ message }: Props) {
  const { streaming } = useStore();
  const isUser = message.role === "user";
  const isStreaming = streaming && message.role === "assistant" && !message.content;

  const statusEvents = message.events.filter(
    (e) => e.type === "status" || e.type === "thought" || e.type === "log"
  );
  const agentEvents   = message.events.filter((e) => e.type === "agent_event");
  const clarification = message.events.find((e) => e.type === "clarification_card");

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
        <span className="text-accent text-sm">◈</span>
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

        {clarification && (
          <SteeringCard content={clarification.content} messageId={message.id} />
        )}

        {(message.content || isStreaming) && (
          <div className={`text-text text-[15px] leading-relaxed whitespace-pre-wrap ${isStreaming ? "cursor-blink" : ""}`}>
            {message.content}
            {streaming && message.content && <span className="cursor-blink" />}
          </div>
        )}
      </div>
    </div>
  );
}
