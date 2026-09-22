import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentWorkTrace, agentWorkFromEvents } from "./AgentWorkTrace";
import type { MessageEvent } from "../../types/memex";

const events: MessageEvent[] = [
  { type: "status", content: "Coordinator updated the worker plan.", data: { type: "swarm_task_list", workers: [
    { worker_id: "builder", pioneer_name: "Ada", role: "builder", task: "Implement the launcher", status: "running" },
    { worker_id: "critic", pioneer_name: "Lin", role: "critic", task: "Review the result", status: "queued" },
  ] } },
  { type: "agent_event", content: "Ada is reviewing the launcher configuration.", pioneer_name: "Ada", data: { type: "agent_event", worker_id: "builder", status: "running" } },
];

describe("AgentWorkTrace", () => {
  it("retains coordinator assignments and attaches worker work updates", () => {
    const work = agentWorkFromEvents(events);
    expect(work).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "builder", name: "Ada", task: "Implement the launcher", state: "working", events: [events[1]] }),
      expect.objectContaining({ id: "critic", name: "Lin", task: "Review the result", state: "waiting", events: [] }),
    ]));
  });

  it("renders expandable worker work in the conversation", () => {
    const markup = renderToStaticMarkup(<AgentWorkTrace events={events} active />);
    expect(markup).toContain("Agents");
    expect(markup).toContain("Ada is reviewing the launcher configuration.");
    expect(markup).toContain("Review the result");
  });
});
