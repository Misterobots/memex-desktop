import { useState } from "react";
import type { MessageEvent } from "../../types/memex";

interface Props { event: MessageEvent; }

export function AgentTrace({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const label = event.pioneer_name ?? event.agent_name ?? "Worker output";

  return (
    <div className="border border-border/70 rounded-lg bg-surface text-xs">
      <button
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas transition-colors"
      >
        <span className="text-accent font-medium">{label}</span>
        <span className="text-muted ml-auto">{expanded ? "Hide details" : "Show details"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 text-muted whitespace-pre-wrap border-t border-border/70 leading-5">
          {event.content}
        </div>
      )}
    </div>
  );
}