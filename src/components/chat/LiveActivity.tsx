import { useEffect, useState } from "react";
import type { MessageEvent } from "../../types/memex";
import { activityDetail, activityEvents, activityLabel, errorEvents, sanitizeActivityText } from "../../lib/workspace-outputs";

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
  const presentationEvents = milestones.filter((event) => activityLabel(event.content) !== "Ready").reduce<MessageEvent[]>((result, event) => {
    const previous = result.at(-1);
    return previous && activityLabel(previous.content) === activityLabel(event.content) ? result : [...result, event];
  }, []);
  const latest = presentationEvents.at(-1) ? activityLabel(presentationEvents.at(-1)!.content) : (waiting ? "Waiting for the model…" : "Working…");
  const receipt = events.at(-1)?.receivedAt;
  const quietFor = receipt ? Math.max(0, Math.floor((Date.now() - receipt) / 1000)) : seconds;
  const failed = errorEvents(events).length > 0;
  const stopped = events.some((event) => event.data?.type === "cancelled");
  const completed = events.some((event) => event.data?.type === "stream_complete");
  // A completed SSE stream can retain its useful chronology, but must never
  // look like background work is still progressing.
  const heading = active ? "Working" : failed ? "Run failed" : stopped ? "Stopped" : completed ? "Completed activity" : "Activity";
  const timelineEvents = (verbose ? milestones : presentationEvents).filter((event) => activityLabel(event.content) !== "Ready");
  if (!active && milestones.length === 0) return null;
  return <section aria-label="Run activity" className="text-sm">
    <div className="flex items-center gap-2 text-xs text-muted" role="status">
      <span className={active ? "w-1.5 h-1.5 rounded-full bg-accent status-dot-active" : "w-1.5 h-1.5 rounded-full bg-muted"} />
      <span>{heading}</span>
      {active && <span className="tabular-nums">{elapsedLabel(seconds)}</span>}
    </div>
    {brief ? <p className="mt-2 text-xs text-muted break-words">{latest}</p> : (
      <div className="mt-3 space-y-1.5 border-l border-border/50 pl-3">
        {verbose && <p className="pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">Reasoning and activity</p>}
        {timelineEvents.map((event, index) => {
          const structured = event.type.startsWith("tool_call") || event.type === "agent_event";
          return structured ? <details key={index} className="rounded-lg border border-border/50 bg-surface text-xs">
            <summary className="cursor-pointer px-3 py-2 text-muted break-words">
              {String(event.data?.tool_name ?? event.agent_name ?? "Tool activity")}
              {event.type === "tool_call_result" ? " · Result" : ""}
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border/50 px-3 py-2">{sanitizeActivityText(event.data && structured ? JSON.stringify(event.data, null, 2) : event.content)}</pre>
          </details> : <div key={index} className="flex items-center gap-2 text-xs leading-5 text-muted">
            <span className="h-1 w-1 shrink-0 rounded-full bg-muted/70" />
            <span className={event.type === "thought" ? "text-text/80" : ""}>{verbose ? activityDetail(event.content, event.type) : activityLabel(event.content)}</span>
          </div>;
        })}
      </div>
    )}
    {active && quietFor >= 12 && <p role="status" className="mt-2 text-xs text-muted">Still waiting on the current operation · {elapsedLabel(quietFor)} since the last update</p>}
  </section>;
}
