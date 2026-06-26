import { useCallback, useEffect, useRef, useState } from "react";
import { desktop } from "../../lib/desktop";
import type { PermissionMode } from "../../lib/desktop";

const MODE_LABEL: Record<PermissionMode, string> = {
  trusted:   "Trusted",
  workspace: "Workspace",
  ask:       "Ask",
};

const MODE_DESC: Record<PermissionMode, string> = {
  trusted:   "All operations allowed without prompting",
  workspace: "Operations inside workspace roots allowed; outside prompts",
  ask:       "Every file, shell, and terminal operation requires approval",
};

const MODE_COLOR: Record<PermissionMode, string> = {
  trusted:   "text-green-400  border-green-400/40  bg-green-400/10",
  workspace: "text-accent     border-accent/40     bg-accent/10",
  ask:       "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
};

const MODES: PermissionMode[] = ["trusted", "workspace", "ask"];

export function WorkspaceSafetyBadge() {
  const bridge = desktop();
  const [mode,    setMode]    = useState<PermissionMode>("workspace");
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bridge?.workspace.getPolicy().then((p) => setMode(p.mode as PermissionMode));
  }, [bridge]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = useCallback(async (m: PermissionMode) => {
    if (!bridge) return;
    setSaving(true);
    await bridge.workspace.setPolicy({ mode: m });
    setMode(m);
    setSaving(false);
    setOpen(false);
  }, [bridge]);

  if (!bridge) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        title={`Workspace mode: ${MODE_LABEL[mode]}`}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors
          ${MODE_COLOR[mode]} hover:opacity-80`}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          {mode === "trusted"   && <path d="M6 1L1 3.5v3C1 9.5 3.5 11.5 6 11.5S11 9.5 11 6.5v-3L6 1z" />}
          {mode === "workspace" && <><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></>}
          {mode === "ask"       && <><path d="M6 1L1 3.5v3C1 9.5 3.5 11.5 6 11.5S11 9.5 11 6.5v-3L6 1z" /><path d="M6 5v1.5M6 8.5h.01" strokeLinecap="round" /></>}
        </svg>
        {MODE_LABEL[mode]}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-52 bg-canvas border border-border/60 rounded-xl shadow-2xl z-50 p-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => select(m)}
              className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors
                ${m === mode ? "bg-surface2" : "hover:bg-surface2/60"}`}
            >
              <span className={`text-xs font-semibold min-w-[68px] mt-0.5 ${MODE_COLOR[m].split(" ")[0]}`}>
                {MODE_LABEL[m]}
              </span>
              <span className="text-[10px] text-muted leading-tight">{MODE_DESC[m]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
