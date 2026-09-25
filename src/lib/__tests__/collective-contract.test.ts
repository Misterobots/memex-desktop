import { afterEach, describe, expect, it, vi } from "vitest";
import { MODE_FLAGS, MODE_LABELS, modeLabel } from "../../types/memex";
import { runRoleModels, streamChat } from "../sse-stream";

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
    // The sentinel is named here by the caller, not substituted by streamChat: after
    // D3c the transport refuses a turn with no resolved model, because the runtime
    // reads this field as the model to bind every swarm role to.
    await new Promise<void>((resolve, reject) => streamChat({
      messages: [{ role: "user", content: "Build a local example" }],
      model: "swarm",
      mode: "swarm", modeFlags: MODE_FLAGS.swarm, sessionId: "legacy-session",
      onEvent: vi.fn(), onDone: resolve, onError: reject,
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: "swarm", swarm_mode: true, research_mode: true, memory_enabled: true, session_id: "legacy-session" });
    expect(JSON.stringify(body)).not.toContain("collective");
  });

  it("refuses a turn with no resolved model rather than substituting a placeholder", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    const onError = vi.fn();

    // Absent, empty and whitespace-only all count as unresolved. The old
    // `opts.model || "swarm"` turned all three into a model id the runtime would
    // happily bind every swarm role to, so the refusal has to cover all three.
    for (const model of [undefined, "", "   "]) {
      onError.mockClear();
      await new Promise<void>((resolve) => streamChat({
        messages: [{ role: "user", content: "Build something" }],
        model: model as string,
        mode: "swarm", modeFlags: MODE_FLAGS.swarm, onEvent: vi.fn(), onDone: resolve, onError,
      }));
      expect(onError).toHaveBeenCalledTimes(1);
      expect(String(onError.mock.calls[0][0])).toContain("No model selected");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only dev_mode for a standard Code turn", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    await new Promise<void>((resolve, reject) => streamChat({
      messages: [{ role: "user", content: "Fix the failing resolver test" }],
      model: "qwen3:14b",
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
      model: "qwen3:14b",
      mode: "chat", modeFlags: {}, skill: "general", sessionId: "routine-session",
      onEvent: vi.fn(), onDone: resolve, onError: reject,
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.skill).toBe("general");
  });
});

describe("D1c per-role map on the wire", () => {
  it("sends role_models with exactly the roles the app assigned", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    await new Promise<void>((resolve, reject) => streamChat({
      messages: [{ role: "user", content: "Split this across the team" }],
      model: "qwen3.6:27b",
      roleModels: { coder: "qwen3-coder:30b", verifier: "qwen3:8b" },
      mode: "swarm", modeFlags: MODE_FLAGS.swarm, sessionId: "role-map",
      onEvent: vi.fn(), onDone: resolve, onError: reject,
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("qwen3.6:27b");
    expect(body.role_models).toEqual({ coder: "qwen3-coder:30b", verifier: "qwen3:8b" });
  });

  it("omits role_models when the table named no role, rather than sending an empty object", async () => {
    for (const roleModels of [undefined, {}]) {
      // A fresh mock and a fresh Response per case: one body stream cannot be read twice.
      const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
      vi.stubGlobal("fetch", fetchMock);
      await new Promise<void>((resolve, reject) => streamChat({
        messages: [{ role: "user", content: "Explain the plan" }],
        model: "qwen3:14b", roleModels,
        mode: "chat", modeFlags: {}, sessionId: "no-role-map",
        onEvent: vi.fn(), onDone: resolve, onError: reject,
      }));
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).not.toHaveProperty("role_models");
    }
  });

  it("sends nothing it could not read from the bridge", async () => {
    // This suite runs without a DOM, so `window` is genuinely absent here — the
    // same shape as the web build. An absent bridge, a rejected read, and a
    // readable table must answer {} , {} , and the real map: the field may only
    // ever carry assignments someone actually made.
    await expect(runRoleModels()).resolves.toEqual({});

    const failing = vi.fn().mockRejectedValue(new Error("routing unavailable"));
    vi.stubGlobal("window", { memex: { routing: { runMap: failing } } });
    await expect(runRoleModels()).resolves.toEqual({});
    expect(failing).toHaveBeenCalledTimes(1);

    vi.stubGlobal("window", { memex: { routing: { runMap: async () => ({ coder: "qwen3-coder:30b" }) } } });
    await expect(runRoleModels()).resolves.toEqual({ coder: "qwen3-coder:30b" });
  });
});
