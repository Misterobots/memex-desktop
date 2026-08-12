import { useEffect, useState } from "react";
import { desktop }               from "../../lib/desktop";
import type { ArtifactRecord }   from "../../lib/desktop";
import type { RunRecord, RunEvent, RunEventType } from "../../types/memex";
import { AgentGraph } from "./AgentGraph";
import { ArtifactViewer } from "../artifacts/ArtifactViewer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function duration(start: string, end?: string): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const EVENT_ICON: Record<RunEventType, string> = {
  message_chunk:  "▸",
  tool_call:      "⚙",
  permission:     "🔐",
  memory_read:    "🧠",
  memory_write:   "✏",
  file_write:     "📄",
  error:          "✕",
  done:           "✓",
};

const EVENT_COLOR: Record<RunEventType, string> = {
  message_chunk:  "text-text/50",
  tool_call:      "text-accent",
  permission:     "text-yellow-400",
  memory_read:    "text-purple-400",
  memory_write:   "text-purple-400",
  file_write:     "text-blue-400",
  error:          "text-red-400",
  done:           "text-green-400",
};

const STATUS_COLOR: Record<string, string> = {
  running:   "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
  done:      "bg-green-400/20  text-green-300  border-green-400/30",
  error:     "bg-red-400/20    text-red-300    border-red-400/30",
  cancelled: "bg-muted/20      text-muted      border-border/40",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  runId: string;
  onClose: () => void;
}

