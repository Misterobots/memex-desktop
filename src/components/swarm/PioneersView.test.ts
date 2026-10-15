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

  it("binds a worker-stamped tool event to that Pioneer's activity", () => {
    // The 2026-10-05 recording: six Pioneers, every card reading "Waiting for the
    // first update…" while its worker ran, because tool events arrived with no
    // worker_id and were dropped as control-plane narration.
    const workers = pioneersFromEvents([
      event("swarm_worker_created", { worker_id: "w-3", role: "architect", pioneer_name: "Babbage", task: "Define the project structure" }),
      event("tool_start", { worker_id: "w-3", pioneer_name: "Babbage", tool_name: "write_file", event_type: "tool" }, "write_file /workspace/user_projects/app/src/index.css"),
      event("agent_event", { worker_id: "w-3", pioneer_name: "Babbage", event_type: "thinking" }, "The plan calls for a config directory, so I will add it."),
    ]);
    expect(workers).toHaveLength(1);
    expect(workers[0].activities.map((activity) => activity.text)).toEqual([
      "write_file /workspace/user_projects/app/src/index.css",
      "The plan calls for a config directory, so I will add it.",
    ]);
    expect(workers[0].activities.map((activity) => activity.kind)).toEqual(["tool", "thought"]);
  });

  it("does not invent a Pioneer for an unattributed tool event", () => {
    const workers = pioneersFromEvents([
      event("swarm_worker_created", { worker_id: "w-4", role: "coder", pioneer_name: "Knuth", task: "Set up the codebase" }),
      event("tool_start", { tool_name: "run_command" }, "run_command npm install"),
    ]);
    expect(workers.map((worker) => worker.worker_id)).toEqual(["w-4"]);
    expect(workers[0].activities).toEqual([]);
  });

  it("keeps activity attached when later events address a Pioneer by name", () => {
    const workers = pioneersFromEvents([
      event("swarm_worker_created", { worker_id: "w-2", role: "researcher", pioneer_name: "Grace", task: "Find evidence" }),
      { type: "agent_event", agent_name: "Grace", content: "Searching sources", receivedAt: Date.now() },
    ]);
    expect(workers[0].activities.at(-1)?.text).toBe("Searching sources");
  });

  it("normalizes coordinator labels such as Shannon RESEARCHER onto the worker", () => {
    const workers = pioneersFromEvents([
      event("swarm_worker_created", { worker_id: "swarmresearcher", role: "researcher", pioneer_name: "Shannon", task: "Inspect the project" }),
      { type: "agent_event", agent_name: "Shannon RESEARCHER", content: "Reading the project", receivedAt: Date.now() },
    ]);
    expect(workers).toHaveLength(1);
    expect(workers[0].worker_id).toBe("swarmresearcher");
    expect(workers[0].pioneer_name).toBe("Shannon");
    expect(workers[0].activities.at(-1)?.text).toBe("Reading the project");
  });

  it("does not turn control-plane narration into duplicate Rost workers", () => {
    const workers = pioneersFromEvents([
      event("swarm_worker_created", { worker_id: "swarmresearcher", role: "researcher", pioneer_name: "Shannon", task: "Inspect the project" }),
      { type: "agent_event", agent_name: "Coordinator", content: "Spawned Shannon (researcher)" },
      { type: "agent_event", agent_name: "System", content: "[Coordinator] Running implementation" },
    ]);
    expect(workers.map((worker) => worker.pioneer_name)).toEqual(["Shannon"]);
  });

  it("renders placeholder in embedded mode when no workers exist", async () => {
    const React = await import("react");
    const { PioneersView } = await import("./PioneersView");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const markup = renderToStaticMarkup(
      React.createElement(PioneersView, { events: [], active: false, embedded: true })
    );
    expect(markup).toContain("No active pioneers");
  });

  it("renders embedded container without aside tag when embedded is true", async () => {
    const React = await import("react");
    const { PioneersView } = await import("./PioneersView");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const events = [
      event("swarm_worker_created", { worker_id: "w-1", role: "researcher", pioneer_name: "Shannon", task: "Inspect code" }, "Started"),
    ];
    const markup = renderToStaticMarkup(
      React.createElement(PioneersView, { events, active: true, embedded: true })
    );
    expect(markup).toContain("Pioneers");
    expect(markup).toContain("Shannon");
    expect(markup).not.toContain("<aside");
  });
});
