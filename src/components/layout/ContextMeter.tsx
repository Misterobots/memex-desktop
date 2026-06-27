import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { contextWindowFor, fmtTokens } from "../../lib/tokens";

/**
 * Compact context-window indicator for the composer.
 * Shows how full the model's context is, using the most recent turn's
 * prompt token count (what was actually sent) against the model's max window.
 */
export function ContextMeter() {
  const { activeSession, selectedModel } = useStore();
  const [win, setWin] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    contextWindowFor(selectedModel).then((w) => { if (alive) setWin(w); });
    return () => { alive = false; };
  }, [selectedModel]);

  const session = activeSession();
  // Latest turn's prompt size ≈ current context occupancy.
  const used = [...(session?.messages ?? [])].reverse().find((m) => m.usage)?.usage?.promptTokens ?? 0;

  if (!win || used === 0) return null;

  const pct  = Math.min(100, (used / win) * 100);
  const warn = pct >= 80;

  return (
    <span
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted"
      title={`Context: ${used.toLocaleString()} / ${win.toLocaleString()} tokens (${pct.toFixed(0)}%)`}
    >
      <span className="relative inline-block w-10 h-1 rounded-full bg-surface2 overflow-hidden">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${warn ? "bg-yellow" : "bg-accent"}`}
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </span>
      <span className="font-mono">{fmtTokens(used)}/{fmtTokens(win)}</span>
    </span>
  );
}
