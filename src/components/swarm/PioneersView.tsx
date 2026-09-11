import { useEffect, useMemo, useRef, useState } from "react";
import type { MessageEvent } from "../../types/memex";

export type PioneerState = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface PioneerActivity {
  id: string;
  text: string;
  kind: "status" | "tool" | "thought" | "result";
  at: number;
}

export interface PioneerWorker {
  worker_id: string;
  role: string;
  pioneer_name: string;
  pioneer_full_name?: string;
  pioneer_motto?: string;
  task: string;
  phase: string;
  state: PioneerState;
  parent_worker_id?: string;
  depth?: number;
  output?: string;
  activities: PioneerActivity[];
}

const ROLE_COLORS: Record<string, string> = {
  researcher: "#f59e0b",
  architect: "#60a5fa",
  coder: "#a78bfa",
  devops: "#34d399",
  analyst: "#22d3ee",
  verifier: "#fb7185",
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function key(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function labelParts(value: string): { name: string; role?: string } {
  const match = value.trim().match(/^(.*?)[\s:_-]+(researcher|architect|coder|devops|analyst|verifier)$/i);
  return match ? { name: match[1].trim(), role: match[2].toLowerCase() } : { name: value.trim() };
}
function rawType(event: MessageEvent): string {
  return String(event.data?.type ?? event.type ?? "").toLowerCase();
}
function stateFor(value: unknown): PioneerState {
  const valueText = String(value ?? "").toLowerCase();
  if (/(fail|error|blocked)/.test(valueText)) return "failed";
  if (/(complete|done|pass|accepted)/.test(valueText)) return "completed";
  if (/(cancel|abort)/.test(valueText)) return "cancelled";
  if (/(pending|queue|wait)/.test(valueText)) return "pending";
  return "running";
}

function activityKind(type: string): PioneerActivity["kind"] {
  if (type.includes("tool") || type.includes("command") || type.includes("file")) return "tool";
  if (type.includes("thought") || type.includes("reason")) return "thought";
  if (type.includes("result") || type.includes("complete") || type.includes("output")) return "result";
  return "status";
}

/** Convert the runtime's swarm event contract into the Theatre model. */
export function pioneersFromEvents(events: MessageEvent[]): PioneerWorker[] {
  const workers = new Map<string, PioneerWorker>();
  const aliases = new Map<string, string>();
  const ensure = (candidate: Record<string, unknown>, event?: MessageEvent): PioneerWorker | null => {
    const rawId = str(candidate.worker_id ?? candidate.workerId ?? candidate.id ?? candidate.agent_id ?? event?.agent_name ?? event?.pioneer_name);
    if (!rawId) return null;
    const rawName = str(candidate.pioneer_name ?? candidate.pioneerName ?? candidate.agent_name ?? candidate.name ?? event?.pioneer_name ?? event?.agent_name);
    const parts = rawName ? labelParts(rawName) : { name: "" };
    const inferredRole = str(candidate.role) ?? parts.role;
    const id = aliases.get(key(rawId))
      ?? aliases.get(key(parts.name))
      ?? (inferredRole ? aliases.get(key(`${parts.name} ${inferredRole}`)) : undefined)
      ?? rawId;
    const prior = workers.get(id);
    const name = str(candidate.pioneer_name ?? candidate.pioneerName ?? candidate.name ?? event?.pioneer_name)
      ?? (parts.name || undefined)
      ?? prior?.pioneer_name
      ?? inferredRole
      ?? "Pioneer";
    const worker: PioneerWorker = {
      worker_id: id,
      role: inferredRole ?? prior?.role ?? "worker",
      pioneer_name: name,
      pioneer_full_name: str(candidate.pioneer_full_name ?? candidate.pioneerFullName) ?? prior?.pioneer_full_name,
      pioneer_motto: str(candidate.pioneer_motto ?? candidate.pioneerMotto) ?? prior?.pioneer_motto,
      task: str(candidate.task ?? candidate.current_task ?? candidate.description) ?? prior?.task ?? "Awaiting assignment",
      phase: str(candidate.phase ?? candidate.phase_name ?? candidate.phaseName) ?? prior?.phase ?? "1",
      state: stateFor(candidate.state ?? candidate.status ?? candidate.event_type ?? prior?.state ?? "running"),
      parent_worker_id: str(candidate.parent_worker_id ?? candidate.parentWorkerId ?? candidate.parent_id) ?? prior?.parent_worker_id,
      depth: typeof candidate.depth === "number" ? candidate.depth : prior?.depth,
      output: str(candidate.output ?? candidate.result) ?? prior?.output,
      activities: prior?.activities ?? [],
    };
    workers.set(id, worker);
    for (const alias of [rawId, name, `${name} ${worker.role}`, event?.agent_name, event?.pioneer_name]) {
      if (alias) aliases.set(key(alias), id);
    }
    return worker;
  };
  const append = (worker: PioneerWorker, event: MessageEvent, type: string) => {
    const text = event.content?.trim();
    if (!text) return;
    const activity: PioneerActivity = {
      id: `${event.receivedAt ?? Date.now()}-${worker.worker_id}-${worker.activities.length}`,
      text: text.length > 240 ? `${text.slice(0, 237)}…` : text,
      kind: activityKind(type),
      at: event.receivedAt ?? Date.now(),
    };
    const next = worker.activities.filter((item) => item.text !== activity.text).slice(-39);
    workers.set(worker.worker_id, { ...worker, activities: [...next, activity] });
  };

  for (const event of events) {
    const data = object(event.data);
    const type = rawType(event);
    if (type === "swarm_task_list" || type === "swarm_workers" || Array.isArray(data.workers)) {
      const list = Array.isArray(data.workers) ? data.workers : Array.isArray(data.tasks) ? data.tasks : [];
      list.forEach((item) => ensure(object(item), event));
      continue;
    }
    const explicitWorkerId = str(data.worker_id ?? data.workerId ?? data.agent_id);
    const labelId = str(event.agent_name ?? event.pioneer_name);
    const aliasId = labelId ? aliases.get(key(labelId)) : undefined;
    const knownWorker = explicitWorkerId ?? aliasId;
    // Coordinator/system/status narration is control-plane activity, not a
    // Pioneer worker. Only explicit worker IDs or labels already bound to a
    // worker may create/update Rost entries.
    if (!knownWorker && type !== "swarm_worker_created" && !type.startsWith("swarm_worker_")) continue;
    const worker = ensure({ ...data, worker_id: aliasId ?? knownWorker }, event);
    if (!worker) continue;
    const nextState = data.state ?? data.status ?? (type.includes("completed") || type.includes("failed") ? type : undefined);
    if (nextState) workers.set(worker.worker_id, { ...workers.get(worker.worker_id)!, state: stateFor(nextState) });
    if (str(data.output ?? data.result)) workers.set(worker.worker_id, { ...workers.get(worker.worker_id)!, output: str(data.output ?? data.result) });
    append(workers.get(worker.worker_id)!, event, type);
  }
  return [...workers.values()];
}

function color(role: string) { return ROLE_COLORS[role.toLowerCase()] ?? "#94a3b8"; }
function phaseLabel(phase: string, workers: PioneerWorker[]) {
  if (!workers.length) return "Waiting for pioneers";
  if (workers.some((worker) => worker.state === "running")) return phase === "1" ? "Decomposing task" : `Phase ${phase} · pioneers working`;
  if (workers.every((worker) => worker.state === "completed")) return "Reviewing pioneer findings";
  if (workers.some((worker) => worker.state === "failed")) return "Recovering from pioneer failure";
  return `Phase ${phase} · assembling Rost`;
}

function Portrait({ worker, large = false }: { worker: PioneerWorker; large?: boolean }) {
  const accent = color(worker.role);
  const initials = worker.pioneer_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className={`${large ? "h-16 w-16 text-xl" : "h-10 w-10 text-xs"} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-black`} style={{ borderColor: `${accent}99`, color: accent, background: `${accent}18`, boxShadow: `0 0 22px ${accent}25` }}>
    <span>{initials || "P"}</span>
    <span className="absolute inset-0 opacity-20" style={{ background: `repeating-linear-gradient(135deg, transparent 0 4px, ${accent} 5px 6px)` }} />
  </div>;
}

function LanyardCard({ worker, onDone }: { worker: PioneerWorker; onDone: () => void }) {
  const accent = color(worker.role);
  useEffect(() => { const timer = window.setTimeout(onDone, 4200); return () => window.clearTimeout(timer); }, [onDone]);
  return <div className="pioneer-lanyard flex h-full flex-col items-center justify-center py-4">
    <div className="h-10 w-px bg-white/30" />
    <div className="relative w-[min(270px,90%)] overflow-hidden rounded-xl border bg-surface shadow-2xl" style={{ borderColor: `${accent}70`, boxShadow: `0 20px 50px #0008, 0 0 0 1px ${accent}20` }}>
      <div className="h-1" style={{ background: `linear-gradient(90deg, transparent, ${accent}, white, ${accent}, transparent)` }} />
      <div className="border-b px-4 py-2" style={{ borderColor: `${accent}30`, background: `${accent}12` }}><div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.25em] text-faint"><span>Memex</span><span style={{ color: accent }}>Pioneer Division</span></div><div className="mt-1 text-[8px] font-mono text-faint">AGENT CREDENTIAL · ACTIVE SESSION</div></div>
      <div className="flex gap-3 px-4 py-4"><div><Portrait worker={worker} large /><div className="mt-1 text-center text-[7px] font-mono text-faint">PHOTO ID</div></div><div className="min-w-0 flex-1"><div className="text-sm font-black text-text">{worker.pioneer_name}</div><div className="mt-0.5 truncate text-[10px] text-muted">{worker.pioneer_full_name ?? worker.role}</div><span className="mt-2 inline-flex rounded px-2 py-0.5 text-[9px] font-bold uppercase" style={{ color: accent, background: `${accent}20`, border: `1px solid ${accent}50` }}>{worker.role}</span><div className="mt-3 text-[8px] font-mono uppercase text-faint">Clearance · active</div><div className="mt-1 text-[8px] font-mono uppercase text-faint">Phase · {worker.phase}</div></div></div>
      {worker.pioneer_motto && <div className="mx-4 mb-3 border-l-2 px-2 py-1.5 text-[9px] italic text-muted" style={{ borderColor: `${accent}70`, background: `${accent}0d` }}>“{worker.pioneer_motto}”</div>}
      <div className="flex items-center justify-between border-t px-4 py-2 text-[8px] font-mono text-faint" style={{ borderColor: `${accent}25` }}><span>{worker.worker_id.slice(-10).toUpperCase()}</span><span style={{ color: accent }}>● ACTIVE</span></div>
    </div>
  </div>;
}

function Badge({ worker, selected, onClick }: { worker: PioneerWorker; selected: boolean; onClick: () => void }) {
  const accent = color(worker.role);
  return <button onClick={onClick} className={`group relative flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-surface2 ${selected ? "bg-surface2" : ""}`}><span className="h-9 w-0.5 rounded-full" style={{ background: worker.state === "running" ? accent : worker.state === "completed" ? "#34d399" : worker.state === "failed" ? "#fb7185" : "#64748b" }} /><Portrait worker={worker} /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-xs font-bold text-text">{worker.pioneer_name}</span><span className="text-[9px] uppercase tracking-widest" style={{ color: accent }}>{worker.role}</span></span><span className="mt-0.5 block truncate text-[10px] text-muted">{worker.task}</span><span className="mt-1 block text-[9px] uppercase tracking-widest" style={{ color: worker.state === "running" ? accent : undefined }}>{worker.state === "running" ? "Working" : worker.state}</span></span><span className="text-xs text-faint transition-transform group-hover:translate-x-0.5">›</span></button>;
}

function Detail({ worker, onClose }: { worker: PioneerWorker; onClose: () => void }) {
  const accent = color(worker.role);
  return <div className="flex h-full min-w-0 flex-col border-l border-border/60 bg-surface"><div className="flex items-center justify-between border-b border-border/60 px-3 py-2"><span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>{worker.role}</span><button onClick={onClose} className="text-faint hover:text-text" aria-label="Close pioneer details">×</button></div><div className="overflow-y-auto"><div className="flex flex-col items-center border-b border-border/60 px-3 py-4" style={{ background: `${accent}0d` }}><Portrait worker={worker} large /><div className="mt-2 text-center text-sm font-black text-text">{worker.pioneer_full_name ?? worker.pioneer_name}</div><div className="mt-1 text-[9px] uppercase tracking-widest text-faint">{worker.state}</div>{worker.pioneer_motto && <div className="mt-2 text-center text-[10px] italic text-muted">“{worker.pioneer_motto}”</div>}</div><div className="border-b border-border/60 px-3 py-3"><div className="mb-1 text-[9px] font-black uppercase tracking-widest text-faint">Task</div><div className="text-[11px] leading-5 text-text">{worker.task}</div></div><div className="px-3 py-3"><div className="mb-2 text-[9px] font-black uppercase tracking-widest text-faint">Activity</div>{worker.activities.length ? <ol className="space-y-2">{worker.activities.slice(-20).map((activity) => <li key={activity.id} className="border-l-2 pl-2 text-[10px] leading-4 text-muted" style={{ borderColor: `${accent}70` }}><span className="mr-1 text-[8px] uppercase tracking-widest" style={{ color: accent }}>{activity.kind}</span>{activity.text}</li>)}</ol> : <div className="text-[10px] text-faint">Waiting for the first update…</div>}</div>{worker.output && <div className="border-t border-border/60 px-3 py-3"><div className="mb-1 text-[9px] font-black uppercase tracking-widest text-faint">Findings</div><div className="whitespace-pre-wrap text-[10px] leading-4 text-muted">{worker.output}</div></div>}</div></div>;
}

function OrgCard({ label, detail, accent, live }: { label: string; detail: string; accent: string; live?: boolean }) {
  return <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-surface2 px-2 py-2"><div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-black" style={{ borderColor: `${accent}90`, color: accent, background: `${accent}18` }}>{label.slice(0, 1)}</span><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="truncate text-[10px] font-bold text-text">{label}</span>{live && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" style={{ background: accent }} />}</div><div className="truncate text-[8px] text-muted">{detail}</div></div></div></div>;
}

export function PioneersView({ events, active, workspaceKey = "global" }: { events: MessageEvent[]; active: boolean; workspaceKey?: string }) {
  const workers = useMemo(() => pioneersFromEvents(events), [events]);
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem(`memex.layout.pioneersPanel:${workspaceKey}`) !== "0"; } catch { return true; }
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [arrivalIndex, setArrivalIndex] = useState(0);
  const [dockMode, setDockMode] = useState(() => {
    try { return localStorage.getItem(`memex.layout.pioneersDockMode:${workspaceKey}`) === "1"; } catch { return false; }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try { return Math.min(720, Math.max(330, Number(localStorage.getItem(`memex.layout.pioneersWidth:${workspaceKey}`)) || 460)); } catch { return 460; }
  });
  const [resizing, setResizing] = useState(false);
  const seenIds = useRef<string[]>([]);
  const currentIds = workers.map((worker) => worker.worker_id);
  useEffect(() => {
    const unseen = currentIds.filter((id) => !seenIds.current.includes(id));
    if (unseen.length) {
      seenIds.current = [...seenIds.current, ...unseen];
      setArrivalIndex((index) => Math.max(index, seenIds.current.length - unseen.length));
      setPanelOpen(true);
    }
  }, [currentIds.join("|")]);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(`memex.layout.pioneersWidth:${workspaceKey}`)); if (saved) setPanelWidth(Math.min(720, Math.max(330, saved))); } catch { /* storage unavailable */ }
  }, [workspaceKey]);
  useEffect(() => {
    try {
      setPanelOpen(localStorage.getItem(`memex.layout.pioneersPanel:${workspaceKey}`) !== "0");
      setDockMode(localStorage.getItem(`memex.layout.pioneersDockMode:${workspaceKey}`) === "1");
    } catch { setPanelOpen(true); setDockMode(false); }
  }, [workspaceKey]);
  useEffect(() => {
    try { localStorage.setItem(`memex.layout.pioneersWidth:${workspaceKey}`, String(panelWidth)); } catch { /* storage unavailable */ }
  }, [panelWidth, workspaceKey]);
  useEffect(() => {
    try {
      localStorage.setItem(`memex.layout.pioneersPanel:${workspaceKey}`, panelOpen ? "1" : "0");
      localStorage.setItem(`memex.layout.pioneersDockMode:${workspaceKey}`, dockMode ? "1" : "0");
    } catch { /* storage unavailable */ }
  }, [panelOpen, dockMode, workspaceKey]);
  useEffect(() => {
    if (!resizing) return;
    const resizePanel = (event: PointerEvent) => setPanelWidth(Math.round(Math.min(720, Math.max(330, window.innerWidth - event.clientX))));
    const stop = () => setResizing(false);
    window.addEventListener("pointermove", resizePanel);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", resizePanel); window.removeEventListener("pointerup", stop); };
  }, [resizing]);
  if (!workers.length) return null;
  const arrival = workers[arrivalIndex] ?? null;
  const selectedWorker = selected ? workers.find((worker) => worker.worker_id === selected) : null;
  const phase = workers.map((worker) => Number(worker.phase) || 1).sort((a, b) => b - a)[0]?.toString() ?? "1";
  const visible = panelOpen;
  const liveWorkers = workers.filter((worker) => worker.state === "running").slice(0, 3);
  const spawnedAgents = liveWorkers.filter((worker) => !worker.parent_worker_id && !(worker.depth && worker.depth > 0));
  const subAgents = liveWorkers.filter((worker) => Boolean(worker.parent_worker_id) || Boolean(worker.depth && worker.depth > 0));
  const queuedWorkers = workers.filter((worker) => worker.state === "pending");
  const finishedWorkers = workers.filter((worker) => worker.state === "completed" || worker.state === "failed" || worker.state === "cancelled");
  const latestFor = (predicate: (event: MessageEvent) => boolean) => [...events].reverse().find((event) => predicate(event) && event.content?.trim())?.content.trim();
  const coordinatorDetail = latestFor((event) => /coordinator/i.test(String(event.agent_name ?? event.pioneer_name ?? event.data?.agent_name ?? ""))) ?? "Orchestrating the current run";
  const systemDetail = latestFor((event) => /system/i.test(String(event.agent_name ?? event.data?.agent_name ?? "")) || rawType(event) === "status") ?? "Runtime connected";
  if (!visible) return <button onClick={() => setPanelOpen(true)} className="fixed bottom-3 right-3 z-30 rounded-full border border-accent/40 bg-surface px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-accent shadow-lg">Show Pioneers · {workers.length}</button>;
  if (dockMode) return <div aria-label="Agent Dock" className="fixed bottom-[6.5rem] right-3 z-30 max-h-[40vh] w-[min(560px,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border/60 bg-surface/95 p-3 shadow-2xl backdrop-blur"><div className="mb-2 flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-accent" : "bg-emerald-400"}`} /><span className="text-xs font-bold uppercase tracking-widest text-text">AgentDock</span><span className="text-[10px] text-faint">Org view · {liveWorkers.length} active</span><div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => setDockMode(false)} className="rounded border border-accent/40 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-accent hover:bg-accent/10">Full panel</button><button type="button" onClick={() => setPanelOpen(false)} className="text-faint hover:text-text" aria-label="Hide Pioneers">×</button></div></div><div className="grid grid-cols-2 gap-2"><OrgCard label="Coordinator" detail={coordinatorDetail} accent="#a78bfa" live={active} /><OrgCard label="System" detail={systemDetail} accent="#94a3b8" live={active} /></div><div className="my-2 h-px bg-border/60" /><div className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.2em] text-faint">Spawned agents</div>{spawnedAgents.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{spawnedAgents.map((worker) => <button key={worker.worker_id} onClick={() => { setSelected(worker.worker_id); setDockMode(false); }} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-surface2 px-2 py-2 text-left hover:border-accent/50"><Portrait worker={worker} /><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-text">{worker.pioneer_name}</span><span className="mt-1 block truncate text-[9px] text-muted">{worker.activities.at(-1)?.text ?? worker.task}</span></span></button>)}</div> : <div className="py-2 text-[10px] text-faint">No agents are actively running.</div>}{subAgents.length > 0 && <><div className="mb-1 mt-2 border-t border-border/60 px-1 pt-2 text-[9px] font-black uppercase tracking-[0.2em] text-faint">Sub-agents</div><div className="grid grid-cols-1 gap-2 pl-3 sm:grid-cols-3">{subAgents.map((worker) => <button key={worker.worker_id} onClick={() => { setSelected(worker.worker_id); setDockMode(false); }} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-surface2 px-2 py-2 text-left hover:border-accent/50"><Portrait worker={worker} /><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold text-text">{worker.pioneer_name}</span><span className="mt-1 block truncate text-[9px] text-muted">{worker.activities.at(-1)?.text ?? worker.task}</span></span></button>)}</div></>}</div>;
  return <>
    <aside aria-label="Pioneers" style={{ width: panelWidth }} className="relative flex h-full shrink-0 overflow-hidden border-l border-border/60 bg-surface transition-[width] duration-500">
      <button type="button" aria-label="Resize Pioneers panel" title="Drag to resize Pioneers" onPointerDown={(event) => { event.preventDefault(); setResizing(true); }} className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-accent/20 focus:outline-none focus:bg-accent/20" />
      <div style={{ width: panelWidth }} className="flex h-full min-w-[330px] flex-col"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3"><span className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-accent" : "bg-emerald-400"}`} /><span className="text-xs font-bold uppercase tracking-widest text-text">Pioneers</span><span className="min-w-0 truncate text-[10px] text-faint">{phaseLabel(phase, workers)}</span><span className="ml-auto text-[10px] text-faint">{workers.length} active</span><button type="button" onClick={() => setDockMode(true)} className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-accent hover:bg-accent/20">Agent Dock</button><button type="button" onClick={() => setPanelOpen(false)} className="ml-1 text-faint hover:text-text" aria-label="Hide Pioneers panel">×</button></header>
        {arrival && arrivalIndex < workers.length && active && <div className="h-[250px] shrink-0 border-b border-border/60"><LanyardCard worker={arrival} onDone={() => setArrivalIndex((index) => Math.min(index + 1, workers.length))} /></div>}
        <div id="pioneers-tree" className="relative flex min-h-0 flex-1"><div className={`min-w-0 overflow-y-auto ${selectedWorker ? "w-[52%]" : "w-full"}`}><div className="border-b border-border/60 px-4 py-2 text-[9px] font-black uppercase tracking-[0.25em] text-faint">Rost · Pioneer badges</div>{queuedWorkers.length > 0 && <div className="border-b border-border/60 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-faint">Queued · {queuedWorkers.length}</div>}{queuedWorkers.map((worker) => <Badge key={worker.worker_id} worker={worker} selected={selected === worker.worker_id} onClick={() => setSelected(selected === worker.worker_id ? null : worker.worker_id)} />)}{workers.filter((worker) => worker.state === "running").map((worker) => <Badge key={worker.worker_id} worker={worker} selected={selected === worker.worker_id} onClick={() => setSelected(selected === worker.worker_id ? null : worker.worker_id)} />)}{finishedWorkers.length > 0 && <details className="border-b border-border/60"><summary className="cursor-pointer list-none px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-faint hover:text-text">Completed / failed · {finishedWorkers.length}</summary>{finishedWorkers.map((worker) => <Badge key={worker.worker_id} worker={worker} selected={selected === worker.worker_id} onClick={() => setSelected(selected === worker.worker_id ? null : worker.worker_id)} />)}</details>}</div>{selectedWorker && <div className="w-[48%] min-w-0"><Detail worker={selectedWorker} onClose={() => setSelected(null)} /></div>}</div>
      </div>
    </aside>
  </>;
}
