import { useState } from "react";
import { desktop } from "../../lib/desktop";

const MCP_COMMAND = "claude mcp add decomp -- decomp mcp";

/** Settings: give the agents installed on this computer decomp.wtf's tools, via decomp's own `decomp connect`. */
export function DecompConnect() {
  const bridge = desktop();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: "ok" | "missing" | "error"; output: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!bridge) return <p className="text-xs text-muted">Available in the desktop app.</p>;

  const run = async (listOnly: boolean) => {
    setBusy(true);
    try { setResult(await bridge.decomp.connect(listOnly)); }
    catch { setResult({ status: "error", output: "Could not reach the desktop service." }); }
    finally { setBusy(false); }
  };
  const copy = () => { void navigator.clipboard?.writeText(MCP_COMMAND).then(() => setCopied(true)).catch(() => setCopied(false)); };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Connect Claude Code, Codex, Antigravity CLI or opencode to decomp.wtf's tools using its own <code>decomp connect</code>. This changes those agents' configuration, not Memex's.</p>
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void run(true)} className="text-xs px-2 py-1 rounded-lg border border-border/60 text-muted hover:text-text disabled:opacity-40">Check status</button>
        <button disabled={busy} onClick={() => void run(false)} className="text-xs px-2 py-1 rounded-lg border border-border/60 text-text hover:bg-surface2 disabled:opacity-40">Connect agents</button>
      </div>
      {result?.status === "missing" && <p className="text-xs text-yellow">decomp.wtf isn't installed. <button className="underline" onClick={() => void bridge.decomp.installPage()}>Install it first</button>.</p>}
      {result && result.status !== "missing" && <pre className={`max-h-40 overflow-auto rounded-lg bg-canvas p-2 text-[10px] ${result.status === "error" ? "text-red-300" : "text-muted"}`}>{result.output || "(no output)"}</pre>}
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <code className="flex-1 truncate rounded bg-canvas px-2 py-1">{MCP_COMMAND}</code>
        <button onClick={copy} className="px-2 py-1 rounded border border-border/60 hover:text-text">{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}