export function RunInspectorPanel({ runId, onClose }: Props) {
  const [run,       setRun]       = useState<RunRecord | null>(null);
  const [events,    setEvents]    = useState<RunEvent[]>([]);
  const [artifs,    setArtifs]    = useState<ArtifactRecord[]>([]);
  const [tab,       setTab]       = useState<"timeline" | "graph" | "payload" | "artifacts">("timeline");
  const [viewing,   setViewing]   = useState<ArtifactRecord | null>(null);

  const bridge = desktop();

  useEffect(() => {
    if (!bridge) return;

    let cancelled = false;

    const load = async () => {
      const [recent, evts, arts] = await Promise.all([
        bridge.runs.getRecent(200),
        bridge.runs.getEvents(runId),
        bridge.artifacts?.forRun(runId) ?? Promise.resolve([]),
      ]);
      if (cancelled) return;
      const found = recent.find((r) => r.id === runId) ?? null;
      setRun(found);
      setEvents(evts);
      setArtifs(arts);
    };

    load();

    // Poll while run is still in progress
    const interval = setInterval(async () => {
      const evts = await bridge.runs.getEvents(runId);
      if (cancelled) return;
      setEvents(evts);
      const recent = await bridge.runs.getRecent(200);
      if (cancelled) return;
      const found = recent.find((r) => r.id === runId) ?? null;
      setRun(found);
      if (found?.status !== "running") clearInterval(interval);
    }, 2000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [runId]);

  // Count events by type
  const counts: Partial<Record<RunEventType, number>> = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  const toolCalls   = counts.tool_call   ?? 0;
  const fileWrites  = counts.file_write  ?? 0;
  const permissions = counts.permission  ?? 0;
  const memReads    = counts.memory_read ?? 0;
  const memWrites   = counts.memory_write ?? 0;
  const errors      = counts.error       ?? 0;

  return (
    <div className="flex flex-col h-full w-full md:w-80 border-l border-border/40 bg-canvas flex-shrink-0">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Run Inspector</span>
          {run && (
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border
              ${STATUS_COLOR[run.status] ?? STATUS_COLOR.cancelled}`}>
              {run.status}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-muted hover:text-text p-0.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      {!run ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">
          {bridge ? "Loading…" : "Runs only available in Memex Desktop"}
        </div>
      ) : (
        <>
          {/* Run metadata */}
          <div className="px-4 py-3 border-b border-border/40 space-y-1 flex-shrink-0">
            <div className="text-xs text-muted font-mono truncate" title={run.id}>{run.id.slice(0, 24)}…</div>
            <div className="text-xs text-text/80 truncate">{run.message || "—"}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
              {[
                ["Mode",    run.mode],
                ["Model",   run.model],
                ["Profile", run.profile],
                ["Started", fmt(run.startedAt)],
                ["Duration", duration(run.startedAt, run.endedAt)],
                ["Events",  String(run.eventCount)],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-[11px] text-muted min-w-[52px]">{k}</span>
                  <span className="text-[11px] text-text/80 truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats chips */}
          {(toolCalls + fileWrites + permissions + memReads + memWrites + errors) > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border/40 flex-shrink-0">
              {toolCalls   > 0 && <Chip label={`${toolCalls} tool`}       color="text-accent" />}
              {fileWrites  > 0 && <Chip label={`${fileWrites} write`}     color="text-blue-400" />}
              {permissions > 0 && <Chip label={`${permissions} perm`}     color="text-yellow-400" />}
              {memReads    > 0 && <Chip label={`${memReads} mem↑`}        color="text-purple-400" />}
              {memWrites   > 0 && <Chip label={`${memWrites} mem↓`}       color="text-purple-400" />}
              {errors      > 0 && <Chip label={`${errors} error`}         color="text-red-400" />}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex border-b border-border/40 flex-shrink-0">
            {(["timeline", "graph", "artifacts", "payload"] as const).map((t) => (
              <button key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-[11px] capitalize transition-colors
                  ${tab === t ? "text-accent border-b border-accent" : "text-muted hover:text-text"}`}
              >
                {t}{t === "artifacts" && artifs.length > 0 ? ` (${artifs.length})` : ""}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {tab === "timeline" && (
              <ol className="py-2">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-2 px-4 py-1.5 hover:bg-surface2/20 group">
                    <span className={`w-4 text-center flex-shrink-0 text-xs mt-0.5 ${EVENT_COLOR[e.type] ?? "text-muted"}`}>
                      {EVENT_ICON[e.type] ?? "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-text/80">{e.type.replace("_", " ")}</span>
                        <span className="text-[10px] text-muted ml-auto">{fmt(e.ts)}</span>
                      </div>
                      <EventSummary event={e} />
                    </div>
                  </li>
                ))}
                {events.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-muted">No events recorded</li>
                )}
              </ol>
            )}
            {tab === "graph" && (
              <AgentGraph events={events} />
            )}
            {tab === "artifacts" && (
              <div className="py-2">
                {artifs.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted">No artifacts for this run</p>
                ) : (
                  artifs.map((a) => <ArtifactRow key={a.id} artifact={a} onView={() => setViewing(a)} />)
                )}
              </div>
            )}
            {tab === "payload" && (
              <div className="p-4">
                <pre className="text-[10px] text-text/70 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(run, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      )}

      {viewing && <ArtifactViewer artifact={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-current/20 bg-current/10 ${color}`}>
      {label}
    </span>
  );
}

const ARTIFACT_ICON: Record<string, string> = {
  file: "📄", diff: "±", diagram: "⬡", report: "📋", log: "📜", image: "🖼",
};

function ArtifactRow({ artifact: a, onView }: { artifact: ArtifactRecord; onView: () => void }) {
  const bridge = desktop();
  const label = a.path ? a.path.split(/[/\\]/).pop() ?? a.name : a.name;
  const meta = [
    a.type,
    a.sizeBytes ? `${(a.sizeBytes / 1024).toFixed(1)} KB` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start gap-2 px-4 py-2 hover:bg-surface2/20 group">
      <span className="text-base flex-shrink-0 mt-0.5">{ARTIFACT_ICON[a.type] ?? "📦"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text/80 truncate font-medium">{label}</div>
        <div className="text-[10px] text-muted">{meta}</div>
        <div className="flex gap-3 mt-0.5">
          {a.content && (
            <button onClick={onView} className="text-[10px] text-accent hover:underline">View</button>
          )}
          {a.path && (
            <button
              onClick={() => bridge?.shell.openExternal(`file://${a.path}`)}
              className="text-[10px] text-accent hover:underline"
            >Open file</button>
          )}
        </div>
      </div>
    </div>
  );
}

function EventSummary({ event }: { event: RunEvent }) {
  const p = event.payload;
  if (!p || Object.keys(p).length === 0) return null;

  const summary =
    event.type === "tool_call"     ? (p.name    as string | undefined)?.slice(0, 40) :
    event.type === "file_write"    ? (p.path    as string | undefined)?.slice(-40) :
    event.type === "error"         ? (p.message as string | undefined)?.slice(0, 60) :
    event.type === "permission"    ? `${p.action} — ${(p.subject as string)?.slice(-30)}` :
    event.type === "memory_read"   ? `"${(p.query as string)?.slice(0, 40)}"` :
    event.type === "memory_write"  ? `${(p.content as string)?.slice(0, 40)}` :
    null;

  if (!summary) return null;
  return <div className="text-[10px] text-muted truncate">{summary}</div>;
}
