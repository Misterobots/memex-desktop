import type { MessageEvent } from "../../types/memex";

type AgentState = "working" | "complete" | "failed" | "waiting";

interface LiveAgent {
  id: string;
  name: string;
  role?: string;
  task?: string;
  state: AgentState;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stateFor(value: unknown): AgentState {
  const status = String(value ?? "working").toLowerCase();
  if (/(fail|error|blocked|cancel)/.test(status)) return "failed";
  if (/(complete|done|pass|accepted)/.test(status)) return "complete";
  if (/(wait|queue|pending)/.test(status)) return "waiting";
  return "working";
}

/** Extract a stable worker roster from streamed coordinator events. */
export function liveAgentsFromEvents(events: MessageEvent[]): LiveAgent[] {
  const agents = new Map<string, LiveAgent>();
  const upsert = (candidate: Record<string, unknown>) => {
    const id = string(candidate.worker_id ?? candidate.id ?? candidate.agent_id ?? candidate.pioneer_name ?? candidate.agent_name ?? candidate.role);
    if (!id) return;
    const prior = agents.get(id);
    agents.set(id, {
      id,
      name: string(candidate.pioneer_name ?? candidate.agent_name ?? candidate.name) ?? prior?.name ?? string(candidate.role) ?? "Worker",
      role: string(candidate.role) ?? prior?.role,
      task: string(candidate.task ?? candidate.current_task ?? candidate.phase_name) ?? prior?.task,
      state: stateFor(candidate.status ?? candidate.state ?? candidate.event_type ?? prior?.state),
    });
  };
  for (const event of events) {
    const data = object(event.data);
    const rawType = String(data.type ?? event.type);
    if (rawType === "swarm_task_list") {
      const workers = Array.isArray(data.workers) ? data.workers : Array.isArray(data.tasks) ? data.tasks : [];
      workers.forEach((worker) => upsert(object(worker)));
      continue;
    }
    if (rawType === "swarm_worker_created" || event.type === "agent_event" || data.worker_id || data.pioneer_name) {
      upsert({ ...data, pioneer_name: event.pioneer_name ?? data.pioneer_name, agent_name: event.agent_name ?? data.agent_name });
    }
  }
  return [...agents.values()];
}

export function LiveAgentRoster({ events, active }: { events: MessageEvent[]; active: boolean }) {
  const agents = liveAgentsFromEvents(events);
  if (!agents.length) return null;
  const indicator: Record<AgentState, string> = {
    working: "bg-accent status-dot-active",
    complete: "bg-green-400",
    failed: "bg-red",
    waiting: "bg-yellow",
  };
  return <section aria-label="Active agents" className="border-b border-border/60 px-3 py-3">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[10px] font-medium uppercase tracking-wider text-faint">Agents</span>
      {active && <span className="text-[10px] text-accent">Live</span>}
    </div>
    <div className="space-y-1">
      {agents.map((agent) => <div key={agent.id} className="rounded-md border border-border/60 bg-canvas/40 px-2.5 py-2">
        <div className="flex items-center gap-2 text-xs text-text">
          <span aria-label={agent.state} className={`h-1.5 w-1.5 shrink-0 rounded-full ${indicator[agent.state]}`} />
          <span className="min-w-0 truncate font-medium">{agent.name}</span>
        </div>
        {(agent.role || agent.task) && <p className="mt-0.5 truncate pl-3.5 text-[11px] text-muted">{agent.role}{agent.role && agent.task ? " · " : ""}{agent.task}</p>}
      </div>)}
    </div>
  </section>;
}
