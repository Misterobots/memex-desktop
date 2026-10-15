import { useCallback, useEffect, useState } from "react";
import { desktop, type DecompStartResult } from "../../lib/desktop";
import { BrowserView } from "./BrowserView";

type Phase = { kind: "starting" } | DecompStartResult;

/**
 * Dev pane for decomp.wtf (https://decomp.wtf), a separately installed local
 * app. Memex starts it through the user's `decomp` command and shows its live
 * UI in the sandboxed native pane; it never installs anything itself.
 */
export function DecompView() {
  const bridge = desktop();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" } as Phase);
  const [attempt, setAttempt] = useState(0);

  const start = useCallback(() => { setPhase({ kind: "starting" } as Phase); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge.decomp.start()
      .then((result) => { if (active) setPhase(result); })
      .catch(() => { if (active) setPhase({ status: "error", message: "Could not reach the desktop service." }); });
    return () => { active = false; };
  }, [bridge, attempt]);

  if (!bridge) return null;
  if ("status" in phase && phase.status === "ready") return <BrowserView initialUrl={phase.url} lockAddress />;

  return (
    <section className="flex flex-1 min-w-0 items-center justify-center bg-canvas p-6 text-sm" aria-live="polite">
      {"kind" in phase ? (
        <p className="text-muted">Starting decomp.wtf…</p>
      ) : phase.status === "missing" ? (
        <div className="max-w-md space-y-3 text-center">
          <p className="text-text">decomp.wtf isn't installed on this computer.</p>
          <p className="text-muted text-xs">It decompiles games you own with AI agents, compiling each attempt with the original compiler and checking it byte for byte. Memex doesn't install it for you: follow the official installer, then come back and retry.</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => void bridge.decomp.installPage()} className="rounded-md bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20">Install decomp.wtf</button>
            <button onClick={start} className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-text">Retry</button>
          </div>
        </div>
      ) : (
        <div className="max-w-md space-y-3 text-center">
          <p className="text-red-300">{phase.status === "error" ? phase.message : ""}</p>
          <button onClick={start} className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-text">Retry</button>
        </div>
      )}
    </section>
  );
}
