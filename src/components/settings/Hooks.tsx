import { useEffect, useState } from "react";
import { desktop, type Hook, type HookEvent } from "../../lib/desktop";

/**
 * Settings section for event-triggered local shell commands. `enabled` here
 * is only the first of two gates — the actual first-fire approval dialog
 * (Allow once / Always allow / Deny) happens in the main process
 * (electron/hooks-runner.ts) the moment a hook actually fires, not here.
 * This UI only ever sets `enabled`; it can't grant `approved`.
 */

const EVENT_LABEL: Record<HookEvent, string> = {
  "run:start": "When a run starts",
  "run:end":   "When a run finishes",
};

function NewHookForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const bridge = desktop();
  const [name, setName]     = useState("");
  const [event, setEvent]   = useState<HookEvent>("run:end");
  const [command, setCommand] = useState("");
  const [cwd, setCwd]       = useState("");
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !command.trim()) { setError("Name and command are required"); return; }
    setError("");
    setSaving(true);
    try {
      await bridge?.hooks.save({ name: name.trim(), event, command: command.trim(), cwd: cwd.trim() || undefined, enabled: true });
      onCreated();
    } catch {
      setError("Could not save the hook.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 p-3 border border-accent/30 rounded-lg bg-surface2/40">
      <input
        value={name} onChange={(e) => setName(e.target.value)} placeholder="Hook name"
        className="w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/60"
      />
      <div className="flex gap-2">
        {(["run:start", "run:end"] as const).map((ev) => (
          <button key={ev} onClick={() => setEvent(ev)}
            className={`px-2.5 py-1 rounded-lg text-xs border transition-colors
              ${event === ev ? "border-accent/50 bg-accent/10 text-accent" : "border-border/40 text-muted hover:text-text"}`}
          >{EVENT_LABEL[ev]}</button>
        ))}
      </div>
      <input
        value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Command to run"
        className="w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text font-mono focus:outline-none focus:ring-1 focus:ring-accent/60"
      />
      <input
        value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="Working directory (optional)"
        className="w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text font-mono focus:outline-none focus:ring-1 focus:ring-accent/60"
      />

      <p className="text-[11px] text-muted">
        You'll be asked to approve the exact command the first time this hook actually fires.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleCreate} disabled={saving}
          className="px-3 py-1 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 disabled:opacity-50"
        >{saving ? "Saving…" : "Create"}</button>
        <button onClick={onCancel} className="px-3 py-1 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Hooks() {
  const bridge = desktop();
  const [hooks, setHooks]   = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const list = await bridge?.hooks.getAll();
    setHooks(list ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (h: Hook) => {
    await bridge?.hooks.save({ ...h, enabled: !h.enabled });
    load();
  };

  const handleDelete = async (id: string) => {
    await bridge?.hooks.delete(id);
    load();
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Run a local shell command on an app event. Enabling a hook here doesn't let it run
        unattended by itself — the first time it actually fires, you'll get a one-time approval
        prompt with the exact command, separate from this toggle.
      </p>

      {loading && <p className="text-xs text-muted">Loading…</p>}

      {!loading && hooks.length === 0 && !creating && (
        <p className="text-xs text-muted py-2">No hooks yet.</p>
      )}

      <div className="space-y-2">
        {hooks.map((h) => (
          <div key={h.id}
            className="flex items-start gap-3 px-3 py-2 rounded-lg border border-border/40 bg-surface2/40"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text truncate">{h.name}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border/50 text-muted">
                  {EVENT_LABEL[h.event]}
                </span>
                {h.approved && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-green-400/30 text-green-400">
                    Approved
                  </span>
                )}
              </div>
              <div className="text-xs text-text/60 font-mono truncate mt-0.5">{h.command}</div>
              {h.cwd && <div className="text-[10px] text-muted truncate">in {h.cwd}</div>}
            </div>
            <div className="flex gap-2 flex-shrink-0 items-center">
              <button onClick={() => handleToggle(h)} className="text-xs text-muted hover:text-text px-2 py-1">
                {h.enabled ? "Disable" : "Enable"}
              </button>
              <button onClick={() => handleDelete(h.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <NewHookForm onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} className="text-sm text-accent hover:text-accent/80">
          + New hook
        </button>
      )}
    </div>
  );
}
