/**
 * Loadout — import an unfurl `agent-build-sheet/1` export and apply it, staged,
 * to the surfaces this app owns: the D2 routing table and user-scope SKILL.md
 * files (MEMEX_LOADOUT_PLAN.md L1/L3).
 *
 * Rules this view must keep: routing.validate always runs before routing.set
 * (a refused write never lands, and validate-refused never calls set); a MODEL
 * with no engine match is either explicitly overridden by the user or stays a
 * manual step — never a silent mapping; skill writes go through fs so the
 * workspace firewall dialog remains the per-file confirmation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { desktop, type EngineModel as BridgeEngineModel, type RoutingConfig } from "../../lib/desktop";
import { parseBuildSheet, planApply, type BuildSheet, type EngineModel } from "../../lib/buildsheet";

type WriteState = { slug: string; dir: string; file: string; done: "pending" | "written" | "denied" | "error"; detail?: string };

const card = "rounded-lg border border-border/60 bg-surface2/30 p-3 space-y-2";
const btn = "text-xs px-2 py-1 rounded-lg border border-border/60 text-text hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed";
const btnAccent = "text-xs px-2 py-1 rounded-lg border border-accent/60 text-accent hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed";

export function LoadoutView() {
  const [sheet, setSheet] = useState<BuildSheet | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [routingCfg, setRoutingCfg] = useState<RoutingConfig | null>(null);
  const [bridgeModels, setBridgeModels] = useState<BridgeEngineModel[]>([]);
  const [overrides, setOverrides] = useState<Record<string, EngineModel>>({});
  const [routingMsg, setRoutingMsg] = useState<string | null>(null);
  const [writes, setWrites] = useState<WriteState[]>([]);
  const [applying, setApplying] = useState<"routing" | "skills" | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const bridge = desktop();
    if (!bridge?.routing) return;
    void bridge.routing.get().then(s => setRoutingCfg(s.routing)).catch(() => {});
    void (async () => {
      const eng = bridge.engines;
      if (!eng) return;
      const list = await eng.list().catch(() => []);
      const groups = await Promise.all(list.map(e => eng.models(e.id).catch(() => [] as BridgeEngineModel[])));
      setBridgeModels(groups.flat());
    })();
  }, []);

  const models = useMemo<EngineModel[]>(() => bridgeModels.map(m => ({ engine: m.engineId, model: m.model })), [bridgeModels]);
  const plan = useMemo(
    () => (sheet && routingCfg ? planApply(sheet, routingCfg, models, overrides) : null),
    [sheet, routingCfg, models, overrides],
  );
  const skillsKey = plan ? plan.skills.map(s => s.slug).join(",") : "";

  useEffect(() => {
    if (!plan || !plan.skills.length) { setWrites([]); return; }
    const bridge = desktop();
    if (!bridge) return;
    let alive = true;
    void bridge.path("home").then(home => {
      if (!alive) return;
      setWrites(prev =>
        prev.map(w => w.slug).join(",") === skillsKey
          ? prev
          : plan.skills.map(s => ({ slug: s.slug, dir: `${home}/.agents/skills/${s.slug}`, file: "SKILL.md", done: "pending" as const })),
      );
    });
    return () => { alive = false; };
  }, [plan, skillsKey]);

  const ingest = (text: string) => {
    const r = parseBuildSheet(text);
    if (r.ok) { setSheet(r.sheet); setParseError(null); setOverrides({}); setRoutingMsg(null); }
    else { setSheet(null); setParseError(r.error); }
  };

  const onChoice = (slot: string, value: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (!value) delete next[slot];
      else {
        const idx = value.indexOf("::");
        next[slot] = { engine: value.slice(0, idx), model: value.slice(idx + 2) };
      }
      return next;
    });
  };

  const applyRouting = async () => {
    const bridge = desktop();
    if (!bridge?.routing || !plan) return;
    setApplying("routing");
    setRoutingMsg(null);
    try {
      const issues = await bridge.routing.validate(plan.next);
      if (issues.length) { setRoutingMsg("Validate refused: " + issues.map(i => `${i.path} — ${i.message}`).join(" · ")); return; }
      const res = await bridge.routing.set(plan.next);
      if (!res.ok) { setRoutingMsg("Save refused: " + res.issues.map(i => `${i.path} — ${i.message}`).join(" · ")); return; }
      const fresh = await bridge.routing.get();
      setRoutingCfg(fresh.routing);
      setOverrides({});
      setRoutingMsg(`Applied ${plan.changes.length} routing ${plan.changes.length === 1 ? "change" : "changes"}.`);
    } finally {
      setApplying(null);
    }
  };

  const applySkills = async () => {
    const bridge = desktop();
    if (!bridge?.fs || !plan) return;
    setApplying("skills");
    try {
      for (let i = 0; i < plan.skills.length; i++) {
        const s = plan.skills[i];
        const w = writes[i];
        if (!s || !w) continue;
        try {
          await bridge.fs.mkdir(w.dir);
          await bridge.fs.writeFile(`${w.dir}/${w.file}`, s.content);
          setWrites(prev => prev.map((x, j) => (j === i ? { ...x, done: "written", detail: undefined } : x)));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setWrites(prev => prev.map((x, j) => (j === i ? { ...x, done: /permission denied/i.test(msg) ? "denied" : "error", detail: msg } : x)));
        }
      }
    } finally {
      setApplying(null);
    }
  };

  const unmatchedManual = plan ? plan.unmatched.filter(u => !u.slot || !overrides[u.slot]) : [];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-3xl mx-auto w-full">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-text">LOADOUT</h2>
        <span className="text-[10px] text-muted">import an unfurl build sheet · apply per section</span>
      </div>

      <div className={card}>
        <div className="text-xs text-muted">Paste the exported <code>build-*.md</code> or pick the file</div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Paste build sheet markdown"
          className="w-full h-24 bg-canvas border border-border/60 rounded-lg p-2 text-xs text-text font-mono"
        />
        <div className="flex gap-2">
          <button className={btn} onClick={() => ingest(draft)} disabled={!draft.trim()}>PARSE SHEET</button>
          <button className={btn} onClick={() => fileRef.current?.click()}>FROM FILE…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,.json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(ingest); e.target.value = ""; }}
          />
        </div>
        {parseError && <div className="text-xs text-yellow">{parseError}</div>}
      </div>

      {!sheet && <div className="text-xs text-muted">Nothing loaded — import a sheet to see its staged plan.</div>}

      {sheet && !plan && <div className="text-xs text-muted">Loading the live routing table to plan against…</div>}

      {sheet && plan && (
        <>
          <div className={card}>
            <div className="text-xs text-muted">
              Profile · <span className="text-text">{sheet.profile.name}</span>
              {plan.mode && <> · mode <span className="text-accent">{plan.mode}</span></>}
            </div>
            {sheet.profile.purpose && <div className="text-xs text-muted">{sheet.profile.purpose}</div>}
          </div>

          <div className={card}>
            <div className="text-xs font-semibold tracking-wide text-text">
              ROUTING <span className="text-muted font-normal">— validate runs before set; a refusal changes nothing</span>
            </div>
            {plan.changes.length === 0 && plan.unmatched.length === 0 && (
              <div className="text-xs text-muted">No MODEL changes — this build's models already route here.</div>
            )}
            {plan.changes.map(c => (
              <div key={c.slot} className="text-xs flex items-center gap-2">
                <span className="text-accent font-mono">routing.{c.slot}</span>
                <span className="text-muted">{c.from ? `${c.from.engine}/${c.from.model}` : "(new)"}</span>
                <span>→</span>
                <span className="text-text">{c.to.engine}/{c.to.model}</span>
                <span className="text-muted truncate">{c.item.name}</span>
              </div>
            ))}
            {plan.unmatched.map(u => {
              const ov = u.slot ? overrides[u.slot] : undefined;
              return (
                <div key={u.item.repo} className="text-xs flex items-center gap-2">
                  <span className="text-muted">{u.item.slotName}: {u.item.name}</span>
                  {u.slot ? (
                    <select
                      aria-label={`Engine model for ${u.item.slotName} (${u.item.name})`}
                      className="ml-auto bg-canvas border border-border/60 rounded px-1 py-0.5 text-xs text-text"
                      value={ov ? `${ov.engine}::${ov.model}` : ""}
                      onChange={e => onChoice(u.slot as string, e.target.value)}
                    >
                      <option value="">— manual / gateway step —</option>
                      {bridgeModels.map(m => (
                        <option key={`${m.engineId}::${m.model}`} value={`${m.engineId}::${m.model}`}>{m.model} ({m.engineLabel})</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-muted">— no routing slot for a MODEL in this position</span>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <button className={btnAccent} onClick={() => void applyRouting()} disabled={!plan.changes.length || applying !== null}>
                APPLY ROUTING
              </button>
              {routingMsg && <span className="text-[11px] text-muted">{routingMsg}</span>}
            </div>
          </div>

          <div className={card}>
            <div className="text-xs font-semibold tracking-wide text-text">
              SKILLS <span className="text-muted font-normal">— SKILL.md into ~/.agents/skills · the firewall confirms each write</span>
            </div>
            {plan.skills.length === 0 && <div className="text-xs text-muted">No SKILL items equipped.</div>}
            {plan.skills.map((s, i) => {
              const w = writes[i];
              return (
                <div key={s.slug} className="text-xs flex items-center gap-2">
                  <span className="text-text">{s.item.name}</span>
                  <span className="text-muted font-mono truncate">{w && w.done !== "pending" ? `${w.dir}/${w.file}` : `~/.agents/skills/${s.slug}`}</span>
                  {w && w.done !== "pending" && (
                    <span className={w.done === "written" ? "text-green" : "text-yellow"}>
                      {w.done === "written" ? "written" : w.done === "denied" ? "denied (dialog refused)" : `error: ${w.detail ?? "unknown"}`}
                    </span>
                  )}
                </div>
              );
            })}
            <button className={btnAccent} onClick={() => void applySkills()} disabled={!plan.skills.length || applying !== null}>
              WRITE SKILL FILES
            </button>
          </div>

          <div className={card}>
            <div className="text-xs font-semibold tracking-wide text-text">
              MANUAL STEPS <span className="text-muted font-normal">— nothing here is auto-applied</span>
            </div>
            {unmatchedManual.map(u => (
              <div key={`u-${u.item.repo}`} className="text-xs">
                <a href={u.item.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{u.item.name}</a>
                <span className="text-muted"> — no local engine serves it: add it under Settings → Model providers (gateway), or pull it on a configured engine, then re-import.</span>
              </div>
            ))}
            {plan.checklist.map(c => (
              <div key={c.item.repo} className="text-xs">
                <a href={c.item.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{c.item.name}</a>
                <span className="text-muted"> — {c.action}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
