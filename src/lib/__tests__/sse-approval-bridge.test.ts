import { afterEach, describe, expect, it, vi } from "vitest";

describe("desktop DevHarness approval bridge", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.resetModules();
  });

  it("forwards native approval decisions to the runtime with workspace scope", async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: "{}" });
    const permission = vi.fn().mockResolvedValue({ approved: true, scope: "workspace" });
    const stream = vi.fn((_id, requestInfo, onEvent) => {
      onEvent({ kind: "response", value: { status: 200 } });
      onEvent({
        kind: "chunk",
        value: new TextEncoder().encode(
          `data: ${JSON.stringify({ choices: [{ delta: {
            type: "tool_approval_needed",
            content: "Approval required: write_file",
            tool_name: "write_file",
            tool_input: { path: "a.txt" },
            tool_call_id: "call-1",
          } }] })}\n\n`,
        ),
      });
      expect(JSON.parse(requestInfo.body).workspace_key).toBe("C:/workspace");
      return vi.fn();
    });
    (globalThis as { window?: unknown }).window = {
      memex: { isDesktop: true, api: { request, stream }, permissions: { request: permission } },
    };

    const { streamChat } = await import("../sse-stream");
    const onDone = vi.fn();
    streamChat({
      messages: [{ role: "user", content: "edit" }],
      mode: "swarm",
      model: "swarm",
      modeFlags: { dev_mode: true },
      sessionId: "session-1",
      workspaceKey: "C:/workspace",
      onEvent: vi.fn(),
      onDone,
      onError: vi.fn(),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(permission).toHaveBeenCalledWith({
      toolName: "write_file",
      toolInput: { path: "a.txt" },
      callId: "call-1",
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      url: expect.stringContaining("/api/v1/dev/approve/call-1"),
      body: JSON.stringify({
        auto: "workspace",
        tool_name: "write_file",
        workspace_key: "C:/workspace",
      }),
    }));
  });
});
