import { describe, expect, it } from "vitest";
import { pioneersFromEvents } from "./PioneersView";
import type { MessageEvent } from "../../types/memex";

const event = (type: string, data: Record<string, unknown>, content = "") : MessageEvent => ({
  type: "log", content, data: { type, ...data }, receivedAt: Date.now(),
});

describe("Pioneers Theatre event adapter", () => {
  it("builds a Pioneer roster from task-list and worker lifecycle events", () => {
    const workers = pioneersFromEvents([
      event("swarm_task_list", { workers: [{ worker_id: "w-1", role: "coder", pioneer_name: "Ada", task: "Implement the fix", phase: "1", state: "pending" }] }),
      event("swarm_worker_created", { worker_id: "w-1", state: "running" }, "Ada is now working"),
      event("tool_call_start", { worker_id: "w-1" }, "Reading the relevant files"),
      event("swarm_worker_completed", { worker_id: "w-1", output: "Patch ready" }, "Completed implementation"),
    ]);
    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({ worker_id: "w-1", pioneer_name: "Ada", role: "coder", state: "completed", output: "Patch ready" });
    expect(workers[0].activities.map((activity) => activity.text)).toEqual([
      "Ada is now working", "Reading the relevant files", "Completed implementation",
    ]);
  });

  it("keeps activity attached when later events address a Pioneer by name", () => {
    const workers = pioneersFromEvents([
      event("swarm_worker_created", { worker_id: "w-2", role: "researcher", pioneer_name: "Grace", task: "Find evidence" }),
      { type: "agent_event", agent_name: "Grace", content: "Searching sources", receivedAt: Date.now() },
    ]);
    expect(workers[0].activities.at(-1)?.text).toBe("Searching sources");
  });
});
