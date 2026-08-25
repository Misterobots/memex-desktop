import { describe, expect, it } from "vitest";
import { normalizeTask, normalizeTaskList } from "../tasks-api";

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
});
