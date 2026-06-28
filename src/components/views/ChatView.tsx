import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "../../lib/store";
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
  const { sidebarOpen, toggleSidebar } = useStore();
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
        )}

        <main className="flex flex-col flex-1 min-w-0">
          <ConversationPane />
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
