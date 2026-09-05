import { sessionScopeKey, useStore } from "../../lib/store";
import { pushSession } from "../../lib/conv-sync";
import type { ChatDisplayMode, ExperienceId } from "../../types/memex";

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
