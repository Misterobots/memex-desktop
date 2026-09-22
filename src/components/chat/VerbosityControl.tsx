import { defaultRunPreferences, sessionScopeKey, useStore } from "../../lib/store";
import { pushSession } from "../../lib/conv-sync";
import type { ChatDisplayMode, ExperienceId, OutputDetail, ReasoningEffort, ReasoningSummary } from "../../types/memex";

export function VerbosityControl({ experience, workspaceKey }: { experience: ExperienceId; workspaceKey?: string }) {
  const { activeSession, workspaceDisplayModes, setWorkspaceDisplayMode } = useStore();
  const mode = workspaceDisplayModes[sessionScopeKey(experience, workspaceKey)]
    ?? activeSession(experience, workspaceKey)?.displayMode ?? "normal";
  return <label className="flex items-center gap-2 text-xs text-muted">
    Verbosity
    <select aria-label="Workspace verbosity" value={mode}
      title="Controls activity detail; outputs remain available at every level."
      className="rounded-md border border-border/60 bg-surface px-2 py-1 text-text"
      onChange={(event) => {
        setWorkspaceDisplayMode(experience, workspaceKey, event.target.value as ChatDisplayMode);
        const session = useStore.getState().activeSession(experience, workspaceKey);
        if (session) pushSession(session);
      }}>
      <option value="summary">Brief</option>
      <option value="normal">Standard</option>
      <option value="thought">Detailed</option>
    </select>
  </label>;
}

/** Compact per-workspace controls for response depth and the visible work trace. */
export function RunControls({ experience, workspaceKey }: { experience: ExperienceId; workspaceKey?: string }) {
  const { workspaceRunPreferences, setWorkspaceRunPreferences, setWorkspaceDisplayMode } = useStore();
  const preferences = workspaceRunPreferences[sessionScopeKey(experience, workspaceKey)] ?? defaultRunPreferences;
  const updateSummary = (reasoningSummary: ReasoningSummary) => {
    setWorkspaceRunPreferences(experience, workspaceKey, { reasoningSummary });
    const displayMode: ChatDisplayMode = reasoningSummary === "detailed" ? "thought"
      : reasoningSummary === "concise" ? "summary"
      : reasoningSummary === "none" ? "none" : "normal";
    setWorkspaceDisplayMode(experience, workspaceKey, displayMode);
  };
  return <details className="relative">
    <summary className="list-none cursor-pointer rounded-md border border-border/60 bg-surface px-2 py-1 text-xs text-muted hover:text-text">Run controls</summary>
    <div className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-border/70 bg-canvas p-3 shadow-2xl">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">This workspace</p>
      <label className="mb-2 flex items-center justify-between gap-3 text-xs text-text">Output detail
        <select aria-label="Output detail" value={preferences.outputDetail} className="rounded-md border border-border/60 bg-surface px-2 py-1 text-text" onChange={(event) => setWorkspaceRunPreferences(experience, workspaceKey, { outputDetail: event.target.value as OutputDetail })}>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
      <label className="mb-2 flex items-center justify-between gap-3 text-xs text-text">Reasoning summary
        <select aria-label="Reasoning summary" value={preferences.reasoningSummary} className="rounded-md border border-border/60 bg-surface px-2 py-1 text-text" onChange={(event) => updateSummary(event.target.value as ReasoningSummary)}>
          <option value="auto">Auto</option><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="none">None</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-xs text-text">Reasoning effort
        <select aria-label="Reasoning effort" value={preferences.reasoningEffort} className="rounded-md border border-border/60 bg-surface px-2 py-1 text-text" onChange={(event) => setWorkspaceRunPreferences(experience, workspaceKey, { reasoningEffort: event.target.value as ReasoningEffort })}>
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </label>
      <p className="mt-3 text-[10px] leading-4 text-muted">Detailed shows the work trace. High effort may take longer.</p>
    </div>
  </details>;
}
