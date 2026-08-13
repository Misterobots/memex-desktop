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
import type { RuntimeProfile } from "../../lib/desktop";

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
      <div className="w-full max-w-md bg-surface border border-border/60 rounded-2xl p-8 shadow-2xl flex flex-col min-h-[520px]">

        {/* Step 0: Runtime profile */}
        {step === 0 && (
          <Step index={0} total={TOTAL} title="Connect to Memex" onNext={next}>
            <p className="text-sm text-muted">Sign in once to use Memex securely from anywhere. Home-LAN routing is available below for advanced use.</p>
            <div className="space-y-2">
              {profiles.map((p) => (
                <button key={p.id} onClick={() => { setActiveId(p.id); bridge?.config.setActive(p.id); }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors
                    ${activeId === p.id ? "border-accent/50 bg-accent/10" : "border-border/40 hover:bg-surface2/60"}`}>
                  <div className="text-sm font-medium text-text">{p.name}</div>
                  <div className="text-xs text-muted mt-0.5 font-mono truncate">{p.agentRuntime}</div>
                </button>
              ))}
            </div>
            {activeId === publicProfile?.id && (
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
