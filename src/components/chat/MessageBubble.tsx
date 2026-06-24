import { useState } from "react";
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

  // Filter events by type for rendering
  const statusEvents = message.events.filter(
    (e) => e.type === "status" || e.type === "thought" || e.type === "log"
  );
  const agentEvents  = message.events.filter((e) => e.type === "agent_event");
  const clarification = message.events.find((e) => e.type === "clarification_card");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-bubble rounded-lg px-4 py-2.5 max-w-2xl text-text text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Status / thought events */}
      {statusEvents.length > 0 && (
        <div className="space-y-0.5">
          {statusEvents.map((e, i) => <StatusEvent key={i} event={e} />)}
        </div>
      )}

      {/* Agent trace events */}
      {agentEvents.length > 0 && (
        <div className="space-y-1">
          {agentEvents.map((e, i) => <AgentTrace key={i} event={e} />)}
        </div>
      )}

      {/* Clarification card */}
      {clarification && (
        <SteeringCard
          content={clarification.content}
          messageId={message.id}
        />
      )}

      {/* Main content */}
      {(message.content || isStreaming) && (
        <div className={`text-text text-sm whitespace-pre-wrap leading-relaxed ${isStreaming && !message.content ? "cursor-blink" : ""}`}>
          {message.content || ""}
          {streaming && message.content && <span className="cursor-blink" />}
        </div>
      )}
    </div>
  );
}
