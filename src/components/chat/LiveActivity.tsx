import { useEffect, useState } from "react";
import type { MessageEvent } from "../../types/memex";

function elapsedLabel(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Honest, stream-backed progress surface. Never invents activities not sent by the runtime. */
export function LiveActivity({ events, active, waiting, verbose = false }: { events: MessageEvent[]; active: boolean; waiting: boolean; verbose?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const milestones = events.filter((event) => event.type === "status" || event.type === "log" || event.type === "thought" || event.type === "tool_call_start" || event.type === "tool_call_result");
  const latest = milestones.at(-1)?.content || (waiting ? "Request sent — waiting for the model to begin." : "Working on your request…");
  const history = milestones.slice(-12, -1).reverse();
  const lastReceipt = milestones.at(-1)?.receivedAt;
  const quietFor = lastReceipt ? Math.max(0, Math.floor((Date.now() - lastReceipt) / 1000)) : seconds;
  const isQuiet = active && quietFor >= 12;

  const eventTone = (event: MessageEvent) => event.type === "thought"
    ? "text-purple-300"
    : event.type === "log" ? "text-blue-300"
    : event.type.startsWith("tool_call") ? "text-amber-300" : "text-text/80";
  const eventLabel = (event: MessageEvent) => event.type === "thought" ? "Decision"
    : event.type === "log" ? "System" : event.type.startsWith("tool_call") ? "Tool" : "Stage";

  if (!active && milestones.length === 0) return null;
  return <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><span className={`w-2 h-2 rounded-full bg-accent ${active ? "status-dot-active" : ""}`} /><span className="text-xs font-semibold text-text">Live execution</span><span className="text-[10px] text-muted">{milestones.length} server event{milestones.length === 1 ? "" : "s"}</span></div>{active && <span className="text-[10px] text-muted tabular-nums flex-shrink-0">{elapsedLabel(seconds)}</span>}</div>
    <p className="mt-2 text-xs leading-5 text-text break-words">{active ? latest : "Activity complete"}</p>
    {isQuiet && <p className="mt-1 text-[11px] leading-4 text-amber-300">No new server event for {elapsedLabel(quietFor)} — the request is still open and waiting on the active operation.</p>}
    {verbose && history.length > 0 && <div className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto border-l border-border/50 pl-2.5">{history.map((event, index) => <div key={`${event.receivedAt ?? 0}-${index}`} className="grid grid-cols-[46px_1fr] gap-2 text-[11px] leading-4"><span className="text-muted">{eventLabel(event)}</span><span className={`${eventTone(event)} break-words`}>{event.content}</span></div>)}</div>}
  </div>;
}
