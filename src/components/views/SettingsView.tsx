import { useEffect, useState, useCallback } from "react";
import { desktop, type RuntimeProfile } from "../../lib/desktop";
import { SkillRegistry } from "../settings/SkillRegistry";
import { MemoryView } from "./MemoryView";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border/60 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-surface2/60 border-b border-border/40">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-text/80 pt-0.5 min-w-[140px]">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Input({ value, onChange, placeholder, error, className = "" }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; className?: string;
}) {
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-1.5 rounded-lg bg-surface2 border text-sm text-text
          focus:outline-none focus:ring-1 focus:ring-accent/60
          ${error ? "border-red-500/60" : "border-border/60"}
          ${className}`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-10 h-5.5 rounded-full transition-colors flex-shrink-0 relative
        ${checked ? "bg-accent" : "bg-surface2 border border-border/60"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all
        ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Profile editor
// ---------------------------------------------------------------------------
function ProfileEditor({
  profile,
  onSave,
  onCancel,
}: {
  profile: Partial<RuntimeProfile>;
  onSave:  (p: Partial<RuntimeProfile>) => void;
  onCancel: () => void;
}) {
  const [name, setName]   = useState(profile.name ?? "");
  const [ar,   setAr]     = useState(profile.agentRuntime ?? "");
  const [mp,   setMp]     = useState(profile.mempalace ?? "");
  const [ol,   setOl]     = useState(profile.ollama ?? "");
  const [errs, setErrs]   = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim())      e.name = "Name is required";
    if (!ar.trim())        e.ar   = "Agent Runtime URL is required";
    else try { new URL(ar); } catch { e.ar = "Must be a valid URL (e.g. http://…)"; }
    if (!mp.trim())        e.mp   = "MemPalace URL is required";
    else try { new URL(mp); } catch { e.mp = "Must be a valid URL"; }
    if (ol) try { new URL(ol); } catch { e.ol = "Must be a valid URL or empty"; }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div className="space-y-2 p-3 border border-accent/30 rounded-lg bg-surface2/40">
      <Input value={name} onChange={setName} placeholder="Profile name" error={errs.name} />
      <Input value={ar}   onChange={setAr}   placeholder="Agent Runtime URL (http://…:8008)" error={errs.ar} />
      <Input value={mp}   onChange={setMp}   placeholder="MemPalace URL (http://…:8200)" error={errs.mp} />
      <Input value={ol}   onChange={setOl}   placeholder="Ollama URL (optional)" error={errs.ol} />
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { if (validate()) onSave({ ...profile, name, agentRuntime: ar, mempalace: mp, ollama: ol || undefined }); }}
          className="px-3 py-1 rounded-lg bg-accent text-white text-sm hover:bg-accent/80"
        >Save</button>
        <button onClick={onCancel} className="px-3 py-1 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsView
// ---------------------------------------------------------------------------
export function SettingsView() {
  const bridge = desktop();

  // ── Profiles ──────────────────────────────────────────────────────────────
  const [profiles,         setProfiles]       = useState<RuntimeProfile[]>([]);
  const [activeProfileId,  setActiveProfileId] = useState<string>("");
  const [editingProfile,   setEditingProfile]  = useState<Partial<RuntimeProfile> | null>(null);

  // ── Workspace / permission ────────────────────────────────────────────────
  const [permMode,         setPermMode]        = useState<"trusted"|"workspace"|"ask">("workspace");
  const [workspaceRoots,   setWorkspaceRoots]  = useState<string[]>([]);
  const [newRoot,          setNewRoot]         = useState("");

  // ── App ───────────────────────────────────────────────────────────────────
  const [autoStart,        setAutoStart]       = useState(false);
  const [updaterStatus,    setUpdaterStatus]   = useState<string>("—");
  const [extensionIds,     setExtensionIds]    = useState<string[]>([]);
  const [newExtId,         setNewExtId]        = useState("");
  const [extIdError,       setExtIdError]      = useState("");

  const load = useCallback(async () => {
    if (!bridge) return;
    const [all, active] = await Promise.all([
      bridge.config.getAll(),
      bridge.config.getActive(),
    ]);
    setProfiles(all);
    setActiveProfileId(active.id);

    const policy = await bridge.workspace.getPolicy();
    setPermMode(policy.mode as "trusted"|"workspace"|"ask");
    setWorkspaceRoots(policy.roots);

    const as = await bridge.autoStart.get();
    setAutoStart(as);

    const ids = await bridge.browser.getExtensionIds();
    setExtensionIds(ids);
  }, [bridge]);

  useEffect(() => {
    load();
    const off = bridge?.updater.onStatus((s) => {
      setUpdaterStatus(s.state === "available"   ? `Update available: ${s.version}` :
                       s.state === "downloading" ? `Downloading… ${s.percent ?? 0}%` :
                       s.state === "ready"       ? `Ready to install: ${s.version}` :
                       s.state === "error"       ? `Error: ${s.message}` :
                       s.state === "current"     ? "Up to date" : s.state);
    });
    return () => { off?.(); };
  }, [load]);

  // ── Profile actions ───────────────────────────────────────────────────────
  const handleActivate = async (id: string) => {
    await bridge?.config.setActive(id);
    setActiveProfileId(id);
  };

  const handleSaveProfile = async (p: Partial<RuntimeProfile>) => {
    if (!bridge) return;
    const saved = await bridge.config.save(p as any);
    setEditingProfile(null);
    const all = await bridge.config.getAll();
    setProfiles(all);
    if (!activeProfileId) setActiveProfileId(saved.id);
  };

  const handleDeleteProfile = async (id: string) => {
    await bridge?.config.delete(id);
    const all = await bridge?.config.getAll() ?? [];
    setProfiles(all);
    if (activeProfileId === id) setActiveProfileId(all[0]?.id ?? "");
  };

  // ── Permission mode ───────────────────────────────────────────────────────
  const handlePermMode = async (mode: "trusted"|"workspace"|"ask") => {
    setPermMode(mode);
    await bridge?.workspace.setPolicy({ mode });
  };

  // ── Workspace roots ───────────────────────────────────────────────────────
  const handleAddRoot = async () => {
    if (!newRoot.trim() || !bridge) return;
    await bridge.workspace.addRoot(newRoot.trim());
    const policy = await bridge.workspace.getPolicy();
    setWorkspaceRoots(policy.roots);
    setNewRoot("");
  };

  const handlePickRoot = async () => {
    const folder = await bridge?.dialog.openFolder();
    if (!folder) return;
    await bridge?.workspace.addRoot(folder);
    const policy = await bridge?.workspace.getPolicy();
    setWorkspaceRoots(policy?.roots ?? []);
  };

  // ── Extension IDs ─────────────────────────────────────────────────────────
  const isValidExtId = (id: string) => /^[a-z]{32}$/.test(id.trim());

  const handleAddExtId = async () => {
    const id = newExtId.trim();
    if (!isValidExtId(id)) { setExtIdError("Must be 32 lowercase letters (Chrome extension ID)"); return; }
    if (extensionIds.includes(id)) { setExtIdError("Already in list"); return; }
    const next = [...extensionIds, id];
    await bridge?.browser.setExtensionIds(next);
    setExtensionIds(next);
    setNewExtId("");
    setExtIdError("");
  };

  const handleRemoveExtId = async (id: string) => {
    const next = extensionIds.filter((x) => x !== id);
    await bridge?.browser.setExtensionIds(next);
    setExtensionIds(next);
  };

  if (!bridge) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Settings are only available inside Memex Desktop.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-2xl">

      {/* ── Runtime Profiles ── */}
      <Section title="Runtime Profiles">
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors
                ${activeProfileId === p.id
                  ? "border-accent/50 bg-accent/10"
                  : "border-border/40 bg-surface2/40 hover:bg-surface2/70"}`}
            >
              <button
                onClick={() => handleActivate(p.id)}
                className="flex-1 text-left"
              >
                <div className="text-sm font-medium text-text">{p.name}</div>
                <div className="text-xs text-muted truncate">{p.agentRuntime}</div>
              </button>
              {activeProfileId === p.id && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent px-2 py-0.5 rounded-full border border-accent/30">
                  Active
                </span>
              )}
              {!p.readonly && (
                <>
                  <button
                    onClick={() => setEditingProfile(p)}
                    className="text-xs text-muted hover:text-text px-2 py-1"
                  >Edit</button>
                  <button
                    onClick={() => handleDeleteProfile(p.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                  >Remove</button>
                </>
              )}
            </div>
          ))}
        </div>

        {editingProfile ? (
          <ProfileEditor
            profile={editingProfile}
            onSave={handleSaveProfile}
            onCancel={() => setEditingProfile(null)}
          />
        ) : (
          <button
            onClick={() => setEditingProfile({})}
            className="text-sm text-accent hover:text-accent/80"
          >+ Add profile</button>
        )}
      </Section>

      {/* ── Permission Mode ── */}
      <Section title="Permission Mode">
        <Row label="Mode">
          <div className="flex gap-2">
            {(["trusted", "workspace", "ask"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handlePermMode(m)}
                className={`px-3 py-1 rounded-lg text-sm border capitalize transition-colors
                  ${permMode === m
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border/40 bg-surface2/40 text-muted hover:text-text"}`}
              >{m}</button>
            ))}
          </div>
        </Row>
        <p className="text-xs text-muted">
          {permMode === "trusted"   && "All file, shell, and PTY operations allowed without prompting."}
          {permMode === "workspace" && "Operations inside workspace roots allowed; anything outside prompts."}
          {permMode === "ask"       && "Every file, shell, and terminal operation requires approval."}
        </p>
      </Section>

      {/* ── Workspace Roots ── */}
      <Section title="Workspace Roots">
        {workspaceRoots.length === 0 ? (
          <p className="text-xs text-muted">No roots set — all paths are treated as inside workspace.</p>
        ) : (
          <div className="space-y-1">
            {workspaceRoots.map((r) => (
              <div key={r} className="flex items-center gap-2 text-sm">
                <span className="flex-1 font-mono text-xs text-muted truncate">{r}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newRoot}
            onChange={setNewRoot}
            placeholder="/path/to/workspace"
            className="flex-1"
          />
          <button
            onClick={handleAddRoot}
            className="px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80"
          >Add</button>
          <button
            onClick={handlePickRoot}
            className="px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80"
          >Browse</button>
        </div>
      </Section>

      {/* ── App ── */}
      <Section title="App">
        <Row label="Launch at login">
          <Toggle checked={autoStart} onChange={async (v) => {
            setAutoStart(v);
            await bridge.autoStart.set(v);
          }} />
        </Row>
        <Row label="Updater">
          <span className="text-sm text-muted">{updaterStatus}</span>
        </Row>
      </Section>

      {/* ── Browser Extension IDs ── */}
      <Section title="Browser Extension">
        <p className="text-xs text-muted">
          Chrome extension IDs allowed to connect via the native messaging bridge.
          Each ID is 32 lowercase letters (shown in chrome://extensions when developer mode is on).
        </p>
        {extensionIds.length > 0 && (
          <div className="space-y-1">
            {extensionIds.map((id) => (
              <div key={id} className="flex items-center gap-2">
                <span className="flex-1 font-mono text-xs text-muted">{id}</span>
                <button
                  onClick={() => handleRemoveExtId(id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newExtId}
            onChange={(v) => { setNewExtId(v); setExtIdError(""); }}
            placeholder="abcdefghijklmnopqrstuvwxyzabcdef"
            error={extIdError}
          />
          <button
            onClick={handleAddExtId}
            className="px-3 py-1.5 rounded-lg bg-surface2 border border-border/60 text-sm hover:bg-surface2/80 self-start"
          >Add</button>
        </div>
      </Section>

      {/* ── Skill Registry ── */}
      <Section title="Skill Registry">
        <SkillRegistry />
      </Section>

      {/* ── Memory Management ── */}
      <Section title="Memory Management (MemPalace)">
        <div className="h-[420px] -m-4 overflow-hidden rounded-b-xl">
          <MemoryView />
        </div>
      </Section>

    </div>
  );
}
