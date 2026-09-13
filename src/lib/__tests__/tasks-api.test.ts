import { describe, expect, it } from "vitest";
import { filterTasks, normalizeTask, normalizeTaskList } from "../tasks-api";

const task = { coordination_id: "t1", status: "queued", started_at: 1 };

describe("task response normalization", () => {
  it("accepts both runs and tasks list envelopes", () => {
    expect(normalizeTaskList({ runs: [task] })[0]).toMatchObject({ coordination_id: "t1", phase: 0, approval_state: "none" });
    expect(normalizeTaskList({ tasks: [task] })).toHaveLength(1);
  });

  it("rejects entries without identity and status", () => {
    expect(normalizeTask({ coordination_id: "t1" })).toBeNull();
    expect(normalizeTask({ status: "queued" })).toBeNull();
    expect(normalizeTaskList({ runs: [task, null, {}] })).toHaveLength(1);
  });

  it("filters active, attention, and completed board states", () => {
    const tasks = [
      { ...task, coordination_id: "queued" },
      { ...task, coordination_id: "running", status: "running" },
      { ...task, coordination_id: "failed", status: "failed" },
      { ...task, coordination_id: "input", status: "needs_input" },
      { ...task, coordination_id: "done", status: "completed" },
    ].map((value) => normalizeTask(value)!);
    expect(filterTasks(tasks, "active").map((item) => item.coordination_id)).toEqual(["queued", "running"]);
    expect(filterTasks(tasks, "attention").map((item) => item.coordination_id)).toEqual(["failed", "input"]);
    expect(filterTasks(tasks, "completed").map((item) => item.coordination_id)).toEqual(["done"]);
  });
});
