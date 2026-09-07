import { createContext, useContext, useState } from "react";
import { ConversationPane } from "../chat/ConversationPane";
import { CHAT_MODES, InputBar } from "../layout/InputBar";
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
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null);

  const ctx: InspectorCtx = {
    open: (runId) => setInspectorRunId(runId),
    activeRunId: inspectorRunId,
  };

  return (
    <InspectorContext.Provider value={ctx}>
      <div className="relative flex flex-1 min-h-0">
        <main className="flex flex-col flex-1 min-w-0">
          <ConversationPane />
          <InputBar placeholder="Message Memex…" modeOptions={CHAT_MODES} defaultMode="chat" />
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
