import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveAgentRoster, liveAgentsFromEvents } from "./LiveAgentRoster";
import type { MessageEvent } from "../../types/memex";

describe("LiveAgentRoster", () => {
  const events: MessageEvent[] = [
    { type: "status", content: "Coordinator updated the worker plan.", data: { type: "swarm_task_list", workers: [
      { worker_id: "coord", pioneer_name: "Ada", role: "coordinator", task: "Split the work", status: "running" },
      { worker_id: "build", pioneer_name: "Lin", role: "builder", task: "Implement the feature", status: "queued" },
    ] } },
    { type: "agent_event", content: "Builder completed", data: { type: "agent_event", worker_id: "build", pioneer_name: "Lin", status: "completed" } },
  ];

  it("retains workers from the coordinator plan and applies later status updates", () => {
    expect(liveAgentsFromEvents(events)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "coord", name: "Ada", state: "working" }),
      expect.objectContaining({ id: "build", name: "Lin", state: "complete" }),
    ]));
  });

  it("renders a compact live roster in the Code sidebar", () => {
    const markup = renderToStaticMarkup(<LiveAgentRoster events={events} active />);
    expect(markup).toContain("Agents");
    expect(markup).toContain("Ada");
    expect(markup).toContain("Lin");
    expect(markup).toContain("Live");
  });
});
