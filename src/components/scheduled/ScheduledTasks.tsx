import { useEffect, useState } from "react";
import {
  listTriggers, createTrigger, pauseTrigger, resumeTrigger, deleteTrigger,
  type Trigger, type TriggerType,
} from "../../lib/trigger-api";

/**
 * Settings section for the Agent_Swarm trigger scheduler (agents/trigger_scheduler.py).
 * Only creates task_config-based triggers — the kind that fires a chat_swarm() call
 * and survives a backend restart. See trigger_scheduler.py for why that's the only
 * trigger kind the REST API can create at all (a raw Python handler isn't JSON-able).
 */

function fmtTimestamp(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function scheduleSummary(t: Trigger): string {
  if (t.trigger_type === "cron") {
    const h = t.cron?.hour, m = t.cron?.minute, d = t.cron?.day_of_week;
    const time = h != null && m != null ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : "every hour/min it matches";
    const day = d != null ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d] : "every day";
    return `${day} at ${time}`;
  }
  if (t.trigger_type === "interval") return `every ${t.interval_seconds ?? "?"}s`;
  if (t.trigger_type === "once") return `once at ${fmtTimestamp(t.fire_at)}`;
  return "";
}

const STATE_COLOR: Record<string, string> = {
  active: "border-accent/30 text-accent",
  paused: "border-border/50 text-muted",
  fired:  "border-green-400/30 text-green-400",
  failed: "border-red-400/30 text-red-400",
};

function NewTriggerForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<TriggerType>("cron");
  const [hour, setHour] = useState("8");
  const [minute, setMinute] = useState("0");
  const [intervalSeconds, setIntervalSeconds] = useState("3600");
  const [delaySeconds, setDelaySeconds] = useState("60");
  const [swarmMode, setSwarmMode] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !prompt.trim()) { setError("Name and prompt are required"); return; }
    setError("");
    setSaving(true);
    const body =
      type === "cron"     ? { name, trigger_type: type, task_config: { prompt, swarm_mode: swarmMode }, cron: { hour: +hour, minute: +minute } } :
      type === "interval" ? { name, trigger_type: type, task_config: { prompt, swarm_mode: swarmMode }, interval_seconds: +intervalSeconds } :
                             { name, trigger_type: type, task_config: { prompt, swarm_mode: swarmMode }, delay_seconds: +delaySeconds };
    const result = await createTrigger(body);
    setSaving(false);
    if (result.trigger) {
      onCreated();
    } else {
      setError(result.status === 0 ? "Could not reach agent runtime" : `Failed (HTTP ${result.status})`);
    }
  };

  return (
    <div className="space-y-2 p-3 border border-accent/30 rounded-lg bg-surface2/40">
      <input
        value={name} onChange={(e) => setName(e.target.value)} placeholder="Task name"
        className="w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/60"
      />
      <textarea
        value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt to run when this fires…"
        rows={2}
        className="w-full px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm text-text resize-none focus:outline-none focus:ring-1 focus:ring-accent/60"
      />
      <div className="flex gap-2">
        {(["cron", "interval", "once"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`px-2.5 py-1 rounded-lg text-xs border capitalize transition-colors
              ${type === t ? "border-accent/50 bg-accent/10 text-accent" : "border-border/40 text-muted hover:text-text"}`}
          >{t === "cron" ? "Daily" : t === "interval" ? "Repeating" : "One-time"}</button>
        ))}
      </div>

      {type === "cron" && (
        <div className="flex items-center gap-2 text-sm text-text/80">
          <span>At</span>
          <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(e.target.value)}
            className="w-14 px-2 py-1 rounded-lg bg-surface2 border border-border/60 text-sm text-center" />
          <span>:</span>
          <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(e.target.value)}
            className="w-14 px-2 py-1 rounded-lg bg-surface2 border border-border/60 text-sm text-center" />
          <span className="text-muted text-xs">every day</span>
        </div>
      )}
      {type === "interval" && (
        <div className="flex items-center gap-2 text-sm text-text/80">
          <span>Every</span>
          <input type="number" min={5} value={intervalSeconds} onChange={(e) => setIntervalSeconds(e.target.value)}
            className="w-24 px-2 py-1 rounded-lg bg-surface2 border border-border/60 text-sm" />
          <span className="text-muted text-xs">seconds</span>
        </div>
      )}
      {type === "once" && (
        <div className="flex items-center gap-2 text-sm text-text/80">
          <span>In</span>
          <input type="number" min={1} value={delaySeconds} onChange={(e) => setDelaySeconds(e.target.value)}
            className="w-24 px-2 py-1 rounded-lg bg-surface2 border border-border/60 text-sm" />
          <span className="text-muted text-xs">seconds from now</span>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={swarmMode} onChange={(e) => setSwarmMode(e.target.checked)} />
        Run in Swarm mode
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleCreate} disabled={saving}
          className="px-3 py-1 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 disabled:opacity-50"
        >{saving ? "Creating…" : "Create"}</button>
        <button onClick={onCancel} className="px-3 py-1 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ScheduledTasks() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const list = await listTriggers();
    setTriggers(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (t: Trigger) => {
    const ok = t.state === "active" ? await pauseTrigger(t.trigger_id) : await resumeTrigger(t.trigger_id);
    if (ok) load();
  };

  const handleDelete = async (id: string) => {
    if (await deleteTrigger(id)) load();
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Runs a saved prompt on a schedule via Agent_Swarm's trigger scheduler. Restarting the
        backend does not lose these — they're restored from disk on startup.
      </p>

      {loading && <p className="text-xs text-muted">Loading…</p>}

      {!loading && triggers.length === 0 && !creating && (
        <p className="text-xs text-muted py-2">
          No scheduled tasks yet. If you expect some and this stays empty, check the
          active Routing profile's Agent Runtime URL is reachable.
        </p>
      )}

      <div className="space-y-2">
        {triggers.map((t) => (
          <div key={t.trigger_id}
            className="flex items-start gap-3 px-3 py-2 rounded-lg border border-border/40 bg-surface2/40"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text truncate">{t.name}</span>
                <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${STATE_COLOR[t.state] ?? ""}`}>
                  {t.state}
                </span>
              </div>
              <div className="text-xs text-muted">{scheduleSummary(t)}</div>
              {t.task_config?.prompt && (
                <div className="text-xs text-text/60 truncate mt-0.5">"{t.task_config.prompt}"</div>
              )}
              <div className="text-[10px] text-muted mt-0.5">
                Fired {t.fire_count}× · last {fmtTimestamp(t.last_fired)}
                {t.last_error && <span className="text-red-400"> · error: {t.last_error.slice(0, 60)}</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {(t.state === "active" || t.state === "paused") && (
                <button onClick={() => handleToggle(t)} className="text-xs text-muted hover:text-text px-2 py-1">
                  {t.state === "active" ? "Pause" : "Resume"}
                </button>
              )}
              <button onClick={() => handleDelete(t.trigger_id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating ? (
        <NewTriggerForm onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} className="text-sm text-accent hover:text-accent/80">
          + New scheduled task
        </button>
      )}
    </div>
  );
}
