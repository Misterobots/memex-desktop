import { createContext, useContext, useState } from "react";
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
  const { sidebarOpen } = useStore();
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null);

  const ctx: InspectorCtx = {
    open: (runId) => setInspectorRunId(runId),
    activeRunId: inspectorRunId,
  };

  return (
    <InspectorContext.Provider value={ctx}>
      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <aside className="w-[260px] flex-shrink-0 border-r border-border/60 bg-surface overflow-y-auto">
            <SessionList />
          </aside>
        )}
        <main className="flex flex-col flex-1 min-w-0">
          <ConversationPane />
          <InputBar placeholder="Message Memex…" />
        </main>
        {inspectorRunId && (
          <RunInspectorPanel
            runId={inspectorRunId}
            onClose={() => setInspectorRunId(null)}
          />
        )}
      </div>
    </InspectorContext.Provider>
  );
}
