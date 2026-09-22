/**
 * SetupWizard — shown on first launch when AppConfig.wizardComplete is false.
 *
 * Steps:
 *  1. Runtime profile — pick Home LAN or Localhost, or add custom
 *  2. MemPalace test — probe connection
 *  3. Workspace root — browse or skip
 *  4. Permission mode — choose Ask / Workspace / Trusted
 *  5. Identity — set uid displayed in X-authentik-uid header
 */
import { useCallback, useEffect, useState } from "react";
import { desktop } from "../../lib/desktop";
import type { LocalLlmInspection, RuntimeProfile } from "../../lib/desktop";

// ---------------------------------------------------------------------------
// Shared step layout
// ---------------------------------------------------------------------------
function Step({
  index, total, title, children, onNext, onBack, nextLabel = "Continue", nextDisabled = false,
}: {
  index:         number;
  total:         number;
  title:         string;
  children:      React.ReactNode;
  onNext:        () => void;
  onBack?:       () => void;
  nextLabel?:    string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-1 rounded-full transition-all
            ${i === index ? "w-6 bg-accent" : i < index ? "w-3 bg-accent/40" : "w-3 bg-surface2"}`} />
        ))}
      </div>

      <h2 className="text-xl font-semibold text-text mb-1">{title}</h2>
      <p className="text-xs text-muted mb-6">Step {index + 1} of {total}</p>

      <div className="flex-1 space-y-4">{children}</div>

      <div className="flex gap-3 pt-6">
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 rounded-xl border border-border/60 text-sm text-muted hover:text-text">
            Back
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-40"
        >{nextLabel}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection status line
// ---------------------------------------------------------------------------
function StatusLine({ label, ok, required }: { label: string; ok: boolean; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green" : required ? "bg-red" : "bg-faint"}`} />
      <span className="font-mono text-text/80">{label}</span>
      <span className={`ml-auto text-xs ${ok ? "text-green" : required ? "text-red" : "text-muted"}`}>
        {ok ? "connected" : required ? "not reachable" : "optional · offline"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupWizard
// ---------------------------------------------------------------------------
interface Props { onComplete: () => void }

type WizardStep = 0 | 1 | 2 | 3 | 4;
const TOTAL = 5;

export function SetupWizard({ onComplete }: Props) {
  const bridge = desktop();
  const [step,     setStep]     = useState<WizardStep>(0);
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [mpStatus, setMpStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [health,   setHealth]   = useState<{ agentRuntime: string; mempalace: string; ollama: string } | null>(null);
  const [root,     setRoot]     = useState("");
  const [mode,     setMode]     = useState<"trusted" | "workspace" | "ask">("workspace");
  const [uid,      setUid]      = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [connectionChoice, setConnectionChoice] = useState<"hosted" | "local" | "advanced">("hosted");
  const [localInspection, setLocalInspection] = useState<LocalLlmInspection | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [localModel, setLocalModel] = useState("qwen3:8b");
  const [localUrls, setLocalUrls] = useState({
    harnessUrl: "http://[::1]:8008", mempalaceUrl: "http://192.168.2.102:8200", ollamaUrl: "http://[::1]:11434",
    openWebUiUrl: "http://127.0.0.1:3000", comfyUiUrl: "http://127.0.0.1:8188",
  });
  const publicProfile = profiles.find((p) => p.id === "memex-anywhere");

  useEffect(() => {
    if (!bridge) return;
    Promise.all([bridge.config.getAll(), bridge.config.getActive()]).then(([all, active]) => {
      setProfiles(all);
      setActiveId(active.id);
    });
    bridge.identity?.get().then((u: string) => setUid(u));
  }, [bridge]);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1) as WizardStep);
  const back = () => setStep((s) => Math.max(s - 1, 0) as WizardStep);

  const testConnection = async () => {
    if (!bridge) return;
    setMpStatus("testing");
    setHealth(null);
    try {
      // Route through the main process: the renderer can't probe the backends
      // directly because they send no CORS headers. health.check() probes the
      // active profile's agent_runtime, MemPalace, and Ollama from main.
      const h = await bridge.health.check();
      setHealth(h);
      // agent_runtime is the required service; MemPalace/Ollama are optional.
      setMpStatus(h.agentRuntime === "connected" ? "ok" : "fail");
    } catch {
      setMpStatus("fail");
    }
  };

  const inspectLocal = async () => {
    if (!bridge) return;
    setLocalBusy(true);
    setLocalError("");
    try {
      const result = await bridge.localLlm.inspect();
      setLocalInspection(result);
      setLocalModel((current) => result.ollama.models.includes(current) ? current : result.recommendations[0]?.model ?? current);
    } catch {
      setLocalError("Could not inspect local services. You can still enter their addresses below.");
    } finally { setLocalBusy(false); }
  };

  const activateLocal = async () => {
    if (!bridge) return false;
    setLocalBusy(true);
    setLocalError("");
    try {
      const profile = await bridge.localLlm.activate({ ...localUrls, model: localModel });
      setActiveId(profile.id);
      setProfiles(await bridge.config.getAll());
      return true;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save Local LLM settings.");
      return false;
    } finally { setLocalBusy(false); }
  };

  const handleFinish = useCallback(async () => {
    if (!bridge) { onComplete(); return; }
    if (root.trim()) await bridge.workspace.addRoot(root.trim());
    await bridge.workspace.setPolicy({ mode });
    if (uid.trim()) await bridge.identity?.set(uid.trim());
    await bridge.config.setActive(activeId);
    onComplete();
  }, [bridge, root, mode, uid, activeId, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center p-6">
      {/* The app uses a hidden native title bar. The regular shell supplies its
          own drag region, but setup replaces that shell completely; keep a
          dedicated strip available throughout onboarding. */}
      <div className="drag-region absolute inset-x-0 top-0 h-10" aria-hidden="true" />
      <div className="no-drag w-full max-w-md bg-surface border border-border/60 rounded-2xl p-8 shadow-2xl flex flex-col min-h-[520px]">

        {/* Step 0: Runtime profile */}
        {step === 0 && (
          <Step index={0} total={TOTAL} title="Choose how Memex runs" onNext={() => {
            if (connectionChoice === "local") void activateLocal().then((ok) => { if (ok) next(); });
            else next();
          }} nextLabel={connectionChoice === "local" ? "Use Local LLMs" : "Continue"}>
            <p className="text-sm text-muted">Hosted Memex works from anywhere. Local LLMs connects this desktop to AI services you run on this computer.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setConnectionChoice("hosted"); setActiveId(publicProfile?.id ?? activeId); bridge?.config.setActive(publicProfile?.id ?? activeId); }}
                className={`text-left px-3 py-3 rounded-xl border ${connectionChoice === "hosted" ? "border-accent/50 bg-accent/10" : "border-border/40"}`}>
                <div className="text-sm font-medium text-text">Hosted Memex</div><div className="text-xs text-muted mt-1">Secure, remote-ready</div>
              </button>
              <button onClick={() => { setConnectionChoice("local"); void inspectLocal(); }}
                className={`text-left px-3 py-3 rounded-xl border ${connectionChoice === "local" ? "border-accent/50 bg-accent/10" : "border-border/40"}`}>
                <div className="text-sm font-medium text-text">Local LLMs</div><div className="text-xs text-muted mt-1">Your models, your machine</div>
              </button>
            </div>
            {connectionChoice === "hosted" && activeId === publicProfile?.id && (
              <button
                onClick={async () => {
                  setSigningIn(true);
                  await bridge?.remoteAuth.signIn();
                  setSigningIn(false);
                }}
                disabled={signingIn}
                className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/80 disabled:opacity-50"
              >{signingIn ? "Waiting for sign-in…" : "Sign in to Memex"}</button>
            )}
            {connectionChoice === "local" && (
              <div className="space-y-3 rounded-xl border border-border/50 bg-surface2/30 p-3">
                <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium text-text">Local setup</div><div className="text-xs text-muted">Discover services, then confirm your harness.</div></div>
                  <button onClick={() => void inspectLocal()} disabled={localBusy} className="text-xs text-accent hover:text-accent/80">{localBusy ? "Checking…" : "Scan machine"}</button></div>
                {localInspection && <>
                  <div className="text-xs text-muted">{localInspection.systemRamGb} GB RAM · {localInspection.gpus.length ? localInspection.gpus.map((gpu) => `${gpu.name} (${gpu.vramGb} GB)`).join(", ") : "GPU details unavailable"}</div>
                  <div className="space-y-1 rounded-lg bg-canvas/40 p-2"><StatusLine label="Ollama" ok={localInspection.ollama.reachable} required />
                    <StatusLine label="Local Memex harness" ok={localInspection.harness.reachable} required />
                    <StatusLine label="Open WebUI" ok={localInspection.openWebUi.reachable} />
                    <StatusLine label="ComfyUI" ok={localInspection.comfyUi.reachable} /></div>
                  {!localInspection.ollama.reachable && <button onClick={() => void bridge?.localLlm.openOllamaDownload()} className="text-xs text-accent hover:text-accent/80">Install Ollama ↗</button>}
                  {localInspection.recommendations.length > 0 && <div className="space-y-1"><label className="text-xs text-muted">Recommended model</label><select value={localModel} onChange={(e) => setLocalModel(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-canvas border border-border/60 text-sm text-text">{localInspection.recommendations.map((item) => <option key={item.model} value={item.model}>{item.model} — {item.label}</option>)}</select><p className="text-[11px] text-muted">{localInspection.recommendations.find((item) => item.model === localModel)?.reason}</p>
                    {localInspection.ollama.reachable && !localInspection.ollama.models.includes(localModel) && <button onClick={async () => { setLocalBusy(true); const result = await bridge?.localLlm.pullModel(localUrls.ollamaUrl, localModel); setLocalBusy(false); if (!result?.ok) setLocalError(result?.error ?? "Could not pull model"); else void inspectLocal(); }} disabled={localBusy} className="text-xs text-accent hover:text-accent/80">Pull {localModel}</button>}</div>}
                </>}
                <div className="grid grid-cols-1 gap-1.5">{([ ["harnessUrl", "Memex harness"], ["mempalaceUrl", "Memory service"], ["ollamaUrl", "Ollama"], ["openWebUiUrl", "Open WebUI (optional)"], ["comfyUiUrl", "ComfyUI (optional)"] ] as const).map(([key, label]) => <label key={key} className="text-[11px] text-muted">{label}<input value={localUrls[key]} onChange={(e) => setLocalUrls((urls) => ({ ...urls, [key]: e.target.value }))} className="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-canvas border border-border/60 text-xs text-text font-mono" /></label>)}</div>
                <p className="text-[11px] text-muted">Ollama supplies models. The local Memex harness provides chat, tools, memory, and workspace workflows. If it is not running, continue to configure the addresses and test it on the next step.</p>
                {localError && <p className="text-xs text-red-400">{localError}</p>}
              </div>
            )}
            {connectionChoice === "advanced" && <div className="space-y-2">{profiles.map((p) => <button key={p.id} onClick={() => { setActiveId(p.id); bridge?.config.setActive(p.id); }} className={`w-full text-left px-4 py-3 rounded-xl border ${activeId === p.id ? "border-accent/50 bg-accent/10" : "border-border/40"}`}><div className="text-sm font-medium text-text">{p.name}</div><div className="text-xs text-muted font-mono truncate">{p.agentRuntime}</div></button>)}</div>}
            {connectionChoice !== "advanced" && <button onClick={() => setConnectionChoice("advanced")} className="text-xs text-muted hover:text-text">Advanced routing profiles</button>}
          </Step>
        )}

        {/* Step 1: Connection test */}
        {step === 1 && (
          <Step index={1} total={TOTAL} title="Test connection" onNext={next} onBack={back}>
            <p className="text-sm text-muted">
              Verify the desktop app can reach your Memex backend. <span className="text-text/80">agent_runtime</span> is
              required; MemPalace (long-term memory) and Ollama are optional and can be set up later.
            </p>
            <button onClick={testConnection}
              disabled={mpStatus === "testing"}
              className="w-full py-2.5 rounded-xl border border-border/60 text-sm hover:bg-surface2/60 disabled:opacity-50">
              {mpStatus === "testing" ? "Testing…" : "Test connection"}
            </button>
            {health && (
              <div className="space-y-1.5 rounded-xl border border-border/40 bg-surface2/40 p-3">
                <StatusLine label="agent_runtime" ok={health.agentRuntime === "connected"} required />
                <StatusLine label="MemPalace"     ok={health.mempalace    === "connected"} />
                <StatusLine label="Ollama"        ok={health.ollama       === "connected"} />
              </div>
            )}
            {mpStatus === "fail" && (
              <p className="text-xs text-muted">
                agent_runtime isn't reachable on this profile. Go back to check the URL,
                or continue and adjust it later in Settings.
              </p>
            )}
          </Step>
        )}

        {/* Step 2: Workspace root */}
        {step === 2 && (
          <Step index={2} total={TOTAL} title="Set workspace root" onNext={next} onBack={back}
            nextLabel={root ? "Continue" : "Skip"}>
            <p className="text-sm text-muted">
              The workspace root is the folder the agent can access without extra prompts. Leave empty to configure later.
            </p>
            <div className="flex gap-2">
              <input
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                placeholder="/Users/you/projects"
                className="flex-1 px-3 py-2 rounded-xl bg-surface2 border border-border/60 text-sm text-text font-mono
                  focus:outline-none focus:ring-1 focus:ring-accent/60"
              />
              <button onClick={async () => {
                const folder = await bridge?.dialog.openFolder();
                if (folder) setRoot(folder);
              }} className="px-3 py-2 rounded-xl border border-border/60 text-sm hover:bg-surface2/60">
                Browse
              </button>
            </div>
          </Step>
        )}

        {/* Step 3: Permission mode */}
        {step === 3 && (
          <Step index={3} total={TOTAL} title="Permission mode" onNext={next} onBack={back}>
            <p className="text-sm text-muted">
              Controls whether the agent can access files and run commands without prompting.
            </p>
            <div className="space-y-2">
              {([
                ["trusted",   "Trusted",   "All operations allowed — fastest, least friction"],
                ["workspace", "Workspace", "Operations inside your workspace root are automatic; outside prompts you (recommended)"],
                ["ask",       "Ask",       "Every file and shell operation requires your approval"],
              ] as [typeof mode, string, string][]).map(([m, label, desc]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors
                    ${mode === m ? "border-accent/50 bg-accent/10" : "border-border/40 hover:bg-surface2/60"}`}>
                  <div className="text-sm font-medium text-text">{label}</div>
                  <div className="text-xs text-muted mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </Step>
        )}

        {/* Step 4: Identity */}
        {step === 4 && (
          <Step index={4} total={TOTAL} title="Your identity" onNext={handleFinish}
            onBack={back} nextLabel="Finish setup">
            <p className="text-sm text-muted">
              This UID is sent as <code className="font-mono">X-authentik-uid</code> on every request,
              so the agent knows who is talking. Auto-generated if left empty.
            </p>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="alice@example.com or leave blank"
              className="w-full px-3 py-2 rounded-xl bg-surface2 border border-border/60 text-sm text-text
                focus:outline-none focus:ring-1 focus:ring-accent/60"
            />
          </Step>
        )}

      </div>
    </div>
  );
}
