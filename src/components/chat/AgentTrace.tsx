import { useState } from "react";
import type { MessageEvent } from "../../types/memex";

interface Props { event: MessageEvent; }

export function AgentTrace({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const label = event.pioneer_name ?? event.agent_name ?? "Agent";

  return (
    <div className="border border-border rounded bg-surface text-xs font-mono">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-canvas transition-colors"
      >
        <span className="text-green">{expanded ? "▼" : "▶"}</span>
        <span className="text-accent">{label}</span>
        <span className="text-muted ml-auto">worker output</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 pt-1 text-muted whitespace-pre-wrap border-t border-border">
          {event.content}
        </div>
      )}
    </div>
  );
}
