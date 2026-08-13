import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store";

describe("experience-owned sessions", () => {
  beforeEach(() => {
    useStore.setState({
      sessions: [],
      activeSessionIds: {},
      activeTab: "chat",
      cwd: "",
      streamingSessions: {},
      stopStreams: {},
    });
  });

  it("keeps Chat, Research, Goals, and Design conversations separate", () => {
    const chatId = useStore.getState().createSession("chat");
    const researchId = useStore.getState().createSession("research");
    const goalId = useStore.getState().createSession("goals");
    const designId = useStore.getState().createSession("design");

    expect(useStore.getState().activeSession("chat")?.id).toBe(chatId);
    expect(useStore.getState().activeSession("research")?.id).toBe(researchId);
    expect(useStore.getState().activeSession("goals")?.id).toBe(goalId);
    expect(useStore.getState().activeSession("design")?.id).toBe(designId);
  });

  it("isolates Code conversations by project folder", () => {
    const first = useStore.getState().createSession("code", "C:\\work\\alpha");
    const second = useStore.getState().createSession("code", "C:\\work\\beta");

    expect(useStore.getState().activeSession("code", "C:\\work\\alpha")?.id).toBe(first);
    expect(useStore.getState().activeSession("code", "C:\\work\\beta")?.id).toBe(second);
    expect(useStore.getState().activeSession("code", "C:\\work\\missing")).toBeNull();
  });

  it("remembers a different active Code thread for each project", () => {
    const alphaFirst = useStore.getState().createSession("code", "C:\\work\\alpha");
    useStore.getState().createSession("code", "C:\\work\\alpha");
    useStore.getState().setActiveSession(alphaFirst, "code");
    const beta = useStore.getState().createSession("code", "C:\\work\\beta");

    expect(useStore.getState().activeSession("code", "C:\\work\\alpha")?.id).toBe(alphaFirst);
    expect(useStore.getState().activeSession("code", "C:\\work\\beta")?.id).toBe(beta);
  });

  it("tracks concurrent streams by their owning session", () => {
    const chatId = useStore.getState().createSession("chat");
    const goalId = useStore.getState().createSession("goals");
    const stop = () => undefined;

    useStore.getState().setStreaming(chatId, true, stop);

    expect(useStore.getState().streamingSessions[chatId]).toBe(true);
    expect(useStore.getState().streamingSessions[goalId]).not.toBe(true);
    expect(useStore.getState().stopStreams[chatId]).toBe(stop);
  });

  it("does not expose a Chat session on a non-conversational destination", () => {
    useStore.getState().createSession("chat");
    useStore.getState().setActiveTab("memory");

    expect(useStore.getState().activeSession()).toBeNull();
  });

  it("titles a new thread from its first user prompt", () => {
    const id = useStore.getState().createSession("research");
    useStore.getState().addMessage(id, {
      id: "message-1",
      role: "user",
      content: "Compare durable job queue designs for this system",
      events: [],
      timestamp: Date.now(),
      mode: "research",
    });

    expect(useStore.getState().activeSession("research")?.title).toBe("Compare durable job queue designs for this system");
  });
});
