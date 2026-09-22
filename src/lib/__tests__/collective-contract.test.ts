import { afterEach, describe, expect, it, vi } from "vitest";
import { MODE_FLAGS, MODE_LABELS, modeLabel } from "../../types/memex";
import { streamChat } from "../sse-stream";

afterEach(() => vi.unstubAllGlobals());

describe("Collective terminology and legacy wire compatibility", () => {
  it("labels legacy swarm values as Collective without changing serialization", () => {
    expect(MODE_LABELS.swarm).toBe("Collective");
    expect(modeLabel("swarm")).toBe("Collective");
    expect(modeLabel("future-mode")).toBe("future-mode");
    const saved = JSON.parse('{"mode":"swarm","events":[]}');
    expect(modeLabel(saved.mode)).toBe("Collective");
    expect(JSON.stringify(saved)).toBe('{"mode":"swarm","events":[]}');
    expect(MODE_FLAGS.swarm).toEqual({ swarm_mode: true, research_mode: true });
    expect(MODE_FLAGS.plan).toEqual({ swarm_mode: true, ultraplan_mode: true });
    // Perspective Research Mode only engages when research_mode reaches the
    // coordinator, so Collective must carry both flags and Code must carry neither.
    expect(MODE_FLAGS.research).toEqual({ research_mode: true });
    expect(MODE_FLAGS.code).toEqual({ dev_mode: true });
    expect(MODE_LABELS.code).toBe("Code");
  });

  it("sends the legacy swarm model sentinel and swarm_mode to the runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    await new Promise<void>((resolve, reject) => streamChat({
      messages: [{ role: "user", content: "Build a local example" }],
      mode: "swarm", modeFlags: MODE_FLAGS.swarm, sessionId: "legacy-session",
      onEvent: vi.fn(), onDone: resolve, onError: reject,
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: "swarm", swarm_mode: true, research_mode: true, memory_enabled: true, session_id: "legacy-session" });
    expect(JSON.stringify(body)).not.toContain("collective");
  });

  it("sends only dev_mode for a standard Code turn", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    await new Promise<void>((resolve, reject) => streamChat({
      messages: [{ role: "user", content: "Fix the failing resolver test" }],
      mode: "code", modeFlags: MODE_FLAGS.code, sessionId: "code-session",
      workspaceKey: "C:/alpha", onEvent: vi.fn(), onDone: resolve, onError: reject,
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.dev_mode).toBe(true);
    expect(body.swarm_mode).toBeUndefined();
    expect(body.research_mode).toBeUndefined();
    expect(body.gauntlet_mode).toBeUndefined();
  });

  it("serializes an explicit general routing hint when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    await new Promise<void>((resolve, reject) => streamChat({
      messages: [{ role: "user", content: "Prepare a repeatable checklist" }],
      mode: "chat", modeFlags: {}, skill: "general", sessionId: "routine-session",
      onEvent: vi.fn(), onDone: resolve, onError: reject,
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.skill).toBe("general");
  });
});
