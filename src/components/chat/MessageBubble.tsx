import type { ChatDisplayMode, ChatMessage, ExperienceId } from "../../types/memex";
import { useState } from "react";
import { RunInspectorPanel } from "./RunInspectorPanel";
import { ResponseActions } from "./ResponseActions";
import { LiveActivity } from "./LiveActivity";
import { SteeringCard } from "./SteeringCard";
import { MessageOutputs } from "./MessageOutputs";
import { MessageContent } from "./MessageContent";
import { GauntletHandoffCard } from "./GauntletHandoffCard";
import { UnrealEngineSetup } from "../setup/UnrealEngineSetup";
import { needsUnrealSetup } from "../../lib/capability-recovery";
import { errorEvents, outputsFromEvents } from "../../lib/workspace-outputs";

// Lazy import to avoid hard dep on ChatView context when used outside it
import { useInspector } from "../views/ChatView";

interface Props {
  message: ChatMessage;
  /** True only for the single message currently being streamed. */
  isActive?: boolean;
  displayMode?: ChatDisplayMode;
  sessionId?: string;
  experience?: ExperienceId;
  workspaceKey?: string;
}

function RunButton({ runId }: { runId: string }) {
  const inspector = useInspector(); // returns null when outside ChatView
  const [localOpen, setLocalOpen] = useState(false);
  const isActive = inspector ? inspector.activeRunId === runId : localOpen;

  return (<>
    <button
      onClick={() => inspector ? inspector.open(runId) : setLocalOpen(true)}
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
    {localOpen && <div role="dialog" aria-label="Run inspector" className="fixed inset-0 z-50 flex justify-end bg-canvas/95">
      <RunInspectorPanel runId={runId} onClose={() => setLocalOpen(false)} />
    </div>}
  </>);
}

export function MessageBubble({ message, isActive = false, displayMode = "normal", sessionId, experience, workspaceKey }: Props) {
  const isUser = message.role === "user";
  // Waiting for the first token on the message that's actively streaming.
  const isWaiting = isActive && !message.content;

  const events = message.events ?? [];
  const errors = errorEvents(events);
  const showActivity = displayMode !== "summary" && displayMode !== "none";
  const showThoughts = displayMode === "thought";
  const clarification = events.find((e) => e.type === "clarification_card");
  const outputs = outputsFromEvents(events);
  const stopped = events.some((event) => event.data?.type === "cancelled");
  const gauntletCheckpoint = events.find((event) => event.data?.type === "gauntlet_checkpoint");
  const gauntletHandoffId = typeof gauntletCheckpoint?.data?.handoffId === "string" ? gauntletCheckpoint.data.handoffId : undefined;
  const disconnected = !isActive && !stopped && !clarification && errors.length === 0 && (
    events.some((event) => event.data?.type === "stream_started")
      ? !events.some((event) => event.data?.type === "stream_complete")
      : events.length > 0 && !message.content && outputs.length === 0
  );

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
        <span aria-hidden className="text-accent text-sm leading-none">◈</span>
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {isActive && showActivity ? (
          <LiveActivity events={events} active={true} waiting={isWaiting} verbose={showThoughts} brief={!showActivity} />
        ) : showActivity && events.length > 0 && (
          <LiveActivity events={events} active={false} waiting={false} verbose={showThoughts} />
        )}

        {clarification?.clarification && sessionId && (
          <SteeringCard card={clarification.clarification} messageId={message.id} sessionId={sessionId} experience={experience} workspaceKey={workspaceKey} gauntletHandoffId={gauntletHandoffId} />
        )}

        {errors.map((event, index) => <p key={index} role="alert" className="text-sm text-red-400">{event.content}</p>)}
        {disconnected && <p role="status" className="text-sm text-amber-300">No completed response was received in this view. The connection may have been interrupted; the runtime may still be working. Any received output is preserved below.</p>}
        {!isActive && events.some((event) => event.data?.type === "cancelled") && <p role="status" className="text-sm text-muted">Stopped. Any partial output is preserved below.</p>}
        {(message.content || isWaiting) && (
          <div className={isWaiting ? "cursor-blink" : ""}>
            <MessageContent content={message.content} />
            {isActive && message.content && <span className="cursor-blink" />}
          </div>
        )}

        {!isActive && needsUnrealSetup(message.content) && <UnrealEngineSetup compact onContinue={(install) => {
          window.dispatchEvent(new CustomEvent("chat:prefill", { detail:
            `Unreal Engine ${install.version} is configured locally. Continue the original Unreal task using ${install.commandPath}; do not treat the desktop as a sandbox or ask me to provide the engine directory again.`
          }));
        }} />}

        {gauntletHandoffId && <GauntletHandoffCard handoffId={gauntletHandoffId} />}

        <MessageOutputs events={events} />
        {!isActive && message.content && <ResponseActions content={message.content} />}
        {!isActive && message.mode === "design" && /design ready/i.test(message.content) && outputs.length === 0 && (
          <p role="alert" className="text-sm text-amber-300">The run reported a ready design but delivered no preview. Ask for the HTML output again.</p>
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
