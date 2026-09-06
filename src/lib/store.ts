import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage, Session, ConnectionStatus, MemexMode, MessageEvent, AppTab, TokenUsage,
  ExperienceId, ChatDisplayMode, AppShellMode, WorkspaceRunPreferences,
} from "../types/memex";

const SHELL_TABS: Record<AppShellMode, AppTab[]> = {
  chat: ["chat", "research", "goals", "art", "design", "sites"],
  code: ["dev", "skills", "goals", "eval", "pulls", "design", "sites"],
};

export const experienceForTab = (tab: AppTab): ExperienceId | null => {
  if (tab === "goals") return "goals";
  if (tab === "design") return "product_design";
  if (tab === "sites") return "sites";
  if (tab === "art") return "design";
  if (tab === "dev") return "code";
  if (tab === "research") return "research";
  if (tab === "chat") return "chat";
  return null;
};

export const sessionMatches = (session: Session, experience: ExperienceId, workspaceKey?: string) =>
  session.experience === experience &&
  (experience !== "code" || session.workspaceKey === (workspaceKey || undefined));

export const sessionScopeKey = (experience: ExperienceId, workspaceKey?: string) =>
  experience === "code" ? `code:${workspaceKey || "unselected"}` : experience;

export const defaultRunPreferences: WorkspaceRunPreferences = {
  outputDetail: "medium", reasoningSummary: "auto", reasoningEffort: "medium",
};

interface AppState {
  // Sessions
  sessions: Session[];
  activeSessionIds: Record<string, string | undefined>;
  workspaceDisplayModes: Record<string, ChatDisplayMode>;
  setWorkspaceDisplayMode: (experience: ExperienceId, workspaceKey: string | undefined, mode: ChatDisplayMode) => void;
  workspaceRunPreferences: Record<string, WorkspaceRunPreferences>;
  setWorkspaceRunPreferences: (experience: ExperienceId, workspaceKey: string | undefined, preferences: Partial<WorkspaceRunPreferences>) => void;

  // UI state
  activeTab: AppTab;
  shellMode: AppShellMode;
  designSurface: "product" | "sites";
  mode: MemexMode;
  cwd: string;
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  streamingSessions: Record<string, boolean>;
  stopStreams: Record<string, (() => void) | undefined>;

  // Connection
  connections: ConnectionStatus;
  selectedModel: string;

  // Actions — sessions
  createSession: (experience?: ExperienceId, workspaceKey?: string) => string;
  setActiveSession: (id: string, experience?: ExperienceId) => void;
  deleteSession: (id: string) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  mergeRemoteSessions: (remote: Session[]) => void;
  appendEvent: (sessionId: string, msgId: string, event: MessageEvent) => void;
  updateMessageContent: (sessionId: string, msgId: string, content: string) => void;
  updateMessageRunId: (sessionId: string, msgId: string, runId: string) => void;
  setMessageUsage: (sessionId: string, msgId: string, usage: TokenUsage) => void;
  replaceMessages: (sessionId: string, messages: ChatMessage[]) => void;
  setSessionDisplayMode: (sessionId: string, displayMode: ChatDisplayMode) => void;

  // Actions — UI
  setActiveTab: (tab: AppTab) => void;
  setShellMode: (mode: AppShellMode) => void;
  setDesignSurface: (surface: "product" | "sites") => void;
  setMode: (mode: MemexMode) => void;
  setCwd: (cwd: string) => void;
  toggleSidebar: () => void;
  setCommandPalette: (open: boolean) => void;
  setStreaming: (sessionId: string, streaming: boolean, stop?: () => void) => void;

  // Actions — connection
  setConnections: (c: Partial<ConnectionStatus>) => void;
  setSelectedModel: (model: string) => void;

