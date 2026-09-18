import type { MessageEvent } from "../../types/memex";

type AgentState = "working" | "complete" | "failed" | "waiting";

export interface AgentWork {
  id: string;
  name: string;
  role?: string;
  task?: string;
  parentId?: string;
  state: AgentState;
  events: MessageEvent[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stateFor(value: unknown): AgentState {
  const status = String(value ?? "working").toLowerCase();
  if (/(fail|error|blocked|cancel)/.test(status)) return "failed";
  if (/(complete|done|pass|accepted)/.test(status)) return "complete";
  if (/(wait|queue|pending)/.test(status)) return "waiting";
  return "working";
}

function workerId(candidate: Record<string, unknown>): string | undefined {
  return text(candidate.worker_id ?? candidate.id ?? candidate.agent_id ?? candidate.pioneer_name ?? candidate.agent_name ?? candidate.role);
}

/**
 * Preserve the coordinator's worker plan and attach subsequent worker-only
 * execution updates to it. Plain response chunks remain in the assistant
 * message: copying them here would show the same response once per worker.
 */
export function agentWorkFromEvents(events: MessageEvent[]): AgentWork[] {
  const agents = new Map<string, AgentWork>();
  const upsert = (candidate: Record<string, unknown>, event?: MessageEvent) => {
    const id = workerId(candidate);
    if (!id) return;
    const prior = agents.get(id);
    const work: AgentWork = {
      id,
      name: text(candidate.pioneer_name ?? candidate.agent_name ?? candidate.name) ?? prior?.name ?? text(candidate.role) ?? "Worker",
      role: text(candidate.role) ?? prior?.role,
      task: text(candidate.task ?? candidate.current_task ?? candidate.phase_name) ?? prior?.task,
      parentId: text(candidate.parent_worker_id ?? candidate.parentWorkerId ?? candidate.parent_id) ?? prior?.parentId,
      state: stateFor(candidate.status ?? candidate.state ?? candidate.event_type ?? prior?.state),
      events: prior?.events ?? [],
    };
    if (event && !work.events.includes(event)) work.events = [...work.events, event];
    agents.set(id, work);
  };

  let hasRealWorkers = false;
  for (const event of events) {
    const data = record(event.data);
    const rawType = String(data.type ?? event.type);
    if (rawType === "swarm_task_list") {
      const workers = Array.isArray(data.workers) ? data.workers : Array.isArray(data.tasks) ? data.tasks : [];
      workers.forEach((worker) => {
        const wid = workerId(record(worker));
        if (wid && wid !== "coordinator") hasRealWorkers = true;
        upsert(record(worker));
      });
      continue;
    }
    const workerUpdate = rawType === "swarm_worker_created"
      || event.type === "agent_event"
      || event.type === "thought"
      || event.type === "tool_call_start"
      || event.type === "tool_call_result"
      || Boolean(data.worker_id);
    if (workerUpdate) {
      const id = workerId(data) ?? workerId(event as unknown as Record<string, unknown>);
      if (id && id !== "coordinator") {
        hasRealWorkers = true;
        upsert({ ...data, pioneer_name: event.pioneer_name ?? data.pioneer_name, agent_name: event.agent_name ?? data.agent_name }, event);
      } else if (!id && (event.type === "thought" || event.type === "tool_call_start" || event.type === "tool_call_result")) {
        upsert({ ...data, id: "coordinator", name: "Coordinator", role: "orchestrator" }, event);
      }
    }
  }
  
  if (!hasRealWorkers) {
    agents.delete("coordinator");
  }
  return [...agents.values()];
}

const dot: Record<AgentState, string> = {
  working: "bg-accent status-dot-active",
  complete: "bg-green",
  failed: "bg-red",
  waiting: "bg-yellow",
};

export function AgentWorkTrace({ events, active }: { events: MessageEvent[]; active: boolean }) {
  const agents = agentWorkFromEvents(events);
  if (!agents.length) return null;
  const working = agents.filter((agent) => agent.state === "working").length;
  const knownIds = new Set(agents.map((agent) => agent.id));
  const childrenOf = (parentId: string) => agents.filter((agent) => agent.parentId === parentId);
  const renderAgent = (agent: AgentWork, depth: number, ancestry: Set<string>): React.ReactNode => {
    // A malformed runtime event must not create an infinite render loop.
    const nextAncestry = new Set(ancestry).add(agent.id);
    const children = nextAncestry.size > agents.length ? [] : childrenOf(agent.id).filter((child) => !nextAncestry.has(child.id));
    return (
      <details key={agent.id} className={`group pl-1 ${depth > 0 ? "ml-3 border-l border-border/60" : ""}`} open={active && agent.state === "working"}>
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-text/90 hover:text-text">
          <span aria-label={agent.state} className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[agent.state]}`} />
          <span className="font-medium">{agent.name}</span>
          {agent.role && <span className="text-muted">· {agent.role}</span>}
          <span className="ml-auto text-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        {agent.task && <p className="ml-3.5 pb-1 text-muted">{agent.task}</p>}
        <ol className="ml-3.5 border-l border-border/60 pl-2.5 pb-1.5 text-muted">
          {agent.events.slice(-12).map((event, index) => (
            <li key={index} className="py-0.5 leading-5">{event.content || "Worker status updated."}</li>
          ))}
          {agent.events.length === 0 && <li className="py-0.5">Awaiting its first work update.</li>}
        </ol>
        {children.length > 0 && <div className="mt-1 space-y-1">{children.map((child) => renderAgent(child, depth + 1, nextAncestry))}</div>}
      </details>
    );
  };
  const roots = agents.filter((agent) => !agent.parentId || !knownIds.has(agent.parentId));

  return (
    <details className="mt-3 border-t border-border/60 pt-2 text-xs" open={active}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-muted hover:text-text">
        <span className="text-[10px] font-medium uppercase tracking-wider">Agents</span>
        <span>{working ? `${working} working` : `${agents.length} recorded`}</span>
        <span className="ml-auto text-muted">›</span>
      </summary>
      <div className="mt-2 space-y-1.5">
        {roots.map((agent) => renderAgent(agent, 0, new Set()))}
      </div>
    </details>
  );
}
