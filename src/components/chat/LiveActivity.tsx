import { useEffect, useState } from "react";
import type { MessageEvent } from "../../types/memex";
import { activityEvents, activityLabel, activityPresentation, errorEvents } from "../../lib/workspace-outputs";

function elapsedLabel(seconds: number) {
  return seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m " + seconds % 60 + "s";
}

/** A chronological, user-readable work trace based only on runtime events. */
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
      <div className="mt-3 space-y-2">
        {verbose && <p className="pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">Reasoning and activity</p>}
        {timelineEvents.map((event, index) => {
          const item = activityPresentation(event);
          const toneClass = item.tone === "intent"
            ? "border-blue-400/60 bg-blue-400/10 text-blue-100"
            : item.tone === "tool"
              ? "border-pink-400/60 bg-pink-400/10 text-pink-100"
              : item.tone === "issue"
                ? "border-red/60 bg-red/10 text-red"
                : "border-green-400/60 bg-green-400/10 text-green-100";
          const label = item.tone === "intent" ? "Intent" : item.tone === "tool" ? "Command" : item.tone === "issue" ? "Issue" : "Progress";
          return <article key={index} aria-label={`${label}: ${item.title}`} className={`rounded-md border px-3 py-2 text-xs leading-5 ${toneClass}`}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{label}</span>
              {item.actor && <span className="text-[10px] opacity-70">{item.actor}</span>}
            </div>
            <p className="break-words text-text/90">{item.title}</p>
            {(verbose || item.tone === "tool" || item.tone === "issue") && item.detail && item.detail !== item.title && <p className="mt-0.5 break-words text-text/70">{item.detail}</p>}
            {verbose && item.command && <details className="mt-1 text-text/70">
              <summary className="cursor-pointer select-none text-[11px]">Show command detail</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-current/20 bg-canvas/40 p-2 font-mono text-[11px]">{item.command}</pre>
            </details>}
          </article>;
        })}
      </div>
    )}
    {active && quietFor >= 12 && <p role="status" className="mt-2 text-xs text-muted">Still waiting on the current operation · {elapsedLabel(quietFor)} since the last update</p>}
  </section>;
}