  activeSession: (experience?: ExperienceId, workspaceKey?: string) => Session | null;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionIds: {},
      workspaceDisplayModes: {},
      setWorkspaceDisplayMode: (experience, workspaceKey, mode) => set((s) => ({
        workspaceDisplayModes: { ...s.workspaceDisplayModes, [sessionScopeKey(experience, workspaceKey)]: mode },
        // Sync the active thread's preference without retimestamping unrelated history.
        sessions: s.sessions.map((session) => session.id === get().activeSession(experience, workspaceKey)?.id
          ? { ...session, displayMode: mode, updatedAt: Date.now() } : session),
      })),
      workspaceRunPreferences: {},
      setWorkspaceRunPreferences: (experience, workspaceKey, preferences) => set((s) => {
        const key = sessionScopeKey(experience, workspaceKey);
        return { workspaceRunPreferences: {
          ...s.workspaceRunPreferences,
          [key]: { ...defaultRunPreferences, ...s.workspaceRunPreferences[key], ...preferences },
        } };
      }),
      activeTab: "chat",
      shellMode: "chat",
      designSurface: "product",
      mode: "chat",
      cwd: "",
      sidebarOpen: true,
      commandPaletteOpen: false,
      streamingSessions: {},
      stopStreams: {},
      connections: {
        agentRuntime: "checking",
        mempalace:    "checking",
        ollama:       "checking",
      },
      // Code's responsive default.  The 27B model remains available as an
      // explicit deep-work choice, but should not make every new Code session
      // wait for a large cold GPU load.
      selectedModel: "qwen3:14b",

