import type { MessageEvent } from "../../types/memex";

type AgentState = "working" | "complete" | "failed" | "waiting";

export interface LiveAgent {
  id: string;
  name: string;
  role?: string;
  task?: string;
  state: AgentState;
  events: MessageEvent[];
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
  const upsert = (candidate: Record<string, unknown>, event?: MessageEvent) => {
    const id = string(candidate.worker_id ?? candidate.id ?? candidate.agent_id ?? candidate.pioneer_name ?? candidate.agent_name ?? candidate.role);
    if (!id) return;
    const prior = agents.get(id);
    const next: LiveAgent = {
      id,
      name: string(candidate.pioneer_name ?? candidate.agent_name ?? candidate.name) ?? prior?.name ?? string(candidate.role) ?? "Worker",
      role: string(candidate.role) ?? prior?.role,
      task: string(candidate.task ?? candidate.current_task ?? candidate.phase_name) ?? prior?.task,
      state: stateFor(candidate.status ?? candidate.state ?? candidate.event_type ?? prior?.state),
      events: prior?.events ?? [],
    };
    if (event && event.content.trim()) next.events = [...next.events, event];
    agents.set(id, next);
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
      upsert({ ...data, pioneer_name: event.pioneer_name ?? data.pioneer_name, agent_name: event.agent_name ?? data.agent_name }, event);
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
  return <section aria-label="Pioneers" aria-live="polite" className="border-b border-border/60 px-3 py-3">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[10px] font-medium uppercase tracking-wider text-faint">Pioneers</span>
      {active && <span className="text-[10px] text-accent">Live</span>}
    </div>
    <div className="divide-y divide-border/50">
      {agents.map((agent) => <details key={agent.id} open={active && agent.state === "working"} className="group py-2 first:pt-0 last:pb-0">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-text hover:text-accent">
          <span aria-label={agent.state} className={`h-1.5 w-1.5 shrink-0 rounded-full ${indicator[agent.state]}`} />
          <span className="min-w-0 truncate font-medium">{agent.name}</span>
          {agent.role && <span className="min-w-0 truncate text-muted">· {agent.role}</span>}
          <span className="ml-auto text-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        {(agent.task || agent.events.length > 0) && <div className="ml-3.5 mt-1.5 border-l border-border/60 pl-2.5">
          {agent.task && <p className="mb-1 text-[11px] leading-4 text-muted">{agent.task}</p>}
          {agent.events.length > 0 ? <ol className="space-y-0.5 text-[11px] leading-4 text-text/75">
            {agent.events.slice(-10).map((event, index) => <li key={`${event.receivedAt ?? index}-${index}`} className="break-words">{event.content}</li>)}
          </ol> : <p className="text-[11px] text-faint">Awaiting first update.</p>}
        </div>}
      </details>)}
    </div>
  </section>;
}
