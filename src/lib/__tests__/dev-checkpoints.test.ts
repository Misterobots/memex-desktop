import { describe, expect, it } from "vitest";
import { nextReplayTool, type DevCheckpoint } from "../dev-checkpoints-api";

const checkpoint = (pending_tools: DevCheckpoint["pending_tools"]): DevCheckpoint => ({
  session_id: "session-1",
  status: "paused",
  turn: 3,
  updated_at: 1,
  pending_tools,
});

describe("dev checkpoint replay ordering", () => {
  it("selects only the oldest pending tool", () => {
    expect(nextReplayTool(checkpoint([
      { call_id: "call-1", name: "read_file", args: {} },
      { call_id: "call-2", name: "write_file", args: {} },
    ]))?.call_id).toBe("call-1");
  });

  it("returns no tool when the checkpoint is drained", () => {
    expect(nextReplayTool(checkpoint([]))).toBeNull();
  });
});
