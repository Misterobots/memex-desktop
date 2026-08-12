/**
 * Scheduled Tasks API client — talks to Agent_Swarm's trigger scheduler
 * (agents/trigger_scheduler.py) via agents/main.py's /api/v1/trigger/* routes.
 * Same-origin proxy in web mode (getAgentRuntime() === ""), active profile URL
 * in Electron — same pattern as tasks-api.ts.
 */
import { getAgentRuntime } from "./runtime-urls";

export type TriggerType = "cron" | "interval" | "once";
export type TriggerState = "active" | "paused" | "fired" | "failed";

export interface TriggerTaskConfig {
  prompt:          string;
  session_id?:     string;
  model?:          string;
  swarm_mode?:     boolean;
  dev_mode?:       boolean;
  ultraplan_mode?: boolean;
}

export interface Trigger {
  trigger_id:   string;
  name:         string;
  trigger_type: TriggerType;
  state:        TriggerState;
  fire_count:   number;
  last_fired?:  number | null;
  last_error?:  string | null;
  created_at:   number;
  created_by?:  string;
  task_config?: TriggerTaskConfig;
  cron?:            { hour: number | null; minute: number | null; day_of_week: number | null };
  interval_seconds?: number;
  fire_at?:          number;
}

export async function listTriggers(): Promise<Trigger[]> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/trigger/list`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data?.triggers) ? data.triggers : [];
  } catch {
    return [];
  }
}

export interface CreateTriggerBody {
  name:         string;
  trigger_type: TriggerType;
  task_config:  TriggerTaskConfig;
  cron?:            { hour?: number; minute?: number; day_of_week?: number };
  interval_seconds?: number;
  delay_seconds?:    number;
  fire_at?:          number;
}

/** Returns the created trigger, or null with a `status` code for error handling
 *  (mirrors tasks-api.ts's pattern — a 400 from bad schedule fields shouldn't
 *  collapse to the same "failed" state as a network error). */
export async function createTrigger(body: CreateTriggerBody): Promise<{ trigger?: Trigger; status: number }> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/trigger/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { status: r.status };
    const data = await r.json();
    return { trigger: data?.trigger, status: r.status };
  } catch {
    return { status: 0 };
  }
}

export async function pauseTrigger(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/trigger/${encodeURIComponent(id)}/pause`, { method: "POST" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function resumeTrigger(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/trigger/${encodeURIComponent(id)}/resume`, { method: "POST" });
    return r.ok;
  } catch {
    return false;
  }
}

export async function deleteTrigger(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${getAgentRuntime()}/api/v1/trigger/${encodeURIComponent(id)}`, { method: "DELETE" });
    return r.ok;
  } catch {
    return false;
  }
}