      createSession: (requestedExperience, requestedWorkspaceKey) => {
        const experience = requestedExperience ?? experienceForTab(get().activeTab) ?? "chat";
        const workspaceKey = experience === "code" ? ((requestedWorkspaceKey ?? get().cwd) || undefined) : undefined;
        const id = `session-${experience}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const now = Date.now();
        const session: Session = {
          id,
          title: "New conversation",
          experience,
          workspaceKey,
          createdAt: now,
          updatedAt: now,
          messages: [],
          displayMode: get().workspaceDisplayModes[sessionScopeKey(experience, workspaceKey)] ?? "normal",
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionIds: { ...s.activeSessionIds, [sessionScopeKey(experience, workspaceKey)]: id },
        }));
        return id;
      },

      setActiveSession: (id, requestedExperience) => set((s) => {
        const session = s.sessions.find((item) => item.id === id);
        const experience = requestedExperience ?? session?.experience ?? "chat";
        return {
          activeSessionIds: {
            ...s.activeSessionIds,
            [sessionScopeKey(experience, session?.workspaceKey)]: id,
          },
        };
      }),

      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id);
          const activeSessionIds = { ...s.activeSessionIds };
          for (const [scope, activeId] of Object.entries(activeSessionIds)) {
            if (activeId === id) delete activeSessionIds[scope];
          }
          return { sessions, activeSessionIds };
        }),

      addMessage: (sessionId, msg) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  title: sess.messages.length === 0 && msg.role === "user"
                    ? (msg.content.trim().slice(0, 54) || sess.title)
                    : sess.title,
                  messages: [...sess.messages, msg],
                  updatedAt: Date.now(),
                }
              : sess
          ),
        })),

      mergeRemoteSessions: (remote) =>
        set((s) => {
          const byId = new Map(s.sessions.map((x) => [x.id, x] as const));
          for (const r of remote) {
            const local = byId.get(r.id);
            // Take remote only when it's newer (or unseen) — local edits win otherwise.
            if (!local || (r.updatedAt ?? 0) > (local.updatedAt ?? 0)) byId.set(r.id, r);
          }
          const merged = [...byId.values()].sort(
            (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
          );
          return { sessions: merged };
        }),

      appendEvent: (sessionId, msgId, event) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id !== msgId ? m : { ...m, events: [...m.events, event] }
              ),
            }
          ),
        })),

      updateMessageContent: (sessionId, msgId, content) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id !== msgId ? m : { ...m, content }
              ),
            }
          ),
        })),

      updateMessageRunId: (sessionId, msgId, runId) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id !== msgId ? m : { ...m, runId }
              ),
            }
          ),
        })),

      setMessageUsage: (sessionId, msgId, usage) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id !== sessionId ? sess : {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id !== msgId ? m : { ...m, usage }
              ),
            }
          ),
        })),

      replaceMessages: (sessionId, messages) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, messages, updatedAt: Date.now() } : sess
          ),
        })),

      setSessionDisplayMode: (sessionId, displayMode) => set((s) => ({
        sessions: s.sessions.map((sess) => sess.id === sessionId ? { ...sess, displayMode, updatedAt: Date.now() } : sess),
      })),

      setActiveTab: (activeTab) => set((state) => ({
        // Preserve old deep links/commands to Sites, but keep them inside the
        // single Design workspace so the focused shell never hides its route.
        activeTab: activeTab === "sites" ? "design" : activeTab,
        designSurface: activeTab === "sites" ? "sites" : activeTab === "design" ? "product" : state.designSurface,
      })),
      setShellMode: (shellMode) => set((state) => ({
        shellMode,
        // Design (and its Sites subspace) plus Routines are shared. Keep those
        // contexts visible across the switch; otherwise land in the workspace's
        // primary surface instead of leaving the user on a hidden destination.
        activeTab: SHELL_TABS[shellMode].includes(state.activeTab)
          ? state.activeTab
          : shellMode === "code" ? "dev" : "chat",
      })),
      setDesignSurface: (designSurface) => set({ designSurface, activeTab: "design" }),
      setMode:           (mode)              => set({ mode }),
      setCwd:            (cwd)               => set({ cwd }),
      toggleSidebar:     ()                  => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setCommandPalette: (open)              => set({ commandPaletteOpen: open }),
      setStreaming: (sessionId, streaming, stop) => set((s) => ({
        streamingSessions: { ...s.streamingSessions, [sessionId]: streaming },
        stopStreams: { ...s.stopStreams, [sessionId]: streaming ? stop : undefined },
      })),
      setConnections:    (c)                 => set((s) => ({ connections: { ...s.connections, ...c } })),
      setSelectedModel:  (model)             => set({ selectedModel: model }),

      activeSession: (requestedExperience, requestedWorkspaceKey) => {
        const state = get();
        const experience = requestedExperience ?? experienceForTab(state.activeTab);
        if (!experience) return null;
        const workspaceKey = experience === "code" ? ((requestedWorkspaceKey ?? state.cwd) || undefined) : undefined;
        const activeId = state.activeSessionIds[sessionScopeKey(experience, workspaceKey)];
        const active = state.sessions.find((session) => session.id === activeId);
        if (active && sessionMatches(active, experience, workspaceKey)) return active;
        return state.sessions.find((session) => sessionMatches(session, experience, workspaceKey)) ?? null;
      },
    }),
    {
      name: "memex-desktop",
      version: 7,
      // mode is intentionally NOT persisted — it's a per-session intent, and a
      // sticky "swarm" silently turned greetings into build orchestration.
      // Each launch starts in the default "chat" mode.
      partialize: (s) => ({
        sessions: s.sessions.slice(0, 50),
        activeSessionIds: s.activeSessionIds,
        workspaceDisplayModes: s.workspaceDisplayModes,
        workspaceRunPreferences: s.workspaceRunPreferences,
        activeTab: s.activeTab,
        shellMode: s.shellMode,
        designSurface: s.designSurface,
        cwd: s.cwd,
        sidebarOpen: s.sidebarOpen,
        selectedModel: s.selectedModel,
      }),
      // Drop any previously-persisted mode so existing installs reset to chat.
      migrate: (persisted: any, version) => {
        if (persisted && "mode" in persisted) delete persisted.mode;
        if (persisted && version < 2) {
          const oldActive = persisted.activeSessionId;
          persisted.sessions = (persisted.sessions ?? []).map((session: Session) => ({
            ...session,
            experience: session.experience ?? "chat",
          }));
          persisted.activeSessionIds = oldActive ? { chat: oldActive } : {};
          delete persisted.activeSessionId;
        }
        if (persisted && version < 3) {
          const activeIds = { ...(persisted.activeSessionIds ?? {}) };
          const legacyCodeId = activeIds.code;
          if (legacyCodeId) {
            const codeSession = (persisted.sessions ?? []).find((session: Session) => session.id === legacyCodeId);
            activeIds[sessionScopeKey("code", codeSession?.workspaceKey)] = legacyCodeId;
            delete activeIds.code;
          }
          persisted.activeSessionIds = activeIds;
        }
        // Earlier builds defaulted every experience to the 27B general model.
        // Move only that old default to the responsive Code default; a user who
        // picked any other model keeps their explicit choice.
        if (persisted && version < 4 && persisted.selectedModel === "qwen3.6:27b") {
          persisted.selectedModel = "qwen3:14b";
        }
        if (persisted && version < 5) {
          persisted.shellMode = ["dev", "skills", "eval", "pulls"].includes(persisted.activeTab) ? "code" : "chat";
        }
        if (persisted && version < 6) {
          persisted.designSurface = persisted.activeTab === "sites" ? "sites" : "product";
          if (persisted.activeTab === "sites") persisted.activeTab = "design";
        }
        if (persisted && version < 7) persisted.workspaceRunPreferences = {};
        return persisted;
      },
    }
  )
);
