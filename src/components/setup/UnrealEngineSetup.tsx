import { useEffect, useState } from "react";
import { desktop, type UnrealEngineInstall } from "../../lib/desktop";

export function UnrealEngineSetup({ compact = false }: { compact?: boolean }) {
  const bridge = desktop();
  const [configured, setConfigured] = useState<UnrealEngineInstall | null>(null);
  const [detected, setDetected] = useState<UnrealEngineInstall[]>([]);
  const [status, setStatus] = useState("Scanning for Unreal Engine…");

  const scan = async () => {
    if (!bridge) return;
    setStatus("Scanning for Unreal Engine…");
    try {
      const result = await bridge.devTools.inspectUnreal();
      setConfigured(result.configured);
      setDetected(result.detected);
      setStatus(result.configured ? "Configured" : result.detected.length ? "Engine detected — choose it to configure." : "Unreal Engine is not installed yet.");
    } catch { setStatus("Could not inspect Unreal Engine on this computer."); }
  };
  useEffect(() => { void scan(); }, []); // Native scan has no renderer dependencies.

  const configure = async (root: string) => {
    if (!bridge) return;
    const install = await bridge.devTools.configureUnreal(root);
    if (!install) { setStatus("That folder does not contain UnrealEditor.exe and UnrealEditor-Cmd.exe."); return; }
    setConfigured(install);
    setStatus("Unreal Engine is configured for Memex Desktop.");
  };

  return <section className={`rounded-xl border border-border bg-surface ${compact ? "p-3" : "p-4"} space-y-3`} aria-label="Unreal Engine setup">
    <div><h3 className="text-sm font-medium text-text">Unreal Engine setup</h3><p className="text-xs text-muted mt-1">Memex can guide the local project workflow after it validates Unreal Editor and its command-line editor.</p></div>
    {configured && <div className="rounded-lg border border-green/30 bg-green/5 p-2 text-xs"><span className="text-green">Ready · UE {configured.version}</span><code className="block mt-1 break-all text-muted">{configured.commandPath}</code></div>}
    {!configured && <p className="text-xs text-muted">{status}</p>}
    {detected.map((install) => <button key={install.root} onClick={() => void configure(install.root)} className="w-full rounded-lg border border-border/60 bg-surface2/50 px-3 py-2 text-left hover:bg-surface2"><span className="text-sm text-text">Use UE {install.version}</span><code className="block mt-0.5 truncate text-[11px] text-muted">{install.root}</code></button>)}
    <div className="flex flex-wrap gap-2">
      <button onClick={() => void scan()} className="px-2.5 py-1.5 rounded-md border border-border/60 text-xs hover:bg-surface2">Scan again</button>
      <button onClick={async () => { const folder = await bridge?.dialog.openFolder(); if (folder) await configure(folder); }} className="px-2.5 py-1.5 rounded-md border border-border/60 text-xs hover:bg-surface2">Choose engine folder…</button>
      {!configured && <button onClick={() => void bridge?.devTools.openUnrealInstall()} className="px-2.5 py-1.5 rounded-md border border-accent/40 text-xs text-accent hover:bg-accent/10">Install Unreal Engine ↗</button>}
    </div>
    {configured && !compact && <p className="text-[11px] text-muted">When you return to the task, Memex can use <code>UnrealEditor-Cmd.exe</code> for project generation and automation. It will still ask before creating files or running commands outside your approved workspace.</p>}
  </section>;
}
