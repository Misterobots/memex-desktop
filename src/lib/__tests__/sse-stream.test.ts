import { describe, expect, it } from "vitest";
import { normalizeSSEDelta, runEventTypeForSSE } from "../sse-stream";

describe("normalizeSSEDelta", () => {
  it("maps DevHarness events to stable renderer types", () => {
    expect(normalizeSSEDelta({ type: "tool_start", content: "read_file" })).toMatchObject({ type: "tool_call_start", content: "read_file", data: { type: "tool_start" } });
  });
  it("keeps unknown runtime events visible as logs", () => {
    expect(normalizeSSEDelta({ type: "new_runtime_event", content: { ok: true } })).toMatchObject({ type: "log", content: '{"ok":true}', data: { type: "new_runtime_event" } });
  });
  it("preserves plain text deltas without rich payload data", () => {
    expect(normalizeSSEDelta({ type: "content", content: "hello" })).toMatchObject({ type: "message", content: "hello", data: undefined });
  });

  it("maps runtime events to the run inspector contract", () => {
    expect(runEventTypeForSSE(normalizeSSEDelta({ type: "approval_requested", content: "write" })!)).toBe("permission");
    expect(runEventTypeForSSE(normalizeSSEDelta({ type: "file_change", content: "file.ts" })!)).toBe("file_write");
    expect(runEventTypeForSSE(normalizeSSEDelta({ type: "continuation", content: "resuming" })!)).toBe("status");
  });
});
