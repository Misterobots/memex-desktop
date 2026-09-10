import { useEffect, useState } from "react";
import type { MessageEvent } from "../../types/memex";
import { activityEvents, activityLabel, activityPresentation, errorEvents } from "../../lib/workspace-outputs";

function elapsedLabel(seconds: number) {
  return seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m " + seconds % 60 + "s";
}

function ActivityGlyph({ tone }: { tone: "intent" | "tool" | "progress" | "issue" }) {
  const common = "h-3.5 w-3.5 shrink-0";
  if (tone === "tool") return <svg aria-hidden viewBox="0 0 16 16" className={`${common} text-pink-300`} fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" /><path d="m5 8 1.6 1.6L11 5.5" /></svg>;
  if (tone === "intent") return <svg aria-hidden viewBox="0 0 16 16" className={`${common} text-blue-300`} fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2.25a5.75 5.75 0 0 0-3.5 10.3c.75.58 1.08.95 1.2 1.2h4.6c.12-.25.45-.62 1.2-1.2A5.75 5.75 0 0 0 8 2.25Z" /><path d="M6.25 15h3.5M6.5 10.25h3" /></svg>;
  if (tone === "issue") return <svg aria-hidden viewBox="0 0 16 16" className={`${common} text-red-300`} fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2.25 14 13H2L8 2.25Z" /><path d="M8 5.75v3.5M8 11.25h.01" /></svg>;
  return <svg aria-hidden viewBox="0 0 16 16" className={`${common} text-emerald-300`} fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m3 8.25 3.1 3L13 4.75" /></svg>;
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
      <div className="mt-3 space-y-2.5">
        {verbose && <p className="border-b border-border pb-2 text-[10px] font-medium uppercase tracking-wider text-muted">Reasoning and activity</p>}
        {timelineEvents.map((event, index) => {
          const item = activityPresentation(event);
          const label = item.tone === "intent" ? "Thinking" : item.tone === "tool" ? "Tool" : item.tone === "issue" ? "Issue" : "Activity";
          const textClass = item.tone === "intent" ? "text-blue-100" : item.tone === "tool" ? "text-pink-100" : item.tone === "issue" ? "text-red-200" : "text-emerald-100";
          const detailClass = item.tone === "intent" ? "text-blue-200/70" : item.tone === "tool" ? "text-pink-200/70" : item.tone === "issue" ? "text-red-200/70" : "text-emerald-200/70";
          if (item.tone === "tool") return <details key={index} aria-label={`${label}: ${item.title}`} className="group text-xs leading-5">
            <summary className={`flex cursor-pointer list-none items-center gap-2 ${textClass}`}>
              <ActivityGlyph tone={item.tone} />
              <span className="font-medium">{item.title}</span>
              {item.actor && <span className="text-[10px] text-muted">{item.actor}</span>}
              <span className="ml-auto text-[10px] text-muted transition-transform group-open:rotate-90">›</span>
            </summary>
            {item.command && <pre className="ml-5 mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words border-l border-pink-300/35 pl-3 font-mono text-[11px] text-pink-100/75">{item.command}</pre>}
            {!item.command && item.detail && <p className={`ml-5 mt-0.5 ${detailClass}`}>{item.detail}</p>}
          </details>;
          return <article key={index} aria-label={`${label}: ${item.title}`} className="flex gap-2 text-xs leading-5">
            <ActivityGlyph tone={item.tone} />
            <div className="min-w-0">
              <p className={`break-words ${textClass}`}>{item.title}{item.actor && <span className="ml-1.5 text-[10px] text-muted">{item.actor}</span>}</p>
              {(verbose || item.tone === "issue") && item.detail && item.detail !== item.title && <p className={`mt-0.5 break-words ${detailClass}`}>{item.detail}</p>}
            </div>
          </article>;
        })}
      </div>
    )}
    {active && quietFor >= 12 && <p role="status" className="mt-2 text-xs text-muted">Still waiting on the current operation · {elapsedLabel(quietFor)} since the last update</p>}
  </section>;
}
