import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage, Session, ConnectionStatus, MemexMode, MessageEvent, AppTab,
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
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  appendEvent: (sessionId: string, msgId: string, event: MessageEvent) => void;
  updateMessageContent: (sessionId: string, msgId: string, content: string) => void;
  updateMessageRunId: (sessionId: string, msgId: string, runId: string) => void;

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
        const session: Session = {
          id,
          title: "New conversation",
          createdAt: Date.now(),
          messages: [],
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      addMessage: (sessionId, msg) =>
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, messages: [...sess.messages, msg] }
              : sess
          ),
        })),

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
      partialize: (s) => ({
        sessions: s.sessions.slice(0, 50),
        activeSessionId: s.activeSessionId,
        activeTab: s.activeTab,
        mode: s.mode,
        cwd: s.cwd,
        sidebarOpen: s.sidebarOpen,
        selectedModel: s.selectedModel,
      }),
    }
  )
);
