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
    expect(MODE_FLAGS.swarm).toEqual({ swarm_mode: true });
    expect(MODE_FLAGS.plan).toEqual({ swarm_mode: true, ultraplan_mode: true });
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
    expect(body).toMatchObject({ model: "swarm", swarm_mode: true, session_id: "legacy-session" });
    expect(JSON.stringify(body)).not.toContain("collective");
  });
});
