import { useEffect, useState } from "react";
import type { MessageEvent } from "../../types/memex";
import { activityEvents, errorEvents } from "../../lib/workspace-outputs";

function elapsedLabel(seconds: number) {
  return seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m " + seconds % 60 + "s";
}

/** A chronological activity narrative based only on events the runtime emitted. */
export function LiveActivity({ events, active, waiting, verbose = false, brief = false }: {
  events: MessageEvent[]; active: boolean; waiting: boolean; verbose?: boolean; brief?: boolean;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = events[0]?.receivedAt ?? Date.now();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const milestones = activityEvents(events, verbose);
  const latest = milestones.at(-1)?.content || (waiting ? "Waiting for the model…" : "Working…");
  const receipt = events.at(-1)?.receivedAt;
  const quietFor = receipt ? Math.max(0, Math.floor((Date.now() - receipt) / 1000)) : seconds;
  const failed = errorEvents(events).length > 0;
  const stopped = events.some((event) => event.data?.type === "cancelled");
  const heading = active ? "Working" : failed ? "Run failed" : stopped ? "Stopped" : "Activity";
  if (!active && milestones.length === 0) return null;
  return <section aria-label="Run activity" className="text-sm">
    <div className="flex items-center gap-2 text-xs text-muted" role="status">
      <span className={active ? "w-1.5 h-1.5 rounded-full bg-accent status-dot-active" : "w-1.5 h-1.5 rounded-full bg-muted"} />
      <span>{heading}</span>
      {active && <span className="tabular-nums">{elapsedLabel(seconds)}</span>}
    </div>
    {brief ? <p className="mt-2 text-xs text-muted break-words">{latest}</p> : (
      <div className="mt-3 space-y-2 border-l border-border/50 pl-3">
        {milestones.map((event, index) => {
          const structured = event.type.startsWith("tool_call") || event.type === "agent_event" || event.type === "log";
          return structured ? <details key={index} className="rounded-lg border border-border/50 bg-surface text-xs">
            <summary className="cursor-pointer px-3 py-2 text-muted break-words">
              {String(event.data?.tool_name ?? event.agent_name ?? (event.type === "log" ? "Runtime detail" : "Tool activity"))}
              {event.type === "tool_call_result" ? " · Result" : ""}
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border/50 px-3 py-2">{event.data && structured ? JSON.stringify(event.data, null, 2) : event.content}</pre>
          </details> : <p key={index} className={event.type === "thought" ? "text-text/80 text-sm whitespace-pre-wrap break-words" : "text-muted text-xs leading-5 break-words"}>{event.content}</p>;
        })}
      </div>
    )}
    {active && quietFor >= 12 && <p role="status" className="mt-2 text-xs text-muted">Still waiting on the current operation · {elapsedLabel(quietFor)} since the last update</p>}
  </section>;
}
