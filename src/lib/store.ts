import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage, Session, ConnectionStatus, MemexMode, MessageEvent, AppTab, TokenUsage,
} from "../types/memex";

interface AppState {
  // Sessions
  sessions: Session[];
  activeSessionId: string | null;

  // UI state
  activeTab: AppTab;
  mode: MemexMode;
  cwd: string;
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  streaming: boolean;
  stopStream: (() => void) | null;

  // Connection
  connections: ConnectionStatus;
  selectedModel: string;

  // Actions — sessions
  createSession: () => string;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  mergeRemoteSessions: (remote: Session[]) => void;
  appendEvent: (sessionId: string, msgId: string, event: MessageEvent) => void;
  updateMessageContent: (sessionId: string, msgId: string, content: string) => void;
  updateMessageRunId: (sessionId: string, msgId: string, runId: string) => void;
  setMessageUsage: (sessionId: string, msgId: string, usage: TokenUsage) => void;

  // Actions — UI
  setActiveTab: (tab: AppTab) => void;
  setMode: (mode: MemexMode) => void;
  setCwd: (cwd: string) => void;
  toggleSidebar: () => void;
  setCommandPalette: (open: boolean) => void;
  setStreaming: (streaming: boolean, stop?: () => void) => void;

  // Actions — connection
  setConnections: (c: Partial<ConnectionStatus>) => void;
  setSelectedModel: (model: string) => void;

  activeSession: () => Session | null;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      activeTab: "chat",
      mode: "chat",
      cwd: "",
      sidebarOpen: true,
      commandPaletteOpen: false,
      streaming: false,
      stopStream: null,
      connections: {
        agentRuntime: "checking",
        mempalace:    "checking",
        ollama:       "checking",
      },
      selectedModel: "qwen3.6:27b",

      createSession: () => {
        const id = `session-${Date.now()}`;
        const now = Date.now();
        const session: Session = {
          id,
          title: "New conversation",
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id);
          const activeSessionId =
            s.activeSessionId === id ? (sessions[0]?.id ?? null) : s.activeSessionId;
          return { sessions, activeSessionId };
        }),

      addMessage: (sessionId, msg) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, messages: [...sess.messages, msg], updatedAt: Date.now() }
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

      setActiveTab:      (activeTab)         => set({ activeTab }),
      setMode:           (mode)              => set({ mode }),
      setCwd:            (cwd)               => set({ cwd }),
      toggleSidebar:     ()                  => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setCommandPalette: (open)              => set({ commandPaletteOpen: open }),
      setStreaming:      (streaming, stop)   => set({ streaming, stopStream: stop ?? null }),
      setConnections:    (c)                 => set((s) => ({ connections: { ...s.connections, ...c } })),
      setSelectedModel:  (model)             => set({ selectedModel: model }),

      activeSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },
    }),
    {
      name: "memex-desktop",
      version: 1,
      // mode is intentionally NOT persisted — it's a per-session intent, and a
      // sticky "swarm" silently turned greetings into build orchestration.
      // Each launch starts in the default "chat" mode.
      partialize: (s) => ({
        sessions: s.sessions.slice(0, 50),
        activeSessionId: s.activeSessionId,
        activeTab: s.activeTab,
        cwd: s.cwd,
        sidebarOpen: s.sidebarOpen,
        selectedModel: s.selectedModel,
      }),
      // Drop any previously-persisted mode so existing installs reset to chat.
      migrate: (persisted: any) => {
        if (persisted && "mode" in persisted) delete persisted.mode;
        return persisted;
      },
    }
  )
);
