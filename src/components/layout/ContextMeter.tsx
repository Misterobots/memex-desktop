import { useEffect, useRef, useState } from "react";
import { useStore } from "../../lib/store";
import { contextWindowFor, fmtTokens } from "../../lib/tokens";
import { getAgentRuntime } from "../../lib/runtime-urls";
import { pushSession } from "../../lib/conv-sync";
import type { ChatMessage } from "../../types/memex";

/**
 * Compact context-window indicator for the composer.
 * Shows how full the model's context is, and on tap offers a one-click
 * compaction (POST /v1/chat/compact) that summarizes earlier turns and keeps
 * the last 3 — important on mobile where long threads fill the window fast.
 */
export function ContextMeter() {
  const { activeSession, selectedModel, replaceMessages } = useStore();
  const [win, setWin]   = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    contextWindowFor(selectedModel).then((w) => { if (alive) setWin(w); });
    return () => { alive = false; };
  }, [selectedModel]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const session = activeSession();
  // Latest turn's prompt size ≈ current context occupancy.
  const used = [...(session?.messages ?? [])].reverse().find((m) => m.usage)?.usage?.promptTokens ?? 0;

  if (!win || used === 0) return null;

  const pct  = Math.min(100, (used / win) * 100);
  const warn = pct >= 80;
  const canCompact = (session?.messages.length ?? 0) > 6;

  const compact = async () => {
    if (!session || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`${getAgentRuntime()}/v1/chat/compact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: session.messages.map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel,
        }),
        signal: AbortSignal.timeout(70000),
      });
      const data = await r.json();
      if (data?.compacted && typeof data.summary === "string") {
        // Keep the real last-3 ChatMessages (their events/usage) and prepend a
        // visible summary note so the user sees that compaction happened.
        const summaryMsg: ChatMessage = {
          id: `msg-${Date.now()}-compact`,
          role: "assistant",
          content: `🗜️ **Context compacted.** ${data.summary}`,
          events: [],
          timestamp: Date.now(),
          mode: "chat",
        };
        replaceMessages(session.id, [summaryMsg, ...session.messages.slice(-3)]);
        const updated = useStore.getState().sessions.find((x) => x.id === session.id);
        if (updated) pushSession(updated);
        setOpen(false);
      } else {
        setNote("Not enough history to compact yet.");
      }
    } catch (e: any) {
      setNote(e?.name === "TimeoutError" ? "Compaction timed out." : "Compaction failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface2/60 rounded-md transition-colors"
        title={`Context: ${used.toLocaleString()} / ${win.toLocaleString()} tokens (${pct.toFixed(0)}%) — tap to compact`}
      >
        <span className="relative inline-block w-10 h-1 rounded-full bg-surface2 overflow-hidden">
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${warn ? "bg-yellow" : "bg-accent"}`}
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </span>
        <span className="font-mono">{fmtTokens(used)}/{fmtTokens(win)}</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-60 bg-canvas border border-border/60 rounded-xl shadow-2xl z-50 p-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Context window</div>
          <div className="text-xs text-text/80 mb-2">
            {used.toLocaleString()} / {win.toLocaleString()} tokens ({pct.toFixed(0)}%)
          </div>
          <p className="text-[11px] text-muted mb-2 leading-relaxed">
            Summarize earlier messages into a short note and keep the last 3 turns, freeing
            context for longer conversations.
          </p>
          <button
            onClick={compact}
            disabled={busy || !canCompact}
            className="w-full px-3 py-1.5 text-xs rounded-lg bg-accent text-canvas hover:bg-accentdim
              disabled:bg-surface2 disabled:text-faint disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Compacting…" : canCompact ? "Compact now" : "Need more than 6 messages"}
          </button>
          {note && <p className="text-[11px] text-muted mt-2">{note}</p>}
        </div>
      )}
    </div>
  );
}
