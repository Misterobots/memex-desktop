import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, type DecompStartResult } from "../../lib/desktop";
import { BrowserView } from "./BrowserView";

type Phase = { kind: "starting" } | { kind: "confirm" } | { kind: "setup"; log: string[] } | DecompStartResult;

/**
 * Dev pane for decomp.wtf (https://decomp.wtf). Memex starts it and shows its
 * live UI in the sandboxed native pane. On Windows, when it isn't installed,
 * Memex can set it up itself (WSL 2 + the `decomp-wtf` distro) after the user
 * confirms exactly what will happen.
 */
export function DecompView() {
  const bridge = desktop();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);

  const start = useCallback(() => { setNote(""); setPhase({ kind: "starting" }); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    bridge.decomp.start()
      .then((result) => { if (active) setPhase(result); })
      .catch(() => { if (active) setPhase({ status: "error", message: "Could not reach the desktop service." }); });
    return () => { active = false; };
  }, [bridge, attempt]);

  useEffect(() => { logEnd.current?.scrollIntoView?.({ block: "end" }); }, [phase]);

  const runSetup = async () => {
    if (!bridge) return;
    setPhase({ kind: "setup", log: [] });
    const off = bridge.decomp.onSetupProgress((line) =>
      setPhase((p) => ("kind" in p && p.kind === "setup" ? { kind: "setup", log: [...p.log.slice(-200), line] } : p)));
    try {
      const result = await bridge.decomp.setup();
      if (result.status === "ok") { start(); return; }
      if (result.status === "restart-required") { setNote(result.message); setPhase({ status: "missing", canSetup: true }); return; }
      setPhase({ status: "error", message: result.message });
    } catch {
      setPhase({ status: "error", message: "Setup could not run." });
    } finally { off(); }
  };

  if (!bridge) return null;
  if ("status" in phase && phase.status === "ready") return <BrowserView initialUrl={phase.url} lockAddress />;

  return (
    <section className="flex flex-1 min-w-0 items-center justify-center bg-canvas p-6 text-sm" aria-live="polite">
      {"kind" in phase && phase.kind === "starting" ? (
        <p className="text-muted">Starting decomp.wtf…</p>
      ) : "kind" in phase && phase.kind === "confirm" ? (
        <div className="max-w-lg space-y-3">
          <p className="text-text">Set up decomp.wtf on this computer?</p>
          <ul className="list-disc pl-5 text-xs text-muted space-y-1">
            <li>Turns on WSL 2 if needed. Windows asks for administrator permission and may need a restart.</li>
            <li>Downloads Debian's official WSL image (checked against Microsoft's SHA-256) and creates a WSL distro named <code>decomp-wtf</code>.</li>
            <li>Downloads <code>linux-base.sh</code> and <code>install.sh</code> from decomp.wtf and runs them inside that distro: system packages, then decomp.wtf (MIT) with its compilers and tools.</li>
            <li>Your decomp projects live in <code>\\wsl.localhost\decomp-wtf\home\decomp\Decomp</code>. Nothing is installed outside that distro and <code>%LOCALAPPDATA%\decomp.wtf</code>.</li>
          </ul>
          <div className="flex gap-2">
            <button onClick={() => void runSetup()} className="rounded-md bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20">Set up decomp.wtf</button>
            <button onClick={() => setPhase({ status: "missing", canSetup: true })} className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-text">Cancel</button>
          </div>
        </div>
      ) : "kind" in phase && phase.kind === "setup" ? (
        <div className="flex h-full w-full max-w-2xl flex-col gap-2">
          <p className="text-text">Setting up decomp.wtf… this can take several minutes.</p>
          <pre className="flex-1 min-h-0 overflow-auto rounded-lg bg-surface2/40 p-2 text-[10px] text-muted">{phase.log.join("\n") || "Starting…"}<div ref={logEnd} /></pre>
        </div>
      ) : "status" in phase && phase.status === "missing" ? (
        <div className="max-w-md space-y-3 text-center">
          <p className="text-text">decomp.wtf isn't installed on this computer.</p>
          <p className="text-muted text-xs">It decompiles games you own with AI agents, compiling each attempt with the original compiler and checking it byte for byte.</p>
          {note && <p className="text-xs text-yellow">{note}</p>}
          <div className="flex justify-center gap-2">
            {phase.canSetup
              ? <button onClick={() => setPhase({ kind: "confirm" })} className="rounded-md bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20">Set up decomp.wtf</button>
              : <button onClick={() => void bridge.decomp.installPage()} className="rounded-md bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20">Install decomp.wtf</button>}
            <button onClick={start} className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-text">Retry</button>
          </div>
        </div>
      ) : (
        <div className="max-w-md space-y-3 text-center">
          <p className="text-red-300">{"status" in phase && phase.status === "error" ? phase.message : ""}</p>
          <button onClick={start} className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-text">Retry</button>
        </div>
      )}
    </section>
  );
}
