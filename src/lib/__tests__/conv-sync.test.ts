import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../types/memex";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("../api-fetch", () => ({ apiFetch }));
vi.mock("../runtime-urls", () => ({ getAgentRuntime: () => "http://runtime" }));

import { pushSession } from "../conv-sync";

const session = (content: string): Session => ({
  id: "session-1",
  title: "Test session",
  experience: "chat",
  createdAt: 1,
  messages: [{
    id: "message-1",
    role: "user",
    content,
    events: [],
    timestamp: 1,
    mode: "chat",
  }],
});

describe("conversation sync", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retries a transient write failure", async () => {
    vi.useFakeTimers();
    apiFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    pushSession(session("first"));
    await vi.advanceTimersByTimeAsync(1200);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(apiFetch.mock.calls[1][1].body).messages[0].content).toBe("first");
  });

  it("coalesces rapid updates before the initial write", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValue(new Response(null, { status: 200 }));

    pushSession(session("first"));
    pushSession(session("latest"));
    await vi.advanceTimersByTimeAsync(1200);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(apiFetch.mock.calls[0][1].body).messages[0].content).toBe("latest");
  });
});
