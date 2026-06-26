import { useCallback, useState } from "react";
import { useStore } from "../../lib/store";
import { desktop } from "../../lib/desktop";
import { buildBundle, downloadBundle } from "../../lib/export";
import type { RunRecord, RunEvent, ArtifactRecord } from "../../lib/desktop";

interface Props { onClose: () => void }

export function ExportPanel({ onClose }: Props) {
  const bridge = desktop();
  const { activeSession } = useStore();
  const session = activeSession();

  const [redact,   setRedact]   = useState(true);
  const [includeRuns, setIncludeRuns] = useState(true);
  const [includeArts, setIncludeArts] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [done,     setDone]     = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  const exportSession = useCallback(async () => {
    if (!session) return;
    setExporting(true);
    setErr(null);

    try {
      let runs:   RunRecord[] = [];
      let events: Record<string, RunEvent[]> = {};
      let artifs: ArtifactRecord[] = [];
      let profileName: string | undefined;

      if (bridge) {
        profileName = (await bridge.config.getActive()).name;
        if (includeRuns) {
          runs = await bridge.runs.getRecent(200);
          // Only keep runs for this session
          runs = runs.filter((r) => r.sessionId === session.id);
          for (const r of runs) {
            events[r.id] = await bridge.runs.getEvents(r.id);
          }
        }
        if (includeArts && bridge.artifacts) {
          artifs = await bridge.artifacts.forSession(session.id);
        }
      }

      const bundle = buildBundle({ session, runs, events, artifacts: artifs, profileName, redact });
      downloadBundle(bundle);
      setDone(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setExporting(false);
    }
  }, [session, bridge, redact, includeRuns, includeArts]);

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
        <div className="bg-canvas border border-border/60 rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-muted text-center">No active session to export.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-canvas border border-border/60 rounded-2xl w-96 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
          <span className="text-sm font-semibold text-text">Export session</span>
          <button onClick={onClose} className="text-muted hover:text-text">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-muted space-y-0.5">
            <div><span className="text-text/80">{session.messages.length}</span> messages</div>
            <div className="font-mono text-[10px] text-muted/60">{session.id}</div>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {([
              [redact,      setRedact,      "Redact secrets & paths",    "Removes API keys, tokens, and absolute paths from the bundle"],
              [includeRuns, setIncludeRuns, "Include run records",        "Append run metadata and event timelines"],
              [includeArts, setIncludeArts, "Include artifacts",          "Include artifact records (paths are redacted if redaction is on)"],
            ] as [boolean, (v: boolean) => void, string, string][]).map(([val, set, label, desc]) => (
              <label key={label} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={val}
                  onChange={(e) => set(e.target.checked)}
                  className="mt-0.5 accent-accent"
                />
                <div>
                  <div className="text-sm text-text/80">{label}</div>
                  <div className="text-[11px] text-muted">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}
          {done && <p className="text-xs text-green-400">✓ Bundle downloaded</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border/60 text-sm text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={exportSession}
              disabled={exporting}
              className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-50"
            >{exporting ? "Exporting…" : "Export JSON"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
