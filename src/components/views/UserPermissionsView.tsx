import { useEffect, useMemo, useState } from "react";
import {
  getPermissionCatalog, getUserPermissions, listUserPermissions, resetUserPermissions,
  saveUserPermissions, type FeatureKey, type PermissionModel, type UserPolicy,
} from "../../lib/user-permissions";

const FEATURE_GROUPS: { title: string; keys: FeatureKey[] }[] = [
  { title: "Core", keys: ["chat", "model_selection", "memory"] },
  { title: "Work", keys: ["code", "research", "routines", "eval"] },
  { title: "Grounding", keys: ["grounding_web", "grounding_docs", "grounding_files"] },
  { title: "Creative", keys: ["design", "art"] },
];

export function UserPermissionsView() {
  const [users, setUsers] = useState<UserPolicy[]>([]);
  const [models, setModels] = useState<PermissionModel[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [owner, setOwner] = useState("");
  const [policy, setPolicy] = useState<UserPolicy | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    const [configured, catalog] = await Promise.all([listUserPermissions(), getPermissionCatalog()]);
    setUsers(configured.users);
    setModels(catalog.models);
    setLabels(catalog.features);
  };

  useEffect(() => { void refresh().catch((error) => setNotice(error.message)); }, []);

  const openUser = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true); setNotice("");
    try { setPolicy(await getUserPermissions(clean)); setOwner(clean); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load user"); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!policy) return;
    setBusy(true); setNotice("");
    try { setPolicy(await saveUserPermissions(policy)); await refresh(); setNotice("Permissions saved."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save permissions"); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    if (!policy) return;
    setBusy(true); setNotice("");
    try { await resetUserPermissions(policy.owner_id); setPolicy(await getUserPermissions(policy.owner_id)); await refresh(); setNotice("Restrictions removed; inherited access restored."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reset permissions"); }
    finally { setBusy(false); }
  };

  const filteredModels = useMemo(() => models.filter((model) =>
    !modelQuery || `${model.label ?? ""} ${model.id}`.toLowerCase().includes(modelQuery.toLowerCase())), [models, modelQuery]);

  const explicitModels = policy?.allowed_models !== null;
  const toggleModel = (id: string) => setPolicy((current) => {
    if (!current) return current;
    const selected = new Set(current.allowed_models ?? []);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    return { ...current, allowed_models: [...selected] };
  });

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="max-w-6xl mx-auto p-6 sm:p-8">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold text-text">User permissions</h1>
          <p className="mt-1 text-sm text-muted">Control which Memex capabilities and models each user can access.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
          <aside className="rounded-2xl border border-border/60 bg-surface p-3 h-fit">
            <form className="flex gap-2 mb-3" onSubmit={(event) => { event.preventDefault(); void openUser(owner); }}>
              <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Username"
                className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-canvas border border-border/60 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent" />
              <button disabled={!owner.trim() || busy} className="px-3 rounded-lg bg-accent text-white text-sm disabled:opacity-50">Open</button>
            </form>
            <div className="text-[11px] uppercase tracking-wide text-muted px-2 py-1">Configured users</div>
            {users.length === 0 && <p className="px-2 py-3 text-xs text-muted">No explicit policies yet.</p>}
            {users.map((user) => <button key={user.owner_id} onClick={() => void openUser(user.owner_id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${policy?.owner_id === user.owner_id ? "bg-accent/10 text-accent" : "text-text hover:bg-surface2"}`}>
              {user.owner_id}
            </button>)}
          </aside>

          <main className="min-w-0">
            {!policy && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">Choose a configured user or enter a username to begin.</div>}
            {policy && <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-lg font-semibold text-text">{policy.owner_id}</h2><p className="text-xs text-muted">{policy.configured ? "Explicit policy" : "Currently inherits full access"}</p></div>
                <div className="flex gap-2"><button onClick={() => void reset()} disabled={busy || !policy.configured} className="px-3 py-2 rounded-lg border border-border text-xs text-muted disabled:opacity-40">Reset</button><button onClick={() => void save()} disabled={busy} className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50">Save changes</button></div>
              </div>

              <section className="rounded-2xl border border-border/60 bg-surface p-5">
                <h3 className="font-medium text-text">Feature access</h3><p className="text-xs text-muted mt-1 mb-5">Disabled features are hidden in the app and rejected by the API.</p>
                <div className="grid sm:grid-cols-2 gap-5">{FEATURE_GROUPS.map((group) => <div key={group.title}><div className="text-[11px] uppercase tracking-wide text-muted mb-2">{group.title}</div><div className="space-y-2">{group.keys.map((key) => <label key={key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-canvas border border-border/40 text-sm text-text"><span>{labels[key] ?? key}</span><input type="checkbox" checked={policy.features[key]} onChange={(event) => setPolicy({ ...policy, features: { ...policy.features, [key]: event.target.checked } })} className="accent-accent" /></label>)}</div></div>)}</div>
              </section>

              <section className="rounded-2xl border border-border/60 bg-surface p-5">
                <div className="flex items-start justify-between gap-4"><div><h3 className="font-medium text-text">Available models</h3><p className="text-xs text-muted mt-1">Inherited allows the operational catalog. Explicit mode permits only checked models.</p></div><label className="flex items-center gap-2 text-xs text-text"><input type="checkbox" checked={explicitModels} onChange={(event) => setPolicy({ ...policy, allowed_models: event.target.checked ? [] : null })} className="accent-accent" />Explicit allowlist</label></div>
                {explicitModels && <><input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Filter models…" className="w-full mt-4 px-3 py-2 rounded-lg bg-canvas border border-border/60 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent" /><div className="grid sm:grid-cols-2 gap-2 mt-3 max-h-72 overflow-y-auto">{filteredModels.map((model) => <label key={model.id} className={`flex gap-3 px-3 py-2.5 rounded-lg border text-sm ${model.available === false ? "opacity-50" : ""} ${policy.allowed_models?.includes(model.id) ? "border-accent/60 bg-accent/5" : "border-border/40 bg-canvas"}`}><input type="checkbox" checked={policy.allowed_models?.includes(model.id) ?? false} onChange={() => toggleModel(model.id)} className="accent-accent" /><span className="min-w-0"><span className="block text-text truncate">{model.label ?? model.id}</span><span className="block text-[10px] text-muted truncate">{model.description ?? model.id}</span></span></label>)}</div></>}
              </section>
            </div>}
            {notice && <div className="mt-4 px-4 py-3 rounded-xl bg-surface border border-border text-sm text-muted">{notice}</div>}
          </main>
        </div>
      </div>
    </div>
  );
}
