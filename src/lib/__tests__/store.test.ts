import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store";

describe("experience-owned sessions", () => {
  it("applies workspace verbosity before a thread exists and isolates Code projects", () => {
    useStore.getState().setWorkspaceDisplayMode("sites", undefined, "thought");
    useStore.getState().setWorkspaceDisplayMode("code", "C:/alpha", "summary");
    useStore.getState().createSession("sites");
    useStore.getState().createSession("code", "C:/alpha");
    useStore.getState().createSession("code", "C:/beta");
    expect(useStore.getState().activeSession("sites")?.displayMode).toBe("thought");
    expect(useStore.getState().activeSession("code", "C:/alpha")?.displayMode).toBe("summary");
    expect(useStore.getState().activeSession("code", "C:/beta")?.displayMode).toBe("normal");
  });

  it("stores drafts by task scope and clears only the submitted draft", () => {
    useStore.getState().setWorkspaceDraft("code:C:/alpha:new", "finish the parser");
    useStore.getState().setWorkspaceDraft("code:C:/beta:new", "review the tests");
    useStore.getState().clearWorkspaceDraft("code:C:/alpha:new");

    expect(useStore.getState().workspaceDrafts["code:C:/alpha:new"]).toBeUndefined();
    expect(useStore.getState().workspaceDrafts["code:C:/beta:new"]).toBe("review the tests");
  });
  it("keeps run controls independent for each workspace", () => {
    useStore.getState().setWorkspaceRunPreferences("research", undefined, { outputDetail: "high", reasoningSummary: "detailed" });
    useStore.getState().setWorkspaceRunPreferences("code", "C:/alpha", { reasoningEffort: "high" });
    expect(useStore.getState().workspaceRunPreferences.research).toMatchObject({ outputDetail: "high", reasoningSummary: "detailed", reasoningEffort: "medium" });
    expect(useStore.getState().workspaceRunPreferences["code:C:/alpha"]).toMatchObject({ outputDetail: "medium", reasoningSummary: "auto", reasoningEffort: "high" });
  });
  beforeEach(() => {
    useStore.setState({
      sessions: [],
      activeSessionIds: {},
      workspaceDisplayModes: {},
      workspaceRunPreferences: {},
      workspaceDrafts: {},
      activeTab: "chat",
      shellMode: "chat",
      designSurface: "product",
      cwd: "",
      uiScale: 1,
      uiDensity: "comfortable",
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

  it("clamps the global UI scale and keeps density as a persisted preference", () => {
    useStore.getState().setUiScale(2);
    expect(useStore.getState().uiScale).toBe(1.25);
    useStore.getState().setUiScale(0.1);
    expect(useStore.getState().uiScale).toBe(0.9);
    useStore.getState().setUiDensity("compact");
    expect(useStore.getState().uiDensity).toBe("compact");
  });

  it("switches between focused shells while preserving shared Design and Routines destinations", () => {
    useStore.getState().setActiveTab("design");
    useStore.getState().setShellMode("code");
    expect(useStore.getState()).toMatchObject({ shellMode: "code", activeTab: "design" });

    useStore.getState().setActiveTab("research");
    useStore.getState().setShellMode("code");
    expect(useStore.getState()).toMatchObject({ shellMode: "code", activeTab: "dev" });

    useStore.getState().setActiveTab("goals");
    useStore.getState().setShellMode("chat");
    expect(useStore.getState()).toMatchObject({ shellMode: "chat", activeTab: "goals" });

    useStore.getState().setActiveTab("sites");
    useStore.getState().setShellMode("code");
    expect(useStore.getState()).toMatchObject({ shellMode: "code", activeTab: "design", designSurface: "sites" });
  });

  it("keeps Settings open across shell changes", () => {
    useStore.getState().setActiveTab("settings");
    useStore.getState().setShellMode("code");

    expect(useStore.getState()).toMatchObject({ shellMode: "code", activeTab: "settings" });
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

/**
 * D9: the model belongs to the conversation.
 *
 * Before this, `selectedModel` was one global field, so a pick made on one thread was
 * the model for every thread — and a thread restored from an older store silently
 * inherited whatever was last used elsewhere. The owner's rule is that the choice is
 * persistent per session, and a *new* session starts on the active profile's default.
 *
 * These assert both directions, because the bug has two halves: a choice leaking
 * forward onto other threads, and a profile default arriving late and overwriting a
 * thread that had already been chosen.
 */
describe("per-session model selection", () => {
  const modelOf = (id: string) => useStore.getState().sessions.find((s) => s.id === id)?.model;

  beforeEach(() => {
    useStore.setState({
      selectedModel: "qwen3:14b",
      profileDefaultModel: "qwen3:14b",
    });
  });

  it("attaches a pick to the thread it was made on, and not to the others", () => {
    const first = useStore.getState().createSession("chat");
    useStore.getState().setSelectedModel("qwen3-coder:30b");
    const second = useStore.getState().createSession("chat");

    expect(modelOf(first)).toBe("qwen3-coder:30b");
    // The new thread seeded from the profile default, not from the thread before it.
    expect(modelOf(second)).toBe("qwen3:14b");
    expect(useStore.getState().selectedModel).toBe("qwen3:14b");
  });

  it("switching threads switches the model, and switching back restores it", () => {
    const a = useStore.getState().createSession("chat");
    useStore.getState().setSelectedModel("model-a");
    const b = useStore.getState().createSession("chat");
    useStore.getState().setSelectedModel("model-b");

    useStore.getState().setActiveSession(a);
    expect(useStore.getState().selectedModel).toBe("model-a");
    useStore.getState().setActiveSession(b);
    expect(useStore.getState().selectedModel).toBe("model-b");
  });

  it("a thread with no choice of its own inherits the profile default, not the last pick", () => {
    const chosen = useStore.getState().createSession("chat");
    useStore.getState().setSelectedModel("model-a");

    // Stands in for a session persisted before D9: it exists, and it carries no model.
    const legacy = useStore.getState().createSession("chat");
    useStore.setState((s) => ({
      sessions: s.sessions.map((item) => (item.id === legacy ? { ...item, model: undefined } : item)),
    }));

    useStore.getState().setActiveSession(legacy);
    expect(useStore.getState().selectedModel).toBe("qwen3:14b");
    useStore.getState().setActiveSession(chosen);
    expect(useStore.getState().selectedModel).toBe("model-a");
  });

  it("assigning a model to a thread that is not in view leaves the selection alone", () => {
    const a = useStore.getState().createSession("chat");
    useStore.getState().createSession("chat"); // b is now the thread in view

    useStore.getState().setSessionModel(a, "model-a");

    expect(modelOf(a)).toBe("model-a");
    expect(useStore.getState().selectedModel).toBe("qwen3:14b");
    useStore.getState().setActiveSession(a);
    expect(useStore.getState().selectedModel).toBe("model-a");
  });

  it("a new thread follows a profile default that changed, not the seed it launched with", () => {
    useStore.getState().setProfileDefaultModel("qwen3:8b");
    const id = useStore.getState().createSession("chat");

    expect(modelOf(id)).toBe("qwen3:8b");
    expect(useStore.getState().selectedModel).toBe("qwen3:8b");
  });

  it("carries a thread's model across a rehydrate, and re-reads the profile default", () => {
    // The restart path: zustand restores `sessions` from storage (each with its model)
    // but not `profileDefaultModel`, which the picker seeds again from the active
    // profile on load. Asserted through behaviour rather than by reaching into the
    // persist options, which are not attached where no storage exists.
    const a = useStore.getState().createSession("chat");
    useStore.getState().setSelectedModel("model-a");
    const stored = JSON.parse(JSON.stringify(useStore.getState().sessions));

    useStore.setState({ sessions: [], activeSessionIds: {}, selectedModel: "qwen3:14b", profileDefaultModel: "" });
    useStore.setState({ sessions: stored, activeSessionIds: { chat: a } });

    expect(modelOf(a)).toBe("model-a");
    expect(useStore.getState().selectedModel).toBe("qwen3:14b");

    // The profile answers, the default lands, and the thread that had chosen keeps its
    // own pick rather than being overwritten by it.
    useStore.getState().setProfileDefaultModel("qwen3:8b");
    expect(modelOf(a)).toBe("model-a");
  });
});
