import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import type { ChatDisplayMode } from "../../types/memex";
import { SessionList } from "../sidebar/SessionList";
import { ConversationPane } from "../chat/ConversationPane";
import { InputBar } from "../layout/InputBar";
import { RunInspectorPanel } from "../chat/RunInspectorPanel";

// ---------------------------------------------------------------------------
// Context: lets MessageBubble open the inspector without prop drilling
// ---------------------------------------------------------------------------
interface InspectorCtx {
  open: (runId: string) => void;
  activeRunId: string | null;
}
const InspectorContext = createContext<InspectorCtx | null>(null);

export function useInspector(): InspectorCtx | null {
  return useContext(InspectorContext);
}

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------
export function ChatView() {
  const { sidebarOpen, toggleSidebar, activeSession, setSessionDisplayMode } = useStore();
  const session = activeSession("chat");
  const displayMode: ChatDisplayMode = session?.displayMode ?? "normal";
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null);

  // On phones the sidebar is a slide-over, so start it closed (once on mount).
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768 && useStore.getState().sidebarOpen) {
      toggleSidebar();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: InspectorCtx = {
    open: (runId) => setInspectorRunId(runId),
    activeRunId: inspectorRunId,
  };

  return (
    <InspectorContext.Provider value={ctx}>
      <div className="relative flex flex-1 min-h-0">
        {/* Sidebar: inline column on md+, slide-over drawer on mobile */}
        {sidebarOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 z-30 bg-black/50"
              onClick={toggleSidebar}
              aria-hidden
            />
            <aside className="fixed inset-y-0 left-0 z-40 w-[82vw] max-w-[300px] md:static md:inset-auto md:z-auto md:w-[260px]
                              flex-shrink-0 border-r border-border/60 bg-surface overflow-y-auto">
              <SessionList />
            </aside>
          </>
        )}        <main className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-end px-4 py-2 border-b border-border/50">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-surface p-0.5" role="group" aria-label="Chat display mode">
              {(["normal", "summary", "thought"] as ChatDisplayMode[]).map((option) => (
                <button key={option} disabled={!session} onClick={() => session && setSessionDisplayMode(session.id, option)} className={`px-2.5 py-1 rounded-md text-[11px] capitalize transition-colors ${displayMode === option ? "bg-surface2 text-text" : "text-muted hover:text-text"}`}>{option}</button>
              ))}
            </div>
          </div>
          <ConversationPane displayMode={displayMode} />
          <InputBar placeholder="Message Memex…" />
        </main>

        {/* Inspector: full-screen overlay on mobile, side column on md+ */}
        {inspectorRunId && (
          <div className="fixed inset-0 z-40 bg-canvas md:static md:inset-auto md:z-auto md:bg-transparent">
            <RunInspectorPanel
              runId={inspectorRunId}
              onClose={() => setInspectorRunId(null)}
            />
          </div>
        )}
      </div>
    </InspectorContext.Provider>
  );
}
