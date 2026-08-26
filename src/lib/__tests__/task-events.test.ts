import { describe, expect, it } from "vitest";
import type { TaskEvent } from "../tasks-api";

describe("TaskEvent contract", () => {
  it("uses the stable run event fields", () => {
    const event: TaskEvent = {
      type: "status", run_id: "coord-1", seq: 0,
      ts: "2026-08-25T00:00:00Z", payload: { content: "queued" },
    };
    expect(event).toMatchObject({ run_id: "coord-1", seq: 0, payload: { content: "queued" } });
  });
});
